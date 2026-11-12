// FluxON — Painel Admin
// Telas: Restaurantes (parede de cartões) → Restaurante (capa + seções) · Donos.
// Endereços na barra: #/  ·  #/r/<id>/<seção>  ·  #/donos

// ===== CONFIG =====
const GOOGLE_CLIENT_ID = "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";
const API_BASE = "https://backend.evoriseai.com.br";
const ADMIN_URL = `${API_BASE}/admin`;
const OPERACIONAL_URL = "https://fluxon.evoriseai.com.br";

const PLANOS = [["essential", "Essential"], ["advanced", "Advanced"], ["executive", "Executive"], ["custom", "Custom"]];
const SERVICOS = [["cardapio_url", "Mesa"], ["cardapio_delivery_url", "Delivery"], ["central_url", "Central"], ["vouchers_url", "Vale"], ["reservas_url", "Reserva"], ["avaliacao_url", "Avaliação"]];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PAGAMENTOS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Vale-refeição", "Vale-alimentação"];

// estado da tela
const S = {
  restaurantes: [], donos: [], donosOk: false,
  atual: null, cfg: null, horarios: [], secao: "conta",
  filtro: "todos", busca: "",
  sujo: false, salvar: null, descartar: null, hash: "",
  ia: null
};

// ===== ÍCONES =====
const ICONES = {
  escudo: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/>',
  loja: '<path d="M4 9.5L5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-5h4v5"/>',
  pessoas: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.8c1.9.6 3.1 2.4 3.5 5.2"/>',
  sair: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lixo: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  conta: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.5c.5-1.7 1.8-2.7 3.2-2.7s2.7 1 3.2 2.7M14.5 10h3.5M14.5 13.5h3.5"/>',
  paleta: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.8-1.8 0-1.4-1.3-1.7-1.3-3 0-1 .8-1.7 1.8-1.7h2.2a4 4 0 0 0 4-4C20.5 6.5 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.1"/><circle cx="10.5" cy="7.3" r="1.1"/><circle cx="15" cy="7.6" r="1.1"/>',
  livro: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8.5 7.5h6M8.5 11h4"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  globo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5S9.7 5.8 12 3.5z"/>',
  casa: '<path d="M4 10.5L12 4l8 6.5V20h-5v-5.5h-6V20H4z"/>',
  presente: '<rect x="3.5" y="8.5" width="17" height="12" rx="1.5"/><path d="M2.5 8.5h19v4h-19zM12 8.5v12"/><path d="M12 8.5c-1.8 0-4.5-.7-4.5-2.6S10 3.6 12 8.5zm0 0c1.8 0 4.5-.7 4.5-2.6S14 3.6 12 8.5z"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  brilho: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  enviar: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  zap: '<path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6z"/>',
  mapa: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'
};
const ico = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n] || ""}</svg>`;
function pintarIcones(raiz = document) {
  raiz.querySelectorAll("[data-ico]").forEach(el => { if (!el.querySelector("svg")) el.insertAdjacentHTML("afterbegin", ico(el.dataset.ico)); });
}

// ===== UTILITÁRIOS =====
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iniciais = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
const corDe = (txt) => { let h = 0; for (const ch of String(txt)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 52%)`; };
const corValida = (c) => /^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : null;
const httpsOk = (v) => { try { const u = new URL(String(v || "").trim()); return u.protocol === "https:" ? u.href : null; } catch { return null; } };
const so = (v) => String(v || "").replace(/\D/g, "");

function fmtTel(t) {
  const d = so(t).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || "";
}
function mascaraTel(input) {
  input.addEventListener("input", () => {
    const d = so(input.value).slice(0, 11);
    input.value = d.length > 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
      : d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
      : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });
}
function mascaraCpf(input) {
  input.addEventListener("input", () => {
    const d = so(input.value).slice(0, 11);
    input.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  });
}
function quando(iso) {
  if (!iso) return "nunca entrou";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (dias <= 0) return "entrou hoje";
  if (dias === 1) return "entrou ontem";
  if (dias < 30) return `entrou há ${dias} dias`;
  return `entrou em ${new Date(iso).toLocaleDateString("pt-BR")}`;
}
const nomeRest = (r) => r?.nome_exibicao || r?.name || "Restaurante";

// avisos rápidos no topo
function toast(msg, tipo = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, tipo === "erro" ? 5000 : 2600);
}

// botão com "carregando"
async function ocupado(btn, fn) {
  if (!btn || btn.disabled) return;
  const antes = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="gira"></span>${btn.dataset.ocupado || ""}`;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = antes; } }
}

// janela (no celular abre de baixo pra cima)
function abrirJanela({ titulo, sub = "", corpo = "", pe = "", larga = false, aoFechar }) {
  const fundo = document.createElement("div");
  fundo.className = "fundo-janela";
  fundo.innerHTML = `
    <div class="janela ${larga ? "janela-larga" : ""}" role="dialog" aria-modal="true">
      <div class="janela-cabeca">
        <div style="flex:1; min-width:0"><h2>${titulo}</h2>${sub ? `<p>${sub}</p>` : ""}</div>
        <button type="button" class="btn btn-ghost btn-icone" data-fechar aria-label="Fechar">${ico("x")}</button>
      </div>
      <div class="janela-corpo">${corpo}</div>
      ${pe ? `<div class="janela-pe">${pe}</div>` : ""}
    </div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", tecla); aoFechar?.(); };
  const tecla = (e) => { if (e.key === "Escape" && document.querySelector(".fundo-janela:last-of-type") === fundo) fechar(); };
  fundo.addEventListener("mousedown", e => { if (e.target === fundo) fechar(); });
  fundo.querySelector("[data-fechar]").onclick = fechar;
  document.addEventListener("keydown", tecla);
  document.body.appendChild(fundo);
  pintarIcones(fundo);
  setTimeout(() => fundo.querySelector("input:not([type=checkbox]):not([type=hidden]), select")?.focus(), 60);
  return { el: fundo, fechar, q: (sel) => fundo.querySelector(sel), erro: (t) => { const e = fundo.querySelector(".janela-pe .erro"); if (e) e.textContent = t || ""; } };
}

function perguntar({ titulo, texto = "", sim = "Confirmar", nao = "Cancelar", perigo = false }) {
  return new Promise(resolve => {
    let resp = false;
    const j = abrirJanela({
      titulo, corpo: texto ? `<p style="color:var(--tx-2)">${texto}</p>` : "",
      pe: `<button type="button" class="btn" data-nao>${nao}</button><button type="button" class="btn ${perigo ? "btn-perigo" : "btn-pri"}" data-sim>${sim}</button>`,
      aoFechar: () => resolve(resp)
    });
    j.q("[data-nao]").onclick = j.fechar;
    j.q("[data-sim]").onclick = () => { resp = true; j.fechar(); };
  });
}

// ===== SESSÃO =====
function lerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLocal(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function getAdminToken() { return lerLocal("fx_admin_token"); }
function buildAdminHeaders() {
  const token = getAdminToken();
  return { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };
}
function decodeJwt(token) {
  try { return JSON.parse(decodeURIComponent(escape(window.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return null; }
}
function tokenAdminValido(t = getAdminToken()) {
  const p = t ? decodeJwt(t) : null;
  return !!p?.is_admin && (!p.exp || p.exp * 1000 > Date.now() + 60 * 1000);
}

// toda chamada pra API leva o token do admin; se ele venceu, volta pro login
const _fetchOriginal = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const u = typeof url === "string" ? url : (url?.url || "");
  if (u.startsWith(API_BASE)) {
    const t = getAdminToken();
    const h = new Headers(opts.headers || {});
    if (t && !h.has("Authorization")) h.set("Authorization", `Bearer ${t}`);
    opts = { ...opts, headers: h };
  }
  const resp = await _fetchOriginal(url, opts);
  if ((resp.status === 401 || resp.status === 403) && u.startsWith(ADMIN_URL) && !u.includes("/auth/") && !tokenAdminValido()) sessaoExpirou();
  return resp;
};

// chamada JSON com erro legível
async function api(caminho, { metodo = "GET", corpo, form } = {}) {
  const url = caminho.startsWith("http") ? caminho : `${ADMIN_URL}${caminho}`;
  const opts = { method: metodo };
  if (form) opts.body = form;
  else if (corpo !== undefined) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(corpo); }
  let resp;
  try { resp = await fetch(url, opts); } catch { throw new Error("Sem conexão com o servidor. Confira a internet."); }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data;
}

// ===== LOGIN =====
function loginStatus(texto, erro) {
  const el = $("login-status");
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("erro", !!erro);
}
function guardarSessao(data) {
  gravarLocal("fx_admin_token", data.token);
  gravarLocal("fx_admin_email", data.email || "");
  gravarLocal("fx_admin_foto", data.foto || "");
}
async function entrarComGoogle(resposta) {
  loginStatus("Entrando...");
  try {
    guardarSessao(await api("/auth/google", { metodo: "POST", corpo: { credential: resposta.credential } }));
    loginStatus("");
    mostrarPainel();
  } catch (e) { loginStatus(e.message, true); }
}
async function entrarComSenha(e) {
  e.preventDefault();
  const input = $("login-senha-input");
  if (!input.value) return;
  loginStatus("Entrando...");
  try {
    guardarSessao(await api("/auth/senha", { metodo: "POST", corpo: { senha: input.value } }));
    input.value = "";
    loginStatus("");
    mostrarPainel();
  } catch (err) { loginStatus(err.message, true); }
}
function iniciarBotaoGoogle() {
  const box = $("google-btn");
  if (!box) return;
  if (!window.google?.accounts?.id) return setTimeout(iniciarBotaoGoogle, 300);
  window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: entrarComGoogle });
  box.innerHTML = "";
  window.google.accounts.id.renderButton(box, { theme: "filled_black", size: "large", shape: "pill", width: 300 });
}
function mostrarLogin() {
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  iniciarBotaoGoogle();
}
async function mostrarPainel() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  const email = lerLocal("fx_admin_email") || decodeJwt(getAdminToken())?.email || "";
  $("eu-email").textContent = email;
  const foto = lerLocal("fx_admin_foto");
  $("eu-foto").src = foto || "";
  $("eu-foto").classList.toggle("hidden", !foto);
  $("palco").innerHTML = `<div class="carregando">Carregando restaurantes...</div>`;
  await Promise.all([carregarRestaurantes(), carregarDonos()]);
  rotear();
}
function sairDoAdmin() {
  ["fx_admin_token", "fx_admin_email", "fx_admin_foto"].forEach(k => gravarLocal(k, null));
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
  S.atual = null; limparSujo();
  mostrarLogin();
}
let _avisouExpirou = false;
function sessaoExpirou() {
  if (_avisouExpirou) return;
  _avisouExpirou = true;
  sairDoAdmin();
  loginStatus("Sua sessão expirou. Entre de novo.", true);
  setTimeout(() => { _avisouExpirou = false; }, 2000);
}

// ===== DADOS =====
async function carregarRestaurantes() {
  try {
    S.restaurantes = await api("/restaurants");
  } catch (e) {
    if (tokenAdminValido()) toast(e.message, "erro");
  }
  $("cont-rest").textContent = S.restaurantes.length || "";
}
async function carregarDonos() {
  try {
    S.donos = await api("/owners");
    S.donosOk = true;
  } catch (e) {
    S.donosOk = false;
    if (tokenAdminValido()) toast("Não deu pra carregar os donos: " + e.message, "erro");
  }
  $("cont-donos").textContent = S.donos.length || "";
}
const donosDe = (rid) => S.donos.filter(o => (o.restaurant_ids || []).includes(rid));

// ===== ALTERAÇÕES NÃO SALVAS =====
function marcarSujo() {
  if (!S.salvar) return;
  S.sujo = true;
  $("salvar-barra").classList.add("on");
}
function limparSujo() {
  S.sujo = false;
  $("salvar-barra")?.classList.remove("on");
}
async function salvarAgora() {
  if (!S.salvar) return;
  await ocupado($("salvar-ok"), async () => {
    try {
      await S.salvar();
      limparSujo();
    } catch (e) { toast(e.message, "erro"); }
  });
}

// ===== NAVEGAÇÃO =====
async function rotear() {
  const h = location.hash || "#/";
  if (S.sujo && h !== S.hash) {
    const alvo = h;
    history.replaceState(null, "", S.hash || "#/");
    const sair = await perguntar({ titulo: "Sair sem salvar?", texto: "As alterações desta seção vão se perder.", sim: "Sair sem salvar", nao: "Continuar editando", perigo: true });
    if (!sair) return;
    limparSujo();
    location.hash = alvo;
    return;
  }
  S.hash = h;
  limparSujo();
  S.salvar = null;
  const partes = h.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === (partes[0] === "donos" ? "donos" : "restaurantes")));
  if (partes[0] === "donos") return telaDonos();
  if (partes[0] === "r" && partes[1]) return telaRestaurante(partes[1], partes[2] || "conta");
  return telaLista();
}
const ir = (h) => { if (location.hash === h) rotear(); else location.hash = h; };

// ===== TELA: RESTAURANTES =====
function logoHtml(r, cls = "logo-redonda") {
  const logo = httpsOk(r?.logo_url);
  return `<span class="${cls}">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(iniciais(nomeRest(r)))}</span>`;
}
function planoHtml(p) {
  const nome = (PLANOS.find(x => x[0] === p) || [p, p || "Sem plano"])[1];
  return `<span class="plano plano-${esc(p || "")}">${esc(nome)}</span>`;
}

function telaLista() {
  S.atual = null;
  const semDono = S.donosOk ? S.restaurantes.filter(r => !donosDe(r.id).length).length : 0;
  $("palco").innerHTML = `
    <div class="cabeca">
      <div>
        <h1>Restaurantes</h1>
        <p>${S.restaurantes.length} no FluxON${semDono ? `, ${semDono} sem dono no app` : ""}</p>
      </div>
      <button type="button" class="btn btn-pri" id="btn-novo">${ico("mais")}Novo restaurante</button>
    </div>
    <div class="barra">
      <label class="busca">${ico("busca")}<input class="inp" id="busca" type="search" placeholder="Buscar por nome ou e-mail" value="${esc(S.busca)}" autocomplete="off"></label>
      <div class="seg" id="filtros">
        ${[["todos", "Todos"], ...(semDono ? [["semdono", "Sem dono"]] : []), ...PLANOS].map(([v, n]) => `<button type="button" data-f="${v}" class="${S.filtro === v ? "on" : ""}">${n}</button>`).join("")}
      </div>
    </div>
    <div class="parede" id="parede"></div>`;
  $("btn-novo").onclick = janelaNovoRestaurante;
  $("busca").oninput = (e) => { S.busca = e.target.value; desenharParede(); };
  $("filtros").onclick = (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    S.filtro = b.dataset.f;
    $("filtros").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    desenharParede();
  };
  desenharParede();
}

function desenharParede() {
  const q = S.busca.trim().toLowerCase();
  const lista = S.restaurantes.filter(r => {
    if (q && !`${r.name} ${r.nome_exibicao || ""} ${r.email}`.toLowerCase().includes(q)) return false;
    if (S.filtro === "semdono") return !donosDe(r.id).length;
    if (S.filtro !== "todos") return r.plan === S.filtro;
    return true;
  });
  const parede = $("parede");
  if (!lista.length) {
    parede.innerHTML = `<div class="vazio" style="grid-column:1/-1"><b>${S.restaurantes.length ? "Nada encontrado" : "Nenhum restaurante ainda"}</b>${S.restaurantes.length ? "Tente outro nome ou limpe o filtro." : "Crie o primeiro no botão Novo restaurante."}</div>`;
    return;
  }
  parede.innerHTML = lista.map(r => {
    const donos = donosDe(r.id);
    const cor = corValida(r.cor_primaria) || corDe(r.name);
    return `
      <a class="cartao ${r.ativo === false ? "off" : ""}" href="#/r/${esc(r.id)}" style="--c:${cor}; text-decoration:none; color:inherit">
        <div class="cartao-topo">
          ${logoHtml(r)}
          <div class="cartao-nome"><b>${esc(nomeRest(r))}</b><small>${esc(r.email)}</small></div>
        </div>
        <div class="servicos">${SERVICOS.map(([k, n]) => `<span class="servico ${r[k] ? "on" : ""}">${n}</span>`).join("")}</div>
        <div class="cartao-pe">
          <span class="donos-mini">${donos.length
            ? `<span class="pilha">${donos.slice(0, 3).map(o => `<span style="background:${corDe(o.nome)}">${esc(iniciais(o.nome)[0])}</span>`).join("")}</span><em>${esc(donos.map(o => o.nome.split(" ")[0]).join(" e "))}</em>`
            : S.donosOk ? `<em class="sem-dono">Sem dono no app</em>` : ""}</span>
          ${r.ativo === false ? `<span class="estado off">Desativado</span>` : planoHtml(r.plan)}
        </div>
      </a>`;
  }).join("");
}

// ===== TELA: RESTAURANTE =====
const SECOES = [
  ["conta", "Conta e plano", "conta"],
  ["donos", "Donos e acesso", "pessoas"],
  ["aparencia", "Aparência", "paleta"],
  ["cardapio", "Cardápio", "livro"],
  ["horarios", "Horários", "relogio"],
  ["operacao", "Operação", "ajustes"],
  ["enderecos", "Endereços", "globo"],
  ["central", "Central do cliente", "casa"],
  ["vale", "Vale-presente", "presente"],
   ["reservas", "Reservas", "calendario"],
  ["mapa", "Mapa (TomTom)", "globo"]
];

async function telaRestaurante(id, secao) {
  if (!SECOES.some(s => s[0] === secao)) secao = "conta";
  let r = S.restaurantes.find(x => x.id === id);
  if (!r) {
    $("palco").innerHTML = `<a class="voltar" href="#/">${ico("voltar")}Restaurantes</a><div class="vazio"><b>Restaurante não encontrado</b>Ele pode ter sido removido.</div>`;
    return;
  }
  const trocou = S.atual?.id !== id;
  S.atual = r;
  S.secao = secao;
  gravarLocal("fx_admin_ultimo", id);
  if (trocou || !S.cfg) {
    S.cfg = null; S.horarios = []; S.ia = null;
    $("palco").innerHTML = `<div class="carregando">Abrindo ${esc(nomeRest(r))}...</div>`;
    await carregarConfig(id);
    if (S.atual?.id !== id) return;
  }
  desenharRestaurante();
}

async function carregarConfig(id) {
  const [cfg, hr] = await Promise.all([
    fetch(`${API_BASE}/api/v1/restaurante/${id}/config`).then(r => r.json()).catch(() => ({})),
    fetch(`${API_BASE}/api/v1/restaurante/${id}/horarios`).then(r => r.json()).catch(() => ({}))
  ]);
  S.cfg = cfg || {};
  S.horarios = hr?.horarios || [];
}

function desenharRestaurante() {
  const r = S.atual, cfg = S.cfg || {};
  const cor = corValida(cfg.cor_primaria) || corValida(r.cor_primaria) || corDe(r.name);
  const banner = httpsOk(cfg.banner_url);
  const donos = donosDe(r.id);
  $("palco").innerHTML = `
    <a class="voltar" href="#/">${ico("voltar")}Restaurantes</a>
    <section class="capa" style="--c:${cor}">
      ${banner ? `<div class="capa-foto" style="background-image:url('${esc(banner)}')"></div>` : ""}
      <div class="capa-corpo">
        ${logoHtml({ ...r, logo_url: cfg.logo_url || r.logo_url, nome_exibicao: cfg.nome_exibicao || r.nome_exibicao })}
        <div class="capa-texto">
          <h1>${esc(cfg.nome_exibicao || r.name)}</h1>
          <p>${planoHtml(r.plan)}<span>${esc(r.email)}</span></p>
        </div>
        <div class="capa-acoes">
          <button type="button" class="btn btn-ok" id="btn-abrir">${ico("externo")}Abrir no FluxON</button>
        </div>
      </div>
    </section>
    <div class="mesa">
      <nav class="indice" id="indice">
        ${SECOES.map(([k, n, i]) => `<a href="#/r/${esc(r.id)}/${k}" class="${S.secao === k ? "on" : ""}">${ico(i)}${n}${k === "donos" && S.donosOk && !donos.length ? `<span class="alerta" title="Sem dono"></span>` : ""}</a>`).join("")}
      </nav>
      <section class="secao" id="secao"></section>
    </div>`;
  $("btn-abrir").onclick = () => impersonarRestaurante(r.id);
  const ativo = $("indice").querySelector("a.on");
  if (ativo && window.innerWidth <= 900) ativo.scrollIntoView({ inline: "center", block: "nearest" });
  desenharSecao();
}

function desenharSecao() {
  const velho = $("secao");
  if (!velho) return;
  const el = velho.cloneNode(false); // nó novo: não acumula eventos de quando a seção foi desenhada antes
  velho.replaceWith(el);
  S.salvar = null; S.descartar = null;
  limparSujo();
  const fn = { conta: secConta, donos: secDonos, aparencia: secAparencia, cardapio: secCardapio, horarios: secHorarios, operacao: secOperacao, enderecos: secEnderecos, central: secCentral, vale: secVale, reservas: secReservas, mapa: secMapa }[S.secao];
  fn(el);
  pintarIcones(el);
  // qualquer mudança nos campos de uma seção com "salvar" mostra a barra
  el.oninput = el.onchange = (e) => { if (e.target.closest("[data-sem-barra]")) return; marcarSujo(); };
}
const cabecaSecao = (titulo, texto, extra = "") => `<div class="secao-cabeca"><div><h2>${titulo}</h2>${texto ? `<p>${texto}</p>` : ""}</div>${extra}</div>`;
const val = (id) => ($(id)?.value ?? "").trim();

// --- Conta e plano
function secConta(el) {
  const r = S.atual;
  el.innerHTML = `
    ${cabecaSecao("Conta e plano", "Nome interno, e-mail que entra no FluxON com o Google e o plano contratado.")}
    <div class="bloco">
      <div class="grade-2">
        <label class="campo"><span>Nome</span><input id="f-name" value="${esc(r.name)}"></label>
        <label class="campo"><span>E-mail de login (Google)</span><input id="f-email" type="email" value="${esc(r.email)}"></label>
      </div>
      <div class="campo"><span>Plano</span>
        <div class="seg" id="f-plano">${PLANOS.map(([v, n]) => `<button type="button" data-v="${v}" class="${r.plan === v ? "on" : ""}">${n}</button>`).join("")}</div>
        <small>A Central do cliente só fica no ar a partir do Advanced.</small>
      </div>
    </div>
    ${zonaPerigoHtml(r)}`;
  zonaPerigo(r);
  let plano = r.plan;
  $("f-plano").onclick = (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    plano = b.dataset.v;
    $("f-plano").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    marcarSujo();
  };
  S.salvar = async () => {
    const corpo = { name: val("f-name"), email: val("f-email"), plan: plano };
    if (!corpo.name || !corpo.email) throw new Error("Preencha nome e e-mail.");
    await api(`/restaurants/${r.id}`, { metodo: "PATCH", corpo });
    Object.assign(r, corpo);
    toast("Conta salva");
    desenharRestaurante();
  };
}

// --- Desativar / reativar / excluir de vez (fim da seção Conta)
function zonaPerigoHtml(r) {
  const off = r.ativo === false;
  const desde = r.desativado_em ? new Date(r.desativado_em).toLocaleDateString("pt-BR") : "";
  return `
    <div class="bloco zona-perigo ${off ? "off" : ""}">
      <h3>${off ? "Restaurante desativado" : "Desativar ou excluir"}</h3>
      <p>${off
        ? `Fora do ar${desde ? ` desde ${desde}` : ""}. Os links do cliente, o login do FluxON e o app Owner estão parados, mas tudo continua guardado.`
        : "Desativar tira o restaurante do ar na hora (links do cliente, login do FluxON e app Owner), mas guarda tudo. Dá pra reativar quando quiser."}</p>
      <div class="zona-botoes">
        <button type="button" class="btn ${off ? "btn-pri" : "btn-perigo"}" id="zp-ativo">${off ? "Reativar restaurante" : "Desativar restaurante"}</button>
        ${off ? `<button type="button" class="btn btn-perigo" id="zp-excluir">Excluir de vez</button>` : ""}
      </div>
      ${off ? "" : `<small>Pra excluir de vez, desative primeiro.</small>`}
    </div>`;
}
function zonaPerigo(r) {
  $("zp-ativo").onclick = async () => {
    const desativar = r.ativo !== false;
    const ok = await perguntar(desativar
      ? { titulo: `Desativar ${esc(nomeRest(r))}?`, texto: "Na hora: o cardápio, o delivery e os outros links param, ninguém do restaurante entra no FluxON e o dono sai do app Owner. Nada é apagado; dá pra reativar depois.", sim: "Desativar", perigo: true }
      : { titulo: `Reativar ${esc(nomeRest(r))}?`, texto: "Tudo volta a funcionar como antes, com os mesmos dados.", sim: "Reativar" });
    if (!ok) return;
    try {
      await api(`/restaurants/${r.id}/ativo`, { metodo: "PATCH", corpo: { ativo: !desativar } });
      r.ativo = !desativar;
      r.desativado_em = desativar ? new Date().toISOString() : null;
      toast(desativar ? "Restaurante desativado" : "Restaurante reativado");
      desenharRestaurante();
    } catch (e) { toast(e.message, "erro"); }
  };
  $("zp-excluir")?.addEventListener("click", () => janelaExcluirRestaurante(r));
}
async function janelaExcluirRestaurante(r) {
  let c = null;
  try { c = await api(`/restaurants/${r.id}/contagem`); } catch {}
  const j = abrirJanela({
    titulo: `Excluir ${esc(nomeRest(r))} de vez?`,
    sub: "Isso não tem volta.",
    corpo: `
      <p style="color:var(--tx-2)">Apaga o restaurante e tudo ligado a ele${c ? `: <b>${c.pedidos}</b> pedido${c.pedidos === 1 ? "" : "s"}, <b>${c.clientes}</b> cliente${c.clientes === 1 ? "" : "s"},` : ":"} cardápio, caixa, fidelidade, vouchers, reservas e entregadores. Se ele quiser voltar depois, começa do zero.</p>
      <label class="campo"><span>Pra confirmar, digite <b>${esc(r.name)}</b></span><input class="inp" id="ex-nome" autocomplete="off" spellcheck="false"></label>`,
    pe: `<p class="erro"></p><button type="button" class="btn" data-fechar-pe>Cancelar</button><button type="button" class="btn btn-perigo" id="ex-ok" disabled>Excluir de vez</button>`
  });
  j.q("[data-fechar-pe]").onclick = j.fechar;
  const inp = j.q("#ex-nome"), bt = j.q("#ex-ok");
  inp.oninput = () => { bt.disabled = inp.value.trim().toLowerCase() !== String(r.name || "").trim().toLowerCase(); };
  bt.onclick = () => ocupado(bt, async () => {
    try {
      await api(`/restaurants/${r.id}/excluir`, { metodo: "POST", corpo: { confirmar: inp.value.trim() } });
      j.fechar();
      S.restaurantes = S.restaurantes.filter(x => x.id !== r.id);
      await carregarDonos().catch(() => {});
      limparSujo();
      toast("Restaurante excluído");
      ir("#/");
    } catch (e) { j.erro(e.message); }
  });
}

// --- Aparência
function secAparencia(el) {
  const c = S.cfg;
  const corCampo = (id, nome, v) => `
    <label class="cor"><input type="color" id="${id}" value="${esc(corValida(v) || "#000000")}">
      <div><b>${nome}</b><input type="text" data-hex="${id}" value="${esc((corValida(v) || "").toUpperCase())}" maxlength="7" spellcheck="false"></div></label>`;
  el.innerHTML = `
    ${cabecaSecao("Aparência", "Como o restaurante aparece no cardápio digital e no cardápio de mesa.")}
    <div class="aparencia">
      <div style="display:flex; flex-direction:column; gap:18px; min-width:0">
        <div class="bloco">
          <div class="grade-2">
            <label class="campo"><span>Nome que o cliente vê</span><input id="f-nome-exibicao" value="${esc(c.nome_exibicao || "")}" placeholder="${esc(S.atual.name)}"></label>
            <label class="campo"><span>Frase de baixo</span><input id="f-subtitulo" value="${esc(c.subtitulo || "")}" placeholder="Ex.: Pizzas artesanais desde 1998"></label>
          </div>
          <div class="campo"><span>Cores</span>
            <div class="cores">
              ${corCampo("f-cor-primaria", "Principal", c.cor_primaria || "#f97373")}
              ${corCampo("f-cor-secundaria", "Secundária", c.cor_secundaria || "#b91c1c")}
              ${corCampo("f-cor-fundo", "Fundo", c.cor_fundo || "#0c0a09")}
            </div>
          </div>
          <div class="campo"><span>Tema</span>
            <div class="seg" id="f-tema">${[["dark", "Escuro"], ["light", "Claro"]].map(([v, n]) => `<button type="button" data-v="${v}" class="${(c.tema || "dark") === v ? "on" : ""}">${n}</button>`).join("")}</div>
          </div>
        </div>
        <div class="bloco">
          <h3>Imagens</h3>
          <p>A logo é recortada quadrada. O banner aparece no topo do cardápio digital.</p>
          <div class="imagens">
            ${soltaImagem("logo", "Logo", c.logo_url)}
            ${soltaImagem("banner", "Banner", c.banner_url)}
          </div>
          <div class="campo"><span>Logo do cardápio de mesa (alongada)</span>
            ${soltaImagem("logo_fisico", "Logo alongada", c.logo_fisico_url, "solta-larga")}
          </div>
        </div>
      </div>
      <div>
        <div class="previa" id="previa"></div>
        <p class="previa-legenda">Prévia do topo do cardápio</p>
      </div>
    </div>`;
  const img = { logo: c.logo_url || "", banner: c.banner_url || "", logo_fisico: c.logo_fisico_url || "" };
  let tema = c.tema || "dark";
  const previa = () => {
    const pri = $("f-cor-primaria").value, sec = $("f-cor-secundaria").value, fundo = $("f-cor-fundo").value;
    const p = $("previa");
    p.style.setProperty("--pv-pri", pri); p.style.setProperty("--pv-sec", sec);
    p.style.setProperty("--pv-fundo", tema === "light" ? "#f7f3ef" : fundo);
    p.style.setProperty("--pv-texto", tema === "light" ? "#1c1414" : "#ffffff");
    const nome = val("f-nome-exibicao") || S.atual.name;
    p.innerHTML = `
      <div class="previa-banner" ${httpsOk(img.banner) ? `style="background-image:url('${esc(img.banner)}')"` : ""}></div>
      <div class="previa-corpo">
        <div class="previa-logo">${httpsOk(img.logo) ? `<img src="${esc(img.logo)}" alt="">` : esc(iniciais(nome))}</div>
        <div class="previa-nome">${esc(nome)}</div>
        <div class="previa-sub">${esc(val("f-subtitulo") || "Aberto agora")}</div>
        <div class="previa-cats"><span>Destaques</span><span>Lanches</span><span>Bebidas</span></div>
        <div class="previa-item"><span>X-Burger da casa</span><b>R$ 32,90</b></div>
        <div class="previa-btn">Ver sacola</div>
      </div>`;
  };
  // cor: seletor e texto andam juntos
  el.querySelectorAll('input[type="color"]').forEach(inp => inp.addEventListener("input", () => {
    el.querySelector(`[data-hex="${inp.id}"]`).value = inp.value.toUpperCase(); previa();
  }));
  el.querySelectorAll("[data-hex]").forEach(t => t.addEventListener("input", () => {
    let v = t.value.trim(); if (!v.startsWith("#")) v = "#" + v;
    if (corValida(v)) { $(t.dataset.hex).value = v.toLowerCase(); previa(); }
  }));
  ["f-nome-exibicao", "f-subtitulo"].forEach(id => $(id).addEventListener("input", previa));
  $("f-tema").onclick = (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    tema = b.dataset.v;
    $("f-tema").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    previa(); marcarSujo();
  };
  ligarSoltas(el, img, () => { previa(); marcarSujo(); });
  previa();
  S.salvar = async () => {
    const corpo = {
      nome_exibicao: val("f-nome-exibicao"), subtitulo: val("f-subtitulo"),
      cor_primaria: $("f-cor-primaria").value, cor_secundaria: $("f-cor-secundaria").value, cor_fundo: $("f-cor-fundo").value,
      tema, logo_url: img.logo, banner_url: img.banner, logo_fisico_url: img.logo_fisico
    };
    await api(`/restaurants/${S.atual.id}/config`, { metodo: "PATCH", corpo });
    Object.assign(S.cfg, corpo);
    Object.assign(S.atual, { nome_exibicao: corpo.nome_exibicao || null, logo_url: corpo.logo_url || null, cor_primaria: corpo.cor_primaria });
    toast("Aparência salva");
    desenharRestaurante();
  };
}

function soltaImagem(tipo, rotulo, url, extra = "") {
  const ok = httpsOk(url);
  return `
    <div class="solta ${extra}" data-solta="${tipo}">
      ${ok ? `<img src="${esc(ok)}" alt=""><button type="button" class="tirar" data-tirar="${tipo}" aria-label="Tirar imagem">${ico("x", "ico ico-sm")}</button><span class="rotulo">${rotulo}</span>`
           : `${ico("enviar")}<span>${rotulo}<br>clique ou arraste</span>`}
      <input type="file" accept="image/*" data-arquivo="${tipo}" data-sem-barra>
    </div>`;
}
function ligarSoltas(raiz, img, mudou) {
  const redesenhar = (tipo) => {
    const box = raiz.querySelector(`[data-solta="${tipo}"]`);
    const novo = document.createElement("div");
    novo.innerHTML = soltaImagem(tipo, { logo: "Logo", banner: "Banner", logo_fisico: "Logo alongada" }[tipo], img[tipo], box.classList.contains("solta-larga") ? "solta-larga" : "");
    box.replaceWith(novo.firstElementChild);
    ligar(tipo);
  };
  const ligar = (tipo) => {
    const box = raiz.querySelector(`[data-solta="${tipo}"]`);
    const input = box.querySelector("input[type=file]");
    input.onchange = async () => {
      let file = input.files[0];
      if (!file) return;
      if (tipo === "logo") { file = await openCropModal(file, { titulo: "Recortar logo" }); if (!file) { input.value = ""; return; } }
      box.innerHTML = `<div class="carregando" style="padding:0">Enviando...</div>`;
      try {
        const fd = new FormData();
        fd.append("file", file, file.name || "imagem.jpg");
        fd.append("bucket", tipo === "banner" ? "restaurante-banners" : "restaurante-logos");
        const d = await api(`${API_BASE}/api/v1/upload-image`, { metodo: "POST", form: fd });
        img[tipo] = d.url;
        mudou();
      } catch (e) { toast("Erro ao enviar a imagem: " + e.message, "erro"); }
      redesenhar(tipo);
    };
    box.querySelector("[data-tirar]")?.addEventListener("click", (e) => { e.preventDefault(); img[tipo] = ""; redesenhar(tipo); mudou(); });
    box.ondragover = (e) => { e.preventDefault(); box.classList.add("arrastando"); };
    box.ondragleave = () => box.classList.remove("arrastando");
    box.ondrop = () => box.classList.remove("arrastando");
  };
  Object.keys(img).forEach(t => raiz.querySelector(`[data-solta="${t}"]`) && ligar(t));
}

// --- Horários
function secHorarios(el) {
  const porDia = DIAS.map((_, d) => S.horarios.filter(h => Number(h.dia_semana) === d).map(h => ({ a: String(h.abertura).slice(0, 5), f: String(h.fechamento).slice(0, 5) })));
  const desenhar = () => {
    const vazio = porDia.every(t => !t.length);
    $("dias").innerHTML = porDia.map((turnos, d) => `
      <div class="dia">
        <label class="chave"><input type="checkbox" data-dia="${d}" ${turnos.length ? "checked" : ""}><i></i><span>${DIAS[d]}</span></label>
        <div class="turnos">
          ${turnos.length ? turnos.map((t, k) => `
            <div class="turno">
              <input type="time" value="${esc(t.a)}" data-d="${d}" data-k="${k}" data-c="a" aria-label="${DIAS[d]} abre">
              <span class="ate">até</span>
              <input type="time" value="${esc(t.f)}" data-d="${d}" data-k="${k}" data-c="f" aria-label="${DIAS[d]} fecha">
              ${k > 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-tirar-turno="${d}:${k}">${ico("x", "ico ico-sm")}</button>`
                      : turnos.length < 2 ? `<button type="button" class="btn btn-ghost btn-sm" data-add-turno="${d}">${ico("mais", "ico ico-sm")}Turno</button>` : ""}
            </div>`).join("") : `<span class="fechado-txt">Fechado</span>`}
        </div>
      </div>`).join("");
    $("aviso-horas").classList.toggle("hidden", !vazio);
  };
  el.innerHTML = `
    ${cabecaSecao("Horários", "Usados no cardápio (aberto/fechado), nos pedidos agendados e nas reservas. Horário que passa da meia-noite pode: 18:00 até 02:00.",
      `<button type="button" class="btn btn-ia" id="btn-ia-buscar">${ico("brilho")}Buscar na internet</button>`)}
    <div class="aviso hidden" id="aviso-horas">Sem nenhum dia aberto, o cardápio considera o restaurante sempre aberto.</div>
    <div class="bloco">
      <div class="dias" id="dias"></div>
      <div><button type="button" class="btn btn-sm" id="copiar-seg">${ico("copiar", "ico ico-sm")}Copiar segunda pros outros dias abertos</button></div>
    </div>`;
  desenhar();
  $("btn-ia-buscar").onclick = () => janelaBuscarIA();
  $("dias").addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.dia !== undefined) { const d = +t.dataset.dia; porDia[d] = t.checked ? [{ a: "18:00", f: "23:00" }] : []; desenhar(); }
    if (t.dataset.c) porDia[+t.dataset.d][+t.dataset.k][t.dataset.c] = t.value;
  });
  $("dias").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-turno]"), tira = e.target.closest("[data-tirar-turno]");
    if (add) { porDia[+add.dataset.addTurno].push({ a: "18:00", f: "23:00" }); desenhar(); marcarSujo(); }
    if (tira) { const [d, k] = tira.dataset.tirarTurno.split(":").map(Number); porDia[d].splice(k, 1); desenhar(); marcarSujo(); }
  });
  $("copiar-seg").onclick = () => {
    if (!porDia[1].length) return toast("Abra a segunda primeiro.", "erro");
    porDia.forEach((t, d) => { if (d !== 1 && t.length) porDia[d] = porDia[1].map(x => ({ ...x })); });
    desenhar(); marcarSujo();
  };
  S.salvar = async () => {
    const horarios = porDia.flatMap((t, d) => t.map(x => ({ dia_semana: d, abertura: x.a, fechamento: x.f })));
    if (horarios.some(h => !h.abertura || !h.fechamento)) throw new Error("Preencha os horários de abrir e fechar.");
    await api(`/restaurants/${S.atual.id}/horarios`, { metodo: "PATCH", corpo: { horarios } });
    S.horarios = horarios.map(h => ({ ...h, abertura: h.abertura + ":00", fechamento: h.fechamento + ":00" }));
    toast("Horários salvos");
  };
}

// --- Operação
function secOperacao(el) {
  const c = S.cfg;
  const listas = { online: [...(c.pagamento_online || [])], entrega: [...(c.pagamento_entrega || [])] };
  const fichas = (qual) => {
    const lista = listas[qual];
    const todas = [...PAGAMENTOS, ...lista.filter(v => !PAGAMENTOS.some(p => p.toLowerCase() === String(v).toLowerCase()))];
    return todas.map(p => `<button type="button" class="ficha ${lista.some(v => String(v).toLowerCase() === p.toLowerCase()) ? "on" : ""}" data-pag="${qual}" data-v="${esc(p)}">${esc(p)}</button>`).join("")
      + `<input class="ficha-input" data-nova="${qual}" placeholder="+ outra forma" data-sem-barra>`;
  };
  el.innerHTML = `
    ${cabecaSecao("Operação", "Contato, salão, delivery, agendamento e formas de pagamento.",
      `<button type="button" class="btn btn-ia" id="btn-ia-buscar">${ico("brilho")}Buscar na internet</button>`)}
    <div class="bloco">
      <h3>Contato</h3>
      <div class="grade-2">
        <label class="campo"><span>Telefone / WhatsApp</span><input id="f-telefone" inputmode="tel" value="${esc(c.telefone || "")}"></label>
        <label class="campo"><span>Instagram</span><input id="f-instagram" value="${esc(c.instagram || "")}" placeholder="@restaurante"></label>
      </div>
      <label class="campo"><span>Endereço</span><input id="f-endereco" value="${esc(c.endereco || "")}" placeholder="Rua, número, bairro, cidade"></label>
      <label class="campo"><span>Link de avaliação do Google</span><input id="f-google" value="${esc(c.google_avaliacao_url || "")}" placeholder="https://g.page/r/.../review"><small>Pra onde vai quem dá nota alta na pesquisa de satisfação.</small></label>
    </div>
    <div class="bloco">
      <h3>Salão e delivery</h3>
      <div class="grade">
        <label class="campo"><span>Mesas no salão</span><input id="f-mesas" type="number" min="0" value="${esc(c.num_mesas ?? 10)}"></label>
        <label class="campo"><span>Pedido mínimo (R$)</span><input id="f-minimo" type="number" min="0" step="0.01" value="${esc(c.pedido_minimo ?? 0)}"></label>
        <label class="campo"><span>Entrega mais rápida (min)</span><input id="f-ent-min" type="number" min="0" value="${esc(c.tempo_entrega_min ?? "")}"></label>
        <label class="campo"><span>Entrega mais demorada (min)</span><input id="f-ent-max" type="number" min="0" value="${esc(c.tempo_entrega_max ?? "")}"></label>
      </div>
    </div>
    <div class="bloco">
      <h3>Pedido agendado</h3>
      <label class="chave"><input type="checkbox" id="f-agendamento" ${c.agendamento_ativo ? "checked" : ""}><i></i><span>Aceitar pedido agendado quando estiver fechado<small>O cliente escolhe um horário e paga no Pix. O pedido entra sozinho na hora certa.</small></span></label>
      <label class="campo" style="max-width:260px"><span>Antecedência mínima (min)</span><input id="f-agend-min" type="number" min="0" max="180" value="${esc(c.agendamento_antecedencia_min ?? 30)}"></label>
    </div>
    <div class="bloco">
      <h3>Formas de pagamento</h3>
      <div class="campo"><span>Online (no site)</span><div class="fichas" id="pag-online">${fichas("online")}</div></div>
      <div class="campo"><span>Na entrega</span><div class="fichas" id="pag-entrega">${fichas("entrega")}</div></div>
    </div>`;
  $("btn-ia-buscar").onclick = () => janelaBuscarIA();
  const redesenhar = (qual) => { $(qual === "online" ? "pag-online" : "pag-entrega").innerHTML = fichas(qual); };
  el.addEventListener("click", (e) => {
    const f = e.target.closest("[data-pag]"); if (!f) return;
    const lista = listas[f.dataset.pag], v = f.dataset.v;
    const i = lista.findIndex(x => String(x).toLowerCase() === v.toLowerCase());
    i >= 0 ? lista.splice(i, 1) : lista.push(v);
    redesenhar(f.dataset.pag); marcarSujo();
  });
  el.addEventListener("keydown", (e) => {
    const inp = e.target.closest("[data-nova]");
    if (!inp || e.key !== "Enter") return;
    e.preventDefault();
    const v = inp.value.trim(); if (!v) return;
    if (!listas[inp.dataset.nova].some(x => String(x).toLowerCase() === v.toLowerCase())) listas[inp.dataset.nova].push(v);
    redesenhar(inp.dataset.nova); marcarSujo();
    el.querySelector(`[data-nova="${inp.dataset.nova}"]`)?.focus();
  });
  S.salvar = async () => {
    const num = (id) => val(id) === "" ? null : Number(val(id));
    const corpo = {
      telefone: val("f-telefone"), instagram: val("f-instagram"), endereco: val("f-endereco"), google_avaliacao_url: val("f-google"),
      num_mesas: parseInt(val("f-mesas")) || 0, pedido_minimo: parseFloat(val("f-minimo")) || 0,
      tempo_entrega_min: num("f-ent-min"), tempo_entrega_max: num("f-ent-max"),
      agendamento_ativo: $("f-agendamento").checked,
      agendamento_antecedencia_min: Math.min(180, Math.max(0, parseInt(val("f-agend-min")) || 0)),
      pagamento_online: listas.online, pagamento_entrega: listas.entrega
    };
    if (corpo.google_avaliacao_url && !httpsOk(corpo.google_avaliacao_url)) throw new Error("O link do Google tem que começar com https://");
    await api(`/restaurants/${S.atual.id}/config`, { metodo: "PATCH", corpo });
    Object.assign(S.cfg, corpo);
    toast("Operação salva");
  };
}

// --- Endereços (domínios)
const DOMINIOS = [
  ["cardapio_url", "Cardápio de mesa", "Aberto pelo QR code da mesa", "livro"],
  ["cardapio_delivery_url", "Cardápio delivery", "Pedidos e fidelidade", "loja"],
  ["central_url", "Central do cliente", "Link da bio com todos os botões", "casa"],
  ["vouchers_url", "Vale-presente", "Página de compra", "presente"],
  ["reservas_url", "Reservas", "Página de reserva de mesa", "calendario"],
  ["avaliacao_url", "Avaliação", "Pesquisa de satisfação", "brilho"]
];
function secEnderecos(el) {
  const r = S.atual;
  el.innerHTML = `
    ${cabecaSecao("Endereços", "O domínio de cada página do restaurante. Escreva sem https://, por exemplo pizzariax.com.br. Vale na hora depois de salvar.")}
    <div class="bloco"><div class="dominios">
      ${DOMINIOS.map(([k, n, d, i]) => `
        <div class="dominio">
          <span class="dominio-ico ${r[k] ? "on" : ""}">${ico(i)}</span>
          <div><b>${n}</b><small>${d}</small></div>
          <div class="prefixo"><b>https://</b><input class="inp" data-dom="${k}" value="${esc(r[k] || "")}" placeholder="dominio.com.br" spellcheck="false" autocapitalize="off"></div>
          ${r[k] ? `<a class="btn btn-ghost btn-icone" href="https://${esc(r[k])}" target="_blank" rel="noopener" title="Abrir">${ico("externo")}</a>` : `<span></span>`}
        </div>`).join("")}
    </div></div>`;
  S.salvar = async () => {
    const corpo = {};
    el.querySelectorAll("[data-dom]").forEach(i => { corpo[i.dataset.dom] = i.value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, ""); });
    const d = await api(`/restaurants/${r.id}/dominios`, { metodo: "PATCH", corpo });
    Object.assign(r, d.dominios || {});
    toast("Endereços salvos. Já valem agora.");
    desenharSecao();
  };
}

// ===== DONOS (app FluxON Owner) =====
// Cada pessoa entra no app com o próprio CPF + WhatsApp. Casal que cuida junto = duas pessoas no mesmo restaurante.

function lojaChip(rid) {
  const r = S.restaurantes.find(x => x.id === rid);
  if (!r) return "";
  const logo = httpsOk(r.logo_url);
  return `<a class="loja" href="#/r/${esc(r.id)}/donos" style="--c:${corValida(r.cor_primaria) || corDe(r.name)}"><i>${logo ? `<img src="${esc(logo)}" alt="">` : esc(iniciais(nomeRest(r)))}</i>${esc(nomeRest(r))}</a>`;
}

function telaDonos() {
  S.atual = null;
  const lista = [...S.donos].sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome));
  $("palco").innerHTML = `
    <div class="cabeca">
      <div>
        <h1>Donos</h1>
        <p>Quem entra no app FluxON Owner. Cada pessoa usa o próprio CPF e WhatsApp.</p>
      </div>
      <button type="button" class="btn btn-pri" id="btn-nova-pessoa">${ico("mais")}Nova pessoa</button>
    </div>
    ${!S.donosOk ? `<div class="aviso">Não deu pra carregar os donos agora. Recarregue a página.</div>` : ""}
    <div class="pessoas">
      ${lista.length ? lista.map(o => `
        <article class="pessoa ${o.ativo ? "" : "off"}">
          <div class="pessoa-topo">
            <span class="avatar" style="--h:${corDe(o.nome)}">${esc(iniciais(o.nome))}</span>
            <div><b>${esc(o.nome)}</b><small>${esc(fmtTel(o.telefone))} · ${esc(quando(o.ultimo_login))}</small></div>
            <span class="estado ${o.ativo ? "" : "off"}">${o.ativo ? "Ativo" : "Desativado"}</span>
          </div>
          <div class="lojas">${(o.restaurant_ids || []).map(lojaChip).join("") || `<span class="dica">Sem restaurante</span>`}</div>
          <div class="pessoa-pe">
            <button type="button" class="btn btn-sm" data-editar="${esc(o.id)}">${ico("editar", "ico ico-sm")}Editar</button>
            <button type="button" class="btn btn-sm btn-ghost ${o.ativo ? "btn-perigo" : ""}" data-ativo="${esc(o.id)}">${o.ativo ? "Desativar" : "Reativar"}</button>
            ${o.ativo ? "" : `<button type="button" class="btn btn-sm btn-ghost btn-perigo" data-excluir="${esc(o.id)}">Excluir de vez</button>`}
          </div>
        </article>`).join("") : `<div class="vazio" style="grid-column:1/-1"><b>Ninguém cadastrado ainda</b>Cadastre o dono de um restaurante pra ele acompanhar tudo pelo app.</div>`}
    </div>`;
  $("btn-nova-pessoa").onclick = () => janelaPessoa();
  $("palco").onclick = (e) => {
    const ed = e.target.closest("[data-editar]"), at = e.target.closest("[data-ativo]");
    if (ed) janelaPessoa(S.donos.find(o => o.id === ed.dataset.editar));
    if (at) alternarAtivo(S.donos.find(o => o.id === at.dataset.ativo));
    const ex = e.target.closest("[data-excluir]");
    if (ex) excluirPessoa(S.donos.find(o => o.id === ex.dataset.excluir));
  };
}

async function excluirPessoa(o) {
  if (!o) return;
  const ok = await perguntar({ titulo: `Excluir ${esc(o.nome)} de vez?`, texto: "Apaga o cadastro dele. Não tem volta: pra ele usar o app de novo, cadastre outra vez com o CPF.", sim: "Excluir de vez", perigo: true });
  if (!ok) return;
  try {
    await api(`/owners/${o.id}`, { metodo: "DELETE" });
    await carregarDonos();
    toast("Pessoa excluída");
    telaDonos();
  } catch (e) { toast(e.message, "erro"); }
}

async function alternarAtivo(o, depois = telaDonos) {
  if (!o) return;
  const ok = await perguntar(o.ativo
    ? { titulo: `Desativar ${o.nome}?`, texto: "Ele sai do app em todos os aparelhos e não consegue entrar de novo até ser reativado.", sim: "Desativar", perigo: true }
    : { titulo: `Reativar ${o.nome}?`, texto: "Ele volta a conseguir entrar no app com o CPF e o WhatsApp dele.", sim: "Reativar" });
  if (!ok) return;
  try {
    await api(`/owners/${o.id}`, { metodo: "PATCH", corpo: { ativo: !o.ativo } });
    o.ativo = !o.ativo;
    toast(o.ativo ? "Acesso reativado" : "Acesso desativado");
    depois();
  } catch (e) { toast(e.message, "erro"); }
}

// janela de pessoa: nova (com CPF) ou editar (nome, WhatsApp, restaurantes)
function janelaPessoa(o = null, { restauranteFixo = null, aoSalvar } = {}) {
  const nova = !o;
  const marcados = new Set(o?.restaurant_ids || (restauranteFixo ? [restauranteFixo] : []));
  const j = abrirJanela({
    titulo: nova ? "Nova pessoa" : `Editar ${esc(o.nome)}`,
    sub: nova ? "Ela entra no app FluxON Owner com este CPF e recebe o código de acesso neste WhatsApp." : "Trocar o WhatsApp desconecta os aparelhos dela.",
    corpo: `
      <label class="campo"><span>Nome</span><input id="p-nome" value="${esc(o?.nome || "")}" autocomplete="off"></label>
      <div class="grade-2">
        ${nova ? `<label class="campo"><span>CPF</span><input id="p-cpf" inputmode="numeric" placeholder="000.000.000-00" autocomplete="off"></label>` : ""}
        <label class="campo"><span>WhatsApp com DDD</span><input id="p-tel" inputmode="tel" placeholder="(14) 99999-9999" value="${esc(o ? fmtTel(o.telefone) : "")}" autocomplete="off"></label>
      </div>
      <div class="campo"><span>Restaurantes que ela acompanha</span>
        <div class="checklist">${S.restaurantes.map(r => `<label><input type="checkbox" value="${esc(r.id)}" ${marcados.has(r.id) ? "checked" : ""}>${esc(nomeRest(r))}<small>${esc((PLANOS.find(p => p[0] === r.plan) || ["", ""])[1])}</small></label>`).join("")}</div>
      </div>
      ${nova ? `<p class="dica">Marido e mulher cuidam juntos? Cadastre cada um com o próprio CPF e WhatsApp, marcando o mesmo restaurante. Os dois podem ficar logados ao mesmo tempo.</p>` : ""}`,
    pe: `<p class="erro"></p><button type="button" class="btn" data-fechar-pe>Cancelar</button><button type="button" class="btn btn-pri" id="p-salvar">${nova ? "Cadastrar" : "Salvar"}</button>`
  });
  j.q("[data-fechar-pe]").onclick = j.fechar;
  mascaraTel(j.q("#p-tel"));
  if (nova) mascaraCpf(j.q("#p-cpf"));
  j.q("#p-salvar").onclick = () => ocupado(j.q("#p-salvar"), async () => {
    j.erro("");
    const nome = j.q("#p-nome").value.trim(), tel = so(j.q("#p-tel").value);
    const ids = [...j.el.querySelectorAll(".checklist input:checked")].map(i => i.value);
    if (!nome) return j.erro("Escreva o nome.");
    if (tel.length < 10) return j.erro("WhatsApp com DDD, só números.");
    if (!ids.length) return j.erro("Marque pelo menos um restaurante.");
    try {
      if (nova) {
        const cpf = so(j.q("#p-cpf").value);
        if (cpf.length !== 11) return j.erro("CPF com 11 números.");
        await api("/owners", { metodo: "POST", corpo: { nome, cpf, telefone: tel, restaurant_ids: ids } });
        toast(`${nome.split(" ")[0]} já pode entrar no app`);
      } else {
        const corpo = {};
        if (nome !== o.nome) corpo.nome = nome;
        if (so(o.telefone).replace(/^55/, "") !== tel.replace(/^55/, "")) corpo.telefone = tel;
        if (Object.keys(corpo).length) await api(`/owners/${o.id}`, { metodo: "PATCH", corpo });
        const antes = [...(o.restaurant_ids || [])].sort().join(), depois = [...ids].sort().join();
        if (antes !== depois) await api(`/owners/${o.id}/restaurantes`, { metodo: "PUT", corpo: { restaurant_ids: ids } });
        toast("Salvo");
      }
      j.fechar();
      await carregarDonos();
      aoSalvar ? aoSalvar() : rotear();
    } catch (e) { j.erro(e.message); }
  });
}

// --- seção "Donos e acesso" dentro do restaurante
function secDonos(el) {
  const r = S.atual;
  const donos = donosDe(r.id);
  el.innerHTML = `
    ${cabecaSecao("Donos e acesso", `Quem acompanha ${esc(nomeRest(r))} pelo app FluxON Owner.`,
      `<button type="button" class="btn btn-pri" id="btn-dar-acesso">${ico("mais")}Dar acesso</button>`)}
    ${!S.donosOk ? `<div class="aviso">Não deu pra carregar os donos agora. Recarregue a página.</div>` : ""}
    <div class="bloco">
      ${donos.length ? `<div>${donos.map(o => `
        <div class="linha-pessoa" style="${o.ativo ? "" : "opacity:.55"}">
          <span class="avatar" style="--h:${corDe(o.nome)}">${esc(iniciais(o.nome))}</span>
          <div><b>${esc(o.nome)}${o.ativo ? "" : " (desativado)"}</b><small>${esc(fmtTel(o.telefone))} · ${esc(quando(o.ultimo_login))}${(o.restaurant_ids || []).length > 1 ? ` · mais ${o.restaurant_ids.length - 1} restaurante(s)` : ""}</small></div>
          <button type="button" class="btn btn-sm" data-editar="${esc(o.id)}">${ico("editar", "ico ico-sm")}<span class="so-pc">Editar</span></button>
          <button type="button" class="btn btn-sm btn-ghost btn-perigo" data-tirar="${esc(o.id)}">Tirar</button>
        </div>`).join("")}</div>`
      : `<div class="vazio" style="border:0; padding:24px 10px"><b>Ninguém acompanha este restaurante</b>Dê acesso ao dono pra ele ver vendas, caixa e avaliações no app.</div>`}
    </div>
    <p class="dica">O dono entra no app com o CPF e o WhatsApp dele e recebe um código no WhatsApp a cada login. Casal que cuida junto: cadastre os dois.</p>`;
  $("btn-dar-acesso").onclick = janelaDarAcesso;
  el.onclick = async (e) => {
    const ed = e.target.closest("[data-editar]"), ti = e.target.closest("[data-tirar]");
    if (ed) janelaPessoa(S.donos.find(o => o.id === ed.dataset.editar), { aoSalvar: desenharRestaurante });
    if (ti) tirarAcesso(S.donos.find(o => o.id === ti.dataset.tirar));
  };
}

async function tirarAcesso(o) {
  const r = S.atual;
  if (!o) return;
  const outros = (o.restaurant_ids || []).filter(id => id !== r.id);
  if (!outros.length) {
    // o sistema pede pelo menos um restaurante por pessoa: aqui o jeito é desativar
    return alternarAtivo(o, desenharRestaurante);
  }
  const ok = await perguntar({ titulo: `Tirar ${o.nome} deste restaurante?`, texto: `Ele continua vendo os outros ${outros.length} restaurante(s) no app.`, sim: "Tirar acesso", perigo: true });
  if (!ok) return;
  try {
    await api(`/owners/${o.id}/restaurantes`, { metodo: "PUT", corpo: { restaurant_ids: outros } });
    await carregarDonos();
    toast("Acesso retirado");
    desenharRestaurante();
  } catch (e) { toast(e.message, "erro"); }
}

function janelaDarAcesso() {
  const r = S.atual;
  const disponiveis = S.donos.filter(o => !(o.restaurant_ids || []).includes(r.id));
  if (!disponiveis.length) return janelaPessoa(null, { restauranteFixo: r.id, aoSalvar: desenharRestaurante });
  const j = abrirJanela({
    titulo: "Dar acesso",
    sub: `Escolha quem vai acompanhar ${esc(nomeRest(r))} no app.`,
    corpo: `
      <label class="busca" style="max-width:none">${ico("busca")}<input class="inp" id="da-busca" placeholder="Buscar pessoa" autocomplete="off"></label>
      <div class="checklist" id="da-lista"></div>
      <button type="button" class="btn" id="da-nova">${ico("mais")}Cadastrar pessoa nova</button>`,
    pe: `<p class="erro"></p><button type="button" class="btn" data-fechar-pe>Cancelar</button><button type="button" class="btn btn-pri" id="da-ok">Dar acesso</button>`
  });
  const desenhar = () => {
    const q = j.q("#da-busca").value.trim().toLowerCase();
    j.q("#da-lista").innerHTML = disponiveis.filter(o => !q || o.nome.toLowerCase().includes(q))
      .map(o => `<label><input type="radio" name="da" value="${esc(o.id)}">${esc(o.nome)}<small>${esc(fmtTel(o.telefone))}</small></label>`).join("")
      || `<p class="dica" style="padding:10px">Ninguém com esse nome.</p>`;
  };
  desenhar();
  j.q("#da-busca").oninput = desenhar;
  j.q("[data-fechar-pe]").onclick = j.fechar;
  j.q("#da-nova").onclick = () => { j.fechar(); janelaPessoa(null, { restauranteFixo: r.id, aoSalvar: desenharRestaurante }); };
  j.q("#da-ok").onclick = () => ocupado(j.q("#da-ok"), async () => {
    const id = j.el.querySelector("input[name=da]:checked")?.value;
    if (!id) return j.erro("Escolha uma pessoa.");
    const o = S.donos.find(x => x.id === id);
    try {
      await api(`/owners/${id}/restaurantes`, { metodo: "PUT", corpo: { restaurant_ids: [...(o.restaurant_ids || []), r.id] } });
      j.fechar();
      await carregarDonos();
      toast(`${o.nome.split(" ")[0]} agora acompanha ${nomeRest(r)}`);
      desenharRestaurante();
    } catch (e) { j.erro(e.message); }
  });
}

// ===== NOVO RESTAURANTE =====
function janelaNovoRestaurante() {
  let plano = "essential", dono = S.donos.length ? "existente" : "nova";
  const j = abrirJanela({
    titulo: "Novo restaurante",
    corpo: `
      <div class="grade-2">
        <label class="campo"><span>Nome</span><input id="n-nome" autocomplete="off" placeholder="Pizzaria do Zé"></label>
        <label class="campo"><span>E-mail de login (Google)</span><input id="n-email" type="email" autocomplete="off" placeholder="contato@gmail.com"></label>
      </div>
      <div class="campo"><span>Plano</span><div class="seg" id="n-plano">${PLANOS.map(([v, n]) => `<button type="button" data-v="${v}" class="${v === plano ? "on" : ""}">${n}</button>`).join("")}</div></div>
      <div class="campo"><span>Dono no app</span>
        <div class="seg" id="n-dono">${[["existente", "Já cadastrado"], ["nova", "Pessoa nova"], ["depois", "Depois"]].map(([v, n]) => `<button type="button" data-v="${v}" class="${v === dono ? "on" : ""}" ${v === "existente" && !S.donos.length ? "disabled" : ""}>${n}</button>`).join("")}</div>
      </div>
      <div id="n-dono-campos"></div>
      <div class="bloco" style="padding:14px; gap:10px; background:var(--bg)">
        <label class="campo"><span>Cidade (opcional)</span><input id="n-cidade" autocomplete="off" placeholder="Lençóis Paulista" value="${esc(lerLocal("fx_admin_cidade") || "")}"></label>
        <small class="dica">${ico("brilho", "ico ico-sm")} Com a cidade, a IA procura telefone, endereço, Instagram e horários na internet logo depois de criar. Você confere antes de salvar.</small>
      </div>`,
    pe: `<p class="erro"></p><button type="button" class="btn" data-fechar-pe>Cancelar</button><button type="button" class="btn btn-pri" id="n-criar">Criar restaurante</button>`
  });
  const campos = () => {
    j.q("#n-dono-campos").innerHTML = dono === "existente"
      ? `<label class="campo"><span>Quem é o dono</span><select id="n-dono-id">${[...S.donos].sort((a, b) => a.nome.localeCompare(b.nome)).map(o => `<option value="${esc(o.id)}">${esc(o.nome)} · ${esc(fmtTel(o.telefone))}</option>`).join("")}</select></label>`
      : dono === "nova"
      ? `<div class="grade-2"><label class="campo"><span>Nome do dono</span><input id="n-p-nome" autocomplete="off"></label>
           <label class="campo"><span>CPF</span><input id="n-p-cpf" inputmode="numeric" placeholder="000.000.000-00" autocomplete="off"></label></div>
         <label class="campo"><span>WhatsApp com DDD</span><input id="n-p-tel" inputmode="tel" placeholder="(14) 99999-9999" autocomplete="off"></label>`
      : `<p class="dica">Dá pra cadastrar o dono depois, em Donos e acesso.</p>`;
    if (dono === "nova") { mascaraCpf(j.q("#n-p-cpf")); mascaraTel(j.q("#n-p-tel")); }
  };
  campos();
  const seg = (sel, fn) => j.q(sel).onclick = (e) => {
    const b = e.target.closest("[data-v]"); if (!b || b.disabled) return;
    j.q(sel).querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    fn(b.dataset.v);
  };
  seg("#n-plano", v => plano = v);
  seg("#n-dono", v => { dono = v; campos(); });
  j.q("[data-fechar-pe]").onclick = j.fechar;
  j.q("#n-criar").onclick = () => ocupado(j.q("#n-criar"), async () => {
    j.erro("");
    const name = j.q("#n-nome").value.trim(), email = j.q("#n-email").value.trim(), cidade = j.q("#n-cidade").value.trim();
    if (!name || !email) return j.erro("Preencha o nome e o e-mail.");
    let pessoa = null;
    if (dono === "nova") {
      pessoa = { nome: j.q("#n-p-nome").value.trim(), cpf: so(j.q("#n-p-cpf").value), telefone: so(j.q("#n-p-tel").value) };
      if (!pessoa.nome || pessoa.cpf.length !== 11 || pessoa.telefone.length < 10) return j.erro("Preencha nome, CPF (11 números) e WhatsApp do dono.");
    }
    let novo;
    try {
      novo = (await api("/restaurants", { metodo: "POST", corpo: { name, email, plan: plano } })).restaurant;
    } catch (e) { return j.erro(e.message); }
    // o restaurante já existe; se o dono der erro, avisa mas segue
    try {
      if (dono === "existente") {
        const o = S.donos.find(x => x.id === j.q("#n-dono-id").value);
        if (o) await api(`/owners/${o.id}/restaurantes`, { metodo: "PUT", corpo: { restaurant_ids: [...(o.restaurant_ids || []), novo.id] } });
      } else if (pessoa) {
        await api("/owners", { metodo: "POST", corpo: { ...pessoa, restaurant_ids: [novo.id] } });
      }
    } catch (e) { toast("Restaurante criado, mas o dono deu erro: " + e.message, "erro"); }
    if (cidade) gravarLocal("fx_admin_cidade", cidade);
    j.fechar();
    toast(`${name} criado`);
    await Promise.all([carregarRestaurantes(), carregarDonos()]);
    location.hash = `#/r/${novo.id}/operacao`;
    if (cidade) setTimeout(() => janelaBuscarIA({ cidade, autoBuscar: true }), 400);
  });
}

// ===== ABRIR NO FLUXON (impersonação numa aba nova) =====
async function impersonarRestaurante(id) {
  // a aba abre já no clique (se abrir depois do fetch, o navegador bloqueia como pop-up)
  const aba = window.open("about:blank", "_blank");
  if (aba) aba.document.write('<body style="background:#161012;color:#f5ece9;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">Abrindo o FluxON...</body>');
  try {
    const data = await api("/impersonate", { metodo: "POST", corpo: { restaurant_id: id } });
    const url = `${OPERACIONAL_URL}/#imp=${encodeURIComponent(data.token)}&n=${encodeURIComponent(data.restaurant?.name || "")}`;
    if (aba) { aba.opener = null; aba.location.replace(url); }
    else location.href = url;
  } catch (e) {
    aba?.close();
    toast("Não deu pra abrir: " + e.message, "erro");
  }
}

// ===== CARDÁPIO + IMPORTAR COM IA =====
// Fotos/PDF → a IA monta o rascunho → o admin revisa → grava tudo de uma vez.
const normNome = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function secCardapio(el) {
  const r = S.atual;
  if (!S.ia) S.ia = { etapa: "escolher", arquivos: [], resultado: null, existentes: new Set(), itens: null };
  el.innerHTML = `
    ${cabecaSecao("Cardápio", "Os itens são editados no FluxON do restaurante. Aqui você monta o cardápio inicial com a IA.",
      `<button type="button" class="btn" id="btn-ver-cardapio">${ico("externo")}Editar no FluxON</button>`)}
    <div class="bloco" id="resumo-cardapio"><div class="carregando">Contando os itens...</div></div>
    <div class="bloco" id="ia-area"></div>`;
  $("btn-ver-cardapio").onclick = () => impersonarRestaurante(r.id);
  desenharIA();
  try {
    const itens = await fetch(`${API_BASE}/api/v1/cardapio/${r.id}?admin=true`).then(x => x.json());
    if (S.atual?.id !== r.id || !$("resumo-cardapio")) return;
    S.ia.itens = Array.isArray(itens) ? itens : [];
    S.ia.existentes = new Set(S.ia.itens.map(i => normNome(i.nome)));
    const porCat = {};
    S.ia.itens.forEach(i => { porCat[i.categoria || "Geral"] = (porCat[i.categoria || "Geral"] || 0) + 1; });
    $("resumo-cardapio").innerHTML = S.ia.itens.length
      ? `<h3>${S.ia.itens.length} itens em ${Object.keys(porCat).length} categorias</h3>
         <div class="resumo-cardapio">${Object.entries(porCat).map(([c, n]) => `<span class="cat-pilula">${esc(c)}<em>${n}</em></span>`).join("")}</div>`
      : `<h3>Cardápio vazio</h3><p>Mande as fotos ou o PDF do cardápio aqui embaixo e a IA cadastra tudo pra você.</p>`;
    if (S.ia.etapa === "revisar") desenharIA(); // marca os repetidos
  } catch {
    $("resumo-cardapio").innerHTML = `<p class="dica">Não deu pra contar os itens agora.</p>`;
  }
}

function desenharIA() {
  const box = $("ia-area");
  if (!box) return;
  const ia = S.ia;
  if (ia.etapa === "lendo") {
    box.innerHTML = `<div class="lendo"><b>Lendo o cardápio...</b><p>${ia.arquivos.length} arquivo(s). Costuma levar de 20 segundos a 1 minuto. Pode deixar aberto.</p></div>`;
    return;
  }
  if (ia.etapa === "feito") {
    box.innerHTML = `
      <div class="aviso aviso-ok">${ia.feito.criados} itens adicionados${ia.feito.categorias_novas.length ? `, com as categorias novas ${esc(ia.feito.categorias_novas.join(", "))}` : ""}.</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <button type="button" class="btn btn-ok" id="ia-abrir">${ico("externo")}Conferir no FluxON</button>
        <button type="button" class="btn" id="ia-mais">Importar mais páginas</button>
      </div>`;
    $("ia-abrir").onclick = () => impersonarRestaurante(S.atual.id);
    $("ia-mais").onclick = () => { S.ia = { ...S.ia, etapa: "escolher", arquivos: [], resultado: null }; secCardapio($("secao")); };
    return;
  }
  if (ia.etapa === "revisar") return desenharRevisao(box);

  // escolher arquivos
  box.innerHTML = `
    <h3>${ico("brilho", "ico ico-sm")} Importar com IA</h3>
    <p>Fotos do cardápio (uma por página) ou o PDF. Até 10 arquivos.</p>
    <div class="ia-solta" id="ia-solta">
      ${ico("enviar")}
      <b>Arraste aqui ou toque pra escolher</b>
      <small>JPG, PNG, WEBP ou PDF</small>
      <input type="file" id="ia-arquivos" accept="image/*,application/pdf" multiple data-sem-barra>
    </div>
    ${ia.arquivos.length ? `
      <div class="arquivos">${ia.arquivos.map((a, k) => `
        <div class="arquivo">${a.previa ? `<img src="${a.previa}" alt="">` : `<span>${ico("livro")}<br>${esc(a.nome)}</span>`}
          <button type="button" data-tirar-arq="${k}" aria-label="Tirar">${ico("x", "ico ico-sm")}</button></div>`).join("")}</div>
      <div><button type="button" class="btn btn-pri" id="ia-ler">${ico("brilho")}Ler ${ia.arquivos.length} arquivo${ia.arquivos.length > 1 ? "s" : ""} com a IA</button></div>` : ""}`;
  const solta = $("ia-solta"), input = $("ia-arquivos");
  input.onchange = () => { adicionarArquivosIA([...input.files]); input.value = ""; };
  solta.ondragover = (e) => { e.preventDefault(); solta.classList.add("arrastando"); };
  solta.ondragleave = () => solta.classList.remove("arrastando");
  solta.ondrop = (e) => { e.preventDefault(); solta.classList.remove("arrastando"); adicionarArquivosIA([...e.dataTransfer.files]); };
  box.querySelectorAll("[data-tirar-arq]").forEach(b => b.onclick = () => { ia.arquivos.splice(+b.dataset.tirarArq, 1); desenharIA(); });
  $("ia-ler")?.addEventListener("click", lerCardapioIA);
}

// fotos grandes são reduzidas antes de subir (fica mais rápido e a IA lê igual)
async function prepararImagem(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const max = 2200, escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (escala === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * escala); cv.height = Math.round(bmp.height * escala);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

async function adicionarArquivosIA(lista) {
  const ia = S.ia;
  for (const f of lista) {
    if (ia.arquivos.length >= 10) { toast("No máximo 10 arquivos por vez.", "erro"); break; }
    const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!pdf && !f.type.startsWith("image/")) { toast(`${f.name} não é foto nem PDF.`, "erro"); continue; }
    const file = pdf ? f : await prepararImagem(f);
    if (file.size > 15 * 1024 * 1024) { toast(`${f.name} passa de 15 MB.`, "erro"); continue; }
    ia.arquivos.push({ file, nome: f.name, previa: pdf ? null : URL.createObjectURL(file) });
  }
  desenharIA();
}

async function lerCardapioIA() {
  const ia = S.ia, rid = S.atual.id;
  const fd = new FormData();
  ia.arquivos.forEach(a => fd.append("arquivos", a.file, a.file.name || a.nome));
  ia.etapa = "lendo"; desenharIA();
  try {
    const d = await api(`/restaurants/${rid}/cardapio/ler`, { metodo: "POST", form: fd });
    if (S.atual?.id !== rid) return;
    ia.resultado = d.categorias.map(c => ({
      nome: c.nome,
      itens: c.itens.map(i => ({ ...i, preco: i.preco ?? "", marcado: !ia.existentes.has(normNome(i.nome)), repetido: ia.existentes.has(normNome(i.nome)) }))
    }));
    ia.observacoes = d.observacoes;
    ia.etapa = "revisar";
  } catch (e) {
    ia.etapa = "escolher";
    toast(e.message, "erro");
  }
  if (S.atual?.id === rid && S.secao === "cardapio") desenharIA();
}

function desenharRevisao(box) {
  const ia = S.ia;
  const total = ia.resultado.reduce((s, c) => s + c.itens.length, 0);
  const marcados = ia.resultado.reduce((s, c) => s + c.itens.filter(i => i.marcado).length, 0);
  const repetidos = ia.resultado.reduce((s, c) => s + c.itens.filter(i => i.repetido).length, 0);
  const preco = (v) => v === "" || v == null ? "" : String(v).replace(".", ",");
  box.innerHTML = `
    <div class="revisao" data-sem-barra>
      <div class="rev-topo">
        <div><h3>Confira antes de salvar</h3><p class="dica">A IA leu ${total} itens. Corrija o que precisar, desmarque o que não quer e clique em adicionar.</p></div>
        <div style="display:flex; gap:8px">
          <button type="button" class="btn btn-sm" id="rev-todos">Marcar todos</button>
          <button type="button" class="btn btn-sm btn-ghost" id="rev-nenhum">Desmarcar todos</button>
        </div>
      </div>
      ${ia.observacoes ? `<div class="aviso">${esc(ia.observacoes)}</div>` : ""}
      ${repetidos ? `<div class="aviso">${repetidos} item(ns) já existem no cardápio com o mesmo nome e vieram desmarcados.</div>` : ""}
      ${ia.resultado.map((c, ci) => `
        <div class="rev-cat">
          <div class="rev-cat-cabeca">
            <input type="checkbox" data-cat-check="${ci}" ${c.itens.every(i => i.marcado) ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--brand)">
            <input class="inp" data-cat="${ci}" value="${esc(c.nome)}" aria-label="Nome da categoria">
            <small>${c.itens.length} itens</small>
          </div>
          ${c.itens.map((i, ii) => `
            <div class="rev-item ${i.marcado ? "" : "off"}">
              <input type="checkbox" data-check="${ci}:${ii}" ${i.marcado ? "checked" : ""} aria-label="Adicionar ${esc(i.nome)}">
              <div style="min-width:0">
                <input class="inp" data-campo="nome" data-i="${ci}:${ii}" value="${esc(i.nome)}" aria-label="Nome">
                <textarea class="inp" data-campo="descricao" data-i="${ci}:${ii}" rows="1" placeholder="Descrição (opcional)">${esc(i.descricao)}</textarea>
                ${i.repetido ? `<span class="rev-tag">Já existe no cardápio</span>` : ""}
                <div class="variacoes">
                  ${i.variacoes.map((v, vi) => `
                    <span class="variacao">
                      <input class="vn" data-var="${ci}:${ii}:${vi}" data-vc="nome" value="${esc(v.nome)}" placeholder="Tamanho">
                      <input class="vp" data-var="${ci}:${ii}:${vi}" data-vc="preco" value="${esc(preco(v.preco))}" placeholder="0,00" inputmode="decimal">
                      <button type="button" data-tirar-var="${ci}:${ii}:${vi}" aria-label="Tirar">${ico("x", "ico ico-sm")}</button>
                    </span>`).join("")}
                  <button type="button" class="add-var" data-add-var="${ci}:${ii}">+ tamanho</button>
                </div>
              </div>
              <div class="prefixo preco"><b>R$</b><input class="inp" data-campo="preco" data-i="${ci}:${ii}" value="${esc(preco(i.preco))}" inputmode="decimal" placeholder="0,00" style="text-align:right"></div>
              <button type="button" class="btn btn-ghost btn-icone rev-tirar" data-tirar-item="${ci}:${ii}" aria-label="Tirar item">${ico("lixo")}</button>
            </div>`).join("")}
        </div>`).join("")}
      <div class="rev-pe">
        <span>${marcados} de ${total} itens marcados</span>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button type="button" class="btn btn-ghost" id="rev-cancelar">Descartar</button>
          <button type="button" class="btn btn-pri" id="rev-salvar" ${marcados ? "" : "disabled"}>Adicionar ${marcados} itens ao cardápio</button>
        </div>
      </div>
    </div>`;
  const pega = (s) => s.split(":").map(Number);
  const txtPreco = (v) => { const t = String(v).trim(); if (!t) return ""; const n = parseFloat(t.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : ""; };
  // as digitações só atualizam os dados (sem redesenhar, pra não perder o cursor)
  box.oninput = (e) => {
    const t = e.target;
    if (t.dataset.cat !== undefined) ia.resultado[+t.dataset.cat].nome = t.value;
    if (t.dataset.campo) { const [ci, ii] = pega(t.dataset.i); ia.resultado[ci].itens[ii][t.dataset.campo] = t.dataset.campo === "preco" ? txtPreco(t.value) : t.value; }
    if (t.dataset.var) { const [ci, ii, vi] = pega(t.dataset.var); ia.resultado[ci].itens[ii].variacoes[vi][t.dataset.vc] = t.dataset.vc === "preco" ? txtPreco(t.value) : t.value; }
    if (t.tagName === "TEXTAREA") { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
  };
  box.onchange = (e) => {
    const t = e.target;
    if (t.dataset.check) { const [ci, ii] = pega(t.dataset.check); ia.resultado[ci].itens[ii].marcado = t.checked; desenharRevisao(box); }
    if (t.dataset.catCheck) { ia.resultado[+t.dataset.catCheck].itens.forEach(i => { i.marcado = t.checked; }); desenharRevisao(box); }
  };
  box.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tirarVar) { const [ci, ii, vi] = pega(b.dataset.tirarVar); ia.resultado[ci].itens[ii].variacoes.splice(vi, 1); desenharRevisao(box); }
    if (b.dataset.addVar) { const [ci, ii] = pega(b.dataset.addVar); ia.resultado[ci].itens[ii].variacoes.push({ nome: "", preco: "" }); desenharRevisao(box); box.querySelector(`[data-var="${ci}:${ii}:${ia.resultado[ci].itens[ii].variacoes.length - 1}"]`)?.focus(); }
    if (b.dataset.tirarItem) { const [ci, ii] = pega(b.dataset.tirarItem); ia.resultado[ci].itens.splice(ii, 1); if (!ia.resultado[ci].itens.length) ia.resultado.splice(ci, 1); desenharRevisao(box); }
    if (b.id === "rev-todos" || b.id === "rev-nenhum") { ia.resultado.forEach(c => c.itens.forEach(i => { i.marcado = b.id === "rev-todos"; })); desenharRevisao(box); }
    if (b.id === "rev-cancelar") perguntar({ titulo: "Descartar a leitura?", texto: "Nada foi salvo ainda. Você vai precisar mandar os arquivos de novo.", sim: "Descartar", perigo: true })
      .then(ok => { if (ok) { S.ia = { ...S.ia, etapa: "escolher", arquivos: [], resultado: null }; desenharIA(); } });
    if (b.id === "rev-salvar") importarCardapioIA(b);
  };
  box.querySelectorAll("textarea").forEach(t => { t.style.height = "auto"; t.style.height = Math.max(38, t.scrollHeight) + "px"; });
  pintarIcones(box);
}

async function importarCardapioIA(btn) {
  const ia = S.ia, rid = S.atual.id;
  const itens = ia.resultado.flatMap(c => c.itens.filter(i => i.marcado).map(i => ({
    nome: i.nome.trim(), descricao: (i.descricao || "").trim(), preco: i.preco === "" ? null : i.preco,
    categoria: c.nome.trim() || "Geral",
    variacoes: i.variacoes.filter(v => String(v.nome).trim()).map(v => ({ nome: String(v.nome).trim(), preco: v.preco === "" ? null : v.preco }))
  })));
  const semNome = itens.filter(i => !i.nome).length;
  if (semNome) return toast("Tem item marcado sem nome.", "erro");
  const semPreco = itens.filter(i => i.preco == null && !i.variacoes.some(v => v.preco != null)).length;
  if (semPreco && !(await perguntar({ titulo: `${semPreco} item(ns) sem preço`, texto: "Eles entram com R$ 0,00 e você ajusta depois no FluxON. Continuar?", sim: "Adicionar assim mesmo" }))) return;
  await ocupado(btn, async () => {
    try {
      const d = await api(`/restaurants/${rid}/cardapio/importar`, { metodo: "POST", corpo: { itens } });
      ia.arquivos.forEach(a => a.previa && URL.revokeObjectURL(a.previa));
      S.ia = { ...ia, etapa: "feito", feito: d, arquivos: [], resultado: null };
      toast(`${d.criados} itens adicionados`);
      if (S.atual?.id === rid) secCardapio($("secao"));
    } catch (e) { toast(e.message, "erro"); }
  });
}

// ===== BUSCAR DADOS NA INTERNET (IA) =====
function janelaBuscarIA({ cidade = "", autoBuscar = false } = {}) {
  const r = S.atual;
  if (!r) return;
  cidade = cidade || lerLocal("fx_admin_cidade") || "";
  const j = abrirJanela({
    titulo: `${ico("brilho")} Buscar na internet`,
    sub: "A IA procura no Google Maps, Instagram e site. Você escolhe o que usar.",
    corpo: `
      <div class="grade-2">
        <label class="campo"><span>Nome do restaurante</span><input id="b-nome" value="${esc(nomeRest(r))}"></label>
        <label class="campo"><span>Cidade</span><input id="b-cidade" value="${esc(cidade)}" placeholder="Lençóis Paulista"></label>
      </div>
      <div id="b-resultado"></div>`,
    pe: `<p class="erro"></p><button type="button" class="btn" data-fechar-pe>Fechar</button><button type="button" class="btn btn-ia" id="b-buscar">${ico("busca")}Buscar</button>`,
    larga: true
  });
  j.q("[data-fechar-pe]").onclick = j.fechar;
  const buscar = () => ocupado(j.q("#b-buscar"), async () => {
    j.erro("");
    const nome = j.q("#b-nome").value.trim(), cid = j.q("#b-cidade").value.trim();
    if (!nome || !cid) return j.erro("Preencha o nome e a cidade.");
    gravarLocal("fx_admin_cidade", cid);
    j.q("#b-resultado").innerHTML = `<div class="lendo"><b>Procurando ${esc(nome)}...</b><p>Leva uns 20 segundos.</p></div>`;
    try {
      const d = await api("/ia/buscar-restaurante", { metodo: "POST", corpo: { nome, cidade: cid } });
      mostrarSugestoes(j, d);
    } catch (e) { j.q("#b-resultado").innerHTML = ""; j.erro(e.message); }
  });
  j.q("#b-buscar").onclick = buscar;
  if (autoBuscar && cidade) buscar();
}

function mostrarSugestoes(j, d) {
  const resumoHoras = (lista) => DIAS.map((n, k) => {
    const t = lista.filter(h => h.dia_semana === k);
    return `${n.slice(0, 3)}: ${t.length ? t.map(h => `${h.abertura}–${h.fechamento}`).join(", ") : "fechado"}`;
  }).join("<br>");
  const linhas = [
    ["telefone", "Telefone", d.telefone ? fmtTel(d.telefone) : ""],
    ["endereco", "Endereço", d.endereco],
    ["instagram", "Instagram", d.instagram],
    ["horarios", "Horários", d.horarios.length ? resumoHoras(d.horarios) : ""]
  ];
  const algum = linhas.some(l => l[2]);
  j.q("#b-resultado").innerHTML = `
    ${!d.encontrado ? `<div class="aviso">A IA não teve certeza de que achou o restaurante certo. Confira com cuidado.</div>` : ""}
    ${algum ? `<div class="sugestoes">${linhas.map(([k, n, v]) => `
      <label class="sugestao ${v ? "" : "vazia"}"><input type="checkbox" data-sug="${k}" ${v ? "checked" : "disabled"}><b>${n}</b><div>${v || "Não encontrado"}</div></label>`).join("")}</div>`
      : `<div class="vazio" style="padding:24px"><b>Nada encontrado</b>Confira o nome e a cidade e tente de novo.</div>`}
    ${d.google_maps_url ? `<p class="dica"><a href="${esc(d.google_maps_url)}" target="_blank" rel="noopener">${ico("mapa", "ico ico-sm")} Ver no Google Maps</a>${d.observacao ? `, ${esc(d.observacao)}` : ""}</p>` : d.observacao ? `<p class="dica">${esc(d.observacao)}</p>` : ""}
    ${algum ? `<div class="aviso">Usar troca o que está salvo hoje nesses campos.</div>` : ""}`;
  const pe = j.el.querySelector(".janela-pe");
  pe.querySelector("#b-usar")?.remove();
  if (!algum) return;
  pe.insertAdjacentHTML("beforeend", `<button type="button" class="btn btn-pri" id="b-usar">${ico("check")}Usar selecionados</button>`);
  j.q("#b-usar").onclick = () => ocupado(j.q("#b-usar"), async () => {
    const quer = (k) => j.q(`[data-sug="${k}"]`)?.checked;
    const corpo = {};
    if (quer("telefone")) corpo.telefone = d.telefone;
    if (quer("endereco")) corpo.endereco = d.endereco;
    if (quer("instagram")) corpo.instagram = d.instagram;
    try {
      if (Object.keys(corpo).length) {
        await api(`/restaurants/${S.atual.id}/config`, { metodo: "PATCH", corpo });
        Object.assign(S.cfg, corpo);
      }
      if (quer("horarios")) {
        await api(`/restaurants/${S.atual.id}/horarios`, { metodo: "PATCH", corpo: { horarios: d.horarios } });
        S.horarios = d.horarios.map(h => ({ ...h, abertura: h.abertura + ":00", fechamento: h.fechamento + ":00" }));
      }
      j.fechar();
      toast("Dados salvos");
      limparSujo();
      desenharSecao();
    } catch (e) { j.erro(e.message); }
  });
}

// ===== CENTRAL DO CLIENTE =====
// Mostra a central como o cliente vê. Tocar num botão edita ícone, nome e link; o + adiciona; a frase é editada na prévia.
let adminCentral = null;
const AC_ICONES = {
  cardapio:  ["Cardápio", '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M8 8h7M8 12h7M8 16h4"/>'],
  delivery:  ["Delivery", '<path d="M3 7h10v8H3z"/><path d="M13 10h4l3 3v2h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'],
  fidelidade:["Fidelidade", '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>'],
  reserva:   ["Reserva", '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/>'],
  voucher:   ["Vale-presente", '<rect x="3.5" y="8" width="17" height="12.5" rx="1.5"/><path d="M2.5 8h19v4h-19zM12 8v12.5"/><path d="M12 8c-1.8 0-4.5-.7-4.5-2.6S10 3.6 12 8zm0 0c1.8 0 4.5-.7 4.5-2.6S14 3.6 12 8z"/>'],
  mapa:      ["Localização", '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>'],
  whatsapp:  ["WhatsApp", '<path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6z"/><path d="M9 8.6c.2-.4.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c-.1.1-.1.3 0 .5a6 6 0 0 0 2.5 2.4c.2.1.4.1.5 0l.6-.6c.2-.2.4-.2.6-.1l1.6.7c.2.1.4.3.4.5v.5c0 .3-.1.6-.5.8-.6.4-1.5.6-2.4.3a9 9 0 0 1-5-4.9c-.4-1-.2-2 .3-2.7z"/>'],
  instagram: ["Instagram", '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/>'],
  avaliar:   ["Avaliação", '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/><path d="M12 8.5v4"/><circle cx="12" cy="14.8" r=".6" fill="currentColor"/>'],
  link:      ["Link", '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>']
};
const _acSvg = (i) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(AC_ICONES[i] || AC_ICONES.link)[1]}</svg>`;

async function secCentral(el) {
  el.innerHTML = `${cabecaSecao("Central do cliente", "A página de links que vai na bio do Instagram. Toque num botão da prévia pra editar, na frase pra escrever, no + pra adicionar.")}<div id="central-corpo"><div class="carregando">Carregando...</div></div>`;
  const rid = S.atual.id;
  adminCentral = null;
  try {
    const d = await api(`/restaurants/${rid}/central`);
    if (S.atual?.id !== rid || S.secao !== "central") return;
    adminCentral = d;
    desenharCentral();
  } catch (e) { $("central-corpo").innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
}

function desenharCentral() {
  const c = adminCentral, corpo = $("central-corpo");
  if (!c || !corpo) return;
  const foto = c.fundo_url || c.banner_url, logo = httpsOk(c.logo_url), dominio = S.atual.central_url;
  corpo.innerHTML = `
    <div class="cped" style="--cor:${esc(c.cor || "#d62828")}">
      ${c.plano_ok ? "" : `<div class="aviso">A central só fica no ar a partir do plano Advanced. Dá pra deixar tudo pronto antes.</div>`}
      <div class="cped-grid">
        <div class="cped-fone">
          <div class="cped-fundo"${foto ? ` style="background-image:url('${esc(foto)}')"` : ""}></div>
          <div class="cped-topo">
            <div class="cped-logo">${logo ? `<img src="${esc(logo)}" alt="">` : esc(String(c.nome || "?").charAt(0).toUpperCase())}</div>
            ${c.mostrar_aberto ? `<div class="cped-status">Aberto agora · fecha 23:00</div>` : ""}
            <div class="cped-nome">${esc(c.nome)}</div>
            <div class="cped-frase" id="cped-frase" contenteditable="plaintext-only" spellcheck="false" data-ph="Toque para escrever uma frase">${esc(c.frase)}</div>
          </div>
          <div class="cped-painel">
            <div class="cped-botoes">
              ${c.botoes.map((b, i) => `<button type="button" class="cped-botao" data-ac-botao="${i}" title="Editar"><span class="cped-ico">${_acSvg(b.icone)}</span><span>${esc(b.rotulo)}</span></button>`).join("")}
              ${c.botoes.length < 12 ? `<button type="button" class="cped-botao add" id="cped-add" title="Adicionar botão"><span class="cped-ico">+</span><span>Adicionar</span></button>` : ""}
            </div>
            <div class="cped-ass">Desenvolvido por <b>FluxON</b></div>
          </div>
        </div>
        <div class="cped-lado">
          <div class="bloco">
            <h3>Foto de fundo</h3>
            <p>${c.fundo_url ? "Usando a foto da central." : c.banner_url ? "Usando o banner do cardápio." : "Sem foto: fundo na cor do restaurante."} Foto em pé fica melhor.</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap">
              <label class="btn" style="position:relative; overflow:hidden">${ico("enviar")}Trocar foto<input type="file" id="central-foto" accept="image/*" style="position:absolute; inset:0; opacity:0; cursor:pointer"></label>
              ${c.fundo_url ? `<button type="button" class="btn btn-ghost" id="central-tirar-foto">Usar o banner</button>` : ""}
            </div>
          </div>
          <label class="chave"><input type="checkbox" id="central-aberto" ${c.mostrar_aberto ? "checked" : ""}><i></i><span>Mostrar "Aberto agora / Fechado"<small>Usa os horários do restaurante.</small></span></label>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
            <button type="button" class="btn btn-pri" id="central-salvar">Salvar central</button>
            ${dominio ? `<a class="btn btn-ghost" href="https://${esc(dominio)}" target="_blank" rel="noopener">${ico("externo")}Abrir a central</a>` : `<span class="dica">Cadastre o domínio em Endereços pra abrir a central.</span>`}
          </div>
        </div>
      </div>
    </div>`;
  const frase = $("cped-frase");
  frase.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); frase.blur(); } });
  frase.addEventListener("input", () => { if (frase.textContent.length > 140) frase.textContent = frase.textContent.slice(0, 140); adminCentral.frase = frase.textContent; });
  corpo.querySelectorAll("[data-ac-botao]").forEach(b => b.onclick = () => editarBotaoCentral(Number(b.dataset.acBotao)));
  $("cped-add") && ($("cped-add").onclick = () => editarBotaoCentral(-1));
  $("central-foto").onchange = function () { if (this.files[0]) fotoCentral(this.files[0]); };
  $("central-tirar-foto") && ($("central-tirar-foto").onclick = () => { adminCentral.fundo_url = ""; desenharCentral(); });
  $("central-aberto").onchange = function () { adminCentral.mostrar_aberto = this.checked; desenharCentral(); };
  $("central-salvar").onclick = () => ocupado($("central-salvar"), salvarCentral);
}

function editarBotaoCentral(i) {
  const novo = i < 0;
  const b = novo ? { icone: "link", rotulo: "", url: "" } : { ...adminCentral.botoes[i] };
  const total = adminCentral.botoes.length;
  let icone = b.icone;
  const j = abrirJanela({
    titulo: novo ? "Novo botão" : "Editar botão",
    corpo: `
      <div class="campo"><span>Ícone</span><div class="cped-icones">${Object.entries(AC_ICONES).map(([k, [n]]) => `<button type="button" class="cped-icone ${k === b.icone ? "on" : ""}" data-ic="${k}">${_acSvg(k)}<span>${n}</span></button>`).join("")}</div></div>
      <label class="campo"><span>Nome</span><input id="cb-rotulo" maxlength="30" value="${esc(b.rotulo)}" placeholder="Ex.: Faça sua reserva"></label>
      <label class="campo"><span>Link</span><input id="cb-url" value="${esc(b.url)}" placeholder="https://..." inputmode="url"></label>
      ${adminCentral.sugestoes?.length ? `<div class="campo"><span>Links que o sistema já conhece</span><div class="cped-sugs">${adminCentral.sugestoes.map((s, k) => `<button type="button" class="ficha" data-sug="${k}">${esc(s.origem)}</button>`).join("")}</div></div>` : ""}`,
    pe: `<p class="erro"></p>
      ${novo ? "" : `<button type="button" class="btn btn-icone" id="cb-esq" ${i === 0 ? "disabled" : ""} title="Mover pra esquerda">◀</button>
      <button type="button" class="btn btn-icone" id="cb-dir" ${i === total - 1 ? "disabled" : ""} title="Mover pra direita">▶</button>
      <button type="button" class="btn btn-ghost btn-perigo" id="cb-excluir">Excluir</button>`}
      <button type="button" class="btn btn-pri" id="cb-ok">Pronto</button>`
  });
  j.el.querySelectorAll("[data-ic]").forEach(el => el.onclick = () => { icone = el.dataset.ic; j.el.querySelectorAll("[data-ic]").forEach(x => x.classList.toggle("on", x === el)); });
  j.el.querySelectorAll("[data-sug]").forEach(el => el.onclick = () => {
    const s = adminCentral.sugestoes[+el.dataset.sug];
    j.q("#cb-url").value = s.url;
    if (!j.q("#cb-rotulo").value.trim()) j.q("#cb-rotulo").value = s.rotulo;
    icone = s.icone;
    j.el.querySelectorAll("[data-ic]").forEach(x => x.classList.toggle("on", x.dataset.ic === icone));
  });
  const fim = () => { j.fechar(); desenharCentral(); };
  if (!novo) {
    const mover = (d) => { const l = adminCentral.botoes; [l[i], l[i + d]] = [l[i + d], l[i]]; fim(); };
    j.q("#cb-esq").onclick = () => mover(-1);
    j.q("#cb-dir").onclick = () => mover(1);
    j.q("#cb-excluir").onclick = () => { adminCentral.botoes.splice(i, 1); fim(); };
  }
  j.q("#cb-ok").onclick = () => {
    const rotulo = j.q("#cb-rotulo").value.trim();
    let url = j.q("#cb-url").value.trim();
    if (url && !/^[a-z]+:\/\//i.test(url)) url = "https://" + url;
    if (!rotulo) return j.erro("Dê um nome para o botão.");
    if (!httpsOk(url)) return j.erro("Cole um link que comece com https://");
    const item = { icone, rotulo, url: httpsOk(url) };
    novo ? adminCentral.botoes.push(item) : (adminCentral.botoes[i] = item);
    fim();
  };
}

async function fotoCentral(file) {
  const recorte = await openCropModal(file, { proporcao: 9 / 16, largura: 1080, altura: 1920, titulo: "Ajustar foto de fundo" });
  if ($("central-foto")) $("central-foto").value = "";
  if (!recorte) return;
  try {
    const fd = new FormData();
    fd.append("file", recorte, "fundo.jpg");
    fd.append("bucket", "restaurante-banners");
    const d = await api(`${API_BASE}/api/v1/upload-image`, { metodo: "POST", form: fd });
    adminCentral.fundo_url = d.url;
    desenharCentral();
    toast("Foto pronta. Salve a central pra publicar.");
  } catch (e) { toast(e.message, "erro"); }
}

async function salvarCentral() {
  try {
    await api(`/restaurants/${S.atual.id}/central`, { metodo: "PATCH", corpo: {
      fundo_url: adminCentral.fundo_url || null, frase: adminCentral.frase || "", mostrar_aberto: !!adminCentral.mostrar_aberto,
      botoes: adminCentral.botoes.map(b => ({ icone: b.icone, rotulo: b.rotulo, url: b.url }))
    } });
    toast("Central salva. Já vale agora.");
    secCentral($("secao"));
  } catch (e) { toast(e.message, "erro"); }
}

// ===== VALE-PRESENTE =====
async function secVale(el) {
  el.innerHTML = `${cabecaSecao("Vale-presente", "O cliente compra um vale no Pix pra presentear alguém. O saldo é usado nos pedidos.")}<div id="vale-corpo"><div class="carregando">Carregando...</div></div>`;
  const rid = S.atual.id;
  try {
    const d = await api(`/restaurants/${rid}/vouchers`);
    if (S.atual?.id !== rid || S.secao !== "vale") return;
    const dom = S.atual.vouchers_url;
    $("vale-corpo").innerHTML = `
      <div class="secao">
        ${d.pix_online ? "" : `<div class="aviso">Este restaurante ainda não tem Pix online configurado. Sem ele, a página de compra não abre.</div>`}
        <div class="numeros">
          <div class="numero"><small>Vendidos</small><b>${d.vendidos}</b></div>
          <div class="numero"><small>Total vendido</small><b>${brl(d.total_vendido)}</b></div>
          <div class="numero"><small>Saldo em aberto</small><b>${brl(d.saldo_em_aberto)}</b></div>
        </div>
        <div class="bloco">
          <label class="chave"><input type="checkbox" id="vp-ativo" ${d.ativo ? "checked" : ""}><i></i><span>Vender vale-presente</span></label>
          <label class="campo" style="max-width:280px"><span>Validade a partir da compra</span>
            <select id="vp-validade">${d.opcoes_validade.map(n => `<option value="${n}" ${n === d.validade_dias ? "selected" : ""}>${n} dias</option>`).join("")}</select></label>
          <p class="dica">Valores à venda: ${d.valores.map(v => brl(v)).join(", ")}. O saldo que sobra depois de um uso vence na mesma data.</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
            <button type="button" class="btn btn-pri" id="vp-salvar">Salvar vale-presente</button>
            ${dom ? `<a class="btn btn-ghost" href="https://${esc(dom)}" target="_blank" rel="noopener">${ico("externo")}Abrir a página de compra</a>` : `<span class="dica">Cadastre o domínio em Endereços pra abrir a página.</span>`}
          </div>
        </div>
      </div>`;
    $("vp-salvar").onclick = () => ocupado($("vp-salvar"), async () => {
      try {
        await api(`/restaurants/${rid}/vouchers`, { metodo: "PATCH", corpo: { ativo: $("vp-ativo").checked, validade_dias: Number($("vp-validade").value) } });
        toast("Vale-presente salvo");
      } catch (e) { toast(e.message, "erro"); }
    });
  } catch (e) { $("vale-corpo").innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
}

// ===== MAPA (TomTom) =====
async function secMapa(el) {
  el.innerHTML = `${cabecaSecao("Mapa (TomTom)", "Com a chave do TomTom do restaurante, o app do entregador e o rastreio do cardápio usam o mapa e a busca de endereço do TomTom. Sem chave, usam o OpenStreetMap.")}<div id="mapa-corpo"><div class="carregando">Carregando...</div></div>`;
  const rid = S.atual.id;
  try {
    const d = await api(`/restaurants/${rid}/mapa`);
    if (S.atual?.id !== rid || S.secao !== "mapa") return;
    $("mapa-corpo").innerHTML = `
      <div class="secao"><div class="bloco">
        <label class="campo"><span>Chave do TomTom (API key)</span>
          <input id="tt-chave" value="${esc(d.tomtom)}" placeholder="cole a API key da conta do TomTom do restaurante" autocomplete="off" spellcheck="false"></label>
        <p class="dica">Pegue em developer.tomtom.com → Dashboard → API keys. Deixe vazio pra voltar ao OpenStreetMap.</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          <button type="button" class="btn btn-pri" id="tt-salvar">Salvar chave</button>
          <span class="dica" id="tt-status">${d.tomtom ? "Usando TomTom" : "Usando OpenStreetMap"}</span>
        </div>
      </div></div>`;
    $("tt-salvar").onclick = () => ocupado($("tt-salvar"), async () => {
      const chave = $("tt-chave").value.trim();
      try {
        if (chave) { // confere com o TomTom antes de salvar
          const r = await fetch(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent("Lençóis Paulista, SP")}.json?countrySet=BR&limit=1&key=${encodeURIComponent(chave)}`).catch(() => null);
          if (r && (r.status === 401 || r.status === 403)) throw new Error("O TomTom não aceitou essa chave. Confira se copiou inteira.");
        }
        await api(`/restaurants/${rid}/mapa`, { metodo: "PATCH", corpo: { tomtom: chave } });
        $("tt-status").textContent = chave ? "Usando TomTom" : "Usando OpenStreetMap";
        toast(chave ? "Chave salva. O mapa do TomTom já vale." : "Chave removida. Voltou pro OpenStreetMap.");
      } catch (e) { toast(e.message, "erro"); }
    });
  } catch (e) { $("mapa-corpo").innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
}

// ===== RESERVAS =====
async function secReservas(el) {
  el.innerHTML = `${cabecaSecao("Reservas", "O cliente reserva a mesa pagando um valor no Pix, que vira crédito na conta dele.")}<div id="res-corpo"><div class="carregando">Carregando...</div></div>`;
  const rid = S.atual.id;
  try {
    const d = await api(`/restaurants/${rid}/reservas`);
    if (S.atual?.id !== rid || S.secao !== "reservas") return;
    const tempo = n => n >= 1440 ? `${n / 1440} dia${n >= 2880 ? "s" : ""}` : n >= 60 ? `${n / 60}h`.replace(".5h", "h30") : `${n} min`;
    const sel = (id, lista, atual, fmt) => `<select id="${id}">${lista.map(n => `<option value="${n}" ${n === atual ? "selected" : ""}>${fmt(n)}</option>`).join("")}</select>`;
    const quandoRes = iso => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const dom = S.atual.reservas_url;
    $("res-corpo").innerHTML = `
      <div class="secao">
        ${d.pix_online ? "" : `<div class="aviso">Este restaurante ainda não tem Pix online configurado. Sem ele, a página de reservas não abre.</div>`}
        <div class="bloco">
          <label class="chave"><input type="checkbox" id="rs-ativo" ${d.ativo ? "checked" : ""}><i></i><span>Aceitar reservas de mesa</span></label>
          <div class="grade">
            <label class="campo"><span>Valor no Pix (vira crédito)</span><input id="rs-valor" type="number" min="1" max="1000" step="1" value="${d.valor}"></label>
            <label class="campo"><span>Duração da reserva</span>${sel("rs-duracao", d.opcoes.duracao, d.duracao, tempo)}</label>
            <label class="campo"><span>Mesa bloqueada antes</span>${sel("rs-bloqueio", d.opcoes.bloqueio, d.bloqueio, n => n ? tempo(n) + " antes" : "Não bloquear")}</label>
            <label class="campo"><span>Tolerância de atraso</span>${sel("rs-tolerancia", d.opcoes.tolerancia, d.tolerancia, tempo)}</label>
            <label class="campo"><span>Antecedência mínima</span>${sel("rs-antecedencia", d.opcoes.antecedencia, d.antecedencia, tempo)}</label>
            <label class="campo"><span>Reservar com até</span>${sel("rs-dias", d.opcoes.dias, d.dias, n => `${n} dias antes`)}</label>
          </div>
          <p class="dica">Os horários saem dos Horários do restaurante, de 30 em 30 minutos, até 1h antes de fechar. O número de mesas vem de Operação.</p>
        </div>
        <div class="bloco">
          <h3>Mesas</h3>
          <p>Marcada aceita reserva. O número é quantos lugares a mesa tem.</p>
          <div class="mesas-res">${d.mesas.map(m => `
            <label class="mesa-res"><input type="checkbox" data-rs-mesa="${m.numero}" ${m.reservavel ? "checked" : ""}><span>Mesa ${m.numero}</span>
              <input type="number" data-rs-lugares="${m.numero}" min="1" max="30" value="${m.lugares}" aria-label="Lugares da mesa ${m.numero}"></label>`).join("")}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          <button type="button" class="btn btn-pri" id="rs-salvar">Salvar reservas</button>
          ${dom ? `<a class="btn btn-ghost" href="https://${esc(dom)}" target="_blank" rel="noopener">${ico("externo")}Abrir a página de reservas</a>` : `<span class="dica">Cadastre o domínio em Endereços pra abrir a página.</span>`}
        </div>
        <div class="bloco">
          <h3>Próximas reservas</h3>
          ${d.proximas.length ? `<div>${d.proximas.map(r => `<div class="reserva-linha"><span><b>${esc(quandoRes(r.inicio))}</b>, mesa ${r.mesa}, ${r.pessoas} pessoas</span><span>${esc(r.nome)}</span></div>`).join("")}</div>` : `<p class="dica">Nenhuma reserva por enquanto.</p>`}
        </div>
      </div>`;
    pintarIcones($("res-corpo"));
    $("rs-salvar").onclick = () => ocupado($("rs-salvar"), async () => {
      const v = id => Number($(id).value);
      try {
        await api(`/restaurants/${rid}/reservas`, { metodo: "PATCH", corpo: {
          ativo: $("rs-ativo").checked, valor: v("rs-valor"), duracao: v("rs-duracao"), bloqueio: v("rs-bloqueio"),
          tolerancia: v("rs-tolerancia"), antecedencia: v("rs-antecedencia"), dias: v("rs-dias"),
          mesas: d.mesas.map(m => ({
            numero: m.numero,
            lugares: Number(document.querySelector(`[data-rs-lugares="${m.numero}"]`).value) || 4,
            reservavel: document.querySelector(`[data-rs-mesa="${m.numero}"]`).checked
          }))
        } });
        toast("Reservas salvas");
      } catch (e) { toast(e.message, "erro"); }
    });
  } catch (e) { $("res-corpo").innerHTML = `<div class="aviso">${esc(e.message)}</div>`; }
}

// ===== RECORTE (Cropper.js) =====
let cropperInstance = null, cropResolve = null, cropSaida = { width: 800, height: 800 };
function openCropModal(file, opcoes = {}) {
  return new Promise((resolve) => {
    if (typeof Cropper === "undefined") return resolve(file); // sem a biblioteca: manda a foto inteira
    cropResolve = resolve;
    cropSaida = { width: opcoes.largura || 800, height: opcoes.altura || 800 };
    document.querySelector("#crop-modal-backdrop .crop-modal-title").textContent = opcoes.titulo || "Recortar imagem";
    document.querySelector("#crop-modal-backdrop .crop-img-wrap").style.height = (opcoes.proporcao || 1) < 1 ? "min(62vh, 520px)" : "";
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = $("crop-image");
      if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
      img.onload = () => {
        cropperInstance = new Cropper(img, { aspectRatio: opcoes.proporcao || 1, viewMode: 1, dragMode: "move", autoCropArea: 0.9, restore: false, guides: false, center: false, highlight: false, cropBoxMovable: false, cropBoxResizable: false, toggleDragModeOnDblclick: false });
      };
      img.src = e.target.result;
      $("crop-modal-backdrop").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
}
function cancelCrop() {
  $("crop-modal-backdrop").classList.add("hidden");
  if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  if (cropResolve) { cropResolve(null); cropResolve = null; }
}
function confirmCrop() {
  if (!cropperInstance || !cropResolve) return;
  cropperInstance.getCroppedCanvas({ ...cropSaida, imageSmoothingQuality: "high" }).toBlob((blob) => {
    $("crop-modal-backdrop").classList.add("hidden");
    cropperInstance.destroy(); cropperInstance = null;
    const r = cropResolve; cropResolve = null;
    r(blob ? new File([blob], "imagem.jpg", { type: "image/jpeg" }) : null);
  }, "image/jpeg", 0.9);
}

// ===== INÍCIO =====
pintarIcones();
$("login-senha").addEventListener("submit", entrarComSenha);
$("btn-sair").onclick = sairDoAdmin;
$("salvar-ok").onclick = salvarAgora;
$("salvar-descartar").onclick = () => { limparSujo(); if (S.atual) desenharSecao(); };
window.addEventListener("hashchange", rotear);
window.addEventListener("beforeunload", (e) => { if (S.sujo) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("crop-modal-backdrop").classList.contains("hidden")) cancelCrop();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && S.sujo) { e.preventDefault(); salvarAgora(); }
});

if (tokenAdminValido()) {
  if (!location.hash && lerLocal("fx_admin_ultimo")) history.replaceState(null, "", "#/");
  mostrarPainel();
} else { gravarLocal("fx_admin_token", null); mostrarLogin(); }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
