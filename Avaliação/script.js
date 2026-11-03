/* ============================================================
   AVALIAÇÃO DO RESTAURANTE — o cliente abre o link (domínio da
   Avaliação, ou ?r=ID pra teste), escolhe as estrelas e:
   4 ou 5 → convite pra avaliar no Google
   1 a 3  → conta o que aconteceu (fica com o restaurante)
   ============================================================ */
const API_BASE = "https://backend.evoriseai.com.br";
const AV = { rid: null, nota: 0 };
const LEGENDAS = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente!"];
const ESTRELA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';

const $ = (id) => document.getElementById(id);
function esc(s){
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function aviso(msg){ $("aviso").textContent = msg; $("aviso").hidden = false; $("vp").hidden = true; }

async function descobrirRestaurante(){
  const r = new URLSearchParams(location.search).get("r");
  if(r) return r;
  const resp = await fetch(`${API_BASE}/api/v1/dominio/avaliacao/${encodeURIComponent(location.hostname)}`);
  if(!resp.ok) return null;
  return (await resp.json()).restaurant_id || null;
}

function pintar(n){
  $("estrelas").querySelectorAll(".av-estrela").forEach((b, i) => b.classList.toggle("on", i < n));
  $("legenda").textContent = n ? LEGENDAS[n] : "Toque nas estrelas";
}

function fim(nota, googleUrl){
  $("passoNota").hidden = true;
  $("passoFim").hidden = false;
  if(nota >= 4){
    $("fimTitulo").textContent = "Que bom que você gostou! 💛";
    $("fimTexto").textContent = googleUrl
      ? "Ajuda a gente com uma avaliação no Google? Leva menos de 1 minuto e faz muita diferença."
      : "Obrigado pela avaliação. Esperamos você de novo!";
  }else{
    $("fimTitulo").textContent = "Obrigado por contar pra gente";
    $("fimTexto").textContent = "Sentimos muito que não foi como esperava. Sua mensagem foi para o restaurante e vai ajudar a melhorar.";
  }
  if(googleUrl){ $("google").href = googleUrl; $("google").hidden = false; }
}

async function enviar(){
  const erro = $("erro"); erro.textContent = "";
  const b = $("enviar");
  const ruim = AV.nota <= 3;
  if(ruim && !$("comentario").value.trim()){ erro.textContent = "Conta pra gente o que aconteceu."; return; }
  b.disabled = true; b.textContent = "Enviando...";
  try{
    const r = await fetch(`${API_BASE}/api/v1/avaliacao/${encodeURIComponent(AV.rid)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nota: AV.nota,
        comentario: ruim ? $("comentario").value.trim() : "",
        nome: ruim ? $("nomeCliente").value.trim() : "",
        telefone: ruim ? $("telefone").value.trim() : ""
      })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "Não foi possível enviar. Tente de novo.");
    fim(AV.nota, d.google_url);
  }catch(e){
    erro.textContent = e.message;
    b.hidden = false; b.disabled = false; b.textContent = "Enviar";
  }
}

function escolher(n){
  AV.nota = n;
  pintar(n);
  $("erro").textContent = "";
  if(n >= 4){
    $("campoComentario").hidden = true;
    $("enviar").hidden = true;
    enviar(); // nota boa: já envia e mostra o convite do Google
  }else{
    $("campoComentario").hidden = false;
    $("enviar").hidden = false;
    $("enviar").disabled = false; $("enviar").textContent = "Enviar";
    setTimeout(() => $("comentario").focus(), 150);
  }
}

(async function iniciar(){
  try{
    AV.rid = await descobrirRestaurante();
    if(!AV.rid) return aviso("Página de avaliação não encontrada.");
    const r = await fetch(`${API_BASE}/api/v1/avaliacao/${encodeURIComponent(AV.rid)}`);
    const d = await r.json().catch(() => ({}));
    if(!r.ok) return aviso(d.error || "Não foi possível abrir esta avaliação.");
    document.documentElement.style.setProperty("--cor", d.cor || "#d62828");
    document.title = `Avalie · ${d.nome}`;
    $("nome").textContent = d.nome;
    if(d.logo_url){ $("logo").innerHTML = `<img src="${esc(d.logo_url)}" alt="">`; $("favicon").href = d.logo_url; }
    else $("logo").textContent = String(d.nome || "?").charAt(0).toUpperCase();
    $("pergunta").textContent = "Como foi a sua experiência com a gente?";
    $("estrelas").innerHTML = [1, 2, 3, 4, 5].map(n =>
      `<button type="button" class="av-estrela" data-n="${n}" aria-label="${n} ${n === 1 ? "estrela" : "estrelas"}">${ESTRELA}</button>`).join("");
    $("estrelas").querySelectorAll("[data-n]").forEach(b => {
      b.onclick = () => escolher(Number(b.dataset.n));
      b.onmouseenter = () => pintar(Number(b.dataset.n));
      b.onmouseleave = () => pintar(AV.nota);
    });
    $("enviar").onclick = enviar;
    $("comentario").oninput = () => { $("erro").textContent = ""; };
    $("vp").hidden = false;
  }catch(e){
    console.error("Avaliação:", e);
    aviso("Sem conexão. Verifique sua internet e tente de novo.");
  }
})();
