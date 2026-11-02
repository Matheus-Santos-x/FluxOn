/* ============================================================
   LOGIN DO CLIENTE — telefone + código de 6 dígitos no WhatsApp.
   Depois de entrar, o acesso fica salvo neste aparelho (não precisa
   entrar de novo). Quem entra pelo link ?token= já fica logado também.
   ============================================================ */
const LOGIN = { telefone:"", nome:"", espera:null, enviando:false };

const ICONE_USUARIO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function telefoneMascara(v){
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if(d.length <= 2) return d;
  if(d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if(d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function loginAtualizarBotao(){
  const btn = document.getElementById("loginBtn");
  if(!btn) return;
  if(FID.cliente){
    const nome = String(FID.cliente.nome || "").trim();
    btn.classList.add("logado");
    btn.setAttribute("aria-label", "Minha conta");
    btn.innerHTML = `<span class="login-avatar">${escHtml((nome || "?").charAt(0).toUpperCase())}</span>`;
  }else{
    btn.classList.remove("logado");
    btn.setAttribute("aria-label", "Entrar");
    btn.innerHTML = `${ICONE_USUARIO}<span>Entrar</span>`;
  }
}

function loginClique(){
  if(FID.cliente) mostrarAba("fidelidade");
  else loginAbrir();
}

function loginAbrir(){
  document.getElementById("loginModal")?.remove();
  const v = typeof getFieldValues === "function" ? getFieldValues() : {};
  const wrap = document.createElement("div");
  wrap.id = "loginModal";
  wrap.className = "detail-backdrop";
  wrap.innerHTML = `
    <div class="detail-panel login-panel">
      <div class="detail-body">
        <div class="fid-sheet-head">
          <h2>Entrar</h2>
          <button class="sheet-back" id="loginFechar" aria-label="Fechar">✕</button>
        </div>
        <div id="loginCorpo"></div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  lockBodyScroll();
  document.getElementById("loginFechar").onclick = loginFechar;
  wrap.addEventListener("click", e => { if(e.target === wrap) loginFechar(); });
  loginPassoTelefone(LOGIN.nome || v.nome || "", LOGIN.telefone || v.telefone || "");
  gsap.fromTo(wrap, { opacity:0 }, { opacity:1, duration:.25 });
  gsap.fromTo(wrap.querySelector(".detail-panel"), { scale:.9, opacity:0 }, { scale:1, opacity:1, duration:.35, ease:"back.out(1.4)" });
}

function loginFechar(){
  clearInterval(LOGIN.espera);
  const wrap = document.getElementById("loginModal");
  if(!wrap) return;
  unlockBodyScroll();
  gsap.to(wrap.querySelector(".detail-panel"), { scale:.92, opacity:0, duration:.22, ease:"power2.in" });
  gsap.to(wrap, { opacity:0, duration:.25, onComplete:() => wrap.remove() });
}

function loginPassoTelefone(nome, telefone){
  const corpo = document.getElementById("loginCorpo");
  corpo.innerHTML = `
    <p class="login-txt">Entre com seu WhatsApp para ver seus ${FID.modelo === "selos" ? "selos" : "pontos"} e trocar por prêmios. Você só faz isso uma vez neste aparelho.</p>
    <div class="field"><label>Seu nome</label><input type="text" id="loginNome" value="${escHtml(nome)}" placeholder="Como podemos te chamar?" autocomplete="name"></div>
    <div class="field"><label>Telefone (WhatsApp)</label><input type="tel" id="loginTel" value="${escHtml(telefoneMascara(telefone))}" placeholder="(00) 00000-0000" inputmode="tel" autocomplete="tel"></div>
    <button class="checkout-btn" id="loginEnviar">Receber código no WhatsApp</button>`;
  const tel = document.getElementById("loginTel");
  tel.addEventListener("input", () => { tel.value = telefoneMascara(tel.value); });
  tel.addEventListener("keydown", e => { if(e.key === "Enter") loginSolicitar(); });
  document.getElementById("loginEnviar").onclick = loginSolicitar;
  setTimeout(() => (nome ? tel : document.getElementById("loginNome")).focus(), 350);
}

async function loginSolicitar(){
  if(LOGIN.enviando) return;
  const nome = (document.getElementById("loginNome")?.value || LOGIN.nome || "").trim();
  const telInput = document.getElementById("loginTel");
  const telefone = String(telInput ? telInput.value : LOGIN.telefone).replace(/\D/g, "");
  if(telefone.length < 10){ if(telInput) shake("loginTel"); fidToast("Digite o telefone com DDD", true); return; }
  LOGIN.nome = nome; LOGIN.telefone = telefone;

  const btn = document.getElementById("loginEnviar") || document.getElementById("loginReenviar");
  LOGIN.enviando = true;
  if(btn){ btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = "Enviando..."; }
  try{
    const r = await fetch(`${CONFIG.API_BASE}/api/v1/cliente/${RESTAURANT_ID}/login/solicitar`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ telefone, nome })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "Não foi possível enviar o código.");
    loginPassoCodigo();
  }catch(err){
    fidToast(err.message, true);
    if(btn){ btn.disabled = false; btn.textContent = btn.dataset.txt || "Receber código no WhatsApp"; }
  }finally{
    LOGIN.enviando = false;
  }
}

function loginPassoCodigo(){
  const corpo = document.getElementById("loginCorpo");
  if(!corpo) return;
  corpo.innerHTML = `
    <p class="login-txt">Enviamos um código de 6 números para o WhatsApp <b>${escHtml(telefoneMascara(LOGIN.telefone))}</b>.</p>
    <div class="field"><label>Código</label><input type="text" id="loginCodigo" class="login-codigo" maxlength="6" placeholder="••••••" inputmode="numeric" autocomplete="one-time-code"></div>
    <button class="checkout-btn" id="loginEntrar">Entrar</button>
    <div class="login-links">
      <button id="loginTrocar">Trocar número</button>
      <button id="loginReenviar" disabled>Reenviar código</button>
    </div>`;
  const cod = document.getElementById("loginCodigo");
  cod.addEventListener("input", () => {
    cod.value = cod.value.replace(/\D/g, "").slice(0, 6);
    if(cod.value.length === 6) loginVerificar();
  });
  document.getElementById("loginEntrar").onclick = loginVerificar;
  document.getElementById("loginTrocar").onclick = () => { clearInterval(LOGIN.espera); loginPassoTelefone(LOGIN.nome, LOGIN.telefone); };
  document.getElementById("loginReenviar").onclick = loginSolicitar;
  setTimeout(() => cod.focus(), 200);

  // só deixa pedir outro código depois de 45 segundos
  clearInterval(LOGIN.espera);
  let s = 45;
  const re = document.getElementById("loginReenviar");
  const tick = () => {
    if(!document.body.contains(re)) return clearInterval(LOGIN.espera);
    re.disabled = s > 0;
    re.textContent = s > 0 ? `Reenviar em ${s}s` : "Reenviar código";
    s--;
    if(s < -1) clearInterval(LOGIN.espera);
  };
  tick(); LOGIN.espera = setInterval(tick, 1000);
}

async function loginVerificar(){
  if(LOGIN.enviando) return;
  const codigo = (document.getElementById("loginCodigo")?.value || "").replace(/\D/g, "");
  if(codigo.length !== 6){ shake("loginCodigo"); return; }
  const btn = document.getElementById("loginEntrar");
  LOGIN.enviando = true; btn.disabled = true; btn.textContent = "Entrando...";
  try{
    const r = await fetch(`${CONFIG.API_BASE}/api/v1/cliente/${RESTAURANT_ID}/login/verificar`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ telefone: LOGIN.telefone, codigo, nome: LOGIN.nome })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok || !d.token) throw new Error(d.error || "Código inválido ou expirado");

    FID.token = d.token;
    try{ localStorage.setItem(fidTokenKey(), d.token); }catch{}
    await fidBuscarCliente();
    loginFechar();
    fidToast(`Pronto, ${String(FID.cliente?.nome || d.nome || "").split(" ")[0] || "você entrou"}! 🎉`);
    loginAtualizarBotao();
    if(ABA_ATUAL === "fidelidade") fidRender(true); else mostrarAba("fidelidade");
  }catch(err){
    fidToast(err.message, true);
    const cod = document.getElementById("loginCodigo");
    if(cod){ cod.value = ""; shake("loginCodigo"); cod.focus(); }
    btn.disabled = false; btn.textContent = "Entrar";
  }finally{
    LOGIN.enviando = false;
  }
}
