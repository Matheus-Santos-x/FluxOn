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

    // fidelidade roda à parte: se falhar, o cardápio continua normal
    iniciarAbas();
  }catch(err){
    console.error("Erro ao carregar o cardápio:", err);
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
  if(!tem) return;

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
  document.getElementById("sideMenuClose").onclick = fecharMenu;
  overlay.addEventListener("click", fecharMenu);
  document.addEventListener("keydown", e => { if(e.key === "Escape") fecharMenu(); });
  sideMenu.querySelectorAll(".side-item").forEach(b => b.onclick = () => { fecharMenu(); mostrarAba(b.dataset.aba); });
  document.getElementById("fidFab").onclick = fidAbrirResgate;
  fidAtualizarPontinho();

  if(location.hash === "#fidelidade") mostrarAba("fidelidade", true);
}

/* app instalável (PWA) — o service worker não guarda nada em cache,
   então uma atualização do cardápio aparece na hora */
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
