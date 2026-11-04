/* ============================================================
   AI CHAT — conectado em POST /api/v1/ia/sugestao
   ============================================================ */
const aiModal = document.getElementById("aiModal");
const aiTooltip = document.getElementById("aiTooltip");
const aiBubble = document.getElementById("aiBubbleBtn");
const aiMessagesEl = document.getElementById("aiChatMessages");
const aiInputEl = document.getElementById("aiChatInput");
const aiSendBtn = document.getElementById("aiChatSendBtn");
const AI_BUBBLE_POS_KEY = "fluxon_ai_bubble_pos";

let AI_HISTORY = [];   // guardado só na memória do navegador — "memória" da conversa
let AI_LOADING = false;
let AI_STARTED = false; // controla a mensagem de boas-vindas (só aparece 1x por sessão)

/* ---- travar/destravar o fundo enquanto o chat está aberto ---- */
let _scrollLockY = 0;
function lockBodyScroll(){
  _scrollLockY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${_scrollLockY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}
function unlockBodyScroll(){
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, _scrollLockY);
}

/* ---- balãozinho de dica — aparece toda vez que a página carrega,
   posicionado relativo à bolinha (que pode estar em qualquer canto) ---- */
function positionAiTooltip(){
  const rect = aiBubble.getBoundingClientRect();
  const onRight = rect.left > window.innerWidth / 2;
  aiTooltip.style.top = Math.max(10, rect.top - 4) + "px";
  if(onRight){
    aiTooltip.style.right = (window.innerWidth - rect.left + 10) + "px";
    aiTooltip.style.left = "auto";
  }else{
    aiTooltip.style.left = (rect.right + 10) + "px";
    aiTooltip.style.right = "auto";
  }
}

function hideAiTooltip(){
  gsap.to(aiTooltip, {
    opacity:0, scale:.94, duration:.3, ease:"power2.in",
    onComplete: () => { aiTooltip.style.pointerEvents = "none"; }
  });
}

function maybeShowAiTooltip(){
  setTimeout(() => {
    positionAiTooltip();
    aiTooltip.style.pointerEvents = "auto";
    gsap.to(aiTooltip, { opacity:1, scale:1, duration:.55, ease:"back.out(1.7)" });
    setTimeout(hideAiTooltip, 7000); // some sozinho depois de um tempo
  }, 1500);
}

function appendChatMessage(role, text){
  const bubble = document.createElement("div");
  bubble.className = "ai-msg ai-msg-" + role;
  bubble.textContent = text;
  aiMessagesEl.appendChild(bubble);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
  gsap.fromTo(bubble, { opacity:0, y:8 }, { opacity:1, y:0, duration:.3, ease:"power2.out" });
  return bubble;
}

function appendTypingIndicator(){
  const bubble = document.createElement("div");
  bubble.className = "ai-msg ai-msg-assistant ai-msg-typing";
  bubble.innerHTML = `<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>`;
  aiMessagesEl.appendChild(bubble);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
  gsap.fromTo(bubble, { opacity:0 }, { opacity:1, duration:.2 });
  return bubble;
}

function appendSuggestedItems(itens){
  if(!itens || itens.length === 0) return;
  const wrap = document.createElement("div");
  wrap.className = "ai-suggested-items";
  wrap.innerHTML = itens.map(s => {
    const it = MENU.find(m => String(m.id) === String(s.id)) || s;
    const temOpcoes = Array.isArray(it.opcoes) && it.opcoes.length > 0;
    return `
    <button class="ai-suggested-item" data-ai-add="${it.id}" data-ai-opcoes="${temOpcoes ? 1 : 0}">
      <span>${escHtml(it.nome)}</span>
      <span class="ai-item-price">${temOpcoes ? "A partir de " : ""}${money(precoMinimo(it))}</span>
    </button>`;
  }).join("");
  aiMessagesEl.appendChild(wrap);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
  gsap.fromTo(wrap, { opacity:0, y:8 }, { opacity:1, y:0, duration:.35, ease:"power2.out" });

  wrap.querySelectorAll("[data-ai-add]").forEach(btn => {
    btn.addEventListener("click", e => {
      if(btn.dataset.aiOpcoes === "1"){ closeAiChat(); openItemDetail(btn.dataset.aiAdd); window._voltarChat = btn; return; }
      addToCart(btn.dataset.aiAdd, e);
      btn.disabled = true;
      btn.innerHTML = `<span>✓ Adicionado ao carrinho</span>`;
    });
  });
}

// botões de resposta rápida (ex.: "Refrigerantes", "Sucos", "Não, obrigado")
function appendQuickReplies(opcoes){
  if(!Array.isArray(opcoes) || !opcoes.length) return;
  const wrap = document.createElement("div");
  wrap.className = "ai-quick-replies";
  wrap.innerHTML = opcoes.map(o => `<button type="button" class="ai-quick">${escHtml(o)}</button>`).join("");
  aiMessagesEl.appendChild(wrap);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
  wrap.querySelectorAll(".ai-quick").forEach(b => b.onclick = () => {
    wrap.remove();
    aiInputEl.value = b.textContent;
    sendAiMessage();
  });
}

// categoria grande (mais de 10 itens): botão que fecha o chat e desce até ela no cardápio
function appendIrCategoria(cat){
  if(!cat || !cat.ir) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "ai-ir-cat";
  b.textContent = `Ver todas as opções de ${cat.nome} (${cat.total}) →`;
  b.onclick = () => {
    closeAiChat();
    closeDrawer();
    setTimeout(() => document.getElementById("sec-" + slug(cat.nome))?.scrollIntoView({ behavior:"smooth", block:"start" }), 350);
  };
  aiMessagesEl.appendChild(b);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
}

/* ---- balão no carrinho: ao abrir o carrinho, a IA vê se faltou algo
   (bebida, sobremesa...) e conversa ali mesmo, num balãozinho em cima da lista.
   Mesma lógica do chat: primeiro os tipos, depois os itens (ou o atalho pra categoria).
   Uma vez por visita. ---- */
let AI_CARRINHO_FEITO = false;
async function iaPerguntar(mensagem){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try{
    const res = await fetch(`${CONFIG.API_BASE}/api/v1/ia/sugestao`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ restaurant_id: RESTAURANT_ID, mensagem, historico: AI_HISTORY.slice(-6), carrinho: carrinhoParaIA() })
    });
    return res.ok ? await res.json() : null;
  }catch(err){ console.warn("IA:", err); return null; }
  finally{ clearTimeout(t); }
}
function balaoDesenhar(balao, data){
  const it = (s) => MENU.find(m => String(m.id) === String(s.id)) || s;
  const itens = (data.itens || []).map(it);
  balao.innerHTML = `
    <div class="ai-cart-balao-top"><span class="ai-avatar">✨</span><p>${escHtml(data.resposta)}</p>
      <button type="button" class="ai-cart-balao-x" aria-label="Fechar">✕</button></div>
    ${itens.length ? `<div class="ai-cart-balao-itens">${itens.map(i => {
      const op = Array.isArray(i.opcoes) && i.opcoes.length > 0;
      return `<button type="button" class="ai-suggested-item" data-id="${i.id}" data-op="${op ? 1 : 0}"><span>${escHtml(i.nome)}</span><span class="ai-item-price">${op ? "A partir de " : ""}${money(precoMinimo(i))}</span></button>`;
    }).join("")}</div>` : ""}
    ${data.categoria && data.categoria.ir ? `<button type="button" class="ai-ir-cat" data-cat="${escHtml(data.categoria.nome)}">Ver todas as opções de ${escHtml(data.categoria.nome)} (${data.categoria.total}) →</button>` : ""}
    ${(data.opcoes_rapidas || []).length ? `<div class="ai-cart-balao-ops">${data.opcoes_rapidas.map(o => `<button type="button">${escHtml(o)}</button>`).join("")}</div>` : ""}`;
  balao.querySelector(".ai-cart-balao-x").onclick = () => balao.remove();
  balao.querySelectorAll(".ai-suggested-item").forEach(b => b.onclick = (e) => {
    if(b.dataset.op === "1"){ openItemDetail(b.dataset.id); return; }
    addToCart(b.dataset.id, e);
    b.disabled = true; b.innerHTML = "<span>✓ Adicionado</span>";
  });
  const ir = balao.querySelector(".ai-ir-cat");
  if(ir) ir.onclick = () => {
    closeDrawer();
    setTimeout(() => document.getElementById("sec-" + slug(ir.dataset.cat))?.scrollIntoView({ behavior:"smooth", block:"start" }), 350);
  };
  balao.querySelectorAll(".ai-cart-balao-ops button").forEach(b => b.onclick = async () => {
    const texto = b.textContent.trim();
    if(/^n[aã]o/i.test(texto)){ balao.remove(); return; }
    AI_HISTORY.push({ role:"user", content:texto });
    balao.querySelector(".ai-cart-balao-ops")?.remove();
    balao.querySelector(".ai-cart-balao-top p").innerHTML = `<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>`;
    const d = await iaPerguntar(texto);
    if(!d || !d.resposta){ balao.remove(); return; }
    AI_HISTORY.push({ role:"assistant", content:d.resposta });
    balaoDesenhar(balao, d);
  });
}
async function iaNoCarrinho(){
  if(IS_DEMO || !CART.length || AI_CARRINHO_FEITO) return;
  AI_CARRINHO_FEITO = true;
  const data = await iaPerguntar("__carrinho__");
  if(!data || data.pular || !data.resposta) return;
  if(!data.opcoes_rapidas || !data.opcoes_rapidas.length) data.opcoes_rapidas = ["Sim", "Não, obrigado"];
  AI_HISTORY.push({ role:"assistant", content:data.resposta });
  document.getElementById("aiCartBalao")?.remove();
  const balao = document.createElement("div");
  balao.id = "aiCartBalao"; balao.className = "ai-cart-balao";
  document.querySelector("#drawer .drawer-head").after(balao);
  balaoDesenhar(balao, data);
  gsap.fromTo(balao, { opacity:0, y:-8 }, { opacity:1, y:0, duration:.35, ease:"back.out(1.6)" });
}

// manda o carrinho atual junto — é isso que deixa a IA sugerir
// complementos (bebida, sobremesa etc) em vez de sugestões soltas
function carrinhoParaIA(){
  return CART.map(c => ({ nome:c.nome, qty:c.qty }));
}

async function sendAiMessage(){
  const texto = aiInputEl.value.trim();
  if(!texto || AI_LOADING) return;
  aiInputEl.value = "";
  appendChatMessage("user", texto);
  AI_HISTORY.push({ role:"user", content:texto });

  if(IS_DEMO){
    appendChatMessage("assistant", "No preview essa parte fica desligada. Assim que o cardápio estiver publicado com o restaurante real, eu já respondo com base no cardápio dele 🙂");
    return;
  }

  AI_LOADING = true;
  aiSendBtn.disabled = true;
  const typingBubble = appendTypingIndicator();

  try{
    const res = await fetch(`${CONFIG.API_BASE}/api/v1/ia/sugestao`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        restaurant_id: RESTAURANT_ID,
        mensagem: texto,
        historico: AI_HISTORY.slice(0, -1).slice(-6),
        carrinho: carrinhoParaIA()
      })
    });
    const data = await res.json();
    typingBubble.remove();
    if(!res.ok) throw new Error(data.error || "Erro ao consultar a IA");

    const resposta = data.resposta || "Não consegui pensar em nada agora, dá uma olhada no cardápio 🙂";
    appendChatMessage("assistant", resposta);
    AI_HISTORY.push({ role:"assistant", content:resposta });
    appendSuggestedItems(data.itens);
  }catch(err){
    console.error("Erro no chat da IA:", err);
    typingBubble.remove();
    appendChatMessage("assistant", "Ops, não consegui responder agora. Tenta de novo em instantes.");
  }finally{
    AI_LOADING = false;
    aiSendBtn.disabled = false;
  }
}

// disparada sozinha ao abrir o chat, SE já tiver item no carrinho —
// pede pra IA sugerir complementos com base no que já foi escolhido
async function sendAiAutoSuggestion(){
  const typingBubble = appendTypingIndicator();
  try{
    const res = await fetch(`${CONFIG.API_BASE}/api/v1/ia/sugestao`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        restaurant_id: RESTAURANT_ID,
        mensagem: "__sugestao_automatica__",
        historico: [],
        carrinho: carrinhoParaIA()
      })
    });
    const data = await res.json();
    typingBubble.remove();
    if(!res.ok) throw new Error(data.error || "Erro");

    const resposta = data.resposta || "Oi! Vi que você já tem alguns itens no carrinho — quer que eu sugira algo pra completar o pedido?";
    appendChatMessage("assistant", resposta);
    AI_HISTORY.push({ role:"assistant", content:resposta });
    appendSuggestedItems(data.itens);
  }catch(err){
    console.error("Erro na sugestão automática:", err);
    typingBubble.remove();
    appendChatMessage("assistant", "Oi! Me conta o que você tá com vontade de comer que eu já sugiro algo do cardápio 🍽️");
  }
}

aiSendBtn.onclick = sendAiMessage;
aiInputEl.addEventListener("keydown", e => {
  if(e.key === "Enter") sendAiMessage();
});

/* ============================================================
   TECLADO MOBILE — o bug: quando o teclado abre, o navegador
   desloca a "área visível" da tela, mas painéis fixos (bottom:0)
   não acompanham direito e a tela inteira parece "pular" pra
   cima. Aqui a gente escuta a VisualViewport API (a forma certa
   de saber o quanto o teclado está cobrindo) e reposiciona o
   painel pra ficar coladinho acima do teclado — estilo WhatsApp,
   compactando em vez de deslocar a tela toda.
   ============================================================ */
function bindKeyboardAwarePanel(panel, opts = {}){
  if(!window.visualViewport || !panel) return;
  const vv = window.visualViewport;
  const baseBottom = parseFloat(getComputedStyle(panel).bottom) || 0;

  function sync(){
    const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.bottom = (baseBottom + keyboardInset) + "px";

    if(opts.maxHeightWhenOpen){
      panel.style.height = keyboardInset > 60
        ? Math.min(opts.maxHeightWhenOpen, vv.height - 24) + "px"
        : "";
    }
    if(opts.onSync) opts.onSync(keyboardInset);
  }
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

bindKeyboardAwarePanel(aiModal, {
  maxHeightWhenOpen: 520,
  onSync: () => { aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight; }
});
// OBS: o checkout (sheet) agora é página cheia (inset:0, do topo até
// o rodapé), então NÃO usamos bindKeyboardAwarePanel nele — encolher
// a borda de baixo pra abrir espaço do teclado fazia o cardápio
// aparecer por trás. Página cheia não precisa desse ajuste; o próprio
// scroll interno do formulário já resolve.

function openAiChat(){
  hideAiTooltip();
  lockBodyScroll();
  aiModal.style.pointerEvents = "auto";
  gsap.to(aiModal, { opacity:1, y:0, duration:.4, ease:"back.out(1.6)" });

  if(!AI_STARTED){
    AI_STARTED = true;
    if(CART.length > 0 && !IS_DEMO){
      setTimeout(sendAiAutoSuggestion, 350);
    }else{
      setTimeout(() => appendChatMessage("assistant", "Oi! Me conta o que você tá com vontade de comer que eu já sugiro algo do cardápio 🍽️"), 300);
    }
  }
  setTimeout(() => aiInputEl.focus(), 450);
}
function closeAiChat(){
  gsap.to(aiModal, { opacity:0, y:30, duration:.3, onComplete:() => aiModal.style.pointerEvents = "none" });
  unlockBodyScroll();
}
document.getElementById("aiModalClose").onclick = closeAiChat;
document.getElementById("aiTooltipClose").onclick = hideAiTooltip;

/* ============================================================
   BOLINHA ARRASTÁVEL — a pessoa pode arrastar só verticalmente
   e de um lado pro outro (esquerda/direita); ao soltar, ela gruda
   ("ímã") na borda mais próxima. Não dá pra deixar solta no meio.
   ============================================================ */
(function setupDraggableBubble(){
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0, startTop = 0;

  function clampTop(top){
    return Math.min(Math.max(top, 80), window.innerHeight - 90);
  }

  function restorePosition(){
    try{
      const saved = JSON.parse(localStorage.getItem(AI_BUBBLE_POS_KEY) || "null");
      if(!saved) return;
      aiBubble.style.transform = "none";
      aiBubble.style.top = clampTop(saved.top) + "px";
      if(saved.side === "left"){ aiBubble.style.left = "10px"; aiBubble.style.right = "auto"; }
      else{ aiBubble.style.right = "10px"; aiBubble.style.left = "auto"; }
    }catch{}
  }

  function savePosition(){
    const rect = aiBubble.getBoundingClientRect();
    const side = rect.left + rect.width/2 > window.innerWidth/2 ? "right" : "left";
    localStorage.setItem(AI_BUBBLE_POS_KEY, JSON.stringify({ top:rect.top, side }));
  }

  aiBubble.addEventListener("pointerdown", e => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startTop = aiBubble.getBoundingClientRect().top;
    aiBubble.setPointerCapture(e.pointerId);
    aiBubble.classList.add("dragging");
  });

  aiBubble.addEventListener("pointermove", e => {
    if(!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if(Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    if(!moved) return;

    aiBubble.style.transform = "none";
    aiBubble.style.top = clampTop(startTop + dy) + "px";
    const left = Math.min(Math.max(e.clientX - 21, 4), window.innerWidth - 46);
    aiBubble.style.left = left + "px";
    aiBubble.style.right = "auto";
  });

  function endDrag(){
    if(!dragging) return;
    dragging = false;
    aiBubble.classList.remove("dragging");
    if(moved){
      const rect = aiBubble.getBoundingClientRect();
      const goRight = rect.left + rect.width/2 > window.innerWidth/2;
      aiBubble.style.left = "auto";
      aiBubble.style.right = goRight ? "10px" : "auto";
      if(!goRight){ aiBubble.style.left = "10px"; }
      savePosition();
    }
  }
  aiBubble.addEventListener("pointerup", endDrag);
  aiBubble.addEventListener("pointercancel", endDrag);

  aiBubble.addEventListener("click", e => {
    if(moved){ e.preventDefault(); e.stopPropagation(); moved = false; return; }
    openAiChat();
  });

  restorePosition();
})();
