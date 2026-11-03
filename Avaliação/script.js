/* ============================================================
   AVALIAÇÃO DO RESTAURANTE — o cliente abre o link (domínio da
   Avaliação, ou ?r=ID pra teste) e dá estrelas em cada item.
   média 4 ou mais → convite pra avaliar no Google
   média de 3 a 3,9 → pode deixar uma sugestão (opcional)
   média abaixo de 3 → conta o que aconteceu (obrigatório)
   ============================================================ */
const API_BASE = "https://backend.evoriseai.com.br";
const CATEGORIAS = [
  { id: "comida", nome: "Comida" },
  { id: "atendimento", nome: "Atendimento" },
  { id: "ambiente", nome: "Ambiente" },
  { id: "tempo", nome: "Tempo de espera" }
];
const AV = { rid: null, notas: {} };
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

// null enquanto falta avaliar algum item
function media(){
  const v = CATEGORIAS.map(c => AV.notas[c.id]);
  if(v.some(n => !n)) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function atualizar(){
  const m = media();
  const b = $("enviar");
  $("erro").textContent = "";
  if(m === null){
    $("media").hidden = true; $("campoComentario").hidden = true;
    b.disabled = true; b.textContent = "Avalie todos os itens";
    return;
  }
  $("media").innerHTML = `Sua média: <b>★ ${(Math.floor(m * 10) / 10).toFixed(1).replace(".", ",")}</b>`;
  $("media").hidden = false;
  $("campoComentario").hidden = m >= 4;
  $("rotuloComentario").textContent = m < 3 ? "O que podemos melhorar?" : "Quer deixar uma sugestão? (opcional)";
  b.disabled = false; b.textContent = "Enviar avaliação";
}

function escolher(cat, n){
  AV.notas[cat] = n;
  document.querySelectorAll(`[data-cat="${cat}"] .av-estrela`).forEach((e, i) => e.classList.toggle("on", i < n));
  atualizar();
}

function fim(m, googleUrl){
  $("passoNota").hidden = true;
  $("passoFim").hidden = false;
  if(m >= 4){
    $("fimTitulo").textContent = "Que bom que você gostou! 💛";
    $("fimTexto").textContent = googleUrl
      ? "Ajuda a gente com uma avaliação no Google? Leva menos de 1 minuto e faz muita diferença."
      : "Obrigado pela avaliação. Esperamos você de novo!";
  }else if(m >= 3){
    $("fimTitulo").textContent = "Obrigado pela avaliação!";
    $("fimTexto").textContent = "Sua opinião ajuda a gente a melhorar. Esperamos você de novo!";
  }else{
    $("fimTitulo").textContent = "Obrigado por contar pra gente";
    $("fimTexto").textContent = "Sentimos muito que não foi como esperava. Sua mensagem foi para o restaurante e vai ajudar a melhorar.";
  }
  if(googleUrl){ $("google").href = googleUrl; $("google").hidden = false; }
}

async function enviar(){
  const m = media();
  if(m === null) return;
  const erro = $("erro"); erro.textContent = "";
  const comentario = m < 4 ? $("comentario").value.trim() : "";
  if(m < 3 && !comentario){ erro.textContent = "Conta pra gente o que aconteceu."; $("comentario").focus(); return; }
  const b = $("enviar");
  b.disabled = true; b.textContent = "Enviando...";
  try{
    const r = await fetch(`${API_BASE}/api/v1/avaliacao/${encodeURIComponent(AV.rid)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notas: AV.notas,
        comentario,
        nome: m < 4 ? $("nomeCliente").value.trim() : "",
        telefone: m < 4 ? $("telefone").value.trim() : ""
      })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "Não foi possível enviar. Tente de novo.");
    fim(m, d.google_url);
  }catch(e){
    erro.textContent = e.message;
    b.disabled = false; b.textContent = "Enviar avaliação";
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
    $("itens").innerHTML = CATEGORIAS.map(c => `
      <div class="av-item" data-cat="${c.id}">
        <span>${c.nome}</span>
        <div class="av-estrelas">${[1, 2, 3, 4, 5].map(n =>
          `<button type="button" class="av-estrela" data-n="${n}" aria-label="${c.nome}: ${n} ${n === 1 ? "estrela" : "estrelas"}">${ESTRELA}</button>`).join("")}</div>
      </div>`).join("");
    document.querySelectorAll(".av-item").forEach(item => {
      item.querySelectorAll(".av-estrela").forEach(e => {
        e.onclick = () => escolher(item.dataset.cat, Number(e.dataset.n));
      });
    });
    $("enviar").onclick = enviar;
    $("comentario").oninput = () => { $("erro").textContent = ""; };
    $("vp").hidden = false;
  }catch(e){
    console.error("Avaliação:", e);
    aviso("Sem conexão. Verifique sua internet e tente de novo.");
  }
})();
