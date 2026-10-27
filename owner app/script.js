(() => {
  "use strict";
  const API = (window.OWNER_API || "").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "fluxon_owner_token";

  const PERIODS = [
    ["today", "Hoje"], ["3d", "3 dias"], ["5d", "5 dias"], ["7d", "7 dias"],
    ["10d", "10 dias"], ["30d", "30 dias"], ["custom", "Personalizado"]
  ];

  const st = {
    token: null, owner: null, restaurants: [],
    view: "overview",
    period: "7d", from: "", to: "",
    reqId: 0
  };

  /* ---------- utilitários ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const int = (n) => (Number(n) || 0).toLocaleString("pt-BR");
  const pct = (n) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
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

  async function api(path, opts = {}) {
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
    try {
      await api("/owner/auth/solicitar", { method: "POST", body: JSON.stringify({ cpf, telefone }) });
      return true;
    } catch (e) { setMsg(e.message); return false; }
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
      const r = await api("/owner/auth/verificar", {
        method: "POST",
        body: JSON.stringify({ cpf: $("in-cpf").value.replace(/\D/g, ""), telefone: $("in-tel").value.replace(/\D/g, ""), codigo })
      });
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

  /* ---------- app ---------- */
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
    montarPeriodos(); montarAvatar(); carregar();
  }

  function montarPeriodos() {
    $("periods").innerHTML = PERIODS.map(([k, l]) =>
      `<button class="chip" role="tab" data-p="${k}" aria-selected="${st.period === k}">${l}</button>`).join("");
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
    const multi = st.restaurants.length > 1;
    const itens = [];
    if (multi) itens.push(`<button data-v="overview" class="${st.view === "overview" ? "on" : ""}" role="menuitem"><span class="dot">∑</span><span class="name">Visão geral</span>${st.view === "overview" ? '<span class="tick">✓</span>' : ""}</button>`);
    itens.push(`<div class="sec">${multi ? "Restaurantes" : "Restaurante"}</div>`);
    st.restaurants.forEach((r) => itens.push(
      `<button data-v="${esc(r.id)}" class="${st.view === r.id ? "on" : ""}" role="menuitem"><span class="dot">${esc(iniciais(r.name))}</span><span class="name">${esc(r.name)}</span>${st.view === r.id ? '<span class="tick">✓</span>' : ""}</button>`));
    $("menu").innerHTML =
      `<div class="who"><b>${esc(st.owner.nome)}</b><span class="muted">Dono${multi ? ` · ${st.restaurants.length} unidades` : ""}</span></div>` +
      itens.join("") +
      `<div class="sec">Conta</div><button data-act="sair" role="menuitem"><span class="name">Sair</span></button>` +
      `<button class="danger" data-act="sair-todos" role="menuitem"><span class="name">Sair de todos os aparelhos</span></button>`;
  }
  function abrirMenu(abrir) {
    $("menu").classList.toggle("hidden", !abrir); $("avatar").setAttribute("aria-expanded", String(abrir));
  }
  $("avatar").addEventListener("click", (e) => { e.stopPropagation(); abrirMenu($("menu").classList.contains("hidden")); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".avatar-wrap")) abrirMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") abrirMenu(false); });
  $("menu").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.v) { irPara(b.dataset.v); abrirMenu(false); return; }
    if (b.dataset.act === "sair") { abrirMenu(false); sair(); }
    if (b.dataset.act === "sair-todos") {
      abrirMenu(false);
      try { await api("/owner/auth/sair-todos", { method: "POST" }); } catch {}
      sair();
    }
  });
  function irPara(v) {
    st.view = v; store.set("fluxon_owner_view", v); montarAvatar(); carregar(); window.scrollTo({ top: 0 });
  }

  /* ---------- carregamento ---------- */
  function qs() {
    return st.period === "custom" ? `period=custom&from=${st.from}&to=${st.to}` : `period=${st.period}`;
  }
  async function carregar() {
    if (st.period === "custom" && !(st.from && st.to)) {
      $("content").innerHTML = `<div class="empty">Escolha as datas e toque em Aplicar.</div>`; return;
    }
    const my = ++st.reqId;
    const r = st.restaurants.find((x) => x.id === st.view);
    $("title").textContent = r ? r.name : "Visão geral";
    $("content").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    try {
      const html = st.view === "overview"
        ? telaOverview(await api("/owner/overview?" + qs()))
        : telaRestaurante(await api(`/owner/restaurants/${encodeURIComponent(st.view)}/dashboard?` + qs()));
      if (my !== st.reqId) return;
      $("content").innerHTML = html;
    } catch (e) {
      if (my !== st.reqId) return;
      $("content").innerHTML = `<div class="card err"><p style="margin:0 0 12px">${esc(e.message)}</p><button class="btn" id="retry">Tentar de novo</button></div>`;
      const b = $("retry"); if (b) b.onclick = carregar;
    }
  }
  $("content").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]"); if (b) irPara(b.dataset.open);
  });

  /* ---------- telas ---------- */
  function delta(v, rotulo = "vs período anterior") {
    if (v === null || v === undefined) return `<span class="delta flat">sem base de comparação</span>`;
    const cls = v > 0.05 ? "up" : v < -0.05 ? "down" : "flat";
    const seta = cls === "up" ? "▲" : cls === "down" ? "▼" : "•";
    return `<span class="delta ${cls}">${seta} ${pct(Math.abs(v))} <span class="muted" style="font-weight:400">${rotulo}</span></span>`;
  }
  const nota = (p) => `<p class="period-note">${fmtData(p.from)}${p.from !== p.to ? " a " + fmtData(p.to) : ""} · ${p.days} ${p.days === 1 ? "dia" : "dias"}</p>`;

  function telaOverview(d) {
    const t = d.totals;
    const itens = d.ranking.map((r) => `
      <li><button data-open="${esc(r.restaurant_id)}">
        <div class="rank-top"><span class="pos ${r.position === 1 ? "p1" : ""}">${r.position}</span>
          <span class="nm">${esc(r.name)}</span><span class="rv">${brl(r.revenue)}</span></div>
        <div class="bar"><i style="width:${Math.max(2, Math.min(100, r.share))}%"></i></div>
        <div class="rank-sub"><span>${int(r.orders)} pedidos</span><span>ticket ${brl(r.ticket)}</span><span>${pct(r.share)} do total</span>
          ${delta(r.growth_revenue, "")}</div>
      </button></li>`).join("");
    return nota(d.period) + `
      <section class="kpis">
        <div class="kpi hero"><span class="label">Faturamento total</span><span class="value">${brl(t.revenue)}</span>${delta(t.growth_revenue)}</div>
        <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(t.orders)}</span>${delta(t.growth_orders, "")}</div>
        <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(t.ticket)}</span></div>
      </section>
      <section class="card"><h2>Ranking por faturamento</h2>
        ${d.ranking.length ? `<ul class="rank">${itens}</ul>` : `<div class="empty">Nenhuma unidade vinculada.</div>`}
      </section>`;
  }

  function grafico(tl) {
    const max = Math.max(...tl.map((x) => x.revenue), 1);
    const W = 600, H = 170, base = 140, topo = 14, n = tl.length, gap = n > 20 ? 2 : 6;
    const bw = (W - gap * (n + 1)) / n;
    const passo = Math.ceil(n / 7);
    const barras = tl.map((x, i) => {
      const h = Math.max(x.revenue > 0 ? 3 : 0, (x.revenue / max) * (base - topo));
      const px = gap + i * (bw + gap);
      const rotulo = (i % passo === 0 || i === n - 1) ? `<text x="${px + bw / 2}" y="${H - 6}" text-anchor="middle">${fmtData(x.date)}</text>` : "";
      return `<rect x="${px.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${fmtData(x.date)}: ${brl(x.revenue)} · ${x.orders} pedidos</title></rect>${rotulo}`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento por dia"><line x1="0" x2="${W}" y1="${base}" y2="${base}"/>${barras}</svg>`;
  }

  function telaRestaurante(d) {
    const k = d.kpis;
    const total = d.canais.salao.revenue + d.canais.balcao.revenue + d.canais.delivery.revenue;
    const nomes = { salao: "Salão", balcao: "Balcão", delivery: "Delivery" };
    const canais = Object.keys(nomes).map((c) => {
      const v = d.canais[c], p = total > 0 ? (v.revenue / total) * 100 : 0;
      return `<div class="split-row"><div class="split-head"><span>${nomes[c]}</span><span>${brl(v.revenue)} · ${int(v.orders)} ped.</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`;
    }).join("");
    const maxQ = Math.max(...d.top_produtos.map((p) => p.qty), 1);
    const tops = d.top_produtos.map((p) => `<li><div class="row"><span>${esc(p.nome)}</span><span>${int(p.qty)}×</span></div><div class="bar"><i style="width:${(p.qty / maxQ) * 100}%"></i></div></li>`).join("");
    const roi = k.roi_locked
      ? `<div class="kpi"><span class="label">ROI do FluxON</span><span class="value">—</span><span class="lock">Disponível no plano Executive</span></div>`
      : `<div class="kpi"><span class="label">ROI do FluxON</span><span class="value">${(k.roi || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×</span><span class="lock">faturamento ÷ mensalidade</span></div>`;
    return nota(d.period) + `
      <section class="kpis">
        <div class="kpi hero"><span class="label">Faturamento</span><span class="value">${brl(k.revenue)}</span>${delta(k.growth.revenue)}</div>
        <div class="kpi"><span class="label">Pedidos</span><span class="value">${int(k.orders)}</span>${delta(k.growth.orders, "")}</div>
        <div class="kpi"><span class="label">Ticket médio</span><span class="value">${brl(k.ticket)}</span>${delta(k.growth.ticket, "")}</div>
        <div class="kpi"><span class="label">Cancelados</span><span class="value">${int(k.cancelados)}</span></div>
        ${roi}
      </section>
      <section class="card"><h2>Faturamento por dia</h2>${grafico(d.timeline)}</section>
      <section class="card"><h2>Por canal</h2><div class="split">${canais}</div></section>
      <section class="card"><h2>Mais vendidos</h2>${tops ? `<ul class="tops">${tops}</ul>` : `<div class="empty">Sem vendas no período.</div>`}</section>`;
  }

  /* ---------- início ---------- */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  st.token = store.get(TOKEN_KEY);
  if (st.token) entrar().catch(() => { if (!st.token) return; loginView(); });
  else loginView();
})();
