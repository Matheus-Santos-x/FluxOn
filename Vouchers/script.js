/* ============================================================
   VALE-PRESENTE — o cliente escolhe o valor, paga no Pix e o código
   chega no WhatsApp. Descobre o restaurante pelo domínio da Central
   (ou ?r=ID-DO-RESTAURANTE para testar).
   ============================================================ */
const API_BASE = "https://backend.evoriseai.com.br";
const VP = { rid: null, loja: null, valor: null, presente: true, cobranca: null, timer: null };

const $ = (id) => document.getElementById(id);
const moeda = (v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
function esc(s){
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function mascaraTel(v){
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if(d.length <= 2) return d;
  if(d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if(d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
const soNumeros = (v) => String(v || "").replace(/\D/g, "");
function aviso(msg){ $("aviso").textContent = msg; $("aviso").hidden = false; $("vp").hidden = true; }
function mostrarPasso(id){
  ["passoForm", "passoPix", "passoOk"].forEach(p => $(p).hidden = p !== id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function descobrirRestaurante(){
  const r = new URLSearchParams(location.search).get("r");
  if(r) return r;
  const resp = await fetch(`${API_BASE}/api/v1/dominio-vouchers/${encodeURIComponent(location.hostname)}`);
  if(!resp.ok) return null;
  return (await resp.json()).restaurant_id || null;
}

function atualizarBotao(){
  const b = $("pagar");
  b.disabled = !VP.valor;
  b.textContent = VP.valor ? `Pagar ${moeda(VP.valor)} com Pix` : "Escolha um valor";
}

function montarTela(){
  const l = VP.loja;
  document.documentElement.style.setProperty("--cor", l.cor || "#d62828");
  document.title = `Vale-presente · ${l.nome}`;
  $("nome").textContent = l.nome;
  if(l.logo_url){
    $("logo").innerHTML = `<img src="${esc(l.logo_url)}" alt="">`;
    $("favicon").href = l.logo_url;
  }else{
    $("logo").textContent = String(l.nome || "?").charAt(0).toUpperCase();
  }
  $("valores").innerHTML = l.valores.map(v =>
    `<button type="button" class="vp-valor" data-valor="${v}"><small>R$</small>${v}</button>`).join("");
  $("valores").querySelectorAll("[data-valor]").forEach(b => b.onclick = () => {
    VP.valor = Number(b.dataset.valor);
    $("valores").querySelectorAll(".vp-valor").forEach(x => x.classList.toggle("on", x === b));
    atualizarBotao();
  });
  document.querySelectorAll("[data-presente]").forEach(b => b.onclick = () => {
    VP.presente = b.dataset.presente === "1";
    document.querySelectorAll("[data-presente]").forEach(x => x.classList.toggle("on", x === b));
    $("camposPresente").hidden = !VP.presente;
  });
  ["destTel", "telComprador"].forEach(id => $(id).addEventListener("input", e => { e.target.value = mascaraTel(e.target.value); }));
  $("info").textContent = `Válido por ${l.validade_dias} dias a partir da compra. Pode ser usado aos poucos: o que sobrar continua valendo até a data de validade.`;
  if(l.central_url){
    ["voltar", "okVoltar"].forEach(id => { $(id).href = l.central_url; $(id).hidden = false; });
  }
  $("pagar").onclick = pagar;
  atualizarBotao();
  $("vp").hidden = false;
}

async function pagar(){
  const erro = $("erro"); erro.textContent = "";
  const nome = $("nomeComprador").value.trim();
  const tel = soNumeros($("telComprador").value);
  const destNome = $("destNome").value.trim();
  const destTel = soNumeros($("destTel").value);
  if(!VP.valor) return;
  if(VP.presente && !destNome) return erro.textContent = "Escreva o nome de quem vai ganhar.";
  if(VP.presente && destTel.length < 10) return erro.textContent = "Digite o WhatsApp de quem vai ganhar, com DDD.";
  if(!nome) return erro.textContent = "Escreva seu nome.";
  if(tel.length < 10) return erro.textContent = "Digite seu WhatsApp com DDD.";

  const b = $("pagar");
  b.disabled = true; b.textContent = "Gerando Pix...";
  try{
    const r = await fetch(`${API_BASE}/api/v1/pix/${VP.rid}/cobrancas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "voucher", nome, telefone: tel,
        dados: { valor: VP.valor, presente: VP.presente, destinatario_nome: destNome, destinatario_telefone: destTel, mensagem: $("mensagem").value.trim() }
      })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "Não foi possível gerar o Pix. Tente de novo.");
    VP.cobranca = d;
    mostrarPix();
  }catch(e){
    erro.textContent = e.message;
  }finally{
    atualizarBotao();
  }
}

function pararPix(){ clearInterval(VP.timer); VP.timer = null; }

function mostrarPix(){
  pararPix();
  const c = VP.cobranca;
  $("pixValor").textContent = moeda(c.valor);
  if(c.pix_qr_base64){ $("pixQr").src = `data:image/png;base64,${c.pix_qr_base64}`; $("pixQr").hidden = false; }
  $("pixCodigo").textContent = c.pix_copia_cola || "";
  $("pixStatus").textContent = "Aguardando o pagamento. Assim que você pagar, o vale é enviado sozinho.";
  const copiar = $("pixCopiar");
  copiar.textContent = "Copiar código Pix";
  copiar.onclick = async () => {
    try{ await navigator.clipboard.writeText(c.pix_copia_cola); copiar.textContent = "Código copiado ✓"; }
    catch{ const s = getSelection(), rg = document.createRange(); rg.selectNodeContents($("pixCodigo")); s.removeAllRanges(); s.addRange(rg); }
  };
  $("pixVoltar").onclick = () => { pararPix(); mostrarPasso("passoForm"); };
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
      const r = await fetch(`${API_BASE}/api/v1/pix/${VP.rid}/cobrancas/${c.cobranca_id}/status`);
      const d = await r.json();
      if(d.status === "pago"){ pararPix(); await pago(); return; }
      if(d.status === "expirado"){ pararPix(); expirou(); }
    }catch{ /* sem internet por um instante: tenta de novo */ }
    finally{ consultando = false; }
  };
  VP.timer = setInterval(tick, 1000);
  tick();
}

function expirou(){
  $("pixTimer").textContent = "";
  $("pixStatus").textContent = "Este Pix expirou. Gere um novo para continuar.";
  $("pixCopiar").textContent = "Gerar novo Pix";
  $("pixCopiar").onclick = () => { mostrarPasso("passoForm"); pagar(); };
}

async function pago(){
  let v = null;
  for(let i = 0; i < 5 && !v?.pago; i++){
    try{
      const r = await fetch(`${API_BASE}/api/v1/vouchers/${VP.rid}/compra/${VP.cobranca.cobranca_id}`);
      v = await r.json();
    }catch{}
    if(!v?.pago) await new Promise(r => setTimeout(r, 1500));
  }
  $("okTexto").textContent = v?.presente
    ? `Enviamos o vale para o WhatsApp de ${v.destinatario_nome}. Você também recebeu o comprovante no seu.`
    : "Enviamos o código para o seu WhatsApp. Guarde também o código abaixo.";
  $("okCodigo").textContent = v?.codigo || "Chega no WhatsApp em instantes";
  $("okValidade").textContent = v?.expira_em
    ? `${moeda(v.valor)} · válido até ${new Date(v.expira_em).toLocaleDateString("pt-BR")}`
    : "";
  $("okCopiar").hidden = !v?.codigo;
  $("okCopiar").onclick = async () => {
    try{ await navigator.clipboard.writeText(v.codigo); $("okCopiar").textContent = "Código copiado ✓"; }catch{}
  };
  mostrarPasso("passoOk");
}

(async function iniciar(){
  try{
    VP.rid = await descobrirRestaurante();
    if(!VP.rid) return aviso("Página não encontrada.");
    const r = await fetch(`${API_BASE}/api/v1/vouchers/${encodeURIComponent(VP.rid)}/loja`);
    const d = await r.json().catch(() => ({}));
    if(!r.ok) return aviso(d.error || "Não foi possível carregar esta página.");
    if(!d.disponivel) return aviso("O vale-presente não está disponível no momento.");
    VP.loja = d;
    montarTela();
  }catch(e){
    console.error("Vale-presente:", e);
    aviso("Sem conexão. Verifique sua internet e tente de novo.");
  }
})();
