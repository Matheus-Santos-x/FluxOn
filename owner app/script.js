(() => {
  "use strict";
  const API = (window.OWNER_API || "").replace(/\/$/, "");
  const DEMO = new URLSearchParams(location.search).has("demo");
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "fluxon_owner_token";

  const PERIODS = [
    ["today", "Hoje"], ["3d", "3 dias"], ["5d", "5 dias"], ["7d", "7 dias"],
    ["10d", "10 dias"], ["30d", "30 dias"], ["custom", "Personalizado"]
  ];
  const st = { token: null, owner: null, restaurants: [], view: "overview", screen: "home", period: "7d", from: "", to: "", reqId: 0, dash: null, ov: null };

  /* ---------- utilitários ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const int = (n) => Math.round(Number(n) || 0).toLocaleString("pt-BR");
  const pct = (n, d = 1) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2800);
  }
  const iniciais = (nome) => String(nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  const fmtData = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}`; };
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const IC = {
    wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3"/><circle cx="17" cy="13.5" r="1"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="9" rx="2"/><path d="M7 15h10v6H7z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'
  };
  const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

  /* ---------- planos ---------- */
  const nivel = (p) => ["essential", "advanced", "executive", "custom"].indexOf(String(p || "").toLowerCase());
  const temExec = (p) => nivel(p) >= 2;
  const temAdv = (p) => nivel(p) >= 1;

  /* ---------- modelo financeiro de EXEMPLO (até existir cadastro de custos) ---------- */
  const FIN = { imposto: 0.06, cmv: 0.312, desp: [["Folha e funcionários", 0.25], ["Aluguel", 0.09], ["Água, luz e internet", 0.05], ["Manutenção", 0.02], ["Outras despesas", 0.03]] };
  function fin(rev) {
    const imposto = rev * FIN.imposto, liquida = rev - imposto, cmv = rev * FIN.cmv, bruto = liquida - cmv;
    const despesas = FIN.desp.map(([n, p]) => [n, rev * p]);
    const totDesp = despesas.reduce((s, [, v]) => s + v, 0);
    return { rev, imposto, liquida, cmv, bruto, despesas, totDesp, resultado: bruto - totDesp };
  }
  const MARGEM_CANAL = { salao: 0.24, balcao: 0.20, delivery: 0.11 };

  /* ---------- API ---------- */
  function demoData(path) {
    const m = /period=(\w+)/.exec(path), key = m ? m[1] : "7d";
    const dias = { today: 1, "3d": 3, "5d": 5, "7d": 7, "10d": 10, "30d": 30, custom: 7 }[key] || 7;
    const hoje = new Date(Date.now() - 3 * 3600e3);
    const iso = (i) => new Date(hoje.getTime() - i * 864e5).toISOString().slice(0, 10);
    const period = { key, from: iso(dias - 1), to: iso(0), days: dias };
    const lojas = [
      { id: "d1", name: "Burger Central", plan: "executive", f: 1.0 },
      { id: "d2", name: "Burger Shopping", plan: "essential", f: 0.62 },
      { id: "d3", name: "Burger Praia", plan: "custom", f: 0.35 }
    ];
    if (path.startsWith("/owner/me")) return { owner: { id: "demo", nome: "Dono Demo" }, restaurants: lojas.map(({ id, name, plan }) => ({ id, name, plan })) };
    const tl = (f) => Array.from({ length: dias }, (_, i) => ({ date: iso(dias - 1 - i), revenue: Math.round((2400 + ((i * 37) % 7) * 780) * f), orders: Math.round((34 + ((i * 5) % 9) * 3) * f) }));
    const soma = (t) => ({ rev: t.reduce((s, x) => s + x.revenue, 0), ped: t.reduce((s, x) => s + x.orders, 0) });
    if (path.startsWith("/owner/overview")) {
      const rows = lojas.map((l) => { const s = soma(tl(l.f)); return { restaurant_id: l.id, name: l.name, plan: l.plan, revenue: s.rev, orders: s.ped, ticket: s.rev / s.ped, cancelados: 2, growth_revenue: l.f === 0.62 ? -8.3 : 12.4 }; });
      const total = rows.reduce((s, r) => s + r.revenue, 0), ped = rows.reduce((s, r) => s + r.orders, 0);
      rows.sort((a, b) => b.revenue - a.revenue);
      return { period, totals: { revenue: total, orders: ped, ticket: total / ped, growth_revenue: 6.1, growth_orders: null, units: 3 }, ranking: rows.map((r, i) => ({ position: i + 1, share: (r.revenue / total) * 100, ...r })) };
    }
    const id = decodeURIComponent((/restaurants\/([^/]+)/.exec(path) || [])[1] || "d1");
    const l = lojas.find((x) => x.id === id) || lojas[0], t = tl(l.f), s = soma(t);
    const peso = [1, 1, 1, 1, 1, 1, 2, 3, 4, 3, 3, 12, 18, 14, 8, 5, 4, 6, 14, 22, 20, 12, 5, 2];
    const ps = peso.reduce((a, b) => a + b, 0);
    return {
      restaurant: { id: l.id, name: l.name, plan: l.plan }, period,
      kpis: { revenue: s.rev, orders: s.ped, ticket: s.rev / s.ped, cancelados: 3, growth: { revenue: 12.4, orders: -3.1, ticket: 8 }, roi: l.plan === "essential" ? null : 24.1, roi_locked: l.plan === "essential", plan_price: 4000 },
      timeline: t,
      horas: peso.map((w, h) => ({ h, revenue: Math.round(s.rev * w / ps), orders: Math.round(s.ped * w / ps) })),
      canais: { salao: { orders: Math.round(s.ped * 0.4), revenue: s.rev * 0.42 }, balcao: { orders: Math.round(s.ped * 0.25), revenue: s.rev * 0.23 }, delivery: { orders: Math.round(s.ped * 0.35), revenue: s.rev * 0.35 } },
      top_produtos: [{ nome: "X-Burger", qty: 41 * dias }, { nome: "Batata Frita", qty: 33 * dias }, { nome: "Coca 350ml", qty: 28 * dias }, { nome: "Milkshake", qty: 17 * dias }, { nome: "Onion Rings", qty: 12 * dias }]
    };
  }
  async function api(path, opts = {}) {
    if (DEMO) return demoData(path);
    const headers = { "Content-Type": "application/json" };
    if (st.token) headers.Authorization = "Bearer " + st.token;
    let res;
    try { res = await fetch(API + path, { ...opts, headers }); }
    catch { const e = new Error("Sem conexão. Tente novamente."); e.offline = true; throw e; }
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 401 && st.token) { sair(true); throw new Error("Sessão expirada. Entre novamente."); }
    if (!res.ok) throw new Error(data?.error || "Algo deu errado. Tente de novo.");
    return data;
  }

  /* ---------- login ---------- */
  const maskCpf = (v) => v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  const maskTel = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  let cooldownTimer = null;
  function setMsg(t, ok) { const m = $("login-msg"); m.textContent = t || ""; m.classList.toggle("ok", !!ok); }
  function cooldown(seg) {
    const b = $("btn-reenviar"); clearInterval(cooldownTimer);
    let s = seg; b.disabled = true;
    const tick = () => { b.textContent = s > 0 ? `Reenviar código (${s}s)` : "Reenviar código"; if (s <= 0) { b.disabled = false; clearInterval(cooldownTimer); } s--; };
    tick(); cooldownTimer = setInterval(tick, 1000);
  }
  async function solicitar() {
    const cpf = $("in-cpf").value.replace(/\D/g, ""), telefone = $("in-tel").value.replace(/\D/g, "");
    if (cpf.length !== 11 || telefone.length < 10) { setMsg("Confira o CPF e o telefone."); return false; }
    try { await api("/owner/auth/solicitar", { method: "POST", body: JSON.stringify({ cpf, telefone }) }); return true; }
    catch (e) { setMsg(e.message); return false; }
  }
  function loginView() {
    $("app").classList.add("hidden"); $("login-screen").classList.remove("hidden");
    $("form-solicitar").classList.remove("hidden"); $("form-verificar").classList.add("hidden");
    setMsg("");
  }
  $("in-cpf").addEventListener("input", (e) => { e.target.value = maskCpf(e.target.value); });
  $("in-tel").addEventListener("input", (e) => { e.target.value = maskTel(e.target.value); });
  $("in-code").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
  $("form-solicitar").addEventListener("submit", async (e) => {
    e.preventDefault(); setMsg(""); const b = $("btn-solicitar"); b.disabled = true;
    const ok = await solicitar(); b.disabled = false;
    if (ok) {
      $("form-solicitar").classList.add("hidden"); $("form-verificar").classList.remove("hidden");
      $("login-sub").textContent = "Enviamos um código para o seu WhatsApp.";
      setMsg("Se os dados estiverem corretos, o código chega em instantes.", true);
      cooldown(45); $("in-code").focus();
    }
  });
  $("btn-reenviar").addEventListener("click", async () => {
    setMsg(""); $("btn-reenviar").disabled = true;
    if (await solicitar()) { setMsg("Código reenviado.", true); cooldown(45); } else $("btn-reenviar").disabled = false;
  });
  $("btn-voltar").addEventListener("click", () => { clearInterval(cooldownTimer); $("login-sub").textContent = "Acesse os números dos seus restaurantes."; loginView(); });
  $("form-verificar").addEventListener("submit", async (e) => {
    e.preventDefault(); setMsg("");
    const codigo = $("in-code").value;
    if (codigo.length !== 6) { setMsg("Digite os 6 dígitos."); return; }
    const b = $("btn-verificar"); b.disabled = true;
    try {
      const r = await api("/owner/auth/verificar", { method: "POST", body: JSON.stringify({ cpf: $("in-cpf").value.replace(/\D/g, ""), telefone: $("in-tel").value.replace(/\D/g, ""), codigo }) });
      st.token = r.token; store.set(TOKEN_KEY, r.token);
      $("in-code").value = ""; $("in-cpf").value = ""; $("in-tel").value = "";
      await entrar();
    } catch (err) { setMsg(err.message); } finally { b.disabled = false; }
  });
  function sair(silencioso) {
    st.token = null; st.owner = null; st.restaurants = []; store.del(TOKEN_KEY);
    clearInterval(cooldownTimer); $("login-sub").textContent = "Acesse os números dos seus restaurantes.";
    loginView(); if (silencioso) setMsg("Sessão expirada. Entre novamente.");
  }

  /* ---------- app: contas, períodos ---------- */
  async function entrar() {
    const me = await api("/owner/me");
    st.owner = me.owner; st.restaurants = me.restaurants || [];
    $("login-screen").classList.add("hidden"); $("app").classList.remove("hidden");
    const salvo = store.get("fluxon_owner_view");
    if (st.restaurants.length === 1) st.view = st.restaurants[0].id;
    else if (salvo && st.restaurants.some((r) => r.id === salvo)) st.view = salvo;
    else st.view = "overview";
    const p = store.get("fluxon_owner_period");
    if (p && PERIODS.some(([k]) => k === p && k !== "custom")) st.period = p;
    st.screen = "home";
    montarPeriodos(); montarAvatar(); carregar();
  }
  function montarPeriodos() {
    $("periods").innerHTML = PERIODS.map(([k, l]) => `<button class="chip" role="tab" data-p="${k}" aria-selected="${st.period === k}">${l}</button>`).join("");
    $("custom").classList.toggle("hidden", st.period !== "custom");
  }
  $("periods").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    st.period = b.dataset.p; montarPeriodos();
    if (st.period === "custom") {
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      if (!$("c-to").value) $("c-to").value = hoje;
      if (!$("c-from").value) $("c-from").value = hoje;
      return;
    }
    store.set("fluxon_owner_period", st.period); carregar();
  });
  $("c-apply").addEventListener("click", () => {
    const f = $("c-from").value, t = $("c-to").value;
    if (!f || !t || f > t) { toast("Confira as datas."); return; }
    st.from = f; st.to = t; carregar();
  });
  function montarAvatar() {
    const a = $("avatar"); a.textContent = iniciais(st.owner.nome);
    a.setAttribute("aria-label", "Contas de " + st.owner.nome);
    const multi = st.restaurants.length > 1, itens = [];
    if (multi) itens.push(`<button data-v="overview" class="${st.view === "overview" ? "on" : ""}" role="menuitem"><span class="dot">∑</span><span class="name">Visão geral</span>${st.view === "overview" ? '<span class="tick">✓</span>' : ""}</button>`);
    itens.push(`<div class="sec">${multi ? "Restaurantes" : "Restaurante"}</div>`);
    st.restaurants.forEach((r) => itens.push(`<button data-v="${esc(r.id)}" class="${st.view === r.id ? "on" : ""}" role="menuitem"><span class="dot">${esc(iniciais(r.name))}</span><span class="name">${esc(r.name)}</span>${st.view === r.id ? '<span class="tick">✓</span>' : ""}</button>`));
    $("menu").innerHTML =
      `<div class="who"><b>${esc(st.owner.nome)}</b><span class="muted">Dono${multi ? ` · ${st.restaurants.length} unidades` : ""}</span></div>` + itens.join("") +
      `<div class="sec">Conta</div><button data-act="sair" role="menuitem"><span class="name">Sair</span></button>` +
      `<button class="danger" data-act="sair-todos" role="menuitem"><span class="name">Sair de todos os aparelhos</span></button>`;
  }
  const abrirMenu = (abrir) => { $("menu").classList.toggle("hidden", !abrir); $("avatar").setAttribute("aria-expanded", String(abrir)); };
  $("avatar").addEventListener("click", (e) => { e.stopPropagation(); abrirMenu($("menu").classList.contains("hidden")); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".avatar-wrap")) abrirMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") abrirMenu(false); });
  $("menu").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.v) { irPara(b.dataset.v); abrirMenu(false); return; }
    if (b.dataset.act === "sair") { abrirMenu(false); sair(); }
    if (b.dataset.act === "sair-todos") { abrirMenu(false); try { await api("/owner/auth/sair-todos", { method: "POST" }); } catch {} sair(); }
  });
  function irPara(v) {
    st.view = v; st.screen = "home"; store.set("fluxon_owner_view", v);
    montarAvatar(); carregar(); window.scrollTo({ top: 0 });
  }
$("back").addEventListener("click", () => { const de = st.screen; st.screen = PAI[de] || "home"; window.scrollTo({ top: 0 }); if (de === "custos") carregar(); else render(); });

  /* ---------- carregamento ---------- */
  const qs = () => (st.period === "custom" ? `period=custom&from=${st.from}&to=${st.to}` : `period=${st.period}`);
  async function carregar() {
    if (st.period === "custom" && !(st.from && st.to)) { $("content").innerHTML = `<div class="empty">Escolha as datas e toque em Aplicar.</div>`; return; }
    const my = ++st.reqId;
    const r = st.restaurants.find((x) => x.id === st.view);
    $("title").textContent = r ? r.name : "Visão geral";
    $("content").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    try {
      if (st.view === "overview") { const d = await api("/owner/overview?" + qs()); if (my !== st.reqId) return; st.ov = d; st.dash = null; }
      else {
        const base = `/owner/restaurants/${encodeURIComponent(st.view)}`;
        const [d, f] = await Promise.all([api(`${base}/dashboard?` + qs()), api(`${base}/financeiro?` + qs()).catch(() => null)]);
        if (my !== st.reqId) return; st.dash = d; st.fin = f; st.ov = null;
      }
      render();
    } catch (e) {
      if (my !== st.reqId) return;
      $("content").innerHTML = `<div class="card err"><p style="margin:0 0 12px">${esc(e.message)}</p><button class="btn" id="retry">Tentar de novo</button></div>`;
      const b = $("retry"); if (b) b.onclick = carregar;
    }
  }
  $("content").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]"); if (o) { irPara(o.dataset.open); return; }
    const g = e.target.closest("[data-go]"); if (g) { st.screen = g.dataset.go; render(); window.scrollTo({ top: 0 }); }
  });

const PAI = { cuing: "custos", cufichas: "custos", cudesp: "custos", cuver: "custos" };
  const SEM_PERIODO = ["custos", "cuing", "cufichas", "cudesp"];
  const TITULOS = { dre: "Financeiro e DRE", custos: "Custos e estoque", cuing: "Ingredientes e mercadorias", cufichas: "Fichas dos pratos", cudesp: "Despesas", cuver: "Ver meus custos", canais: "Rentabilidade por canal", clientes: "Clientes e origem", fidelidade: "Fidelidade", simulador: "Simulador de preços", previsao: "Previsão de demanda", caixa: "Relatórios do caixa", pdf: "Exportar PDF" };
  function render() {
    const ov = st.view === "overview";
    $("back").classList.toggle("hidden", ov || st.screen === "home");
    $("periods").classList.toggle("hidden", SEM_PERIODO.includes(st.screen));
    $("custom").classList.toggle("hidden", SEM_PERIODO.includes(st.screen) || st.period !== "custom");
    if (ov) { $("title").textContent = "Visão geral"; $("content").innerHTML = telaOverview(st.ov); return; }
    const d = st.dash;
    $("title").textContent = st.screen === "home" ? d.restaurant.name : TITULOS[st.screen];
    const T = { home: telaHome, dre: telaDre, custos: telaCustos, canais: telaCanais, clientes: telaClientes, fidelidade: telaFidelidade, cuing: telaIngredientes, cufichas: telaFichas, cudesp: telaDespesas, cuver: telaVerCustos, simulador: telaSimulador, previsao: telaPrevisao, caixa: telaCaixa, pdf: telaPdf }[st.screen];
    $("content").innerHTML = T(d);
    if (st.screen === "simulador") bindSim(d);
    if (st.screen === "pdf") bindPdf(d);
  }

  /* ---------- peças visuais ---------- */
  function delta(v, rotulo = "vs período anterior") {
    if (v === null || v === undefined) return `<span class="delta flat">sem base de comparação</span>`;
    const cls = v > 0.05 ? "up" : v < -0.05 ? "down" : "flat";
    const seta = cls === "up" ? "▲" : cls === "down" ? "▼" : "•";
    return `<span class="delta ${cls}">${seta} ${pct(Math.abs(v))} <span class="muted" style="font-weight:400">${rotulo}</span></span>`;
  }
  const nota = (p) => `<p class="period-note">${fmtData(p.from)}${p.from !== p.to ? " a " + fmtData(p.to) : ""} · ${p.days} ${p.days === 1 ? "dia" : "dias"}</p>`;
  const exemplo = `<span class="tag">Exemplo</span>`;

  function spark(vals) {
    if (vals.length < 2) return "";
    const W = 300, H = 54, max = Math.max(...vals, 1), min = Math.min(...vals, 0), rng = max - min || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 4 - ((v - min) / rng) * (H - 10)]);
    const l = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a36" stop-opacity=".35"/><stop offset="1" stop-color="#ff5a36" stop-opacity="0"/></linearGradient></defs><path class="a" d="${l} L${W} ${H} L0 ${H} Z"/><path class="l" d="${l}"/></svg>`;
  }
  function barras(items, picoIdx = -1) {
    const max = Math.max(...items.map((x) => x.v), 1);
    const W = 600, H = 170, base = 140, topo = 14, n = items.length, gap = n > 20 ? 3 : 6;
    const bw = (W - gap * (n + 1)) / n, passo = Math.ceil(n / 8);
    const out = items.map((x, i) => {
      const h = Math.max(x.v > 0 ? 3 : 0, (x.v / max) * (base - topo)), px = gap + i * (bw + gap);
      const lab = (i % passo === 0 || i === n - 1) ? `<text x="${(px + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(x.l)}</text>` : "";
      return `<rect class="${i === picoIdx ? "pk" : ""}" x="${px.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(x.t || x.l)}</title></rect>${lab}`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de vendas"><line x1="0" x2="${W}" y1="${base}" y2="${base}"/>${out}</svg>`;
  }
  const lockCard = (txt, plano = "Executive") => `<div class="card lockcard"><span class="big">${ic("lock")}</span><b>Disponível no plano ${plano}</b><p>${txt}</p></div>`;

  /* ---------- seções reutilizáveis (tela e PDF) ---------- */
  function secResumo(d) {
    const k = d.kpis, f = fin(k.revenue), m = k.revenue > 0 ? (f.resultado / k.revenue) * 100 : 0;
    return `<section class="grid4">
      <div class="kpi"><span class="label">Faturamento</span><span class="value">${brl(k.revenue)}</span></div>
      <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(k.orders)}</span></div>
      <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(k.ticket)}</span></div>
      <div class="kpi"><span class="label">Cancelados</span><span class="value">${int(k.cancelados)}</span></div>
            <div class="kpi"><span class="label">CMV</span><span class="value">${finOk() ? pct(st.fin.cmv.pct) : "—"}</span></div>
      <div class="kpi"><span class="label">Resultado</span><span class="value">${finOk() ? brl(st.fin.lucro_liquido) : "—"}</span>${finOk() && st.fin.receita > 0 ? `<span class="sub">margem ${pct((st.fin.lucro_liquido / st.fin.receita) * 100)}</span>` : ""}</div>
    </section>`;
  }
  function secGrafico(d) {
    const horas = d.period.days === 1 && Array.isArray(d.horas);
    let itens, extra = "", titulo, pico = -1;
    if (horas) {
      itens = d.horas.map((x) => ({ l: x.h + "h", v: x.revenue, t: `${x.h}h: ${brl(x.revenue)} · ${x.orders} pedidos` }));
      titulo = "Vendas por hora";
    } else {
      itens = d.timeline.map((x) => ({ l: fmtData(x.date), v: x.revenue, t: `${fmtData(x.date)}: ${brl(x.revenue)} · ${x.orders} pedidos` }));
      titulo = "Faturamento por dia";
    }
    const max = Math.max(...itens.map((x) => x.v), 0);
    if (max > 0) pico = itens.findIndex((x) => x.v === max);
    if (Array.isArray(d.horas)) {
      const top = [...d.horas].sort((a, b) => b.orders - a.orders)[0];
      if (top && top.orders > 0) extra += `Horário de pico: <b>${top.h}h às ${(top.h + 1) % 24}h</b> (${int(top.orders)} pedidos). `;
    }
    if (!horas && pico >= 0) extra += `Melhor dia: <b>${itens[pico].l}</b> (${brl(itens[pico].v)}).`;
    return `<section class="card"><h2>${titulo}</h2>${barras(itens, pico)}${extra ? `<p class="peak">${extra}</p>` : ""}</section>`;
  }
  function secCanais(d) {
    const total = d.canais.salao.revenue + d.canais.balcao.revenue + d.canais.delivery.revenue;
    const nomes = { salao: "Salão", balcao: "Balcão", delivery: "Delivery" };
    const rows = Object.keys(nomes).map((c) => {
      const v = d.canais[c], p = total > 0 ? (v.revenue / total) * 100 : 0;
      return `<div class="split-row"><div class="split-head"><span>${nomes[c]}</span><span>${brl(v.revenue)} · ${int(v.orders)} ped. · ${pct(p, 0)}</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`;
    }).join("");
    return `<section class="card"><h2>Vendas por canal</h2><div class="split">${rows}</div></section>`;
  }
  function secProdutos(d) {
    const maxQ = Math.max(...d.top_produtos.map((p) => p.qty), 1);
    const tops = d.top_produtos.map((p) => `<li><div class="row"><span>${esc(p.nome)}</span><span>${int(p.qty)}×</span></div><div class="bar"><i style="width:${(p.qty / maxQ) * 100}%"></i></div></li>`).join("");
    return `<section class="card"><h2>Mais vendidos</h2>${tops ? `<ul class="tops">${tops}</ul>` : `<div class="empty">Sem vendas no período.</div>`}</section>`;
  }
  function secDre() {
    if (!finOk()) return `<section class="card"><h2>DRE gerencial</h2><div class="empty">Registre suas compras e monte a ficha técnica dos pratos em Meus custos para ver a DRE.</div></section>`;
    const f = st.fin, m = (v) => (f.receita > 0 ? pct((v / f.receita) * 100) : "—");
    const linha = (n, v, cls = "") => `<tr class="${cls}"><td>${n}</td><td>${brl(v)} <span class="muted" style="font-size:12px">${m(v)}</span></td></tr>`;
    const cats = Object.entries(f.despesas.por_categoria).sort((a, b) => ORDEM_DESP.indexOf(a[0]) - ORDEM_DESP.indexOf(b[0]));
    const notas = [
      f.cmv.cobertura_pct < 95 ? `CMV calculado com base em ${pct(f.cmv.cobertura_pct, 0)} das vendas (pratos com ficha técnica pronta).` : "",
      !f.despesas.cadastradas ? "Sem despesas cadastradas neste período." : ""
    ].filter(Boolean).join(" ");
    return `<section class="card"><h2>DRE gerencial</h2><table class="dre">
      ${linha("Receita bruta", f.receita, "tot")}
      ${linha("(−) CMV", -f.cmv.valor, "sub")}
      ${linha("Lucro bruto", f.lucro_bruto, "tot")}
      ${cats.map(([c, v]) => linha("(−) " + (CAT_DESP[c] || c), -v, "sub")).join("")}
      ${linha("Resultado", f.lucro_liquido, "tot res")}
    </table>${notas ? `<p class="foot" style="text-align:left">${notas}</p>` : ""}</section>`;
  }
  function secRent(d) {
    const nomes = { salao: "Salão", balcao: "Balcão", delivery: "Delivery" };
    const rows = Object.keys(nomes).map((c) => {
      const v = d.canais[c], mg = MARGEM_CANAL[c] * 100, res = v.revenue * MARGEM_CANAL[c];
      return `<div class="split-row"><div class="split-head"><span>${nomes[c]}</span><span>${brl(res)} · margem ${pct(mg, 0)}</span></div><div class="bar"><i style="width:${Math.min(100, mg * 3)}%"></i></div><span class="muted" style="font-size:12px">Faturou ${brl(v.revenue)} em ${int(v.orders)} pedidos</span></div>`;
    }).join("");
    return `<section class="card"><h2>Rentabilidade por canal ${exemplo}</h2><div class="split">${rows}</div><p class="foot">Custos e despesas por canal são estimativas até o cadastro de custos.</p></section>`;
  }
  function previsao(d) {
    const dias = d.timeline.filter((x) => x.revenue > 0);
    const base = dias.length ? dias.reduce((s, x) => s + x.revenue, 0) / dias.length : 0;
    const fator = [1.1, 0.8, 0.85, 0.9, 1.0, 1.25, 1.35], fm = fator.reduce((a, b) => a + b, 0) / 7;
    const hoje = new Date(Date.now() - 3 * 3600e3), out = [];
    for (let i = 1; i <= 7; i++) {
      const dt = new Date(hoje.getTime() + i * 864e5), wd = dt.getUTCDay();
      out.push({ l: DIAS[wd] + " " + String(dt.getUTCDate()).padStart(2, "0"), v: Math.round(base * (fator[wd] / fm)) });
    }
    return out;
  }
  function secPrev(d) {
    const pv = previsao(d), tot = pv.reduce((s, x) => s + x.v, 0), picoI = pv.findIndex((x) => x.v === Math.max(...pv.map((y) => y.v)));
    const dias = Math.max(1, d.period.days);
    const prods = d.top_produtos.slice(0, 5).map((p) => `<li><div class="row"><span>${esc(p.nome)}</span><span>≈ ${int((p.qty / dias) * 7)} un.</span></div></li>`).join("");
    let pico = "";
    if (Array.isArray(d.horas)) {
      const top = [...d.horas].sort((a, b) => b.orders - a.orders).slice(0, 3).filter((x) => x.orders > 0).sort((a, b) => a.h - b.h);
      if (top.length) pico = `<p class="peak">Horários de pico: <b>${top.map((x) => x.h + "h").join(", ")}</b>. Reforce a equipe e o estoque antes desses horários.</p>`;
    }
    return `<section class="card"><h2>Próximos 7 dias <span class="tag red">Estimativa</span></h2>
      <div class="kpi" style="margin-bottom:12px"><span class="label">Faturamento previsto</span><span class="value">${brl(tot)}</span><span class="sub">baseado na média do período e no padrão de cada dia da semana</span></div>
      ${barras(pv.map((x) => ({ l: x.l, v: x.v, t: `${x.l}: ${brl(x.v)}` })), picoI)}${pico}</section>
      <section class="card"><h2>Demanda provável por produto <span class="tag red">Estimativa</span></h2>${prods ? `<ul class="tops">${prods}</ul>` : `<div class="empty">Sem histórico suficiente.</div>`}</section>`;
  }

  /* ---------- telas ---------- */
  function telaOverview(d) {
    const t = d.totals, res = fin(t.revenue).resultado;
    const itens = d.ranking.map((r) => `
      <li><button data-open="${esc(r.restaurant_id)}">
        <div class="rank-top"><span class="pos ${r.position === 1 ? "p1" : ""}">${r.position}</span><span class="nm">${esc(r.name)}</span><span class="rv">${brl(r.revenue)}</span></div>
        <div class="bar"><i style="width:${Math.max(2, Math.min(100, r.share))}%"></i></div>
        <div class="rank-sub"><span>${int(r.orders)} pedidos</span><span>ticket ${brl(r.ticket)}</span><span>${pct(r.share)} do total</span>${delta(r.growth_revenue, "")}</div>
      </button></li>`).join("");
    const melhor = d.ranking[0], pior = d.ranking[d.ranking.length - 1];
    return nota(d.period) + `
      <section class="hero"><span class="label">Faturamento total · ${t.units} ${t.units === 1 ? "unidade" : "unidades"}</span><span class="value">${brl(t.revenue)}</span>${delta(t.growth_revenue)}</section>
      <section class="grid4">
        <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(t.orders)}</span>${delta(t.growth_orders, "")}</div>
        <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(t.ticket)}</span></div>
        <div class="kpi"><span class="label">Cancelados</span><span class="value">${int(t.cancelados || 0)}</span></div>
        <div class="kpi"><span class="label">Resultado estimado ${exemplo}</span><span class="value">${brl(res)}</span></div>
      </section>
      <section class="card"><h2>Ranking por faturamento</h2>${d.ranking.length ? `<ul class="rank">${itens}</ul>` : `<div class="empty">Nenhuma unidade vinculada.</div>`}
        ${d.ranking.length > 1 ? `<p class="peak">Vendendo mais: <b>${esc(melhor.name)}</b> · Vendendo menos: <b>${esc(pior.name)}</b></p>` : ""}</section>
      <p class="foot">Toque em uma unidade para ver todas as métricas dela.</p>`;
  }

  const ORDEM_DESP = ["impostos", "folha", "aluguel", "energia", "manutencao", "outras"];
  function finOk() { return !!(st.fin && st.fin.cmv && st.fin.cmv.disponivel); }
  function cardFluxo() {
    if (!finOk()) return "";
    const f = st.fin, saidas = f.cmv.valor + f.despesas.total, saldo = f.receita - saidas;
    return `<section class="card"><h2>Fluxo de caixa</h2><div class="split">
        <div class="split-row"><div class="split-head"><span>Entradas</span><span>${brl(f.receita)}</span></div><div class="bar"><i style="width:100%"></i></div></div>
        <div class="split-row"><div class="split-head"><span>Saídas (mercadoria e despesas)</span><span>${brl(saidas)}</span></div><div class="bar amber"><i style="width:${f.receita > 0 ? Math.min(100, (saidas / f.receita) * 100) : 0}%"></i></div></div>
        <div class="split-head"><b>Saldo do período</b><b style="color:${saldo >= 0 ? "var(--up)" : "var(--down)"}">${brl(saldo)}</b></div></div></section>`;
  }

  // CMV e lucro reais (vêm de Meus custos); sem dados suficientes, mostra um convite para cadastrar
  function cardsLucro() {
    const f = st.fin;
    if (!f || !f.cmv || !f.cmv.disponivel) return `<section class="card lockcard"><span class="big">${ic("wallet")}</span><b>Descubra seu lucro real</b><p>Registre suas compras e monte a ficha técnica dos pratos em <b>Custos e estoque</b> para ver o CMV e o lucro.</p><button class="btn primary" data-go="custos" style="margin-top:10px">Cadastrar meus custos</button></section>`;
    const semDesp = !f.despesas.cadastradas;
    const valor = semDesp ? f.lucro_bruto : f.lucro_liquido, margem = f.receita > 0 ? (valor / f.receita) * 100 : 0;
    const avisos = [
      f.cmv.cobertura_pct < 95 ? `CMV calculado com base em ${pct(f.cmv.cobertura_pct, 0)} das vendas (pratos com ficha técnica pronta).` : "",
      semDesp ? "Cadastre suas despesas (folha, aluguel...) em Meus custos para ver o lucro líquido." : ""
    ].filter(Boolean).join(" ");
    return `<section class="grid2">
      <div class="kpi"><span class="label">${semDesp ? "Lucro bruto" : "Lucro líquido"}</span><span class="value" style="color:${valor >= 0 ? "var(--up)" : "var(--down)"}">${brl(valor)}</span><span class="sub">margem ${pct(margem)}</span></div>
      <div class="kpi"><span class="label">CMV</span><span class="value">${pct(f.cmv.pct)}</span><span class="sub">do faturamento vai para a mercadoria</span></div>
    </section>${avisos ? `<p class="foot" style="text-align:left;margin:-4px 0 8px">${avisos}</p>` : ""}`;
  }

  function telaHome(d) {
    const k = d.kpis, f = fin(k.revenue), m = k.revenue > 0 ? (f.resultado / k.revenue) * 100 : 0;
    const serie = d.period.days === 1 && Array.isArray(d.horas) ? d.horas.map((x) => x.revenue) : d.timeline.map((x) => x.revenue);
    const plano = d.restaurant.plan, exec = temExec(plano), adv = temAdv(plano);
    const saidas = f.cmv + f.imposto + f.totDesp, saldo = k.revenue - saidas;
    const roi = k.roi_locked
      ? `<div class="kpi"><span class="label">ROI do FluxON</span><span class="value">—</span><span class="lock">Plano Executive</span></div>`
      : `<div class="kpi"><span class="label">ROI do FluxON</span><span class="value">${(k.roi || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×</span><span class="sub">faturamento ÷ mensalidade</span></div>`;
    const item = (go, icone, t, s, ok, plan) => `<li><button class="row-btn" data-go="${go}"><span class="row-ic">${ic(icone)}</span><span class="row-t"><b>${t}</b><span>${s}</span></span>${ok ? "" : `<span class="tag red">${plan}</span>`}<span class="chev">›</span></button></li>`;
    return nota(d.period) + `
      <section class="hero"><span class="label">Faturamento</span><span class="value">${brl(k.revenue)}</span>${delta(k.growth.revenue)}${spark(serie)}</section>
            ${cardsLucro()}
      <section class="grid4">
        <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(k.orders)}</span>${delta(k.growth.orders, "")}</div>
        <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(k.ticket)}</span>${delta(k.growth.ticket, "")}</div>
        <div class="kpi"><span class="label">Cancelados</span><span class="value">${int(k.cancelados)}</span></div>
        ${roi}
      </section>
      ${secGrafico(d)}
      ${cardFluxo()}
      <section class="card"><h2>Visão geral</h2><ul class="list">
        ${item("dre", "wallet", "Financeiro e DRE", "Receitas, CMV, despesas e resultado", exec, "Executive")}
        ${item("custos", "box", "Custos e estoque", "Ingredientes, fichas dos pratos e despesas", true, "")}
        ${item("canais", "pie", "Rentabilidade por canal", "Salão, balcão e delivery", exec, "Executive")}
        ${item("clientes", "users", "Clientes e origem dos pedidos", "Novos, recorrentes e de onde vêm", true, "")}
        ${item("fidelidade", "star", "Fidelidade", "Pontos ou selos e quanto cada um vale", true, "")}
        ${item("previsao", "trend", "Previsão de demanda", "Próximos dias, picos e produtos", exec, "Executive")}
        ${item("caixa", "file", "Relatórios do caixa", "Turnos abertos e fechados", true, "")}
        ${item("pdf", "print", "Exportar PDF", "Escolha o período e as seções", true, "")}
      </ul></section>
      ${secCanais(d)}${secProdutos(d)}
      <p class="foot">Itens marcados como “Exemplo” usam estimativas até o cadastro de custos e despesas.</p>`;
  }

  function telaDre(d) {
    if (!temExec(d.restaurant.plan)) return lockCard("A DRE gerencial completa, com CMV, despesas e resultado, faz parte do plano Executive.");
    const f = st.fin, cats = f ? Object.entries(f.despesas.por_categoria).sort((a, b) => b[1] - a[1]) : [];
    const barras = cats.map(([c, v]) => `<div class="split-row"><div class="split-head"><span>${esc(CAT_DESP[c] || c)}</span><span>${brl(v)} · ${pct(f.despesas.total ? (v / f.despesas.total) * 100 : 0, 0)}</span></div><div class="bar amber"><i style="width:${f.despesas.total ? (v / f.despesas.total) * 100 : 0}%"></i></div></div>`).join("");
    return nota(d.period) + secResumo(d) + secDre(d) +
      `<section class="card"><h2>Despesas do período</h2>${barras ? `<div class="split">${barras}</div>` : `<div class="empty">Nenhuma despesa lançada neste período. Cadastre em Meus custos.</div>`}</section>`;
  }

  function telaCanais(d) {
    if (!temExec(d.restaurant.plan)) return lockCard("A análise de rentabilidade por canal faz parte do plano Executive.");
    return nota(d.period) + secCanais(d) + secRent(d);
  }

  const ORIGENS = { ia_whatsapp: "IA no WhatsApp", cardapio: "Cardápio digital", pdv: "PDV (caixa)", pedido_manual: "Pedido manual / balcão", autoatendimento: "Autoatendimento", outros: "Outros" };
  function telaClientes() {
    const my = ++st.reqId;
    api(`/owner/restaurants/${encodeURIComponent(st.view)}/clientes?` + qs()).then((c) => {
      if (my !== st.reqId || st.screen !== "clientes") return;
      $("content").innerHTML = corpoClientes(c);
    }).catch((e) => {
      if (my !== st.reqId) return;
      $("content").innerHTML = `<div class="card err"><p style="margin:0">${esc(e.message)}</p></div>`;
    });
    return `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  }
  function corpoClientes(c) {
    const k = c.clientes, g = k.growth, linhas = (obj, rot) => Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
      .map(([n, v]) => `<div class="split-row"><div class="split-head"><span>${rot[n] || n}</span><span>${int(v)} · ${pct(c.origem.total ? (v / c.origem.total) * 100 : 0, 0)}</span></div><div class="bar"><i style="width:${c.origem.total ? (v / c.origem.total) * 100 : 0}%"></i></div></div>`).join("");
    const pn = k.unicos ? (k.novos / k.unicos) * 100 : 0, pr = k.unicos ? (k.recorrentes / k.unicos) * 100 : 0;
    return nota(c.period) + `
      <section class="grid4">
        <div class="kpi"><span class="label">Clientes no período</span><span class="value">${int(k.unicos)}</span></div>
        <div class="kpi"><span class="label">Novos</span><span class="value">${int(k.novos)}</span></div>
        <div class="kpi"><span class="label">Recorrentes</span><span class="value">${int(k.recorrentes)}</span></div>
        <div class="kpi"><span class="label">Taxa de retorno</span><span class="value">${pct(k.taxa_retorno)}</span>${delta(g.taxa_retorno, "")}</div>
      </section>
      <section class="grid2">
        <div class="kpi"><span class="label">Frequência média</span><span class="value">${k.frequencia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x</span>${delta(g.frequencia, "")}<span class="sub">pedidos por cliente</span></div>
        <div class="kpi"><span class="label">Faturamento recorrente</span><span class="value">${brl(k.faturamento_recorrente)}</span>${delta(g.faturamento_recorrente, "")}<span class="sub">de clientes que voltam</span></div>
      </section>
      <section class="card"><h2>Novos x recorrentes</h2><div class="split">
        <div class="split-row"><div class="split-head"><span>Novos</span><span>${pct(pn, 0)}</span></div><div class="bar"><i style="width:${pn}%"></i></div></div>
        <div class="split-row"><div class="split-head"><span>Recorrentes</span><span>${pct(pr, 0)}</span></div><div class="bar"><i style="width:${pr}%"></i></div></div></div></section>
      <section class="card"><h2>Origem dos pedidos</h2><div class="split">${c.origem.total ? linhas(c.origem.pedidos, ORIGENS) : `<p class="foot">Sem pedidos no período.</p>`}</div></section>
      <section class="card"><h2>Tipo de serviço</h2><div class="split">${c.origem.total ? linhas(c.servico, { local: "No local (salão e balcão)", delivery: "Delivery" }) : `<p class="foot">Sem pedidos no período.</p>`}</div></section>`;
  }


  function telaFidelidade() {
    const my = ++st.reqId, base = `/owner/restaurants/${encodeURIComponent(st.view)}/fidelidade`;
    api(base).then((cfg) => {
      if (my !== st.reqId || st.screen !== "fidelidade") return;
      let modelo = cfg.modelo === "selos" ? "selos" : "pontos";
      const num = (v) => Number(String(v).replace(",", "."));
      const desenhar = () => {
        const selos = modelo === "selos";
        $("content").innerHTML = `
          <section class="card"><h2>Como o cliente ganha recompensa</h2>
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <button class="chip" data-m="pontos" aria-selected="${!selos}" style="flex:1">Pontos</button>
              <button class="chip" data-m="selos" aria-selected="${selos}" style="flex:1">Selos</button>
            </div>
            <p class="foot" style="text-align:left">${selos
              ? "Selos: o cliente ganha 1 selo por pedido a partir de um valor mínimo. Bom para quem busca visitas no salão."
              : "Pontos: o cliente ganha pontos por cada real gasto. Bom para delivery e pedidos de valores variados."}</p>
          </section>
          <section class="card"><h2>${selos ? "Valor mínimo para ganhar 1 selo" : "Pontos por real gasto"}</h2>
            <input id="fid-valor" inputmode="decimal" autocomplete="off" value="${selos ? cfg.valor_selo : cfg.pontos_por_real}">
            <p class="foot" id="fid-ex" style="text-align:left;margin-top:10px"></p>
          </section>
          <button class="btn primary" id="fid-save" style="width:100%">Salvar</button>
          <p class="foot">Vale para novos pedidos. O saldo que os clientes já têm não muda.</p>`;
        const inp = $("fid-valor"), ex = $("fid-ex");
        const atualizar = () => {
          const v = num(inp.value);
          ex.textContent = !(v > 0) ? "" : selos
            ? `Pedidos de ${brl(v)} ou mais ganham 1 selo.`
            : `Um pedido de ${brl(50)} rende ${int(Math.floor(50 * v))} pontos.`;
        };
        inp.addEventListener("input", atualizar); atualizar();
        document.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
          const v = num(inp.value); if (v > 0) cfg[selos ? "valor_selo" : "pontos_por_real"] = v;
          modelo = b.dataset.m; desenhar();
        }));
        $("fid-save").addEventListener("click", async () => {
          const v = num(inp.value); if (!(v > 0)) { toast("Informe um valor maior que zero."); return; }
          if (selos) cfg.valor_selo = v; else cfg.pontos_por_real = v;
          const b = $("fid-save"); b.disabled = true; b.textContent = "Salvando...";
          try {
            const r = await api(base, { method: "PUT", body: JSON.stringify({ modelo, valor_selo: cfg.valor_selo, pontos_por_real: cfg.pontos_por_real }) });
            cfg.modelo = r.modelo; cfg.valor_selo = r.valor_selo; cfg.pontos_por_real = r.pontos_por_real;
            toast("Fidelidade salva.");
          } catch (e) { toast(e.message); }
          b.disabled = false; b.textContent = "Salvar";
        });
      };
      desenhar();
    }).catch((e) => {
      if (my !== st.reqId) return;
      $("content").innerHTML = `<div class="card err"><p style="margin:0">${esc(e.message)}</p></div>`;
    });
    return `<div class="skeleton"></div><div class="skeleton"></div>`;
  }

  /* ---------- custos e estoque ---------- */
  const CAT_DESP = { folha: "Folha e funcionários", aluguel: "Aluguel", energia: "Água, luz e internet", manutencao: "Manutenção", impostos: "Impostos", outras: "Outras despesas" };
  const cuBase = () => `/owner/restaurants/${encodeURIComponent(st.view)}/custos`;
  const cuPreco = (c, u) => `${brl(c)}/${u}` + (u === "un" ? "" : ` · ${brl(c / 10)} por 100 ${u === "kg" ? "g" : "ml"}`);
  const cuNorm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const cuTela = { ing: "cuing", fichas: "cufichas", desp: "cudesp" };
  const cuEstado = { mes: "", edit: "" };
  const cuVivo = (aba) => st.screen === cuTela[aba] && $("cu-corpo");
  const cuErro = (aba, e) => { if (cuVivo(aba)) $("cu-corpo").innerHTML = `<div class="card err"><p style="margin:0">${esc(e.message)}</p></div>`; };
  const cuIniciar = (aba, fn) => { Promise.resolve().then(() => { if (cuVivo(aba)) fn(); }); return `<div id="cu-corpo"><div class="skeleton"></div><div class="skeleton"></div></div>`; };
  const cuLinha = (go, icone, t, s) => `<li><button class="row-btn" data-go="${go}"><span class="row-ic">${ic(icone)}</span><span class="row-t"><b>${t}</b><span>${s}</span></span><span class="chev">›</span></button></li>`;
  const cuBtnIc = (attr, id, rotulo, simbolo) => `<button class="btn link small" ${attr}="${esc(id)}" aria-label="${rotulo}">${simbolo}</button>`;

  /* menu da seção */
  function telaCustos() {
    return `<section class="card"><h2>Custos e estoque</h2><ul class="list">
      ${cuLinha("cuing", "box", "Ingredientes e mercadorias", "Registrar compras e ver quanto custa cada produto")}
      ${cuLinha("cufichas", "file", "Fichas dos pratos", "Quanto de cada ingrediente vai em cada prato")}
      ${cuLinha("cudesp", "wallet", "Despesas", "Folha, aluguel, impostos e outras contas")}
      ${cuLinha("cuver", "pie", "Ver meus custos", "Gráficos e porcentagens do período")}
    </ul></section>`;
  }

  function telaVerCustos() {
    const my = ++st.reqId, base = `/owner/restaurants/${encodeURIComponent(st.view)}`;
    Promise.all([api(`${base}/financeiro?` + qs()), api(`${base}/custos/pratos`).catch(() => null)]).then(([f, pr]) => {
      if (my !== st.reqId || st.screen !== "cuver") return;
      st.fin = f; $("content").innerHTML = corpoVerCustos(st.dash.period, f, pr);
    }).catch((e) => {
      if (my !== st.reqId) return;
      $("content").innerHTML = `<div class="card err"><p style="margin:0">${esc(e.message)}</p></div>`;
    });
    return `<div class="skeleton"></div><div class="skeleton"></div>`;
  }
  const CORES_CUSTO = ["#ff5a36", "#ffb020", "#4cc38a", "#5b9dff", "#b78aff", "#ff7ab6", "#8a94a6"];
  function pizzaCustos(partes, total) {
    let acum = 0;
    const fatias = partes.map(([, v], i) => {
      const p = total ? (v / total) * 100 : 0, s = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${CORES_CUSTO[i % CORES_CUSTO.length]}" stroke-width="6" stroke-dasharray="${p.toFixed(3)} ${(100 - p).toFixed(3)}" stroke-dashoffset="${(25 - acum).toFixed(3)}"/>`;
      acum += p; return s;
    }).join("");
    return `<svg viewBox="0 0 42 42" style="width:190px;height:190px;display:block;margin:0 auto" role="img" aria-label="Divisão dos custos"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="6"/>${fatias}<text x="21" y="20" text-anchor="middle" style="font-size:3.2px;fill:currentColor;opacity:.65">Custo total</text><text x="21" y="25" text-anchor="middle" style="font-size:4.4px;font-weight:700;fill:currentColor">${brl(total)}</text></svg>`;
  }
  function corpoVerCustos(periodo, f, pr) {
    const temCmv = !!(f.cmv && f.cmv.disponivel), desp = f.despesas.total;
    if (!temCmv && !desp) return nota(periodo) + `<section class="card lockcard"><span class="big">${ic("pie")}</span><b>Ainda não dá para mostrar seus custos</b><p>Registre suas despesas e monte a ficha dos pratos para ver para onde vai o seu dinheiro.</p><button class="btn primary" data-go="custos" style="margin-top:10px">Cadastrar meus custos</button></section>`;
    const total = (temCmv ? f.cmv.valor : 0) + desp;
    const partes = [...(temCmv ? [["Ingredientes e mercadorias", f.cmv.valor]] : []), ...Object.entries(f.despesas.por_categoria).map(([c, v]) => [CAT_DESP[c] || c, v])].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const maior = partes[0];
    const legenda = partes.map(([n, v], i) => `<div class="split-row"><div class="split-head"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:${CORES_CUSTO[i % CORES_CUSTO.length]}"></i>${esc(n)}</span><span>${brl(v)} · ${pct(total ? (v / total) * 100 : 0, 0)}</span></div></div>`).join("");
    const caros = ((pr && pr.pratos) || []).filter((p) => p.pronto).sort((a, b) => b.custo_total - a.custo_total).slice(0, 5);
    const maxC = Math.max(...caros.map((p) => p.custo_total), 1);
    const rank = caros.length ? `<section class="card"><h2>Pratos mais caros de produzir</h2><div class="split">${caros.map((p) => `<div class="split-row"><div class="split-head"><span>${esc(p.nome)}</span><span>${brl(p.custo_total)}</span></div><div class="bar amber"><i style="width:${(p.custo_total / maxC) * 100}%"></i></div></div>`).join("")}</div><p class="foot" style="text-align:left">Custo de ingredientes de uma unidade de cada prato.</p></section>` : "";
    const avisos = [
      temCmv && f.cmv.cobertura_pct < 95 ? `Ingredientes calculados com base em ${pct(f.cmv.cobertura_pct, 0)} das vendas (pratos com ficha pronta).` : "",
      !temCmv ? "Monte a ficha dos pratos vendidos para incluir os ingredientes." : "",
      desp ? "As despesas do mês entram proporcionais aos dias do período escolhido." : "Sem despesas cadastradas neste período."
    ].filter(Boolean).join(" ");
    return nota(periodo) + `
      <section class="grid2" style="grid-template-columns:1fr"><div class="kpi"><span class="label">Custo total no período</span><span class="value">${brl(total)}</span><span class="sub">Maior gasto: ${esc(maior[0])}, ${pct((maior[1] / total) * 100, 0)} dos custos</span></div></section>
      <section class="card"><h2>Para onde vai o dinheiro</h2>${pizzaCustos(partes, total)}<div class="split" style="margin-top:16px">${legenda}</div><p class="foot" style="text-align:left">${avisos}</p></section>
      ${rank}`;
  }
  
  /* ingredientes e mercadorias: registrar compra, produtos e últimas compras */
  const telaIngredientes = () => cuIniciar("ing", cuIng);
  async function cuIng() {
    try {
      const [ins, com] = await Promise.all([api(cuBase() + "/insumos"), api(cuBase() + "/compras")]);
      if (!cuVivo("ing")) return;
      const lista = ins.insumos, ed = cuEstado.edit;
      const prods = lista.map((i) => ed === "p:" + i.id
        ? `<div class="split-row" style="display:grid;gap:8px"><input id="ed-nome" value="${esc(i.nome)}" maxlength="80"><div style="display:flex;gap:8px"><button class="btn primary" data-save-prod="${esc(i.id)}" style="flex:1">Salvar</button><button class="btn" data-cancel style="flex:1">Cancelar</button></div></div>`
        : `<div class="split-row"><div class="split-head"><span>${esc(i.nome)}</span><span>${cuBtnIc("data-edit-prod", i.id, "Editar produto", "✎")} ${cuBtnIc("data-del-prod", i.id, "Remover produto", "✕")}</span></div><span class="muted" style="font-size:12px">${Number(i.custo_unitario) > 0 ? cuPreco(Number(i.custo_unitario), i.unidade) : "sem compra ainda"}</span></div>`).join("");
      const itens = com.compras.map((c) => ed === "c:" + c.id
        ? `<div class="split-row" style="display:grid;gap:8px"><b>${esc(c.nome)}</b>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input id="ed-qtd" inputmode="decimal" value="${esc(String(c.quantidade).replace(".", ","))}" aria-label="Quantidade em ${esc(c.unidade)}"><input id="ed-valor" inputmode="decimal" value="${esc(String(c.valor_total).replace(".", ","))}" aria-label="Valor pago"></div>
            <input id="ed-forn" value="${esc(c.fornecedor || "")}" placeholder="Fornecedor (opcional)">
            <div style="display:flex;gap:8px"><button class="btn primary" data-save-compra="${esc(c.id)}" style="flex:1">Salvar</button><button class="btn" data-cancel style="flex:1">Cancelar</button></div>
            <span class="muted" style="font-size:12px">Quantidade em ${esc(c.unidade)} e valor total pago.</span></div>`
        : `<div class="split-row"><div class="split-head"><span>${esc(c.nome)} · ${Number(c.quantidade).toLocaleString("pt-BR")} ${esc(c.unidade)}</span><span>${brl(c.valor_total)} ${cuBtnIc("data-edit-compra", c.id, "Editar compra", "✎")} ${cuBtnIc("data-del-compra", c.id, "Remover compra", "✕")}</span></div><span class="muted" style="font-size:12px">${fmtData(c.data_compra)}${c.fornecedor ? " · " + esc(c.fornecedor) : ""} · ${brl(Number(c.valor_total) / Number(c.quantidade))}/${esc(c.unidade)}</span></div>`).join("");
      $("cu-corpo").innerHTML = `
        <section class="card"><h2>Registrar compra</h2>
          <div style="display:grid;gap:10px">
            <input id="cu-nome" list="cu-lista" placeholder="Produto (ex.: Alface)" autocomplete="off">
            <datalist id="cu-lista">${lista.map((i) => `<option value="${esc(i.nome)}">`).join("")}</datalist>
            <div style="display:grid;grid-template-columns:1fr 110px;gap:10px"><input id="cu-qtd" inputmode="decimal" placeholder="Quantidade"><select id="cu-un"><option value="kg">kg</option><option value="l">litros</option><option value="un">unidades</option></select></div>
            <input id="cu-valor" inputmode="decimal" placeholder="Quanto pagou no total (R$)">
            <input id="cu-forn" placeholder="Fornecedor (opcional)">
            <button class="btn primary" id="cu-add">Registrar compra</button>
          </div>
          <p class="foot" style="text-align:left;margin-top:10px">O custo do produto passa a ser o da última compra.</p></section>
        <section class="card"><h2>Meus produtos</h2>${prods ? `<div class="split">${prods}</div>` : `<div class="empty">Nenhum produto ainda. Registre a primeira compra acima.</div>`}</section>
        <section class="card"><h2>Últimas compras</h2>${itens ? `<div class="split">${itens}</div>` : `<div class="empty">Nenhuma compra registrada ainda.</div>`}</section>`;
      const nome = $("cu-nome"), un = $("cu-un");
      nome.addEventListener("input", () => {
        const ach = lista.find((i) => cuNorm(i.nome) === cuNorm(nome.value));
        if (ach) { un.value = ach.unidade; un.disabled = true; } else un.disabled = false;
      });
      $("cu-add").onclick = async () => {
        const body = { insumo_nome: nome.value, unidade: un.value, quantidade: $("cu-qtd").value, valor_total: $("cu-valor").value, fornecedor: $("cu-forn").value };
        if (!body.insumo_nome.trim() || !body.quantidade.trim() || !body.valor_total.trim()) { toast("Preencha produto, quantidade e valor."); return; }
        const b = $("cu-add"); b.disabled = true;
        try {
          const r = await api(cuBase() + "/compras", { method: "POST", body: JSON.stringify(body) });
          toast(`${r.insumo.nome}: ${cuPreco(Number(r.insumo.custo_unitario), r.insumo.unidade)}`);
          if (cuVivo("ing")) cuIng();
        } catch (e) { toast(e.message); b.disabled = false; }
      };
      const refaz = () => { if (cuVivo("ing")) cuIng(); };
      $("cu-corpo").onclick = async (e) => {
        const t = e.target.closest("button"); if (!t) return;
        try {
          if (t.dataset.cancel !== undefined) { cuEstado.edit = ""; refaz(); }
          else if (t.dataset.editProd) { cuEstado.edit = "p:" + t.dataset.editProd; refaz(); }
          else if (t.dataset.editCompra) { cuEstado.edit = "c:" + t.dataset.editCompra; refaz(); }
          else if (t.dataset.saveProd) {
            await api(`${cuBase()}/insumos/${encodeURIComponent(t.dataset.saveProd)}`, { method: "PUT", body: JSON.stringify({ nome: $("ed-nome").value }) });
            cuEstado.edit = ""; toast("Produto atualizado."); refaz();
          } else if (t.dataset.saveCompra) {
            await api(`${cuBase()}/compras/${encodeURIComponent(t.dataset.saveCompra)}`, { method: "PUT", body: JSON.stringify({ quantidade: $("ed-qtd").value, valor_total: $("ed-valor").value, fornecedor: $("ed-forn").value }) });
            cuEstado.edit = ""; toast("Compra atualizada."); refaz();
          } else if (t.dataset.delCompra) {
            if (!confirm("Remover esta compra?")) return;
            const r = await api(`${cuBase()}/compras/${encodeURIComponent(t.dataset.delCompra)}`, { method: "DELETE" });
            if (r.produto_removido) toast("Compra e produto removidos."); refaz();
          } else if (t.dataset.delProd) {
            if (!confirm("Remover este produto e as compras dele?")) return;
            await api(`${cuBase()}/insumos/${encodeURIComponent(t.dataset.delProd)}`, { method: "DELETE" }); refaz();
          }
        } catch (err) { toast(err.message); }
      };
    } catch (e) { cuErro("ing", e); }
  }

  /* fichas dos pratos: quanto de cada produto vai em cada prato */
  const cuFicha = { aberto: null, linhas: [], busca: "" };
  const cuUn = (u) => (u === "kg" ? "g" : u === "l" ? "ml" : "un");
  const cuFator = (u) => (u === "un" ? 1 : 1000);
  const cuLinhasDe = (p) => p.ingredientes.map((g) => ({ insumo_id: g.insumo_id, q: String(Number((g.quantidade * cuFator(g.unidade)).toFixed(3))).replace(".", ",") }));

  const telaFichas = () => cuIniciar("fichas", cuFichas);
  async function cuFichas() {
    try {
      const [pr, ins] = await Promise.all([api(cuBase() + "/pratos"), api(cuBase() + "/insumos")]);
      if (!cuVivo("fichas")) return;
      const aberto = pr.pratos.find((p) => p.id === cuFicha.aberto);
      if (!aberto) { cuFicha.aberto = null; cuFichaLista(pr); } else cuFichaEditor(aberto, pr.pratos, ins.insumos);
    } catch (e) { cuErro("fichas", e); }
  }

  function cuFichaLista(pr) {
    const linhas = (lista) => lista.map((p) => {
      const est = p.pronto ? `<span class="tag" style="color:var(--up);border-color:currentColor">Pronto</span>` : p.ingredientes.length ? `<span class="tag red">Falta custo</span>` : `<span class="tag red">Falta preencher</span>`;
      const num = p.ingredientes.length ? `custo ${brl(p.custo_total)} · margem ${p.margem_pct === null ? "—" : pct(p.margem_pct, 0)}` : `vende por ${brl(p.preco)}`;
      return `<li><button class="row-btn" data-ficha="${esc(p.id)}"><span class="row-t"><b>${esc(p.nome)}</b><span>${num}</span></span>${est}<span class="chev">›</span></button></li>`;
    }).join("");
    $("cu-corpo").innerHTML = `<section class="card"><h2>Fichas dos pratos</h2>
      <p class="foot" style="text-align:left;margin:0 0 8px">${pr.resumo.prontos} de ${pr.resumo.total} pratos com ficha pronta. Toque em um prato para dizer quanto de cada produto ele leva.</p>
      <input id="fc-busca" type="search" placeholder="Buscar prato" value="${esc(cuFicha.busca)}" style="margin-bottom:8px">
      <ul class="list" id="fc-lista"></ul></section>`;
    const desenhar = () => {
      const t = cuNorm(cuFicha.busca), ls = pr.pratos.filter((p) => !t || cuNorm(p.nome).includes(t));
      $("fc-lista").innerHTML = ls.length ? linhas(ls) : `<div class="empty">${pr.pratos.length ? "Nenhum prato com esse nome." : "Nenhum prato ativo no cardápio."}</div>`;
    };
    desenhar();
    $("fc-busca").oninput = (e) => { cuFicha.busca = e.target.value; desenhar(); };
    $("cu-corpo").onclick = (e) => {
      const b = e.target.closest("[data-ficha]"); if (!b) return;
      const p = pr.pratos.find((x) => x.id === b.dataset.ficha); if (!p) return;
      cuFicha.aberto = p.id; cuFicha.linhas = cuLinhasDe(p); cuFichas();
    };
  }

  function cuFichaEditor(prato, pratos, insumos) {
    if (!insumos.length) {
      $("cu-corpo").innerHTML = `<section class="card"><h2>${esc(prato.nome)}</h2><div class="empty">Cadastre seus ingredientes primeiro, em Ingredientes e mercadorias.</div><button class="btn" id="fc-voltar" style="width:100%;margin-top:10px">← Pratos</button></section>`;
      $("fc-voltar").onclick = () => { cuFicha.aberto = null; cuFichas(); };
      return;
    }
    const mapa = Object.fromEntries(insumos.map((i) => [i.id, i]));
    prato.ingredientes.forEach((g) => { if (!mapa[g.insumo_id]) mapa[g.insumo_id] = { id: g.insumo_id, nome: g.nome, unidade: g.unidade, custo_unitario: g.custo_unitario }; });
    const todos = Object.values(mapa);
    const num = (v) => Number(String(v).replace(",", "."));
    const resumo = () => {
      let c = 0; for (const l of cuFicha.linhas) { const i = mapa[l.insumo_id], q = num(l.q); if (i && q > 0) c += (q / cuFator(i.unidade)) * Number(i.custo_unitario || 0); }
      const m = prato.preco - c, mp = prato.preco > 0 ? (m / prato.preco) * 100 : 0;
      $("fc-res").innerHTML = `Custo do prato: <b>${brl(c)}</b> · vende por <b>${brl(prato.preco)}</b><br>Sobra <b style="color:${m >= 0 ? "var(--up)" : "var(--down)"}">${brl(m)}</b> (${pct(mp, 0)})`;
    };
    const copiaveis = pratos.filter((p) => p.id !== prato.id && p.ingredientes.length);
    const linhasHtml = cuFicha.linhas.map((l, i) => {
      const ins = mapa[l.insumo_id], semCusto = ins && !(Number(ins.custo_unitario) > 0);
      return `<div class="split-row" style="display:grid;gap:8px">
        <select data-i="${i}" data-f="insumo"><option value="">Escolha o produto</option>${todos.map((t) => `<option value="${esc(t.id)}" ${t.id === l.insumo_id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select>
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center">
          <input data-i="${i}" data-f="q" inputmode="decimal" placeholder="Quantidade" value="${esc(l.q)}">
          <span class="muted">${ins ? cuUn(ins.unidade) : ""}</span>
          <button class="btn link small" data-rm="${i}" aria-label="Remover ingrediente">✕</button></div>
        ${semCusto ? `<span class="muted" style="font-size:12px">Sem custo ainda. Registre uma compra deste produto.</span>` : ""}</div>`;
    }).join("");
    $("cu-corpo").innerHTML = `
      <button class="btn link" id="fc-voltar" style="padding-left:0">← Pratos</button>
      <section class="card"><h2>${esc(prato.nome)}</h2>
        ${copiaveis.length ? `<select id="fc-copiar" style="margin-bottom:12px"><option value="">Copiar ingredientes de outro prato...</option>${copiaveis.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("")}</select>` : ""}
        ${linhasHtml ? `<div class="split">${linhasHtml}</div>` : `<div class="empty">Nenhum ingrediente ainda.</div>`}
        <button class="btn" id="fc-add" style="width:100%;margin-top:12px">+ Adicionar ingrediente</button></section>
      <section class="card"><p id="fc-res" style="margin:0;line-height:1.6"></p>
        <button class="btn primary" id="fc-save" style="width:100%;margin-top:12px">Salvar ficha</button>
        <p class="foot">Quantidade em gramas (g) ou mililitros (ml) para produtos de kg ou litro, e em unidades para os demais.</p></section>`;
    resumo();
    $("fc-voltar").onclick = () => { cuFicha.aberto = null; cuFichas(); };
    $("fc-add").onclick = () => { cuFicha.linhas.push({ insumo_id: "", q: "" }); cuFichaEditor(prato, pratos, insumos); };
    const cp = $("fc-copiar");
    if (cp) cp.onchange = () => {
      const o = pratos.find((p) => p.id === cp.value); if (!o) return;
      cuFicha.linhas = cuLinhasDe(o); cuFichaEditor(prato, pratos, insumos);
    };
    $("cu-corpo").onchange = (e) => {
      const el = e.target.closest("[data-f=insumo]"); if (!el) return;
      cuFicha.linhas[Number(el.dataset.i)].insumo_id = el.value; cuFichaEditor(prato, pratos, insumos);
    };
    $("cu-corpo").oninput = (e) => {
      const el = e.target.closest("[data-f=q]"); if (!el) return;
      cuFicha.linhas[Number(el.dataset.i)].q = el.value; resumo();
    };
    $("cu-corpo").onclick = (e) => {
      const r = e.target.closest("[data-rm]"); if (!r) return;
      cuFicha.linhas.splice(Number(r.dataset.rm), 1); cuFichaEditor(prato, pratos, insumos);
    };
    $("fc-save").onclick = async () => {
      const ingredientes = [];
      for (const l of cuFicha.linhas) {
        const q = num(l.q), vazio = !l.insumo_id && !String(l.q).trim();
        if (vazio) continue;
        if (!l.insumo_id || !(q > 0)) { toast("Confira os produtos e as quantidades."); return; }
        ingredientes.push({ insumo_id: l.insumo_id, quantidade: q / cuFator(mapa[l.insumo_id].unidade) });
      }
      const b = $("fc-save"); b.disabled = true;
      try {
        await api(`${cuBase()}/pratos/${encodeURIComponent(prato.id)}/ficha`, { method: "PUT", body: JSON.stringify({ ingredientes }) });
        toast("Ficha salva."); cuFicha.aberto = null; cuFichas();
      } catch (e) { toast(e.message); b.disabled = false; }
    };
  }

  /* despesas: folha, aluguel, impostos e outras contas, mês a mês */
  const telaDespesas = () => { if (!cuEstado.mes) cuEstado.mes = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7); return cuIniciar("desp", cuDespesas); };
  async function cuDespesas() {
    try {
      const d = await api(`${cuBase()}/despesas?mes=${cuEstado.mes}`);
      if (!cuVivo("desp")) return;
      const ed = cuEstado.edit, opcoes = (sel) => Object.entries(CAT_DESP).map(([k, n]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${n}</option>`).join("");
      const cats = Object.entries(d.por_categoria).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="split-row"><div class="split-head"><span>${esc(CAT_DESP[c] || c)}</span><span>${brl(v)} · ${pct(d.total ? (v / d.total) * 100 : 0, 0)}</span></div><div class="bar amber"><i style="width:${d.total ? (v / d.total) * 100 : 0}%"></i></div></div>`).join("");
      const itens = d.despesas.map((x) => ed === "d:" + x.id
        ? `<div class="split-row" style="display:grid;gap:8px"><select id="ed-cat">${opcoes(x.categoria)}</select><input id="ed-desc" value="${esc(x.descricao || "")}" placeholder="Descrição (opcional)"><input id="ed-dval" inputmode="decimal" value="${esc(String(x.valor).replace(".", ","))}" aria-label="Valor">
            <div style="display:flex;gap:8px"><button class="btn primary" data-save-desp="${esc(x.id)}" style="flex:1">Salvar</button><button class="btn" data-cancel style="flex:1">Cancelar</button></div></div>`
        : `<div class="split-row"><div class="split-head"><span>${esc(CAT_DESP[x.categoria] || x.categoria)}${x.descricao ? " · " + esc(x.descricao) : ""}</span><span>${brl(x.valor)} ${cuBtnIc("data-edit-desp", x.id, "Editar despesa", "✎")} ${cuBtnIc("data-del-desp", x.id, "Remover despesa", "✕")}</span></div></div>`).join("");
      $("cu-corpo").innerHTML = `
        <section class="card"><h2>Mês</h2><input id="cu-mes" type="month" value="${esc(cuEstado.mes)}">
          <div class="kpi" style="margin-top:12px"><span class="label">Total de despesas</span><span class="value">${brl(d.total)}</span></div>
          ${cats ? `<div class="split" style="margin-top:12px">${cats}</div>` : ""}</section>
        <section class="card"><h2>Lançamentos</h2>${itens ? `<div class="split">${itens}</div>` : `<div class="empty">Nenhuma despesa neste mês.</div><button class="btn" id="cu-copiar" style="width:100%;margin-top:10px">Copiar despesas do mês anterior</button>`}</section>
        <section class="card"><h2>Adicionar despesa</h2><div style="display:grid;gap:10px">
          <select id="cu-cat">${opcoes("")}</select>
          <input id="cu-desc" placeholder="Descrição (opcional)">
          <input id="cu-dval" inputmode="decimal" placeholder="Valor (R$)">
          <button class="btn primary" id="cu-dadd">Adicionar</button></div>
          <p class="foot" style="text-align:left;margin-top:10px">Para imposto sobre as vendas, lance o valor que você paga no mês (ex.: a guia do Simples).</p></section>`;
      const refaz = () => { if (cuVivo("desp")) cuDespesas(); };
      $("cu-mes").addEventListener("change", (e) => { if (e.target.value) { cuEstado.mes = e.target.value; cuEstado.edit = ""; refaz(); } });
      $("cu-dadd").onclick = async () => {
        const valor = $("cu-dval").value; if (!valor.trim()) { toast("Informe o valor."); return; }
        const b = $("cu-dadd"); b.disabled = true;
        try {
          await api(cuBase() + "/despesas", { method: "POST", body: JSON.stringify({ categoria: $("cu-cat").value, descricao: $("cu-desc").value, valor, mes: cuEstado.mes }) });
          toast("Despesa adicionada."); refaz();
        } catch (e) { toast(e.message); b.disabled = false; }
      };
      const cp = $("cu-copiar");
      if (cp) cp.onclick = async () => {
        cp.disabled = true;
        try { await api(cuBase() + "/despesas/copiar", { method: "POST", body: JSON.stringify({ mes: cuEstado.mes }) }); refaz(); }
        catch (e) { toast(e.message); cp.disabled = false; }
      };
      $("cu-corpo").onclick = async (e) => {
        const t = e.target.closest("button"); if (!t) return;
        try {
          if (t.dataset.cancel !== undefined) { cuEstado.edit = ""; refaz(); }
          else if (t.dataset.editDesp) { cuEstado.edit = "d:" + t.dataset.editDesp; refaz(); }
          else if (t.dataset.saveDesp) {
            await api(`${cuBase()}/despesas/${encodeURIComponent(t.dataset.saveDesp)}`, { method: "PUT", body: JSON.stringify({ categoria: $("ed-cat").value, descricao: $("ed-desc").value, valor: $("ed-dval").value }) });
            cuEstado.edit = ""; toast("Despesa atualizada."); refaz();
          } else if (t.dataset.delDesp) {
            if (!confirm("Remover esta despesa?")) return;
            await api(`${cuBase()}/despesas/${encodeURIComponent(t.dataset.delDesp)}`, { method: "DELETE" }); refaz();
          }
        } catch (err) { toast(err.message); }
      };
    } catch (e) { cuErro("desp", e); }
  }
  
  function telaSimulador(d) {
    if (!temExec(d.restaurant.plan)) return lockCard("O simulador de precificação faz parte do plano Executive.");
    return nota(d.period) + `<section class="card sim"><h2>Simular novo preço ${exemplo}</h2>
      <label for="sim-p"><span>Mudança no preço de venda</span><b id="sim-v">0%</b></label>
      <input id="sim-p" type="range" min="-20" max="20" step="1" value="0">
      <p class="foot" style="text-align:left">Premissa: cada +1% no preço reduz as vendas em 0,8%. Nada é alterado nos preços reais.</p>
      <div id="sim-out"></div></section>`;
  }
  function bindSim(d) {
    const el = $("sim-p"); if (!el) return;
    const k = d.kpis, f = fin(k.revenue);
    const calc = () => {
      const p = Number(el.value) / 100, v = -0.8 * p;
      const rev2 = k.revenue * (1 + p) * (1 + v), cmv2 = f.cmv * (1 + v), res2 = rev2 - rev2 * FIN.imposto - cmv2 - f.totDesp;
      const dRes = res2 - f.resultado, ped2 = k.orders * (1 + v), tk2 = ped2 > 0 ? rev2 / ped2 : 0, mg2 = rev2 > 0 ? (res2 / rev2) * 100 : 0;
      $("sim-v").textContent = (p > 0 ? "+" : "") + Math.round(p * 100) + "%";
      $("sim-out").innerHTML = `<div class="compare">
        <div class="kpi"><span class="label">Faturamento</span><span class="value">${brl(rev2)}</span><span class="sub">hoje ${brl(k.revenue)}</span></div>
        <div class="kpi"><span class="label">Resultado</span><span class="value">${brl(res2)}</span><span class="sub">hoje ${brl(f.resultado)}</span></div>
        <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(ped2)}</span><span class="sub">hoje ${int(k.orders)}</span></div>
        <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(tk2)}</span><span class="sub">margem ${pct(mg2)}</span></div></div>
        <p class="peak">Impacto no resultado: <span class="pill ${dRes >= 0 ? "up" : "down"}">${dRes >= 0 ? "+" : ""}${brl(dRes)}</span></p>`;
    };
    el.addEventListener("input", calc); calc();
  }

  function telaPrevisao(d) {
    if (!temExec(d.restaurant.plan)) return lockCard("A previsão de demanda faz parte do plano Executive.");
    return nota(d.period) + secPrev(d);
  }

  function telaCaixa(d) {
    const dias = d.timeline.filter((x) => x.revenue > 0).slice(-5).reverse();
    const div = [0, -4.5, 0, 2, 0];
    const lista = dias.map((x, i) => `<div class="shift"><div class="shift-h"><span>Turno de ${fmtData(x.date)}</span><span class="tag">${i === 0 && d.period.to === x.date ? "Fechado" : "Fechado"}</span></div>
      <div class="shift-g"><span>Fundo inicial</span><b>${brl(100)}</b><span>Faturamento do turno</span><b>${brl(x.revenue)}</b><span>Pedidos</span><b>${int(x.orders)}</b><span>Conferência</span><b style="color:${div[i % 5] === 0 ? "var(--up)" : "var(--down)"}">${div[i % 5] === 0 ? "Sem diferença" : brl(div[i % 5])}</b></div></div>`).join("");
    return nota(d.period) + `<section class="card"><h2>Turnos do caixa ${exemplo}</h2>${lista || `<div class="empty">Sem turnos no período.</div>`}
      <p class="foot">Faturamento e pedidos vêm das vendas. A conferência do fechamento será ligada ao caixa do Operacional.</p></section>`;
  }

  function telaPdf(d) {
    const exec = temExec(d.restaurant.plan);
    const secs = [["resumo", "Resumo e indicadores", true], ["grafico", "Gráfico de vendas", true], ["canais", "Vendas por canal", true], ["produtos", "Mais vendidos", true], ["dre", "DRE gerencial", exec], ["rent", "Rentabilidade por canal", exec], ["prev", "Previsão de demanda", exec]];
    return nota(d.period) + `<section class="card"><h2>Escolha o que entra no relatório</h2><div class="checks">
      ${secs.map(([k, n, ok]) => `<label class="check"><input type="checkbox" data-sec="${k}" ${ok ? "checked" : "disabled"}><span style="flex:1">${n}</span>${ok ? "" : '<span class="tag red">Executive</span>'}</label>`).join("")}</div>
      <button class="btn primary" id="pdf-go" style="width:100%;margin-top:14px">Gerar PDF do período</button>
      <p class="foot">Abre a impressão do aparelho: escolha “Salvar como PDF”.</p></section>`;
  }
  function bindPdf(d) {
    const b = $("pdf-go"); if (!b) return;
    b.onclick = () => {
      const on = [...document.querySelectorAll("[data-sec]")].filter((c) => c.checked).map((c) => c.dataset.sec);
      if (!on.length) { toast("Marque ao menos uma seção."); return; }
      const mapa = { resumo: secResumo, grafico: secGrafico, canais: secCanais, produtos: secProdutos, dre: secDre, rent: secRent, prev: secPrev };
      $("print-area").innerHTML = `<h1>FluxON Owner — ${esc(d.restaurant.name)}</h1><p class="muted">Período: ${fmtData(d.period.from)} a ${fmtData(d.period.to)} (${d.period.days} ${d.period.days === 1 ? "dia" : "dias"}) · gerado em ${new Date().toLocaleString("pt-BR")}</p>` + on.map((k) => mapa[k](d)).join("");
      window.print();
    };
  }
  window.addEventListener("afterprint", () => { $("print-area").innerHTML = ""; });

  /* ---------- início ---------- */
  if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("/sw.js").catch(() => {});
  st.token = DEMO ? "demo" : store.get(TOKEN_KEY);
  if (st.token) entrar().catch(() => { if (!st.token) return; loginView(); });
  else loginView();
})();
