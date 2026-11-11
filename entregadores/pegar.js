/* pegar.js — aba "Pedidos": o que está pronto pra sair. Toca pra escolher e "Iniciar rota" leva todos de uma vez
   (o app vai pra aba "Na rua" com a rota desenhada no mapa).
   Se outro entregador pegar antes, o pedido some na hora (tempo real) e o app avisa. */
const pegar = (() => {
  let tRecarregar = null;

  async function recarregar() {
    if (!S.conta) return;
    try {
      const r = await api("/api/v1/entregador/fila");
      S.fila = r.prontos;
      S.emPreparo = r.em_preparo;
      // escolhidos que não estão mais na fila (outro pegou, voltou pra cozinha, cancelou)
      for (const id of [...S.sel]) if (!S.fila.some((p) => p.id === id)) S.sel.delete(id);
      desenhar();
    } catch {}
  }
  // várias mudanças seguidas (o caixa avançou 5 pedidos): busca uma vez só
  function recarregarLogo() { clearTimeout(tRecarregar); tRecarregar = setTimeout(recarregar, 250); }

  function cardHtml(p) {
    const min = minutosDesde(p.pronto_em);
    const itens = p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(", ");
    return `
      <button type="button" class="pedido${S.sel.has(p.id) ? " sel" : ""}" data-id="${esc(p.id)}" aria-pressed="${S.sel.has(p.id)}">
        <div class="ped-topo">
          <span class="ped-num">#${esc(p.numero)}</span>
          <span class="ped-tempo${min > 10 ? " demora" : ""}">pronto ${haQuanto(p.pronto_em)}</span>
          <span class="ped-check" aria-hidden="true">✓</span>
        </div>
        <p class="ped-end">${esc(p.endereco.rua || p.endereco.bairro || "Endereço não informado")}</p>
        ${p.endereco.bairro || p.endereco.resto ? `<p class="ped-rua">${esc([p.endereco.bairro, p.endereco.resto].filter(Boolean).join(" · "))}</p>` : ""}
        ${pagamentoHtml(p.pagamento, p.total)}
        ${itens ? `<p class="ped-itens">${esc(itens)}</p>` : ""}
      </button>`;
  }

  function desenhar() {
    const lista = $("fila-lista");
    const pausa = S.eu && !S.eu.disponivel;
    $("fila-preparo").textContent = S.emPreparo ? `${plural(S.emPreparo, "pedido", "pedidos")} na cozinha` : "";
    if (!S.fila.length) {
      lista.innerHTML = `<div class="vazio"><span class="vazio-icone" aria-hidden="true">${S.emPreparo ? "🍳" : "✨"}</span>
        <b>Nenhum pedido pronto agora</b>
        <p class="muted">${S.emPreparo ? `${plural(S.emPreparo, "pedido está", "pedidos estão")} sendo preparado${S.emPreparo === 1 ? "" : "s"}. Aparece aqui na hora que ficar pronto.` : "Quando um pedido ficar pronto, ele aparece aqui na hora."}</p></div>`;
    } else {
      lista.innerHTML = (pausa ? `<div class="pag outro" style="margin-bottom:2px"><span class="pag-ic">⏸️</span><div>Você está em pausa<small>Toque na bolinha lá em cima quando for rodar.</small></div></div>` : "")
        + S.fila.map(cardHtml).join("");
    }
    const n = S.fila.length;
    $("badge-pedidos").textContent = n;
    $("badge-pedidos").classList.toggle("hidden", !n);
    barra();
    if (!S.naRua.length) rua.desenhar(); // o painel da aba "Na rua" mostra quantos estão prontos
  }

  // barra de baixo: quantos escolheu e o que levar
  function barra() {
    const escolhidos = S.fila.filter((p) => S.sel.has(p.id));
    const b = $("barra-pegar");
    b.classList.toggle("on", escolhidos.length > 0 && S.aba === "pedidos");
    if (!escolhidos.length) return;
    const troco = escolhidos.reduce((a, p) => a + (p.pagamento.troco || 0), 0);
    const maquininha = escolhidos.some((p) => p.pagamento.tipo === "cartao");
    const extra = [troco ? `levar ${moeda(troco)} de troco` : "", maquininha ? "levar a maquininha" : ""].filter(Boolean).join(" · ");
    $("barra-info").innerHTML = `<b>${plural(escolhidos.length, "pedido", "pedidos")}</b>${extra || "nada pra levar de troco"}`;
    $("btn-pegar").textContent = escolhidos.length === 1 ? "Iniciar rota" : `Iniciar rota (${escolhidos.length})`;
  }

  $("fila-lista").addEventListener("click", (e) => {
    const c = e.target.closest(".pedido");
    if (!c) return;
    const id = c.dataset.id;
    if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
    c.classList.toggle("sel", S.sel.has(id));
    c.setAttribute("aria-pressed", S.sel.has(id));
    vibrar(15);
    barra();
  });

  $("btn-pegar").addEventListener("click", async () => {
    const ids = S.fila.filter((p) => S.sel.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    const btn = $("btn-pegar");
    btn.disabled = true; btn.textContent = "Montando a rota…";
    try {
      const r = await api("/api/v1/entregador/pegar", { method: "POST", body: { ids } });
      S.sel.clear();
      const perdidos = r.perdidos.map((id) => S.fila.find((p) => p.id === id)?.numero).filter(Boolean);
      S.fila = S.fila.filter((p) => !ids.includes(p.id));
      desenhar();
      if (r.pegos.length) {
        vibrar(60);
        aviso(perdidos.length
          ? `Pegou ${plural(r.pegos.length, "pedido", "pedidos")}. ${perdidos.map((n) => "#" + n).join(", ")} já tinha${perdidos.length > 1 ? "m" : ""} sido pego por outro entregador.`
          : `Rota com ${plural(r.pegos.length, "entrega", "entregas")}. Boa entrega!`, perdidos.length ? "ruim" : "bom");
        await rua.recarregar();
        app.irPara("rua");
      } else {
        aviso(`${perdidos.length > 1 ? "Esses pedidos já foram pegos" : "Esse pedido já foi pego"} por outro entregador. Escolha outro.`, "ruim");
      }
    } catch (err) { aviso(err.message, "ruim"); }
    btn.disabled = false;
    barra();
    recarregarLogo();
  });

  // outro entregador (ou o caixa) levou: tira da tela com animação
  function saiuDaFila(ids, quem) {
    const meu = S.conta?.entregador.id === quem;
    const perdidosSel = ids.filter((id) => S.sel.has(id));
    ids.forEach((id) => {
      S.sel.delete(id);
      const c = document.querySelector(`.pedido[data-id="${CSS.escape(id)}"]`);
      if (c) c.classList.add("saindo");
    });
    if (perdidosSel.length && !meu) {
      const nums = perdidosSel.map((id) => S.fila.find((p) => p.id === id)?.numero).filter(Boolean);
      vibrar([80, 60, 80]);
      aviso(`${nums.map((n) => "#" + n).join(", ")} foi pego por outro entregador`, "ruim");
    }
    setTimeout(() => { S.fila = S.fila.filter((p) => !ids.includes(p.id)); desenhar(); }, 250);
  }

  // o "pronto há X min" anda sozinho
  setInterval(() => { if (S.aba === "pedidos" && S.fila.length && !document.hidden) document.querySelectorAll("#fila-lista .pedido").forEach((c) => {
    const p = S.fila.find((x) => x.id === c.dataset.id); const t = c.querySelector(".ped-tempo");
    if (p && t) { t.textContent = `pronto ${haQuanto(p.pronto_em)}`; t.classList.toggle("demora", minutosDesde(p.pronto_em) > 10); }
  }); }, 30000);

  return { recarregar, recarregarLogo, desenhar, barra, saiuDaFila };
})();
