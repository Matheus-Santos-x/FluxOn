/* ============================================================
   🔧 CONFIGURAÇÃO

   Como o cardápio de mesa, esse aqui descobre sozinho de qual
   restaurante se trata pelo DOMÍNIO que a pessoa está acessando
   (rota GET /api/v1/dominio-delivery/:dominio no seu backend,
   que busca pelo campo cardapio_delivery_url — diferente do
   cardapio_url usado pelo cardápio de mesa).

   Ou seja: depois de hospedar esse arquivo no domínio de delivery
   que o restaurante cadastrar (campo cardapio_delivery_url em
   /api/v1/restaurante/:id/dominio-delivery), NÃO precisa fixar
   nenhum RESTAURANT_ID aqui — ele puxa sozinho.

   Pra testar localmente sem ter o domínio apontado ainda, dá pra
   forçar um restaurante via link: seusite.com/?r=ID-DO-RESTAURANTE
   ============================================================ */
const CONFIG = {
  API_BASE: "https://backend.evoriseai.com.br", // seu backend em produção
};
let RESTAURANT_ID = new URLSearchParams(location.search).get("r") || null;
let IS_DEMO = false; // decidido em tempo real dentro de fetchMenu()

/* Fallback de demonstração — só entra em cena se o domínio não
   bater com nenhum restaurante cadastrado (ex: preview local) */
const DEMO_CONFIG = {
  nome_exibicao: "Bráza Burgers",
  cor_primaria: "#d62828",
  logo_url: null,
  instagram: "@brazaburgers"
};
const DEMO_MENU = [
  { id:1, nome:"Smash Duplo", descricao:"Dois blends smash, queijo cheddar, picles e molho da casa no pão brioche.", preco:32.9, categoria:"Burgers", foto_url:null, ativo:true, ordem:1 },
  { id:2, nome:"Bráza Bacon", descricao:"Blend 180g, bacon crocante, queijo prato e cebola caramelizada.", preco:29.9, categoria:"Burgers", foto_url:null, ativo:true, ordem:2 },
  { id:3, nome:"Batata Rústica", descricao:"Batata rústica com casca, alecrim e páprica defumada.", preco:18.0, categoria:"Acompanhamentos", foto_url:null, ativo:true, ordem:1 },
  { id:4, nome:"Onion Rings", descricao:"Anéis de cebola empanados, crocantes por fora.", preco:16.5, categoria:"Acompanhamentos", foto_url:null, ativo:true, ordem:2 },
  { id:5, nome:"Milkshake Ovomaltine", descricao:"Sorvete de creme batido com ovomaltine e calda.", preco:19.9, categoria:"Bebidas", foto_url:null, ativo:true, ordem:1 },
  { id:6, nome:"Coca-Cola Lata", descricao:"350ml gelada.", preco:7.0, categoria:"Bebidas", foto_url:null, ativo:true, ordem:2 },
];

/* ============================================================
   STATE
   ============================================================ */
let MENU = [];
let RESTAURANT_CONFIG = {};
let RESTAURANT_CATEGORIAS = []; 
let RESTAURANT_HORARIOS_STATUS = { aberto:false, fechamento_atual:null };
let CART = []; 
let SELECTED_PAY = null;

/* ============================================================
   API HELPERS
   ============================================================ */

/* Resolve o restaurant_id pelo domínio atual — mesma rota que
   o cardápio de delivery usa (/api/v1/dominio-delivery/:dominio) */
async function resolveRestaurantId(){
  if(RESTAURANT_ID) return RESTAURANT_ID; // já veio via ?r= (modo teste)
  try{
    const dominio = window.location.hostname;
    const resp = await fetch(`${CONFIG.API_BASE}/api/v1/dominio-delivery/${dominio}`);
    if(!resp.ok) return null;
    const data = await resp.json();
    return data.restaurant_id || null;
  }catch(err){
    console.warn("Não foi possível resolver o restaurante pelo domínio.", err);
    return null;
  }
}

async function fetchMenu(){
  const forceDemo = new URLSearchParams(location.search).get("demo") === "1";
  if(forceDemo){
    IS_DEMO = true;
    RESTAURANT_CONFIG = DEMO_CONFIG;
    return DEMO_MENU;
  }

  RESTAURANT_ID = await resolveRestaurantId();
  if(!RESTAURANT_ID){
    throw new Error("Não encontramos um restaurante cadastrado para este link. Confira o domínio configurado no backend.");
  }

   const [menuRes, cfgRes, horariosRes] = await Promise.all([
    fetch(`${CONFIG.API_BASE}/api/v1/cardapio/${RESTAURANT_ID}`),
    fetch(`${CONFIG.API_BASE}/api/v1/restaurante/${RESTAURANT_ID}/config`),
    fetch(`${CONFIG.API_BASE}/api/v1/restaurante/${RESTAURANT_ID}/horarios`)
  ]);
  if(!menuRes.ok){
    throw new Error(`Não foi possível carregar o cardápio agora (erro ${menuRes.status}). Tente novamente em instantes.`);
  }

  const menu = await menuRes.json();
  RESTAURANT_CONFIG = cfgRes.ok ? await cfgRes.json() : {};
  if(horariosRes.ok){
    const horariosData = await horariosRes.json();
    RESTAURANT_HORARIOS_STATUS = horariosData.status || RESTAURANT_HORARIOS_STATUS;
  }
  RESTAURANT_CATEGORIAS = Array.isArray(RESTAURANT_CONFIG?.categorias_ordem) ? RESTAURANT_CONFIG.categorias_ordem : [];
  IS_DEMO = false;

  const itens = Array.isArray(menu) ? menu.filter(i => i.ativo !== false) : [];
  if(itens.length === 0){
    throw new Error("Esse cardápio ainda não tem nenhum item cadastrado.");
  }
  return itens;
}

async function submitOrder(payload){
  if(IS_DEMO){
    // modo demo — simula resposta da API (só entra aqui com ?demo=1)
    await new Promise(r => setTimeout(r, 700));
    const fakeId = payload.order_id || ("demo-" + Date.now());
    return { success:true, order:{ id: fakeId, order_number: Math.floor(Math.random()*900+100) }, tracking_link:null };
  }
  const res = await fetch(`${CONFIG.API_BASE}/api/v1/pedidos`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const erro = await res.json().catch(() => ({}));
    throw new Error(erro.error || "Falha ao enviar pedido");
  }
  return res.json();
}

/* ============================================================
   RENDER
   ============================================================ */
function money(v){
  return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function instagramUrl(v){
  if(!v) return null;
  v = String(v).trim();
  if(/^https?:\/\//i.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@/, "")}`;
}

/* O backend às vezes guarda foto_url como uma URL simples e às
   vezes como um array JSON de várias fotos — trata os dois casos
   (mesma lógica do cardápio de mesa) */
function getFotos(item){
  if(!item || !item.foto_url) return [];
  try{
    const parsed = JSON.parse(item.foto_url);
    if(Array.isArray(parsed)) return parsed.filter(Boolean);
    return [item.foto_url];
  }catch{
    return [item.foto_url];
  }
}
function getPrimeiraFoto(item){
  return getFotos(item)[0] || null;
}


function escHtml(str){
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function applyBranding(){
  // Pix online: só aparece se o restaurante conectou o banco; nesse caso substitui o "Pix" antigo
  const pixOnline = !!RESTAURANT_CONFIG.pix_online;
  const optPixOn = document.getElementById("payPixOnline");
  const optPixOld = document.querySelector('.pay-opt[data-pay="Pix"]');
  if(optPixOn) optPixOn.style.display = pixOnline ? "flex" : "none";
  if(optPixOld) optPixOld.style.display = pixOnline ? "none" : "flex";

  // nome do restaurante na aba do navegador e no app instalado
  if(RESTAURANT_CONFIG.nome_exibicao) document.title = RESTAURANT_CONFIG.nome_exibicao;
  if(RESTAURANT_CONFIG.logo_url) document.getElementById("appleIcon")?.setAttribute("href", RESTAURANT_CONFIG.logo_url);

  const nome = RESTAURANT_CONFIG.nome_exibicao || "restaurante";
  document.getElementById("brandName").textContent = nome;
  const logoEl = document.getElementById("brandLogo");
  if(RESTAURANT_CONFIG.logo_url){
    logoEl.innerHTML = `<img src="${RESTAURANT_CONFIG.logo_url}" alt="logo">`;
  }else{
    const initials = (RESTAURANT_CONFIG.nome_exibicao || "R").trim().charAt(0).toUpperCase();
    logoEl.textContent = initials;
  }

  const bannerEl = document.getElementById("bannerImg");
  if(bannerEl && RESTAURANT_CONFIG.banner_url){
    bannerEl.style.backgroundImage = `url('${RESTAURANT_CONFIG.banner_url}')`;
    bannerEl.style.backgroundSize = "cover";
    bannerEl.style.backgroundPosition = "center";
  }

  // ===== TEMA — troca TODAS as variáveis de superfície/texto, igual o cardápio presencial =====
const tema = RESTAURANT_CONFIG.tema || "light";
    document.body.classList.toggle("tema-gelo", tema === "light");
  if(tema === "light"){
    document.documentElement.style.setProperty("--bg",        "#eef1f5");
    document.documentElement.style.setProperty("--surface",   "#ffffff");
    document.documentElement.style.setProperty("--surface-2", "#f1f3f6");
    document.documentElement.style.setProperty("--line",      "rgba(0,0,0,0.1)");
    document.documentElement.style.setProperty("--text",      "#1a1814");
    document.documentElement.style.setProperty("--muted",     "#555555");
    document.documentElement.style.setProperty("--muted-2",   "#8a8a8a");
    document.body.style.background = "#eef1f5";
  }else{
    document.documentElement.style.setProperty("--bg",        "#0a0908");
    document.documentElement.style.setProperty("--surface",   "#17140f");
    document.documentElement.style.setProperty("--surface-2", "#211c16");
    document.documentElement.style.setProperty("--line",      "#2b251e");
    document.documentElement.style.setProperty("--text",      "#f2ede6");
    document.documentElement.style.setProperty("--muted",     "#8c877d");
    document.documentElement.style.setProperty("--muted-2",   "#5c584f");
    document.body.style.background = "#0a0908";
    document.body.style.opacity = "1";
  }

  // ===== CORES DE MARCA =====
  if(RESTAURANT_CONFIG.cor_primaria){
    document.documentElement.style.setProperty("--red", RESTAURANT_CONFIG.cor_primaria);
    document.documentElement.style.setProperty("--red-glow", RESTAURANT_CONFIG.cor_primaria);
  }
  if(RESTAURANT_CONFIG.cor_secundaria){
    document.documentElement.style.setProperty("--red-dim", RESTAURANT_CONFIG.cor_secundaria);
  }
  if(RESTAURANT_CONFIG.cor_fundo){
    document.documentElement.style.setProperty("--bg", RESTAURANT_CONFIG.cor_fundo);
    document.body.style.background = RESTAURANT_CONFIG.cor_fundo;
  }

  // rodapé — Instagram do restaurante (mesmo dado usado na notinha impressa)
  const igUrl = instagramUrl(RESTAURANT_CONFIG.instagram);
  const igLink = document.getElementById("footerIgLink");
  if(igUrl){
    igLink.href = igUrl;
    igLink.style.display = "flex";
  }else{
    igLink.style.display = "none";
  }

  // endereço
  const addressEl = document.getElementById("storeAddress");
  if(addressEl) addressEl.textContent = RESTAURANT_CONFIG.endereco || "";

  // pedido mínimo
  const metaMinimoEl = document.getElementById("metaPedidoMinimo");
  if(metaMinimoEl){
    const minimo = parseFloat(RESTAURANT_CONFIG.pedido_minimo || 0);
    metaMinimoEl.textContent = minimo > 0 ? money(minimo) : "Sem mínimo";
    const minLabel = document.getElementById("metaMinimoLabel");
    if(minLabel) minLabel.hidden = !(minimo > 0);
  }

  // tempo de entrega
  const metaEntregaEl = document.getElementById("metaEntrega");
  if(metaEntregaEl){
    const min = RESTAURANT_CONFIG.tempo_entrega_min;
    const max = RESTAURANT_CONFIG.tempo_entrega_max;
    metaEntregaEl.textContent = (min && max) ? `${min}-${max}min` : "A combinar";
  }

  renderStoreStatus();
  document.body.style.opacity = "1";
}

function renderStoreStatus(){
  const wrap = document.getElementById("storeStatus");
  const textEl = document.getElementById("storeStatusText");
  if(!wrap || !textEl) return;

  if(RESTAURANT_HORARIOS_STATUS.aberto){
    wrap.classList.remove("closed");
    textEl.textContent = RESTAURANT_HORARIOS_STATUS.fechamento_atual
      ? `Aberto até ${RESTAURANT_HORARIOS_STATUS.fechamento_atual}`
      : "Aberto agora";
  }else{
    wrap.classList.add("closed");
    textEl.textContent = "Fechado no momento";
  }
}
