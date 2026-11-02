/* ============================================================
   RESERVA DE MESA — pessoas, dia, horário e mesa; paga no Pix (vira
   crédito na conta) e a confirmação chega no WhatsApp.
   Descobre o restaurante pelo domínio (Admin → Domínios → Reservas)
   ou por ?r=ID-DO-RESTAURANTE para testar.
   Se a pessoa sair com o Pix aberto, ao voltar o mesmo Pix reaparece.
   ============================================================ */
const API_BASE = "https://backend.evoriseai.com.br";
const RS = { rid: null, info: null, pessoas: 2, dia: null, horarios: [], hora: null, mesa: null, cobranca: null, resumo: null, timer: null };

const $ = (id) => document.getElementById(id);
const moeda = (v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
const soNumeros = (v) => String(v || "").replace(/\D/g, "");
function esc(s){
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function mascaraTel(v){
  const d = soNumeros(v).slice(0, 11);
  if(d.length <= 2) return d;
  if(d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if(d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function aviso(msg){ $("aviso").textContent = msg; $("aviso").hidden = false; $("vp").hidden = true; }
function mostrarPasso(id){
  ["passoForm", "passoPix", "passoOk"].forEach(p => $(p).hidden = p !== id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
// datas no fuso de Brasília
const diaISO = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somaDias = (iso, n) => diaISO(new Date(Date.parse(`${iso}T12:00:00-03:00`) + n * 864e5));
const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Pix em aberto guardado neste aparelho (some quando paga ou expira)
const chavePix = () => `fluxon_reserva_pix_${RS.rid}`;
function guardarPix(){ try{ localStorage.setItem(chavePix(), JSON.stringify({ cobranca: RS.cobranca, resumo: RS.resumo })); }catch{} }
function esquecerPix(){ try{ localStorage.removeItem(chavePix()); }catch{} }
function pixGuardado(){
  try{
    const s = JSON.parse(localStorage.getItem(chavePix()) || "null");
    return s?.cobranca && new Date(s.cobranca.expira_em) > new Date() ? s : null;
  }catch{ return null; }
}

async function descobrirRestaurante(){
  const r = new URLSearchParams(location.search).get("r");
  if(r) return r;
  const resp = await fetch(`${API_BASE}/api/v1/dominio/reservas/${encodeURIComponent(location.hostname)}`);
  if(!resp.ok) return null;
  return (await resp.json()).restaurant_id || null;
}

function atualizarBotao(){
  const b = $("pagar");
  b.disabled = !RS.mesa;
  b.textContent = RS.mesa ? `Reservar e pagar ${moeda(RS.info.valor)} no Pix` : "Escolha a mesa";
}

function mostrarPessoas(){
  $("pessoas").innerHTML = `${RS.pessoas}<small>${RS.pessoas === 1 ? "pessoa" : "pessoas"}</small>`;
  $("menos").disabled = RS.pessoas <= 1;
  $("mais").disabled = RS.pessoas >= RS.info.max_pessoas;
}

function montarDias(){
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const lista = Array.from({ length: RS.info.dias + 1 }, (_, i) => somaDias(RS.info.hoje, i));
  $("dias").innerHTML = lista.map((d, i) => {
    const dt = new Date(`${d}T12:00:00-03:00`);
    const rot = i === 0 ? "hoje" : i === 1 ? "amanhã" : nomes[dt.getUTCDay()];
    return `<button type="button" class="rs-dia" data-dia="${d}"><span>${rot}</span><b>${d.slice(8)}/${d.slice(5, 7)}</b></button>`;
  }).join("");
  $("dias").querySelectorAll("[data-dia]").forEach(b => b.onclick = () => escolherDia(b.dataset.dia));
}

async function escolherDia(dia){
  RS.dia = dia; RS.hora = null; RS.mesa = null;
  $("dias").querySelectorAll(".rs-dia").forEach(x => x.classList.toggle("on", x.dataset.dia === dia));
  $("horas").innerHTML = `<p class="rs-vazio">Buscando horários...</p>`;
  $("mesas").innerHTML = `<p class="rs-vazio">Escolha um horário.</p>`;
  atualizarBotao();
  try{
    const r = await fetch(`${API_BASE}/api/v1/reservas/${RS.rid}/horarios?data=${dia}`);
    const d = await r.json();
    if(RS.dia !== dia) return; // trocou de dia no meio
    RS.horarios = d.horarios || [];
  }catch{ RS.horarios = []; }
  mostrarHoras();
}

function mostrarHoras(){
  const lista = RS.horarios.filter(h => h.mesas.some(m => m.lugares >= RS.pessoas));
  if(!lista.length){
    $("horas").innerHTML = `<p class="rs-vazio">Sem horários livres nesse dia para ${RS.pessoas} ${RS.pessoas === 1 ? "pessoa" : "pessoas"}. Tente outro dia.</p>`;
    return;
  }
  $("horas").innerHTML = `<div class="rs-horas">${lista.map(h =>
    `<button type="button" class="rs-hora${h.hora === RS.hora ? " on" : ""}" data-hora="${h.hora}">${h.hora}</button>`).join("")}</div>`;
  $("horas").querySelectorAll("[data-hora]").forEach(b => b.onclick = () => {
    RS.hora = b.dataset.hora; RS.mesa = null;
    $("horas").querySelectorAll(".rs-hora").forEach(x => x.classList.toggle("on", x === b));
    mostrarMesas(); atualizarBotao();
  });
}

function mostrarMesas(){
  const h = RS.horarios.find(x => x.hora === RS.hora);
  const mesas = (h?.mesas || []).filter(m => m.lugares >= RS.pessoas);
  if(!mesas.length){ $("mesas").innerHTML = `<p class="rs-vazio">Escolha um horário.</p>`; return; }
  $("mesas").innerHTML = `<div class="rs-mesas">${mesas.map(m =>
    `<button type="button" class="rs-mesa${m.numero === RS.mesa ? " on" : ""}" data-mesa="${m.numero}">Mesa ${m.numero}<small>até ${m.lugares} lugares</small></button>`).join("")}</div>`;
  $("mesas").querySelectorAll("[data-mesa]").forEach(b => b.onclick = () => {
    RS.mesa = Number(b.dataset.mesa);
    $("mesas").querySelectorAll(".rs-mesa").forEach(x => x.classList.toggle("on", x === b));
    atualizarBotao();
  });
}

function montarTela(){
  const l = RS.info;
  document.documentElement.style.setProperty("--cor", l.cor || "#d62828");
  document.title = `Reservar mesa · ${l.nome}`;
  $("nome").textContent = l.nome;
  if(l.logo_url){ $("logo").innerHTML = `<img src="${esc(l.logo_url)}" alt="">`; $("favicon").href = l.logo_url; }
  else $("logo").textContent = String(l.nome || "?").charAt(0).toUpperCase();
  if(l.central_url) ["voltar", "okVoltar"].forEach(id => { $(id).href = l.central_url; $(id).hidden = false; });

  RS.pessoas = Math.min(2, l.max_pessoas);
  mostrarPessoas();
  $("menos").onclick = () => { if(RS.pessoas > 1){ RS.pessoas--; mostrarPessoas(); trocarPessoas(); } };
  $("mais").onclick = () => { if(RS.pessoas < l.max_pessoas){ RS.pessoas++; mostrarPessoas(); trocarPessoas(); } };
  montarDias();
  $("telCliente").addEventListener("input", e => { e.target.value = mascaraTel(e.target.value); });
  $("info").textContent = `Para garantir a mesa você paga ${moeda(l.valor)} no Pix, e esse valor é descontado da sua conta no dia. Seguramos a mesa por ${l.tolerancia_min} minutos depois do horário.`;
  $("pagar").onclick = pagar;
  atualizarBotao();
  $("vp").hidden = false;
}

// mudou o número de pessoas: some com horário/mesa que não cabem mais
function trocarPessoas(){
  if(!RS.dia) return;
  const h = RS.horarios.find(x => x.hora === RS.hora);
  if(!h || !h.mesas.some(m => m.lugares >= RS.pessoas)) RS.hora = null;
  const m = h?.mesas.find(x => x.numero === RS.mesa);
  if(!m || m.lugares < RS.pessoas) RS.mesa = null;
  mostrarHoras(); mostrarMesas(); atualizarBotao();
}

async function pagar(){
  const erro = $("erro"); erro.textContent = "";
  const nome = $("nomeCliente").value.trim();
  const tel = soNumeros($("telCliente").value);
  if(!RS.mesa) return;
  if(!nome) return erro.textContent = "Escreva o nome para a reserva.";
  if(tel.length < 10) return erro.textContent = "Digite seu WhatsApp com DDD.";

  const b = $("pagar");
  b.disabled = true; b.textContent = "Gerando Pix...";
  try{
    const r = await fetch(`${API_BASE}/api/v1/pix/${RS.rid}/cobrancas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "reserva_mesa", nome, telefone: tel,
        dados: { data: RS.dia, hora: RS.hora, mesa: RS.mesa, pessoas: RS.pessoas, observacao: $("observacao").value.trim() }
      })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok){
      if(r.status === 409 && RS.dia) escolherDia(RS.dia); // alguém pegou a mesa: atualiza a lista
      throw new Error(d.error || "Não foi possível gerar o Pix. Tente de novo.");
    }
    const h = RS.horarios.find(x => x.hora === RS.hora);
    RS.cobranca = d;
    RS.resumo = { inicio: h.inicio, mesa: RS.mesa, pessoas: RS.pessoas, nome };
    guardarPix();
    mostrarPix();
  }catch(e){
    erro.textContent = e.message;
  }finally{
    atualizarBotao();
  }
}

function resumoHTML(r){
  return `<span>📅 <b>${esc(quando(r.inicio))}</b></span><span>🪑 Mesa ${r.mesa} · ${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"}</span><span>👤 ${esc(r.nome)}</span>`;
}

function pararPix(){ clearInterval(RS.timer); RS.timer = null; }

function mostrarPix(){
  pararPix();
  const c = RS.cobranca;
  $("pixValor").textContent = moeda(c.valor);
  $("pixResumo").innerHTML = resumoHTML(RS.resumo);
  if(c.pix_qr_base64){ $("pixQr").src = `data:image/png;base64,${c.pix_qr_base64}`; $("pixQr").hidden = false; }
  $("pixCodigo").textContent = c.pix_copia_cola || "";
  const copiar = $("pixCopiar");
  copiar.textContent = "Copiar código Pix";
  copiar.onclick = async () => {
    try{ await navigator.clipboard.writeText(c.pix_copia_cola); copiar.textContent = "Código copiado ✓"; }
    catch{ const s = getSelection(), rg = document.createRange(); rg.selectNodeContents($("pixCodigo")); s.removeAllRanges(); s.addRange(rg); }
  };
  $("pixVoltar").onclick = () => { pararPix(); esquecerPix(); mostrarPasso("passoForm"); if(RS.dia) escolherDia(RS.dia); };
  mostrarPasso("passoPix");

  const fim = new Date(c.expira_em).getTime();
  let n = 0, consultando = false;
  const tick = async () => {
    const resta = Math.max(0, Math.floor((fim - Date.now()) / 1000));
    $("pixTimer").textContent = resta > 0 ? `Expira em ${String(Math.floor(resta / 60)).padStart(2, "0")}:${String(resta % 60).padStart(2, "0")}` : "";
    if(resta <= 0){ pararPix(); expirou(); return; }
    if(n++ % 3 !== 0 || consultando) return; // pergunta ao servidor a cada 3 segundos
    consultando = true;
    try{
      const r = await fetch(`${API_BASE}/api/v1/pix/${RS.rid}/cobrancas/${c.cobranca_id}/status`);
      const d = await r.json();
      if(d.status === "pago"){ pararPix(); await pago(); return; }
      if(d.status === "expirado"){ pararPix(); expirou(); }
    }catch{ /* sem internet por um instante: tenta de novo */ }
    finally{ consultando = false; }
  };
  RS.timer = setInterval(tick, 1000);
  tick();
}

function expirou(){
  esquecerPix();
  $("pixTimer").textContent = "";
  $("pixStatus").textContent = "Este Pix expirou e a mesa foi liberada. Escolha de novo para reservar.";
  $("pixCopiar").textContent = "Escolher de novo";
  $("pixCopiar").onclick = () => $("pixVoltar").click();
}

async function pago(){
  esquecerPix();
  let r = null;
  for(let i = 0; i < 5 && !r?.pago; i++){
    try{ r = await (await fetch(`${API_BASE}/api/v1/reservas/${RS.rid}/compra/${RS.cobranca.cobranca_id}`)).json(); }catch{}
    if(!r?.pago) await new Promise(ok => setTimeout(ok, 1500));
  }
  const dados = r?.pago ? { inicio: r.inicio, mesa: r.mesa, pessoas: r.pessoas, nome: r.nome } : RS.resumo;
  $("okResumo").innerHTML = resumoHTML(dados);
  $("okTexto").textContent = `Enviamos a confirmação no seu WhatsApp. Os ${moeda(r?.valor_pago ?? RS.cobranca.valor)} que você pagou viram crédito na sua conta. Seguramos a mesa por ${RS.info.tolerancia_min} minutos depois do horário.`;
  mostrarPasso("passoOk");
}

(async function iniciar(){
  try{
    RS.rid = await descobrirRestaurante();
    if(!RS.rid) return aviso("Página não encontrada.");
    const r = await fetch(`${API_BASE}/api/v1/reservas/${encodeURIComponent(RS.rid)}/info`);
    const d = await r.json().catch(() => ({}));
    if(!r.ok) return aviso(d.error || "Não foi possível carregar esta página.");
    if(!d.disponivel) return aviso("Este restaurante não está aceitando reservas pelo site no momento.");
    RS.info = d;
    montarTela();
    // voltou com um Pix ainda valendo: mostra o mesmo Pix
    const guardado = pixGuardado();
    if(guardado){ RS.cobranca = guardado.cobranca; RS.resumo = guardado.resumo; mostrarPix(); }
  }catch(e){
    console.error("Reservas:", e);
    aviso("Sem conexão. Verifique sua internet e tente de novo.");
  }
})();
