import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import { createServer } from "http";
import { Server } from "socket.io";
import { Queue, Worker } from "bullmq";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import ws from "ws"; 

dotenv.config();

// ===== REDIS =====
const redisOpts = {
  tls: { rejectUnauthorized: false },
  lazyConnect: true,
  connectTimeout: 10000,
  retryStrategy: (times) => Math.min(times * 500, 5000)
};

const redisConnection = new Redis(process.env.REDIS_URL, {
  ...redisOpts,
  maxRetriesPerRequest: null
});

const pubClient = new Redis(process.env.REDIS_URL, redisOpts);
const subClient = new Redis(process.env.REDIS_URL, redisOpts);

// ===== FILA DE IMPRESSÃO =====
const printQueue = new Queue("impressao", { connection: redisConnection });

// ===== CACHE IMPRESSORA =====
const _impressoraCache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function getIntegracaoComCache(restaurant_id, tipo) {
  const key = `${restaurant_id}_${tipo}`;
  const agora = Date.now();
  if (_impressoraCache[key] && agora - _impressoraCache[key].ts < CACHE_TTL) {
    return _impressoraCache[key].dados;
  }
  const dados = await getIntegracao(restaurant_id, tipo);
  _impressoraCache[key] = { dados, ts: agora };
  return dados;
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);
const ordersEmImpressao = new Set();

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

async function setupRedisAdapter() {
  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient, {
  heartbeatInterval: 30000,
  heartbeatTimeout: 60000
}));
    console.log("✅ Socket.io Redis adapter conectado!");
  } catch (err) {
    console.error("❌ Redis adapter falhou:", err.message);
  }
}
setupRedisAdapter();

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias!");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

(async () => {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Conexão com Supabase OK!");
  } catch (err) {
    console.error("❌ Erro Supabase:", err.message);
  }
})();

// ===== WEBSOCKET =====
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.on("join_restaurant", (restaurant_id) => {
    socket.join(restaurant_id);
    console.log(`🏠 Socket ${socket.id} entrou na sala: ${restaurant_id}`);
  });

  socket.on("disconnect", () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

// Função global para emitir atualização de pedido
function emitOrderUpdate(restaurant_id, order) {
  io.to(restaurant_id).emit("order_updated", order);
}

const ALLOWED_ORIGINS_FIXED = [
  'https://fluxon.evoriseai.com.br',
  'https://n8n-front.dahead.easypanel.host',
];

let _dominiosCache = null;
let _dominiosCacheTime = 0;

async function getDominiosPermitidos() {
  const agora = Date.now();
  if (_dominiosCache && agora - _dominiosCacheTime < 5 * 60 * 1000) {
    return _dominiosCache;
  }
  try {
    const { data } = await supabase
      .from("restaurants")
      .select("cardapio_url, fidelidade_url, tracking_url, cardapio_delivery_url");
    
    const dominios = new Set(ALLOWED_ORIGINS_FIXED);
    (data || []).forEach(r => {
      if (r.cardapio_url) dominios.add(`https://${r.cardapio_url.replace(/^https?:\/\//, '')}`);
      if (r.fidelidade_url) dominios.add(`https://${r.fidelidade_url.replace(/^https?:\/\//, '')}`);
      if (r.tracking_url) dominios.add(`https://${r.tracking_url.replace(/^https?:\/\//, '')}`);
      if (r.cardapio_delivery_url) dominios.add(`https://${r.cardapio_delivery_url.replace(/^https?:\/\//, '')}`);
    });
    
    _dominiosCache = [...dominios];
    _dominiosCacheTime = agora;
    return _dominiosCache;
  } catch(e) {
    console.error("Erro ao buscar domínios:", e);
    return ALLOWED_ORIGINS_FIXED;
  }
}

app.use(cors({
  origin: async (origin, callback) => {
    if (!origin) return callback(null, true);
    const permitidos = await getDominiosPermitidos();
    if (permitidos.includes(origin)) return callback(null, true);
    console.warn(`🚫 CORS bloqueado: ${origin}`);
    return callback(new Error(`CORS: origem não permitida: ${origin}`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

app.use(express.json({ limit: '10mb' }));
// ===== RATE LIMITING =====
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 200, // máximo 200 requisições por minuto por IP
  message: { error: "Muitas requisições. Tente novamente em 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

const limiterStrict = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // máximo 10 tentativas por minuto
  message: { error: "Muitas tentativas. Tente novamente em 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);
app.use("/auth/", limiterStrict);
app.use("/orders/", limiter);

const ALLOWED_STATUS = ["draft", "pending", "preparing", "mounting", "delivering", "finished", "cancelled", "canceled"];

const sendError = (res, status, message) => {
  console.error(`[${status}] ${message}`);
  return res.status(status).json({ error: message });
};

async function restaurantExists(restaurant_id) {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").eq("id", restaurant_id).limit(1);
    if (error) return false;
    return data && data.length > 0;
  } catch (err) {
    return false;
  }
}

async function getIntegracao(restaurant_id, tipo) {
  try {
    const { data, error } = await supabase
      .from("integracoes")
      .select("dados")
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo)
      .single();
    if (error || !data) return null;
    return data.dados;
  } catch (err) {
    return null;
  }
}

async function getRestaurantPlan(restaurant_id) {
  try {
    const { data, error } = await supabase.from("restaurants").select("plan").eq("id", restaurant_id).single();
   if (error) return "essential";
return (data?.plan || "essential").toLowerCase();
  } catch (err) {
    return "essencial";
  }
}

const PLAN_HIERARCHY = ["essential", "advanced", "executive", "custom"];

function planLevel(plan) {
  const idx = PLAN_HIERARCHY.indexOf((plan || "essential").toLowerCase());
  return idx === -1 ? 0 : idx;
}

function canUseTracking(plan)        { return planLevel(plan) >= planLevel("advanced");  }
function canUseCRM(plan)             { return planLevel(plan) >= planLevel("advanced");  }
function canUsePDV(plan)             { return planLevel(plan) >= planLevel("advanced");  }
function canUseEstoque(plan)         { return planLevel(plan) >= planLevel("advanced");  }
function canUseCarrinho(plan)        { return planLevel(plan) >= planLevel("advanced");  }
function canUseResults(plan)         { return planLevel(plan) >= planLevel("executive"); }
function canUseAutoatendimento(plan) { return planLevel(plan) >= planLevel("executive"); }
function canUseFidelizacao(plan)     { return planLevel(plan) >= planLevel("executive"); }
function canUseMetas(plan)           { return planLevel(plan) >= planLevel("executive"); }
function canUseMultiUnidades(plan)   { return planLevel(plan) >= planLevel("custom");    }

function planError(res, current_plan, required) {
  return res.status(403).json({
    error: `Recurso disponível apenas no plano ${required} ou superior`,
    current_plan,
    upgrade_to: required
  });
}

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits || null;
}


/* ========================================
   🔥 ROTA DE MÉTRICAS COMPLETA
======================================== */

app.get("/api/v1/metrics/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    
    console.log(`📊 Buscando métricas para: ${restaurant_id}, período: ${period}`);
    
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    
    const plan = await getRestaurantPlan(restaurant_id);
    console.log(`📋 Plano: ${plan}`);
    
    if (!canUseResults(plan)) {
      return res.status(403).json({
        error: "Recurso disponível apenas nos planos Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "advanced"
      });
    }
    
    // Calcula datas
    let days = 30;
    if (period === "3d") days = 3;
    else if (period === "7d") days = 7;
    else if (period === "15d") days = 15;
    else if (period === "30d") days = 30;
    else if (period === "90d") days = 90;
    else if (period.endsWith("d")) days = parseInt(period) || 30;
    
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - days);
    
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);
    const previousEnd = new Date(currentStart);
    
    console.log(`📅 Período atual: ${currentStart.toISOString()}`);
    console.log(`📅 Período anterior: ${previousStart.toISOString()} até ${previousEnd.toISOString()}`);

    // Busca pedidos do período ATUAL
    let currentOrders = [];
    const { data: fetchedOrders, error: currentError } = await supabase
      .from("orders")
      .select("id, client_phone, origin, status, service_type, created_at, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", currentStart.toISOString());
    
    if (currentError) {
      console.error("❌ Erro ao buscar pedidos:", currentError);
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    currentOrders = fetchedOrders || [];

    // Busca pedidos do período ANTERIOR
    const { data: previousOrders, error: previousError } = await supabase
      .from("orders")
      .select("id, total_price, created_at")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", previousEnd.toISOString());

    console.log(`✅ Pedidos atuais: ${currentOrders?.length || 0}`);
    console.log(`✅ Pedidos anteriores: ${previousOrders?.length || 0}`);

    // Inicializa métricas
    const metrics = {
      period,
      total_orders: currentOrders?.length || 0,
      total_revenue: 0,
      average_ticket: 0,
      unique_clients: 0,
orders_by_origin: {
  ia_whatsapp: 0,
  pdv: 0,
  balcao: 0,
  autoatendimento: 0,
  outros: 0
},
  
      orders_by_status: {
        pending: 0,
        preparing: 0,
        mounting: 0,
        delivering: 0,
        finished: 0,
        canceled: 0
      },
      orders_by_service_type: {
        delivery: 0,
        local: 0
      },
      ia_performance: {
        orders: 0,
        revenue: 0,
        percentage: 0
      },
      client_base: {
        new_clients: 0,
        recurring_clients: 0,
        new_percentage: 0,
        recurring_percentage: 0
      },
      comparison: {
        orders: { current: 0, previous: 0, growth: 0 },
        revenue: { current: 0, previous: 0, growth: 0 },
        ticket: { current: 0, previous: 0, growth: 0 }
      }
    };

    // Processa pedidos ATUAIS
    const uniquePhones = new Set();
    const clientFirstOrders = {}; // telefone -> primeira data de pedido EVER
    
    (currentOrders || []).forEach(order => {
      // Faturamento
      const price = parseFloat(order.total_price) || 0;
      metrics.total_revenue += price;
      
      // Clientes únicos
      if (order.client_phone) {
        const phone = normalizePhone(order.client_phone);
        if (phone) uniquePhones.add(phone);
      }

      // Origem
      const origin = (order.origin || "outros").toLowerCase();
      if (metrics.orders_by_origin[origin] !== undefined) {
        metrics.orders_by_origin[origin]++;
        
        // Performance IA
        if (origin === "ia_whatsapp") {
          metrics.ia_performance.orders++;
          metrics.ia_performance.revenue += price;
        }
      } else {
        metrics.orders_by_origin.outros++;
      }

      // Status
      const status = (order.status || "pending").toLowerCase();
      const mappedStatus = status === "cancelled" ? "canceled" : status;
      if (metrics.orders_by_status[mappedStatus] !== undefined) {
        metrics.orders_by_status[mappedStatus]++;
      }

      // Tipo de serviço
      const serviceType = (order.service_type || "local").toLowerCase();
      if (metrics.orders_by_service_type[serviceType] !== undefined) {
        metrics.orders_by_service_type[serviceType]++;
      }
    });

    metrics.unique_clients = uniquePhones.size;
    metrics.average_ticket = metrics.total_orders > 0 ? metrics.total_revenue / metrics.total_orders : 0;

    // Performance IA %
    metrics.ia_performance.percentage = metrics.total_orders > 0 
      ? (metrics.ia_performance.orders / metrics.total_orders) * 100 
      : 0;

    // Base de clientes (novos vs recorrentes)
    // Busca TODOS os pedidos do restaurante para identificar histórico
    const { data: allOrders } = await supabase
      .from("orders")
      .select("client_phone, created_at")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    // Conta pedidos por cliente no período ATUAL
    const ordersInPeriod = {};
    (currentOrders || []).forEach(order => {
      const phone = normalizePhone(order.client_phone);
      if (phone) {
        ordersInPeriod[phone] = (ordersInPeriod[phone] || 0) + 1;
      }
    });

    // Verifica se cliente tinha pedidos ANTES do período
   const ninetyDaysBeforeStart = new Date(currentStart);
ninetyDaysBeforeStart.setDate(ninetyDaysBeforeStart.getDate() - 90);

const hadOrdersBefore = {};
(allOrders || []).forEach(order => {
  const phone = normalizePhone(order.client_phone);
  const orderDate = new Date(order.created_at);
  if (phone && orderDate < currentStart && orderDate >= ninetyDaysBeforeStart) {
    hadOrdersBefore[phone] = true;
  }
});

// Faturamento recorrente — soma pedidos do período de clientes que já compraram antes
let recurringRevenue = 0;
(currentOrders || []).forEach(order => {
  const phone = normalizePhone(order.client_phone);
  if (phone && (hadOrdersBefore[phone] || (ordersInPeriod[phone] || 0) >= 2)) {
    recurringRevenue += parseFloat(order.total_price) || 0;
  }
});
metrics.recurring_revenue = recurringRevenue;
    
    // Classifica clientes
    uniquePhones.forEach(phone => {
      const ordersCount = ordersInPeriod[phone] || 0;
      const hadPreviousOrders = hadOrdersBefore[phone] || false;
      
      // RECORRENTE se:
      // 1. Fez 2+ pedidos no período OU
      // 2. Já tinha pedidos antes do período
      if (ordersCount >= 2 || hadPreviousOrders) {
        metrics.client_base.recurring_clients++;
      } else {
        // NOVO: fez apenas 1 pedido e é o primeiro dele
        metrics.client_base.new_clients++;
      }
    });

    const totalClients = metrics.unique_clients;
    metrics.client_base.new_percentage = totalClients > 0 ? (metrics.client_base.new_clients / totalClients) * 100 : 0;
    metrics.client_base.recurring_percentage = totalClients > 0 ? (metrics.client_base.recurring_clients / totalClients) * 100 : 0;

    // Comparação com período anterior
    let previousRevenue = 0;
    (previousOrders || []).forEach(order => {
      previousRevenue += parseFloat(order.total_price) || 0;
    });

    const previousOrdersCount = previousOrders?.length || 0;
    const previousTicket = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;

    metrics.comparison.orders.current = metrics.total_orders;
    metrics.comparison.orders.previous = previousOrdersCount;
    metrics.comparison.orders.growth = previousOrdersCount > 0 
      ? ((metrics.total_orders - previousOrdersCount) / previousOrdersCount) * 100 
      : 0;

    metrics.comparison.revenue.current = metrics.total_revenue;
    metrics.comparison.revenue.previous = previousRevenue;
    metrics.comparison.revenue.growth = previousRevenue > 0 
      ? ((metrics.total_revenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    metrics.comparison.ticket.current = metrics.average_ticket;
    metrics.comparison.ticket.previous = previousTicket;
    metrics.comparison.ticket.growth = previousTicket > 0 
      ? ((metrics.average_ticket - previousTicket) / previousTicket) * 100 
      : 0;

// ==========================================
    // 🔁 TAXA DE RETORNO
    // ==========================================
    // Clientes que compraram no período anterior E no atual
    const returningClients = [...uniquePhones].filter(phone => hadOrdersBefore[phone]).length;
    metrics.taxa_retorno = uniquePhones.size > 0
      ? (returningClients / uniquePhones.size) * 100
      : 0;
    metrics.taxa_retorno_count = returningClients;

    // Comparação taxa de retorno com período anterior
    const { data: prevPeriodOrders } = await supabase
      .from("orders")
      .select("client_phone")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", previousEnd.toISOString());

    const prevPeriodPhones = new Set((prevPeriodOrders || []).map(o => normalizePhone(o.client_phone)).filter(Boolean));
    const prevBeforeStart = new Date(previousStart);
    prevBeforeStart.setDate(prevBeforeStart.getDate() - days);

    const { data: prevBeforeOrders } = await supabase
      .from("orders")
      .select("client_phone")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", prevBeforeStart.toISOString())
      .lt("created_at", previousStart.toISOString());

    const prevHadBefore = new Set((prevBeforeOrders || []).map(o => normalizePhone(o.client_phone)).filter(Boolean));
    const prevReturning = [...prevPeriodPhones].filter(p => prevHadBefore.has(p)).length;
    const prevTaxaRetorno = prevPeriodPhones.size > 0 ? (prevReturning / prevPeriodPhones.size) * 100 : 0;

    metrics.comparison.taxa_retorno = {
      current: metrics.taxa_retorno,
      previous: prevTaxaRetorno,
      growth: prevTaxaRetorno > 0 ? ((metrics.taxa_retorno - prevTaxaRetorno) / prevTaxaRetorno) * 100 : 0
    };

    // ==========================================
    // 🔄 FREQUÊNCIA MÉDIA
    // ==========================================
    // Média de pedidos por cliente único no período
    const totalOrdersForFreq = currentOrders.length;
    metrics.frequencia_media = uniquePhones.size > 0
      ? totalOrdersForFreq / uniquePhones.size
      : 0;

    // Comparação frequência
    const prevFrequencia = prevPeriodPhones.size > 0
      ? (prevPeriodOrders?.length || 0) / prevPeriodPhones.size
      : 0;
    metrics.comparison.frequencia = {
      current: metrics.frequencia_media,
      previous: prevFrequencia,
      growth: prevFrequencia > 0 ? ((metrics.frequencia_media - prevFrequencia) / prevFrequencia) * 100 : 0
    };

    // ==========================================
    // 💤 CLIENTES INATIVOS
    // ==========================================
    // Clientes que NÃO compraram nos últimos X dias mas compraram antes
    const date7  = new Date(); date7.setDate(date7.getDate() - 7);
    const date15 = new Date(); date15.setDate(date15.getDate() - 15);
    const date30 = new Date(); date30.setDate(date30.getDate() - 30);

    // Mapa: telefone -> última compra
    const lastOrderByPhone = {};
    (allOrders || []).forEach(order => {
      const phone = normalizePhone(order.client_phone);
      if (!phone) return;
      const d = new Date(order.created_at);
      if (!lastOrderByPhone[phone] || d > lastOrderByPhone[phone]) {
        lastOrderByPhone[phone] = d;
      }
    });

    let inativos7 = 0, inativos15 = 0, inativos30 = 0;
    Object.values(lastOrderByPhone).forEach(lastDate => {
      if (lastDate < date7)  inativos7++;
      if (lastDate < date15) inativos15++;
      if (lastDate < date30) inativos30++;
    });

    metrics.clientes_inativos = {
      dias_7: inativos7,
      dias_15: inativos15,
      dias_30: inativos30,
      total_na_base: Object.keys(lastOrderByPhone).length
    };

    // ==========================================
    // 🎁 PRÓXIMOS DA RECOMPENSA
    // ==========================================
    // Busca menor prêmio disponível e conta clientes a menos de 20% dos pontos
    const { data: premios } = await supabase
      .from("premios_fidelidade")
      .select("pontos_necessarios")
      .eq("restaurant_id", restaurant_id)
      .eq("ativo", true)
      .order("pontos_necessarios")
      .limit(1);

    if (premios && premios.length > 0) {
      const menorPremio = premios[0].pontos_necessarios;
      const limiar = menorPremio * 0.8; // 80% do caminho

      const { data: clientesPerto } = await supabase
        .from("base_clientes")
        .select("pontos")
        .eq("restaurant_id", restaurant_id)
        .eq("Status", "ATIVO")
        .gte("pontos", limiar)
        .lt("pontos", menorPremio);

      metrics.proximos_recompensa = {
        count: clientesPerto?.length || 0,
        pontos_premio: menorPremio,
        limiar_80pct: Math.round(limiar)
      };
    } else {
      metrics.proximos_recompensa = { count: 0, pontos_premio: null, limiar_80pct: null };
    }
    
    console.log(`✅ Métricas calculadas com sucesso!`);

    return res.json(metrics);
  } catch (err) {
    console.error("❌ Erro em /api/v1/metrics:", err);
    return sendError(res, 500, "Erro interno ao processar métricas");
  }
});

/* ========================================
   🔥 ROTA CRM
======================================== */

app.get("/crm/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    console.log(`👥 Buscando CRM para: ${restaurant_id}`);
    
    if (!restaurant_id) return sendError(res, 400, "restaurant_id é obrigatório");

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!canUseCRM(plan)) {
      return res.status(403).json({
        error: "CRM disponível apenas nos planos PRO, Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "pro"
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, client_name, client_phone, status, itens, total_price, created_at, update_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type, address, payment_method, notes")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos para CRM:", error);
      return sendError(res, 500, "Erro ao buscar dados do CRM");
    }

    const clients = Object.create(null);
    
    for (const o of data || []) {
      const phoneKey = normalizePhone(o.client_phone);
      const key = phoneKey || `anon-${o.id}`;

      if (!clients[key]) {
        clients[key] = {
          client_name: (o.client_name || "").trim() || "(Sem nome)",
          client_phone: phoneKey || "—",
          orders: 0,
          total_spent: 0,
          last_order_at: null
        };
      }

      clients[key].orders += 1;
      clients[key].total_spent += parseFloat(o.total_price) || 0;
      
      const currTime = o.created_at ? new Date(o.created_at).getTime() : 0;
      const prevTime = clients[key].last_order_at ? new Date(clients[key].last_order_at).getTime() : 0;

      if (currTime >= prevTime) {
        clients[key].last_order_at = o.created_at || clients[key].last_order_at;
      }

      const name = String(o.client_name || "").trim();
      if (name && currTime >= prevTime) {
        clients[key].client_name = name;
      }
    }

    const result = Object.values(clients).sort((a, b) => {
      const ta = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
      const tb = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
      return tb - ta;
    });

    console.log(`✅ Clientes únicos: ${result.length}`);
    return res.json(result);
  } catch (err) {
    console.error("❌ Erro em /crm:", err);
    return sendError(res, 500, "Erro interno ao buscar CRM");
  }
});

/* ========================================
   ROTAS ORIGINAIS
======================================== */

app.get("/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 12);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .or(`status.in.(pending,preparing,mounting,delivering),created_at.gte.${cutoff.toISOString()}`)
      .order("created_at", { ascending: true });

    if (error) return sendError(res, 500, "Erro ao listar pedidos");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

// ✅ NOVA ROTA — Busca pedido aberto de uma mesa
app.get("/api/v1/pedidos-mesa", async (req, res) => {
  try {
    const { restaurant_id, mesa } = req.query;
    if (!restaurant_id || !mesa) return sendError(res, 400, "restaurant_id e mesa são obrigatórios");

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("table_number", mesa)
      .in("status", ["pending", "preparing", "mounting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return res.json({ pedido: null });
    return res.json({ pedido: data });
  } catch (err) {
    return res.json({ pedido: null });
  }
});

// ✅ NOVA ROTA — Adiciona itens novos ao pedido existente e imprime só os novos
app.patch("/api/v1/pedidos/:id/adicionar-itens", async (req, res) => {
  try {
    const { id } = req.params;
    const { itens_novos, total_adicional, client_name, client_phone, notes } = req.body;

    if (!Array.isArray(itens_novos) || itens_novos.length === 0)
      return sendError(res, 400, "itens_novos é obrigatório");

    // Busca pedido atual
    const { data: pedidoAtual, error: fetchError } = await supabase
      .from("orders").select("*").eq("id", id).single();
    if (fetchError || !pedidoAtual) return sendError(res, 404, "Pedido não encontrado");

    // Monta itens combinados
    const itensAntigos = Array.isArray(pedidoAtual.itens) ? pedidoAtual.itens : [];
    const itensCombinados = [...itensAntigos, ...itens_novos];
    const novoTotal = parseFloat(pedidoAtual.total_price || 0) + parseFloat(total_adicional || 0);

    // Atualiza o pedido
    const updatePayload = {
      itens: itensCombinados,
      total_price: novoTotal,
      update_at: new Date().toISOString()
    };
    if (client_name && !pedidoAtual.client_name) updatePayload.client_name = client_name;
    if (client_phone && !pedidoAtual.client_phone) updatePayload.client_phone = client_phone;
    if (notes) {
  updatePayload.notes = notes;
}

    const { data: pedidoAtualizado, error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !pedidoAtualizado) return sendError(res, 500, "Erro ao atualizar pedido");

    emitOrderUpdate(pedidoAtualizado.restaurant_id, pedidoAtualizado);
    console.log(`➕ Itens adicionados ao pedido #${pedidoAtualizado.order_number} — ${itens_novos.length} novo(s)`);

    // ✅ Imprime SÓ os itens novos
    try {
     const config = await getIntegracaoComCache(pedidoAtualizado.restaurant_id, "printnode");
      if (config?.api_key && Array.isArray(config?.impressoras) && config.impressoras.length > 0) {
        const impressorasSemCaixa = config.impressoras.filter(
          i => !toBool(i.is_caixa) && !toBool(i.caixa) && i.printer_id
        );
        if (impressorasSemCaixa.length > 0) {
          // Monta objeto do pedido com APENAS os itens novos para impressão
          const pedidoParaImprimir = { ...pedidoAtualizado, itens: itens_novos };
          await printQueue.add("imprimir", {
  order: { ...pedidoParaImprimir },
  apiKey: config.api_key,
  impressoras: impressorasSemCaixa
}, {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 }
});
console.log(`🖨️ Job de impressão adicionado — Pedido #${pedidoAtualizado.order_number}`);
        }
      }
    } catch (printErr) {
      console.error("⚠️ Erro na impressão ao adicionar itens:", printErr.message);
    }

    return res.json({ success: true, order: pedidoAtualizado });
  } catch (err) {
    return sendError(res, 500, "Erro interno ao adicionar itens");
  }
});

app.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    
   if (!ALLOWED_STATUS.includes(status)) return sendError(res, 400, "status inválido");

// ✅ Busca ANTES do update para saber o estado original
const { data: orderAntes } = await supabase
  .from("orders").select("preparing_at, restaurant_id").eq("id", id).single();
    
    const now = new Date().toISOString();
    
    const updateData = {
      status,
      update_at: now
    };
    
      if (status === "pending") {
      updateData.confirmed_at = now;
    } else if (status === "preparing") {
      updateData.preparing_at = now;
    } else if (status === "mounting") {
      updateData.mounting_at = now;
    } else if (status === "delivering") {
      updateData.delivering_at = now;
    } else if (status === "finished") {
      updateData.delivered_at = now;
    } else if (status === "cancelled" || status === "canceled") {
      updateData.cancelled_at = now;
    }
    
    const { data, error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    
    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    emitOrderUpdate(data.restaurant_id, data);
    
// ✅ COLOCA ISSO NO LUGAR:
if (status === "preparing") {
  if (ordersEmImpressao.has(id)) {
    console.log(`⚠️ Pedido ${id} já está sendo impresso, ignorando`);
  } else {
    ordersEmImpressao.add(id);
    try {
      const isPrimeiraVez = orderAntes && !orderAntes.preparing_at;
    console.log(`🔍 Pedido #${data.order_number} — primeira vez em preparo: ${isPrimeiraVez}`);

    if (isPrimeiraVez) {
      const config = await getIntegracaoComCache(data.restaurant_id, "printnode");
      console.log(`🔍 Config printnode:`, config ? `ok, ${config.impressoras?.length} impressoras` : "NULL");

      if (config?.api_key && Array.isArray(config?.impressoras) && config.impressoras.length > 0) {
        const impressorasSemCaixa = config.impressoras.filter(
          i => !toBool(i.is_caixa) && !toBool(i.caixa) && i.printer_id
        );
        console.log(`🔍 Impressoras sem caixa:`, JSON.stringify(impressorasSemCaixa));

        if (impressorasSemCaixa.length > 0) {
         await printQueue.add("imprimir", {
  order: { ...orderAntes, ...data },
  apiKey: config.api_key,
  impressoras: impressorasSemCaixa
}, {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 }
});
console.log(`🖨️ Job de impressão adicionado — Pedido #${data.order_number}`);
        }
      }
    }
  } catch (printErr) {
      console.error("⚠️ Erro na impressão ao preparar:", printErr.message);
    } finally {
      ordersEmImpressao.delete(id);
    }
  }
}


    if (status === "finished" || status === "delivered") {
      try {
        const { data: orderCompleto } = await supabase
          .from("orders").select("*").eq("id", id).single();

        if (orderCompleto) {
          const isDelivery = String(orderCompleto.service_type || "").toLowerCase() === "delivery";

        }
      } catch (printErr) {
        console.error("⚠️ Erro na impressão ao finalizar:", printErr.message);
      }

      await supabase.from("webhook_queue").insert([{
  restaurant_id: data.restaurant_id,
  order_id: id,
  tipo: "satisfacao",
  dispara_em: new Date(Date.now() + 30 * 60 * 1000).toISOString()
}]);
console.log(`✅ Webhook satisfação agendado na fila — Pedido ${id}`);
    // Atualiza caixa aberto
if (status === "finished") {
  try {
    const { data: caixaAberto } = await supabase
      .from("caixa")
      .select("id")
      .eq("restaurant_id", data.restaurant_id)
      .eq("status", "aberto")
      .single();

    if (caixaAberto) {
      const paymentStr = String(data.payment_method || "").toLowerCase();
      const total = parseFloat(data.total_price || 0);

      const incrementos = {
        valor_pix: 0, qtd_pix: 0,
        valor_credito: 0, qtd_credito: 0,
        valor_debito: 0, qtd_debito: 0,
        valor_dinheiro: 0, qtd_dinheiro: 0,
        valor_maquininha: 0, qtd_maquininha: 0
      };

      if (paymentStr.includes("+")) {
        const partes = paymentStr.split("+").map(p => p.trim());
        partes.forEach(parte => {
          const valorMatch = parte.match(/r?\$?([\d.,]+)/i);
          const valor = valorMatch ? parseFloat(valorMatch[1].replace(",", ".")) : 0;
          if (parte.includes("pix"))                                        { incrementos.valor_pix        += valor; incrementos.qtd_pix        += 1; }
          if (parte.includes("credito") || parte.includes("crédito"))       { incrementos.valor_credito    += valor; incrementos.qtd_credito    += 1; }
          if (parte.includes("debito")  || parte.includes("débito"))        { incrementos.valor_debito     += valor; incrementos.qtd_debito     += 1; }
          if (parte.includes("dinheiro"))                                    { incrementos.valor_dinheiro   += valor; incrementos.qtd_dinheiro   += 1; }
          if (parte.includes("maquininha"))                                  { incrementos.valor_maquininha += valor; incrementos.qtd_maquininha += 1; }
        });
      } else {
        if (paymentStr.includes("pix"))                                      { incrementos.valor_pix        += total; incrementos.qtd_pix        += 1; }
        if (paymentStr.includes("credito") || paymentStr.includes("crédito")){ incrementos.valor_credito    += total; incrementos.qtd_credito    += 1; }
        if (paymentStr.includes("debito")  || paymentStr.includes("débito")) { incrementos.valor_debito     += total; incrementos.qtd_debito     += 1; }
        if (paymentStr.includes("dinheiro"))                                  { incrementos.valor_dinheiro   += total; incrementos.qtd_dinheiro   += 1; }
        if (paymentStr.includes("maquininha"))                                { incrementos.valor_maquininha += total; incrementos.qtd_maquininha += 1; }
      }

      const temIncremento = Object.values(incrementos).some(v => v > 0);
      if (temIncremento) {
       await supabase.rpc("incrementar_caixa", {
  p_caixa_id: caixaAberto.id,
  p_valor_pix: incrementos.valor_pix,
  p_qtd_pix: incrementos.qtd_pix,
  p_valor_credito: incrementos.valor_credito,
  p_qtd_credito: incrementos.qtd_credito,
  p_valor_debito: incrementos.valor_debito,
  p_qtd_debito: incrementos.qtd_debito,
  p_valor_dinheiro: incrementos.valor_dinheiro,
  p_qtd_dinheiro: incrementos.qtd_dinheiro,
  p_valor_maquininha: incrementos.valor_maquininha,
  p_qtd_maquininha: incrementos.qtd_maquininha,
  p_total_pedidos: 1
});
        console.log(`💰 Caixa atualizado atomicamente — Pedido #${data.order_number}`);
      }
    }
  } catch (caixaErr) {
    console.error("⚠️ Erro ao atualizar caixa:", caixaErr.message);
  }
}
    }

    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

app.post("/api/v1/pedidos", async (req, res) => {
  try {
    const {
      restaurant_id, client_name, client_phone, items, itens, notes,
      service_type, address, payment_method, total_price, origin,
      status, order_id, table_number
    } = req.body || {};

    const normalizedItems = Array.isArray(items) ? items : Array.isArray(itens) ? itens : [];
    const phone = normalizePhone(client_phone);
 const finalOrigin = origin || "outros";
    const finalStatus = status || "pending";

    if (!restaurant_id || !client_name) {
      return sendError(res, 400, "restaurant_id e client_name são obrigatórios");
    }

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    // 🔒 Restrição: autoatendimento só para Executive e Custom
    if (finalOrigin === "autoatendimento") {
      const plan = await getRestaurantPlan(restaurant_id);
      if (!["executive", "custom"].includes(plan.toLowerCase())) {
        return res.status(403).json({
          error: "Autoatendimento disponível apenas nos planos Executive e Custom",
          current_plan: plan,
          upgrade_to: "executive"
        });
      }
    }
    const now = new Date().toISOString();
    let resultData;

   if (order_id) {
  const updatePayload = {
  client_name,
  client_phone: phone,
  itens: normalizedItems,
  notes: notes || "",
  ...(table_number !== undefined ? { table_number: table_number || null } : {}),
  total_price: total_price || 0,
  service_type: service_type || "local",
  address: address || null,
  payment_method: payment_method || null,
  update_at: now
};

if (status) updatePayload.status = status;

const { data, error } = await supabase
  .from("orders")
  .update(updatePayload)
  .eq("id", order_id)
  .select()
  .single();

  if (error) {
    console.error("❌ Erro update pedido:", JSON.stringify(error));
    return sendError(res, 500, "Erro ao atualizar pedido: " + error.message);
  }
  resultData = data; // ← estava faltando!
} else {
 const { data: numData } = await supabase
  .rpc('get_next_order_number', { rid: restaurant_id });

const nextNumber = numData || 1;

  const { data, error } = await supabase
    .from("orders")
    .insert([{
      restaurant_id,
      client_name,
      client_phone: phone,
      order_number: nextNumber,
      itens: normalizedItems,
      notes: notes || "",
      status: finalStatus,
      service_type: service_type || "local",
      address: address || null,
      payment_method: payment_method || null,
      total_price: total_price || 0,
      origin: finalOrigin,
        table_number: table_number || null,
        created_at: now,
        update_at: now
    }])
    .select()
    .single();

  if (error) {
    console.error("❌ Erro ao criar pedido:", error);
    return sendError(res, 500, "Erro ao criar pedido: " + error.message);
  }
  resultData = data;
}

    // Gera código único: primeiros 8 caracteres do restaurant_id + order_number
const shortRestaurantId = restaurant_id.substring(0, 8);
const trackingCode = `${shortRestaurantId}_${resultData.order_number}`;

const { data: restData } = await supabase
  .from("restaurants")
  .select("tracking_url")
  .eq("id", restaurant_id)
  .single();

const baseUrl = restData?.tracking_url;

// Só gera o link se tiver tracking_url cadastrado
const trackingLink = baseUrl ? `${baseUrl}?code=${trackingCode}` : null;
    
// ⭐ FIDELIZAÇÃO
try {
  if (phone && !order_id && finalOrigin !== "fidelidade") {
    const pontosGanhos = Math.floor((parseFloat(total_price) || 0) * 15);

    if (pontosGanhos > 0) {
      const { data: perfil } = await supabase
        .from("base_clientes")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .eq("numero", phone)
        .single();

      if (perfil) {
        await supabase
          .from("base_clientes")
          .update({ pontos: (perfil.pontos || 0) + pontosGanhos })
          .eq("id", perfil.id);
      } else {
        const token = (Math.random().toString(36).substring(2, 8) +
                       Math.random().toString(36).substring(2, 8)).substring(0, 12);
        await supabase
          .from("base_clientes")
          .insert([{
            restaurant_id,
            nome: client_name || "",
            numero: phone,
            pontos: pontosGanhos,
            pontos_resgatados: 0,
            token_fidelidade: token,
            Status: "ATIVO"
          }]);
      }
      console.log(`⭐ ${phone} ganhou ${pontosGanhos}pts | Pedido #${resultData.order_number}`);
    }
  }
} catch (loyaltyErr) {
  console.error("⚠️ Erro na fidelização:", loyaltyErr.message);
}
// ⭐ FIM FIDELIZAÇÃO

emitOrderUpdate(restaurant_id, resultData); // dispara o socket
return res.status(201).json({ 
  success: true, 
  order: resultData,
  tracking_code: trackingCode,
  tracking_link: trackingLink
});

  } catch (err) {
    console.error("❌ Erro em /api/v1/pedidos:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

// PATCH - Modifica itens de um pedido existente
app.patch("/api/v1/pedidos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { items, itens, notes, total_price, address, payment_method } = req.body;

    const normalizedItems = Array.isArray(items) ? items : Array.isArray(itens) ? itens : undefined;

    const updateData = { update_at: new Date().toISOString() };
    if (normalizedItems) updateData.itens = normalizedItems;
    if (notes !== undefined) updateData.notes = notes;
    if (total_price !== undefined) updateData.total_price = total_price;
    if (address !== undefined) updateData.address = address;
    if (payment_method !== undefined) updateData.payment_method = payment_method;

    const { data, error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return sendError(res, 500, "Erro ao modificar pedido");
    emitOrderUpdate(data.restaurant_id, data);
    return res.json({ success: true, order: data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body; // recebe o token JWT do Google, não o email

    if (!credential) return res.status(400).json({ error: "Token ausente" });

    // Verifica o token com a API do Google — impossível de falsificar
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ authorized: false, error: "Token inválido" });
    }

    const email = payload.email;

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error || !data || data.length === 0)
      return res.status(403).json({ authorized: false });

    // Gera um JWT próprio para autenticar nas próximas requisições
    const token = jwt.sign(
      { restaurant_id: data[0].id, email, plan: data[0].plan },
      process.env.JWT_SECRET,
     { expiresIn: "1d" }
    );

    return res.json({ authorized: true, restaurant: data[0], token });
  } catch (err) {
    console.error("Erro auth:", err);
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

app.post("/auth/refresh", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ error: "Token ausente" });

    const token = authHeader.split(" ")[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    const { data, error } = await supabase
      .from("restaurants")
      .select("id, plan")
      .eq("id", payload.restaurant_id)
      .single();

    if (error || !data)
      return res.status(403).json({ error: "Restaurante não encontrado" });

    const newToken = jwt.sign(
      { restaurant_id: data.id, email: payload.email, plan: data.plan },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({ success: true, token: newToken });
  } catch (err) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

// GET - Busca pedido por ID
app.get("/api/v1/pedidos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return sendError(res, 404, "Pedido não encontrado");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

/* ========================================
   📈 ROTA DE TIMELINE (dados diários) - 🔥 CORRIGIDA
======================================== */

app.get("/api/v1/metrics/:restaurant_id/timeline", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    
    console.log(`📊 Buscando timeline para: ${restaurant_id}, período: ${period}`);
    
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    
    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!canUseResults(plan)) {
      return res.status(403).json({
        error: "Recurso disponível apenas nos planos Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "advanced"
      });
    }
    
    // ========================================
    // 🔥 NOVA LÓGICA DE DATAS DINÂMICAS
    // ========================================
    
    let days = 30;
    let pointsCount = 15; // Padrão
    let interval = 2; // Intervalo entre pontos
    
    if (period === "3d") {
      days = 3;
      pointsCount = 3;
      interval = 1;
    } else if (period === "7d") {
      days = 7;
      pointsCount = 7;
      interval = 1;
    } else if (period === "15d") {
      days = 15;
      pointsCount = 15;
      interval = 1;
    } else if (period === "30d") {
      days = 30;
      pointsCount = 15;
      interval = 2;
    } else if (period === "90d") {
      days = 90;
      pointsCount = 15;
      interval = 6;
    } else if (period === "all") {
      days = 3650; // ~10 anos
      pointsCount = 30;
      interval = Math.floor(days / pointsCount);
    } else if (period.endsWith("d")) {
      days = parseInt(period) || 30;
      pointsCount = Math.min(15, days);
      interval = Math.max(1, Math.floor(days / pointsCount));
    }
    
    // Data de hoje (zero horas)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Data inicial
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    
    console.log(`📅 Período: ${days} dias | Pontos: ${pointsCount} | Intervalo: ${interval} dias`);
    console.log(`📅 De ${startDate.toISOString()} até ${today.toISOString()}`);

    // Busca pedidos do período
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, created_at, total_price, status")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos:", error);
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    console.log(`✅ Pedidos encontrados: ${orders?.length || 0}`);

    // ========================================
    // 🔥 GERA OS PONTOS DO GRÁFICO
    // ========================================
    
    // Agrupa pedidos por dia (YYYY-MM-DD)
    const ordersByDay = {};
    
    (orders || []).forEach(order => {
      try {
        if (!order.created_at) return;
        
        const date = new Date(order.created_at);
        if (isNaN(date.getTime())) return;
        
        const dateKey = date.toISOString().split('T')[0];
        
        if (!ordersByDay[dateKey]) {
          ordersByDay[dateKey] = {
            revenue: 0,
            orders: 0
          };
        }
        
        const price = parseFloat(order.total_price);
        ordersByDay[dateKey].revenue += (isNaN(price) ? 0 : price);
        ordersByDay[dateKey].orders += 1;
      } catch (err) {
        console.warn(`⚠️ Pedido ignorado:`, order.id, err.message);
      }
    });
    
    // Busca preço do plano (para ROI)
    const { data: restaurantData } = await supabase
      .from("restaurants")
      .select("plan")
      .eq("id", restaurant_id)
      .single();

    const planPrices = { basic: 1200, pro: 2500, advanced: 4000, executive: 6000, custom: 10000 };
    const planPrice = planPrices[(restaurantData?.plan || "basic").toLowerCase()] || 1200;
    
    // Cria os pontos do gráfico
    const timeline = [];
    
    for (let i = 0; i < pointsCount; i++) {
      // Calcula a data deste ponto
      const pointDate = new Date(today);
      pointDate.setDate(pointDate.getDate() - ((pointsCount - 1 - i) * interval));
      pointDate.setHours(0, 0, 0, 0);
      
      const dateKey = pointDate.toISOString().split('T')[0];
      
      // Se o intervalo for > 1, precisa somar vários dias
      let totalRevenue = 0;
      let totalOrders = 0;
      
      if (interval === 1) {
        // Apenas 1 dia
        const dayData = ordersByDay[dateKey];
        if (dayData) {
          totalRevenue = dayData.revenue;
          totalOrders = dayData.orders;
        }
      } else {
        // Soma vários dias (agrupamento)
        for (let d = 0; d < interval; d++) {
          const checkDate = new Date(pointDate);
          checkDate.setDate(checkDate.getDate() + d);
          const checkKey = checkDate.toISOString().split('T')[0];
          
          const dayData = ordersByDay[checkKey];
          if (dayData) {
            totalRevenue += dayData.revenue;
            totalOrders += dayData.orders;
          }
        }
      }
      
      timeline.push({
        date: dateKey,
        revenue: totalRevenue,
        orders: totalOrders,
        ticket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        roi: totalRevenue / planPrice
      });
    }

    // ========================================
    // 📊 COMPARAÇÃO COM PERÍODO ANTERIOR
    // ========================================
    
    const previousStart = new Date(startDate);
    previousStart.setDate(previousStart.getDate() - days);
    
    const { data: previousOrders } = await supabase
      .from("orders")
      .select("id, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", startDate.toISOString());

    let previousRevenue = 0;
    (previousOrders || []).forEach(o => {
      previousRevenue += parseFloat(o.total_price) || 0;
    });

    const previousOrdersCount = previousOrders?.length || 0;
    const previousTicket = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;
    const previousROI = previousRevenue / planPrice;

    // Totais do período atual
    const currentRevenue = timeline.reduce((sum, day) => sum + day.revenue, 0);
    const currentOrdersCount = timeline.reduce((sum, day) => sum + day.orders, 0);
    const currentTicket = currentOrdersCount > 0 ? currentRevenue / currentOrdersCount : 0;
const currentROI = currentRevenue / planPrice;

    const comparison = {
      revenue_growth: previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0,
      orders_growth: previousOrdersCount > 0 ? ((currentOrdersCount - previousOrdersCount) / previousOrdersCount) * 100 : 0,
      ticket_growth: previousTicket > 0 ? ((currentTicket - previousTicket) / previousTicket) * 100 : 0,
      roi_growth: previousROI > 0 ? ((currentROI - previousROI) / previousROI) * 100 : 0
    };

    console.log(`✅ Timeline gerada: ${timeline.length} pontos`);
    console.log(`📊 Último ponto: ${timeline[timeline.length - 1]?.date} (deve ser hoje: ${today.toISOString().split('T')[0]})`);

    return res.json({
      period,
      days,
      points_count: pointsCount,
      interval,
      timeline,
      comparison,
      current_totals: {
        revenue: currentRevenue,
        orders: currentOrdersCount,
        ticket: currentTicket,
        roi: currentROI
      },
      previous_totals: {
        revenue: previousRevenue,
        orders: previousOrdersCount,
        ticket: previousTicket,
        roi: previousROI
      }
    });

  } catch (err) {
    console.error("❌ Erro em /api/v1/metrics/timeline:", err);
    return sendError(res, 500, `Erro interno ao processar timeline: ${err.message}`);
  }
});

/* ========================================
   🔗 ROTA DE RASTREAMENTO DE PEDIDO
======================================== */

app.get("/api/v1/tracking/:tracking_code", async (req, res) => {
  try {
    const { tracking_code } = req.params;
    
    console.log(`🔍 Rastreando pedido: ${tracking_code}`);
    
    let query = supabase
      .from("orders")
      .select("id, order_number, restaurant_id, client_name, client_phone, status, itens, total_price, created_at, update_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type, address, payment_method, notes")
      .limit(1);
    
   // Verifica se é formato: restaurantId_orderNumber
if (tracking_code.includes('_')) {
  const [shortId, orderNumber] = tracking_code.split('_');
  
  console.log(`📍 Buscando: Restaurant ${shortId}*, Pedido #${orderNumber}`);
  
  // Busca todos os pedidos com esse order_number
const { data: allOrders, error: searchError } = await supabase
    .from("orders")
    .select("id, order_number, restaurant_id, client_name, client_phone, status, itens, total_price, created_at, update_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type, address, payment_method, notes")
    .eq("order_number", parseInt(orderNumber));
  
  if (searchError || !allOrders || allOrders.length === 0) {
    console.log(`❌ Nenhum pedido #${orderNumber} encontrado`);
    return res.status(404).json({
      success: false,
      error: "Pedido não encontrado"
    });
  }
  
  // Filtra pelo restaurant_id que começa com shortId
  const data = allOrders.find(order => order.restaurant_id.startsWith(shortId));
  
  if (!data) {
    console.log(`❌ Pedido #${orderNumber} não encontrado para restaurant ${shortId}*`);
    return res.status(404).json({
      success: false,
      error: "Pedido não encontrado"
    });
  }
  
  // Pula o resto do query e vai direto pro processamento
  // (apaga as linhas 713-732 e substitui por):
  
  const statusMap = {
    "draft": { progress: 0, label: "Rascunho" },
    "pending": { progress: 20, label: "Pedido Confirmado" },
    "preparing": { progress: 40, label: "Em Preparo" },
    "mounting": { progress: 60, label: "Montando" },
    "delivering": { progress: 80, label: "Saiu para Entrega" },
    "finished": { progress: 100, label: "Pedido Entregue" },
    "cancelled": { progress: 0, label: "Cancelado" },
    "canceled": { progress: 0, label: "Cancelado" }
  };
  
  const currentStatus = data.status || "pending";
  const statusInfo = statusMap[currentStatus] || statusMap["pending"];
  
  const items = Array.isArray(data.itens) ? data.itens.map(item => ({
    name: item.name || item.produto || "Item",
    quantity: item.quantity || item.quantidade || 1,
    price: parseFloat(item.price || item.preco || 0)
  })) : [];
  
  let timeRemaining = 0;
  if (currentStatus === "pending") timeRemaining = 40;
  else if (currentStatus === "preparing") timeRemaining = 30;
  else if (currentStatus === "mounting") timeRemaining = 15;
  else if (currentStatus === "delivering") timeRemaining = 20;
  
const response = {
  success: true,
  order: {
    id: data.id,
    order_number: data.order_number,
    client_name: data.client_name,
    status: currentStatus,
    progress: statusInfo.progress,
    timeRemaining,
    total_amount: parseFloat(data.total_price) || 0,
    items,
    service_type: data.service_type,
    address: data.address,
    payment_method: data.payment_method,
    notes: data.notes,
    confirmed_at: data.created_at,
    preparing_at: data.preparing_at || null,
    mounting_at: data.mounting_at || null,
    delivering_at: data.delivering_at || null,
    delivered_at: data.delivered_at || null,
    cancelled_at: data.cancelled_at || null
  }
};
  
  console.log(`✅ Pedido rastreado: #${data.order_number} - Status: ${currentStatus}`);
  
  return res.json(response);
}

    // Se for UUID completo (fallback)
    else if (tracking_code.includes('-')) {
      query = query.eq("id", tracking_code);
    } 
    // Se for apenas número (não permitir)
    else {
      return res.status(400).json({
        success: false,
        error: "Formato inválido. Use: restaurantId_orderNumber"
      });
    }
    
    const { data, error } = await query.single();
    
    if (error || !data) {
      console.log(`❌ Pedido não encontrado: ${tracking_code}`);
      return res.status(404).json({
        success: false,
        error: "Pedido não encontrado"
      });
    }
    
    const statusMap = {
      "draft": { progress: 0, label: "Rascunho" },
      "pending": { progress: 20, label: "Pedido Confirmado" },
      "preparing": { progress: 40, label: "Em Preparo" },
      "mounting": { progress: 60, label: "Montando" },
      "delivering": { progress: 80, label: "Saiu para Entrega" },
      "finished": { progress: 100, label: "Pedido Entregue" },
      "cancelled": { progress: 0, label: "Cancelado" },
      "canceled": { progress: 0, label: "Cancelado" }
    };
    
    const currentStatus = data.status || "pending";
    const statusInfo = statusMap[currentStatus] || statusMap["pending"];
    
    const items = Array.isArray(data.itens) ? data.itens.map(item => ({
      name: item.name || item.produto || "Item",
      quantity: item.quantity || item.quantidade || 1,
      price: parseFloat(item.price || item.preco || 0)
    })) : [];
    
    let timeRemaining = 0;
    if (currentStatus === "pending") timeRemaining = 40;
    else if (currentStatus === "preparing") timeRemaining = 30;
    else if (currentStatus === "mounting") timeRemaining = 15;
    else if (currentStatus === "delivering") timeRemaining = 20;
    
    const response = {
      success: true,
      order: {
        id: data.id,
        order_number: data.order_number || tracking_code,
        client_name: data.client_name,
        status: currentStatus,
        progress: statusInfo.progress,
        timeRemaining,
        total_amount: parseFloat(data.total_price) || 0,
        items,
        service_type: data.service_type,
        address: data.address,
        payment_method: data.payment_method,
        notes: data.notes,
        confirmed_at: data.created_at,
        preparing_at: currentStatus === "preparing" || currentStatus === "mounting" || currentStatus === "delivering" || currentStatus === "finished" ? data.created_at : null,
        ready_at: currentStatus === "mounting" || currentStatus === "delivering" || currentStatus === "finished" ? data.created_at : null,
        out_for_delivery_at: currentStatus === "delivering" || currentStatus === "finished" ? data.created_at : null,
        delivered_at: currentStatus === "finished" ? data.created_at : null,
        cancelled_at: currentStatus === "cancelled" || currentStatus === "canceled" ? data.created_at : null
      }
    };
    
    console.log(`✅ Pedido rastreado: #${data.order_number} - Status: ${currentStatus}`);
    
    return res.json(response);
    
  } catch (err) {
    console.error("❌ Erro em /api/v1/tracking:", err);
    return sendError(res, 500, "Erro ao rastrear pedido");
  }
});

// ONDE COLAR: server.js, após a rota de timeline, antes do app.get("")

app.get("/api/v1/metrics/:restaurant_id/timing", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseResults(plan)) return res.status(403).json({ error: "Plano insuficiente", upgrade_to: "advanced" });

    // Calcula data inicial
    const days = period === "all" ? 3650 : (parseInt(period) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Busca pedidos finalizados com timestamps
    const { data: orders, error } = await supabase
      .from("orders")
      .select("created_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type")
      .eq("restaurant_id", restaurant_id)
      .eq("status", "finished")
      .gte("created_at", startDate.toISOString())
      .not("preparing_at", "is", null);

    if (error) return sendError(res, 500, "Erro ao buscar pedidos");

    const METAS = { confirmacao: 5, preparo: 15, montagem: 8, entrega: 20 };
    const totals = { confirmacao: 0, preparo: 0, montagem: 0, entrega: 0 };
    const counts = { confirmacao: 0, preparo: 0, montagem: 0, entrega: 0 };

    const diffMin = (a, b) => {
      if (!a || !b) return null;
      const d = (new Date(b) - new Date(a)) / 60000;
      return (d > 0 && d < 300) ? d : null;
    };

    // Calcula tempo de cada etapa por pedido
    (orders || []).forEach(o => {
      const delivery = (o.service_type || "").toLowerCase() === "delivery";
      const d1 = diffMin(o.created_at, o.preparing_at);
      const d2 = diffMin(o.preparing_at, o.mounting_at);
      const d3 = diffMin(o.mounting_at, delivery ? o.delivering_at : o.delivered_at);
      const d4 = delivery ? diffMin(o.delivering_at, o.delivered_at) : null;

      if (d1) { totals.confirmacao += d1; counts.confirmacao++; }
      if (d2) { totals.preparo     += d2; counts.preparo++;     }
      if (d3) { totals.montagem    += d3; counts.montagem++;    }
      if (d4) { totals.entrega     += d4; counts.entrega++;     }
    });

    // Médias por etapa
    const medias = Object.fromEntries(
      Object.keys(totals).map(k => [k, counts[k] > 0 ? parseFloat((totals[k] / counts[k]).toFixed(2)) : 0])
    );

    // Identifica gargalos (etapas acima da meta)
    const gargalos = Object.keys(METAS)
      .filter(k => medias[k] > METAS[k])
      .map(k => ({ etapa: k, excesso: parseFloat((medias[k] - METAS[k]).toFixed(2)) }));

    return res.json({
      period,
      total_analisados: orders?.length || 0,
      medias,
      metas: METAS,
      gargalos
    });

  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

app.get("/api/v1/metrics/:restaurant_id/top-products", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseResults(plan)) return res.status(403).json({ error: "Plano insuficiente" });
    const days = period === "all" ? 3650 : (parseInt(period) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const { data: orders, error } = await supabase
      .from("orders")
      .select("itens")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startDate.toISOString());
    if (error) return sendError(res, 500, "Erro ao buscar pedidos");
    const ranking = {};
    (orders || []).forEach(order => {
      (order.itens || []).forEach(item => {
        const nome = String(item.name || item.nome || "")
          .toLowerCase().trim()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ");
        if (!nome) return;
        ranking[nome] = (ranking[nome] || 0) + (item.qty || item.quantidade || 1);
      });
    });
    const sorted = Object.entries(ranking)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, qty]) => ({ nome: nome.charAt(0).toUpperCase() + nome.slice(1), qty }));
    return res.json(sorted);
  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

app.get("/api/v1/metrics/:restaurant_id/resumo-dia", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("owner_phone, name")
      .eq("id", restaurant_id)
      .single();

    // ✅ Busca caixa aberto para usar como filtro de início
 const hoje = new Date();
hoje.setHours(0, 0, 0, 0);

let inicioPeriodo = hoje;

if (req.query.desde) {
  inicioPeriodo = new Date(req.query.desde);
} else {
  const { data: caixaAberto } = await supabase
    .from("caixa")
    .select("created_at")
    .eq("restaurant_id", restaurant_id)
    .eq("status", "aberto")
    .single();
  if (caixaAberto?.created_at) inicioPeriodo = new Date(caixaAberto.created_at);
}

    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const { data: orders, error } = await supabase
      .from("orders").select("*")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", inicioPeriodo.toISOString())
      .lt("created_at", amanha.toISOString());

    if (error) return sendError(res, 500, "Erro ao buscar pedidos");

    const finalizados = (orders || []).filter(o => o.status === "finished");
    const cancelados = (orders || []).filter(o => o.status === "canceled" || o.status === "cancelled");
    const faturamento = finalizados.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
    const ticketMedio = finalizados.length > 0 ? faturamento / finalizados.length : 0;
    const delivery = finalizados.filter(o => String(o.service_type || "").toLowerCase() === "delivery").length;
    const local = finalizados.filter(o => String(o.service_type || "").toLowerCase() !== "delivery").length;

    const porPagamento = {};
    finalizados.forEach(o => {
      const paymentStr = String(o.payment_method || "Não informado").toLowerCase();
      const total = parseFloat(o.total_price) || 0;
      if (paymentStr.includes("+")) {
        const partes = paymentStr.split("+").map(p => p.trim());
        partes.forEach(parte => {
          const valorMatch = parte.match(/r?\$?([\d.,]+)/i);
          const valor = valorMatch ? parseFloat(valorMatch[1].replace(",", ".")) : 0;
          let metodo = "outros";
          if (parte.includes("pix")) metodo = "Pix";
          else if (parte.includes("credito") || parte.includes("crédito")) metodo = "Crédito";
          else if (parte.includes("debito") || parte.includes("débito")) metodo = "Débito";
          else if (parte.includes("dinheiro")) metodo = "Dinheiro";
          else if (parte.includes("maquininha")) metodo = "Maquininha";
          if (!porPagamento[metodo]) porPagamento[metodo] = { qtd: 0, valor: 0 };
          porPagamento[metodo].qtd++;
          porPagamento[metodo].valor += valor;
        });
      } else {
        let metodo = "Outros";
        if (paymentStr.includes("pix")) metodo = "Pix";
        else if (paymentStr.includes("credito") || paymentStr.includes("crédito")) metodo = "Crédito";
        else if (paymentStr.includes("debito") || paymentStr.includes("débito")) metodo = "Débito";
        else if (paymentStr.includes("dinheiro")) metodo = "Dinheiro";
        else if (paymentStr.includes("maquininha")) metodo = "Maquininha";
        if (!porPagamento[metodo]) porPagamento[metodo] = { qtd: 0, valor: 0 };
        porPagamento[metodo].qtd++;
        porPagamento[metodo].valor += total;
      }
    });

    const topItens = {};
    finalizados.forEach(o => {
      (o.itens || []).forEach(it => {
        const nome = it.name || it.nome || "?";
        topItens[nome] = (topItens[nome] || 0) + (it.qty || it.quantidade || 1);
      });
    });
    const topSorted = Object.entries(topItens)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nome, qty]) => ({ nome, qty }));

    return res.json({
      data: inicioPeriodo.toISOString(),
      total_pedidos: finalizados.length,
      faturamento,
      ticket_medio: ticketMedio,
      cancelados: cancelados.length,
      delivery,
      local,
      por_pagamento: porPagamento,
      top_itens: topSorted,
      owner_phone: restaurant?.owner_phone || null,
      restaurant_name: restaurant?.name || null,
      webhook_fechamento: (await getIntegracao(restaurant_id, "webhook_fechamento"))?.webhook_url || null,
    });
  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});
app.get("/api/v1/pedidos-cliente", async (req, res) => {
  try {
    const { restaurant_id, phone } = req.query;
    if (!restaurant_id || !phone) return sendError(res, 400, "restaurant_id e phone são obrigatórios");
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) return sendError(res, 400, "Telefone inválido");
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, itens, total_price, created_at, status, service_type, payment_method")
      .eq("restaurant_id", restaurant_id)
      .eq("client_phone", phoneNorm)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return sendError(res, 500, "Erro ao buscar pedidos");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

// GET - Lista cardápio do restaurante (com filtro opcional por categoria)
app.get("/api/v1/cardapio/:restaurant_id", async (req, res) => {
  const { restaurant_id } = req.params;
  const { categoria, admin } = req.query;

  const isAdmin = admin === "true";

  let query = supabase
    .from("cardapio")
    .select("id, nome, preco, categoria, ativo, descricao, foto_url, ordem, opcoes")
    .eq("restaurant_id", restaurant_id)
    .order("ordem");

  if (!isAdmin) {
    query = query.eq("ativo", true);
  }

  if (categoria) {
    query = query.ilike("categoria", `%${categoria.trim()}%`);
  }

  const { data, error } = await query;
  if (error) return sendError(res, 500, "Erro ao buscar cardápio");

  // Busca ordem das categorias salva pelo admin
  const { data: config } = await supabase
    .from("restaurante_config")
    .select("categorias_ordem")
    .eq("restaurant_id", restaurant_id)
    .single();

  const ordemCategorias = config?.categorias_ordem;

  if (!ordemCategorias || ordemCategorias.length === 0) {
    return res.json(data);
  }

  // Ordena os itens respeitando a ordem das categorias definida pelo admin
  const ordered = [...data].sort((a, b) => {
    const ia = ordemCategorias.findIndex(c => (c.nome || c) === a.categoria);
const ib = ordemCategorias.findIndex(c => (c.nome || c) === b.categoria);
    const posA = ia === -1 ? 9999 : ia;
    const posB = ib === -1 ? 9999 : ib;
    if (posA !== posB) return posA - posB;
    return (a.ordem ?? 0) - (b.ordem ?? 0); // dentro da categoria, mantém ordem dos itens
  });

  return res.json(ordered);
});

// GET - Lista só as categorias (sem produtos)
// GET - Lista categorias do restaurante
app.get("/api/v1/cardapio/:restaurant_id/categorias", async (req, res) => {
  const { restaurant_id } = req.params;

  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .eq("restaurant_id", restaurant_id)
    .order("nome");

  if (error) return sendError(res, 500, "Erro ao buscar categorias");
  return res.json(data || []);
});

// POST - Cria categoria
app.post("/api/v1/cardapio/:restaurant_id/categorias", async (req, res) => {
  const { restaurant_id } = req.params;
  const { nome, foto_url } = req.body;

  if (!nome || !nome.trim()) return sendError(res, 400, "nome é obrigatório");

  const { data, error } = await supabase
    .from("categorias")
    .insert([{ restaurant_id, nome: nome.trim(), foto_url: foto_url || null }])
    .select()
    .single();

  if (error) return sendError(res, 500, "Erro ao criar categoria");
  return res.status(201).json(data);
});

// PATCH - Renomeia/atualiza categoria (nome e/ou foto)
app.patch("/api/v1/categorias/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, foto_url } = req.body;

  const updateData = {};
  if (nome && nome.trim()) updateData.nome = nome.trim();
  if (foto_url !== undefined) updateData.foto_url = foto_url;

  if (Object.keys(updateData).length === 0) return sendError(res, 400, "nada para atualizar");

  const { data, error } = await supabase
    .from("categorias")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) return sendError(res, 500, "Erro ao atualizar categoria");
  return res.json(data);
});

// DELETE - Remove categoria
app.delete("/api/v1/categorias/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) return sendError(res, 500, "Erro ao excluir categoria");
  return res.json({ success: true });
});

// GET - Busca itens por nome (autocomplete)
app.get("/api/v1/cardapio/:restaurant_id/busca", async (req, res) => {
  const { restaurant_id } = req.params;
  const { q = "" } = req.query;
if (!q || q.trim().length < 1) return res.json([]);
const qNorm = q.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const { data, error } = await supabase
    .from("cardapio")
    .select("id, nome, preco, categoria, opcoes")
    .eq("restaurant_id", restaurant_id)
    .eq("ativo", true)
    .ilike("nome", `%${qNorm}%`)
.order("nome")
.limit(50);

  if (error) return sendError(res, 500, "Erro ao buscar itens");
  return res.json(data || []);
});

// POST - Valida itens enviados pelo cliente (busca fuzzy por nome)
app.post("/api/v1/cardapio/:restaurant_id/validar-itens", async (req, res) => {
  const { restaurant_id } = req.params;
  const { itens } = req.body;

  if (!Array.isArray(itens) || itens.length === 0) {
    return sendError(res, 400, "itens deve ser um array não vazio");
  }

  const { data: cardapio, error } = await supabase
    .from("cardapio")
    .select("id, nome, preco, opcoes")
    .eq("restaurant_id", restaurant_id)
    .eq("ativo", true);

  if (error) return sendError(res, 500, "Erro ao buscar cardápio");

  function normalizarNome(nome) {
    return String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function buscarItemPorNome(nomeQuery) {
    const q = normalizarNome(nomeQuery);
    return cardapio.find(item =>
      normalizarNome(item.nome).includes(q) ||
      q.includes(normalizarNome(item.nome))
    );
  }

  function getPrecoComFiltro(item, filtro) {
    if (!Array.isArray(item.opcoes) || item.opcoes.length === 0) {
      return parseFloat(item.preco || 0);
    }
    if (!filtro) return parseFloat(item.preco || 0);
    const filtroNorm = normalizarNome(filtro);
    const variacao = item.opcoes.find(op =>
      normalizarNome(op.nome).includes(filtroNorm) ||
      filtroNorm.includes(normalizarNome(op.nome))
    );
    return variacao ? parseFloat(variacao.preco || 0) : parseFloat(item.preco || 0);
  }

  const resultados = itens.map(item => {
    const nomeCompleto = String(item.nome || "");
    const precoCliente = parseFloat(item.preco || 0);

    // Detecta padrão "Algo — Sabor1 + Sabor2"
    const matchDoisSabores = nomeCompleto.match(/^(.+?)\s*[—\-]+\s*(.+?)\s*\+\s*(.+)$/);

    if (matchDoisSabores) {
      const nomeBase = matchDoisSabores[1].trim(); // ex: "Pizza dois sabores Grande"
      const sabor1 = matchDoisSabores[2].trim();   // ex: "Pizza Margherita"
      const sabor2 = matchDoisSabores[3].trim();   // ex: "Pizza Baiana"

      // Detecta o tamanho/variação no nome base
      const variacaoMatch = nomeBase.match(/(grande|media|medio|pequena|pequeno|p\b|m\b|g\b)/i);
      const filtro = variacaoMatch ? variacaoMatch[1] : "";

      const item1 = buscarItemPorNome(sabor1);
      const item2 = buscarItemPorNome(sabor2);

      const preco1 = item1 ? getPrecoComFiltro(item1, filtro) : 0;
      const preco2 = item2 ? getPrecoComFiltro(item2, filtro) : 0;
      const precoCorreto = Math.max(preco1, preco2);

      return {
        nome_cliente: nomeCompleto,
        encontrado: !!(item1 || item2),
        sabores: [
          { nome: sabor1, encontrado: !!item1, preco: preco1 },
          { nome: sabor2, encontrado: !!item2, preco: preco2 }
        ],
        preco_correto: precoCorreto,
        preco_cliente: precoCliente,
        ok: Math.abs(precoCorreto - precoCliente) < 0.01
      };
    }

    // Item simples — detecta se tem variação no nome ex: "Pizza Margherita Grande"
    const tamanhos = ["grande", "media", "medio", "pequena", "pequeno"];
    let filtro = "";
    let nomeBusca = nomeCompleto;

    for (const t of tamanhos) {
      const regex = new RegExp(`\\b${t}\\b`, "i");
      if (regex.test(nomeCompleto)) {
        filtro = t;
        nomeBusca = nomeCompleto.replace(regex, "").trim();
        break;
      }
    }

    const encontrado = buscarItemPorNome(nomeBusca) || buscarItemPorNome(nomeCompleto);

    if (!encontrado) {
      return {
        nome_cliente: nomeCompleto,
        encontrado: false,
        ok: false
      };
    }

    const precoCorreto = filtro
      ? getPrecoComFiltro(encontrado, filtro)
      : parseFloat(encontrado.preco || 0);

    return {
      nome_cliente: nomeCompleto,
      nome_cardapio: encontrado.nome,
      encontrado: true,
      preco_correto: precoCorreto,
      preco_cliente: precoCliente,
      ok: Math.abs(precoCorreto - precoCliente) < 0.01
    };
  });

  return res.json({ resultados });
});

// PATCH - Salva ordem das categorias
app.patch("/api/v1/cardapio/:restaurant_id/ordem-categorias", async (req, res) => {
  const { restaurant_id } = req.params;
  const { ordem } = req.body;
  if (!Array.isArray(ordem)) return sendError(res, 400, "ordem deve ser um array");

  // Normaliza para array de objetos independente do formato recebido
  const ordemNormalizada = ordem.map(cat =>
    typeof cat === "string"
      ? { nome: cat, foto_url: null }
      : { nome: cat.nome, foto_url: cat.foto_url || null }
  );

  const { error } = await supabase
    .from("restaurante_config")
    .upsert({ restaurant_id, categorias_ordem: ordemNormalizada }, { onConflict: "restaurant_id" });

  if (error) return sendError(res, 500, "Erro ao salvar ordem");
  return res.json({ success: true });
});

// POST - Cria item
app.post("/api/v1/cardapio", async (req, res) => {
  const { restaurant_id, nome, descricao, preco, categoria, foto_url, ordem, opcoes } = req.body;
 if (!restaurant_id || !nome) return sendError(res, 400, "Campos obrigatórios: restaurant_id, nome");

  const { data, error } = await supabase
    .from("cardapio")
    .insert([{ restaurant_id, nome, descricao, preco, categoria: categoria || "Geral", foto_url, ordem: ordem || 0, opcoes: opcoes || null }])
    .select().single();

  if (error) return sendError(res, 500, "Erro ao criar item");
  return res.status(201).json(data);
});

// PATCH - Edita item
app.patch("/api/v1/cardapio/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("cardapio")
    .update(req.body)
    .eq("id", id)
    .select().single();

  if (error) return sendError(res, 500, "Erro ao atualizar item");
  return res.json(data);
});

// DELETE - Remove item
app.delete("/api/v1/cardapio/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("cardapio").delete().eq("id", id);
  if (error) return sendError(res, 500, "Erro ao deletar item");
  return res.json({ success: true });
});

app.post("/api/v1/upload-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 400, "Nenhum arquivo enviado");

    const ext = req.file.originalname.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const bucket = req.body.bucket || req.query.bucket || "cardapio-images";
    const allowedBuckets = ["cardapio-images", "restaurante-logos", "premios-images"];
    if (!allowedBuckets.includes(bucket)) return sendError(res, 400, "Bucket inválido");

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) return sendError(res, 500, "Erro ao fazer upload: " + error.message);

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return res.json({ success: true, url: urlData.publicUrl });
  } catch (err) {
    return sendError(res, 500, "Erro interno no upload");
  }
});

app.get("/api/v1/dominio/:dominio", async (req, res) => {
  const { dominio } = req.params;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("fidelidade_url", dominio)
    .single();
  if (error || !data) return sendError(res, 404, "Domínio não encontrado");
  return res.json({ restaurant_id: data.id });
});

app.patch("/api/v1/restaurante/:restaurant_id/dominio", async (req, res) => {
  const { restaurant_id } = req.params;
  const { dominio } = req.body;
  
  const { data, error } = await supabase
    .from("restaurants")
    .update({ fidelidade_url: dominio })
    .eq("id", restaurant_id);
    
  if (error) return sendError(res, 500, "Erro ao salvar domínio");
  return res.json({ success: true });
});

app.patch("/api/v1/restaurante/:restaurant_id/dominio-cardapio", async (req, res) => {
  const { restaurant_id } = req.params;
  const { dominio } = req.body;
  const { error } = await supabase
    .from("restaurants")
    .update({ cardapio_url: dominio })
    .eq("id", restaurant_id);
  if (error) return sendError(res, 500, "Erro ao salvar domínio do cardápio");
  return res.json({ success: true });
});

app.get("/api/v1/dominio-cardapio/:dominio", async (req, res) => {
  const { dominio } = req.params;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("cardapio_url", dominio)
    .single();
  if (error || !data) return sendError(res, 404, "Domínio não encontrado");
  return res.json({ restaurant_id: data.id });
});

app.get("/api/v1/dominio-delivery/:dominio", async (req, res) => {
  const { dominio } = req.params;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("cardapio_delivery_url", dominio)
    .single();
  if (error || !data) return sendError(res, 404, "Domínio não encontrado");
  return res.json({ restaurant_id: data.id });
});

app.patch("/api/v1/restaurante/:restaurant_id/dominio-delivery", async (req, res) => {
  const { restaurant_id } = req.params;
  const { dominio } = req.body;
  const { error } = await supabase
    .from("restaurants")
    .update({ cardapio_delivery_url: dominio })
    .eq("id", restaurant_id);
  if (error) return sendError(res, 500, "Erro ao salvar domínio do delivery");
  return res.json({ success: true });
});

// GET - Busca config do restaurante (logo, cores, nome)
app.get("/api/v1/restaurante/:restaurant_id/config", async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    const { data: rest } = await supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurant_id)
      .single();

    const { data: config } = await supabase
      .from("restaurante_config")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .single();

    return res.json({
      nome_exibicao: config?.nome_exibicao || "",
      logo_url: config?.logo_url || null,
      cor_primaria: config?.cor_primaria || "#f97373",
      cor_secundaria: config?.cor_secundaria || "#b91c1c",
      cor_fundo: config?.cor_fundo || "#0c0a09",
      subtitulo: config?.subtitulo || null,
      telefone: config?.telefone || null,
      instagram: config?.instagram || null,
      descricao: config?.descricao || null,
      tema: config?.tema || "dark",
      num_mesas: config?.num_mesas || 10,
      tempo_recebido: config?.tempo_recebido ?? 1.5,
      tempo_preparo: config?.tempo_preparo ?? 20,
      tempo_pronto: config?.tempo_pronto ?? 10,
      categorias_ordem: config?.categorias_ordem || []
    });
  } catch (err) {
    return sendError(res, 500, "Erro ao buscar configuração");
  }
});

// PATCH - Salva config do restaurante
app.patch("/api/v1/restaurante/:restaurant_id/config", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const fields = req.body;

    const { error } = await supabase
      .from("restaurante_config")
      .upsert({ restaurant_id, ...fields }, { onConflict: "restaurant_id" });

    if (error) return sendError(res, 500, "Erro ao salvar config");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca config da impressora
app.get("/api/v1/restaurante/:restaurant_id/impressora", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "printnode");
    return res.json({
      api_key: dados?.api_key ? "configurado" : "",
      impressoras: dados?.impressoras || []
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva config da impressora
app.patch("/api/v1/restaurante/:restaurant_id/impressora", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { api_key, impressoras } = req.body;

    if (!api_key || !Array.isArray(impressoras))
      return sendError(res, 400, "api_key e impressoras são obrigatórios");

    const existing = await getIntegracao(restaurant_id, "printnode");
    const dados = {
      api_key: api_key !== "configurado" ? api_key : existing?.api_key,
      impressoras
    };

    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: "printnode", dados, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva tracking_url
app.patch("/api/v1/restaurante/:restaurant_id/tracking-url", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { tracking_url } = req.body;
    const { error } = await supabase
      .from("restaurants")
      .update({ tracking_url })
      .eq("id", restaurant_id);
    if (error) return sendError(res, 500, "Erro ao salvar tracking URL");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca tracking_url
app.get("/api/v1/restaurante/:restaurant_id/tracking-url", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("restaurants")
      .select("tracking_url")
      .eq("id", restaurant_id)
      .single();
    if (error || !data) return sendError(res, 404, "Não encontrado");
    return res.json({ tracking_url: data.tracking_url || "" });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca config fiscal
app.get("/api/v1/restaurante/:restaurant_id/fiscal", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "focusnfe");
    return res.json({
      focusnfe_token: dados?.focusnfe_token ? "configurado" : "",
      cnpj: dados?.cnpj || "",
      inscricao_estadual: dados?.inscricao_estadual || "",
      regime_tributario: dados?.regime_tributario || "1"
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva config fiscal
app.patch("/api/v1/restaurante/:restaurant_id/fiscal", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { focusnfe_token, cnpj, inscricao_estadual, regime_tributario } = req.body;
    const existing = await getIntegracao(restaurant_id, "focusnfe");
    const dados = {
      focusnfe_token: focusnfe_token !== "configurado" ? focusnfe_token : existing?.focusnfe_token,
      cnpj, inscricao_estadual, regime_tributario
    };
    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: "focusnfe", dados, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

/* ========================================
   🖨️ ROTAS DE IMPRESSORA (PrintNode)
======================================== */

function gerarCupom(origin) {
  const prefixo = String(origin || "").toLowerCase() === "ifood" ? "IFD" : "AQF";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefixo}-${codigo}`;
}

async function printOrder(order, apiKey, printerId, is_caixa = false) {
  try {
    const isDelivery = String(order.service_type || '').toLowerCase() === 'delivery';
    const itens = Array.isArray(order.itens) ? order.itens : [];
    let totalRecalculado = 0;

    const itensComPreco = await Promise.all(itens.map(async (it) => {
      const nome = it.name || it.nome || 'Item';
      const qty  = it.qty || it.quantidade || it.quantity || 1;
      let preco  = parseFloat(it.price || it.preco || 0);

      if (preco === 0 && order.restaurant_id) {
        const { data: cardapioItem } = await supabase
          .from("cardapio").select("preco")
          .eq("restaurant_id", order.restaurant_id)
          .ilike("nome", nome).limit(1).single();
        if (cardapioItem?.preco) preco = parseFloat(cardapioItem.preco);
      }

      totalRecalculado += preco * qty;
      return { nome, qty, preco };
    }));

    const totalFinal = parseFloat(order.total_price || 0) > 0
      ? parseFloat(order.total_price)
      : totalRecalculado;

    const horario = new Date(order.created_at || Date.now())
      .toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
      });

    const { data: restData } = await supabase
      .from("restaurants")
      .select("name, tracking_url")
      .eq("id", order.restaurant_id)
      .single();

    const { data: restConfig } = await supabase
      .from("restaurante_config")
      .select("nome_exibicao, subtitulo, telefone, instagram")
      .eq("restaurant_id", order.restaurant_id)
      .single();

    const nomeRestaurante = restConfig?.nome_exibicao || restData?.name || 'Restaurante';

    const ESC = 0x1B;
    const GS  = 0x1D;
    const bytes = [];
    const b = (...args) => args.forEach(v => bytes.push(v));
    const txt = (str) => {
      const map = {
        'á':'a','à':'a','â':'a','ã':'a','ä':'a',
        'é':'e','è':'e','ê':'e','ë':'e',
        'í':'i','ì':'i','î':'i','ï':'i',
        'ó':'o','ò':'o','ô':'o','õ':'o','ö':'o',
        'ú':'u','ù':'u','û':'u','ü':'u',
        'ç':'c','ñ':'n',
        'Á':'A','À':'A','Â':'A','Ã':'A',
        'É':'E','È':'E','Ê':'E',
        'Í':'I','Î':'I',
        'Ó':'O','Ô':'O','Õ':'O',
        'Ú':'U','Û':'U',
        'Ç':'C','Ñ':'N'
      };
      String(str || '').replace(/[^\x20-\x7E]/g, c => map[c] || '?')
        .split('').forEach(c => bytes.push(c.charCodeAt(0)));
    };
    const lf       = () => b(0x0A);
    const lineEq   = (n = 48) => { txt('='.repeat(n)); lf(); };
    const lineDash = (n = 48) => { txt('-'.repeat(n)); lf(); };

    // ══════════════════════════════════════
    // 🧾 LAYOUT EQUIPE (cozinha/bebidas)
    // ══════════════════════════════════════
    if (!is_caixa) {
      b(ESC, 0x40); // reset

      // Nome do restaurante centralizado
      b(ESC, 0x61, 0x01);
      b(ESC, 0x45, 0x01);
      txt(nomeRestaurante); lf();
      b(ESC, 0x45, 0x00);
      b(ESC, 0x61, 0x00);

      lineDash();

      // Cliente e telefone
      txt(`Horario  : ${horario}`); lf();
if (order.client_name)  { txt(`Cliente  : ${order.client_name}`);  lf(); }
if (order.client_phone) { txt(`Telefone : ${order.client_phone}`); lf(); }

      lineDash();

      // Mesa em destaque centralizada e maior
      if (order.table_number) {
        b(ESC, 0x61, 0x01);
        b(GS, 0x21, 0x11);
        txt(`MESA ${order.table_number}`); lf();
        b(GS, 0x21, 0x00);
        b(ESC, 0x61, 0x00);
      }

      lineDash();

      // Itens
      b(ESC, 0x45, 0x01); b(GS, 0x21, 0x01); txt("Itens:"); b(GS, 0x21, 0x00); b(ESC, 0x45, 0x00); lf();
      lineDash();

      for (const it of itensComPreco) {
  b(GS, 0x21, 0x01);
  txt(`${it.qty}x ${it.nome}`); lf();
  b(GS, 0x21, 0x00);
}

      lineDash();

      // Obs sempre aparece
      b(ESC, 0x45, 0x01); txt("Obs:"); b(ESC, 0x45, 0x00);
if (order.notes) { b(GS, 0x21, 0x01); txt(` ${order.notes}`); b(GS, 0x21, 0x00); }
lf();

      lf();
      b(GS, 0x56, 0x41, 0x06); // corte

    // ══════════════════════════════════════
    // 🧾 LAYOUT CAIXA (cupom completo)
    // ══════════════════════════════════════
    } else {
      b(ESC, 0x40);

      b(ESC, 0x61, 0x01);
      b(GS, 0x21, 0x11);
      b(ESC, 0x45, 0x01);
      txt(nomeRestaurante); lf();
      b(GS, 0x21, 0x00);
      b(ESC, 0x45, 0x00);

      if (restConfig?.subtitulo) { txt(`- ${restConfig.subtitulo} -`); lf(); }
      lf();
      if (restConfig?.telefone) { txt(restConfig.telefone); lf(); }
      lf();

      b(ESC, 0x61, 0x00);
      lineEq();

      b(ESC, 0x45, 0x01);
      const tipoLabel = isDelivery ? '[DELIVERY]' : order.table_number ? `[LOCAL - MESA ${order.table_number}]` : '[LOCAL]';
      const pedidoStr = `Pedido #${order.order_number || ''}`;
      const espacoPedido = 48 - pedidoStr.length - tipoLabel.length;
      txt(pedidoStr + ' '.repeat(Math.max(1, espacoPedido)) + tipoLabel); lf();
      b(ESC, 0x45, 0x00);

      txt(`Cliente : ${order.client_name || ''}`); lf();
      txt(`Horario : ${horario}`); lf();
      if (isDelivery && order.address) { txt(`Endereco: ${order.address}`); lf(); }
      if (order.payment_method)        { txt(`Pagament: ${order.payment_method}`); lf(); }
      if (order.client_phone)          { txt(`Telefone: ${order.client_phone}`); lf(); }

      lineDash();

      b(ESC, 0x45, 0x01);
      txt('ITEM                              QTD    VALOR'); lf();
      b(ESC, 0x45, 0x00);

      lineDash();

      for (const it of itensComPreco) {
        const nome  = it.nome.substring(0, 32).padEnd(32);
        const qty   = String(it.qty).padStart(5);
        const valor = `R$${(it.preco * it.qty).toFixed(2)}`.padStart(9);
        txt(`${nome}${qty} ${valor}`); lf();
      }

      lineDash();

      if (order.notes) {
        lf();
        b(ESC, 0x45, 0x01); txt('Obs:'); lf(); b(ESC, 0x45, 0x00);
        txt(order.notes); lf();
        lf();
      }

      lineEq();
      b(ESC, 0x45, 0x01);
      b(GS, 0x21, 0x01);
      const totalLabel = 'TOTAL:';
      const totalValor = `R$ ${totalFinal.toFixed(2)}`;
      const espacoTotal = 48 - totalLabel.length - totalValor.length;
      txt(totalLabel + ' '.repeat(Math.max(1, espacoTotal)) + totalValor); lf();
      b(GS, 0x21, 0x00);
      b(ESC, 0x45, 0x00);
      lineEq();

      lf();
      b(ESC, 0x61, 0x01);
      txt('Obrigado pela preferencia!'); lf();
      txt('Volte sempre :)'); lf();
      lf();
      txt('* * * * * * * * * * * * * * * * * * * *'); lf();
      lf();
      if (restConfig?.instagram) {
        txt('Siga-nos no Instagram:'); lf();
        b(ESC, 0x45, 0x01);
        txt(`${restConfig.instagram}`); lf();
        b(ESC, 0x45, 0x00);
        lf();
      }
      txt('Feito com FlowON'); lf();
      lf();

      const origem = String(order.origin || "").toLowerCase();
      if (origem === "ifood" || origem === "aiqfome") {
        const nomeOrigem = origem === "ifood" ? "iFood" : "AiqFome";
        const cupom = gerarCupom(origem);
        const whatsapp = restConfig?.telefone
          ? String(restConfig.telefone).replace(/\D/g, "")
          : null;

        b(ESC, 0x61, 0x01);
        txt('* * * * * * * * * * * * * * * * * * * *'); lf();
        lf();
        b(ESC, 0x45, 0x01);
        txt(`Pediu no ${nomeOrigem}? Na proxima,`); lf();
        txt('peca direto no nosso WhatsApp'); lf();
        txt('e ganhe 10% de desconto!'); lf();
        b(ESC, 0x45, 0x00);
        lf();
        txt('Envie este cupom:'); lf();
        b(GS, 0x21, 0x01);
        b(ESC, 0x45, 0x01);
        txt(cupom); lf();
        b(GS, 0x21, 0x00);
        b(ESC, 0x45, 0x00);
        lf();
        if (whatsapp) { txt(`wa.me/55${whatsapp}`); lf(); }
        txt('* * * * * * * * * * * * * * * * * * * *'); lf();
        lf();
      }

      b(GS, 0x56, 0x41, 0x06);
    }
    
const rawBuffer = Buffer.from(bytes);
let response;
let tentativas = 0;
const MAX_TENTATIVAS = 3;

while (tentativas < MAX_TENTATIVAS) {
  tentativas++;
  try {
    response = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        printerId: parseInt(printerId),
        title: `Pedido #${order.order_number}`,
        contentType: "raw_base64",
        content: rawBuffer.toString("base64"),
        source: "FluxON"
      })
    });
    if (response.ok) break;
    console.warn(`⚠️ Tentativa ${tentativas} falhou — status ${response.status}`);
    await new Promise(r => setTimeout(r, 1000 * tentativas));
  } catch(err) {
    console.warn(`⚠️ Tentativa ${tentativas} erro: ${err.message}`);
    if (tentativas === MAX_TENTATIVAS) throw err;
    await new Promise(r => setTimeout(r, 1000 * tentativas));
  }
}

const result = await response.json();
if (!response.ok || result.error) {
  console.error(`❌ PrintNode erro:`, result);
  return false;
}

console.log(`🖨️ Pedido #${order.order_number} impresso na ${printerId}:`, result);
return true;

  } catch (err) {
    console.error("⚠️ Erro ao imprimir:", err.message);
    return false;
  }
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "sim";
  }
  return false;
}

async function printByCategory(order, apiKey, impressoras) {
  try {
    const itens = Array.isArray(order.itens) ? order.itens : [];
    const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";

    let itensComCategoria = itens;
    if (order.restaurant_id && itens.length > 0) {
      const nomes = itens.map(it => String(it.name || it.nome || "").trim()).filter(Boolean);
      if (nomes.length > 0) {
const cacheKey = `cardapio_${order.restaurant_id}`;
const agora = Date.now();

if (!_impressoraCache[cacheKey] || agora - _impressoraCache[cacheKey].ts > CACHE_TTL) {
  const { data } = await supabase
    .from("cardapio")
    .select("nome, categoria")
    .eq("restaurant_id", order.restaurant_id);
  _impressoraCache[cacheKey] = { dados: data || [], ts: agora };
}

const cardapioItens = _impressoraCache[cacheKey].dados;
const mapaCategoria = {};
(cardapioItens || []).forEach(c => {
  mapaCategoria[c.nome.toLowerCase().trim()] = c.categoria;
});
itensComCategoria = itens.map(it => {
  const nomeItem = String(it.name || it.nome || "").toLowerCase().trim();
  const categoriaEncontrada = Object.keys(mapaCategoria).find(nomeCardapio =>
    nomeItem.includes(nomeCardapio)
  );
  return {
    ...it,
    categoria: it.categoria || it.category || (categoriaEncontrada ? mapaCategoria[categoriaEncontrada] : "")
  };
});
      }
    }

    const categoriasDeOutras = impressoras
      .filter(p => !p.is_caixa && String(p.categorias || "").toLowerCase().trim() !== "todos")
      .flatMap(p =>
        String(p.categorias || "").split(",").map(c => c.trim().toLowerCase()).filter(Boolean)
      );

    for (const impressora of impressoras) {
      const { printer_id, categorias } = impressora;
const is_caixa = toBool(impressora.is_caixa) || toBool(impressora.caixa);
      if (!printer_id) continue;

      const isTodos = String(categorias || "").toLowerCase().trim() === "todos";

      // CAIXA: imprime tudo, layout completo
      if (is_caixa) {
        await printOrder({ ...order, itens: itensComCategoria }, apiKey, printer_id, true);
        console.log(`🖨️ Caixa ${printer_id} — cupom completo`);
        continue;
      }

      // DELIVERY: imprime tudo na primeira impressora não-caixa
      if (isDelivery) {
        await printOrder({ ...order, itens: itensComCategoria }, apiKey, printer_id, false);
        console.log(`🖨️ Delivery — ${printer_id} — pedido completo`);
        break;
      }

      // FILTRO POR CATEGORIA
      const categoriasList = String(categorias || "")
        .split(",").map(c => c.trim().toLowerCase()).filter(Boolean);

      const itensFiltrados = categoriasList.length === 0
  ? itensComCategoria
  : itensComCategoria.filter(it => {
      const cat  = String(it.categoria || it.category || "").toLowerCase().trim();
      const nome = String(it.name || it.nome || "").toLowerCase().trim();
      return categoriasList.some(c => cat.includes(c) || nome.includes(c));
    });

      if (itensFiltrados.length === 0) continue;

      await printOrder({ ...order, itens: itensFiltrados }, apiKey, printer_id, false);
      console.log(`🖨️ Impressora ${printer_id} — ${itensFiltrados.length} item(ns)`);
    }

    return true;
  } catch (err) {
    console.error("⚠️ Erro em printByCategory:", err.message);
    return false;
  }
}

// ===== WORKER DE IMPRESSÃO =====
const printWorker = new Worker("impressao", async (job) => {
  const { order, apiKey, impressoras } = job.data;
  await printByCategory(order, apiKey, impressoras);
}, { 
  connection: redisConnection,
  concurrency: 3,
  stalledInterval: 21600000,
  lockDuration: 300000
});

printWorker.on("completed", (job) => {
  console.log(`✅ Impressão concluída — Pedido #${job.data.order.order_number}`);
});

printWorker.on("failed", (job, err) => {
  console.error(`❌ Impressão falhou — Pedido #${job.data.order.order_number}:`, err.message);
});

// POST - Testa impressão
app.post("/api/v1/restaurante/:restaurant_id/impressora/teste", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
   const data = await getIntegracaoComCache(restaurant_id, "printnode");
    if (!data?.api_key || !Array.isArray(data?.impressoras) || data.impressoras.length === 0)
      return sendError(res, 400, "Impressora não configurada");

    const testOrder = {
      restaurant_id,
      order_number: "TESTE",
      client_name: "Teste FluxON",
      service_type: "local",
      table_number: "1",
      itens: [{ qty: 1, name: "Item Teste", price: 10.00 }],
      total_price: 10.00,
      notes: "Impressao de teste"
    };

    const resultados = [];
    for (const impressora of data.impressoras) {
      if (!impressora.printer_id) continue;
      const success = await printOrder(testOrder, data.api_key, impressora.printer_id, impressora.is_caixa || false);
      resultados.push({ printer_id: impressora.printer_id, is_caixa: impressora.is_caixa || false, success });
    }

    return res.json({ success: true, resultados });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// POST - Imprime pedido manualmente pelo operador
app.post("/api/v1/restaurante/:restaurant_id/imprimir-pedido", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { order_id, printer_id_override } = req.body;

    if (!order_id) return sendError(res, 400, "order_id é obrigatório");

    const config = await getIntegracaoComCache(restaurant_id, "printnode");
    if (!config?.api_key) return sendError(res, 400, "Impressora não configurada");

    const { data: order, error: orderError } = await supabase
      .from("orders").select("*").eq("id", order_id).single();
    if (orderError || !order) return sendError(res, 404, "Pedido não encontrado");

    // Só imprime resumo (caixa) — impressão normal fica no PATCH preparing
    if (!printer_id_override) return res.json({ success: true });

    const success = await printOrder(order, config.api_key, printer_id_override, true);
    if (!success) return sendError(res, 500, "Erro ao enviar para impressora");
    return res.json({ success: true });

  } catch (err) {
    console.error("❌ Erro em /imprimir-pedido:", err);
    return sendError(res, 500, "Erro interno ao imprimir");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/reimprimir-pedido", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { order_id } = req.body;
    if (!order_id) return sendError(res, 400, "order_id é obrigatório");
    const config = await getIntegracaoComCache(restaurant_id, "printnode");
    if (!config?.api_key) return sendError(res, 400, "Impressora não configurada");
    const { data: order, error: orderError } = await supabase
      .from("orders").select("*").eq("id", order_id).single();
    if (orderError || !order) return sendError(res, 404, "Pedido não encontrado");
    const impressorasSemCaixa = config.impressoras.filter(i => !toBool(i.is_caixa) && !toBool(i.caixa));
    const success = await printByCategory(order, config.api_key, impressorasSemCaixa);
    if (!success) return sendError(res, 500, "Erro ao reimprimir");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno ao reimprimir");
  }
});

app.patch("/api/v1/pedidos/:id/payment", async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;

    if (!payment_method) return sendError(res, 400, "payment_method é obrigatório");

    const { data, error } = await supabase
      .from("orders")
      .update({ payment_method, update_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return sendError(res, 500, "Erro ao atualizar pagamento");
   emitOrderUpdate(data.restaurant_id, data);

    return res.json({ success: true, order: data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

/* ========================================
   ⭐ FIDELIZAÇÃO
======================================== */

// Lista prêmios do restaurante
app.get("/api/v1/fidelidade/:restaurant_id/premios", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("premios_fidelidade")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("ativo", true)
      .order("pontos_necessarios");
    if (error) return sendError(res, 500, "Erro ao buscar prêmios");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Cria prêmio
app.post("/api/v1/fidelidade/premios", async (req, res) => {
  try {
    const { restaurant_id, nome, descricao, pontos_necessarios } = req.body;
    if (!restaurant_id || !nome || !pontos_necessarios)
      return sendError(res, 400, "Campos obrigatórios: restaurant_id, nome, pontos_necessarios");
    const { data, error } = await supabase
      .from("premios_fidelidade")
      .insert([{ restaurant_id, nome, descricao, pontos_necessarios, ativo: true }])
      .select().single();
    if (error) return sendError(res, 500, "Erro ao criar prêmio");
    return res.status(201).json(data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Edita prêmio
app.patch("/api/v1/fidelidade/premios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("premios_fidelidade")
      .update(req.body)
      .eq("id", id)
      .select().single();
    if (error) return sendError(res, 500, "Erro ao atualizar prêmio");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Deleta prêmio
app.delete("/api/v1/fidelidade/premios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("premios_fidelidade").delete().eq("id", id);
    if (error) return sendError(res, 500, "Erro ao deletar prêmio");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Lista clientes com pontos (admin)
app.get("/api/v1/fidelidade/:restaurant_id/clientes", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("base_clientes")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("Status", "ATIVO")
      .order("pontos", { ascending: false });
    if (error) return sendError(res, 500, "Erro ao buscar clientes");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Cliente busca dados pelo token
app.get("/api/v1/fidelidade/cliente/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { data: cliente, error } = await supabase
      .from("base_clientes")
      .select("*")
      .eq("token_fidelidade", token)
      .single();
    if (error || !cliente) return sendError(res, 404, "Cliente não encontrado");

    const { data: premios } = await supabase
      .from("premios_fidelidade")
      .select("*")
      .eq("restaurant_id", cliente.restaurant_id)
      .eq("ativo", true)
      .order("pontos_necessarios");

    const phoneNormalizado = normalizePhone(cliente.numero);

    const { data: resgates } = await supabase
      .from("orders")
      .select("id, order_number, itens, created_at, status, service_type, address, notes")
      .eq("restaurant_id", cliente.restaurant_id)
      .eq("client_phone", phoneNormalizado)
      .eq("origin", "fidelidade")
      .order("created_at", { ascending: false })
      .limit(10);

    return res.json({
      cliente: {
        nome: cliente.nome,
        pontos: cliente.pontos,
        pontos_resgatados: cliente.pontos_resgatados,
        token: cliente.token_fidelidade,
        restaurant_id: cliente.restaurant_id
      },
      premios: premios || [],
      resgates: resgates || []
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// POST - Resgate de fidelidade
app.post("/api/v1/fidelidade/resgatar", async (req, res) => {
  try {
    const { token, itens, service_type, address } = req.body;
    if (!token || !itens || !Array.isArray(itens) || itens.length === 0)
      return sendError(res, 400, "token e itens são obrigatórios");

    const { data: cliente } = await supabase
      .from("base_clientes")
      .select("*")
      .eq("token_fidelidade", token)
      .single();
    if (!cliente) return sendError(res, 404, "Cliente não encontrado");

    const premiosCarrinho = [];
    let totalPontos = 0;

    for (const item of itens) {
      const { data: premio } = await supabase
        .from("premios_fidelidade")
        .select("*")
        .eq("id", item.premio_id)
        .single();
      if (!premio) return sendError(res, 404, `Prêmio ${item.premio_id} não encontrado`);
      premiosCarrinho.push({ ...premio, quantidade: item.quantidade || 1 });
      totalPontos += premio.pontos_necessarios * (item.quantidade || 1);
    }

    if (cliente.pontos < totalPontos)
      return sendError(res, 400, "Pontos insuficientes");

  const { data: numData } = await supabase
  .rpc('get_next_order_number', { rid: cliente.restaurant_id });

const nextNumber = numData || 1;

    const now = new Date().toISOString();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        restaurant_id: cliente.restaurant_id,
        client_name: cliente.nome,
        client_phone: cliente.numero,
        order_number: nextNumber,
        itens: premiosCarrinho.map(p => ({ name: p.nome, qty: p.quantidade, price: 0 })),
        notes: `🎁 Resgate de fidelidade — ${totalPontos} pontos`,
        status: "pending",
        service_type: service_type || "local",
        address: address || null,
        total_price: 0,
        origin: "fidelidade",
        created_at: now,
        update_at: now
      }])
      .select().single();

    if (orderError) return sendError(res, 500, "Erro ao criar pedido de resgate");

    await supabase
      .from("base_clientes")
      .update({
        pontos: cliente.pontos - totalPontos,
        pontos_resgatados: (cliente.pontos_resgatados || 0) + totalPontos
      })
      .eq("id", cliente.id);

    try {
      const { data: printerConfig } = await supabase
        .from("restaurants")
        .select("printnode_api_key, printnode_printer_id")
        .eq("id", cliente.restaurant_id)
        .single();

      if (printerConfig?.printnode_api_key && printerConfig?.printnode_printer_id) {
        setTimeout(async () => {
          try {
            const { data: freshOrder } = await supabase
              .from("orders")
              .select("*")
              .eq("id", order.id)
              .single();

            if (freshOrder && freshOrder.status !== "cancelled" && freshOrder.status !== "canceled") {
              await printOrder(freshOrder, printerConfig.printnode_api_key, printerConfig.printnode_printer_id);
              console.log(`🖨️ Auto-impressão do pedido #${freshOrder.order_number}`);
            }
          } catch (printErr) {
            console.error("⚠️ Erro na auto-impressão:", printErr.message);
          }
        }, 60 * 1000);
      }
    } catch (printErr) {
      console.error("⚠️ Erro ao agendar impressão:", printErr.message);
    }

    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error("❌ Erro em /api/v1/fidelidade/resgatar:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

// ===== INTEGRAÇÕES =====

// GET - Busca integração por tipo
app.get("/api/v1/restaurante/:restaurant_id/integracao/:tipo", async (req, res) => {
  try {
    const { restaurant_id, tipo } = req.params;
    const { data, error } = await supabase
      .from("integracoes")
      .select("dados, ativo")
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo)
      .single();
    if (error || !data) return res.json({ configurado: false });
    
    // Nunca retorna tokens/secrets para o frontend
    const dadosSeguros = {};
    Object.keys(data.dados).forEach(key => {
      const camposSensiveis = ["access_token", "client_secret", "token", "merchant_key", "api_key"];
      const isSensivel = camposSensiveis.some(s => key.includes(s));
      dadosSeguros[key] = isSensivel ? "configurado" : data.dados[key];
    });

    return res.json({ configurado: true, ativo: data.ativo, dados: dadosSeguros });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva ou atualiza integração
app.patch("/api/v1/restaurante/:restaurant_id/integracao/:tipo", async (req, res) => {
  try {
    const { restaurant_id, tipo } = req.params;
    const { dados, ativo } = req.body;
    if (!dados) return sendError(res, 400, "dados são obrigatórios");

    // Verifica se já existe
    const { data: existing } = await supabase
      .from("integracoes")
      .select("id, dados")
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo)
      .single();

    if (existing) {
      // Merge dos dados — não sobrescreve campos que vieram como "configurado"
      const dadosMerge = { ...existing.dados };
      Object.keys(dados).forEach(key => {
        if (dados[key] !== "configurado" && dados[key] !== "") {
          dadosMerge[key] = dados[key];
        }
      });

      const { error } = await supabase
        .from("integracoes")
        .update({ dados: dadosMerge, ativo: ativo ?? true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (error) return sendError(res, 500, "Erro ao atualizar integração");
    } else {
      const { error } = await supabase
        .from("integracoes")
        .insert([{ restaurant_id, tipo, dados, ativo: ativo ?? true }]);

      if (error) return sendError(res, 500, "Erro ao criar integração");
    }

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// DELETE - Remove integração
app.delete("/api/v1/restaurante/:restaurant_id/integracao/:tipo", async (req, res) => {
  try {
    const { restaurant_id, tipo } = req.params;
    const { error } = await supabase
      .from("integracoes")
      .delete()
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo);
    if (error) return sendError(res, 500, "Erro ao remover integração");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// ===== MARKETPLACE =====
app.get("/api/v1/restaurante/:restaurant_id/marketplace", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const ifood = await getIntegracao(restaurant_id, "ifood");
    const aiqfome = await getIntegracao(restaurant_id, "aiqfome");
    return res.json({
      ifood_api_key: ifood?.api_key ? "configurado" : "",
      aiqfome_api_key: aiqfome?.api_key ? "configurado" : ""
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/marketplace", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { platform, api_key } = req.body;
    if (!platform || !api_key) return sendError(res, 400, "platform e api_key são obrigatórios");
    const allowedPlatforms = ["ifood", "aiqfome"];
    if (!allowedPlatforms.includes(platform)) return sendError(res, 400, "platform inválido");
    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: platform, dados: { api_key }, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });
    return res.json({ success: true, platform });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca config Mercado Pago
app.get("/api/v1/restaurante/:restaurant_id/mp", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("restaurants")
      .select("mp_access_token, mp_device_id")
      .eq("id", restaurant_id)
      .single();
    if (error || !data) return sendError(res, 404, "Restaurante não encontrado");
    return res.json({
      mp_access_token: data.mp_access_token ? "configurado" : "",
      mp_device_id: data.mp_device_id || ""
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva config Mercado Pago
app.patch("/api/v1/restaurante/:restaurant_id/mp", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { mp_access_token, mp_device_id } = req.body;
    if (!mp_access_token || !mp_device_id) 
      return sendError(res, 400, "Access Token e Device ID são obrigatórios");
    const { error } = await supabase
      .from("restaurants")
      .update({ mp_access_token, mp_device_id })
      .eq("id", restaurant_id);
    if (error) return sendError(res, 500, "Erro ao salvar configuração");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// POST - Cria intenção de pagamento na maquininha
app.post("/api/v1/restaurante/:restaurant_id/mp/cobrar", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { order_id, valor, metodo } = req.body; // ← metodo já aqui

    if (!order_id || !valor) 
      return sendError(res, 400, "order_id e valor são obrigatórios");

    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Mercado Pago não configurado");

    const paymentTypeMap = {
      credito: "credit_card",
      debito:  "debit_card",
      pix:     "wallet_purchase"
    };

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}/payment-intents`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: Math.round(valor * 100),
          additional_info: {
            external_reference: order_id,
            print_on_terminal: true
          },
          payment: {
            type: paymentTypeMap[metodo] || "credit_card"
          }
        })
      }
    );

    const mpData = await mpResp.json();

    if (!mpResp.ok) {
      console.error("❌ Erro MP:", mpData);
      return sendError(res, 500, mpData.message || "Erro ao criar cobrança");
    }

    await supabase
      .from("orders")
      .update({ mp_payment_intent_id: mpData.id })
      .eq("id", order_id);

    const intentId = mpData.id;
    let tentativas = 0;
    const MAX = 60;

    const pollInterval = setInterval(async () => {
      tentativas++;
      if (tentativas > MAX) {
        clearInterval(pollInterval);
        console.log(`⏰ Polling expirado para intent ${intentId}`);
        return;
      }

      try {
        const statusResp = await fetch(
          `https://api.mercadopago.com/point/integration-api/payment-intents/${intentId}`,
          { headers: { "Authorization": `Bearer ${config.mp_access_token}` } }
        );
        const statusData = await statusResp.json();
        console.log(`🔄 Polling intent ${intentId}: ${statusData.state}`);

        if (statusData.state === "FINISHED" || statusData.additional_info?.external_reference) {
          const paymentResp = await fetch(
            `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${order_id}`,
            { headers: { "Authorization": `Bearer ${config.mp_access_token}` } }
          );
          const paymentData = await paymentResp.json();
          console.log(`💳 Payment search:`, JSON.stringify(paymentData?.results?.[0]?.status));

          const payment = paymentData?.results?.[0];
          if (payment?.status === "approved") {
            clearInterval(pollInterval);
            const now = new Date().toISOString();
            const { data: updated } = await supabase
              .from("orders")
              .update({
                status: "finished",
                payment_method: payment.payment_type_id || "maquininha",
                delivered_at: now,
                update_at: now
              })
              .eq("id", order_id)
              .select()
              .single();

            if (updated) {
              emitOrderUpdate(updated.restaurant_id, updated);
              console.log(`✅ Pedido ${order_id} finalizado via payment search`);
            }
            return;
          }
        }

        if (statusData.state === "FINISHED") {
          clearInterval(pollInterval);
          const now = new Date().toISOString();
          const { data: updated } = await supabase
            .from("orders")
            .update({
              status: "finished",
              payment_method: statusData.payment?.type || "maquininha",
              delivered_at: now,
              update_at: now
            })
            .eq("id", order_id)
            .select()
            .single();

          if (updated) {
            emitOrderUpdate(updated.restaurant_id, updated);
            console.log(`✅ Pedido ${order_id} finalizado via polling MP`);
          }

        } else if (statusData.state === "CANCELED" || statusData.state === "ERROR") {
          clearInterval(pollInterval);
          const now = new Date().toISOString();
          const { data: updated } = await supabase
            .from("orders")
            .update({ status: "cancelled", update_at: now })
            .eq("id", order_id)
            .select()
            .single();

          if (updated) {
            emitOrderUpdate(updated.restaurant_id, updated);
            console.log(`❌ Pedido ${order_id} cancelado via polling MP`);
          }
        }

      } catch (e) {
        console.warn(`⚠️ Erro no polling MP:`, e.message);
      }
    }, 3000);

    console.log(`💳 Cobrança criada: ${mpData.id} para pedido ${order_id}`);
    return res.json({ success: true, payment_intent_id: mpData.id });

  } catch (err) {
    console.error("❌ Erro em /mp/cobrar:", err);
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/mp/ativar-pdv", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ operating_mode: "PDV" })
      }
    );

    const data = await mpResp.json();
    console.log("🔧 Ativar PDV:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/mp/desativar-pdv", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ operating_mode: "STANDALONE" })
      }
    );

    const data = await mpResp.json();
    console.log("🔧 Desativar PDV:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// DELETE - Cancela intenção de pagamento pendente
app.delete("/api/v1/restaurante/:restaurant_id/mp/cancelar-intent/:intent_id", async (req, res) => {
  try {
    const { restaurant_id, intent_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}/payment-intents/${intent_id}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`
        }
      }
    );

    const data = await mpResp.json();
    console.log("🗑️ Cancelar intent:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Lista intenções pendentes do device
app.get("/api/v1/restaurante/:restaurant_id/mp/intent-atual", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}/payment-intents`,
      {
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`
        }
      }
    );

    const data = await mpResp.json();
    console.log("🔍 Intent atual:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// POST - Webhook do Mercado Pago
app.post("/api/v1/mp/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook MP recebido!");
    console.log("📩 Headers:", JSON.stringify(req.headers));
    console.log("📩 Body:", JSON.stringify(req.body));
    console.log("📩 Query:", JSON.stringify(req.query));
  
    const type = req.body.type || req.body.action || req.query.type;
const dataId = req.body?.data?.id || req.body?.data_id || req.query?.["data.id"] || req.query?.data_id;
    
    console.log("📩 Type:", type, "| Data ID:", dataId);
    
    if (!type || !dataId) {
      console.log("⚠️ Webhook sem type ou data_id, ignorando");
      return res.sendStatus(200);
    }

    if (type !== "payment_intent" && type !== "point_integration_wh") return res.sendStatus(200);if (type !== "payment_intent") return res.sendStatus(200);

    const paymentIntentId = dataId;
if (!paymentIntentId) return res.sendStatus(200);

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("mp_payment_intent_id", paymentIntentId)
      .single();

    if (error || !order) {
      console.warn("⚠️ Pedido não encontrado para payment_intent:", paymentIntentId);
      return res.sendStatus(200);
    }

    const config = await getIntegracao(order.restaurant_id, "maquininha");

const statusResp = await fetch(
  `https://api.mercadopago.com/point/integration-api/payment-intents/${paymentIntentId}`,
  {
    headers: { "Authorization": `Bearer ${config.mp_access_token}` }
  }
);

    const statusData = await statusResp.json();
    console.log("💳 Status MP:", statusData.state);

    if (statusData.state === "FINISHED") {
      const now = new Date().toISOString();
      const { data: updated } = await supabase
        .from("orders")
        .update({
          status: "finished",
          payment_method: statusData.payment?.type || "maquininha",
          delivered_at: now,
          update_at: now
        })
        .eq("id", order.id)
        .select()
        .single();

      if (updated) {
        emitOrderUpdate(order.restaurant_id, updated);
        console.log(`✅ Pedido ${order.order_number} finalizado via MP`);
      }

    } else if (statusData.state === "CANCELED" || statusData.state === "ERROR") {
      const now = new Date().toISOString();
      const { data: updated } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          update_at: now
        })
        .eq("id", order.id)
        .select()
        .single();

      if (updated) {
        emitOrderUpdate(order.restaurant_id, updated);
        console.log(`❌ Pedido ${order.order_number} cancelado via MP`);
      }
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Erro no webhook MP:", err);
    return res.sendStatus(500);
  }
});

// ===== WEBHOOK SATISFAÇÃO =====
async function dispararWebhookSatisfacao(order) {
  try {
    const webhookConfig = await getIntegracao(order.restaurant_id, "webhook_satisfaction");
    const webhookUrl = webhookConfig?.webhook_url;
    if (!webhookUrl) return;

    // Verifica se já foi disparado para esse telefone hoje
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const { data: jaEnviado } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", order.restaurant_id)
      .eq("client_phone", order.client_phone)
      .eq("webhook_satisfaction_sent", true)
      .gte("delivered_at", hoje.toISOString())
      .limit(1);

    if (jaEnviado && jaEnviado.length > 0) {
      console.log(`⚠️ Webhook satisfação já enviado para ${order.client_phone} hoje — ignorando`);
      return;
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        order_number: order.order_number,
        client_name: order.client_name,
        client_phone: order.client_phone,
        total_price: order.total_price,
        itens: order.itens,
        finished_at: order.delivered_at,
        triggered_at: new Date().toISOString()
      })
    });

    console.log(`✅ Webhook satisfação disparado para pedido #${order.order_number}`);
  } catch (err) {
    console.error(`❌ Erro ao disparar webhook satisfação:`, err.message);
  }
}

app.get("/api/v1/restaurante/:restaurant_id/webhook-satisfaction", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "webhook_satisfaction");
return res.json({ success: true, webhook_url: dados?.webhook_url || "" });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/webhook-satisfaction", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { webhook_url } = req.body;

   await supabase.from("integracoes").upsert({
  restaurant_id, tipo: "webhook_satisfaction",
  dados: { webhook_url: webhook_url || null }, ativo: true,
  updated_at: new Date().toISOString()
}, { onConflict: "restaurant_id,tipo" });
return res.json({ success: true });
    
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// ===== WEBHOOK FECHAMENTO DE CAIXA =====
app.get("/api/v1/restaurante/:restaurant_id/webhook-fechamento", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "webhook_fechamento");
    return res.json({ success: true, webhook_url: dados?.webhook_url || "" });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/webhook-fechamento", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { webhook_url } = req.body;
    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: "webhook_fechamento",
      dados: { webhook_url: webhook_url || null }, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca caixa aberto
app.get("/api/v1/caixa/:restaurant_id/aberto", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("caixa")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("status", "aberto")
      .single();
    if (error || !data) return res.json({ aberto: false });
    return res.json({ aberto: true, caixa: data });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// POST - Abre caixa
app.post("/api/v1/caixa/:restaurant_id/abrir", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { operador, turno, fundo_inicial } = req.body;

    // Verifica se já tem caixa aberto
    const { data: existing } = await supabase
      .from("caixa")
      .select("id")
      .eq("restaurant_id", restaurant_id)
      .eq("status", "aberto")
      .single();

    if (existing) return sendError(res, 400, "Já existe um caixa aberto");

    const { data, error } = await supabase
      .from("caixa")
      .insert([{ restaurant_id, operador, turno, fundo_inicial: fundo_inicial || 0 }])
      .select().single();

    if (error) return sendError(res, 500, "Erro ao abrir caixa");
io.to(restaurant_id).emit("caixa_atualizado", { status: "aberto", caixa: data });
return res.status(201).json({ success: true, caixa: data });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// POST - Fecha caixa
app.post("/api/v1/caixa/:restaurant_id/fechar", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { valor_informado, obs } = req.body;

    const { data: caixa, error } = await supabase
      .from("caixa")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("status", "aberto")
      .single();

    if (error || !caixa) return sendError(res, 404, "Nenhum caixa aberto");

    const { error: updateError } = await supabase
      .from("caixa")
      .update({ status: "fechado", fechado_at: new Date().toISOString(), valor_informado })
      .eq("id", caixa.id);

   if (updateError) return sendError(res, 500, "Erro ao fechar caixa");
io.to(restaurant_id).emit("caixa_atualizado", { status: "fechado" });

    // Dispara webhook de fechamento
    const webhookConfig = await getIntegracao(restaurant_id, "webhook_fechamento");
    const webhookUrl = webhookConfig?.webhook_url;
   if (webhookUrl) {
  const totalMovimentado = caixa.valor_dinheiro + caixa.valor_pix + caixa.valor_credito + caixa.valor_debito + caixa.valor_maquininha;
  
  // Busca métricas do dia para enriquecer o webhook
  let metricas = {};
  try {
  const metResp = await fetch(`http://localhost:${PORT}/api/v1/metrics/${restaurant_id}/resumo-dia?desde=${encodeURIComponent(caixa.created_at)}`);
    if (metResp.ok) metricas = await metResp.json();
  } catch(e) { console.warn("⚠️ Não foi possível buscar métricas:", e.message); }

  fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id,
          operador: caixa.operador,
          turno: caixa.turno,
          fundo_inicial: caixa.fundo_inicial,
          valor_dinheiro: caixa.valor_dinheiro,
          qtd_dinheiro: caixa.qtd_dinheiro,
          valor_pix: caixa.valor_pix,
          qtd_pix: caixa.qtd_pix,
          valor_credito: caixa.valor_credito,
          qtd_credito: caixa.qtd_credito,
          valor_debito: caixa.valor_debito,
          qtd_debito: caixa.qtd_debito,
          valor_maquininha: caixa.valor_maquininha,
          qtd_maquininha: caixa.qtd_maquininha,
          total_movimentado: totalMovimentado,
          total_pedidos: caixa.total_pedidos || 0,
          total_esperado_caixa: caixa.fundo_inicial + (caixa.valor_dinheiro || 0),
          valor_informado: valor_informado || null,
          obs: obs || null,
          ticket_medio: metricas.ticket_medio || 0,
          delivery: metricas.delivery || 0,
          local: metricas.local || 0,
          cancelados: metricas.cancelados || 0,
          aberto_em: caixa.created_at,
          fechado_em: new Date().toISOString(),
          horario_abertura: new Date(caixa.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
          horario_fechamento: new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
        })
      }).catch(e => console.error("Erro webhook fechamento:", e));
    }

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

app.post("/api/v1/caixa/:restaurant_id/webhook-fechamento", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const webhookConfig = await getIntegracao(restaurant_id, "webhook_fechamento");
    const webhookUrl = webhookConfig?.webhook_url;
    if (!webhookUrl) return res.json({ success: true, disparado: false });

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    return res.json({ success: true, disparado: true });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

app.post("/internal/processar-webhooks", async (req, res) => {
  try {
    const duasHorasAtras = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pedidos } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "finished")
      .is("webhook_satisfaction_sent", null)
      .lte("delivered_at", duasHorasAtras)
      .gte("delivered_at", umDiaAtras);

    for (const order of pedidos || []) {
      await dispararWebhookSatisfacao(order);
      await supabase
        .from("orders")
        .update({ webhook_satisfaction_sent: new Date().toISOString() })
        .eq("id", order.id);
    }

    return res.json({ success: true, processados: pedidos?.length || 0 });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

app.get("/api/v1/cardapio/:restaurant_id/item/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("cardapio")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return sendError(res, 404, "Item não encontrado");
  return res.json(data);
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "4.0.0-dashboard-completo"
  });
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error("❌ Erro:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ===== 404 — SEMPRE O ÚLTIMO MIDDLEWARE =====
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Fluxon Backend v4.0 DASHBOARD COMPLETO em http://${HOST}:${PORT}`);
  console.log(`✅ COM origin (IA/PDV/Balcão)`);
  console.log(`✅ SEM tracking_id`);
  console.log(`✅ Métricas avançadas: comparação, IA, clientes, status`);
  console.log(`✅ Timeline com datas dinâmicas - último ponto sempre HOJE`);
});
