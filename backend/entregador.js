/* =====================================================================
   FluxON · ENTREGADORES
   Tudo do app do entregador num arquivo só. O server.js só liga isto:
     import { registrarEntregador, entregadorAoAtualizarPedido } from "./entregador.js";
     registrarEntregador({ app, io, supabase, ... })   (perto do fim)
     entregadorAoAtualizarPedido(order)                 (dentro do emitOrderUpdate)

   Rotas
     App do entregador ....... /api/v1/entregador/...      (token do entregador)
     Operacional ............. /api/v1/entregadores/:rid/... (token do restaurante)
     Cliente (mapa) .......... /api/v1/entrega/acompanhar/:codigo  (público)

   Socket (o mesmo socket.io do Kanban)
     sala "<rid>" ............ Operacional: entregador_posicao, entregadores_mudou, acertos_mudou
     sala "ent:<rid>" ........ apps dos entregadores do restaurante: fila_mudou
     sala "entd:<id>" ........ app de um entregador: minhas_mudou
     sala "acomp:<pedido>" ... página do cliente: posicao, status
===================================================================== */
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

let C = null; // contexto que o server.js passa no registrar

const SEL_PEDIDO = "id, restaurant_id, order_number, client_name, client_phone, status, itens, total_price, taxa_entrega, address, payment_method, notes, created_at, mounting_at, delivering_at, delivered_at, entregador_id, rodada_id, service_type, tracking_token, destino_lat, destino_lng, destino_fonte";
const OTP_MINUTOS = 5, OTP_MINUTOS_CAIXA = 15, OTP_MAX_TENTATIVAS = 5;
const TOKEN_TTL = "30d";
const segredo = () => `${process.env.JWT_SECRET}:entregador`;

/* ---------------- utilidades ---------------- */

const digitos = (v) => String(v ?? "").replace(/\D/g, "");
function telefone55(raw) {
  let d = digitos(raw);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d : null;
}
const hmac = (v) => crypto.createHmac("sha256", segredo()).update(String(v)).digest("hex");
function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const ehDelivery = (o) => String(o?.service_type || "").toLowerCase() === "delivery";
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const moeda = (v) => "R$ " + r2(v).toFixed(2).replace(".", ",");
const depois = (a, b) => Date.parse(a) >= Date.parse(b); // datas do banco vêm com "+00:00", as nossas com "Z"
const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";

// número escrito em texto ("100", "100,00", "1.000,50") → 100 / 1000.5
function numeroTexto(t) {
  const m = String(t || "").match(/\d[\d.,]*/);
  if (!m) return 0;
  let v = m[0];
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  return parseFloat(v) || 0;
}

// o que o entregador tem que fazer com o pagamento do pedido
function pagamentoInfo(o) {
  const total = r2(o.total_price);
  const pm = String(o.payment_method || "").trim();
  const s = pm.toLowerCase();
  if (/pago online/i.test(String(o.notes || ""))) return { tipo: "pago", texto: "Já pago online", cobrar: 0, dinheiro: 0, troco: 0 };
  const tipo = (t) => /dinheiro/.test(t) ? "dinheiro"
    : /pix/.test(t) ? "pix"
    : /cart|credito|crédito|debito|débito|maquininha/.test(t) ? "cartao"
    : /vale|voucher|refei/.test(t) ? "vale" : "outro";

  if (s.includes("+")) { // pagamento dividido: "Dinheiro R$ 20 + Pix R$ 27"
    const partes = s.split("+").map((p) => ({ tipo: tipo(p), valor: numeroTexto(p) }));
    const soma = partes.reduce((a, p) => a + p.valor, 0);
    const fator = soma > 0 ? total / soma : 0;
    const dinheiro = r2(partes.filter((p) => p.tipo === "dinheiro").reduce((a, p) => a + p.valor * fator, 0));
    return { tipo: dinheiro > 0 ? "dinheiro" : "misto", texto: pm, cobrar: total, dinheiro, troco: 0 };
  }
  const t = tipo(s);
  if (t === "dinheiro") {
    const m = s.match(/troco\s*(?:para|pra|p\/)?\s*(?:r\$)?\s*([\d.,]+)/);
    const para = m ? numeroTexto(m[1]) : 0;
    const troco = para > total ? r2(para - total) : 0;
    return { tipo: "dinheiro", texto: troco ? `Dinheiro · troco pra ${moeda(para)}` : "Dinheiro · sem troco", cobrar: total, dinheiro: total, troco, troco_para: para || null };
  }
  if (t === "cartao") return { tipo: "cartao", texto: "Cartão · levar a maquininha", cobrar: total, dinheiro: 0, troco: 0 };
  if (t === "pix") return { tipo: "pix", texto: "Pix na entrega", cobrar: total, dinheiro: 0, troco: 0 };
  return { tipo: t, texto: pm || "Pagamento não informado", cobrar: total, dinheiro: 0, troco: 0 };
}

// "Rua X, 70 - Bairro - Cidade/UF - CEP" → { rua, bairro, resto }
function enderecoPartes(addr) {
  const partes = String(addr || "").split(" - ").map((p) => p.trim()).filter((p) => p && !/^\d{5}-?\d{3}$/.test(p)); // sem o CEP
  return { rua: partes[0] || "", bairro: partes[1] || "", resto: partes.slice(2).join(" · "), completo: String(addr || "") };
}

/* ---------------- casa exata (de graça) ----------------
   1) o cliente toca "Estou em casa" no rastreio → o GPS dele vai pro pedido
   2) o entregador toca "Entregue" na porta → o GPS dele fica salvo pra esse endereço
   Os dois valem pros próximos pedidos do mesmo endereço. Sem nenhum, o app procura pelo endereço escrito. */
const chaveEndereco = (addr) => String(addr || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\b\d{5}-?\d{3}\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const distMetros = (a, b) => { const R = 6371000, rad = (x) => (x * Math.PI) / 180; const dl = rad(b.lat - a.lat), dg = rad(b.lng - a.lng); const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// ponto da casa de cada pedido: o do próprio pedido, ou o salvo pra esse endereço
async function destinos(rid, pedidos) {
  const mapa = new Map();
  const faltam = [];
  for (const o of pedidos || []) {
    if (o.destino_lat != null) mapa.set(o.id, { lat: o.destino_lat, lng: o.destino_lng, fonte: o.destino_fonte || "cliente" });
    else if (o.address) faltam.push(o);
  }
  const chaves = [...new Set(faltam.map((o) => chaveEndereco(o.address)).filter(Boolean))];
  if (chaves.length) {
    const { data } = await C.supabase.from("locais_entrega").select("endereco_chave, lat, lng, fonte").eq("restaurant_id", rid).in("endereco_chave", chaves);
    const porChave = new Map((data || []).map((l) => [l.endereco_chave, l]));
    for (const o of faltam) { const l = porChave.get(chaveEndereco(o.address)); if (l) mapa.set(o.id, { lat: l.lat, lng: l.lng, fonte: l.fonte }); }
  }
  return mapa;
}

// guarda o ponto da casa pra esse endereço (se já tinha um bem diferente, só troca se a fonte nova for o cliente)
async function salvarLocal(rid, addr, telefone, p, fonte) {
  const chave = chaveEndereco(addr);
  if (!chave || !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) return;
  const { data: atual } = await C.supabase.from("locais_entrega").select("lat, lng, fonte").eq("restaurant_id", rid).eq("endereco_chave", chave).maybeSingle();
  if (atual && fonte === "entregador" && distMetros(atual, p) > 300) return; // marcou "Entregue" longe da casa: não estraga o ponto
  await C.supabase.from("locais_entrega").upsert({ restaurant_id: rid, endereco_chave: chave, telefone: digitos(telefone) || null, lat: p.lat, lng: p.lng, fonte, atualizado_em: new Date().toISOString() }, { onConflict: "restaurant_id,endereco_chave" });
}

// o que o app do entregador recebe de cada pedido
function pedidoParaApp(o, destino) {
  const itens = Array.isArray(o.itens) ? o.itens : [];
  const tel = digitos(o.client_phone).replace(/^55(?=\d{10,11}$)/, "");
  return {
    id: o.id,
    numero: o.order_number,
    status: o.status,
    cliente: o.client_name || "Cliente",
    telefone: tel || null,
    endereco: enderecoPartes(o.address),
    total: r2(o.total_price),
    taxa: r2(o.taxa_entrega),
    pagamento: pagamentoInfo(o),
    obs: String(o.notes || "").replace(/\s*\|?\s*✅ PAGO ONLINE \(Pix\)\s*\|?/g, " ").trim(),
    itens: itens.map((i) => ({ nome: i.name || i.nome || i.produto || "Item", qtd: Number(i.qty || i.quantity || i.quantidade || 1) })),
    pronto_em: o.mounting_at || o.created_at,
    saiu_em: o.delivering_at || null,
    entregue_em: o.delivered_at || null,
    rodada_id: o.rodada_id || null,
    destino: destino || (o.destino_lat != null ? { lat: o.destino_lat, lng: o.destino_lng, fonte: o.destino_fonte } : null)
  };
}

// o "dia" do entregador começa às 5h (quem trabalha de madrugada não vira o dia no meio do turno)
function inicioDoDia() {
  const agoraSP = new Date(Date.now() - 3 * 3600 * 1000);
  const d = new Date(Date.UTC(agoraSP.getUTCFullYear(), agoraSP.getUTCMonth(), agoraSP.getUTCDate(), 5 + 3, 0, 0));
  if (agoraSP.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

async function nomeRestaurante(rid) {
  const [{ data: cfg }, { data: r }, tt] = await Promise.all([
    C.supabase.from("restaurante_config").select("nome_exibicao, logo_url, cor_primaria, endereco, telefone").eq("restaurant_id", rid).maybeSingle(),
    C.supabase.from("restaurants").select("name").eq("id", rid).maybeSingle(),
    C.getIntegracao(rid, "tomtom")
  ]);
  return { id: rid, nome: cfg?.nome_exibicao || r?.name || "Restaurante", logo_url: cfg?.logo_url || null, cor: cfg?.cor_primaria || null, endereco: cfg?.endereco || null, telefone: cfg?.telefone || null,
    tomtom: tt?.key || null }; // chave do TomTom do restaurante (mapa e endereços); sem ela, OpenStreetMap
}

async function configDo(rid) {
  const { data } = await C.supabase.from("entregador_config").select("avisar_cliente").eq("restaurant_id", rid).maybeSingle();
  return { avisar_cliente: data ? !!data.avisar_cliente : true };
}

// manda WhatsApp pelo webhook do restaurante (o mesmo dos vales); sem ele, pelo webhook do FluxON
async function whatsApp(rid, nomeRest, nome, telefone, mensagem, source) {
  try {
    const tel = digitos(telefone).replace(/^55(?=\d{10,11}$)/, "");
    if (tel.length < 10) return false;
    const crm = await C.getIntegracao(rid, "webhook_crm");
    const url = crm?.webhook_url || C.OWNER_OTP_WEBHOOK_URL;
    if (!url) { console.error("❌ entregador: nenhum webhook de WhatsApp configurado"); return false; }
    const corpo = crm?.webhook_url
      ? { restaurant_id: rid, restaurant_name: nomeRest, client_name: nome || null, client_phone: tel,
          client_phone_whatsapp: `55${tel}`, message: mensagem, sent_at: new Date().toISOString(), source }
      : { tipo: source, nome: nome || null, telefone: `55${tel}`, mensagem };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(!crm?.webhook_url && C.OWNER_OTP_WEBHOOK_SECRET ? { "x-fluxon-secret": C.OWNER_OTP_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) console.error(`❌ entregador WhatsApp: webhook respondeu ${r.status}`);
    return r.ok;
  } catch (e) {
    console.error("❌ entregador WhatsApp:", e.message);
    return false;
  }
}

/* ---------------- rodadas ---------------- */

// a rodada que está na rua (se ele pegar mais pedidos, entram nela); cria se não tiver
async function rodadaNaRua(rid, entregadorId) {
  const { data: atual } = await C.supabase.from("entregador_rodadas").select("id")
    .eq("entregador_id", entregadorId).eq("status", "na_rua").maybeSingle();
  if (atual) return { id: atual.id, nova: false };
  const { data: nova, error } = await C.supabase.from("entregador_rodadas")
    .insert([{ restaurant_id: rid, entregador_id: entregadorId }]).select("id").single();
  if (!error && nova) return { id: nova.id, nova: true };
  // duas chamadas ao mesmo tempo: a outra criou primeiro
  const { data: outra } = await C.supabase.from("entregador_rodadas").select("id")
    .eq("entregador_id", entregadorId).eq("status", "na_rua").maybeSingle();
  if (outra) return { id: outra.id, nova: false };
  throw new Error("não foi possível abrir a rodada: " + (error?.message || "?"));
}

// rodada sem pedido na rua: fecha. Com dinheiro → "a acertar"; sem dinheiro → já acertada
async function conferirRodada(rodadaId) {
  if (!rodadaId) return;
  const { data: rod } = await C.supabase.from("entregador_rodadas").select("id, restaurant_id, entregador_id, status").eq("id", rodadaId).maybeSingle();
  if (!rod || rod.status !== "na_rua") return;
  const { data: peds } = await C.supabase.from("orders").select("id, status, total_price, payment_method, notes").eq("rodada_id", rodadaId);
  const lista = peds || [];
  if (lista.some((p) => p.status === "delivering")) return; // ainda tem pedido na rua
  const dinheiro = r2(lista.filter((p) => p.status === "finished").reduce((a, p) => a + pagamentoInfo(p).dinheiro, 0));
  const agora = new Date().toISOString();
  if (!lista.length) { // ficou vazia (devolveu / tiraram tudo): some
    await C.supabase.from("entregador_rodadas").delete().eq("id", rodadaId).eq("status", "na_rua");
  } else {
    await C.supabase.from("entregador_rodadas").update(dinheiro > 0
      ? { status: "a_acertar", voltou_em: agora, dinheiro }
      : { status: "acertada", voltou_em: agora, dinheiro: 0, valor_recebido: 0, acertada_em: agora, acertada_por: "automático (sem dinheiro)" })
      .eq("id", rodadaId).eq("status", "na_rua");
  }
  C.io.to(rod.restaurant_id).emit("acertos_mudou");
  C.io.to(`entd:${rod.entregador_id}`).emit("minhas_mudou");
}

/* ---------------- quando qualquer pedido muda (chamado pelo emitOrderUpdate) ---------------- */

async function aoAtualizar(order) {
  if (!order?.id || !order.restaurant_id || !ehDelivery(order)) return;
  const rid = order.restaurant_id;
  // apps dos entregadores: a fila muda na hora (pedido ficou pronto, saiu, voltou, cancelou)
  C.io.to(`ent:${rid}`).emit("fila_mudou", { id: order.id, status: order.status, entregador_id: order.entregador_id || null });
  // página do cliente
  C.io.to(`acomp:${order.id}`).emit("status", { status: order.status, delivered_at: order.delivered_at || null });

  if (order.entregador_id) {
    C.io.to(`entd:${order.entregador_id}`).emit("minhas_mudou", { id: order.id, status: order.status });
    _cacheAtivos.delete(order.entregador_id);
    // o caixa voltou o pedido pra "pronto"/"preparo": sai do entregador e volta pra fila
    if (["pending", "preparing", "mounting"].includes(order.status)) {
      const { data: limpo } = await C.supabase.from("orders").update({ entregador_id: null, rodada_id: null })
        .eq("id", order.id).eq("status", order.status).select().maybeSingle();
      if (limpo) {
        C.io.to(rid).emit("order_updated", limpo); // o Kanban tira o "🛵 nome" do card
        C.io.to(`ent:${rid}`).emit("fila_mudou", { id: order.id, status: order.status, entregador_id: null });
      }
      await conferirRodada(order.rodada_id);
    } else if (["finished", "cancelled", "canceled"].includes(order.status)) {
      await conferirRodada(order.rodada_id);
      const { data: resto } = await C.supabase.from("orders").select("id").eq("entregador_id", order.entregador_id).eq("status", "delivering");
      for (const o of resto || []) C.io.to(`acomp:${o.id}`).emit("atualizar");
      if (order.status === "finished") avisarProximo(rid, order.entregador_id).catch((e) => console.error("⚠️ aviso 'você é o próximo':", e.message));
    }
  }
}

/* ---------------- localização ---------------- */

const _ultimaPos = new Map();   // entregadorId → { lat, lng, em, salvoEm, enviadoEm }
const _cacheAtivos = new Map(); // entregadorId → { ids, em } (pedidos na rua, pra mandar a posição pra página de cada cliente)

async function pedidosNaRua(entregadorId) {
  const c = _cacheAtivos.get(entregadorId);
  if (c && Date.now() - c.em < 10000) return c.ids;
  const { data } = await C.supabase.from("orders").select("id").eq("entregador_id", entregadorId).eq("status", "delivering");
  const ids = (data || []).map((o) => o.id);
  _cacheAtivos.set(entregadorId, { ids, em: Date.now() });
  return ids;
}

async function receberPosicao(ent, p) {
  const lat = Number(p?.lat), lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
  const agora = Date.now();
  const ult = _ultimaPos.get(ent.id) || {};
  if (ult.enviadoEm && agora - ult.enviadoEm < 1500) return; // no máximo 1 a cada 1,5s
  const pos = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, precisao: Math.round(Number(p.precisao) || 0) || null, rumo: Number.isFinite(Number(p.rumo)) ? Math.round(Number(p.rumo)) : null, em: new Date(agora).toISOString() };
  _ultimaPos.set(ent.id, { ...pos, salvoEm: ult.salvoEm || 0, enviadoEm: agora });

  C.io.to(ent.rid).emit("entregador_posicao", { id: ent.id, nome: ent.nome, ...pos });
  for (const oid of await pedidosNaRua(ent.id)) C.io.to(`acomp:${oid}`).emit("posicao", pos);

  if (agora - (ult.salvoEm || 0) > 15000) { // guarda no banco a cada 15s (quem abrir a página depois já vê onde está)
    _ultimaPos.get(ent.id).salvoEm = agora;
    C.supabase.from("entregadores").update({ lat: pos.lat, lng: pos.lng, posicao_em: pos.em, visto_em: pos.em }).eq("id", ent.id)
      .then(({ error }) => error && console.error("⚠️ posição do entregador:", error.message));
  }
}

/* ---------------- autenticação ---------------- */

async function lerEntregador(token) {
  const p = jwt.verify(token, segredo(), { algorithms: ["HS256"] });
  if (p.scope !== "entregador" || !p.sub) throw new Error("escopo");
  const { data: e } = await C.supabase.from("entregadores")
    .select("id, restaurant_id, nome, telefone, tipo_pagamento, valor_diaria, ativo, disponivel, token_version").eq("id", p.sub).maybeSingle();
  if (!e || !e.ativo || (e.token_version || 0) !== (p.v || 0) || e.restaurant_id !== p.rid) throw new Error("inativo");
  return e;
}

async function exigirEntregador(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) return res.status(401).json({ error: "Entre de novo no app" });
    req.ent = await lerEntregador(h.slice(7));
    return next();
  } catch {
    return res.status(401).json({ error: "Sessão expirada. Entre de novo no app." });
  }
}

// rotas do Operacional: sempre exigem o login do restaurante (mesmo com AUTH_MODE=log)
function exigirRestaurante(req, res, next) {
  const a = C.readAuth(req);
  if (a?.kind === "service" || (a?.kind === "user" && a.restaurant_id === req.params.restaurant_id)) { req.auth = a; return next(); }
  return res.status(401).json({ error: "Não autorizado" });
}

const assinar = (e) => jwt.sign({ sub: e.id, rid: e.restaurant_id, scope: "entregador", v: e.token_version || 0 }, segredo(), { expiresIn: TOKEN_TTL });

async function criarCodigo(tel, minutos) {
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await C.supabase.from("entregador_otp").update({ usado: true }).eq("telefone", tel).eq("usado", false);
  const { error } = await C.supabase.from("entregador_otp").insert([{
    telefone: tel, code_hash: hmac(`${tel}:${codigo}`), expires_at: new Date(Date.now() + minutos * 60000).toISOString()
  }]);
  if (error) throw new Error(error.message);
  return codigo;
}

/* ---------------- pegar / mandar pedidos ---------------- */

// pega os pedidos de uma vez só no banco: um UPDATE com "ainda está pronto e sem entregador".
// Dois entregadores tocando no mesmo pedido: o banco só deixa o primeiro levar.
async function levarPedidos(rid, ent, ids, { peloCaixa = false } = {}) {
  // pelo caixa: guarda com quem estava cada pedido (pra avisar o entregador antigo e não mandar WhatsApp de novo)
  let antes = [];
  if (peloCaixa) {
    const { data } = await C.supabase.from("orders").select("id, status, entregador_id, rodada_id").in("id", ids).eq("restaurant_id", rid);
    antes = (data || []).filter((o) => o.entregador_id !== ent.id);
    ids = antes.map((o) => o.id);
    if (!ids.length) return [];
  }
  const rod = await rodadaNaRua(rid, ent.id);
  const agora = new Date().toISOString();
  let q = C.supabase.from("orders")
    .update({ entregador_id: ent.id, rodada_id: rod.id, status: "delivering", delivering_at: agora, update_at: agora })
    .in("id", ids).eq("restaurant_id", rid).ilike("service_type", "delivery");
  q = peloCaixa ? q.in("status", ["mounting", "delivering"]) : q.eq("status", "mounting").is("entregador_id", null);
  const { data: levados, error } = await q.select();
  if (error) throw new Error(error.message);
  const pegos = levados || [];

  if (!pegos.length && rod.nova) await C.supabase.from("entregador_rodadas").delete().eq("id", rod.id).eq("status", "na_rua");
  _cacheAtivos.delete(ent.id);

  // some da tela dos outros entregadores na hora
  if (pegos.length) C.io.to(`ent:${rid}`).emit("fila_saiu", { ids: pegos.map((p) => p.id), entregador_id: ent.id });
  for (const o of pegos) C.emitOrderUpdate(rid, o); // Kanban: card vai pra "a caminho" com o nome dele

  // pedido que já estava com outro entregador (o caixa trocou): avisa o antigo e confere a rodada dele
  const levadosIds = new Set(pegos.map((p) => p.id));
  const trocados = antes.filter((o) => levadosIds.has(o.id) && o.entregador_id);
  for (const o of trocados) { _cacheAtivos.delete(o.entregador_id); C.io.to(`entd:${o.entregador_id}`).emit("minhas_mudou", { id: o.id, tirado: true }); }
  for (const rodId of new Set(trocados.map((o) => o.rodada_id).filter(Boolean))) await conferirRodada(rodId);

  // avisa o cliente no WhatsApp (só quem estava saindo agora, não quem só trocou de entregador)
  const saindoAgora = peloCaixa ? pegos.filter((p) => antes.find((a) => a.id === p.id)?.status === "mounting") : pegos;
  avisarClientes(rid, ent, saindoAgora).catch((e) => console.error("⚠️ aviso saiu pra entrega:", e.message));
  return pegos;
}

const _jaAvisados = new Set();
// link do rastreio: abre o app de pedidos (cardápio delivery) do restaurante, que vira a tela de rastreio.
// Sem domínio próprio, abre a página do mapa do app dos entregadores.
async function linkRastreio(rid, o) {
  const { data: r } = await C.supabase.from("restaurants").select("cardapio_delivery_url").eq("id", rid).maybeSingle();
  const dominio = String(r?.cardapio_delivery_url || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const base = String(process.env.ENTREGADOR_APP_URL || "").replace(/\/+$/, "");
  if (!dominio && !base) return "";
  let tk = o.tracking_token;
  if (!tk) { tk = crypto.randomBytes(10).toString("hex"); await C.supabase.from("orders").update({ tracking_token: tk }).eq("id", o.id); }
  return dominio ? `https://${dominio}/?acompanhar=${tk}` : `${base}/acompanhar.html?c=${tk}`;
}

// entregou um pedido: o próximo da rota recebe "você é o próximo"
const _jaProximo = new Set();
async function avisarProximo(rid, entregadorId) {
  const { data: prox } = await C.supabase.from("orders").select("id, order_number, client_name, client_phone, tracking_token, ordem_rota")
    .eq("entregador_id", entregadorId).eq("status", "delivering").not("ordem_rota", "is", null)
    .order("ordem_rota", { ascending: true }).limit(1).maybeSingle();
  if (!prox || !prox.client_phone || _jaProximo.has(prox.id)) return;
  _jaProximo.add(prox.id);
  if (_jaProximo.size > 5000) _jaProximo.clear();
  if (!(await configDo(rid)).avisar_cliente) return;
  const [rest, { data: ent }] = await Promise.all([nomeRestaurante(rid), C.supabase.from("entregadores").select("nome").eq("id", entregadorId).maybeSingle()]);
  const link = await linkRastreio(rid, prox);
  const nome = primeiroNome(prox.client_name);
  await whatsApp(rid, rest.nome, prox.client_name, prox.client_phone,
    `🛵 ${nome ? nome + ", v" : "V"}ocê é o próximo! ${primeiroNome(ent?.nome) || "O entregador"} está indo agora até você com o pedido #${prox.order_number}.${link ? `\n\nAcompanhe no mapa: ${link}` : ""}`,
    "proximo_da_entrega");
}

async function avisarClientes(rid, ent, pedidos) {
  if (!pedidos.length) return;
  const cfg = await configDo(rid);
  if (!cfg.avisar_cliente) return;
  const rest = await nomeRestaurante(rid);
  for (const o of pedidos) {
    if (_jaAvisados.has(o.id) || !o.client_phone) continue;
    _jaAvisados.add(o.id);
    if (_jaAvisados.size > 5000) _jaAvisados.clear();
    const url = await linkRastreio(rid, o);
    const link = url ? `\n\nAcompanhe a entrega: ${url}` : "";
    const nome = primeiroNome(o.client_name);
    const pg = pagamentoInfo(o);
    const lembrete = pg.tipo === "dinheiro" && pg.troco ? `\nO ${primeiroNome(ent.nome)} já leva o seu troco.` : "";
    await whatsApp(rid, rest.nome, o.client_name, o.client_phone,
      `🛵 ${nome ? nome + ", s" : "S"}eu pedido #${o.order_number} do ${rest.nome} saiu para entrega com ${primeiroNome(ent.nome)}!${lembrete}${link}`,
      "saiu_para_entrega");
  }
}

/* ---------------- ganhos ---------------- */

function ganhosDe(ent, entregues, apareceuHoje) {
  const taxas = r2(entregues.reduce((a, o) => a + (Number(o.taxa_entrega) || 0), 0));
  const temDiaria = ent.tipo_pagamento !== "entrega" && (entregues.length > 0 || apareceuHoje);
  const diaria = temDiaria ? r2(ent.valor_diaria) : 0;
  const porEntrega = ent.tipo_pagamento === "diaria" ? 0 : taxas;
  return { entregas: entregues.length, taxas, diaria, por_entrega: porEntrega, total: r2(diaria + porEntrega), tipo_pagamento: ent.tipo_pagamento, valor_diaria: r2(ent.valor_diaria) };
}

/* =====================================================================
   REGISTRO
===================================================================== */

export function entregadorAoAtualizarPedido(order) {
  if (!C) return;
  aoAtualizar(order).catch((e) => console.error("⚠️ entregador (pedido atualizado):", e.message));
}

export function registrarEntregador(ctx) {
  C = ctx;
  const { app, io, supabase } = ctx;
  const erro = (res, status, msg, e) => { if (e) console.error(`❌ entregador: ${msg}:`, e.message || e); return res.status(status).json({ error: msg }); };

  // o app do entregador (e a página do cliente) ficam num domínio próprio: libera no CORS
  const url = String(process.env.ENTREGADOR_APP_URL || "").replace(/\/+$/, "");
  for (const o of [url, "https://kds-entregador.dahead.easypanel.host"]) if (o && !ctx.ALLOWED_ORIGINS_FIXED.includes(o)) ctx.ALLOWED_ORIGINS_FIXED.push(o);

  const limSolicitar = rateLimit({ windowMs: 60000, max: 5, message: { error: "Muitas tentativas. Aguarde 1 minuto." }, standardHeaders: true, legacyHeaders: false });
  const limVerificar = rateLimit({ windowMs: 60000, max: 10, message: { error: "Muitas tentativas. Aguarde 1 minuto." }, standardHeaders: true, legacyHeaders: false });
  const limApp = rateLimit({ windowMs: 60000, max: 240, message: { error: "Muitas requisições. Aguarde um instante." }, standardHeaders: true, legacyHeaders: false });

  /* ---------- socket ---------- */
  io.on("connection", (socket) => {
    const tk = socket.handshake.auth?.entregador;
    if (tk) {
      lerEntregador(tk).then((e) => {
        socket.data.ent = { id: e.id, rid: e.restaurant_id, nome: e.nome };
        socket.join(`ent:${e.restaurant_id}`);
        socket.join(`entd:${e.id}`);
        supabase.from("entregadores").update({ visto_em: new Date().toISOString() }).eq("id", e.id).then(() => {});
        io.to(e.restaurant_id).emit("entregadores_mudou");
        socket.emit("entregador_ok");
      }).catch(() => socket.emit("entregador_sair"));
    }
    socket.on("posicao", (p) => { if (socket.data.ent) receberPosicao(socket.data.ent, p).catch(() => {}); });
    // o app do entregador manda a ordem da rota: o cliente vê quantas entregas faltam antes da dele
    socket.on("rota", async (d) => {
      const ent = socket.data.ent;
      const ids = Array.isArray(d?.ordem) ? d.ordem.map(String).slice(0, 30) : [];
      if (!ent || !ids.length) return;
      for (const [i, id] of ids.entries()) await supabase.from("orders").update({ ordem_rota: i + 1 }).eq("id", id).eq("entregador_id", ent.id).eq("status", "delivering");
      for (const id of ids) io.to(`acomp:${id}`).emit("atualizar");
    });
    socket.on("acompanhar", async (codigo) => {
      if (!/^[a-f0-9]{20}$/.test(String(codigo || ""))) return;
      const { data: o } = await supabase.from("orders").select("id").eq("tracking_token", codigo).maybeSingle();
      if (o) socket.join(`acomp:${o.id}`);
    });
    socket.on("disconnect", () => { if (socket.data.ent) io.to(socket.data.ent.rid).emit("entregadores_mudou"); });
  });

  /* =================== APP DO ENTREGADOR =================== */

  app.post("/api/v1/entregador/auth/solicitar", limSolicitar, async (req, res) => {
    const ok = { success: true, message: "Se esse número estiver cadastrado, o código chega no WhatsApp em instantes." };
    try {
      const tel = telefone55(req.body?.telefone);
      if (!tel) return res.status(400).json({ error: "Digite o seu WhatsApp com DDD" });
      const { data: lista } = await supabase.from("entregadores").select("id, restaurant_id, nome").eq("telefone", tel).eq("ativo", true);
      if (!lista?.length) return res.json(ok);
      const umaHora = new Date(Date.now() - 3600000).toISOString();
      const { data: recentes } = await supabase.from("entregador_otp").select("created_at").eq("telefone", tel).gte("created_at", umaHora).order("created_at", { ascending: false });
      if ((recentes || []).length >= 6) return res.json(ok);
      if (recentes?.[0] && Date.now() - new Date(recentes[0].created_at).getTime() < 40000) return res.json(ok);
      const codigo = await criarCodigo(tel, OTP_MINUTOS);
      const rest = await nomeRestaurante(lista[0].restaurant_id);
      await whatsApp(lista[0].restaurant_id, rest.nome, lista[0].nome, tel,
        `Seu código de acesso ao app de entregas do ${rest.nome} é *${codigo}*. Vale por ${OTP_MINUTOS} minutos. Não passe pra ninguém.`, "entregador_codigo");
      return res.json(ok);
    } catch (e) { return erro(res, 500, "Não deu pra enviar o código agora", e); }
  });

  app.post("/api/v1/entregador/auth/verificar", limVerificar, async (req, res) => {
    const invalido = () => res.status(401).json({ error: "Código errado ou vencido. Peça outro." });
    try {
      const tel = telefone55(req.body?.telefone);
      const codigo = digitos(req.body?.codigo);
      if (!tel || codigo.length !== 6) return invalido();
      const { data: otp } = await supabase.from("entregador_otp").select("id, code_hash, tentativas")
        .eq("telefone", tel).eq("usado", false).gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!otp || otp.tentativas >= OTP_MAX_TENTATIVAS) return invalido();
      if (!igual(hmac(`${tel}:${codigo}`), otp.code_hash)) {
        await supabase.from("entregador_otp").update({ tentativas: otp.tentativas + 1 }).eq("id", otp.id);
        return invalido();
      }
      const { data: usado } = await supabase.from("entregador_otp").update({ usado: true }).eq("id", otp.id).eq("usado", false).select("id");
      if (!usado?.length) return invalido();
      const { data: lista } = await supabase.from("entregadores").select("id, restaurant_id, nome, token_version").eq("telefone", tel).eq("ativo", true);
      if (!lista?.length) return invalido();
      await supabase.from("entregadores").update({ ultimo_login: new Date().toISOString() }).eq("telefone", tel).eq("ativo", true);
      const contas = await Promise.all(lista.map(async (e) => ({ token: assinar(e), entregador: { id: e.id, nome: e.nome }, restaurante: await nomeRestaurante(e.restaurant_id) })));
      return res.json({ success: true, contas });
    } catch (e) { return erro(res, 500, "Não deu pra entrar agora", e); }
  });

  app.use("/api/v1/entregador", (req, res, next) => req.path.startsWith("/auth/") ? next() : limApp(req, res, () => exigirEntregador(req, res, next)));

  app.get("/api/v1/entregador/eu", async (req, res) => {
    const e = req.ent;
    return res.json({
      entregador: { id: e.id, nome: e.nome, telefone: e.telefone, tipo_pagamento: e.tipo_pagamento, valor_diaria: r2(e.valor_diaria), disponivel: !!e.disponivel },
      restaurante: await nomeRestaurante(e.restaurant_id)
    });
  });

  app.patch("/api/v1/entregador/disponivel", async (req, res) => {
    const disponivel = !!req.body?.disponivel;
    const { error } = await supabase.from("entregadores").update({ disponivel, visto_em: new Date().toISOString() }).eq("id", req.ent.id);
    if (error) return erro(res, 500, "Não deu pra salvar", error);
    io.to(req.ent.restaurant_id).emit("entregadores_mudou");
    return res.json({ success: true, disponivel });
  });

  // pedidos prontos esperando entregador + quantos ainda estão sendo feitos
  app.get("/api/v1/entregador/fila", async (req, res) => {
    const rid = req.ent.restaurant_id;
    const [{ data: prontos, error }, { count }] = await Promise.all([
      supabase.from("orders").select(SEL_PEDIDO).eq("restaurant_id", rid).eq("status", "mounting").is("entregador_id", null)
        .ilike("service_type", "delivery").order("mounting_at", { ascending: true }).limit(80),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).in("status", ["pending", "preparing"]).ilike("service_type", "delivery")
    ]);
    if (error) return erro(res, 500, "Não deu pra carregar os pedidos", error);
    const dest = await destinos(rid, prontos);
    return res.json({ prontos: (prontos || []).map((o) => pedidoParaApp(o, dest.get(o.id))), em_preparo: count || 0 });
  });

  // o que está com ele agora + rodadas esperando acerto
  app.get("/api/v1/entregador/minhas", async (req, res) => {
    const e = req.ent;
    const [{ data: naRua, error }, { data: rodadas }] = await Promise.all([
      supabase.from("orders").select(SEL_PEDIDO).eq("entregador_id", e.id).eq("status", "delivering").order("delivering_at", { ascending: true }),
      supabase.from("entregador_rodadas").select("id, status, saiu_em, voltou_em, dinheiro").eq("entregador_id", e.id).in("status", ["na_rua", "a_acertar"]).order("saiu_em", { ascending: true })
    ]);
    if (error) return erro(res, 500, "Não deu pra carregar suas entregas", error);
    const ids = (rodadas || []).filter((r) => r.status === "a_acertar").map((r) => r.id);
    let pedidosAcerto = [];
    if (ids.length) {
      const { data } = await supabase.from("orders").select("id, order_number, rodada_id, total_price, payment_method, notes, status").in("rodada_id", ids).eq("status", "finished");
      pedidosAcerto = data || [];
    }
    return res.json({
      na_rua: await (async () => { const dest = await destinos(e.restaurant_id, naRua); return (naRua || []).map((o) => pedidoParaApp(o, dest.get(o.id))); })(),
      acertos: (rodadas || []).filter((r) => r.status === "a_acertar").map((r) => ({
        id: r.id, voltou_em: r.voltou_em, dinheiro: r2(r.dinheiro),
        pedidos: pedidosAcerto.filter((p) => p.rodada_id === r.id && pagamentoInfo(p).dinheiro > 0).map((p) => ({ numero: p.order_number, dinheiro: pagamentoInfo(p).dinheiro }))
      }))
    });
  });

  app.post("/api/v1/entregador/pegar", async (req, res) => {
    try {
      const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String))].slice(0, 30);
      if (!ids.length) return res.status(400).json({ error: "Escolha pelo menos um pedido" });
      const pegos = await levarPedidos(req.ent.restaurant_id, req.ent, ids);
      const ok = new Set(pegos.map((p) => p.id));
      return res.json({ pegos: pegos.map(pedidoParaApp), perdidos: ids.filter((id) => !ok.has(id)) });
    } catch (e) { return erro(res, 500, "Não deu pra pegar os pedidos", e); }
  });

  app.post("/api/v1/entregador/entregue", async (req, res) => {
    try {
      const id = String(req.body?.id || "");
      const { data: o } = await supabase.from("orders").select("id, status, entregador_id, restaurant_id, address, client_phone").eq("id", id).maybeSingle();
      if (!o || o.entregador_id !== req.ent.id) return res.status(404).json({ error: "Esse pedido não está com você" });
      // tocou "Entregue" na porta: o GPS dele vira a casa desse endereço (só se o sinal estiver bom)
      const gps = { lat: Number(req.body?.lat), lng: Number(req.body?.lng) };
      if (Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && Number(req.body?.precisao ?? 999) <= 60 && o.address)
        salvarLocal(o.restaurant_id, o.address, o.client_phone, gps, "entregador").catch((e) => console.error("⚠️ salvar casa:", e.message));
      if (o.status === "finished") return res.json({ success: true });
      if (o.status !== "delivering") return res.status(409).json({ error: "Esse pedido não está mais em entrega" });
      // finaliza pela mesma rota do Kanban: caixa, nota fiscal e pesquisa de satisfação continuam iguais
      const tk = jwt.sign({ restaurant_id: o.restaurant_id }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "2m" });
      try {
        const r = await fetch(`http://127.0.0.1:${ctx.PORT}/orders/${encodeURIComponent(id)}/status`, {
          method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
          body: JSON.stringify({ status: "finished" }), signal: AbortSignal.timeout(15000)
        });
        if (!r.ok) console.error(`❌ entregador: rota do Kanban respondeu ${r.status} ao finalizar ${id}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
      } catch (e) { console.error(`❌ entregador: rota do Kanban falhou ao finalizar ${id} (porta ${ctx.PORT}):`, e.message); }
      // confere no banco: se não ficou finalizado, finaliza direto (Kanban e cliente ficam sabendo na hora)
      const { data: depois } = await supabase.from("orders").select("status").eq("id", id).maybeSingle();
      if (depois?.status !== "finished") {
        const agora = new Date().toISOString();
        const { data: fim, error: eFim } = await supabase.from("orders").update({ status: "finished", delivered_at: agora, update_at: agora, pagamento_parcial: null })
          .eq("id", id).eq("status", "delivering").select().maybeSingle();
        if (eFim || !fim) return erro(res, 500, "Não deu pra finalizar o pedido. Tente de novo.", eFim || new Error("o pedido mudou"));
        C.emitOrderUpdate(fim.restaurant_id, fim);
        console.warn(`⚠️ entregador: pedido #${fim.order_number} finalizado direto (o caixa não somou por essa via)`);
      }
      _cacheAtivos.delete(req.ent.id);
      return res.json({ success: true });
    } catch (e) { return erro(res, 500, "Não deu pra finalizar o pedido. Tente de novo.", e); }
  });

  // não conseguiu entregar: o pedido volta pro restaurante como "pronto"
  app.post("/api/v1/entregador/devolver", async (req, res) => {
    try {
      const id = String(req.body?.id || "");
      const motivo = String(req.body?.motivo || "").trim().slice(0, 140);
      const { data: o } = await supabase.from("orders").select("id, status, entregador_id, rodada_id, notes").eq("id", id).maybeSingle();
      if (!o || o.entregador_id !== req.ent.id || o.status !== "delivering") return res.status(404).json({ error: "Esse pedido não está com você" });
      const nota = `⚠️ ${primeiroNome(req.ent.nome)} voltou com o pedido${motivo ? ": " + motivo : ""}`;
      const { data: volta } = await supabase.from("orders")
        .update({ status: "mounting", entregador_id: null, rodada_id: null, notes: [o.notes, nota].filter(Boolean).join(" | "), update_at: new Date().toISOString() })
        .eq("id", id).eq("status", "delivering").eq("entregador_id", req.ent.id).select().maybeSingle();
      if (!volta) return res.status(409).json({ error: "Esse pedido mudou. Atualize a tela." });
      _cacheAtivos.delete(req.ent.id);
      C.emitOrderUpdate(volta.restaurant_id, volta);
      await conferirRodada(o.rodada_id);
      return res.json({ success: true });
    } catch (e) { return erro(res, 500, "Não deu pra devolver o pedido", e); }
  });

  // "Meu dia": entregas, quanto vai receber e as rodadas
  app.get("/api/v1/entregador/dia", async (req, res) => {
    const e = req.ent, desde = inicioDoDia();
    const [{ data: entregues, error }, { data: rodadas }, { data: eu }] = await Promise.all([
      supabase.from("orders").select("id, order_number, client_name, address, taxa_entrega, total_price, delivered_at").eq("entregador_id", e.id).eq("status", "finished").gte("delivered_at", desde).order("delivered_at", { ascending: false }),
      supabase.from("entregador_rodadas").select("id, status, saiu_em, voltou_em, dinheiro, valor_recebido, acertada_em").eq("entregador_id", e.id).gte("saiu_em", desde).order("saiu_em", { ascending: false }),
      supabase.from("entregadores").select("visto_em").eq("id", e.id).maybeSingle()
    ]);
    if (error) return erro(res, 500, "Não deu pra carregar o seu dia", error);
    return res.json({
      desde,
      ganhos: ganhosDe(e, entregues || [], !!(eu?.visto_em && depois(eu.visto_em, desde))),
      entregas: (entregues || []).map((o) => ({ numero: o.order_number, cliente: primeiroNome(o.client_name), bairro: enderecoPartes(o.address).bairro, taxa: r2(o.taxa_entrega), em: o.delivered_at })),
      rodadas: (rodadas || []).map((r) => ({ id: r.id, status: r.status, saiu_em: r.saiu_em, voltou_em: r.voltou_em, dinheiro: r2(r.dinheiro), recebido: r.valor_recebido == null ? null : r2(r.valor_recebido) }))
    });
  });

  /* =================== PÁGINA DO CLIENTE (mapa) =================== */

  app.get("/api/v1/entrega/acompanhar/:codigo", async (req, res) => {
    try {
      const codigo = String(req.params.codigo || "");
      if (!/^[a-f0-9]{20}$/.test(codigo)) return res.status(404).json({ error: "Pedido não encontrado" });
      const { data: o } = await supabase.from("orders").select("id, restaurant_id, order_number, client_name, status, address, created_at, confirmed_at, preparing_at, mounting_at, delivering_at, delivered_at, cancelled_at, entregador_id, ordem_rota, service_type, total_price, itens, destino_lat, destino_lng, destino_fonte")
        .eq("tracking_token", codigo).maybeSingle();
      if (!o) return res.status(404).json({ error: "Pedido não encontrado" });
      let entregador = null, posicao = null, antes = null;
      if (o.entregador_id && o.status === "delivering" && o.ordem_rota) {
        const { count } = await supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("entregador_id", o.entregador_id).eq("status", "delivering").lt("ordem_rota", o.ordem_rota);
        antes = count || 0;
      }
      if (o.entregador_id) {
        const { data: e } = await supabase.from("entregadores").select("id, nome, lat, lng, posicao_em").eq("id", o.entregador_id).maybeSingle();
        if (e) {
          entregador = { nome: primeiroNome(e.nome) };
          if (o.status === "delivering") {
            const mem = _ultimaPos.get(e.id);
            posicao = mem && (!e.posicao_em || depois(mem.em, e.posicao_em)) ? { lat: mem.lat, lng: mem.lng, em: mem.em, rumo: mem.rumo }
              : (e.lat != null ? { lat: e.lat, lng: e.lng, em: e.posicao_em } : null);
          }
        }
      }
      const rest = await nomeRestaurante(o.restaurant_id);
      return res.json({
        pedido: { numero: o.order_number, cliente: primeiroNome(o.client_name), status: o.status, endereco: o.address || "", saiu_em: o.delivering_at, entregue_em: o.delivered_at, delivery: ehDelivery(o),
          recebido_em: o.confirmed_at || o.created_at, preparo_em: o.preparing_at, pronto_em: o.mounting_at, cancelado_em: o.cancelled_at, total: r2(o.total_price),
          itens: (Array.isArray(o.itens) ? o.itens : []).map((i) => ({ nome: i.name || i.nome || "Item", qtd: Number(i.qty || i.quantity || i.quantidade || 1) })) },
        restaurante: { nome: rest.nome, logo_url: rest.logo_url, cor: rest.cor, endereco: rest.endereco, telefone: rest.telefone, tomtom: rest.tomtom },
        entregador, posicao, antes,
        destino: (await destinos(o.restaurant_id, [o])).get(o.id) || null
      });
    } catch (e) { return erro(res, 500, "Não deu pra carregar o pedido", e); }
  });

  // "Estou em casa": o cliente manda o GPS do celular pro pedido (e fica salvo pros próximos pedidos)
  app.post("/api/v1/entrega/local/:codigo", async (req, res) => {
    try {
      const codigo = String(req.params.codigo || "");
      const p = { lat: Number(req.body?.lat), lng: Number(req.body?.lng) };
      const precisao = Number(req.body?.precisao ?? 999);
      if (!/^[a-f0-9]{20}$/.test(codigo) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
        return res.status(400).json({ error: "Localização inválida" });
      if (precisao > 100) return res.status(400).json({ error: "O sinal do GPS está fraco. Tente de novo perto de uma janela." });
      const { data: o } = await supabase.from("orders").select("id, restaurant_id, status, address, client_phone, entregador_id, created_at").eq("tracking_token", codigo).maybeSingle();
      if (!o || ["finished", "cancelled", "canceled"].includes(o.status) || Date.now() - Date.parse(o.created_at) > 6 * 3600 * 1000)
        return res.status(404).json({ error: "Esse pedido não aceita mais localização" });
      await supabase.from("orders").update({ destino_lat: p.lat, destino_lng: p.lng, destino_fonte: "cliente" }).eq("id", o.id);
      if (o.address) await salvarLocal(o.restaurant_id, o.address, o.client_phone, p, "cliente");
      io.to(`acomp:${o.id}`).emit("atualizar");
      if (o.entregador_id) { _cacheAtivos.delete(o.entregador_id); io.to(`entd:${o.entregador_id}`).emit("minhas_mudou", { id: o.id }); }
      return res.json({ success: true });
    } catch (e) { return erro(res, 500, "Não deu pra salvar sua localização", e); }
  });

  // o cliente entrou na conta (login do WhatsApp no app de pedidos): os pedidos dele em andamento,
  // pra o rastreio aparecer em qualquer aparelho, não só no que fez o pedido
  app.get("/api/v1/cliente/:restaurant_id/pedidos-ativos", async (req, res) => {
    try {
      const token = String(req.get("x-cliente-token") || "").trim();
      if (!token || token.length > 64) return res.json([]);
      const rid = req.params.restaurant_id;
      const { data: cli } = await supabase.from("base_clientes").select("numero").eq("token_fidelidade", token).eq("restaurant_id", rid).maybeSingle();
      const tel = digitos(cli?.numero).replace(/^55(?=\d{10,11}$)/, "");
      if (tel.length < 10) return res.json([]);
      const desde = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      const umaHora = Date.now() - 3600 * 1000;
      const { data } = await supabase.from("orders").select("order_number, status, tracking_token, delivered_at, cancelled_at, created_at")
        .eq("restaurant_id", rid).in("client_phone", [tel, `55${tel}`]).gte("created_at", desde).not("tracking_token", "is", null)
        .neq("status", "draft").order("created_at", { ascending: false }).limit(10);
      return res.json((data || []).filter((o) =>
        !(o.status === "finished" && Date.parse(o.delivered_at || 0) < umaHora) &&
        !(["cancelled", "canceled"].includes(o.status) && Date.parse(o.cancelled_at || 0) < umaHora)
      ).map((o) => ({ codigo: o.tracking_token, numero: o.order_number })));
    } catch (e) { return erro(res, 500, "Não deu pra carregar seus pedidos", e); }
  });

  /* =================== OPERACIONAL =================== */

  const OP = "/api/v1/entregadores/:restaurant_id";
  app.use(OP, exigirRestaurante);

  // lista com quem está na rua, disponível e onde está
  app.get(OP, async (req, res) => {
    const rid = req.params.restaurant_id;
    const [{ data: lista, error }, { data: naRua }] = await Promise.all([
supabase.from("entregadores").select("id, nome, telefone, tipo_pagamento, valor_diaria, valor_entrega, entrega_por_km, ativo, disponivel, lat, lng, posicao_em, visto_em, ultimo_login, created_at").eq("restaurant_id", rid).order("nome"),
      supabase.from("orders").select("id, order_number, entregador_id, address").eq("restaurant_id", rid).eq("status", "delivering").not("entregador_id", "is", null)
    ]);
    if (error) return erro(res, 500, "Não deu pra carregar os entregadores", error);
    const conectados = new Set();
    try { for (const s of await io.in(`ent:${rid}`).fetchSockets()) if (s.data?.ent?.id) conectados.add(s.data.ent.id); } catch {}
    return res.json((lista || []).map((e) => {
      const mem = _ultimaPos.get(e.id);
      const pos = mem && (!e.posicao_em || depois(mem.em, e.posicao_em)) ? { lat: mem.lat, lng: mem.lng, em: mem.em } : (e.lat != null ? { lat: e.lat, lng: e.lng, em: e.posicao_em } : null);
      const pedidos = (naRua || []).filter((o) => o.entregador_id === e.id);
      return {
        id: e.id, nome: e.nome, telefone: e.telefone, tipo_pagamento: e.tipo_pagamento, valor_diaria: r2(e.valor_diaria),
        valor_entrega: r2(e.valor_entrega || 0), entrega_por_km: !!e.entrega_por_km,
        ativo: e.ativo, disponivel: !!e.disponivel, conectado: conectados.has(e.id), visto_em: e.visto_em, ja_entrou: !!e.ultimo_login,
        posicao: pos, na_rua: pedidos.map((o) => ({ id: o.id, numero: o.order_number, bairro: enderecoPartes(o.address).bairro }))
      };
    }));
  });

  app.get(`${OP}/config`, async (req, res) => res.json({ ...(await configDo(req.params.restaurant_id)), link_app: url || null }));
  app.patch(`${OP}/config`, async (req, res) => {
    const { error } = await supabase.from("entregador_config").upsert({ restaurant_id: req.params.restaurant_id, avisar_cliente: !!req.body?.avisar_cliente, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id" });
    if (error) return erro(res, 500, "Não deu pra salvar", error);
    return res.json({ success: true });
  });


  const lerCadastro = (b, parcial) => {
    const d = {};
    if (!parcial || b.nome !== undefined) { const n = String(b.nome || "").trim().slice(0, 60); if (n.length < 2) throw new Error("Digite o nome do entregador"); d.nome = n; }
    if (!parcial || b.telefone !== undefined) { const t = telefone55(b.telefone); if (!t) throw new Error("Digite o WhatsApp com DDD"); d.telefone = t; }
    if (!parcial || b.tipo_pagamento !== undefined) { if (!["entrega", "diaria_entrega", "diaria"].includes(b.tipo_pagamento)) throw new Error("Escolha como ele recebe"); d.tipo_pagamento = b.tipo_pagamento; }
    if (!parcial || b.valor_diaria !== undefined) { const v = r2(String(b.valor_diaria ?? 0).replace(",", ".")); if (v < 0 || v > 10000) throw new Error("Valor da diária inválido"); d.valor_diaria = v; }
    // quanto ele cobra por entrega: valor fixo ou por km (por enquanto só fica anotado, não entra na conta)
    if (!parcial || b.valor_entrega !== undefined) { const v = r2(String(b.valor_entrega ?? 0).replace(",", ".")); if (!(v >= 0 && v <= 1000)) throw new Error("Valor da entrega inválido"); d.valor_entrega = v; }
    if (!parcial || b.entrega_por_km !== undefined) d.entrega_por_km = !!b.entrega_por_km;
    if (b.ativo !== undefined) d.ativo = !!b.ativo;
    if (d.tipo_pagamento === "entrega") d.valor_diaria = 0;
    if (d.tipo_pagamento === "diaria") { d.valor_entrega = 0; d.entrega_por_km = false; }
    return d;
  };

  app.post(OP, async (req, res) => {
    let d; try { d = lerCadastro(req.body || {}, false); } catch (e) { return res.status(400).json({ error: e.message }); }
    const { data, error } = await supabase.from("entregadores").insert([{ ...d, restaurant_id: req.params.restaurant_id }]).select().single();
    if (error) return error.code === "23505" ? res.status(409).json({ error: "Já tem um entregador com esse WhatsApp" }) : erro(res, 500, "Não deu pra salvar", error);
    io.to(req.params.restaurant_id).emit("entregadores_mudou");
    return res.json(data);
  });

  app.patch(`${OP}/:id`, async (req, res) => {
    let d; try { d = lerCadastro(req.body || {}, true); } catch (e) { return res.status(400).json({ error: e.message }); }
    const { data: antes } = await supabase.from("entregadores").select("telefone, ativo, token_version").eq("id", req.params.id).eq("restaurant_id", req.params.restaurant_id).maybeSingle();
    if (!antes) return res.status(404).json({ error: "Entregador não encontrado" });
    // desativou ou trocou o telefone: derruba o login dele
    if ((d.ativo === false && antes.ativo) || (d.telefone && d.telefone !== antes.telefone)) { d.token_version = (antes.token_version || 0) + 1; d.disponivel = false; }
    const { data, error } = await supabase.from("entregadores").update(d).eq("id", req.params.id).eq("restaurant_id", req.params.restaurant_id).select().single();
    if (error) return error.code === "23505" ? res.status(409).json({ error: "Já tem um entregador com esse WhatsApp" }) : erro(res, 500, "Não deu pra salvar", error);
    if (d.token_version) io.to(`entd:${req.params.id}`).emit("entregador_sair");
    io.to(req.params.restaurant_id).emit("entregadores_mudou");
    return res.json(data);
  });

  // excluir o entregador. Não deixa se ele estiver com pedido na rua ou com dinheiro pra devolver.
  // Os pedidos que ele já entregou continuam no histórico (só perdem o nome dele).
  app.delete(`${OP}/:id`, async (req, res) => {
    const rid = req.params.restaurant_id, id = req.params.id;
    const { data: e } = await supabase.from("entregadores").select("id, nome").eq("id", id).eq("restaurant_id", rid).maybeSingle();
    if (!e) return res.status(404).json({ error: "Entregador não encontrado" });
    const [{ count: naRua }, { count: acertar }] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("entregador_id", id).eq("status", "delivering"),
      supabase.from("entregador_rodadas").select("id", { count: "exact", head: true }).eq("entregador_id", id).eq("status", "a_acertar")
    ]);
    if (naRua) return res.status(409).json({ error: `${primeiroNome(e.nome)} está com ${naRua} pedido${naRua > 1 ? "s" : ""} na rua. Tire os pedidos dele antes de excluir.` });
    if (acertar) return res.status(409).json({ error: `${primeiroNome(e.nome)} ainda tem dinheiro pra devolver. Confira o acerto antes de excluir.` });
    const { error } = await supabase.from("entregadores").delete().eq("id", id).eq("restaurant_id", rid);
    if (error) return erro(res, 500, "Não deu pra excluir", error);
    io.to(`entd:${id}`).emit("entregador_sair");
    io.to(rid).emit("entregadores_mudou");
    return res.json({ success: true });
  });
   
  // código de acesso na tela (quando o WhatsApp não chega)
  app.post(`${OP}/:id/codigo`, async (req, res) => {
    const { data: e } = await supabase.from("entregadores").select("telefone, ativo").eq("id", req.params.id).eq("restaurant_id", req.params.restaurant_id).maybeSingle();
    if (!e || !e.ativo) return res.status(404).json({ error: "Entregador não encontrado ou desativado" });
    try { return res.json({ codigo: await criarCodigo(e.telefone, OTP_MINUTOS_CAIXA), minutos: OTP_MINUTOS_CAIXA }); }
    catch (err) { return erro(res, 500, "Não deu pra gerar o código", err); }
  });

  // o caixa manda pedidos pra um entregador (também serve pra trocar de entregador)
  app.post(`${OP}/atribuir`, async (req, res) => {
    try {
      const rid = req.params.restaurant_id;
      const ids = [...new Set((Array.isArray(req.body?.order_ids) ? req.body.order_ids : []).map(String))].slice(0, 30);
      const { data: e } = await supabase.from("entregadores").select("id, nome, restaurant_id, ativo").eq("id", String(req.body?.entregador_id || "")).eq("restaurant_id", rid).maybeSingle();
      if (!e || !e.ativo) return res.status(404).json({ error: "Entregador não encontrado" });
      if (!ids.length) return res.status(400).json({ error: "Nenhum pedido escolhido" });
      const pegos = await levarPedidos(rid, e, ids, { peloCaixa: true });
      if (pegos.length) io.to(`entd:${e.id}`).emit("caixa_mandou", { qtd: pegos.length, numeros: pegos.map((p) => p.order_number) });
      return res.json({ success: true, enviados: pegos.map((p) => p.id), recusados: ids.filter((id) => !pegos.some((p) => p.id === id)) });
    } catch (err) { return erro(res, 500, "Não deu pra mandar o pedido", err); }
  });

  // tira o pedido do entregador: volta pra "pronto"
  app.post(`${OP}/desatribuir`, async (req, res) => {
    const rid = req.params.restaurant_id, id = String(req.body?.order_id || "");
    const { data: o } = await supabase.from("orders").select("id, status, entregador_id, rodada_id").eq("id", id).eq("restaurant_id", rid).maybeSingle();
    if (!o || !o.entregador_id || o.status !== "delivering") return res.status(404).json({ error: "Esse pedido não está com entregador" });
    const { data: volta } = await supabase.from("orders").update({ status: "mounting", entregador_id: null, rodada_id: null, update_at: new Date().toISOString() })
      .eq("id", id).eq("status", "delivering").select().maybeSingle();
    if (!volta) return res.status(409).json({ error: "O pedido mudou. Atualize a tela." });
    _cacheAtivos.delete(o.entregador_id);
    io.to(`entd:${o.entregador_id}`).emit("minhas_mudou", { id, status: "mounting" });
    C.emitOrderUpdate(rid, volta);
    await conferirRodada(o.rodada_id);
    return res.json({ success: true });
  });

  // dinheiro pra conferir (rodadas que voltaram)
  app.get(`${OP}/acertos`, async (req, res) => {
    const rid = req.params.restaurant_id;
    const { data: rodadas, error } = await supabase.from("entregador_rodadas").select("id, entregador_id, status, saiu_em, voltou_em, dinheiro")
      .eq("restaurant_id", rid).eq("status", "a_acertar").order("voltou_em", { ascending: true });
    if (error) return erro(res, 500, "Não deu pra carregar os acertos", error);
    const ids = (rodadas || []).map((r) => r.id);
    const entIds = [...new Set((rodadas || []).map((r) => r.entregador_id))];
    const [{ data: peds }, { data: ents }] = await Promise.all([
      ids.length ? supabase.from("orders").select("order_number, rodada_id, total_price, payment_method, notes").in("rodada_id", ids).eq("status", "finished") : { data: [] },
      entIds.length ? supabase.from("entregadores").select("id, nome").in("id", entIds) : { data: [] }
    ]);
    return res.json((rodadas || []).map((r) => {
      const ps = (peds || []).filter((p) => p.rodada_id === r.id).map((p) => ({ numero: p.order_number, pg: pagamentoInfo(p) })).filter((p) => p.pg.dinheiro > 0);
      return { id: r.id, entregador: { id: r.entregador_id, nome: (ents || []).find((e) => e.id === r.entregador_id)?.nome || "Entregador" },
        voltou_em: r.voltou_em, dinheiro: r2(r.dinheiro), troco_levado: r2(ps.reduce((a, p) => a + (p.pg.troco || 0), 0)),
        pedidos: ps.map((p) => ({ numero: p.numero, dinheiro: p.pg.dinheiro, troco: p.pg.troco })) };
    }));
  });

  app.post(`${OP}/acertos/:rodada_id`, async (req, res) => {
    const rid = req.params.restaurant_id;
    const valor = r2(String(req.body?.valor_recebido ?? "").replace(",", "."));
    const quem = req.auth?.email || "caixa";
    const { data, error } = await supabase.from("entregador_rodadas")
      .update({ status: "acertada", valor_recebido: valor, acertada_em: new Date().toISOString(), acertada_por: quem })
      .eq("id", req.params.rodada_id).eq("restaurant_id", rid).eq("status", "a_acertar").select("id, entregador_id, dinheiro").maybeSingle();
    if (error) return erro(res, 500, "Não deu pra salvar o acerto", error);
    if (!data) return res.status(409).json({ error: "Esse acerto já foi feito" });
    io.to(rid).emit("acertos_mudou");
    io.to(`entd:${data.entregador_id}`).emit("minhas_mudou", { acerto: data.id });
    return res.json({ success: true, diferenca: r2(valor - Number(data.dinheiro)) });
  });

  // resumo do dia por entregador (quanto pagar pra cada um)
  app.get(`${OP}/hoje`, async (req, res) => {
    const rid = req.params.restaurant_id, desde = inicioDoDia();
    const [{ data: ents, error }, { data: peds }, { data: rods }] = await Promise.all([
      supabase.from("entregadores").select("id, nome, tipo_pagamento, valor_diaria, visto_em, ativo").eq("restaurant_id", rid),
      supabase.from("orders").select("entregador_id, taxa_entrega").eq("restaurant_id", rid).eq("status", "finished").not("entregador_id", "is", null).gte("delivered_at", desde),
      supabase.from("entregador_rodadas").select("entregador_id, status, dinheiro, valor_recebido").eq("restaurant_id", rid).gte("saiu_em", desde)
    ]);
    if (error) return erro(res, 500, "Não deu pra carregar o resumo", error);
    const lista = (ents || []).map((e) => {
      const minhas = (peds || []).filter((p) => p.entregador_id === e.id);
      const rs = (rods || []).filter((r) => r.entregador_id === e.id);
      return { id: e.id, nome: e.nome, ...ganhosDe(e, minhas, !!(e.visto_em && depois(e.visto_em, desde))),
        dinheiro_recebido: r2(rs.filter((r) => r.status === "acertada").reduce((a, r) => a + Number(r.valor_recebido || 0), 0)),
        dinheiro_pendente: r2(rs.filter((r) => r.status === "a_acertar").reduce((a, r) => a + Number(r.dinheiro || 0), 0)) };
    }).filter((e) => e.entregas > 0 || e.diaria > 0 || e.dinheiro_pendente > 0);
    return res.json({ desde, entregadores: lista, total: r2(lista.reduce((a, e) => a + e.total, 0)) });
  });

  console.log("🛵 Entregadores: rotas e socket ligados" + (url ? ` (app: ${url})` : " — defina ENTREGADOR_APP_URL pro link do mapa no WhatsApp"));
}

// exportado só pros testes
export const _teste = { pagamentoInfo, enderecoPartes, numeroTexto, inicioDoDia, ganhosDe };
