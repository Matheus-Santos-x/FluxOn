/* acompanhar.js — o cliente vê a moto andando no mapa. Abre pelo link "acompanhar.html?c=CÓDIGO" do WhatsApp. */
(() => {
  const API = String(window.ENTREGAS_API || "https://backend.evoriseai.com.br").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const codigo = new URLSearchParams(location.search).get("c") || "";
  let D = null, m = null, moto = null, casa = null, destino = null, enquadrou = false, ultimaPos = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function cor(hex) {
    const x = String(hex || "").match(/^#?([0-9a-f]{6})$/i);
    if (!x) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(x[1].slice(i, i + 2), 16));
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return l < 0.1 || l > 0.92 ? null : `rgb(${r}, ${g}, ${b})`;
  }
  function km(a, b) { // distância em linha reta
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const haQuanto = (iso) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 10 ? "agora" : s < 60 ? `há ${s}s` : `há ${Math.round(s / 60)} min`; };

  function iniciarMapa() {
    if (m || !window.L) return;
    m = L.map("mapa", { zoomControl: false }).setView([-22.6, -48.8], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    // deixa espaço pro cartão de baixo
    m.getContainer().style.bottom = "0";
  }

  async function geocodificar(endereco) {
    const limpo = String(endereco || "").replace(/\b\d{5}-?\d{3}\b/g, "").replace(/\s+-\s+/g, ", ").replace(/\//g, ", ").replace(/(,\s*)+$/, "");
    if (!limpo) return null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(limpo)}`, { headers: { "Accept-Language": "pt-BR" } });
      const j = await r.json();
      return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
    } catch { return null; }
  }

  function enquadrar() {
    if (!m) return;
    const pts = [moto?.getLatLng(), casa?.getLatLng()].filter(Boolean);
    if (!pts.length) return;
    const baixo = document.querySelector(".cartao").offsetHeight;
    if (pts.length === 1) m.setView(pts[0], 16);
    else m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 60], paddingBottomRight: [40, baixo + 30], maxZoom: 16 });
  }

  function mostrarPosicao(p) {
    if (!p || !m) return;
    ultimaPos = p;
    const ll = [p.lat, p.lng];
    if (!moto) moto = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="moto">🛵</div>', iconSize: [46, 46], iconAnchor: [23, 23] }), zIndexOffset: 1000 }).addTo(m);
    else moto.setLatLng(ll);
    if (!enquadrou) { enquadrou = true; enquadrar(); }
    else if (!m.getBounds().pad(-0.1).contains(ll)) m.panTo(ll);
    textos();
  }

  function textos() {
    if (!D) return;
    const st = D.pedido.status, nome = D.entregador?.nome;
    const etapa = ["finished"].includes(st) ? 3 : st === "delivering" ? 2 : 1;
    ["e1", "e2", "e3"].forEach((id, i) => { $(id).className = i + 1 < etapa || etapa === 3 ? "on" : i + 1 === etapa ? "agora" : ""; });
    let t, s = "";
    if (st === "cancelled" || st === "canceled") { t = "Pedido cancelado"; s = "Fale com o restaurante se tiver alguma dúvida."; ["e1", "e2", "e3"].forEach((id) => ($(id).className = "")); }
    else if (st === "finished") { t = "Pedido entregue ✓"; s = "Bom apetite! Obrigado por pedir com a gente."; }
    else if (st === "delivering") {
      t = nome ? `${nome} está a caminho` : "Seu pedido saiu para entrega";
      if (ultimaPos && destino) {
        const d = km(ultimaPos, destino);
        s = d < 0.15 ? "Chegando! Fique de olho na porta." : `A ${d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1).replace(".", ",") + " km"} de você`;
        if (d < 0.15) t = nome ? `${nome} está chegando` : "O entregador está chegando";
      }
      if (ultimaPos) s += `${s ? " · " : ""}atualizado ${haQuanto(ultimaPos.em)}`;
      else s = "O mapa aparece assim que o celular do entregador mandar a localização.";
      if (ultimaPos && Date.now() - new Date(ultimaPos.em).getTime() > 3 * 60000) s = `Sinal do entregador fraco · última posição ${haQuanto(ultimaPos.em)}`;
    } else { t = "Seu pedido está sendo preparado"; s = "Quando sair para entrega, você vê o entregador aqui no mapa."; }
    $("titulo").textContent = t;
    $("sub").textContent = s;
  }

  async function carregar() {
    if (!/^[a-f0-9]{20}$/.test(codigo)) { $("erro").classList.remove("hidden"); return; }
    try {
      const r = await fetch(`${API}/api/v1/entrega/acompanhar/${codigo}`);
      if (r.status === 404) { $("erro").classList.remove("hidden"); return; }
      D = await r.json();
    } catch { $("sub").textContent = "Sem internet. Tentando de novo…"; return; }
    const c = cor(D.restaurante.cor);
    if (c) document.documentElement.style.setProperty("--acc", c);
    $("rest-nome").textContent = D.restaurante.nome;
    $("pedido-num").textContent = `Pedido #${D.pedido.numero}`;
    document.title = `Pedido #${D.pedido.numero} · ${D.restaurante.nome}`;
    const logo = $("logo");
    if (D.restaurante.logo_url) logo.style.backgroundImage = `url('${D.restaurante.logo_url.replace(/'/g, "%27")}')`; else logo.textContent = D.restaurante.nome.charAt(0);
    const tel = String(D.restaurante.telefone || "").replace(/\D/g, "");
    if (tel.length >= 10) { $("ligar").href = `tel:${tel}`; $("ligar").classList.remove("hidden"); }
    iniciarMapa();
    if (D.pedido.status !== "delivering" && moto) { moto.remove(); moto = null; }
    if (!destino && D.pedido.endereco) {
      destino = await geocodificar(D.pedido.endereco);
      if (destino && m) { casa = L.marker([destino.lat, destino.lng], { icon: L.divIcon({ className: "", html: '<div class="casa">🏠</div>', iconSize: [38, 38], iconAnchor: [19, 19] }) }).addTo(m); enquadrar(); }
    }
    if (D.posicao) mostrarPosicao(D.posicao); else textos();
  }

  // tempo real: a moto anda sozinha e o status muda na hora
  function ligarSocket() {
    if (!window.io || !/^[a-f0-9]{20}$/.test(codigo)) return;
    const s = window.io(API, { transports: ["websocket"] });
    s.on("connect", () => s.emit("acompanhar", codigo));
    s.on("posicao", (p) => { if (D?.pedido.status === "delivering") mostrarPosicao(p); });
    s.on("status", (d) => { if (D) { D.pedido.status = d.status; if (d.status !== "delivering") { moto?.remove(); moto = null; } textos(); if (d.status === "delivering" && !D.entregador) carregar(); } });
  }

  carregar();
  ligarSocket();
  setInterval(() => { if (!document.hidden) textos(); }, 10000);          // "atualizado há Xs"
  setInterval(() => { if (!document.hidden && D?.pedido.status !== "finished") carregar(); }, 45000); // garantia se o tempo real cair
})();
