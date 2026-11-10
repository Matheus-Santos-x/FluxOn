/* ============================================================
   📅 PEDIDO AGENDADO — com a loja fechada o cliente escolhe o
   horário (de 30 em 30 min no próximo período) e paga no Pix na
   hora. O pedido entra sozinho na cozinha perto do horário.
   ============================================================ */
const AG = { para: null, info: null };

// "hoje às 19:30" / "amanhã às 19:30" / "sexta às 19:30"
function agQuando(iso){
  const d = new Date(iso);
  const dia = x => x.toLocaleDateString("pt-BR", { timeZone:"America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone:"America/Sao_Paulo", hour:"2-digit", minute:"2-digit" });
  if(dia(d) === dia(new Date())) return `hoje às ${hora}`;
  if(dia(d) === dia(new Date(Date.now() + 864e5))) return `amanhã às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { timeZone:"America/Sao_Paulo", weekday:"long" }).split("-")[0]} às ${hora}`;
}

// etiqueta do topo: "Fechado · abre hoje às 18:00"
const _agRenderStatus = renderStoreStatus;
renderStoreStatus = function(){
  _agRenderStatus();
  const t = document.getElementById("storeStatusText");
  if(t && !RESTAURANT_HORARIOS_STATUS.aberto && RESTAURANT_HORARIOS_STATUS.abre_texto)
    t.textContent = `Fechado · abre ${RESTAURANT_HORARIOS_STATUS.abre_texto}`;
};

// o horário escolhido vai junto no rascunho (o servidor confere se ainda vale)
const _agSubmit = submitOrder;
submitOrder = function(payload){
  return _agSubmit(AG.para && payload?.origin === "cardapio_delivery" ? { ...payload, agendado_para: AG.para } : payload);
};

// confere de novo se a loja abriu/fechou e quais horários ainda valem
async function agAtualizar(){
  try{
    const r = await fetch(`${CONFIG.API_BASE}/api/v1/restaurante/${RESTAURANT_ID}/horarios`);
    if(!r.ok) return;
    const d = await r.json();
    RESTAURANT_HORARIOS_STATUS = d.status || RESTAURANT_HORARIOS_STATUS;
    AG.info = d.agendamento || null;
    renderStoreStatus();
  }catch(e){ /* sem internet: fica com o que já tinha */ }
}

// loja fechada: só o Pix (pague agora); guarda como estava pra voltar ao normal
let AG_DISPLAY = null;
function agSoPix(liga){
  const opts = [...document.querySelectorAll("#payOptions .pay-opt")];
  if(liga){
    if(!AG_DISPLAY) AG_DISPLAY = opts.map(o => o.style.display);
    opts.forEach(o => { o.style.display = o.dataset.pay === "PixOnline" ? "flex" : "none"; });
    const pix = opts.find(o => o.dataset.pay === "PixOnline");
    if(pix && SELECTED_PAY !== "PixOnline") pix.click();
  }else if(AG_DISPLAY){
    opts.forEach((o, i) => { o.style.display = AG_DISPLAY[i]; });
    AG_DISPLAY = null;
    if(SELECTED_PAY === "PixOnline" && !RESTAURANT_CONFIG.pix_online) SELECTED_PAY = null;
  }
}

async function agEtapa3(){
  await agAtualizar();
  const btn = document.getElementById("submitOrderBtn");
  let box = document.getElementById("agBox");
  if(RESTAURANT_HORARIOS_STATUS.aberto){
    box?.remove(); AG.para = null; agSoPix(false); btn.disabled = false;
    return;
  }
  if(!box){
    box = document.createElement("div");
    box.id = "agBox"; box.className = "ag-box";
    document.getElementById("payOptions").before(box);
  }
  const abre = RESTAURANT_HORARIOS_STATUS.abre_texto ? `Abrimos ${RESTAURANT_HORARIOS_STATUS.abre_texto}.` : "";
  const slots = AG.info?.disponivel ? (AG.info.slots || []) : [];
  if(!slots.length){
    box.innerHTML = `<b>🌙 Estamos fechados agora</b><span>${escHtml(abre)} Volte nesse horário para fazer seu pedido.</span>`;
    AG.para = null; btn.disabled = true;
    return;
  }
  if(!slots.some(s => s.iso === AG.para)) AG.para = slots[0].iso;
  box.innerHTML = `
    <b>🌙 Estamos fechados agora</b>
    <span>${escHtml(abre)} Agende seu pedido: ele fica guardado e sai no horário que você escolher.</span>
    <label for="agHora">Para quando?</label>
    <select id="agHora">${slots.map((s, i) =>
      `<option value="${s.iso}" ${s.iso === AG.para ? "selected" : ""}>${i === 0 ? `Assim que abrir · ${s.hora}` : s.hora}</option>`).join("")}</select>
    <small>Pedido agendado é pago agora, no Pix.</small>`;
  document.getElementById("agHora").onchange = (e) => { AG.para = e.target.value; };
  agSoPix(true);
  btn.disabled = false;
}

const _agShowStep = showStep;
showStep = function(step){
  _agShowStep(step);
  if(step === 3) agEtapa3();
};

// tela final: "Pedido agendado para hoje às 19:30!"
const _agShowSuccess = showSuccess;
showSuccess = function(result){
  const para = AG.para;
  _agShowSuccess(result);
  if(!para) return;
  const sv = document.getElementById("successView");
  const h2 = sv?.querySelector("h2"), p = sv?.querySelector("p");
  if(h2) h2.textContent = `Pedido agendado para ${agQuando(para)}!`;
  if(p) p.textContent = "Pagamento confirmado. Seu pedido fica guardado e começa a ser preparado perto do horário escolhido.";
  AG.para = null;
  agSoPix(false);
  document.getElementById("agBox")?.remove();
};
