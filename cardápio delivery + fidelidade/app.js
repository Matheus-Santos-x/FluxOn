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

function mostrarAba(aba, semRolar){
  if(aba === ABA_ATUAL) return;
  ABA_ATUAL = aba;
  const fid = aba === "fidelidade";
  document.body.classList.toggle("aba-fid", fid);
  document.querySelectorAll(".tab-item").forEach(b => b.classList.toggle("active", b.dataset.aba === aba));
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

  const bar = document.getElementById("tabbar");
  bar.hidden = false;
  document.body.classList.add("com-abas");
  gsap.fromTo(bar, { y:80 }, { y:0, duration:.5, ease:"power3.out" });
  bar.querySelectorAll(".tab-item").forEach(b => b.onclick = () => mostrarAba(b.dataset.aba));
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
