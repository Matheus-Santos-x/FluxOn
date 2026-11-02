/* ============================================================
   FIDELIDADE — aba "Fidelidade" dentro do próprio cardápio.

   Como o cliente entra: pelo link que o restaurante manda no
   WhatsApp (seudominio.com/?token=...). O token fica salvo neste
   aparelho, então nas próximas visitas ele já abre logado.
   Sem token, a aba mostra como o programa funciona e os prêmios.

   O modelo (pontos ou selos) vem do servidor e a tela se adapta:
   pontos → saldo grande + barra até o próximo prêmio
   selos  → cartela de selos
   ============================================================ */
const FID = {
  token: null,
  cliente: null,     // { nome, pontos (saldo do modelo ativo), modelo, selos, pontos_resgatados }
  premios: [],
  resgates: [],
  modelo: "pontos",
  regras: null,      // { modelo, valor_selo, pontos_por_real } — vem da config pública
  carrinho: {},      // { premio_id: { premio, qtd } }
  sub: "premios",
  entrega: "retirada",
  enviando: false
};

const fidTokenKey = () => `fluxon_fid_token_${RESTAURANT_ID}`;
const fidNum = (n) => Number(n || 0).toLocaleString("pt-BR");
const fidCusto = (p) => Math.max(Number(p.pontos_necessarios) || 0, Number(p.piso_resgate) || 0);
const fidSaldo = () => Number(FID.cliente?.pontos) || 0;
const fidNoCarrinho = () => Object.values(FID.carrinho).reduce((s, i) => s + fidCusto(i.premio) * i.qtd, 0);
const fidQtdCarrinho = () => Object.values(FID.carrinho).reduce((s, i) => s + i.qtd, 0);

// "pontos"/"selos" no plural, singular quando é 1; curto = "pts"/"selos"
function fidUn(n, curto){
  const selos = FID.modelo === "selos";
  if(curto) return selos ? (n === 1 ? "selo" : "selos") : "pts";
  return selos ? (n === 1 ? "selo" : "selos") : (n === 1 ? "ponto" : "pontos");
}

/* ---------------- dados ---------------- */
function fidPegarToken(){
  const params = new URLSearchParams(location.search);
  const t = params.get("token");
  if(t){
    try{ localStorage.setItem(fidTokenKey(), t); }catch{}
    // tira o token da barra de endereço (evita a pessoa compartilhar o link logado sem querer)
    params.delete("token");
    const q = params.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + "#fidelidade");
    return t;
  }
  try{ return localStorage.getItem(fidTokenKey()); }catch{ return null; }
}

function fidAplicar(d){
  FID.cliente = d.cliente;
  FID.modelo = d.cliente?.modelo === "selos" ? "selos" : "pontos";
  FID.premios = (d.premios || []).filter(p => Number(p.piso_resgate) > 0);
  FID.resgates = d.resgates || [];
  // tira do carrinho prêmio que sumiu ou que ficou caro demais
  Object.keys(FID.carrinho).forEach(id => { if(!FID.premios.some(p => String(p.id) === id)) delete FID.carrinho[id]; });
}

async function fidBuscarCliente(){
  const r = await fetch(`${CONFIG.API_BASE}/api/v1/fidelidade/cliente/${encodeURIComponent(FID.token)}`);
  if(r.status === 404) return "invalido";
  if(!r.ok) throw new Error("erro " + r.status);
  const d = await r.json();
  if(String(d.cliente?.restaurant_id) !== String(RESTAURANT_ID)) return "invalido";
  fidAplicar(d);
  return "ok";
}

async function fidCarregar(){
  FID.regras = RESTAURANT_CONFIG.fidelidade || null;
  FID.modelo = FID.regras?.modelo === "selos" ? "selos" : "pontos";
  if(IS_DEMO) return false;

  FID.token = fidPegarToken();
  if(FID.token){
    try{
      if(await fidBuscarCliente() === "invalido") fidEsquecer();
    }catch(err){ console.warn("Fidelidade: não foi possível carregar o cliente.", err); }
  }
  if(!FID.cliente){
    try{
      const r = await fetch(`${CONFIG.API_BASE}/api/v1/fidelidade/${RESTAURANT_ID}/premios`);
      if(r.ok){
        const lista = await r.json();
        FID.premios = (Array.isArray(lista) ? lista : []).filter(p => Number(p.piso_resgate) > 0);
      }
    }catch(err){ console.warn("Fidelidade: não foi possível carregar os prêmios.", err); }
  }
  // só mostra a aba se o restaurante usa o programa de verdade
  return !!FID.cliente || FID.premios.length > 0;
}

function fidEsquecer(){
  try{ localStorage.removeItem(fidTokenKey()); }catch{}
  FID.token = null; FID.cliente = null; FID.resgates = []; FID.carrinho = {};
}

/* ---------------- textos ---------------- */
function fidRegraTexto(){
  const r = FID.regras;
  if(FID.modelo === "selos"){
    const v = Number(r?.valor_selo) || 0;
    return v > 0 ? `Ganhe 1 selo em cada pedido a partir de <b>${money(v)}</b>` : "Cada pedido feito aqui vale selo";
  }
  const ppr = Number(r?.pontos_por_real) || 0;
  if(ppr > 0) return `Ganhe <b>${fidNum(ppr)} ${ppr === 1 ? "ponto" : "pontos"}</b> a cada R$ 1 em pedidos`;
  return "Cada pedido feito aqui vale pontos";
}

// próximo prêmio que ainda não dá pra pegar (ou o maior, se já dá pra pegar todos)
function fidMeta(){
  const ord = [...FID.premios].sort((a, b) => fidCusto(a) - fidCusto(b));
  if(!ord.length) return null;
  const saldo = fidSaldo();
  return ord.find(p => fidCusto(p) > saldo) || null;
}

/* ---------------- tela ---------------- */
function fidCartao(){
  const nomeRest = escHtml(RESTAURANT_CONFIG.nome_exibicao || "");
  const logo = RESTAURANT_CONFIG.logo_url
    ? `<img src="${escHtml(RESTAURANT_CONFIG.logo_url)}" alt="">`
    : escHtml((RESTAURANT_CONFIG.nome_exibicao || "R").trim().charAt(0).toUpperCase());

  if(!FID.cliente){
    return `
    <section class="fid-card fid-card-anon">
      <div class="fid-card-top">
        <span class="fid-eyebrow">Programa de fidelidade</span>
        <span class="fid-card-logo">${logo}</span>
      </div>
      <h2 class="fid-card-title">Peça, acumule e<br>troque por prêmios</h2>
      <p class="fid-regra">${fidRegraTexto()}</p>
      <ol class="fid-passos">
        <li><span>1</span>Faça seu pedido pelo cardápio</li>
        <li><span>2</span>Acumule ${FID.modelo === "selos" ? "selos" : "pontos"} a cada pedido</li>
        <li><span>3</span>Troque por prêmios aqui</li>
      </ol>
      <p class="fid-anon-nota">Já é cliente? Abra o link da fidelidade que ${nomeRest || "o restaurante"} enviou no seu WhatsApp para ver seu saldo aqui.</p>
    </section>`;
  }

  const c = FID.cliente, saldo = fidSaldo(), meta = fidMeta();
  const primeiroNome = escHtml(String(c.nome || "").trim().split(" ")[0] || "cliente");

  let miolo;
  if(FID.modelo === "selos"){
    const alvo = meta ? fidCusto(meta) : Math.max(saldo, ...FID.premios.map(fidCusto), 1);
    const total = Math.min(alvo, 20);
    const cheios = Math.min(saldo, total);
    const selos = Array.from({ length: total }, (_, i) =>
      `<span class="fid-selo${i < cheios ? " on" : ""}">${i < cheios
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`
        : i + 1}</span>`).join("");
    miolo = `
      <div class="fid-saldo"><span class="fid-saldo-num" data-alvo="${saldo}">${fidNum(saldo)}</span><span class="fid-saldo-un">${fidUn(saldo)}</span></div>
      <div class="fid-selos${total > 10 ? " compacto" : ""}">${selos}</div>
      <p class="fid-prog-txt">${meta
        ? `Faltam <b>${fidNum(fidCusto(meta) - saldo)} ${fidUn(fidCusto(meta) - saldo)}</b> para ${escHtml(meta.nome)}`
        : FID.premios.length ? "Cartela completa! Escolha seu prêmio abaixo 🎉" : ""}</p>`;
  }else{
    const pct = meta ? Math.max(4, Math.min(100, (saldo / fidCusto(meta)) * 100)) : 100;
    miolo = `
      <div class="fid-saldo"><span class="fid-saldo-num" data-alvo="${saldo}">0</span><span class="fid-saldo-un">${fidUn(saldo)}</span></div>
      <div class="fid-bar"><i style="width:${pct}%"></i></div>
      <p class="fid-prog-txt">${meta
        ? `Faltam <b>${fidNum(fidCusto(meta) - saldo)} pontos</b> para ${escHtml(meta.nome)}`
        : FID.premios.length ? "Você já pode trocar por qualquer prêmio 🎉" : ""}</p>`;
  }

  return `
  <section class="fid-card">
    <div class="fid-card-top">
      <span class="fid-eyebrow">Olá, ${primeiroNome}</span>
      <span class="fid-card-logo">${logo}</span>
    </div>
    ${miolo}
    <p class="fid-regra">${fidRegraTexto()}</p>
  </section>`;
}

function fidPremioCard(p){
  const custo = fidCusto(p);
  const foto = p.foto_url ? getPrimeiraFoto(p) : null;
  const logado = !!FID.cliente;
  const noCarrinho = FID.carrinho[p.id]?.qtd || 0;
  const livre = fidSaldo() - fidNoCarrinho();
  const pode = logado && (livre >= custo || noCarrinho > 0);
  const falta = custo - fidSaldo();

  let acao = "";
  if(logado){
    if(noCarrinho > 0){
      acao = `<div class="fid-qty">
        <button class="qty-btn" data-fid-menos="${escHtml(p.id)}" aria-label="Tirar um">−</button>
        <span>${noCarrinho}</span>
        <button class="qty-btn" data-fid-mais="${escHtml(p.id)}" aria-label="Pôr mais um"${livre >= custo ? "" : " disabled"}>+</button>
      </div>`;
    }else if(livre >= custo){
      acao = `<button class="fid-add" data-fid-mais="${escHtml(p.id)}">Resgatar</button>`;
    }else if(falta > 0){
      acao = `<span class="fid-falta">Faltam ${fidNum(falta)}</span>`;
    }else{
      acao = `<span class="fid-falta">Saldo no carrinho</span>`;
    }
  }

  return `
  <article class="fid-premio${pode ? " ok" : ""}">
    <div class="fid-premio-foto">
      ${foto ? `<img src="${escHtml(foto)}" alt="${escHtml(p.nome)}" loading="lazy">` : `<span class="fid-premio-emoji">🎁</span>`}
      ${logado && fidSaldo() >= custo ? `<span class="fid-tag">Disponível</span>` : ""}
    </div>
    <div class="fid-premio-body">
      <h3>${escHtml(p.nome)}</h3>
      ${p.descricao ? `<p>${escHtml(p.descricao)}</p>` : ""}
      <div class="fid-premio-foot">
        <span class="fid-custo">★ ${fidNum(custo)} ${fidUn(custo, true)}</span>
        ${acao}
      </div>
    </div>
  </article>`;
}

function fidListaPremios(){
  if(!FID.premios.length){
    return `<div class="drawer-empty">NENHUM PRÊMIO DISPONÍVEL AINDA<br>— volte em breve —</div>`;
  }
  const saldo = fidSaldo();
  const ord = [...FID.premios].sort((a, b) => {
    const da = saldo >= fidCusto(a), db = saldo >= fidCusto(b);
    if(da !== db) return da ? -1 : 1;
    return fidCusto(a) - fidCusto(b);
  });
  return `<div class="fid-grid">${ord.map(fidPremioCard).join("")}</div>`;
}

function fidListaResgates(){
  if(!FID.resgates.length){
    return `<div class="drawer-empty">VOCÊ AINDA NÃO RESGATOU NADA<br>— seus resgates aparecem aqui —</div>`;
  }
  const status = (s) => {
    s = String(s || "").toLowerCase();
    if(s === "finished" || s === "delivered") return ["Entregue", "ok"];
    if(s === "cancelled" || s === "canceled") return ["Cancelado", "x"];
    return ["Pedido feito", ""];
  };
  return `<div class="fid-resgates">${FID.resgates.map(r => {
    const [rot, cls] = status(r.status);
    const itens = (r.itens || []).map(i => `${i.qty || i.quantidade || 1}x ${escHtml(i.name || i.nome || "")}`).join(", ");
    const delivery = String(r.service_type || "").toLowerCase() === "delivery";
    return `
    <div class="fid-resgate">
      <span class="fid-resgate-ic">${delivery ? "🛵" : "🏪"}</span>
      <div class="fid-resgate-info">
        <b>${itens || "Resgate"}</b>
        <span>${r.order_number ? "#" + r.order_number + " · " : ""}${fidData(r.created_at)}${delivery ? " · Delivery" : " · Retirada"}</span>
      </div>
      <span class="fid-status ${cls}">${rot}</span>
    </div>`;
  }).join("")}</div>`;
}

function fidData(iso){
  if(!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
}

function fidRender(animar){
  const el = document.getElementById("fidView");
  if(!el) return;
  const logado = !!FID.cliente;
  if(!logado) FID.sub = "premios";

  el.innerHTML = `
    ${fidCartao()}
    ${logado ? `
    <div class="fid-subnav">
      <button class="cat-pill${FID.sub === "premios" ? " active" : ""}" data-fid-sub="premios">Prêmios</button>
      <button class="cat-pill${FID.sub === "resgates" ? " active" : ""}" data-fid-sub="resgates">Meus resgates</button>
    </div>` : `<div class="cat-heading fid-heading"><h2>Prêmios</h2><span class="count">${FID.premios.length} ${FID.premios.length === 1 ? "prêmio" : "prêmios"}</span></div>`}
    <div id="fidConteudo">${FID.sub === "resgates" ? fidListaResgates() : fidListaPremios()}</div>
    ${logado ? `<button class="fid-sair" id="fidSairBtn">Não é ${escHtml(String(FID.cliente.nome || "você").split(" ")[0])}? Sair deste aparelho</button>` : ""}
  `;

  el.querySelectorAll("[data-fid-sub]").forEach(b => b.onclick = () => { FID.sub = b.dataset.fidSub; fidRender(true); });
  fidLigarBotoes(el);
  const sair = document.getElementById("fidSairBtn");
  if(sair) sair.onclick = () => { fidEsquecer(); fidRecarregarAnonimo(); };

  fidAtualizarFab();
  fidAtualizarPontinho();

  if(animar){
    gsap.fromTo(el.querySelectorAll(".fid-card, .fid-subnav, .fid-heading, .fid-premio, .fid-resgate"),
      { opacity:0, y:14 }, { opacity:1, y:0, duration:.45, stagger:.05, ease:"power2.out" });
    gsap.fromTo(el.querySelectorAll(".fid-selo.on"), { scale:.4, opacity:0 }, { scale:1, opacity:1, duration:.35, stagger:.06, ease:"back.out(2.2)", delay:.2 });
    const bar = el.querySelector(".fid-bar i");
    if(bar) gsap.from(bar, { width:0, duration:.9, ease:"power2.out", delay:.2 });
  }
  const num = el.querySelector(".fid-saldo-num");
  if(num && FID.modelo !== "selos"){
    const alvo = Number(num.dataset.alvo) || 0;
    if(animar){
      const o = { v:0 };
      gsap.to(o, { v:alvo, duration:1, ease:"power2.out", onUpdate:() => num.textContent = fidNum(Math.round(o.v)) });
    }else num.textContent = fidNum(alvo);
  }
}

async function fidRecarregarAnonimo(){
  try{
    const r = await fetch(`${CONFIG.API_BASE}/api/v1/fidelidade/${RESTAURANT_ID}/premios`);
    if(r.ok){ const lista = await r.json(); FID.premios = (Array.isArray(lista) ? lista : []).filter(p => Number(p.piso_resgate) > 0); }
  }catch{}
  fidRender(true);
}

// re-renderiza só a lista (sem animar tudo de novo) depois de mexer no carrinho
function fidAtualizarLista(){
  const box = document.getElementById("fidConteudo");
  if(!box || FID.sub !== "premios") return;
  box.innerHTML = fidListaPremios();
  fidLigarBotoes(box);
  fidAtualizarFab();
}

function fidLigarBotoes(raiz){
  raiz.querySelectorAll("[data-fid-mais]").forEach(b => b.onclick = (e) => { e.stopPropagation(); fidMudar(b.dataset.fidMais, 1, b); });
  raiz.querySelectorAll("[data-fid-menos]").forEach(b => b.onclick = (e) => { e.stopPropagation(); fidMudar(b.dataset.fidMenos, -1, b); });
}

/* ---------------- carrinho de prêmios ---------------- */
function fidMudar(id, delta, botao){
  const p = FID.premios.find(x => String(x.id) === String(id));
  if(!p) return;
  const atual = FID.carrinho[p.id]?.qtd || 0;
  if(delta > 0 && fidSaldo() - fidNoCarrinho() < fidCusto(p)){
    fidToast(FID.modelo === "selos" ? "Selos insuficientes" : "Pontos insuficientes", true);
    return;
  }
  const nova = Math.max(0, atual + delta);
  if(nova === 0) delete FID.carrinho[p.id];
  else FID.carrinho[p.id] = { premio:p, qtd:nova };
  if(delta > 0 && botao){
    const fab = document.getElementById("fidFab");
    if(fab && fab.classList.contains("visible")) flyToTarget(botao, document.getElementById("fidFabBadge"));
  }
  fidAtualizarLista();
  const modal = document.getElementById("fidResgateModal");
  if(modal) fidPreencherResgate(modal);
}

function fidAtualizarFab(){
  const fab = document.getElementById("fidFab");
  if(!fab) return;
  const qtd = fidQtdCarrinho();
  document.getElementById("fidFabBadge").textContent = qtd;
  document.getElementById("fidFabTotal").textContent = `${fidNum(fidNoCarrinho())} ${fidUn(fidNoCarrinho(), true)}`;
  fab.classList.toggle("visible", qtd > 0);
}

// pontinho na aba quando já dá pra resgatar algo
function fidAtualizarPontinho(){
  const dot = document.getElementById("fidTabDot");
  if(!dot) return;
  const pode = !!FID.cliente && FID.premios.some(p => fidSaldo() >= fidCusto(p));
  dot.style.display = pode ? "block" : "none";
}

function flyToTarget(btn, alvo){
  if(!btn || !alvo) return;
  const rect = btn.getBoundingClientRect(), r2 = alvo.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.className = "fly-dot";
  dot.style.left = rect.left + rect.width / 2 + "px";
  dot.style.top = rect.top + rect.height / 2 + "px";
  document.body.appendChild(dot);
  gsap.timeline({ onComplete:() => dot.remove() })
    .to(dot, { duration:.5, left:r2.left + r2.width / 2, top:r2.top + r2.height / 2, ease:"power2.in", scale:.4 })
    .to(dot, { duration:.1, scale:0, opacity:0 });
}

/* ---------------- resgate (confirmação) ---------------- */
function fidAbrirResgate(){
  if(!fidQtdCarrinho()) return;
  document.getElementById("fidResgateModal")?.remove();
  const v = typeof getFieldValues === "function" ? getFieldValues() : {};

  const wrap = document.createElement("div");
  wrap.id = "fidResgateModal";
  wrap.className = "detail-backdrop";
  wrap.innerHTML = `
    <div class="detail-panel fid-sheet">
      <div class="detail-body">
        <div class="fid-sheet-head">
          <h2>Resgatar prêmios</h2>
          <button class="sheet-back" id="fidResgateFechar" aria-label="Fechar">✕</button>
        </div>
        <div class="fid-sheet-lista" id="fidResgateLista"></div>
        <div class="total-row fid-sheet-total">
          <span class="tot-label">Total</span>
          <span class="tot-value" id="fidResgateTotal"></span>
        </div>
        <p class="fid-sheet-saldo" id="fidResgateSaldo"></p>

        <div class="section-title">Como você quer receber?</div>
        <div class="troco-toggle">
          <button type="button" class="troco-opt${FID.entrega === "retirada" ? " selected" : ""}" data-fid-entrega="retirada">🏪 Retirar no local</button>
          <button type="button" class="troco-opt${FID.entrega === "delivery" ? " selected" : ""}" data-fid-entrega="delivery">🛵 Delivery</button>
        </div>

        <div id="fidEndereco" style="display:${FID.entrega === "delivery" ? "block" : "none"}; margin-top:14px;">
          <div class="field-row">
            <div class="field" style="flex:2"><label>Rua</label><input type="text" id="fidRua" value="${escHtml(v.rua || "")}" placeholder="Nome da rua"></div>
            <div class="field" style="flex:1"><label>Número</label><input type="text" id="fidNumero" value="${escHtml(v.numero || "")}" placeholder="123"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Bairro</label><input type="text" id="fidBairro" value="${escHtml(v.bairro || "")}" placeholder="Bairro"></div>
            <div class="field"><label>Complemento</label><input type="text" id="fidComplemento" value="${escHtml(v.complemento || "")}" placeholder="Apto, bloco..."></div>
          </div>
          <div class="field"><label>Ponto de referência (opcional)</label><input type="text" id="fidReferencia" value="${escHtml(v.referencia || "")}" placeholder="Ex: perto do mercado"></div>
        </div>

        <button class="checkout-btn" id="fidConfirmarBtn" style="margin-top:18px;">Confirmar resgate</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  lockBodyScroll();

  fidPreencherResgate(wrap);

  wrap.querySelectorAll("[data-fid-entrega]").forEach(b => b.onclick = () => {
    FID.entrega = b.dataset.fidEntrega;
    wrap.querySelectorAll("[data-fid-entrega]").forEach(x => x.classList.toggle("selected", x === b));
    const box = document.getElementById("fidEndereco");
    box.style.display = FID.entrega === "delivery" ? "block" : "none";
    if(FID.entrega === "delivery") gsap.fromTo(box, { opacity:0, y:-6 }, { opacity:1, y:0, duration:.3 });
  });
  document.getElementById("fidResgateFechar").onclick = () => fidFecharResgate();
  wrap.addEventListener("click", e => { if(e.target === wrap) fidFecharResgate(); });
  document.getElementById("fidConfirmarBtn").onclick = fidConfirmar;

  gsap.fromTo(wrap, { opacity:0 }, { opacity:1, duration:.25 });
  gsap.fromTo(wrap.querySelector(".detail-panel"), { scale:.9, opacity:0 }, { scale:1, opacity:1, duration:.35, ease:"back.out(1.4)" });
}

function fidPreencherResgate(wrap){
  const itens = Object.values(FID.carrinho);
  if(!itens.length){ fidFecharResgate(); return; }
  const total = fidNoCarrinho(), depois = fidSaldo() - total;
  const lista = wrap.querySelector("#fidResgateLista");
  lista.innerHTML = itens.map(i => `
    <div class="receipt-item" style="opacity:1">
      <span class="ri-qty">${i.qtd}x</span>
      <div class="ri-name">
        ${escHtml(i.premio.nome)}
        <div class="qty-ctrl">
          <button class="qty-btn" data-fid-menos="${escHtml(i.premio.id)}">−</button>
          <button class="qty-btn" data-fid-mais="${escHtml(i.premio.id)}">+</button>
        </div>
      </div>
      <span class="ri-price">${fidNum(fidCusto(i.premio) * i.qtd)} ${fidUn(fidCusto(i.premio) * i.qtd, true)}</span>
    </div>`).join("");
  fidLigarBotoes(lista);
  wrap.querySelector("#fidResgateTotal").textContent = `${fidNum(total)} ${fidUn(total, true)}`;
  wrap.querySelector("#fidResgateSaldo").textContent = `Saldo depois do resgate: ${fidNum(depois)} ${fidUn(depois)}`;
}

function fidFecharResgate(){
  const wrap = document.getElementById("fidResgateModal");
  if(!wrap) return;
  unlockBodyScroll();
  gsap.to(wrap.querySelector(".detail-panel"), { scale:.92, opacity:0, duration:.22, ease:"power2.in" });
  gsap.to(wrap, { opacity:0, duration:.25, onComplete:() => wrap.remove() });
}

async function fidConfirmar(){
  if(FID.enviando) return;
  const itens = Object.values(FID.carrinho);
  if(!itens.length) return;
  const delivery = FID.entrega === "delivery";
  let endereco = null;
  if(delivery){
    const g = (id) => (document.getElementById(id)?.value || "").trim();
    const e = { rua:g("fidRua"), numero:g("fidNumero"), bairro:g("fidBairro"), complemento:g("fidComplemento"), referencia:g("fidReferencia") };
    if(!e.rua || !e.numero || !e.bairro){
      shake(!e.rua ? "fidRua" : !e.numero ? "fidNumero" : "fidBairro");
      fidToast("Preencha rua, número e bairro", true);
      return;
    }
    endereco = buildEndereco(e);
  }

  const btn = document.getElementById("fidConfirmarBtn");
  FID.enviando = true; btn.disabled = true; btn.textContent = "Enviando...";
  try{
    const res = await fetch(`${CONFIG.API_BASE}/api/v1/fidelidade/resgatar`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        token: FID.token,
        itens: itens.map(i => ({ premio_id:i.premio.id, quantidade:i.qtd })),
        service_type: delivery ? "delivery" : "local",
        address: endereco
      })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || "Não foi possível resgatar agora.");

    FID.carrinho = {};
    fidFecharResgate();
    fidToast(delivery ? "Resgate confirmado! Vai chegar no seu endereço." : "Resgate confirmado! Retire no balcão.");
    try{ await fidBuscarCliente(); }catch{}
    FID.sub = "resgates";
    fidRender(true);
  }catch(err){
    fidToast(err.message || "Não foi possível resgatar agora.", true);
    btn.disabled = false; btn.textContent = "Confirmar resgate";
  }finally{
    FID.enviando = false;
  }
}

/* ---------------- avisos ---------------- */
function fidToast(msg, erro){
  let t = document.getElementById("appToast");
  if(!t){ t = document.createElement("div"); t.id = "appToast"; t.className = "app-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle("erro", !!erro);
  gsap.killTweensOf(t);
  gsap.fromTo(t, { opacity:0, y:16 }, { opacity:1, y:0, duration:.3, ease:"power2.out" });
  gsap.to(t, { opacity:0, y:16, duration:.3, delay:3.2 });
}
