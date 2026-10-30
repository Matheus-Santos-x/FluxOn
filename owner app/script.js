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
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>'
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
  $("back").addEventListener("click", () => { st.screen = "home"; render(); window.scrollTo({ top: 0 }); });

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
      else { const d = await api(`/owner/restaurants/${encodeURIComponent(st.view)}/dashboard?` + qs()); if (my !== st.reqId) return; st.dash = d; st.ov = null; }
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

  const TITULOS = { dre: "Financeiro e DRE", custos: "Custos e estoque", canais: "Rentabilidade por canal", clientes: "Clientes e origem", simulador: "Simulador de preços", previsao: "Previsão de demanda", caixa: "Relatórios do caixa", pdf: "Exportar PDF" };
  function render() {
    const ov = st.view === "overview";
    $("back").classList.toggle("hidden", ov || st.screen === "home");
    if (ov) { $("title").textContent = "Visão geral"; $("content").innerHTML = telaOverview(st.ov); return; }
    const d = st.dash;
    $("title").textContent = st.screen === "home" ? d.restaurant.name : TITULOS[st.screen];
    const T = { home: telaHome, dre: telaDre, custos: telaCustos, canais: telaCanais, clientes: telaClientes, simulador: telaSimulador, previsao: telaPrevisao, caixa: telaCaixa, pdf: telaPdf }[st.screen];
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
      <div class="kpi"><span class="label">CMV ${exemplo}</span><span class="value">${pct(FIN.cmv * 100)}</span></div>
      <div class="kpi"><span class="label">Resultado estimado ${exemplo}</span><span class="value">${brl(f.resultado)}</span><span class="sub">margem ${pct(m)}</span></div>
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
  function secDre(d) {
    const f = fin(d.kpis.revenue), m = (v) => (f.rev > 0 ? pct((v / f.rev) * 100) : "—");
    const linha = (n, v, cls = "") => `<tr class="${cls}"><td>${n}</td><td>${cls.includes("sub") ? "" : ""}${brl(v)} <span class="muted" style="font-size:12px">${m(v)}</span></td></tr>`;
    return `<section class="card"><h2>DRE gerencial ${exemplo}</h2><table class="dre">
      ${linha("Receita bruta", f.rev, "tot")}
      ${linha("(−) Impostos", -f.imposto, "sub")}
      ${linha("Receita líquida", f.liquida, "tot")}
      ${linha("(−) CMV", -f.cmv, "sub")}
      ${linha("Lucro bruto", f.bruto, "tot")}
      ${f.despesas.map(([n, v]) => linha("(−) " + n, -v, "sub")).join("")}
      ${linha("Resultado estimado", f.resultado, "tot res")}
    </table></section>`;
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
            <section class="card lockcard"><span class="big">${ic("wallet")}</span><b>Descubra seu lucro real</b><p>Cadastre os custos das suas mercadorias para ver o CMV e o lucro líquido do seu restaurante.</p></section>
      <section class="grid4">
        <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(k.orders)}</span>${delta(k.growth.orders, "")}</div>
        <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(k.ticket)}</span>${delta(k.growth.ticket, "")}</div>
        <div class="kpi"><span class="label">Cancelados</span><span class="value">${int(k.cancelados)}</span></div>
        ${roi}
      </section>
      ${secGrafico(d)}
      <section class="card"><h2>Fluxo de caixa ${exemplo}</h2><div class="split">
        <div class="split-row"><div class="split-head"><span>Entradas</span><span>${brl(k.revenue)}</span></div><div class="bar"><i style="width:100%"></i></div></div>
        <div class="split-row"><div class="split-head"><span>Saídas estimadas</span><span>${brl(saidas)}</span></div><div class="bar amber"><i style="width:${k.revenue > 0 ? Math.min(100, (saidas / k.revenue) * 100) : 0}%"></i></div></div>
        <div class="split-head"><b>Saldo do período</b><b style="color:${saldo >= 0 ? "var(--up)" : "var(--down)"}">${brl(saldo)}</b></div></div></section>
      <section class="card"><h2>Visão geral</h2><ul class="list">
        ${item("dre", "wallet", "Financeiro e DRE", "Receitas, CMV, despesas e resultado", exec, "Executive")}
        ${item("custos", "box", "Custos e estoque", "CMV, itens com estoque baixo", adv, "Advanced")}
        ${item("canais", "pie", "Rentabilidade por canal", "Salão, balcão e delivery", exec, "Executive")}
        ${item("clientes", "users", "Clientes e origem dos pedidos", "Novos, recorrentes e de onde vêm", true, "")}
        ${item("previsao", "trend", "Previsão de demanda", "Próximos dias, picos e produtos", exec, "Executive")}
        ${item("caixa", "file", "Relatórios do caixa", "Turnos abertos e fechados", true, "")}
        ${item("pdf", "print", "Exportar PDF", "Escolha o período e as seções", true, "")}
      </ul></section>
      ${secCanais(d)}${secProdutos(d)}
      <p class="foot">Itens marcados como “Exemplo” usam estimativas até o cadastro de custos e despesas.</p>`;
  }

  function telaDre(d) {
    if (!temExec(d.restaurant.plan)) return lockCard("A DRE gerencial completa, com CMV, despesas e resultado, faz parte do plano Executive.");
    return nota(d.period) + secResumo(d) + secDre(d) +
      `<section class="card"><h2>Despesas ${exemplo}</h2><div class="split">${fin(d.kpis.revenue).despesas.map(([n, v]) => `<div class="split-row"><div class="split-head"><span>${n}</span><span>${brl(v)}</span></div><div class="bar amber"><i style="width:${d.kpis.revenue > 0 ? Math.min(100, (v / d.kpis.revenue) * 300) : 0}%"></i></div></div>`).join("")}</div>
      <p class="foot">O cadastro de despesas pelo app (folha, aluguel, impostos, etc.) entra na próxima etapa.</p></section>`;
  }

  function telaCustos(d) {
    if (!temAdv(d.restaurant.plan)) return lockCard("A gestão de estoque e o acompanhamento de custos fazem parte do plano Advanced.", "Advanced");
    const f = fin(d.kpis.revenue);
    const est = [["Carne bovina 180g", 4.2, 10, "kg"], ["Pão brioche", 18, 40, "un"], ["Queijo cheddar", 22, 15, "kg"], ["Batata congelada", 0, 12, "kg"], ["Bacon", 7, 6, "kg"], ["Refrigerante lata", 96, 48, "un"]];
    const sts = est.map(([n, q, mn, u]) => {
      const s = q <= 0 ? ["out", "Esgotado"] : q < mn ? ["low", "Baixo"] : ["ok", "Normal"];
      return `<div class="stock-row"><div class="stock-head"><span>${n}</span><span><b>${q} ${u}</b> <span class="st ${s[0]}">${s[1]}</span></span></div><div class="bar ${s[0] === "ok" ? "" : "amber"}"><i style="width:${Math.min(100, (q / (mn * 2)) * 100)}%"></i></div></div>`;
    }).join("");
    const grupos = [["Carnes", 0.42], ["Pães e massas", 0.18], ["Laticínios", 0.14], ["Bebidas", 0.12], ["Hortifrúti e outros", 0.14]];
    return nota(d.period) + `
      <section class="grid2"><div class="kpi"><span class="label">CMV ${exemplo}</span><span class="value">${pct(FIN.cmv * 100)}</span></div><div class="kpi"><span class="label">Custo das vendas ${exemplo}</span><span class="value">${brl(f.cmv)}</span></div></section>
      <section class="card"><h2>Para onde vai o custo ${exemplo}</h2><div class="split">${grupos.map(([n, p]) => `<div class="split-row"><div class="split-head"><span>${n}</span><span>${brl(f.cmv * p)} · ${pct(p * 100, 0)}</span></div><div class="bar"><i style="width:${p * 100}%"></i></div></div>`).join("")}</div></section>
      <section class="card"><h2>Estoque ${exemplo}</h2><div class="stock">${sts}</div><p class="foot">Estoque real vs. esperado e entradas por nota entram nas próximas etapas.</p></section>`;
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
