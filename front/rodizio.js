/* =====================================================================
   FluxON Operacional · RODÍZIO (visual novo)
   Troca só o desenho da lista e da tela do rodízio. As janelas (novo rodízio,
   adicionar reserva, Pix, alterar pessoas, detalhes da reserva) continuam as do script.js.
   - Próximos em cima; os que já passaram vão pra "Encerrados" (fechado, sem reserva nova)
   - Na reserva paga, o botão "Marcar chegada" marca como resgatada sem abrir janela
===================================================================== */
(() => {
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const esc = (s) => escapeHtml(s);

  function dataBloco(d, mini) {
    const [y, m, dd] = String(d || "").split("-").map(Number);
    if (!y) return `<span class="rz-data${mini ? " mini" : ""}"><b>?</b></span>`;
    const dia = new Date(y, m - 1, dd);
    return `<span class="rz-data${mini ? " mini" : ""}" aria-hidden="true"><b>${dd}</b><small>${MES[m - 1]}</small>${mini ? "" : `<i>${SEM[dia.getDay()]}</i>`}</span>`;
  }
  function situacao(r) {
    if (r.encerrado) return ["Encerrado", "fim"];
    if (r.vagas && r.restantes <= 0) return ["Lotado", "lotado"];
    if (r.status !== "aberto") return ["Fechado", "fechado"];
    return [r.data_evento === hoje() ? "Hoje · aberto" : "Aberto", "aberto"];
  }
  const precos = (r) => `${formatCurrency(r.preco)} adulto${r.preco_crianca != null ? ` · ${formatCurrency(r.preco_crianca)} criança` : ""}`;
  const barra = (r) => {
    const p = r.vagas > 0 ? Math.min(100, Math.round((r.ocupadas / r.vagas) * 100)) : 0;
    return `<span class="rz-barra${p >= 90 ? " cheia" : p >= 60 ? " meio" : ""}"><i style="width:${p}%"></i></span>`;
  };

  /* ---------- lista ---------- */
  rodRenderLista = async function () {
    const c = document.getElementById("rodizio-content");
    const top = document.getElementById("rod-top");
    top.innerHTML = `<button class="primary-button" id="rod-novo">＋ Novo rodízio</button>`;
    document.getElementById("rod-novo").onclick = rodNovo;
    c.innerHTML = `<p class="rz-vazio-txt">Carregando...</p>`;
    try { rodState.lista = await rodizioApi(""); }
    catch (e) { c.innerHTML = `<p class="rz-vazio-txt">${esc(e.message)}</p>`; return; }

    const proximos = rodState.lista.filter((r) => !r.encerrado).sort((a, b) => String(a.data_evento).localeCompare(String(b.data_evento)));
    const encerrados = rodState.lista.filter((r) => r.encerrado);
    c.innerHTML = `
      <div class="rz">
        <section>
          <div class="rz-sec-topo"><h3>Próximos</h3><span>${proximos.length ? `${proximos.length} rodízio${proximos.length > 1 ? "s" : ""}` : ""}</span></div>
          ${proximos.length ? `<div class="rz-grade">${proximos.map((r) => {
            const [txt, cls] = situacao(r);
            return `
              <button type="button" class="rz-card" data-rod="${esc(r.id)}">
                ${dataBloco(r.data_evento)}
                <span class="rz-card-meio">
                  <span class="rz-card-nome"><b>${esc(r.nome)}</b><em class="rz-st ${cls}">${txt}</em></span>
                  <small>${esc(r.horario || "")} · ${precos(r)}</small>
                  ${barra(r)}
                  <small class="rz-vagas"><b>${r.ocupadas}</b> de ${r.vagas} vagas · ${r.restantes} livre${r.restantes === 1 ? "" : "s"}</small>
                </span>
              </button>`;
          }).join("")}</div>`
          : `<div class="rz-vazio"><span aria-hidden="true">🍣</span><b>Nenhum rodízio marcado</b><p>Abra um rodízio com a data, o horário, o preço e as vagas. O cliente reserva e paga pelo Pix.</p><button class="primary-button" type="button" onclick="rodNovo()">＋ Novo rodízio</button></div>`}
        </section>
        ${encerrados.length ? `
        <details class="rz-encerrados">
          <summary>Encerrados <span>${encerrados.length}</span></summary>
          <div class="rz-linhas">${encerrados.map((r) => `
            <button type="button" class="rz-linha" data-rod="${esc(r.id)}">
              ${dataBloco(r.data_evento, true)}
              <span class="rz-linha-meio"><b>${esc(r.nome)}</b><small>${esc(r.horario || "")} · ${r.ocupadas} pessoa${r.ocupadas === 1 ? "" : "s"}</small></span>
              <span class="rz-seta" aria-hidden="true">›</span>
            </button>`).join("")}</div>
        </details>` : ""}
      </div>`;
    c.querySelectorAll("[data-rod]").forEach((el) => (el.onclick = () => rodAbrir(el.dataset.rod)));
  };

  /* ---------- um rodízio ---------- */
  rodRenderDetalhe = function () {
    const r = rodState.atual, res = rodState.reservas || [];
    if (!r) return rodRenderLista();
    const ativas = res.filter((x) => x.status !== "cancelado");
    const total = ativas.reduce((s, x) => s + Number(x.valor_pago || 0), 0);
    const chegaram = res.filter((x) => x.status === "resgatado").length;
    const faltam = res.filter((x) => x.status === "pago").length;
    const aberto = r.status === "aberto";
    const [txt, cls] = situacao(r);
    const ordem = { pago: 0, resgatado: 1, cancelado: 2 };
    const lista = [...res].sort((a, b) => (ordem[a.status] ?? 3) - (ordem[b.status] ?? 3) || String(a.nome).localeCompare(String(b.nome)));
    const c = document.getElementById("rodizio-content");
    c.innerHTML = `
      <div class="rz rz-det">
        <section class="rz-topo">
          ${dataBloco(r.data_evento)}
          <div class="rz-topo-meio">
            <div class="rz-card-nome"><h2>${esc(r.nome)}</h2><em class="rz-st ${cls}">${txt}</em></div>
            <p>${esc(rodDataBR(r.data_evento, r.horario))} · ${precos(r)}</p>
          </div>
        </section>

        <div class="rz-nums">
          <div><small>Pessoas</small><b>${r.ocupadas}<span>/${r.vagas}</span></b>${barra(r)}</div>
          <div><small>Livres</small><b>${r.restantes}</b></div>
          <div><small>Arrecadado</small><b class="ouro">${formatCurrency(total)}</b></div>
        </div>

        <div class="rz-acoes">
          ${r.encerrado ? "" : `<button class="primary-button" type="button" id="rd-add">＋ Adicionar reserva</button>
          <button class="ghost-button" type="button" id="rd-toggle">${aberto ? "Fechar reservas" : "Reabrir reservas"}</button>`}
          <button class="rz-remover" type="button" id="rd-del">Remover rodízio</button>
        </div>

        <section class="rz-res">
          <div class="rz-sec-topo"><h3>Reservas</h3><span>${res.length ? `${chegaram} chegou${chegaram === 1 ? "" : "aram"} · ${faltam} a chegar` : ""}</span></div>
          ${lista.length ? `<div class="rz-linhas">${lista.map((x) => `
            <div class="rz-reserva ${x.status}" data-res="${esc(x.id)}" role="button" tabindex="0">
              <span class="rz-av" aria-hidden="true">${esc((x.nome || "?").trim().charAt(0).toUpperCase())}</span>
              <span class="rz-linha-meio"><b>${esc(x.nome)}</b><small>${esc(x.telefone || "sem telefone")} · ${rodPessoas(x)}</small></span>
              <span class="rz-reserva-dir">
                <b>${formatCurrency(x.valor_pago)}</b>
                ${x.status === "pago" && !r.encerrado ? `<button type="button" class="rz-chegou" data-chegou="${esc(x.id)}">Marcar chegada</button>`
                  : `<em class="rz-st ${x.status === "resgatado" ? "chegou" : x.status === "cancelado" ? "cancelado" : "fechado"}">${x.status === "resgatado" ? "Chegou" : x.status === "cancelado" ? "Cancelada" : "Não veio"}</em>`}
              </span>
            </div>`).join("")}</div>`
          : `<p class="rz-vazio-txt">Nenhuma reserva paga ainda.${r.encerrado ? "" : " Quando o cliente pagar o Pix, ela aparece aqui sozinha."}</p>`}
        </section>
      </div>`;

    document.getElementById("rd-toggle")?.addEventListener("click", async () => {
      try { await rodizioApi(`/${r.id}`, { method: "PATCH", body: JSON.stringify({ status: aberto ? "fechado" : "aberto" }) }); rodRecarregar(); }
      catch (e) { alert(e.message); }
    });
    document.getElementById("rd-add")?.addEventListener("click", () => rodAdicionar());
    document.getElementById("rd-del").onclick = () => {
      const comDinheiro = res.some((x) => x.status === "pago" || x.status === "resgatado");
      showConfirmModal(comDinheiro
        ? "Remover este rodízio da lista? O valor arrecadado continua no caixa e no Owner."
        : "Remover este rodízio?", async () => {
        try { await rodizioApi(`/${r.id}`, { method: "DELETE" }); rodRenderLista(); }
        catch (e) { alert(e.message); }
      });
    };
    c.querySelectorAll("[data-chegou]").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      b.disabled = true; b.textContent = "...";
      try { await rodizioApi(`/reservas/${b.dataset.chegou}`, { method: "PATCH", body: JSON.stringify({ status: "resgatado" }) }); rodRecarregar(); }
      catch (err) { alert(err.message); b.disabled = false; b.textContent = "Marcar chegada"; }
    }));
    c.querySelectorAll("[data-res]").forEach((el) => {
      el.onclick = () => rodReserva(el.dataset.res);
      el.onkeydown = (e) => { if (e.key === "Enter") rodReserva(el.dataset.res); };
    });
  };
})();
