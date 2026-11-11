/* troco.js — dinheiro da rodada. Entregou tudo e recebeu em dinheiro: o app mostra quanto devolver no caixa
   e fica esperando o caixa conferir. Conferiu, some e avisa. */
const troco = (() => {
  let anteriores = new Set();

  function desenhar() {
    const box = $("acertos");
    box.innerHTML = S.acertos.map((a) => `
      <div class="acerto" data-id="${esc(a.id)}">
        <small>Devolver no caixa</small>
        <b>${moeda(a.dinheiro)}</b>
        <div class="linhas">${a.pedidos.map((p) => `<span>#${esc(p.numero)} · ${moeda(p.dinheiro)}</span>`).join("")}</div>
        <p class="espera">Esperando o caixa conferir</p>
      </div>`).join("");
    // acerto que sumiu = o caixa conferiu
    const agora = new Set(S.acertos.map((a) => a.id));
    const conferidos = [...anteriores].filter((id) => !agora.has(id));
    if (conferidos.length && anteriores.size) { vibrar(60); aviso("O caixa conferiu o dinheiro ✓", "bom"); }
    anteriores = agora;
  }

  // quanto vai cobrar em dinheiro e quanto de troco levar, somando as entregas que estão com ele
  function resumo(lista) {
    const dinheiro = lista.reduce((a, p) => a + (p.pagamento.dinheiro || 0), 0);
    const trocoLevar = lista.reduce((a, p) => a + (p.pagamento.troco || 0), 0);
    const maquininha = lista.some((p) => p.pagamento.tipo === "cartao");
    return { dinheiro, troco: trocoLevar, maquininha };
  }

  return { desenhar, resumo };
})();
