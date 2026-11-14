/* ============================================================
   MINHA CONTA — menu do bonequinho, tela "Minha conta" e
   endereços salvos no pedido (como no Mercado Livre).
   Usa o login do WhatsApp (FID.token) e a rota /api/v1/cliente/:id/...
   ============================================================ */
let CONTA = null; // { nome, telefone, enderecos: [...] }

async function contaApi(caminho, opt = {}){
  const r = await fetch(`${CONFIG.API_BASE}/api/v1/cliente/${RESTAURANT_ID}${caminho}`, {
    ...opt,
    headers: { "Content-Type":"application/json", "x-cliente-token": FID.token || "", ...(opt.headers || {}) }
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(d.error || "Não foi possível falar com o restaurante agora");
  return d;
}
async function contaCarregar(){
  if(!FID.token) return (CONTA = null);
  try{ CONTA = await contaApi("/conta"); }catch(e){ console.warn("Conta:", e.message); CONTA = null; }
  return CONTA;
}
const endLinha1 = e => `${e.rua}, ${e.numero}${e.complemento ? " - " + e.complemento : ""}`;
const endLinha2 = e => [e.bairro, e.cidade && (e.cidade + (e.uf ? "/" + e.uf : "")), e.cep && "CEP " + e.cep].filter(Boolean).join(" · ");

async function buscarCep(cep){
  const d = String(cep || "").replace(/\D/g, "");
  if(d.length !== 8) return null;
  try{
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    return (!r.ok || j.erro) ? null : j;
  }catch{ return null; }
}
const cepMascara = v => { const d = String(v || "").replace(/\D/g, "").slice(0, 8); return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d; };

/* ---------------- menu do bonequinho ---------------- */
function contaMenu(){
  const aberto = document.getElementById("contaMenu");
  if(aberto){ aberto.remove(); return; }
  const nome = String(FID.cliente?.nome || CONTA?.nome || "").trim() || "Minha conta";
  const m = document.createElement("div");
  m.id = "contaMenu"; m.className = "conta-menu"; m.setAttribute("role", "menu");
  m.innerHTML = `
    <div class="conta-menu-quem"><b>${escHtml(nome)}</b><span id="contaMenuTel">${escHtml(CONTA?.telefone ? telefoneMascara(CONTA.telefone) : "")}</span></div>
    <button class="conta-menu-item" data-acao="conta" role="menuitem">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      Minha conta
    </button>
    <button class="conta-menu-item sair" data-acao="sair" role="menuitem">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg>
      Sair
    </button>`;
  document.body.appendChild(m);
  if(!CONTA) contaCarregar().then(c => { const t = document.getElementById("contaMenuTel"); if(t && c?.telefone) t.textContent = telefoneMascara(c.telefone); });
  m.addEventListener("click", e => {
    const b = e.target.closest("[data-acao]"); if(!b) return;
    m.remove();
    if(b.dataset.acao === "conta") contaAbrirTela();
    if(b.dataset.acao === "sair") contaSair();
  });
  setTimeout(() => document.addEventListener("click", function fora(e){
    if(!m.contains(e.target) && !e.target.closest("#loginBtn")){ m.remove(); document.removeEventListener("click", fora); }
  }), 0);
}

function contaSair(){
  fidEsquecer();
  CONTA = null;
  loginAtualizarBotao();
  if(typeof fidRecarregarAnonimo === "function") fidRecarregarAnonimo();
  fidToast("Você saiu da sua conta.");
}

/* ---------------- tela "Minha conta" ---------------- */
async function contaAbrirTela(){
  document.getElementById("contaTela")?.remove();
  const t = document.createElement("div");
  t.id = "contaTela"; t.className = "conta-tela";
  t.innerHTML = `
    <div class="conta-topo">
      <button class="conta-voltar" id="contaVoltar" aria-label="Voltar">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2>Minha conta</h2>
    </div>
    <div class="conta-corpo" id="contaCorpo"><p class="conta-vazio">Carregando...</p></div>`;
  document.body.appendChild(t);
  lockBodyScroll();
  document.getElementById("contaVoltar").onclick = contaFecharTela;
  await contaCarregar();
  contaRender();
}
function contaFecharTela(){ document.getElementById("contaTela")?.remove(); unlockBodyScroll(); }

function contaRender(){
  const corpo = document.getElementById("contaCorpo"); if(!corpo) return;
  if(!CONTA){ corpo.innerHTML = `<p class="conta-vazio">Não foi possível carregar sua conta. Entre de novo pelo WhatsApp.</p>`; return; }
  corpo.innerHTML = `
    <section class="conta-sec">
      <h3>Seus dados</h3>
      <div class="field"><label for="contaNome">Nome</label><input type="text" id="contaNome" value="${escHtml(CONTA.nome)}" maxlength="80"></div>
      <div class="field"><label>Telefone (WhatsApp)</label><input type="text" value="${escHtml(telefoneMascara(CONTA.telefone))}" disabled></div>
      ${CONTA.nascimento_ativo ? `<div class="field"><label for="contaNasc">Data de nascimento</label><input type="text" id="contaNasc" value="${escHtml(nascParaTela(CONTA.nascimento))}" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10" autocomplete="bday"></div>` : ""}
      <button class="conta-btn" id="contaSalvarNome">Salvar</button>
    </section>
    <section class="conta-sec">
      <h3>Meus endereços</h3>
      <div class="conta-ends">${CONTA.enderecos.length ? CONTA.enderecos.map(e => `
        <div class="conta-end">
          <div class="conta-end-txt"><b>${escHtml(endLinha1(e))}</b><span>${escHtml(endLinha2(e))}</span>
            ${e.principal ? `<em class="conta-tag">Principal</em>` : `<button class="conta-link" data-principal="${e.id}">Tornar principal</button>`}</div>
          <button class="conta-lixo" data-apagar="${e.id}" aria-label="Apagar endereço">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
          </button>
        </div>`).join("") : `<p class="conta-vazio">Nenhum endereço salvo ainda. Ele fica salvo sozinho no seu próximo pedido.</p>`}
      </div>
      <div id="contaNovoEnd"></div>
      <button class="conta-btn contorno" id="contaAddEnd">+ Adicionar endereço</button>
    </section>`;
  const nascInp = document.getElementById("contaNasc");
  if(nascInp) nascInp.addEventListener("input", () => { nascInp.value = nascMascara(nascInp.value); });
  document.getElementById("contaSalvarNome").onclick = async (ev) => {
    const nome = document.getElementById("contaNome").value.trim();
    if(!nome){ shake("contaNome"); return; }
    const nasc = nascInp && nascInp.value ? nascParaIso(nascInp.value) : null;
    if(nascInp && nascInp.value && !nasc){ shake("contaNasc"); fidToast("Confira a data: dia/mês/ano", true); return; }
    ev.target.disabled = true;
    try{
      if(nome !== CONTA.nome){
        await contaApi("/conta", { method:"PATCH", body: JSON.stringify({ nome }) });
        CONTA.nome = nome; if(FID.cliente) FID.cliente.nome = nome; loginAtualizarBotao();
      }
      if(nasc && nasc !== CONTA.nascimento){
        await contaApi("/nascimento", { method:"PATCH", body: JSON.stringify({ nascimento: nasc }) });
        CONTA.nascimento = nasc;
      }
      fidToast("Dados salvos!");
    }catch(e){ fidToast(e.message, true); }
    ev.target.disabled = false;
  };
  corpo.querySelectorAll("[data-principal]").forEach(b => b.onclick = async () => {
    try{ CONTA.enderecos = (await contaApi(`/enderecos/${b.dataset.principal}/principal`, { method:"PATCH" })).enderecos; contaRender(); }
    catch(e){ fidToast(e.message, true); }
  });
  corpo.querySelectorAll("[data-apagar]").forEach(b => b.onclick = async () => {
    if(!confirm("Apagar esse endereço?")) return;
    try{ CONTA.enderecos = (await contaApi(`/enderecos/${b.dataset.apagar}`, { method:"DELETE" })).enderecos; contaRender(); }
    catch(e){ fidToast(e.message, true); }
  });
  document.getElementById("contaAddEnd").onclick = (ev) => { ev.target.style.display = "none"; contaFormEndereco(); };
}

function contaFormEndereco(){
  const box = document.getElementById("contaNovoEnd");
  box.innerHTML = `
    <div class="conta-form">
      <div class="field"><label for="ceCep">CEP</label><input type="text" id="ceCep" placeholder="00000-000" inputmode="numeric" maxlength="9"><div class="cep-info" id="ceCepInfo"></div></div>
      <div class="field-row">
        <div class="field" style="flex:2"><label for="ceRua">Rua</label><input type="text" id="ceRua"></div>
        <div class="field" style="flex:1"><label for="ceNum">Número</label><input type="text" id="ceNum"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="ceBairro">Bairro</label><input type="text" id="ceBairro"></div>
        <div class="field"><label for="ceComp">Complemento</label><input type="text" id="ceComp" placeholder="Apto, bloco..."></div>
      </div>
      <div class="field"><label for="ceRef">Ponto de referência (opcional)</label><input type="text" id="ceRef"></div>
      <button class="conta-btn" id="ceSalvar">Salvar endereço</button>
    </div>`;
  let cidade = "", uf = "";
  const cep = document.getElementById("ceCep"), info = document.getElementById("ceCepInfo");
  cep.addEventListener("input", async () => {
    cep.value = cepMascara(cep.value);
    if(cep.value.length !== 9){ info.textContent = ""; info.className = "cep-info"; cidade = uf = ""; return; }
    info.className = "cep-info"; info.textContent = "Buscando endereço...";
    const j = await buscarCep(cep.value);
    if(!j){ info.className = "cep-info erro"; info.textContent = "Não achamos esse CEP. Preencha abaixo."; return; }
    cidade = j.localidade || ""; uf = j.uf || "";
    if(j.logradouro) document.getElementById("ceRua").value = j.logradouro;
    if(j.bairro) document.getElementById("ceBairro").value = j.bairro;
    info.className = "cep-info ok"; info.textContent = `📍 ${[j.bairro, cidade && cidade + "/" + uf].filter(Boolean).join(" · ")}`;
    document.getElementById(j.logradouro ? "ceNum" : "ceRua").focus();
  });
  document.getElementById("ceSalvar").onclick = async (ev) => {
    const e = { cep: cep.value, rua: document.getElementById("ceRua").value.trim(), numero: document.getElementById("ceNum").value.trim(),
      bairro: document.getElementById("ceBairro").value.trim(), complemento: document.getElementById("ceComp").value.trim(),
      referencia: document.getElementById("ceRef").value.trim(), cidade, uf };
    if(!e.rua || !e.numero || !e.bairro){ shake(!e.rua ? "ceRua" : !e.numero ? "ceNum" : "ceBairro"); return; }
    ev.target.disabled = true;
    try{ CONTA.enderecos = (await contaApi("/enderecos", { method:"POST", body: JSON.stringify(e) })).enderecos; contaRender(); fidToast("Endereço salvo!"); }
    catch(err){ fidToast(err.message, true); ev.target.disabled = false; }
  };
  cep.focus();
}

/* ---------------- endereços salvos no pedido ---------------- */
let END_ESCOLHIDO = null;
function endPreencher(e){
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ""; };
  set("inpCep", e?.cep); set("inpRua", e?.rua); set("inpNumero", e?.numero); set("inpBairro", e?.bairro);
  set("inpComplemento", e?.complemento); set("inpReferencia", e?.referencia);
  CEP_INFO = e && e.cidade ? { cep: e.cep || "", cidade: e.cidade, uf: e.uf || "" } : null;
  const info = document.getElementById("cepInfo"); if(info){ info.textContent = ""; info.className = "cep-info"; }
}
function endRender(){
  const box = document.getElementById("endSalvos"), form = document.getElementById("endForm");
  if(!box || !form) return;
  const lista = CONTA?.enderecos || [];
  if(!lista.length){ box.classList.add("hidden"); form.classList.remove("hidden"); return; }
  box.classList.remove("hidden");
  const novo = END_ESCOLHIDO === "novo";
  form.classList.toggle("hidden", !novo);
  box.innerHTML = `
    ${lista.map(e => `
      <button type="button" class="end-op ${END_ESCOLHIDO === e.id ? "sel" : ""}" data-end="${e.id}">
        <span class="end-radio" aria-hidden="true"></span>
        <span class="end-txt"><b>${escHtml(endLinha1(e))}</b><span>${escHtml(endLinha2(e))}</span></span>
      </button>`).join("")}
    <button type="button" class="end-add ${novo ? "sel" : ""}" data-end="novo">+ Adicionar endereço</button>`;
  box.querySelectorAll("[data-end]").forEach(b => b.onclick = () => {
    END_ESCOLHIDO = b.dataset.end;
    if(END_ESCOLHIDO === "novo"){ endPreencher(null); endRender(); setTimeout(() => document.getElementById("inpCep")?.focus(), 50); }
    else { endPreencher(lista.find(x => x.id === END_ESCOLHIDO)); endRender(); }
  });
}
async function endPrepararEtapa(){
  if(!FID.token){ document.getElementById("endSalvos")?.classList.add("hidden"); document.getElementById("endForm")?.classList.remove("hidden"); return; }
  await contaCarregar();
  const lista = CONTA?.enderecos || [];
  if(lista.length && END_ESCOLHIDO !== "novo" && !lista.some(e => e.id === END_ESCOLHIDO)){
    END_ESCOLHIDO = lista[0].id;              // principal (ou o último usado) já vem marcado
    endPreencher(lista[0]);
  }
  endRender();
}

// liga nas etapas do pedido sem mexer no cardapio.js
(function(){
  const _showStep = showStep;
  showStep = function(step){ _showStep(step); if(step === 2) endPrepararEtapa(); };

  const btn2 = document.getElementById("step2NextBtn");
  const _avancar = btn2.onclick;
  btn2.onclick = async (ev) => {
    await _avancar.call(btn2, ev);
    if(CHECKOUT_STEP !== 3 || !FID.token) return;  // não avançou ou não está logado
    const v = getFieldValues();
    const e = { cep: CEP_INFO?.cep || document.getElementById("inpCep")?.value || "", rua: v.rua, numero: v.numero, bairro: v.bairro,
      complemento: v.complemento, referencia: v.referencia, cidade: CEP_INFO?.cidade || "", uf: CEP_INFO?.uf || "" };
    contaApi("/enderecos", { method:"POST", body: JSON.stringify(e) })
      .then(d => { if(CONTA) CONTA.enderecos = d.enderecos; if(END_ESCOLHIDO === "novo") END_ESCOLHIDO = d.id; })
      .catch(() => {});
  };
})();


// logado: nome e telefone já estão na conta → abre direto no endereço, sem esperar o servidor
(function(){
  let rascunho = null; // a etapa "Seus dados" sendo salva em segundo plano

  // deixa a conta carregada antes, pro checkout abrir na hora
  setTimeout(() => { if(FID.token && !CONTA) contaCarregar(); }, 1500);

  const _openSheet = openSheet;
  openSheet = async function(){
    _openSheet();
    if(!FID.token || CHECKOUT_STEP !== 1) return;
    const passo1 = document.getElementById("step1");
    if(!CONTA){ passo1.style.visibility = "hidden"; await contaCarregar(); passo1.style.visibility = ""; }
    const nome = String(CONTA?.nome || FID.cliente?.nome || "").trim();
    const tel = String(CONTA?.telefone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if(!nome || tel.length < 10) return;                 // conta sem nome/telefone: deixa preencher
    document.getElementById("inpNome").value = nome;
    document.getElementById("inpTelefone").value = tel;
    showStep(2);                                         // vai direto pro endereço
    const v = getFieldValues();
    rascunho = submitOrder(basePayload(v, { notes: v.obs, status: "draft", service_type: "delivery" }))
      .then(r => { CURRENT_ORDER_ID = r.order?.id || CURRENT_ORDER_ID; })
      .catch(err => {                                    // ex.: loja fechada → volta e mostra o motivo
        showStep(1);
        alert(err.message && err.message !== "Falha ao enviar pedido" ? err.message : "Não foi possível salvar seus dados. Tente novamente.");
        throw err;
      })
      .finally(() => { rascunho = null; });
  };

  // o "Continuar" do endereço espera o rascunho terminar (não cria pedido duplicado)
  const btn2 = document.getElementById("step2NextBtn");
  const _continuar = btn2.onclick;
  btn2.onclick = async (ev) => {
    if(rascunho){ try{ await rascunho; }catch(e){ return; } }
    return _continuar.call(btn2, ev);
  };

  // logado não volta pra "Seus dados" (não tem nada pra mudar lá)
  const _showStep = showStep;
  showStep = function(step){
    _showStep(step);
    if(step === 2 && FID.token && CONTA?.nome) document.getElementById("sheetBackBtn").style.visibility = "hidden";
  };
})();

// observação vai pra última etapa, logo acima do total
(function(){
  const obs = document.getElementById("inpObs"), campo = obs?.closest(".field");
  const total = document.querySelector("#step3 .total-row");
  if(!campo || !total) return;
  total.before(campo);
  campo.style.marginTop = "16px";
  const rotulo = campo.querySelector("label");
  if(rotulo) rotulo.textContent = "Alguma observação? (opcional)";
  obs.placeholder = "Ex: sem cebola, maionese à parte...";
})();


/* ---------------- data de nascimento (todos os planos) ---------------- */
const nascMascara = v => { const d = String(v || "").replace(/\D/g, "").slice(0, 8); return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
const nascParaTela = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
function nascParaIso(txt){
  const m = String(txt || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const idade = (Date.now() - d.getTime()) / (365.25 * 864e5);
  if(d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || idade < 10 || idade > 110) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
const nascChave = () => `nasc_pulou_${RESTAURANT_ID}`;

// pergunta 1 vez: logo depois do login, ou ao abrir o app já logado
async function contaPerguntarNascimento(tentativa = 0){
  if(!FID.token || document.getElementById("nascModal")) return;
  try{ if(localStorage.getItem(nascChave())) return; }catch{}
  if(!CONTA) await contaCarregar();
  if(!CONTA?.nascimento_ativo || CONTA.nascimento) return;
  // tem outra janela aberta (carrinho, login...): tenta de novo daqui a pouco
  if(document.body.style.position === "fixed"){ if(tentativa < 6) setTimeout(() => contaPerguntarNascimento(tentativa + 1), 8000); return; }

  const nome = String(CONTA.nome || FID.cliente?.nome || "").trim().split(" ")[0];
  const wrap = document.createElement("div");
  wrap.id = "nascModal"; wrap.className = "detail-backdrop";
  wrap.innerHTML = `
    <div class="detail-panel login-panel">
      <div class="detail-body">
        <div class="fid-sheet-head">
          <h2>Quando é seu aniversário?</h2>
          <button class="sheet-back" id="nascFechar" aria-label="Fechar">✕</button>
        </div>
        <p class="login-txt">${nome ? `${escHtml(nome)}, conta` : "Conta"} pra gente e a gente não esquece do seu dia. 🎂</p>
        <div class="field"><label for="nascInp">Data de nascimento</label><input type="text" id="nascInp" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10" autocomplete="bday"></div>
        <button class="checkout-btn" id="nascSalvar">Salvar</button>
        <button type="button" class="nasc-pular" id="nascPular">Agora não</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  lockBodyScroll();
  const fechar = (pulou) => {
    if(pulou){ try{ localStorage.setItem(nascChave(), "1"); }catch{} }
    unlockBodyScroll();
    gsap.to(wrap, { opacity:0, duration:.22, onComplete:() => wrap.remove() });
  };
  const inp = document.getElementById("nascInp");
  inp.addEventListener("input", () => { inp.value = nascMascara(inp.value); });
  inp.addEventListener("keydown", e => { if(e.key === "Enter") document.getElementById("nascSalvar").click(); });
  document.getElementById("nascFechar").onclick = () => fechar(true);
  document.getElementById("nascPular").onclick = () => fechar(true);
  document.getElementById("nascSalvar").onclick = async (ev) => {
    const iso = nascParaIso(inp.value);
    if(!iso){ shake("nascInp"); fidToast("Confira a data: dia/mês/ano", true); return; }
    ev.target.disabled = true; ev.target.textContent = "Salvando...";
    try{
      await contaApi("/nascimento", { method:"PATCH", body: JSON.stringify({ nascimento: iso }) });
      CONTA.nascimento = iso;
      fechar(false);
      fidToast("Anotado! 🎉");
    }catch(e){ fidToast(e.message, true); ev.target.disabled = false; ev.target.textContent = "Salvar"; }
  };
  gsap.fromTo(wrap, { opacity:0 }, { opacity:1, duration:.25 });
  gsap.fromTo(wrap.querySelector(".detail-panel"), { scale:.9, opacity:0 }, { scale:1, opacity:1, duration:.35, ease:"back.out(1.4)" });
  setTimeout(() => inp.focus(), 350);
}
setTimeout(() => contaPerguntarNascimento(), 3000);


