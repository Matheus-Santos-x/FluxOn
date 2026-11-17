/* ============================================================
   CENTRAL DO CLIENTE
   Descobre o restaurante pelo domínio (campo central_url no
   Admin → Domínios). Para testar sem domínio: ?r=ID-DO-RESTAURANTE
   Tudo o que aparece (foto, frase, botões e links) vem do servidor.
   ============================================================ */
const API_BASE = "https://backend.evoriseai.com.br";

const ICONES = {
  cardapio:  '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M8 8h7M8 12h7M8 16h4"/>',
  delivery:  '<path d="M3 7h10v8H3z"/><path d="M13 10h4l3 3v2h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  fidelidade:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>',
  mapa:      '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>',
   whatsapp:  '<path d="M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5z"/><path d="M9.3 8.4c.3-.3.7-.3 1 0l.9 1.3c.2.3.2.6-.1.9l-.5.5a5.2 5.2 0 0 0 2.4 2.4l.5-.5c.3-.3.6-.3.9-.1l1.3.9c.3.3.3.7 0 1l-.5.5c-.6.6-1.5.7-2.3.4a8.3 8.3 0 0 1-4.2-4.2c-.3-.8-.2-1.7.4-2.3z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/>',
  avaliar:   '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/><path d="M12 8.5v4"/><circle cx="12" cy="14.8" r=".6" fill="currentColor"/>',
  reserva:   '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/>',
  voucher:   '<rect x="3.5" y="8" width="17" height="12.5" rx="1.5"/><path d="M2.5 8h19v4h-19zM12 8v12.5"/><path d="M12 8c-1.8 0-4.5-.7-4.5-2.6S10 3.6 12 8zm0 0c1.8 0 4.5-.7 4.5-2.6S14 3.6 12 8z"/>',
  link:      '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};

function svg(tipo){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[tipo] || ICONES.link}</svg>`;
}
function esc(s){
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
// só aceita links http(s), wa.me etc. — nunca "javascript:"
function linkSeguro(u){
  try{ const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; }catch{ return null; }
}

async function descobrirRestaurante(){
  const r = new URLSearchParams(location.search).get("r");
  if(r) return r;
  const resp = await fetch(`${API_BASE}/api/v1/dominio-central/${encodeURIComponent(location.hostname)}`);
  if(!resp.ok) return null;
  return (await resp.json()).restaurant_id || null;
}

function mostrarAviso(msg){
  const a = document.getElementById("aviso");
  a.textContent = msg;
  a.hidden = false;
}

/* ---------- paleta do restaurante (vem do servidor) ---------- */
function corClara(hex){
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  if(isNaN(n)) return false;
  return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) > 150;
}
function aplicarPaleta(p){
  p = p || {};
  const fundo = p.fundo || "#0b0a09", raiz = document.documentElement;
  raiz.style.setProperty("--cor", p.primaria || "#d62828");
  raiz.style.setProperty("--cor2", p.secundaria || "#7f1d1d");
  raiz.style.setProperty("--fundo", fundo);
  raiz.style.setProperty("--cor-texto", corClara(p.primaria) ? "#1f1610" : "#ffffff");
  raiz.classList.toggle("claro", corClara(fundo)); // fundo claro: textos e ícones escuros
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", fundo);
}
// brasinhas do fundo: cada uma com seu tamanho e seu ritmo, subindo e descendo devagar
function criarBrasas(){
  const box = document.getElementById("brasas");
  if(!box || box.childElementCount) return;
  const lugares = [[8,6,12],[72,4,8],[40,14,6],[88,22,14],[14,30,7],[60,34,10],[30,46,5],[82,50,9],[6,58,13],[50,62,6],[70,72,11],[22,76,8],[90,82,5],[40,88,14],[60,94,7],[12,92,6]];
  box.innerHTML = lugares.map(([x, y, s], i) =>
    `<span style="left:${x}%;top:${y}%;--s:${s};--k:${(1 - (i % 4) * .14).toFixed(2)};animation-duration:${14 + (i * 7) % 13}s;animation-delay:-${(i * 5) % 17}s"></span>`).join("");
}

function render(d){
  aplicarPaleta(d.paleta || { primaria: d.cor });
  document.title = d.nome || "Central";

  // logo redondinho (ou a inicial do nome)
  const logo = document.getElementById("logo");
  const logoUrl = d.logo_url && linkSeguro(d.logo_url);
  if(logoUrl){
    logo.innerHTML = `<img src="${esc(logoUrl)}" alt="${esc(d.nome)}">`;
    document.getElementById("favicon").href = logoUrl;
  }else{
    logo.textContent = String(d.nome || "?").trim().charAt(0).toUpperCase();
  }

  document.getElementById("nome").textContent = d.nome || "";
  const frase = document.getElementById("frase");
  if(d.frase){ frase.textContent = d.frase; frase.hidden = false; }

  const status = document.getElementById("status");
  if(d.status && d.status.texto){
    status.textContent = d.status.texto;
    status.classList.toggle("aberto", !!d.status.aberto);
    status.hidden = false;
  }

  // botões: até 4 por linha; com menos de 4, eles se dividem na linha toda
  const botoes = (d.botoes || []).filter(b => linkSeguro(b.url));
  const box = document.getElementById("botoes");
  box.classList.toggle("poucos", botoes.length < 4);
  box.style.setProperty("--qtd", Math.max(1, botoes.length));
  box.innerHTML = botoes.map((b, i) => {
    const url = linkSeguro(b.url);
    const fora = new URL(url).origin !== location.origin;
    return `<a class="botao" style="--i:${i}" href="${esc(url)}"${fora ? ' target="_blank" rel="noopener"' : ""}>
      <span class="ico">${svg(b.tipo)}</span>
      <span>${esc(b.rotulo)}</span>
    </a>`;
  }).join("");

  // foto de fundo: só aparece depois de carregar, com um zoom suave
  const fundoUrl = d.fundo_url && linkSeguro(d.fundo_url);
  if(fundoUrl){
    const img = new Image();
    img.onload = () => {
      const f = document.getElementById("fundo");
      f.style.backgroundImage = `url("${fundoUrl.replace(/"/g, "%22")}")`;
             f.classList.add("foto");
      requestAnimationFrame(() => f.classList.add("on"));
    };
    img.src = fundoUrl;
  }else{
    criarBrasas(); // sem foto: brasinhas na cor do restaurante
    document.getElementById("fundo").classList.add("on");
  }

  document.getElementById("central").classList.add("pronto");
}

(async function iniciar(){
  try{
    const rid = await descobrirRestaurante();
    if(!rid) return mostrarAviso("Página não encontrada.");
    const resp = await fetch(`${API_BASE}/api/v1/central/${encodeURIComponent(rid)}`);
    const d = await resp.json().catch(() => ({}));
    if(!resp.ok) return mostrarAviso(d.error || "Não foi possível carregar esta página.");
    render(d);
  }catch(err){
    console.error("Central:", err);
    mostrarAviso("Sem conexão. Verifique sua internet e tente de novo.");
  }
})();
