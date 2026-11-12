/* ganhos.js — aba "Meu dia": o turno (começar / encerrar), quanto vai receber, as entregas e o dinheiro das rodadas.
   A diária é por turno. Pegou pedido sem começar o turno? Ele começa sozinho. */
const ganhos = (() => {
  const TIPO = { entrega: "Recebe por entrega", diaria_entrega: "Diária + por entrega", diaria: "Diária" };

  async function recarregar() {
    if (!S.conta) return;
    try { S.dia = await api("/api/v1/entregador/dia"); desenhar(); } catch (err) { $("dia-conteudo").innerHTML = `<div class="vazio"><b>Não deu pra carregar</b><p class="muted">${esc(err.message)}</p></div>`; }
  }

  // começar / encerrar o turno
  async function turno(acao, btn) {
    if (acao === "encerrar" && !btn.dataset.certeza) { btn.dataset.certeza = "1"; btn.textContent = "Toque de novo pra encerrar o turno"; return; }
    btn.disabled = true;
    try {
      await api(`/api/v1/entregador/turno/${acao}`, { method: "POST" });
      if (S.eu) S.eu.disponivel = acao === "comecar";
      perfil.bolinha();
      vibrar(60);
      aviso(acao === "comecar" ? "Turno começado. Bom trabalho!" : "Turno encerrado. Até a próxima!", "bom");
      recarregar();
    } catch (err) { btn.disabled = false; delete btn.dataset.certeza; btn.textContent = acao === "comecar" ? "Começar turno" : "Encerrar turno"; aviso(err.message, "ruim"); }
  }

  function turnoHtml(t) {
    if (t?.aberto) return `
      <div class="bloco turno on">
        <div class="linha"><div class="meio"><b>● Em turno desde ${hora(t.inicio)}</b><small>Tudo que você entregar entra neste turno</small></div></div>
        <button class="btn grande largo" type="button" data-turno="encerrar">Encerrar turno</button>
      </div>`;
    return `
      <div class="bloco turno">
        <div class="linha"><div class="meio"><b>${t ? `Turno encerrado às ${hora(t.fim)}` : "Você ainda não começou o turno"}</b><small>${t ? `Começou às ${hora(t.inicio)}. O resumo dele está aqui embaixo.` : "Se pegar um pedido, o turno começa sozinho."}</small></div></div>
        <button class="btn primario grande largo" type="button" data-turno="comecar">${t ? "Começar novo turno" : "Começar turno"}</button>
      </div>`;
  }

  function desenhar() {
    const d = S.dia;
    if (!d) return;
    const g = d.ganhos;
    const linhas = [];
    if (g.tipo_pagamento !== "diaria") linhas.push([`${plural(g.entregas, "entrega", "entregas")}`, moeda(g.por_entrega)]);
    else linhas.push([`${plural(g.entregas, "entrega feita", "entregas feitas")}`, "—"]);
    if (g.tipo_pagamento !== "entrega") linhas.push([g.diaria ? "Diária do turno" : "Diária (conta quando você começar o turno)", moeda(g.diaria || g.valor_diaria)]);

    const acertadas = d.rodadas.filter((r) => r.status === "acertada" && r.dinheiro > 0);
    const pendentes = d.rodadas.filter((r) => r.status === "a_acertar");
    const devolvido = acertadas.reduce((a, r) => a + (r.recebido ?? r.dinheiro), 0);
    const pendente = pendentes.reduce((a, r) => a + r.dinheiro, 0);

    $("dia-conteudo").innerHTML = `
      ${turnoHtml(d.turno)}
      <div class="total-dia">
        <small>A receber ${d.turno ? "neste turno" : "hoje"} · ${esc(TIPO[g.tipo_pagamento] || "")}</small>
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
        <h3>Entregas ${d.turno ? "do turno" : "de hoje"}</h3>
        ${d.entregas.length ? d.entregas.map((e) => `
          <div class="linha">
            <span class="hora">${hora(e.em)}</span>
            <div class="meio"><b>#${esc(e.numero)} · ${esc(e.bairro || "—")}</b><small>${esc(e.cliente || "")}</small></div>
            ${g.tipo_pagamento !== "diaria" ? `<span class="direita">${moeda(e.taxa)}</span>` : ""}
          </div>`).join("") : `<p class="muted" style="margin:0">Nenhuma entrega ainda${d.turno ? " neste turno" : " hoje"}.</p>`}
      </div>`;
    $("dia-conteudo").querySelectorAll("[data-turno]").forEach((b) => b.addEventListener("click", () => turno(b.dataset.turno, b)));
  }

  return { recarregar, desenhar };
})();
