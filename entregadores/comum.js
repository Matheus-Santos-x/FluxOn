/* comum.js — o que todas as telas usam: estado, servidor, tempo real, formatos, avisos e a janela de baixo. */
const API = String(window.ENTREGAS_API || "https://backend.evoriseai.com.br").replace(/\/+$/, "");
const $ = (id) => document.getElementById(id);

// estado do app (uma conta = um restaurante em que o entregador trabalha)
const S = {
  contas: [], conta: null,      // conta: { token, entregador, restaurante }
  eu: null,                     // dados atualizados do entregador
  fila: [], emPreparo: 0, sel: new Set(),
  naRua: [], acertos: [],
  dia: null,
  aba: "pedidos",
  socket: null
};

/* ---------- guardar login no celular ---------- */
const guardar = {
  ler() {
    try {
      S.contas = JSON.parse(localStorage.getItem("fx_ent_contas") || "[]");
      const atual = localStorage.getItem("fx_ent_atual");
      S.conta = S.contas.find((c) => c.entregador.id === atual) || S.contas[0] || null;
    } catch { S.contas = []; S.conta = null; }
  },
  salvar() {
    try {
      localStorage.setItem("fx_ent_contas", JSON.stringify(S.contas));
      if (S.conta) localStorage.setItem("fx_ent_atual", S.conta.entregador.id);
    } catch {}
  },
  limpar() {
    S.contas = S.contas.filter((c) => c !== S.conta);
    S.conta = S.contas[0] || null;
    guardar.salvar();
  }
};

/* ---------- servidor ---------- */
async function api(path, { method = "GET", body } = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json", ...(S.conta ? { Authorization: `Bearer ${S.conta.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error("Sem internet. Confira o sinal e tente de novo.");
  }
  let j = null;
  try { j = await r.json(); } catch {}
  if (r.status === 401 && S.conta && !path.includes("/auth/")) { sairDaConta("Sua sessão acabou. Entre de novo."); throw new Error("Sessão expirada"); }
  if (!r.ok) throw new Error(j?.error || "Algo deu errado. Tente de novo.");
  return j;
}

/* ---------- formatos ---------- */
const moeda = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
function haQuanto(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${String(min % 60).padStart(2, "0")}`;
}
const minutosDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;
function telBonito(t) {
  const d = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;
}
function mascaraTel(input) {
  input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
    input.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length === 11 ? 7 : 6)}-${d.slice(d.length === 11 ? 7 : 6)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// o que fazer com o pagamento, pronto pra mostrar no card
function pagamentoHtml(pg, total) {
  const ic = { dinheiro: "💵", pago: "✅", cartao: "💳", pix: "💠" }[pg.tipo] || "🧾";
  let linha, sub = "";
  if (pg.tipo === "pago") linha = "Já pago · não cobrar";
  else if (pg.tipo === "dinheiro" && pg.troco) { linha = `Cobrar <b>${moeda(pg.dinheiro)}</b>`; sub = `Levar ${moeda(pg.troco)} de troco (cliente paga com ${moeda(pg.troco_para)})`; }
  else if (pg.tipo === "dinheiro" && pg.dinheiro < total) { linha = `Cobrar <b>${moeda(pg.dinheiro)}</b> em dinheiro`; sub = esc(pg.texto); }
  else if (pg.tipo === "dinheiro") { linha = `Cobrar <b>${moeda(pg.dinheiro)}</b>`; sub = "Dinheiro · sem troco"; }
  else if (pg.tipo === "cartao") { linha = `Cartão <b>${moeda(total)}</b>`; sub = "Levar a maquininha"; }
  else if (pg.tipo === "pix") { linha = `Pix <b>${moeda(total)}</b>`; sub = "Cliente paga no Pix na entrega"; }
  else { linha = `<b>${moeda(total)}</b>`; sub = esc(pg.texto); }
  return `<div class="pag ${pg.tipo}"><span class="pag-ic" aria-hidden="true">${ic}</span><div>${linha}${sub ? `<small>${sub}</small>` : ""}</div></div>`;
}

/* ---------- avisos ---------- */
let _tToast;
function aviso(msg, tipo = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast on ${tipo}`;
  clearTimeout(_tToast);
  _tToast = setTimeout(() => t.classList.remove("on"), tipo === "ruim" ? 4500 : 3000);
}
const vibrar = (p = 120) => { try { navigator.vibrate?.(p); } catch {} };

/* ---------- janela de baixo ---------- */
let _aoFecharFolha = null;
function abrirFolha(html, aoFechar) {
  $("folha-corpo").innerHTML = html;
  $("folha").hidden = false;
  $("folha-fundo").classList.remove("hidden");
  _aoFecharFolha = aoFechar || null;
  setTimeout(() => $("folha").querySelector("button, input")?.focus({ preventScroll: true }), 50);
}
function fecharFolha() {
  $("folha").hidden = true;
  $("folha-fundo").classList.add("hidden");
  const f = _aoFecharFolha; _aoFecharFolha = null;
  f?.();
}
$("folha-fundo").addEventListener("click", fecharFolha);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("folha").hidden) fecharFolha(); });

/* ---------- cor do restaurante ---------- */
function corDoRestaurante(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.1 || lum > 0.92) return null; // preta ou branca demais: fica o vermelho FluxON
  return `rgb(${r}, ${g}, ${b})`;
}
function aplicarCor(rest) {
  const c = corDoRestaurante(rest?.cor);
  document.documentElement.style.setProperty("--acc", c || "#e5484d");
  if (c) {
    const [r, g, b] = c.match(/\d+/g).map(Number);
    document.documentElement.style.setProperty("--acc-txt", (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? "#141517" : "#fff");
  }
}

/* ---------- tempo real ---------- */
const tempoReal = {
  ligar() {
    tempoReal.desligar();
    if (!window.io || !S.conta) return;
    const s = window.io(API, { transports: ["websocket"], auth: { entregador: S.conta.token }, reconnectionDelayMax: 5000 });
    S.socket = s;
    s.on("connect", () => { $("faixa-conexao").classList.add("hidden"); app.recarregar(); });
    s.on("disconnect", () => setTimeout(() => { if (!s.connected) $("faixa-conexao").classList.remove("hidden"); }, 2500));
    s.on("entregador_sair", () => sairDaConta("O restaurante tirou o seu acesso."));
    // alguém pegou pedidos: somem na hora da sua tela
    s.on("fila_saiu", (d) => pegar.saiuDaFila(d.ids || [], d.entregador_id));
    s.on("fila_mudou", () => pegar.recarregarLogo());
    s.on("minhas_mudou", (d) => rua.mudou(d || {}));
    s.on("turno_encerrado", () => { if (S.eu) S.eu.disponivel = false; perfil.bolinha(); aviso("O caixa encerrou o seu turno"); if (S.aba === "dia") ganhos.recarregar(); });
    s.on("caixa_mandou", (d) => {
      vibrar([150, 80, 150]);
      aviso(`O caixa mandou ${plural(d.qtd, "pedido", "pedidos")} pra você`, "bom");
      rua.recarregar().then(() => app.irPara("rua"));
    });
  },
  desligar() { try { S.socket?.disconnect(); } catch {} S.socket = null; },
  enviar(ev, dados) { if (S.socket?.connected) S.socket.emit(ev, dados); }
};

function sairDaConta(msg) {
  mapa.pararLocalizacao();
  tempoReal.desligar();
  guardar.limpar();
  if (S.conta) app.entrar(); else { login.mostrar(); if (msg) login.msg(msg); }
}
