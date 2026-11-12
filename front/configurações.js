/* =====================================================================
   FluxON Operacional · CONFIGURAÇÕES (engrenagem)
   Organiza os blocos da tela em grupos: Financeiro, Operação, Automação e Webhooks.
   Não muda o que cada bloco faz: só move os blocos que já existem no index.html
   pra dentro do grupo certo e dá a cara nova. Bloco novo que não estiver na lista
   cai sozinho no grupo "Outros".
===================================================================== */
(() => {
  const GRUPOS = [
    { id: "financeiro", icone: "💳", nome: "Financeiro", desc: "Como o restaurante recebe e emite nota.", itens: ["mp", "pixonline", "nfe"] },
    { id: "operacao", icone: "🧰", nome: "Operação", desc: "Impressoras, gaveta de dinheiro, marketplaces e o link de rastreio.", itens: ["impressora", "marketplace", "rastreio"] },
    { id: "automacao", icone: "⚡", nome: "Automação", desc: "Mesas e os tempos automáticos de cada etapa do pedido.", itens: ["mesas"] },
    { id: "webhooks", icone: "🔗", nome: "Webhooks", desc: "Pra onde o FluxON manda as mensagens do restaurante (n8n → WhatsApp).",
      itens: ["webhook-crm", "webhook-entregas", "webhook-login", "webhook", "webhook-reclamacao", "webhook-fechamento"] }
  ];
  // nome e explicação curta de cada bloco (o que aparece no cartão fechado)
  const ITENS = {
    mp: ["Maquininha", "Manda a cobrança direto pra maquininha"],
    pixonline: ["Pix online", "QR Code no app de pedido, na reserva e no vale-presente"],
    nfe: ["Nota fiscal", "Emissão de NFC-e pela Focus NF-e"],
    impressora: ["Impressoras e gaveta", "PrintNode, impressora por categoria e gaveta de dinheiro"],
    marketplace: ["Marketplaces", "Pedidos do iFood e do AiqFome"],
    rastreio: ["Link de rastreio", "Endereço da página de acompanhar o pedido"],
    mesas: ["Mesas e tempos automáticos", "Quantas mesas e quanto tempo em cada etapa"],
    "webhook-crm": ["Mensagens do restaurante (CRM)", "Disparo do CRM, vale-presente e reserva. É o padrão dos outros"],
    "webhook-entregas": ["Mensagens de entrega", "Código do entregador, \"seu pedido saiu\" e \"você é o próximo\""],
    "webhook-login": ["Login do cardápio", "Código de 6 dígitos que o cliente recebe pra entrar"],
    webhook: ["Pesquisa de satisfação", "Mensagem depois do pedido pedindo a avaliação"],
    "webhook-reclamacao": ["Reclamações", "Avaliações abaixo de 3 com o WhatsApp do cliente"],
    "webhook-fechamento": ["Fechamento de caixa", "Relatório em PDF quando o caixa fecha"]
  };
  const CHAVE = "fx_cfg_grupo";

  function montar() {
    const view = document.getElementById("settings-view");
    const antigo = view?.querySelector(".crm-content > div");
    if (!view || !antigo || view.querySelector(".cfg")) return;

    // acha cada bloco pelo botão toggleAccordion('id')
    const blocos = new Map();
    view.querySelectorAll("button[onclick^=\"toggleAccordion(\"]").forEach((b) => {
      const id = (b.getAttribute("onclick").match(/toggleAccordion\('([^']+)'\)/) || [])[1];
      if (id && b.parentElement) blocos.set(id, b.parentElement);
    });
    if (!blocos.size) return;

    const conhecidos = new Set(GRUPOS.flatMap((g) => g.itens));
    const outros = [...blocos.keys()].filter((id) => !conhecidos.has(id));
    const grupos = [...GRUPOS, ...(outros.length ? [{ id: "outros", icone: "🧩", nome: "Outros", desc: "Outras configurações.", itens: outros }] : [])]
      .map((g) => ({ ...g, itens: g.itens.filter((id) => blocos.has(id)) }))
      .filter((g) => g.itens.length);

    const cfg = document.createElement("div");
    cfg.className = "cfg";
    cfg.innerHTML = `
      <nav class="cfg-nav" aria-label="Grupos de configuração">
        ${grupos.map((g) => `<button type="button" class="cfg-nav-item" data-grupo="${g.id}"><span class="cfg-nav-ic" aria-hidden="true">${g.icone}</span><span class="cfg-nav-nome">${g.nome}</span><span class="cfg-nav-n">${g.itens.length}</span></button>`).join("")}
      </nav>
      <div class="cfg-paineis">
        ${grupos.map((g) => `
          <section class="cfg-painel" data-painel="${g.id}" hidden>
            <header class="cfg-painel-topo"><h2>${g.icone} ${g.nome}</h2><p>${g.desc}</p></header>
            <div class="cfg-lista"></div>
          </section>`).join("")}
      </div>`;

    // move cada bloco pro grupo dele e arruma o cabeçalho (ícone, nome e explicação)
    for (const g of grupos) {
      const lista = cfg.querySelector(`[data-painel="${g.id}"] .cfg-lista`);
      for (const id of g.itens) {
        const bloco = blocos.get(id);
        bloco.classList.add("cfg-card");
        bloco.removeAttribute("style");
        const botao = bloco.querySelector(":scope > button");
        botao.classList.add("cfg-card-topo");
        const corpo = bloco.querySelector(`#accordion-${CSS.escape(id)}`);
        corpo?.classList.add("cfg-card-corpo");
        const esquerda = botao.querySelector(":scope > div");
        const spans = esquerda ? esquerda.querySelectorAll(":scope > span") : [];
        if (spans[0]) { spans[0].className = "cfg-ic"; spans[0].removeAttribute("style"); }
        if (spans[1]) {
          const [nome, explica] = ITENS[id] || [spans[1].textContent.replace(/\s*\(Webhook\)\s*/i, ""), ""];
          const txt = document.createElement("span");
          txt.className = "cfg-card-txt";
          txt.innerHTML = `<b></b>${explica ? "<small></small>" : ""}`;
          txt.querySelector("b").textContent = nome;
          if (explica) txt.querySelector("small").textContent = explica;
          spans[1].replaceWith(txt);
        }
        if (esquerda) { esquerda.className = "cfg-card-esq"; esquerda.removeAttribute("style"); }
        lista.appendChild(bloco);
      }
    }
    antigo.replaceWith(cfg);

    const abrir = (id) => {
      if (!grupos.some((g) => g.id === id)) id = grupos[0].id;
      cfg.querySelectorAll(".cfg-nav-item").forEach((b) => b.classList.toggle("on", b.dataset.grupo === id));
      cfg.querySelectorAll(".cfg-painel").forEach((p) => { p.hidden = p.dataset.painel !== id; });
      try { localStorage.setItem(CHAVE, id); } catch {}
      // grupo com um bloco só: já abre ele
      const g = grupos.find((x) => x.id === id);
      if (g.itens.length === 1) {
        const corpo = document.getElementById(`accordion-${g.itens[0]}`);
        if (corpo && corpo.style.display !== "flex" && typeof toggleAccordion === "function") toggleAccordion(g.itens[0]);
      }
    };
    cfg.querySelector(".cfg-nav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-grupo]");
      if (b) abrir(b.dataset.grupo);
    });
    let salvo = null;
    try { salvo = localStorage.getItem(CHAVE); } catch {}
    abrir(salvo);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
