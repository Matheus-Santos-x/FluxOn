/* rua.js — aba "Na rua": as entregas que estão com o entregador, na ordem em que pegou.
   Cada uma tem rota (Google Maps / Waze), ligar, WhatsApp, o que cobrar e o botão Entregue. */
const rua = (() => {
  let tRec = null, ultimaLista = "";

  async function recarregar() {
    if (!S.conta) return;
    try {
      const r = await api("/api/v1/entregador/minhas");
      const antes = new Map(S.naRua.map((p) => [p.id, p]));
      S.naRua = r.na_rua;
      S.acertos = r.acertos;
      // pedido que sumiu sem ele marcar entregue: cancelado ou o caixa tirou
      for (const [id, p] of antes) if (!S.naRua.some((x) => x.id === id) && !_entreguesAgora.has(id)) aviso(`O pedido #${p.numero} não está mais com você (o restaurante mudou)`, "ruim");
      desenhar();
    } catch {}
  }
  const _entreguesAgora = new Set();
  function mudou() { clearTimeout(tRec); tRec = setTimeout(recarregar, 200); }

  const linkMaps = (end) => `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(end.completo)}`;
  const linkWaze = (end) => `https://waze.com/ul?q=${encodeURIComponent(end.completo)}&navigate=yes`;
  const linkZap = (tel, msg) => `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;

  function cardHtml(p, i) {
    const itens = p.itens.map((x) => `${x.qtd}× ${x.nome}`).join(", ");
    return `
      <article class="pedido entrega" data-id="${esc(p.id)}">
        <div class="ped-topo">
          <span class="ord" aria-label="Entrega ${i + 1}">${i + 1}</span>
          <div style="min-width:0">
            <span class="ped-num">#${esc(p.numero)}</span> <span class="cliente">${esc(p.cliente)}</span><br>
            <span class="ped-tempo">saiu ${haQuanto(p.saiu_em)}</span>
          </div>
          <button type="button" class="menu-mais" data-acao="mais" aria-label="Mais opções do pedido #${esc(p.numero)}">⋯</button>
        </div>
        <p class="ped-bairro">${esc(p.endereco.bairro || p.endereco.rua || "Endereço não informado")}</p>
        ${p.endereco.bairro ? `<p class="ped-rua">${esc(p.endereco.rua)}${p.endereco.resto ? ` · ${esc(p.endereco.resto)}` : ""}</p>` : ""}
        ${pagamentoHtml(p.pagamento, p.total)}
        ${p.obs ? `<p class="ped-obs">📝 ${esc(p.obs)}</p>` : ""}
        ${itens ? `<p class="ped-itens">${esc(itens)}</p>` : ""}
        <div class="acoes">
          <button type="button" class="btn" data-acao="rota"><span aria-hidden="true">🧭</span>Rota</button>
          ${p.telefone ? `<a class="btn" href="tel:${esc(p.telefone)}"><span aria-hidden="true">📞</span>Ligar</a>
          <a class="btn" href="${linkZap(p.telefone, `Oi${p.cliente ? ", " + p.cliente.split(" ")[0] : ""}! Sou o entregador do ${S.conta.restaurante.nome} com o seu pedido #${p.numero}.`)}" target="_blank" rel="noopener"><span aria-hidden="true">💬</span>WhatsApp</a>`
          : `<span></span><span></span>`}
        </div>
        <button type="button" class="btn ok grande" data-acao="entregue">✓ Entregue</button>
      </article>`;
  }

  function desenhar() {
    troco.desenhar();
    const tem = S.naRua.length > 0;
    $("rua-vazio").classList.toggle("hidden", tem || S.acertos.length > 0);
    $("rua-conteudo").classList.toggle("hidden", !tem);
    $("badge-rua").textContent = S.naRua.length || (S.acertos.length ? "$" : "");
    $("badge-rua").classList.toggle("hidden", !tem && !S.acertos.length);
    mapa.precisa(tem);
    if (!tem) return;

    const r = troco.resumo(S.naRua);
    $("resumo-rua").innerHTML = [
      `<span class="chip">🛵 ${plural(S.naRua.length, "entrega", "entregas")}</span>`,
      r.dinheiro ? `<span class="chip dinheiro">💵 Cobrar ${moeda(r.dinheiro)} em dinheiro</span>` : "",
      r.troco ? `<span class="chip dinheiro">Levar ${moeda(r.troco)} de troco</span>` : "",
      r.maquininha ? `<span class="chip">💳 Maquininha</span>` : ""
    ].join("");
    $("rua-lista").innerHTML = S.naRua.map(cardHtml).join("");
    $("btn-rota-todas").classList.toggle("hidden", S.naRua.length < 2);

    // o mapa só redesenha os pinos se a lista mudou (não a cada atualização)
    const chave = S.naRua.map((p) => p.id).join();
    if (chave !== ultimaLista && S.aba === "rua") { ultimaLista = chave; mapa.desenharEntregas(S.naRua); }
  }
  // o mapa só desenha com a aba aberta (o Leaflet precisa da tela visível pra medir)
  function aoMostrar() { if (!S.naRua.length) return; ultimaLista = S.naRua.map((p) => p.id).join(); mapa.desenharEntregas(S.naRua); }

  $("btn-rota-todas").addEventListener("click", () => {
    const ends = S.naRua.map((p) => p.endereco.completo);
    const destino = ends[ends.length - 1];
    const meio = ends.slice(0, -1).slice(0, 9).join("|");
    window.open(`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destino)}${meio ? "&waypoints=" + encodeURIComponent(meio) : ""}`, "_blank");
  });

  $("rua-lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao]");
    if (!b) return;
    const p = S.naRua.find((x) => x.id === b.closest("[data-id]").dataset.id);
    if (!p) return;
    if (b.dataset.acao === "rota") escolherRota(p);
    else if (b.dataset.acao === "entregue") confirmarEntrega(p);
    else if (b.dataset.acao === "mais") maisOpcoes(p);
  });

  function escolherRota(p) {
    abrirFolha(`
      <h3>Rota pro #${esc(p.numero)}</h3>
      <p>${esc(p.endereco.completo)}</p>
      <div class="botoes">
        <a class="btn primario grande" href="${linkMaps(p.endereco)}" target="_blank" rel="noopener">Google Maps</a>
        <a class="btn grande" href="${linkWaze(p.endereco)}" target="_blank" rel="noopener">Waze</a>
      </div>`);
    $("folha-corpo").querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setTimeout(fecharFolha, 300)));
  }

  function confirmarEntrega(p) {
    const pg = p.pagamento;
    const caixa = pg.tipo === "pago"
      ? `<div class="cobrar pago"><small>Já pago online</small><b>Não cobrar</b></div>`
      : pg.tipo === "dinheiro"
        ? `<div class="cobrar dinheiro"><small>Receber em dinheiro</small><b>${moeda(pg.dinheiro)}</b>${pg.troco ? `<small>Dar ${moeda(pg.troco)} de troco (pagou com ${moeda(pg.troco_para)})</small>` : ""}</div>`
        : `<div class="cobrar outro"><small>${pg.tipo === "cartao" ? "Passar na maquininha" : esc(pg.texto)}</small><b>${moeda(p.total)}</b></div>`;
    abrirFolha(`
      <h3>Entregar o #${esc(p.numero)}?</h3>
      <p>${esc(p.cliente)} · ${esc(p.endereco.bairro || p.endereco.rua)}</p>
      ${caixa}
      <div class="botoes">
        <button class="btn ok grande" type="button" id="btn-confirma-entrega">${pg.tipo === "pago" ? "Entreguei" : pg.tipo === "dinheiro" ? "Recebi e entreguei" : "Cobrei e entreguei"}</button>
        <button class="btn link" type="button" id="btn-cancela-entrega">Voltar</button>
      </div>`);
    $("btn-cancela-entrega").onclick = fecharFolha;
    $("btn-confirma-entrega").onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = "Salvando…";
      try {
        _entreguesAgora.add(p.id);
        await api("/api/v1/entregador/entregue", { method: "POST", body: { id: p.id } });
        fecharFolha();
        vibrar(80);
        S.naRua = S.naRua.filter((x) => x.id !== p.id);
        aviso(S.naRua.length ? `#${p.numero} entregue ✓ Faltam ${S.naRua.length}` : `#${p.numero} entregue ✓ Todas feitas, pode voltar!`, "bom");
        desenhar();
        mudou();
      } catch (err) {
        _entreguesAgora.delete(p.id);
        btn.disabled = false; btn.textContent = "Tentar de novo";
        aviso(err.message, "ruim");
      }
    };
  }

  function maisOpcoes(p) {
    abrirFolha(`
      <h3>Não deu pra entregar o #${esc(p.numero)}?</h3>
      <p>O pedido volta pro restaurante como "pronto" e o caixa fica sabendo do motivo.</p>
      <div class="opcoes-motivo">
        ${["Cliente não atendeu", "Endereço não encontrado", "Cliente recusou o pedido", "Pedido com problema"].map((m) => `<button class="btn" type="button" data-motivo="${esc(m)}">${esc(m)}</button>`).join("")}
      </div>
      <div class="botoes"><button class="btn link" type="button" id="btn-fecha-mais">Voltar</button></div>`);
    $("btn-fecha-mais").onclick = fecharFolha;
    $("folha-corpo").querySelector(".opcoes-motivo").onclick = async (e) => {
      const b = e.target.closest("[data-motivo]");
      if (!b) return;
      b.disabled = true;
      try {
        _entreguesAgora.add(p.id);
        await api("/api/v1/entregador/devolver", { method: "POST", body: { id: p.id, motivo: b.dataset.motivo } });
        fecharFolha();
        aviso(`#${p.numero} volta pro restaurante. Leve o pedido de volta.`);
        recarregar();
      } catch (err) { _entreguesAgora.delete(p.id); b.disabled = false; aviso(err.message, "ruim"); }
    };
  }

  setInterval(() => { if (S.aba === "rua" && !document.hidden) document.querySelectorAll("#rua-lista .entrega").forEach((c) => {
    const p = S.naRua.find((x) => x.id === c.dataset.id); const t = c.querySelector(".ped-tempo");
    if (p && t) t.textContent = `saiu ${haQuanto(p.saiu_em)}`;
  }); }, 30000);

  return { recarregar, mudou, desenhar, aoMostrar };
})();
