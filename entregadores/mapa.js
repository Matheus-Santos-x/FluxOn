/* mapa.js — localização do entregador (só enquanto tem entrega), envio pro cliente e pro restaurante,
   tela sempre acesa durante a rota, e o mapa (OpenStreetMap, gratuito) da aba "Na rua". */
const mapa = (() => {
  const INTERVALO = 3000;                 // manda a posição no máximo a cada 3 segundos
  let watch = null, ultimaEnviada = 0, pos = null, travaTela = null, perguntou = false;
  let m = null, marcadorEu = null, pinos = [], ajustouVista = false;

  /* ---------- localização ---------- */
  function gps(txt, cls = "") { const g = $("gps"); if (g) { g.textContent = txt; g.className = `gps ${cls}`; } }

  async function estadoPermissao() {
    try { return (await navigator.permissions.query({ name: "geolocation" })).state; } catch { return "prompt"; }
  }

  // chamado pela aba "Na rua": tem entrega → liga; não tem → desliga
  async function precisa(temEntrega) {
    if (!temEntrega) { pararLocalizacao(); return; }
    if (watch !== null) return;
    if (!("geolocation" in navigator)) { gps("⚠️ Este celular não tem localização", "erro"); return; }
    const st = await estadoPermissao();
    if (st === "granted") return ligar();
    if (st === "denied") { gps("⚠️ Localização bloqueada · toque", "erro"); return; }
    if (!perguntou) { perguntou = true; explicar(); } else gps("📍 Localização desligada · toque", "erro");
  }

  function explicar() {
    abrirFolha(`
      <h3>Ligar a localização?</h3>
      <p>O cliente vê você chegando no mapa e o restaurante sabe onde estão as entregas. A localização só é usada enquanto você está com pedido. Entregou tudo, desliga sozinha.</p>
      <div class="botoes">
        <button class="btn primario grande" type="button" id="btn-ligar-gps">📍 Ligar localização</button>
        <button class="btn link" type="button" id="btn-agora-nao">Agora não</button>
      </div>`);
    $("btn-ligar-gps").onclick = () => { fecharFolha(); ligar(); };
    $("btn-agora-nao").onclick = () => { fecharFolha(); gps("📍 Localização desligada · toque", "erro"); };
  }

  function ajudaBloqueada() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    abrirFolha(`
      <h3>Localização bloqueada</h3>
      <p>${ios
        ? "No iPhone: Ajustes → Privacidade → Serviços de Localização → Safari (ou o app) → \"Ao Usar o App\". Depois volte aqui."
        : "No Android: toque no cadeado ao lado do endereço (ou em ⋮ → Informações do app) → Permissões → Localização → Permitir. Depois volte aqui."}</p>
      <div class="botoes"><button class="btn primario grande" type="button" id="btn-tentar-gps">Tentar de novo</button></div>`);
    $("btn-tentar-gps").onclick = () => { fecharFolha(); ligar(); };
  }

  function ligar() {
    if (watch !== null || !("geolocation" in navigator)) return;
    gps("📍 Procurando sinal…");
    watch = navigator.geolocation.watchPosition(recebeu, (err) => {
      if (err.code === 1) { pararLocalizacao(); gps("⚠️ Localização bloqueada · toque", "erro"); }
      else gps("📍 Sinal fraco, tentando…", "erro");
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    manterTelaAcesa();
  }

  function recebeu(p) {
    pos = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy, rumo: p.coords.heading };
    gps(`📍 Localização ligada`, "ok");
    desenharEu();
    enviar();
  }

  function enviar(forcar) {
    if (!pos || !S.naRua.length) return;
    const agora = Date.now();
    if (!forcar && agora - ultimaEnviada < INTERVALO) return;
    ultimaEnviada = agora;
    tempoReal.enviar("posicao", pos);
  }
  // o GPS do celular às vezes para de mandar quando a pessoa está parada: reenvia a última a cada 15s
  setInterval(() => { if (watch !== null && pos && Date.now() - ultimaEnviada > 15000) enviar(true); }, 5000);

  function pararLocalizacao() {
    if (watch !== null) { try { navigator.geolocation.clearWatch(watch); } catch {} }
    watch = null;
    soltarTela();
  }

  /* ---------- tela acesa durante a rota ---------- */
  async function manterTelaAcesa() {
    try { if ("wakeLock" in navigator && !travaTela && document.visibilityState === "visible") { travaTela = await navigator.wakeLock.request("screen"); travaTela.addEventListener("release", () => { travaTela = null; }); } } catch {}
  }
  function soltarTela() { try { travaTela?.release(); } catch {} travaTela = null; }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && watch !== null) { manterTelaAcesa(); enviar(true); }
  });

  /* ---------- mapa ---------- */
  function iniciar() {
    if (m || !window.L) return;
    m = L.map("mapa", { zoomControl: false, attributionControl: true }).setView([-22.6, -48.8], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    $("btn-centralizar").onclick = () => { ajustouVista = false; enquadrar(); };
    $("gps").onclick = () => { if (watch === null) estadoPermissao().then((st) => st === "denied" ? ajudaBloqueada() : ligar()); };
  }

  function desenharEu() {
    if (!m || !pos) return;
    const ll = [pos.lat, pos.lng];
    if (!marcadorEu) marcadorEu = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="eu"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).addTo(m);
    else marcadorEu.setLatLng(ll);
    if (!ajustouVista) enquadrar();
  }

  // endereço → coordenadas (Nominatim/OpenStreetMap, gratuito). Guarda no celular pra não perguntar de novo.
  const fila = [];
  let buscando = false;
  function cacheGeo() { try { return JSON.parse(localStorage.getItem("fx_geo") || "{}"); } catch { return {}; } }
  function geocodificar(endereco) {
    const chave = endereco.completo;
    const c = cacheGeo();
    if (c[chave] !== undefined) return Promise.resolve(c[chave]);
    return new Promise((ok) => { fila.push({ endereco, ok }); andar(); });
  }
  async function andar() {
    if (buscando || !fila.length) return;
    buscando = true;
    const { endereco, ok } = fila.shift();
    const limpo = endereco.completo.replace(/\b\d{5}-?\d{3}\b/g, "").replace(/\s+-\s+/g, ", ").replace(/\//g, ", ").replace(/(,\s*)+$/, "");
    let res = null;
    for (const q of [limpo, [endereco.rua, endereco.resto.split("·")[0]].filter(Boolean).join(", ")]) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "pt-BR" } });
        const j = await r.json();
        if (j[0]) { res = { lat: +j[0].lat, lng: +j[0].lon }; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 1100));
    }
    try { const c = cacheGeo(); c[endereco.completo] = res; const k = Object.keys(c); if (k.length > 300) delete c[k[0]]; localStorage.setItem("fx_geo", JSON.stringify(c)); } catch {}
    ok(res);
    setTimeout(() => { buscando = false; andar(); }, 1100); // regra do Nominatim: 1 por segundo
  }

  async function desenharEntregas(lista) {
    iniciar();
    if (!m) return;
    setTimeout(() => m.invalidateSize(), 60);
    pinos.forEach((p) => p.remove());
    pinos = [];
    ajustouVista = false;
    const minha = lista.map((p) => p.id).join();
    for (const [i, p] of lista.entries()) {
      const c = await geocodificar(p.endereco);
      if (!c || S.naRua.map((x) => x.id).join() !== minha) continue; // a lista mudou no meio
      const pino = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: `<div class="pino"><span>${i + 1}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) })
        .addTo(m).bindPopup(`<b>#${esc(p.numero)} · ${esc(p.endereco.bairro || "")}</b><br>${esc(p.endereco.rua)}`);
      pinos.push(pino);
      enquadrar();
    }
    desenharEu();
    enquadrar();
  }

  function enquadrar() {
    if (!m) return;
    const pts = pinos.map((p) => p.getLatLng());
    if (marcadorEu) pts.push(marcadorEu.getLatLng());
    if (!pts.length) return;
    if (pts.length === 1) m.setView(pts[0], 16);
    else m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    ajustouVista = pts.length > 1;
  }

  return { precisa, pararLocalizacao, desenharEntregas, ligar, enviar, iniciar, get posicao() { return pos; } };
})();
