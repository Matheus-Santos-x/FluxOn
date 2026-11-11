/* Agrupa por categoria respeitando a ordem salva pelo admin em
   categorias_ordem (mesma lógica do cardápio de mesa) — se não
   tiver ordem salva, usa a ordem de aparição dos itens */
function groupByCategory(items){
  const groups = {};
  const order = [];
  const ativos = items.filter(i => i.ativo !== false);

  if(RESTAURANT_CATEGORIAS.length > 0){
    RESTAURANT_CATEGORIAS.forEach(c => {
      const nome = c.nome || c;
      const itens = ativos.filter(i => (i.categoria || "Geral") === nome);
      if(itens.length > 0){ groups[nome] = itens; order.push(nome); }
    });
    // inclui categorias que existem no cardápio mas não estão na ordem salva
    ativos.forEach(item => {
      const cat = item.categoria || "Geral";
      if(!groups[cat]){ groups[cat] = []; order.push(cat); }
      if(!groups[cat].includes(item)) groups[cat].push(item);
    });
  }else{
    ativos.forEach(item => {
      const cat = item.categoria || "Geral";
      if(!groups[cat]){ groups[cat] = []; order.push(cat); }
      groups[cat].push(item);
    });
  }

  order.forEach(cat => groups[cat].sort((a,b) => (a.ordem||0) - (b.ordem||0)));
  return { groups, order };
}

/* ---------- dois sabores (opção "texto livre" do cadastro) ---------- */
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// sabores possíveis: itens da mesma categoria (com o filtro da opção, ex.: "grande")
function saboresDoItem(item, op){
  const f = semAcento(op.filtro);
  return MENU.filter(i => String(i.id) !== String(item.id) && i.ativo !== false && i.categoria === item.categoria
    && (!f || semAcento(i.nome).includes(f) || (Array.isArray(i.opcoes) && i.opcoes.some(v => semAcento(v.nome).includes(f)))));
}
// preço de um sabor no tamanho da opção (sem filtro, o preço do item)
function precoDoSabor(nome, op){
  const it = MENU.find(i => i.nome === nome);
  if(!it) return 0;
  const f = semAcento(op.filtro);
  if(f && Array.isArray(it.opcoes)){
    const v = it.opcoes.find(v => semAcento(v.nome).includes(f));
    if(v) return parseFloat(v.preco) || 0;
  }
  return parseFloat(it.preco) || 0;
}
// menor preço possível do item (o "A partir de" do card)
function precoMinimo(item){
  const ops = Array.isArray(item.opcoes) ? item.opcoes : [];
  if(!ops.length) return parseFloat(item.preco || 0);
  const vals = ops.map(op => {
    if(op.texto_livre && !(parseFloat(op.preco) > 0)){
      const ps = saboresDoItem(item, op).map(s => precoDoSabor(s.nome, op)).filter(v => v > 0).sort((a, b) => a - b);
      return ps[1] ?? ps[0] ?? 0; // 2 sabores: o mais barato possível é o 2º mais barato
    }
    return parseFloat(op.preco || 0);
  }).filter(v => v > 0);
  return vals.length ? Math.min(...vals) : parseFloat(item.preco || 0);
}

function renderMenu(){
  const { groups, order } = groupByCategory(MENU);
  const catNav = document.getElementById("catNavScroll");
  const main = document.getElementById("menuMain");
  catNav.innerHTML = "";
  main.innerHTML = "";
   
  // categorias com foto: se pelo menos uma tiver foto, a barra vira "bolinhas com foto + nome embaixo"
  const fotosCat = new Map(RESTAURANT_CATEGORIAS.filter(c => c && c.foto_url).map(c => [String(c.nome).trim().toLowerCase(), c.foto_url]));
  const comFotos = order.some(c => fotosCat.has(String(c).trim().toLowerCase()));
  document.getElementById("catNav").classList.toggle("com-fotos", comFotos);

  if(order.length === 0){
    main.innerHTML = `<div class="empty-state">Nenhum item disponível no momento.</div>`;
    return;
  }

  order.forEach((cat, idx) => {
    const items = groups[cat];

    const pill = document.createElement("button");
    pill.className = "cat-pill" + (idx === 0 ? " active" : "");
    if(comFotos){
      const foto = fotosCat.get(String(cat).trim().toLowerCase());
      pill.innerHTML = `<span class="cat-foto">${foto ? `<img src="${escHtml(foto)}" alt="" loading="lazy">` : `<b>${escHtml(String(cat).trim().charAt(0).toUpperCase())}</b>`}</span><span class="cat-nome">${escHtml(cat)}</span>`;
      pill.title = cat;
    }else{
      pill.textContent = cat;
    }
    pill.dataset.cat = slug(cat);
    pill.onclick = () => {
      document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      document.getElementById("sec-" + slug(cat)).scrollIntoView({ behavior:"smooth", block:"start" });
    };
    catNav.appendChild(pill);

    const section = document.createElement("section");
    section.className = "cat-section";
    section.id = "sec-" + slug(cat);
    section.innerHTML = `
      <div class="cat-heading">
        <h2>${escHtml(cat)}</h2>
        <span class="count">${items.length} ${items.length === 1 ? "item" : "itens"}</span>
      </div>
      <div class="item-grid">
        ${items.map(item => {
          const temVariacao = Array.isArray(item.opcoes) && item.opcoes.length > 0;
         const precoExibido = precoMinimo(item);
          const fotoUrl = getPrimeiraFoto(item);
          return `
          <div class="item-card" data-id="${item.id}">
            <div class="item-thumb">${fotoUrl ? `<img src="${fotoUrl}" alt="${escHtml(item.nome)}" loading="lazy">` : "🍽️"}</div>
            <div class="item-info">
              <h3>${escHtml(item.nome)}</h3>
              <p>${escHtml(item.descricao || "")}</p>
              <div class="item-bottom">
                <span class="item-price">${temVariacao ? "A partir de " : ""}${money(precoExibido)}</span>
                ${temVariacao
                  ? `<button class="add-btn" data-variation="${item.id}">+</button>`
                  : `<button class="add-btn" data-add="${item.id}">+</button>`}
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
    `;
    main.appendChild(section);
  });

  // reveal animation for cards
  gsap.registerPlugin(ScrollTrigger);
  document.querySelectorAll(".item-card").forEach((card, i) => {
    ScrollTrigger.batch(card, {
      start: "top 92%",
      onEnter: batch => gsap.to(batch, {
        opacity:1, y:0, duration:.5, ease:"power2.out", stagger:.06
      })
    });
  });
  // fallback: reveal first section immediately (above the fold)
  gsap.to(document.querySelectorAll(".cat-section:first-of-type .item-card"), {
    opacity:1, y:0, duration:.55, ease:"power2.out", stagger:.08, delay:.1
  });

  document.querySelectorAll(".item-card").forEach(card => {
    card.addEventListener("click", () => openItemDetail(card.dataset.id));
  });
  document.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); addToCart(btn.dataset.add, e); });
  });
  document.querySelectorAll("[data-variation]").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openItemDetail(btn.dataset.variation); });
  });

  setupScrollSpy();
   
  // a altura da barra muda (com foto, presa no topo...): as seções param logo abaixo dela
  const navEl = document.getElementById("catNav");
  const medir = () => document.documentElement.style.setProperty("--nav-h", navEl.offsetHeight + "px");
  medir();
  if(window.ResizeObserver && !window._navObs){ window._navObs = new ResizeObserver(medir); window._navObs.observe(navEl); }
}

/* ============================================================
   SCROLL-SPY — enquanto a pessoa rola a página, a categoria
   correspondente acende sozinha na barra de navegação (e a barra
   acompanha horizontalmente pra manter o pill ativo visível)
   ============================================================ */
function scrollPillIntoView(pill){
  const nav = document.getElementById("catNavScroll");
  const navRect = nav.getBoundingClientRect();
  const pillRect = pill.getBoundingClientRect();
  const delta = (pillRect.left - navRect.left) - (navRect.width / 2) + (pillRect.width / 2);
  nav.scrollBy({ left: delta, behavior: "smooth" });
}

function setupScrollSpy(){
  const sections = document.querySelectorAll(".cat-section");
  if(sections.length === 0) return;
  const nav = document.getElementById("catNav");
  const navHeight = nav.offsetHeight || 56;

  if(window._catObserver) window._catObserver.disconnect();

  window._catObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      const cat = entry.target.id.replace("sec-", "");
      const pill = catNavPillFor(cat);
      if(!pill || pill.classList.contains("active")) return;

      document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      scrollPillIntoView(pill);
    });
  }, {
    root: null,
    rootMargin: `-${navHeight + 8}px 0px -65% 0px`,
    threshold: 0
  });

  sections.forEach(s => window._catObserver.observe(s));
}

function catNavPillFor(catSlug){
  return document.querySelector(`.cat-pill[data-cat="${catSlug}"]`);
}

function slug(s){ return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-"); }

/* ============================================================
   BESTSELLERS ("mais pedidos") — tenta usar dados reais de
   vendas (top-products), cai pro início do cardápio se não der
   ============================================================ */
function normStr(s){
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}

async function loadBestsellers(){
  let picks = [];
  if(!IS_DEMO){
    try{
      const res = await fetch(`${CONFIG.API_BASE}/api/v1/metrics/${RESTAURANT_ID}/top-products`);
      if(res.ok){
        const top = await res.json(); // [{ nome, qty }]
        picks = top
          .map(t => MENU.find(m => {
            const a = normStr(m.nome), b = normStr(t.nome);
            return a.includes(b) || b.includes(a);
          }))
          .filter(Boolean);
      }
    }catch(err){
      console.warn("Não foi possível carregar 'mais pedidos', usando fallback.", err);
    }
  }
  if(picks.length === 0){
    picks = MENU.filter(i => i.ativo !== false).slice(0, 4);
  }
  return picks.slice(0, 6);
}

function renderBestsellers(items){
  if(!items || items.length === 0) return;
  const section = document.getElementById("bestsellersSection");
  const scroll = document.getElementById("bsScroll");
  section.style.display = "block";

  scroll.innerHTML = items.map((item, i) => {
    const temVariacao = Array.isArray(item.opcoes) && item.opcoes.length > 0;
    const preco = precoMinimo(item);
    const foto = getPrimeiraFoto(item);
    return `
    <div class="bs-card" data-id="${item.id}">
      <div class="bs-thumb">
        <div class="bs-rank">${i+1}</div>
        ${foto ? `<img src="${foto}" alt="${escHtml(item.nome)}" loading="lazy">` : "🍽️"}
        <button class="bs-add" data-${temVariacao ? "variation" : "add"}="${item.id}" aria-label="Adicionar ${escHtml(item.nome)}">+</button>
      </div>
      <div class="bs-info">
        <h4>${escHtml(item.nome)}</h4>
        <span class="bs-price">${temVariacao ? "A partir de " : ""}${money(preco)}</span>
      </div>
    </div>
  `;
  }).join("");

  gsap.to(scroll.querySelectorAll(".bs-card"), {
    opacity:1, y:0, duration:.5, stagger:.07, ease:"power2.out", delay:.2
  });

  scroll.querySelectorAll(".bs-card").forEach(card => {
    card.addEventListener("click", () => openItemDetail(card.dataset.id));
  });
  scroll.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); addToCart(btn.dataset.add, e); });
  });
  scroll.querySelectorAll("[data-variation]").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openItemDetail(btn.dataset.variation); });
  });
}

/* ============================================================
   CART LOGIC
   ============================================================ */
/* ============================================================
   DETALHE DO ITEM — clicar em qualquer item do cardápio abre um
   popup com zoom na foto, nome, descrição e (se tiver) as opções
   de variação, igual o cardápio de mesa.
   ============================================================ */
function openItemDetail(itemId){
  const item = MENU.find(i => String(i.id) === String(itemId));
  if(!item) return;

  document.getElementById("itemDetailModal")?.remove();

  const fotos = getFotos(item);
  const opcoes = Array.isArray(item.opcoes) ? item.opcoes : [];
  const temVariacao = opcoes.length > 0;
  let selectedIdx = 0;
  let fotoIdx = 0;

  const wrap = document.createElement("div");
  wrap.id = "itemDetailModal";
  wrap.className = "detail-backdrop";
  wrap.innerHTML = `
    <div class="detail-panel">
      <div class="detail-photo-wrap${fotos.length === 0 ? " detail-photo-empty" : ""}">
        ${fotos.length > 0 ? `
          <div class="detail-photo-track" id="detailPhotoTrack">
            ${fotos.map(url => `<img src="${url}" alt="${escHtml(item.nome)}">`).join("")}
          </div>
          ${fotos.length > 1 ? `
          <button class="detail-photo-nav prev" id="detailPhotoPrev" aria-label="Foto anterior">‹</button>
          <button class="detail-photo-nav next" id="detailPhotoNext" aria-label="Próxima foto">›</button>
          <div class="detail-photo-dots" id="detailPhotoDots">
            ${fotos.map((_, i) => `<span class="detail-dot${i === 0 ? " active" : ""}" data-idx="${i}"></span>`).join("")}
          </div>` : ""}
        ` : `<span>🍽️</span>`}
        <button class="detail-close" id="detailCloseBtn" aria-label="Fechar">✕</button>
      </div>
      <div class="detail-body">
        <h2>${escHtml(item.nome)}</h2>
        <div class="detail-cat">${escHtml(item.categoria || "Geral")}</div>
        ${item.descricao ? `<p class="detail-desc">${escHtml(item.descricao)}</p>` : ""}
        ${temVariacao ? `
        <div class="variation-options" id="detailVariationOptions">
          ${opcoes.map((op, i) => `
            <button class="variation-opt${i === 0 ? " selected" : ""}" data-idx="${i}">
              <span>${escHtml(op.nome)}</span>
              <span class="variation-opt-price">${op.texto_livre && !(parseFloat(op.preco) > 0) ? "2 sabores" : money(parseFloat(op.preco || 0))}</span>
            </button>
                    `).join("")}
        </div>` : ""}
        ${opcoes.some(op => op.texto_livre) ? `
        <div class="sabores-box" id="detailSabores" hidden>
          <div class="sabores-titulo">Escolha 2 sabores <span id="saboresCont">0/2</span></div>
          <div class="sabores-lista" id="saboresLista"></div>
        </div>` : ""}
        <div class="detail-footer">
          <span class="detail-price" id="detailPrice">${money(temVariacao ? parseFloat(opcoes[0].preco || 0) : parseFloat(item.preco || 0))}</span>
          <button class="checkout-btn" id="detailAddBtn">Adicionar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // navegação de fotos (se tiver mais de uma)
  function irParaFoto(i){
    fotoIdx = i;
    const track = document.getElementById("detailPhotoTrack");
    if(track) track.style.transform = `translateX(-${i * 100}%)`;
    document.querySelectorAll(".detail-dot").forEach((d, idx) => d.classList.toggle("active", idx === i));
  }
  document.getElementById("detailPhotoNext")?.addEventListener("click", () => irParaFoto((fotoIdx + 1) % fotos.length));
  document.getElementById("detailPhotoPrev")?.addEventListener("click", () => irParaFoto((fotoIdx - 1 + fotos.length) % fotos.length));
  document.querySelectorAll(".detail-dot").forEach(dot => {
    dot.addEventListener("click", () => irParaFoto(Number(dot.dataset.idx)));
  });

  // dois sabores: a opção marcada como "texto livre" pede 2 itens da mesma categoria
  let sabores = [];
  const precoAtual = () => {
    const op = opcoes[selectedIdx];
    if(!op) return parseFloat(item.preco || 0);
    if(op.texto_livre && !(parseFloat(op.preco) > 0))
      return sabores.length ? Math.max(...sabores.map(n => precoDoSabor(n, op))) : 0;
    return parseFloat(op.preco || 0);
  };
  const atualizarPreco = () => { const v = precoAtual(); document.getElementById("detailPrice").textContent = v > 0 ? money(v) : "R$ —"; };
  function montarSabores(){
    const box = document.getElementById("detailSabores");
    if(!box) return;
    const op = opcoes[selectedIdx];
    sabores = [];
    box.hidden = !op?.texto_livre;
    if(!op?.texto_livre) return;
    const lista = saboresDoItem(item, op);
    const mostraPreco = !(parseFloat(op.preco) > 0);
    document.getElementById("saboresLista").innerHTML = lista.length
      ? lista.map(s => `
        <button type="button" class="sabor-opt" data-sabor="${escHtml(s.nome)}">
          <span class="sabor-check"></span>
          <span class="sabor-nome">${escHtml(s.nome)}</span>
          ${mostraPreco ? `<span class="variation-opt-price">${money(precoDoSabor(s.nome, op))}</span>` : ""}
        </button>`).join("")
      : `<div class="sabores-vazio">Nenhum sabor disponível no momento.</div>`;
    document.getElementById("saboresCont").textContent = "0/2";
    box.querySelectorAll(".sabor-opt").forEach(b => b.onclick = () => {
      const nome = b.dataset.sabor;
      if(sabores.includes(nome)) sabores = sabores.filter(n => n !== nome);
      else if(sabores.length < 2) sabores.push(nome);
      else { shake("detailSabores"); return; }
      box.querySelectorAll(".sabor-opt").forEach(x => x.classList.toggle("on", sabores.includes(x.dataset.sabor)));
      document.getElementById("saboresCont").textContent = `${sabores.length}/2`;
      box.classList.remove("erro");
      atualizarPreco();
    });
  }

  // seleção de variação (se tiver)
  wrap.querySelectorAll(".variation-opt").forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll(".variation-opt").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedIdx = Number(btn.dataset.idx);
      montarSabores();
      atualizarPreco();
    };
  });
  montarSabores();
  atualizarPreco();

  document.getElementById("detailCloseBtn").onclick = () => closeItemDetail(wrap);
  wrap.addEventListener("click", e => { if(e.target === wrap) closeItemDetail(wrap); });

  document.getElementById("detailAddBtn").onclick = (e) => {
        if(temVariacao){
      const op = opcoes[selectedIdx];
      if(op.texto_livre && sabores.length !== 2){
        const box = document.getElementById("detailSabores");
        box.classList.add("erro"); shake("detailSabores");
        box.scrollIntoView({ behavior:"smooth", block:"center" });
        return;
      }
      addVariationToCart(item, op, op.texto_livre ? sabores : null, precoAtual());
    }else{
      const existing = CART.find(c => String(c.id) === String(item.id));
      if(existing){ existing.qty++; }
      else{ CART.push({ id:item.id, nome:item.nome, preco:parseFloat(item.preco || 0), qty:1 }); }
      updateCartUI();
    }
    flyToCart(e.currentTarget);
    wrap.dataset.adicionado = "1";
    closeItemDetail(wrap);
  };

  gsap.fromTo(wrap, { opacity:0 }, { opacity:1, duration:.25 });
  gsap.fromTo(wrap.querySelector(".detail-panel"), { scale:.9, opacity:0 }, { scale:1, opacity:1, duration:.35, ease:"back.out(1.4)" });
}

function closeItemDetail(wrap){
  gsap.to(wrap.querySelector(".detail-panel"), { scale:.92, opacity:0, duration:.22, ease:"power2.in" });
  gsap.to(wrap, { opacity:0, duration:.25, onComplete: () => wrap.remove() });
  // veio de uma sugestão da IA: volta pro chat (e marca o botão se adicionou)
  if(window._voltarChat){
    const b = window._voltarChat; window._voltarChat = null;
    setTimeout(() => {
      openAiChat();
      if(wrap.dataset.adicionado){ b.disabled = true; b.innerHTML = `<span>✓ Adicionado ao carrinho</span>`; }
    }, 300);
  }
}

function addVariationToCart(item, opcao, sabores, preco){
  const doisSabores = Array.isArray(sabores) && sabores.length === 2;
  const cartId = `${item.id}__${opcao.nome}` + (doisSabores ? `__${[...sabores].sort().join("+")}` : "");
  // mesmo nome do cardápio da mesa: "Pizza dois sabores Grande — Calabresa + Mussarela"
  const nomeCompleto = doisSabores
    ? `${item.nome}${item.nome.toLowerCase().includes(String(opcao.nome).toLowerCase()) ? "" : " " + opcao.nome} — ${sabores.join(" + ")}`
    : `${item.nome} — ${opcao.nome}`;
  const existing = CART.find(c => c.id === cartId);
  if(existing){ existing.qty++; }
  else{ CART.push({ id:cartId, nome:nomeCompleto, preco: preco ?? parseFloat(opcao.preco || 0), qty:1 }); }
  updateCartUI();
}

function addToCart(id, evt){
  const item = MENU.find(i => String(i.id) === String(id));
  if(!item) return;
  const existing = CART.find(c => String(c.id) === String(id));
  if(existing){ existing.qty++; }
  else{ CART.push({ id:item.id, nome:item.nome, preco:parseFloat(item.preco||0), qty:1 }); }

  updateCartUI();
  flyToCart(evt.currentTarget);
  gsap.fromTo(evt.currentTarget, { scale:1 }, { scale:1.25, duration:.12, yoyo:true, repeat:1, ease:"power1.inOut" });
}

function changeQty(id, delta){
  const it = CART.find(c => String(c.id) === String(id));
  if(!it) return;
  it.qty += delta;
  if(it.qty <= 0) CART = CART.filter(c => String(c.id) !== String(id));
  updateCartUI();
}

function cartTotal(){
  return CART.reduce((s,c) => s + c.preco * c.qty, 0);
}
function cartCount(){
  return CART.reduce((s,c) => s + c.qty, 0);
}

// taxa de entrega (por enquanto um valor fixo da config; quem cobra de verdade é o servidor)
function taxaEntrega(){
  return Math.max(0, Number(RESTAURANT_CONFIG.taxa_entrega) || 0);
}
function atualizarTotalCheckout(){
  const t = taxaEntrega();
  document.getElementById("sheetTotal").textContent = money(cartTotal() + t);
  const info = document.getElementById("sheetTaxaInfo");
  if(info){
    info.style.display = t > 0 ? "block" : "none";
    info.textContent = t > 0 ? `Inclui taxa de entrega de ${money(t)}` : "";
  }
}

// item simples que já está no carrinho: o "+" do card vira "− 2 +" (item com tamanho/sabores continua abrindo o popup)
function atualizarContadoresDosCards(){
  document.querySelectorAll(".item-card .item-bottom").forEach(box => {
    const add = box.querySelector("[data-add]");
    if(!add) return;
    const id = add.dataset.add;
    const qtd = (CART.find(c => String(c.id) === String(id)) || {}).qty || 0;
    let ctr = box.querySelector(".card-qty");
    if(qtd > 0){
      add.hidden = true;
      if(!ctr){
        ctr = document.createElement("div");
        ctr.className = "card-qty";
        ctr.innerHTML = `<button type="button" data-card-menos aria-label="Diminuir"></button><span></span><button type="button" data-card-mais aria-label="Aumentar">+</button>`;
        box.appendChild(ctr);
        ctr.addEventListener("click", e => e.stopPropagation()); // não abre o popup do item
        ctr.querySelector("[data-card-menos]").onclick = () => changeQty(id, -1);
        ctr.querySelector("[data-card-mais]").onclick = (e) => addToCart(id, e);
      }
      ctr.querySelector("span").textContent = qtd;
      ctr.querySelector("[data-card-menos]").textContent = qtd === 1 ? "×" : "−";
    }else{
      ctr?.remove();
      add.hidden = false;
    }
  });
}

function updateCartUI(){
  const count = cartCount();
  const total = cartTotal();
  atualizarContadoresDosCards();

  document.getElementById("cartBadge").textContent = count;
  document.getElementById("cartFabTotal").textContent = money(total);
  document.getElementById("drawerTotal").textContent = money(total);
  atualizarTotalCheckout();

  const fab = document.getElementById("cartFab");
  if(count > 0) fab.classList.add("visible");
  else fab.classList.remove("visible");

  const body = document.getElementById("drawerBody");
  if(CART.length === 0){
    body.innerHTML = `<div class="drawer-empty">SEU CARRINHO ESTÁ VAZIO<br>— adicione itens do cardápio —</div>`;
    document.getElementById("goCheckoutBtn").disabled = true;
  }else{
    body.innerHTML = CART.map(c => `
      <div class="receipt-item">
        <div class="ri-name">${c.nome}</div>
        <div class="qty-ctrl">
          <button class="qty-btn" data-qty-minus="${c.id}" aria-label="Diminuir">${c.qty === 1 ? "×" : "−"}</button>
          <span class="qty-num">${c.qty}</span>
          <button class="qty-btn" data-qty-plus="${c.id}" aria-label="Aumentar">+</button>
        </div>
        <span class="ri-price">${money(c.preco * c.qty)}</span>
      </div>
    `).join("");
    document.getElementById("goCheckoutBtn").disabled = false;

    gsap.fromTo(body.querySelectorAll(".receipt-item"),
      { opacity:0, x:-8 },
      { opacity:1, x:0, duration:.35, stagger:.04, ease:"power2.out" }
    );

    body.querySelectorAll("[data-qty-minus]").forEach(b => b.onclick = () => changeQty(b.dataset.qtyMinus, -1));
    body.querySelectorAll("[data-qty-plus]").forEach(b => b.onclick = () => changeQty(b.dataset.qtyPlus, 1));
  }
}

function flyToCart(btn){
  const rect = btn.getBoundingClientRect();
  const cartRect = document.getElementById("cartBadge").getBoundingClientRect();
  const dot = document.createElement("div");
  dot.className = "fly-dot";
  dot.style.left = rect.left + rect.width/2 + "px";
  dot.style.top = rect.top + rect.height/2 + "px";
  document.body.appendChild(dot);

  gsap.timeline({ onComplete:() => dot.remove() })
    .to(dot, { duration:.5, left:cartRect.left+cartRect.width/2, top:cartRect.top+cartRect.height/2, ease:"power2.in", scale:.4 })
    .to(dot, { duration:.1, scale:0, opacity:0 });
}

/* ============================================================
   DRAWER / SHEET OPEN-CLOSE
   ============================================================ */
const overlay = document.getElementById("overlay");
const drawer = document.getElementById("drawer");
const sheet = document.getElementById("checkoutSheet");

function openOverlay(){
  overlay.classList.add("open");
  gsap.to(overlay, { opacity:1, duration:.25 });
}
function closeOverlay(){
  gsap.to(overlay, { opacity:0, duration:.25, onComplete:() => overlay.classList.remove("open") });
}

function openDrawer(){
  openOverlay();
  gsap.to(drawer, { y:0, duration:.45, ease:"power3.out" });
  iaNoCarrinho(); // balãozinho "vi que você não adicionou bebida..." (uma vez por visita)
  document.getElementById("receiptDate").textContent = new Date().toLocaleDateString("pt-BR");
}
function closeDrawer(){
  gsap.to(drawer, { y:"110%", duration:.35, ease:"power2.in", onComplete: closeOverlay });
}

function openSheet(){
  openOverlay();
  lockBodyScroll();
  gsap.set(sheet, { y:0 });
  gsap.from(sheet, { y:"100%", duration:.5, ease:"power3.out" });
}
function closeSheet(){
  gsap.to(sheet, { y:"100%", duration:.4, ease:"power2.in", onComplete: closeOverlay });
  unlockBodyScroll();
}

document.getElementById("cartFab").onclick = openDrawer;
document.getElementById("drawerClose").onclick = closeDrawer;
document.getElementById("drawerHandle").onclick = closeDrawer;
overlay.onclick = () => {
  gsap.to(drawer, { y:"110%", duration:.35 });
  gsap.to(sheet, { y:"100%", duration:.35 });
  closeOverlay();
};

document.getElementById("goCheckoutBtn").onclick = () => {
  closeDrawer();
  setTimeout(openSheet, 200);
};

/* ============================================================
   FECHAR O CHECKOUT (botão ✕ no topo)
   Os dados já preenchidos ficam salvos (rascunho já foi pro banco
   desde a etapa 1) — fechar não perde nada.
   ============================================================ */
document.getElementById("sheetCloseBtn").onclick = () => closeSheet();

/* ============================================================
   PAYMENT SELECT (+ pergunta de troco quando é Dinheiro)
   ============================================================ */
let TROCO_NECESSARIO = null; // null = ainda não respondeu | true | false

const trocoBox = document.getElementById("trocoBox");
const trocoValorField = document.getElementById("trocoValorField");

document.querySelectorAll(".pay-opt").forEach(opt => {
  opt.onclick = () => {
    document.querySelectorAll(".pay-opt").forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    SELECTED_PAY = opt.dataset.pay;

    if(SELECTED_PAY === "Dinheiro"){
      trocoBox.style.display = "block";
      gsap.to(trocoBox, { opacity:1, y:0, duration:.3, ease:"power2.out" });
    }else{
      gsap.to(trocoBox, { opacity:0, y:-6, duration:.2, onComplete:() => trocoBox.style.display = "none" });
      TROCO_NECESSARIO = null;
      document.getElementById("inpTrocoValor").value = "";
      document.querySelectorAll(".troco-opt").forEach(b => b.classList.remove("selected"));
      trocoValorField.style.display = "none";
    }
  };
});

document.querySelectorAll(".troco-opt").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".troco-opt").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    TROCO_NECESSARIO = btn.dataset.troco === "sim";
    trocoValorField.style.display = TROCO_NECESSARIO ? "block" : "none";
    if(!TROCO_NECESSARIO) document.getElementById("inpTrocoValor").value = "";
  };
});

/* ============================================================
   SUBMIT ORDER
   ============================================================ */
let CURRENT_ORDER_ID = null;
let CHECKOUT_STEP = 1;

function showStep(step){
  document.querySelectorAll(".checkout-step").forEach(el => el.style.display = "none");
  const el = document.getElementById("step" + step);
  el.style.display = "block";
  gsap.fromTo(el, { opacity:0, x:14 }, { opacity:1, x:0, duration:.35, ease:"power2.out" });

  document.querySelectorAll(".step-dot").forEach(d => {
    d.classList.toggle("active", Number(d.dataset.step) <= step);
  });
  document.getElementById("sheetBackBtn").style.visibility = step === 1 ? "hidden" : "visible";
  CHECKOUT_STEP = step;
}

document.getElementById("sheetBackBtn").onclick = () => {
  if(CHECKOUT_STEP > 1) showStep(CHECKOUT_STEP - 1);
};

function getFieldValues(){
  return {
    nome: document.getElementById("inpNome").value.trim(),
    telefone: document.getElementById("inpTelefone").value.trim(),
    obs: document.getElementById("inpObs").value.trim(),
    rua: document.getElementById("inpRua").value.trim(),
    numero: document.getElementById("inpNumero").value.trim(),
    bairro: document.getElementById("inpBairro").value.trim(),
    complemento: document.getElementById("inpComplemento").value.trim(),
    referencia: document.getElementById("inpReferencia").value.trim(),
  };
}

function buildEndereco(v){
  const cidade = CEP_INFO ? ` - ${CEP_INFO.cidade}/${CEP_INFO.uf} - CEP ${CEP_INFO.cep}` : "";
  return `${v.rua}, ${v.numero}${v.complemento ? " - " + v.complemento : ""} - ${v.bairro}${cidade}${v.referencia ? " (Ref: " + v.referencia + ")" : ""}`;
}

/* CEP: digitou os 8 números → busca rua, bairro e cidade e deixa só o número pra pessoa preencher */
let CEP_INFO = null;
(function(){
  const inp = document.getElementById("inpCep"), info = document.getElementById("cepInfo");
  if(!inp) return;
  let ultimo = "";
  inp.addEventListener("input", async () => {
    const d = inp.value.replace(/\D/g, "").slice(0, 8);
    inp.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
    if(d.length < 8){ CEP_INFO = null; info.textContent = ""; info.className = "cep-info"; ultimo = ""; return; }
    if(d === ultimo) return;
    ultimo = d;
    info.className = "cep-info"; info.textContent = "Buscando endereço...";
    try{
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if(d !== ultimo) return;               // digitou outro CEP enquanto buscava
      if(!r.ok || j.erro) throw new Error("nao achou");
      CEP_INFO = { cep: inp.value, cidade: j.localidade || "", uf: j.uf || "" };
      if(j.logradouro) document.getElementById("inpRua").value = j.logradouro;
      if(j.bairro) document.getElementById("inpBairro").value = j.bairro;
      info.className = "cep-info ok";
      info.textContent = `📍 ${[j.bairro, j.localidade && j.localidade + "/" + j.uf].filter(Boolean).join(" · ")}`;
      const alvo = j.logradouro ? "inpNumero" : "inpRua"; // CEP de cidade inteira não traz a rua
      setTimeout(() => document.getElementById(alvo).focus(), 50);
    }catch(e){
      if(d !== ultimo) return;
      CEP_INFO = null;
      info.className = "cep-info erro";
      info.textContent = "Não achamos esse CEP. Preencha o endereço abaixo.";
    }
  });
})();

function basePayload(v, extra){
  return {
    restaurant_id: RESTAURANT_ID,
    client_name: v.nome,
    client_phone: v.telefone,
    // manda nos dois formatos (name/qty/price E nome/quantidade/preco)
    // porque é assim que o backend e a rota de impressão leem os itens
    itens: CART.map(c => ({
      name:c.nome, nome:c.nome,
      qty:c.qty, quantidade:c.qty,
      price:c.preco, preco:c.preco
    })),
    total_price: cartTotal(),
    origin: "cardapio_delivery",
    ...(CURRENT_ORDER_ID ? { order_id: CURRENT_ORDER_ID } : {}),
    ...extra
  };
}

/* STEP 1 → salva o lead na hora (nome + telefone), mesmo que ele
   desista depois — fica registrado como rascunho pra follow-up */
document.getElementById("step1NextBtn").onclick = async () => {
  const v = getFieldValues();
  if(!v.nome || !v.telefone){ shake("inpNome"); return alert("Preencha nome e telefone."); }

  const btn = document.getElementById("step1NextBtn");
  btn.disabled = true; btn.textContent = "Salvando...";
  try{
    const result = await submitOrder(basePayload(v, {
      notes: v.obs,
      status: "draft",
      service_type: "delivery"
    }));
     
    CURRENT_ORDER_ID = result.order?.id || CURRENT_ORDER_ID;
    showStep(2);
  }catch(err){
    console.error(err);
    alert(err.message && err.message !== "Falha ao enviar pedido" ? err.message : "Não foi possível salvar seus dados. Tente novamente.");
     
  }finally{
    btn.disabled = false; btn.textContent = "Continuar";
  }
};

/* STEP 2 → atualiza o mesmo pedido com o endereço */
document.getElementById("step2NextBtn").onclick = async () => {
  const v = getFieldValues();
  if(!v.rua || !v.numero || !v.bairro){ shake("inpRua"); return alert("Preencha o endereço completo."); }

  const btn = document.getElementById("step2NextBtn");
  btn.disabled = true; btn.textContent = "Salvando...";
  try{
    const result = await submitOrder(basePayload(v, {
      notes: v.obs,
      status: "draft",
      service_type: "delivery",
      address: buildEndereco(v)
    }));
    CURRENT_ORDER_ID = result.order?.id || CURRENT_ORDER_ID;
    atualizarTotalCheckout();
    showStep(3);
  }catch(err){
    console.error(err);
    alert(err.message && err.message !== "Falha ao enviar pedido" ? err.message : "Não foi possível salvar o endereço. Tente novamente.");
  }finally{
    btn.disabled = false; btn.textContent = "Continuar";
  }
};

/* STEP 3 → só forma de pagamento, confirma o pedido de vez */
document.getElementById("submitOrderBtn").onclick = async () => {
  const v = getFieldValues();
  if(!SELECTED_PAY){ return alert("Escolha a forma de pagamento."); }
  if(CART.length === 0){ return alert("Seu carrinho está vazio."); }
  const minimo = parseFloat(RESTAURANT_CONFIG.pedido_minimo || 0);
  if(minimo > 0 && cartTotal() < minimo){ return alert(`O pedido mínimo é de ${money(minimo)}.`); }

  if(SELECTED_PAY === "PixOnline"){ return iniciarPix(v); }

  let paymentMethodFinal = SELECTED_PAY;
  if(SELECTED_PAY === "Dinheiro"){
    if(TROCO_NECESSARIO === null){ return alert("Diz pra gente se você precisa de troco."); }
    if(TROCO_NECESSARIO){
      const valorTroco = document.getElementById("inpTrocoValor").value.trim();
      if(!valorTroco){ shake("inpTrocoValor"); return alert("Informa o valor pro troco."); }
      paymentMethodFinal = `Dinheiro (troco para R$ ${valorTroco})`;
    }else{
      paymentMethodFinal = "Dinheiro (sem troco)";
    }
  }

  const btn = document.getElementById("submitOrderBtn");
  btn.disabled = true; btn.textContent = "Enviando...";
  try{
    const result = await submitOrder(basePayload(v, {
      notes: v.obs,
      status: "pending",
      service_type: "delivery",
      address: buildEndereco(v),
      payment_method: paymentMethodFinal
    }));
    showSuccess(result);
  }catch(err){
    console.error(err);
    alert(err.message && err.message !== "Falha ao enviar pedido" ? err.message : "Não foi possível enviar seu pedido. Tente novamente.");
    btn.disabled = false; btn.textContent = "Confirmar pedido";
  }
};

/* ============================================================
   PIX ONLINE — o pedido só vai pra cozinha depois que o banco confirma
   ============================================================ */
let PIX_COBRANCA = null, PIX_TIMER = null, PIX_ORDER_NUMBER = null, PIX_TRACKING = null;

function pararPix(){ clearInterval(PIX_TIMER); PIX_TIMER = null; }

async function iniciarPix(v){
  const btn = document.getElementById("submitOrderBtn");
  btn.disabled = true; btn.textContent = "Gerando Pix...";
  try{
    // já existe um Pix válido deste pedido: só reabre a tela
    if(PIX_COBRANCA && new Date(PIX_COBRANCA.expira_em) > new Date()){ mostrarPix(); return; }
    PIX_COBRANCA = null;

    // grava a forma de pagamento no rascunho (o servidor recalcula o total)
    const result = await submitOrder(basePayload(v, {
      notes: v.obs,
      status: "draft",
      service_type: "delivery",
      address: buildEndereco(v),
      payment_method: "Pix"
    }));
    CURRENT_ORDER_ID = result.order?.id || CURRENT_ORDER_ID;
    PIX_ORDER_NUMBER = result.order?.order_number ?? null;
    PIX_TRACKING = result.tracking_link || null;

    const res = await fetch(`${CONFIG.API_BASE}/api/v1/pix/${RESTAURANT_ID}/cobrancas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "pedido", dados: { order_id: CURRENT_ORDER_ID }, nome: v.nome, telefone: v.telefone })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || "Não foi possível gerar o Pix. Tente de novo.");
    PIX_COBRANCA = data;
    mostrarPix();
  }catch(err){
    console.error(err);
    alert(err.message || "Não foi possível gerar o Pix.");
  }finally{
    btn.disabled = false; btn.textContent = "Confirmar pedido";
  }
}

function mostrarPix(){
  pararPix();
  const c = PIX_COBRANCA;
  document.getElementById("checkoutForm").style.display = "none";
  const sv = document.getElementById("successView");
  sv.style.display = "block";
  sv.innerHTML = `
    <div class="pix-box">
      <h2>Pague com Pix</h2>
      <div class="pix-valor">${money(Number(c.valor))}</div>
      ${c.pix_qr_base64 ? `<img class="pix-qr" src="data:image/png;base64,${c.pix_qr_base64}" alt="QR Code Pix">` : ""}
      <div class="pix-timer" id="pixTimer"></div>
      <div class="pix-code" id="pixCode">${escHtml(c.pix_copia_cola)}</div>
      <button class="checkout-btn" id="pixCopyBtn" style="margin-top:10px;">Copiar código Pix</button>
      <button class="checkout-btn" id="pixBackBtn" style="margin-top:8px; background:var(--surface); color:var(--text);">Voltar</button>
      <div class="pix-status" id="pixStatus">Aguardando o pagamento. Assim que você pagar, o pedido é confirmado sozinho.</div>
    </div>`;

  const timerEl = document.getElementById("pixTimer");
  const statusEl = document.getElementById("pixStatus");
  const copyBtn = document.getElementById("pixCopyBtn");

  copyBtn.onclick = async () => {
    try{ await navigator.clipboard.writeText(c.pix_copia_cola); }
    catch{
      const r = document.createRange(); r.selectNodeContents(document.getElementById("pixCode"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    copyBtn.textContent = "Código copiado ✓";
  };

  document.getElementById("pixBackBtn").onclick = () => {
    pararPix();
    document.getElementById("successView").style.display = "none";
    document.getElementById("checkoutForm").style.display = "block";
    showStep(3);
  };

  const expirou = () => {
    PIX_COBRANCA = null;
    timerEl.textContent = "";
    statusEl.textContent = "Este Pix expirou. Gere um novo para continuar.";
    copyBtn.textContent = "Gerar novo Pix";
    copyBtn.onclick = () => { document.getElementById("pixBackBtn").click(); iniciarPix(getFieldValues()); };
  };

  const fim = new Date(c.expira_em).getTime();
  let n = 0, consultando = false;
  const tick = async () => {
    const resta = Math.max(0, Math.floor((fim - Date.now()) / 1000));
    timerEl.textContent = resta > 0 ? `Expira em ${String(Math.floor(resta / 60)).padStart(2, "0")}:${String(resta % 60).padStart(2, "0")}` : "";
    if(resta <= 0){ pararPix(); expirou(); return; }
    if(n++ % 3 !== 0 || consultando) return; // pergunta ao servidor a cada 3 segundos
    consultando = true;
    try{
      const r = await fetch(`${CONFIG.API_BASE}/api/v1/pix/${RESTAURANT_ID}/cobrancas/${c.cobranca_id}/status`);
      const d = await r.json();
      if(d.status === "pago"){
        pararPix(); PIX_COBRANCA = null;
        showSuccess({ order: { order_number: PIX_ORDER_NUMBER }, tracking_link: PIX_TRACKING });
        return;
      }
      if(d.status === "expirado"){ pararPix(); expirou(); }
    }catch{ /* sem internet por um instante: tenta de novo no próximo ciclo */ }
    finally{ consultando = false; }
  };
  PIX_TIMER = setInterval(tick, 1000);
  tick();
}

function shake(id){
  gsap.fromTo("#"+id, { x:-6 }, { x:0, duration:.4, ease:"elastic.out(1,0.3)" });
}

function showSuccess(result){
  document.getElementById("checkoutForm").style.display = "none";
  const successView = document.getElementById("successView");
  successView.style.display = "block";
  const trackingLink = result.tracking_link || null;
  successView.innerHTML = `
    <div class="success-view">
      <div class="success-badge">✓</div>
      <h2>Pedido enviado!</h2>
      <p>Recebemos seu pedido e já vamos começar o preparo. Você pode acompanhar o status pelo número abaixo.</p>
      <div class="order-num">#${result.order?.order_number ?? "----"}</div>
      ${trackingLink ? `<a class="checkout-btn" href="${trackingLink}" target="_blank" rel="noopener" style="display:block; text-decoration:none; margin-bottom:10px;">Acompanhar meu pedido</a>` : ""}
      <button class="checkout-btn" id="closeSuccessBtn" ${trackingLink ? `style="background:var(--surface); color:var(--text);"` : ""}>Fechar</button>
    </div>
  `;
  document.getElementById("closeSuccessBtn").onclick = () => {
    CART = [];
    updateCartUI();
    closeSheet();
    setTimeout(() => {
      document.getElementById("checkoutForm").style.display = "block";
      successView.style.display = "none";
      document.getElementById("submitOrderBtn").disabled = false;
      document.getElementById("submitOrderBtn").textContent = "Confirmar pedido";
      document.querySelectorAll(".field input, .field textarea").forEach(f => f.value = "");
      document.querySelectorAll(".pay-opt").forEach(o => o.classList.remove("selected"));
      document.querySelectorAll(".troco-opt").forEach(o => o.classList.remove("selected"));
      document.getElementById("trocoBox").style.display = "none";
      document.getElementById("trocoValorField").style.display = "none";
      SELECTED_PAY = null;
      TROCO_NECESSARIO = null;
      CURRENT_ORDER_ID = null;   // próximo pedido começa do zero
      PIX_COBRANCA = null;
      pararPix();
      showStep(1);
    }, 400);
  };
}
