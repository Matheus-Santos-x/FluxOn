/* ============================================================
   INIT
   ============================================================ */
function showError(msg){
  document.body.style.opacity = "1";
  ["bestsellersSection", "catNav", "cartFab"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = "none";
  });
  document.querySelector(".ai-bubble")?.style.setProperty("display", "none");
  document.getElementById("brandName").textContent = "Cardápio indisponível";

  document.getElementById("menuMain").innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h2>Não foi possível carregar o cardápio</h2>
      <p>${escHtml(msg)}</p>
      <button class="error-retry-btn" id="retryBtn">Tentar novamente</button>
    </div>
  `;
  document.getElementById("retryBtn").onclick = () => location.reload();
}

(async function init(){
  gsap.set([".hero-sub", ".brand-row", ".ai-bubble"], { opacity:0, y:16 });
  gsap.set(".ai-bubble", { y:-10 });

  // chegou pelo link da fidelidade (#fidelidade ou ?token=): já abre nela, o cardápio carrega por trás
  if(location.hash === "#fidelidade" || new URLSearchParams(location.search).has("token"))
    document.body.classList.add("aba-fid", "fid-carregando");

  try{
    MENU = await fetchMenu();
    applyBranding();
    renderMenu();
    updateCartUI();

    const bestsellers = await loadBestsellers();
    renderBestsellers(bestsellers);

    // intro sequence
    gsap.timeline()
      .to(".brand-row", { opacity:1, y:0, duration:.5, ease:"power2.out" })
      .to(".hero-sub", { opacity:1, y:0, duration:.5, ease:"power2.out" }, "-=.25")
      .to(".ai-bubble", { opacity:1, y:0, duration:.5, ease:"back.out(1.7)" }, "-=.2");

    maybeShowAiTooltip();

    // rastreio: se tiver pedido em andamento, o cardápio abre direto na tela de acompanhar
    rastreio.iniciar().catch(err => console.warn("Rastreio indisponível:", err));

    // fidelidade roda à parte: se falhar, o cardápio continua normal
    iniciarAbas().finally(() => rastreio.menuLateral());
  }catch(err){
    console.error("Erro ao carregar o cardápio:", err);
    document.body.classList.remove("aba-fid", "fid-carregando");
    gsap.to(".brand-row", { opacity:1, y:0, duration:.3 });
    showError(err.message || "Tente novamente em instantes.");
  }

  document.getElementById("footerYear").textContent = new Date().getFullYear();
})();

/* ============================================================
   ABAS — Cardápio / Fidelidade
   A barra de baixo só aparece se o restaurante tem prêmios
   cadastrados ou se o cliente entrou pelo link da fidelidade.
   ============================================================ */
let ABA_ATUAL = "cardapio";
const sideMenu = document.getElementById("sideMenu");

function abrirMenu(){
  sideMenu.setAttribute("aria-hidden", "false");
  openOverlay();
  gsap.to(sideMenu, { x:0, duration:.45, ease:"power3.out" });
  gsap.fromTo(sideMenu.querySelectorAll(".side-item"), { opacity:0, x:-12 }, { opacity:1, x:0, duration:.35, stagger:.06, delay:.1, ease:"power2.out" });
}
function fecharMenu(){
  if(sideMenu.getAttribute("aria-hidden") === "true") return;
  sideMenu.setAttribute("aria-hidden", "true");
  gsap.to(sideMenu, { x:"-105%", duration:.35, ease:"power2.in" });
  closeOverlay();
}

function mostrarAba(aba, semRolar){
  document.querySelectorAll(".side-item").forEach(b => b.classList.toggle("active", b.dataset.aba === aba));
  if(aba === ABA_ATUAL) return;
  ABA_ATUAL = aba;
  const fid = aba === "fidelidade";
  document.body.classList.toggle("aba-fid", fid);
  history.replaceState(null, "", location.pathname + location.search + (fid ? "#fidelidade" : ""));
  if(!semRolar) window.scrollTo({ top:0, behavior:"smooth" });

  if(fid){
    fidRender(true);
  }else{
    if(window.ScrollTrigger) ScrollTrigger.refresh();
    gsap.fromTo("#menuMain, #catNav, #bestsellersSection", { opacity:0, y:10 }, { opacity:1, y:0, duration:.35, ease:"power2.out", clearProps:"transform" });
  }
}

async function iniciarAbas(){
  let tem = false;
  try{ tem = await fidCarregar(); }catch(err){ console.warn("Fidelidade indisponível:", err); }
  if(!tem){ document.body.classList.remove("aba-fid", "fid-carregando"); return; }

  // cabeçalho do menu com a marca do restaurante
  const logo = document.getElementById("sideMenuLogo");
  if(RESTAURANT_CONFIG.logo_url) logo.innerHTML = `<img src="${escHtml(RESTAURANT_CONFIG.logo_url)}" alt="">`;
  else logo.textContent = (RESTAURANT_CONFIG.nome_exibicao || "R").trim().charAt(0).toUpperCase();
  document.getElementById("sideMenuNome").textContent = RESTAURANT_CONFIG.nome_exibicao || "";

  const btn = document.getElementById("menuBtn");
  btn.hidden = false;
  document.body.classList.add("com-menu");
  gsap.fromTo(btn, { opacity:0, scale:.7 }, { opacity:1, scale:1, duration:.4, ease:"back.out(1.8)" });
  btn.onclick = abrirMenu;

  const entrar = document.getElementById("loginBtn");
  entrar.hidden = false;
  loginAtualizarBotao();
  gsap.fromTo(entrar, { opacity:0, scale:.7 }, { opacity:1, scale:1, duration:.4, ease:"back.out(1.8)", delay:.08 });
  entrar.onclick = loginClique;
  document.getElementById("sideMenuClose").onclick = fecharMenu;
  overlay.addEventListener("click", fecharMenu);
  document.addEventListener("keydown", e => { if(e.key === "Escape") fecharMenu(); });
  sideMenu.querySelectorAll(".side-item").forEach(b => b.onclick = () => { fecharMenu(); mostrarAba(b.dataset.aba); });
  document.getElementById("fidFab").onclick = fidAbrirResgate;
  fidAtualizarPontinho();

  if(location.hash === "#fidelidade") mostrarAba("fidelidade", true);
  else document.body.classList.remove("aba-fid");
  document.body.classList.remove("fid-carregando");
}

/* barra de categorias presa no topo → body.nav-presa (o Entrar some) */
(function(){
  const nav = document.getElementById("catNav");
  let presa = false;
  const ver = () => {
    const p = nav.offsetParent !== null && nav.getBoundingClientRect().top <= 56;
    if(p !== presa){ presa = p; document.body.classList.toggle("nav-presa", p); }
  };
  window.addEventListener("scroll", ver, { passive:true });
  window.addEventListener("resize", ver);
})();

/* app instalável (PWA) — o service worker não guarda nada em cache,
   então uma atualização do cardápio aparece na hora */
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* convite pra instalar: aparece toda vez que abre pelo navegador, até o cliente instalar */
(function(){
  let pedido = null;
  const $i = (id) => document.getElementById(id);
  const fundo = $i("instFundo");
  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedido = e; });
  window.addEventListener("appinstalled", () => { pedido = null; fechar(); });
  function fechar(){ fundo.classList.add("hidden"); document.body.classList.remove("inst-aberto"); }
  
   function abrir(){
    if(instalado() || !fundo) return;
    if(document.body.classList.contains("rt-aberto")) return; // quem veio acompanhar o pedido não vê o convite por cima do mapa
    const cfg = (typeof RESTAURANT_CONFIG !== "undefined" && RESTAURANT_CONFIG) || {};
    if(cfg.nome_exibicao) $i("instNome").textContent = cfg.nome_exibicao;
    // mesma logo que aparece no topo do cardápio
    const iconeApp = document.getElementById("appleIcon").href;
    const logo = cfg.logo_url || document.querySelector("#brandLogo img")?.src || iconeApp;
    const img = $i("instLogo");
    img.onerror = () => { img.onerror = null; img.src = iconeApp; };
    img.classList.remove("hidden"); img.src = logo;
    $i("instDica").classList.add("hidden");
    fundo.classList.remove("hidden"); document.body.classList.add("inst-aberto");
  }
   
  $i("instNao").onclick = fechar;
  fundo.addEventListener("click", (e) => { if(e.target === fundo) fechar(); });
  $i("instSim").onclick = async () => {
    if(pedido){ const p = pedido; pedido = null; p.prompt(); const r = await p.userChoice.catch(() => null); if(r?.outcome === "accepted") fechar(); return; }
    const d = $i("instDica");
    d.innerHTML = ios
      ? "No iPhone: toque em <b>Compartilhar</b> (o quadrado com a seta, embaixo da tela) e depois em <b>Adicionar à Tela de Início</b>."
      : "Toque nos <b>3 pontinhos (⋮)</b> do navegador e depois em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.";
    d.classList.remove("hidden");
  };
  // espera o cardápio aparecer antes de mostrar
  // espera o cardápio (nome e logo do restaurante) carregar antes de mostrar
  window.addEventListener("load", () => {
    let t = 0;
    const esperar = setInterval(() => {
      const pronto = typeof RESTAURANT_CONFIG !== "undefined" && Object.keys(RESTAURANT_CONFIG || {}).length;
      if(pronto || ++t > 16){ clearInterval(esperar); setTimeout(abrir, 600); }
    }, 250);
  });
})();
