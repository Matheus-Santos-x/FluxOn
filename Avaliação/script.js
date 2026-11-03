/* ============================================================
   AVALIAÇÃO — o cliente chega pelo link da mensagem de satisfação
   (?p=código do pedido), escolhe as estrelas e:
   4 ou 5 → convite pra avaliar no Google
   1 a 3  → conta o que aconteceu (fica com o restaurante)
   ============================================================ */
const API_BASE = "https://backend.evoriseai.com.br";
const AV = { token: new URLSearchParams(location.search).get("p"), dados: null, nota: 0 };
const LEGENDAS = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente!"];
const ESTRELA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';

const $ = (id) => document.getElementById(id);
function esc(s){
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function aviso(msg){ $("aviso").textContent = msg; $("aviso").hidden = false; $("vp").hidden = true; }

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
  b.disabled = true; b.textContent = "Enviando...";
  try{
    const r = await fetch(`${API_BASE}/api/v1/avaliacao/${encodeURIComponent(AV.token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota: AV.nota, comentario: AV.nota <= 3 ? $("comentario").value.trim() : "" })
    });
    const d = await r.json().catch(() => ({}));
    if(r.status === 409){ fim(AV.nota, null); $("fimTexto").textContent = d.error; return; }
    if(!r.ok) throw new Error(d.error || "Não foi possível enviar. Tente de novo.");
    fim(AV.nota, d.google_url);
  }catch(e){
    erro.textContent = e.message;
    b.disabled = false; b.textContent = "Enviar";
  }
}

function escolher(n){
  AV.nota = n;
  pintar(n);
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
  if(!AV.token) return aviso("Link de avaliação inválido.");
  try{
    const r = await fetch(`${API_BASE}/api/v1/avaliacao/${encodeURIComponent(AV.token)}`);
    const d = await r.json().catch(() => ({}));
    if(!r.ok) return aviso(d.error || "Não foi possível abrir esta avaliação.");
    AV.dados = d;
    document.documentElement.style.setProperty("--cor", d.cor || "#d62828");
    document.title = `Avalie · ${d.nome}`;
    $("nome").textContent = d.nome;
    if(d.logo_url){ $("logo").innerHTML = `<img src="${esc(d.logo_url)}" alt="">`; $("favicon").href = d.logo_url; }
    else $("logo").textContent = String(d.nome || "?").charAt(0).toUpperCase();
    $("pergunta").textContent = `${d.cliente ? d.cliente + ", como" : "Como"} foi o seu pedido #${d.pedido}?`;
    $("estrelas").innerHTML = [1, 2, 3, 4, 5].map(n =>
      `<button type="button" class="av-estrela" data-n="${n}" aria-label="${n} ${n === 1 ? "estrela" : "estrelas"}">${ESTRELA}</button>`).join("");
    $("estrelas").querySelectorAll("[data-n]").forEach(b => {
      b.onclick = () => escolher(Number(b.dataset.n));
      b.onmouseenter = () => pintar(Number(b.dataset.n));
      b.onmouseleave = () => pintar(AV.nota);
    });
    $("enviar").onclick = enviar;
    $("vp").hidden = false;
    if(d.ja_avaliou){ AV.nota = d.nota; fim(d.nota, d.google_url); $("fimTexto").textContent = d.google_url ? "Você já avaliou este pedido. Se ainda não deixou no Google, dá tempo:" : "Você já avaliou este pedido. Obrigado!"; }
  }catch(e){
    console.error("Avaliação:", e);
    aviso("Sem conexão. Verifique sua internet e tente de novo.");
  }
})();
