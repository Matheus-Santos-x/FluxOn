/* ============================================================
   RASTREIO — o cliente acompanha o pedido dentro do próprio cardápio.
   - Pedido feito neste celular ou link do WhatsApp (?acompanhar=CÓDIGO) → o código fica guardado.
   - Enquanto tem pedido em andamento, o cardápio abre direto no rastreio
     ("Fazer outro pedido" volta pro cardápio; a faixa "Acompanhar" leva de volta).
   - Mapa sempre na tela: o balãozinho mostra a etapa em cima do restaurante;
     quando sai pra entrega, a moto anda até a casa com a rota desenhada.
   - Depois de entregue, fica 1 hora aparecendo e some sozinho.
   ============================================================ */
const rastreio = (() => {
  const UMA_HORA = 60 * 60 * 1000;
  const R = { lista: [], dados: new Map(), atual: null, aberto: false, mapa: null, m: {}, sockets: new Map(), rotaDe: null, rotaEm: 0, linhas: [] };
  const chave = () => `fx_rastreio_${RESTAURANT_ID}`;
  const esc = (s) => escHtml(String(s ?? ""));
  const money = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const valido = (c) => /^[a-f0-9]{20}$/.test(String(c || ""));

  /* ---------- códigos guardados neste celular ---------- */
  function ler() { try { R.lista = JSON.parse(localStorage.getItem(chave()) || "[]").filter((x) => valido(x.c)); } catch { R.lista = []; } }
  function salvar() { try { localStorage.setItem(chave(), JSON.stringify(R.lista.slice(-10))); } catch {} }
  function adicionar(codigo, numero) {
    if (!valido(codigo)) return;
    ler();
    if (!R.lista.some((x) => x.c === codigo)) R.lista.push({ c: codigo, n: numero || null, t: Date.now() });
    salvar();
  }

  // pedido em andamento, ou entregue/cancelado há menos de 1 hora
  function ativo(d) {
    if (!d || d.pedido.status === "draft") return false;
    const st = d.pedido.status;
    if (st === "finished") return Date.now() - new Date(d.pedido.entregue_em || 0).getTime() < UMA_HORA;
    if (st === "cancelled" || st === "canceled") return Date.now() - new Date(d.pedido.cancelado_em || 0).getTime() < UMA_HORA;
    return true;
  }
  const emAndamento = (d) => d && !["finished", "cancelled", "canceled"].includes(d.pedido.status);

  async function buscar(codigo) {
    try {
      const r = await fetch(`${CONFIG.API_BASE}/api/v1/entrega/acompanhar/${codigo}`);
      if (r.status === 404) return { naoExiste: true };
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  /* ---------- início: chamado pelo app.js depois que o cardápio carrega ---------- */
  async function iniciar() {
    ler();
    const url = new URL(location.href);
    const doLink = url.searchParams.get("acompanhar");
    if (valido(doLink)) {
      adicionar(doLink);
      url.searchParams.delete("acompanhar");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    if (!R.lista.length) return;
    await atualizarTodos();
    const ativos = ativosEmOrdem();
    if (!ativos.length) return;
    faixa();
    menuLateral();
    ligarTempoReal();
    const fechouNestaVisita = sessionStorage.getItem(`${chave()}_fechou`) === "1";
    if (valido(doLink) && R.dados.has(doLink)) abrir(doLink);
    else if (!fechouNestaVisita && ativos.some((c) => emAndamento(R.dados.get(c)))) abrir(ativos[0]);
  }

  async function atualizarTodos() {
    const res = await Promise.all(R.lista.map(async (x) => [x.c, await buscar(x.c)]));
    for (const [c, d] of res) {
      if (d?.naoExiste) { R.lista = R.lista.filter((x) => x.c !== c); R.dados.delete(c); continue; }
      if (d) R.dados.set(c, d);
    }
    // tira da lista o que já acabou faz mais de 1 hora
    R.lista = R.lista.filter((x) => !R.dados.has(x.c) || ativo(R.dados.get(x.c)) || Date.now() - x.t < UMA_HORA);
    salvar();
  }
  // os pedidos que aparecem: em andamento primeiro, depois os entregues na última hora
  function ativosEmOrdem() {
    return R.lista.map((x) => x.c).filter((c) => ativo(R.dados.get(c)))
      .sort((a, b) => (emAndamento(R.dados.get(b)) ? 1 : 0) - (emAndamento(R.dados.get(a)) ? 1 : 0));
  }

  /* ---------- textos de cada etapa ---------- */
  function etapa(d) {
    const st = d.pedido.status, nome = d.entregador?.nome;
    switch (st) {
      case "scheduled": return { n: 0, titulo: "Pedido agendado", sub: "Ele entra na cozinha no horário que você escolheu.", balao: "Agendado" };
      case "pending": return { n: 1, titulo: "Pedido recebido", sub: "O restaurante já recebeu e logo começa o preparo.", balao: "Pedido recebido" };
      case "preparing": return { n: 2, titulo: "Seu pedido está sendo preparado", sub: "Assim que ficar pronto, você vê aqui.", balao: "Preparando seu pedido" };
      case "mounting": return d.pedido.delivery
        ? { n: 3, titulo: "Pedido pronto", sub: "Aguardando o entregador sair com ele.", balao: "Pronto · aguardando o entregador" }
        : { n: 3, titulo: "Pedido pronto", sub: "Já pode retirar no restaurante.", balao: "Pronto pra retirar" };
      case "delivering": {
        let sub = nome ? `${nome} está a caminho.` : "O entregador está a caminho.";
        if (d.antes > 0) sub = `${nome || "O entregador"} vai entregar ${d.antes === 1 ? "1 pedido" : `${d.antes} pedidos`} antes do seu.`;
        else if (d.antes === 0) sub = `${nome || "O entregador"} está indo direto pra sua casa.`;
        return { n: 4, titulo: "Seu pedido saiu para entrega", sub, balao: d.antes > 0 ? `${nome || "Entregador"} · ${d.antes} antes de você` : `${nome || "Entregador"} · indo até você` };
      }
      case "finished": return { n: 5, titulo: "Pedido entregue ✓", sub: "Bom apetite! Obrigado por pedir com a gente.", balao: "Entregue ✓" };
      default: return { n: -1, titulo: "Pedido cancelado", sub: "Se tiver dúvida, fale com o restaurante.", balao: "Cancelado" };
    }
  }

  /* ---------- faixa no cardápio e item no menu lateral ---------- */
  function faixa() {
    let f = document.getElementById("rtFaixa");
    const ativos = ativosEmOrdem();
    if (!ativos.length) { f?.remove(); document.querySelector(".rt-side")?.remove(); return; }
    if (!f) {
      f = document.createElement("button");
      f.id = "rtFaixa"; f.type = "button"; f.className = "rt-faixa";
      f.onclick = () => abrir(ativos[0]);
      document.body.appendChild(f);
    }
    const d = R.dados.get(ativos[0]);
    const e = etapa(d);
    f.innerHTML = `<span class="rt-faixa-ic" aria-hidden="true">${e.n === 4 ? "🛵" : e.n === 5 ? "✅" : e.n < 0 ? "✖" : "🍳"}</span>
      <span class="rt-faixa-txt"><b>Pedido #${esc(d.pedido.numero)}</b><small>${esc(e.titulo)}</small></span>
      <span class="rt-faixa-acao">Acompanhar</span>`;
    f.onclick = () => abrir(ativos[0]);
  }
  function menuLateral() {
    const nav = document.querySelector("#sideMenu .side-menu-nav");
    if (!nav || nav.querySelector(".rt-side") || !ativosEmOrdem().length) return;
    const b = document.createElement("button");
    b.className = "side-item rt-side"; b.dataset.aba = "rastreio"; b.type = "button";
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>
      <span class="side-item-txt"><b>Rastreio</b><small>Acompanhe seu pedido</small></span>`;
    b.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); if (typeof fecharMenu === "function") fecharMenu(); const a = ativosEmOrdem(); if (a.length) abrir(a[0]); }, true);
    const fid = nav.querySelector('[data-aba="fidelidade"]');
    nav.insertBefore(b, fid || null);
  }

  /* ---------- a tela de rastreio ---------- */
  function montarTela() {
    if (document.getElementById("rtTela")) return;
    const t = document.createElement("section");
    t.id = "rtTela"; t.className = "rt-tela"; t.setAttribute("role", "dialog"); t.setAttribute("aria-label", "Acompanhar pedido");
    t.innerHTML = `
      <div class="rt-mapa" id="rtMapa"></div>
      <div class="rt-topo">
        <button type="button" class="rt-voltar" id="rtVoltar">← Fazer outro pedido</button>
      </div>
      <div class="rt-card" id="rtCard"></div>`;
    document.body.appendChild(t);
    document.getElementById("rtVoltar").onclick = () => fechar(true);
  }

  function abrir(codigo) {
    if (!R.dados.has(codigo)) return;
    montarTela();
    R.atual = codigo;
    if (!R.aberto) {
      R.aberto = true;
      document.getElementById("rtTela").classList.add("on");
      document.body.classList.add("rt-aberto");
      if (typeof lockBodyScroll === "function") lockBodyScroll();
      history.pushState({ rastreio: 1 }, "");
    }
    iniciarMapa();
    desenhar();
    ligarTempoReal();
  }
  function fechar(peloBotao) {
    if (!R.aberto) return;
    R.aberto = false;
    document.getElementById("rtTela")?.classList.remove("on");
    document.body.classList.remove("rt-aberto");
    if (typeof unlockBodyScroll === "function") unlockBodyScroll();
    try { sessionStorage.setItem(`${chave()}_fechou`, "1"); } catch {}
    if (peloBotao && history.state?.rastreio) history.back();
    faixa();
  }
  window.addEventListener("popstate", () => { if (R.aberto) fechar(false); });

  function desenhar() {
    const d = R.dados.get(R.atual);
    if (!d) return;
    const e = etapa(d), ativos = ativosEmOrdem();
    const passos = [["Recebido", d.pedido.recebido_em], ["Preparando", d.pedido.preparo_em], ["Pronto", d.pedido.pronto_em]];
    if (d.pedido.delivery) passos.push(["A caminho", d.pedido.saiu_em], ["Entregue", d.pedido.entregue_em]);
    const tel = String(d.restaurante.telefone || "").replace(/\D/g, "");
    const itens = (d.pedido.itens || []).map((i) => `${i.qtd}× ${esc(i.nome)}`).join(" · ");
    document.getElementById("rtCard").innerHTML = `
      ${ativos.length > 1 ? `<div class="rt-pedidos">${ativos.map((c) => `<button type="button" class="${c === R.atual ? "on" : ""}" data-rt="${c}">#${esc(R.dados.get(c).pedido.numero)}</button>`).join("")}</div>` : ""}
      <div class="rt-num">Pedido #${esc(d.pedido.numero)} · ${esc(d.restaurante.nome)}</div>
      <h2 class="rt-titulo">${esc(e.titulo)}</h2>
      <p class="rt-sub" id="rtSub">${esc(e.sub)}</p>
      ${e.n >= 0 ? `<ol class="rt-passos" style="--n:${passos.length}">${passos.map(([nome, quando], i) => {
        const cls = i + 1 < e.n || e.n === 5 ? "feito" : i + 1 === e.n ? "agora" : "";
        return `<li class="${cls}"><i></i><b>${nome}</b><small>${cls && quando ? hora(quando) : ""}</small></li>`;
      }).join("")}</ol>` : ""}
      <div class="rt-acoes">
        ${tel.length >= 10 ? `<a class="rt-btn" href="tel:${tel}">📞 Ligar pra loja</a>` : ""}
        ${itens ? `<button type="button" class="rt-btn" id="rtItensBtn">🧾 Ver o pedido</button>` : ""}
      </div>
      <p class="rt-itens" id="rtItens" hidden>${itens} · <b>${money(d.pedido.total)}</b></p>`;
    document.querySelectorAll("#rtCard [data-rt]").forEach((b) => b.onclick = () => abrir(b.dataset.rt));
    const ib = document.getElementById("rtItensBtn");
    if (ib) ib.onclick = () => { const p = document.getElementById("rtItens"); p.hidden = !p.hidden; };
    desenharMapa();
    faixa();
  }

  /* ---------- mapa (OpenStreetMap) ---------- */
  function iniciarMapa() {
    if (R.mapa || !window.L) return;
    R.mapa = L.map("rtMapa", { zoomControl: false }).setView([-22.6, -48.8], 15);
    R.mapa.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(R.mapa);
    document.getElementById("rtMapa").classList.toggle("escuro", !document.body.classList.contains("tema-gelo"));
  }
  const icone = (cls, html, tam) => L.divIcon({ className: "", html: `<div class="${cls}">${html}</div>`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });
  function marcador(nome, pos, cls, html, tam) {
    if (!pos) { R.m[nome]?.remove(); delete R.m[nome]; return null; }
    if (!R.m[nome]) R.m[nome] = L.marker([pos.lat, pos.lng], { icon: icone(cls, html, tam), zIndexOffset: nome === "moto" ? 1000 : 0 }).addTo(R.mapa);
    else R.m[nome].setLatLng([pos.lat, pos.lng]);
    return R.m[nome];
  }

  // endereço → ponto no mapa (guardado no celular pra não perguntar de novo)
  const _geoFila = [];
  let _geoAndando = false;
  function geo(endereco) {
    const k = String(endereco || "").trim();
    if (!k) return Promise.resolve(null);
    try { const c = JSON.parse(localStorage.getItem("fx_geo") || "{}"); if (c[k] !== undefined) return Promise.resolve(c[k]); } catch {}
    return new Promise((ok) => { _geoFila.push({ k, ok }); andarGeo(); });
  }
  async function andarGeo() {
    if (_geoAndando || !_geoFila.length) return;
    _geoAndando = true;
    const { k, ok } = _geoFila.shift();
    const limpo = k.replace(/\b\d{5}-?\d{3}\b/g, "").replace(/\s+-\s+/g, ", ").replace(/\//g, ", ").replace(/(,\s*)+$/, "");
    let res = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(limpo)}`, { headers: { "Accept-Language": "pt-BR" } });
      const j = await r.json();
      if (j[0]) res = { lat: +j[0].lat, lng: +j[0].lon };
    } catch {}
    try { const c = JSON.parse(localStorage.getItem("fx_geo") || "{}"); c[k] = res; localStorage.setItem("fx_geo", JSON.stringify(c)); } catch {}
    ok(res);
    setTimeout(() => { _geoAndando = false; andarGeo(); }, 1100);
  }

  async function desenharMapa() {
    if (!R.mapa) return;
    const codigo = R.atual, d = R.dados.get(codigo);
    if (!d) return;
    setTimeout(() => R.mapa.invalidateSize(), 50);
    const e = etapa(d);
    const [loja, casa] = await Promise.all([geo(d.restaurante.endereco || RESTAURANT_CONFIG.endereco), geo(d.pedido.delivery ? d.pedido.endereco : "")]);
    if (codigo !== R.atual) return;
    const logo = d.restaurante.logo_url ? `<img src="${esc(d.restaurante.logo_url)}" alt="">` : "🍽️";
    const mLoja = marcador("loja", loja, "rt-pin-loja", logo, 44);
    const mCasa = marcador("casa", casa, "rt-pin-casa", "🏠", 40);
    const naRua = d.pedido.status === "delivering";
    const mMoto = marcador("moto", naRua ? d.posicao : null, "rt-pin-moto", "🛵", 48);

    // o balãozinho fica em quem importa agora: restaurante → moto → casa
    Object.values(R.m).forEach((m) => m.unbindTooltip());
    const alvo = naRua && mMoto ? mMoto : d.pedido.status === "finished" && mCasa ? mCasa : mLoja || mCasa;
    alvo?.bindTooltip(esc(e.balao), { permanent: true, direction: "top", offset: [0, -24], className: "rt-balao" }).openTooltip();

    if (!naRua || !d.posicao || !casa) { R.linhas.forEach((l) => l.remove()); R.linhas = []; R.rotaDe = null; }
    else rota(d.posicao, casa);
    enquadrar();
  }

  function enquadrar() {
    const d = R.dados.get(R.atual);
    if (!d || !R.mapa) return;
    const card = document.getElementById("rtCard")?.offsetHeight || 0;
    const pts = d.pedido.status === "delivering"
      ? [R.m.moto, R.m.casa].filter(Boolean).map((m) => m.getLatLng())
      : d.pedido.status === "finished" ? [R.m.casa || R.m.loja].filter(Boolean).map((m) => m.getLatLng())
        : [R.m.loja || R.m.casa].filter(Boolean).map((m) => m.getLatLng());
    if (!pts.length) return;
    if (pts.length === 1) { R.mapa.setView(pts[0], 16, { animate: false }); R.mapa.panBy([0, card / 2 - 20], { animate: false }); }
    else R.mapa.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [80, 130], paddingBottomRight: [80, card + 40], maxZoom: 17 });
  }

  // rota da moto até a casa, pelas ruas (OSRM, gratuito); refaz se a moto andou bastante
  async function rota(de, ate) {
    const longe = !R.rotaDe || Math.abs(R.rotaDe.lat - de.lat) + Math.abs(R.rotaDe.lng - de.lng) > 0.0015;
    if (!longe && Date.now() - R.rotaEm < 60000) return;
    R.rotaDe = de; R.rotaEm = Date.now();
    let caminho = null;
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${de.lng},${de.lat};${ate.lng},${ate.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.code === "Ok") caminho = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch {}
    if (!R.mapa) return;
    R.linhas.forEach((l) => l.remove());
    const pts = caminho || [[de.lat, de.lng], [ate.lat, ate.lng]];
    R.linhas = [
      L.polyline(pts, { color: "#ffffff", weight: 10, opacity: .9 }).addTo(R.mapa),
      L.polyline(pts, { color: "#2f7cf6", weight: 6, opacity: 1, dashArray: caminho ? null : "8 10" }).addTo(R.mapa)
    ];
    R.m.moto?.setZIndexOffset(1000);
  }

  /* ---------- tempo real ---------- */
  function ligarTempoReal() {
    if (!window.io) return;
    for (const c of ativosEmOrdem().filter((x) => emAndamento(R.dados.get(x)))) {
      if (R.sockets.has(c)) continue;
      const s = window.io(CONFIG.API_BASE, { transports: ["websocket"] });
      s.on("connect", () => s.emit("acompanhar", c));
      s.on("posicao", (p) => {
        const d = R.dados.get(c);
        if (!d || d.pedido.status !== "delivering") return;
        d.posicao = p;
        if (R.aberto && R.atual === c) {
          if (!R.m.moto) { desenharMapa(); return; } // primeira posição: desenha a moto com o balãozinho e enquadra
          const casa = R.m.casa?.getLatLng();
          marcador("moto", p, "rt-pin-moto", "🛵", 48);
          if (casa) {
            rota(p, { lat: casa.lat, lng: casa.lng });
            const km = R.mapa.distance([p.lat, p.lng], casa) / 1000;
            const sub = document.getElementById("rtSub");
            if (sub && d.antes === 0) sub.textContent = km < 0.15 ? "Chegando! Fique de olho na porta." : `${d.entregador?.nome || "O entregador"} está a ${km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km"} da sua casa.`;
          }
        }
      });
      const recarregar = async () => { const d = await buscar(c); if (d && !d.naoExiste) { R.dados.set(c, d); if (R.aberto && R.atual === c) desenhar(); else faixa(); if (!emAndamento(d)) { s.disconnect(); R.sockets.delete(c); } } };
      s.on("status", recarregar);
      s.on("atualizar", recarregar);
      R.sockets.set(c, s);
    }
  }
  // garantia se o tempo real cair: confere a cada 30s
  setInterval(async () => {
    if (document.hidden || !R.lista.length) return;
    const antes = ativosEmOrdem().length;
    await atualizarTodos();
    if (R.aberto) desenhar(); else faixa();
    if (ativosEmOrdem().length !== antes) ligarTempoReal();
  }, 30000);

  // pedido novo feito agora: guarda e já mostra a faixa "Acompanhar" (sem precisar recarregar)
  function novoPedido(codigo, numero) { adicionar(codigo, numero); atualizarTodos().then(() => { faixa(); menuLateral(); ligarTempoReal(); }); }

  return { iniciar, adicionar: novoPedido, abrir, fechar, menuLateral, abrirUltimo: (c) => { adicionar(c); atualizarTodos().then(() => { faixa(); menuLateral(); ligarTempoReal(); if (R.dados.has(c)) abrir(c); }); } };
})();
