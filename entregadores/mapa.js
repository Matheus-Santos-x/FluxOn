/* mapa.js — o mapa da aba "Na rua" (OpenStreetMap, gratuito, em tons de cinza: só as ruas),
   a localização do entregador e a rota das entregas.
   A localização é lida no celular pra mostrar onde ele está; pro cliente e pro restaurante
   ela só vai enquanto ele está com entrega. Entregou tudo, para de mandar. */
const mapa = (() => {
  const INTERVALO = 3000;                 // manda a posição no máximo a cada 3 segundos
  let watch = null, ultimaEnviada = 0, pos = null, travaTela = null, perguntou = false;
  let m = null, marcadorEu = null, marcadorLoja = null, lojaPos = null, pinos = [], linha = null;
  let seguindo = true, rotaChave = "", girando = false;

  /* ---------- mapa ---------- */
  // fundo do mapa: TomTom se o restaurante tem chave; senão OpenStreetMap
  let base = null, baseChave = null;
  const chaveTT = () => S.conta?.restaurante?.tomtom || null;
  function camadaBase() {
    baseChave = chaveTT();
    return baseChave
      ? L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${encodeURIComponent(baseChave)}&language=pt-BR&tileSize=512`, { tileSize: 512, zoomOffset: -1, minZoom: 12, maxZoom: 18, maxNativeZoom: 16, updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 1, attribution: "© TomTom" }) // econômico: quadrado de 512 e sem baixar de novo acima do zoom 16
      : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
  }
  function trocarBase() { if (m && chaveTT() !== baseChave) { base?.remove(); base = camadaBase().addTo(m); base.bringToBack(); } }
  // busca no TomTom (quando o restaurante tem chave); sem resultado, cai no OpenStreetMap
  async function tomtomGeo(q, chave) {
    try {
      const r = await fetch(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(q)}.json?countrySet=BR&limit=1&language=pt-BR&key=${encodeURIComponent(chave)}`);
      const it = r.ok ? (await r.json()).results?.[0] : null;
      return it ? { lat: it.position.lat, lng: it.position.lon } : null;
    } catch { return null; }
  }
   
  function iniciar() {
    if (m || !window.L) return;
    m = L.map("mapa", { zoomControl: false, attributionControl: true }).setView([-22.6, -48.8], 14);
    m.attributionControl.setPrefix(false); // tira o "Leaflet" com a bandeirinha; fica só o "© OpenStreetMap" (obrigatório)
    base = camadaBase().addTo(m);
    m.on("dragstart", () => { seguindo = false; });
    $("btn-centralizar").onclick = () => { seguindo = true; enquadrar(); };
    const tocarGps = () => { if (watch === null) estadoPermissao().then((st) => st === "denied" ? ajudaBloqueada() : ligar()); };
    $("gps").onclick = tocarGps;
    $("gps").onkeydown = (e) => { if (e.key === "Enter") tocarGps(); };
    mostrarLoja();
  }
  function mostrar() { iniciar(); if (m) setTimeout(() => { m.invalidateSize(); enquadrar(); }, 60); }

  // o restaurante aparece no mapa (e é o ponto de partida da rota quando ainda não tem GPS)
  async function mostrarLoja() {
    trocarBase(); // o restaurante pode ter ganhado (ou perdido) a chave do TomTom
    const end = S.conta?.restaurante?.endereco;
    if (!end || !m) return;
    const c = await geocodificar({ completo: end, rua: end, resto: "" });
    if (!c || !m) return;
    lojaPos = c;
    marcadorLoja?.remove();
    marcadorLoja = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: '<div class="loja">🏪</div>', iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(m);
    if (!pos) enquadrar();
  }

  function enquadrar() {
    if (!m) return;
    const pts = pinos.map((p) => p.getLatLng());
    if (marcadorEu) pts.push(marcadorEu.getLatLng());
    if (!pts.length && marcadorLoja) pts.push(marcadorLoja.getLatLng());
    if (!pts.length) return;
    const painel = $("painel")?.offsetHeight || 0;
    if (pts.length === 1) {
      m.setView(pts[0], 16, { animate: false });
      m.panBy([0, painel / 2], { animate: false }); // fica acima do painel de baixo
    } else {
      m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [40, painel + 30], maxZoom: 16 });
    }
  }

  /* ---------- localização ---------- */
  function gps(txt, cls = "") { const g = $("gps"); if (g) { g.textContent = txt; g.className = `gps ${cls}`; } }
  async function estadoPermissao() { try { return (await navigator.permissions.query({ name: "geolocation" })).state; } catch { return "prompt"; } }

  // chamado sempre que muda a aba ou as entregas
  async function atualizar({ visivel, temEntrega }) {
    if (!visivel && !temEntrega) { parar(); return; }
    if (watch !== null) { temEntrega ? manterTelaAcesa() : soltarTela(); rotulo(); return; }
    if (!("geolocation" in navigator)) { gps("⚠️ Este celular não tem localização", "erro"); return; }
    const st = await estadoPermissao();
    if (st === "granted") return ligar();
    if (st === "denied") { gps("⚠️ Localização bloqueada · toque aqui", "erro"); return; }
    if (temEntrega && !perguntou) { perguntou = true; explicar(); }
    else gps("📍 Toque pra ligar a localização", "erro");
  }
  function rotulo() {
    if (watch === null) return;
    if (!pos) gps("📍 Procurando sinal…");
    else gps(S.naRua.length ? "📡 O cliente está vendo você" : "", "ok");
  }

  function explicar() {
    abrirFolha(`
      <h3>Ligar a localização?</h3>
      <p>O cliente vê você chegando no mapa e o restaurante sabe onde estão as entregas. Sua localização só é enviada enquanto você está com pedido. Entregou tudo, para sozinha.</p>
      <div class="botoes">
        <button class="btn primario grande" type="button" id="btn-ligar-gps">📍 Ligar localização</button>
        <button class="btn link" type="button" id="btn-agora-nao">Agora não</button>
      </div>`);
    $("btn-ligar-gps").onclick = () => { fecharFolha(); ligar(); };
    $("btn-agora-nao").onclick = () => { fecharFolha(); gps("📍 Toque pra ligar a localização", "erro"); };
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
      if (err.code === 1) { parar(); gps("⚠️ Localização bloqueada · toque aqui", "erro"); }
      else gps("📍 Sinal fraco, tentando…", "erro");
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    if (S.naRua.length) manterTelaAcesa();
  }

  function recebeu(p) {
    const primeira = !pos;
    pos = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy, rumo: p.coords.heading };
    rotulo();
    desenharEu();
    enviar();
    if (primeira && S.naRua.length) { rotaChave = ""; desenharEntregas(S.naRua); } // a rota agora sai de onde ele está
  }

  function enviar(forcar) {
    if (!pos || !S.naRua.length) return;
    const agora = Date.now();
    if (!forcar && agora - ultimaEnviada < INTERVALO) return;
    ultimaEnviada = agora;
    tempoReal.enviar("posicao", pos);
  }
  // parado no semáforo o GPS às vezes não manda nada: reenvia a última a cada 15s
  setInterval(() => { if (watch !== null && pos && Date.now() - ultimaEnviada > 15000) enviar(true); }, 5000);

  function parar() {
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
    if (document.visibilityState === "visible" && watch !== null) { if (S.naRua.length) manterTelaAcesa(); enviar(true); }
  });

  function desenharEu() {
    if (!m || !pos) return;
    const ll = [pos.lat, pos.lng];
    if (!marcadorEu) { marcadorEu = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="eu"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).addTo(m); enquadrar(); }
    else marcadorEu.setLatLng(ll);
    if (seguindo && !S.naRua.length) m.panTo(ll, { animate: true });
  }

  /* ---------- endereço → coordenadas (Nominatim/OpenStreetMap) ---------- */
  const fila = [];
  let buscando = false;
  function cacheGeo() { try { return JSON.parse(localStorage.getItem("fx_geo") || "{}"); } catch { return {}; } }
  const chaveCache = (s) => (chaveTT() ? "tt:" : "") + s; // TomTom e OSM guardam separado
  function geocodificar(endereco) {
    const c = cacheGeo();
    if (c[chaveCache(endereco.completo)] !== undefined) return Promise.resolve(c[chaveCache(endereco.completo)]);
    return new Promise((ok) => { fila.push({ endereco, ok }); andar(); });
  }
  async function andar() {
    if (buscando || !fila.length) return;
    buscando = true;
    const { endereco, ok } = fila.shift();
    const limpo = endereco.completo.replace(/\b\d{5}-?\d{3}\b/g, "").replace(/\s+-\s+/g, ", ").replace(/\//g, ", ").replace(/(,\s*)+$/, "");
    const tt = chaveTT();
    let res = tt ? await tomtomGeo(limpo, tt) : null;
    for (const q of res ? [] : [limpo, [endereco.rua, String(endereco.resto || "").split("·")[0]].filter(Boolean).join(", ")]) {
      if (!q) continue;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "pt-BR" } });
        const j = await r.json();
        if (j[0]) { res = { lat: +j[0].lat, lng: +j[0].lon }; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 1100));
    }
    try { const c = cacheGeo(); c[chaveCache(endereco.completo)] = res; const k = Object.keys(c); if (k.length > 300) delete c[k[0]]; localStorage.setItem("fx_geo", JSON.stringify(c)); } catch {}
    ok(res);
    setTimeout(() => { buscando = false; andar(); }, 1100); // regra do Nominatim: 1 por segundo
  }

  /* ---------- rota com todas as entregas ---------- */
  // Pede a melhor ordem e o caminho pelas ruas pro OSRM (gratuito, usa os dados do OpenStreetMap).
  // Se ele não responder, liga os pontos em linha reta na ordem em que pegou.
  async function desenharEntregas(lista) {
    iniciar();
    if (!m) return;
    const chave = lista.map((p) => p.id).join();
    if (chave === rotaChave || girando) return;
    girando = true;
    rotaChave = chave;
    try {
      const pontos = [];
      // o ponto da casa marcado (pelo cliente ou numa entrega anterior) vale mais que procurar pelo endereço
      for (const p of lista) { const c = p.destino || await geocodificar(p.endereco); if (c) pontos.push({ id: p.id, lat: c.lat, lng: c.lng }); }
      if (S.naRua.map((x) => x.id).join() !== chave) return; // a lista mudou no meio
      const origem = pos || lojaPos;
      let ordem = pontos, caminho = null;
      if (origem && pontos.length) {
        try {
          const coords = [origem, ...pontos].map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(";");
          const r = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=false&overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000) });
          const j = await r.json();
          if (j.code === "Ok" && j.trips?.[0]) {
            ordem = pontos.map((p, i) => ({ ...p, pos: j.waypoints[i + 1].waypoint_index })).sort((a, b) => a.pos - b.pos);
            caminho = j.trips[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          }
        } catch {}
      }
      // a ordem da rota vale pra lista também (quem não achou no mapa vai pro fim)
      S.rotaOrdem = [...ordem.map((p) => p.id), ...lista.map((p) => p.id).filter((id) => !ordem.some((o) => o.id === id))];
      tempoReal.enviar("rota", { ordem: S.rotaOrdem }); // o cliente vê quantas entregas faltam antes da dele
      pinos.forEach((p) => p.remove()); pinos = [];
      linha?.remove(); linha = null;
      ordem.forEach((p, i) => {
        const ped = lista.find((x) => x.id === p.id);
        pinos.push(L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: `<div class="pino"><span>${i + 1}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) })
          .addTo(m).bindPopup(`<b>#${esc(ped?.numero)} · ${esc(ped?.endereco.bairro || "")}</b><br>${esc(ped?.endereco.rua || "")}`));
      });
      const cor = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim() || "#e5484d";
      const tracado = caminho || (origem ? [[origem.lat, origem.lng], ...ordem.map((p) => [p.lat, p.lng])] : ordem.map((p) => [p.lat, p.lng]));
      if (tracado.length > 1) linha = L.polyline(tracado, { color: cor, weight: caminho ? 6 : 4, opacity: .85, dashArray: caminho ? null : "8 10" }).addTo(m);
      seguindo = true;
      enquadrar();
      rua.desenhar();
    } finally { girando = false; if (S.naRua.map((x) => x.id).join() !== rotaChave) desenharEntregas(S.naRua); }
  }
  function limparRota() { pinos.forEach((p) => p.remove()); pinos = []; linha?.remove(); linha = null; rotaChave = ""; S.rotaOrdem = []; enquadrar(); }

  return { mostrar, atualizar, pararLocalizacao: parar, desenharEntregas, limparRota, ligar, enviar, mostrarLoja, get posicao() { return pos; } };
})();
