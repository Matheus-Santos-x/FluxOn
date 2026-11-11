/* ganhos.js — aba "Meu dia": quanto vai receber hoje, as entregas feitas e o dinheiro das rodadas.
   O dia começa às 5h da manhã (quem roda de madrugada não vira o dia no meio do turno). */
const ganhos = (() => {
  const TIPO = { entrega: "Recebe por entrega", diaria_entrega: "Diária + por entrega", diaria: "Diária" };

  async function recarregar() {
    if (!S.conta) return;
    try { S.dia = await api("/api/v1/entregador/dia"); desenhar(); } catch (err) { $("dia-conteudo").innerHTML = `<div class="vazio"><b>Não deu pra carregar</b><p class="muted">${esc(err.message)}</p></div>`; }
  }

  function desenhar() {
    const d = S.dia;
    if (!d) return;
    const g = d.ganhos;
    const linhas = [];
    if (g.tipo_pagamento !== "diaria") linhas.push([`${plural(g.entregas, "entrega", "entregas")}`, moeda(g.por_entrega)]);
    else linhas.push([`${plural(g.entregas, "entrega feita", "entregas feitas")}`, "—"]);
    if (g.tipo_pagamento !== "entrega") linhas.push([g.diaria ? "Diária" : "Diária (conta quando você rodar hoje)", moeda(g.diaria || g.valor_diaria)]);

    const acertadas = d.rodadas.filter((r) => r.status === "acertada" && r.dinheiro > 0);
    const pendentes = d.rodadas.filter((r) => r.status === "a_acertar");
    const devolvido = acertadas.reduce((a, r) => a + (r.recebido ?? r.dinheiro), 0);
    const pendente = pendentes.reduce((a, r) => a + r.dinheiro, 0);

    $("dia-conteudo").innerHTML = `
      <div class="total-dia">
        <small>A receber hoje · ${esc(TIPO[g.tipo_pagamento] || "")}</small>
        <span class="valor">${moeda(g.total)}</span>
        ${linhas.map(([a, b]) => `<div class="conta-linha"><span>${esc(a)}</span><span>${b}</span></div>`).join("")}
      </div>
      ${(devolvido || pendente) ? `
      <div class="bloco">
        <h3>Dinheiro dos clientes</h3>
        <div class="linha"><div class="meio"><b>Devolvido no caixa</b><small>${plural(acertadas.length, "rodada conferida", "rodadas conferidas")}</small></div><span class="direita" style="color:var(--dinheiro)">${moeda(devolvido)}</span></div>
        ${pendente ? `<div class="linha"><div class="meio"><b>Falta devolver</b><small>esperando o caixa conferir</small></div><span class="direita" style="color:var(--troco)">${moeda(pendente)}</span></div>` : ""}
      </div>` : ""}
      <div class="bloco">
        <h3>Entregas de hoje</h3>
        ${d.entregas.length ? d.entregas.map((e) => `
          <div class="linha">
            <span class="hora">${hora(e.em)}</span>
            <div class="meio"><b>#${esc(e.numero)} · ${esc(e.bairro || "—")}</b><small>${esc(e.cliente || "")}</small></div>
            ${g.tipo_pagamento !== "diaria" ? `<span class="direita">${moeda(e.taxa)}</span>` : ""}
          </div>`).join("") : `<p class="muted" style="margin:0">Nenhuma entrega ainda hoje.</p>`}
      </div>`;
  }

  /* instalar o app (Android mostra o botão; iPhone, a dica) */
  let pedidoInstalar = null;
  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; $("btn-instalar").hidden = instalado(); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !instalado()) $("btn-instalar").hidden = false;
  $("btn-instalar").addEventListener("click", async () => {
    if (pedidoInstalar) { const p = pedidoInstalar; pedidoInstalar = null; p.prompt(); await p.userChoice.catch(() => null); $("btn-instalar").hidden = true; return; }
    abrirFolha(`<h3>Instalar no iPhone</h3><p>Toque em <b>Compartilhar</b> (o quadrado com a setinha) e depois em <b>"Adicionar à Tela de Início"</b>. O app fica com ícone, igual aos outros.</p><div class="botoes"><button class="btn primario grande" type="button" id="btn-ok-ios">Entendi</button></div>`);
    $("btn-ok-ios").onclick = fecharFolha;
  });

  return { recarregar, desenhar };
})();
