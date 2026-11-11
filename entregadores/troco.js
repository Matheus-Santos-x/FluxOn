/* troco.js — dinheiro das rodadas. Entregou tudo e recebeu em dinheiro: aparece UMA linha
   "Devolver R$ X no caixa" em cima das entregas. Não trava nada: dá pra pegar pedido novo normalmente.
   Quando o caixa confere, a linha some e o app avisa. */
const troco = (() => {
  let anteriores = new Set();

  function desenhar() {
    const box = $("acertos");
    if (!S.acertos.length) box.innerHTML = "";
    else {
      const total = S.acertos.reduce((a, x) => a + (x.dinheiro || 0), 0);
      const nums = S.acertos.flatMap((x) => x.pedidos.map((p) => "#" + p.numero));
      box.innerHTML = `
        <div class="acerto" role="status">
          <span class="acerto-ic" aria-hidden="true">💵</span>
          <div class="acerto-txt">
            <b>Devolver ${moeda(total)} no caixa</b>
            <small>${esc(nums.join(", "))} · esperando o caixa conferir</small>
          </div>
        </div>`;
    }
    // rodada que sumiu = o caixa conferiu
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
