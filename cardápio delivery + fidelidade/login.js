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
  const
