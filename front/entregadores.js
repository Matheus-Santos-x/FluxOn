/* =====================================================================
   FluxON Operacional · ENTREGADORES
   - Menu "🛵 Entregadores": cadastro, mapa ao vivo, dinheiro pra conferir e o resumo do dia
   - Card do Kanban mostra "🛵 Nome" de quem levou
   - Janela do pedido: "Mandar pro entregador" / trocar / tirar dele
   - Na janela do pedido dá pra marcar outros pedidos prontos pra "levar junto" (vários de uma vez)
   Usa o que já existe no script.js: API_BASE, socket, orders, getRestaurantId, buildHeaders,
   escapeHtml, formatCurrency, closeOrderModal, renderBoard, activeOrderId, modalItems.
===================================================================== */
(() => {
  const E = { lista: [], acertos: [], hoje: null, config: null, carregou: false, mapa: null, marcadores: new Map() };
  const rid = () => getRestaurantId();
  const url = (p = "") => `${API_BASE}/api/v1/entregadores/${rid()}${p}`;
  const esc = (s) => escapeHtml(s);
  const moeda = (v) => formatCurrency(v);
  const primeiro = (n) => String(n || "").trim().split(/\s+/)[0] || "Entregador";
  const TIPO = { entrega: "Só por entrega", diaria_entrega: "Diária + por entrega", diaria: "Só diária" };

  async function api(p, opts = {}) {
    const r = await fetch(url(p), { ...opts, headers: buildHeaders(), body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j?.error || "Não deu certo. Tente de novo.");
    return j;
  }

  /* ---------- aviso rápido ---------- */
  function aviso(msg, ruim) {
    let t = document.getElementById("ent-toast");
    if (!t) { t = document.createElement("div"); t.id = "ent-toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = ruim ? "on ruim" : "on";
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = ""), 3500);
  }

  /* ---------- carregar ---------- */
  let _tLista = null;
  async function carregarLista() {
    if (!rid() || !localStorage.getItem("fluxon_token")) return;
    try { E.lista = await api(""); E.carregou = true; } catch { return; }
    if (visivel()) { desenharEntregadores(); desenharMapa(); }
    if (typeof renderBoard === "function" && typeof orders !== "undefined" && orders.some((o) => o.entregador_id)) {
      clearTimeout(_tLista); _tLista = setTimeout(() => { if (!document.querySelector(".modal-backdrop.open")) renderBoard(); }, 300);
    }
  }
  async function carregarAcertos() {
    if (!rid() || !localStorage.getItem("fluxon_token")) return;
    const antes = new Set(E.acertos.map((a) => a.id));
    try { E.acertos = await api("/acertos"); } catch { return; }
    const novos = E.acertos.filter((a) => !antes.has(a.id));
    if (novos.length && E._jaCarregouAcertos) aviso(`${primeiro(novos[0].entregador.nome)} voltou: conferir ${moeda(novos[0].dinheiro)} em dinheiro`);
    E._jaCarregouAcertos = true;
    badge();
    if (visivel()) desenharAcertos();
  }
  async function carregarHoje() {
    try { E.hoje = await api("/hoje"); } catch { return; }
    if (visivel()) desenharHoje();
  }
  async function carregarConfig() {
    try { E.config = await api("/config"); } catch { E.config = { avisar_cliente: true, link_app: null }; }
    if (visivel()) desenharTopo();
  }
  const tudo = () => Promise.all([carregarLista(), carregarAcertos(), carregarHoje(), carregarConfig()]);

  /* ---------- menu lateral e tela ---------- */
  function montarMenu() {
    const ref = document.getElementById("drawer-resumo-dia"); // fica em Administrativo, embaixo do Caixa
    if (!ref || document.getElementById("drawer-entregadores")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "drawer-item"; b.id = "drawer-entregadores";
    b.innerHTML = `<span class="drawer-icon">🛵</span> Entregadores <em class="ent-badge" id="ent-badge" hidden></em>`;
    ref.insertAdjacentElement("afterend", b);
    b.addEventListener("click", mostrar);
    // qualquer outro item do menu (ou a engrenagem) esconde esta tela
    document.querySelector(".drawer-nav")?.addEventListener("click", (e) => { if (!e.target.closest("#drawer-entregadores") && e.target.closest(".drawer-item")) esconder(); }, true);
    document.getElementById("drawer-settings")?.addEventListener("click", esconder, true);

    const v = document.createElement("main");
    v.className = "crm-view hidden"; v.id = "entregadores-view";
    v.innerHTML = `
      <div class="crm-header">
        <div class="crm-title">🛵 Entregadores</div>
        <button class="primary-button" type="button" id="ent-novo">+ Novo entregador</button>
      </div>
      <div class="ent-grade">
        <div class="ent-col">
          <section class="ent-bloco ent-acertos-bloco" id="ent-acertos-bloco" hidden>
            <h3>💵 Dinheiro pra conferir</h3>
            <div id="ent-acertos"></div>
          </section>
          <section class="ent-bloco">
            <div class="ent-bloco-topo"><h3>Agora</h3><span class="ent-muted" id="ent-agora-resumo"></span></div>
            <div class="ent-mapa" id="ent-mapa"></div>
            <div id="ent-lista" class="ent-lista"></div>
          </section>
        </div>
        <div class="ent-col">
          <section class="ent-bloco">
            <div class="ent-bloco-topo"><h3>Hoje</h3><span class="ent-muted">desde as 5h</span></div>
            <div id="ent-hoje"></div>
          </section>
          <section class="ent-bloco" id="ent-topo"></section>
        </div>
      </div>`;
    const depois = document.getElementById("rodizio-view") || document.getElementById("crm-view");
    (depois?.parentElement || document.body).insertBefore(v, depois?.nextSibling || null);
    document.getElementById("ent-novo").addEventListener("click", () => formulario());
  }

  const visivel = () => !document.getElementById("entregadores-view")?.classList.contains("hidden");
  function mostrar() {
    board?.classList.add("hidden");
    crmView?.classList.add("hidden");
    resultsView?.classList.add("hidden");
    ["autoatendimento-view", "settings-view", "cardapio-view", "fidelidade-view", "mesas-view", "home-view", "admin-view", "rodizio-view", "tabs-bar", "open-create"]
      .forEach((id) => document.getElementById(id)?.classList.add("hidden"));
    if (typeof hideTabsBar === "function") hideTabsBar();
    if (typeof closeDrawer === "function") closeDrawer();
    document.getElementById("entregadores-view").classList.remove("hidden");
    document.querySelectorAll(".drawer-item").forEach((d) => d.classList.toggle("active", d.id === "drawer-entregadores"));
    desenharTudo();
    tudo();
  }
  function esconder() { document.getElementById("entregadores-view")?.classList.add("hidden"); }
  function desenharTudo() { desenharAcertos(); desenharEntregadores(); desenharHoje(); desenharTopo(); desenharMapa(); }

  function badge() {
    const b = document.getElementById("ent-badge");
    if (!b) return;
    b.textContent = E.acertos.length;
    b.hidden = !E.acertos.length;
  }

  /* ---------- dinheiro pra conferir ---------- */
  function desenharAcertos() {
    const bloco = document.getElementById("ent-acertos-bloco");
    if (!bloco) return;
    bloco.hidden = !E.acertos.length;
    document.getElementById("ent-acertos").innerHTML = E.acertos.map((a) => `
      <div class="ent-acerto" data-id="${esc(a.id)}">
        <div class="ent-acerto-topo">
          <div><b>${esc(a.entregador.nome)}</b><span class="ent-muted">voltou às ${new Date(a.voltou_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div>
          <span class="ent-acerto-valor">${moeda(a.dinheiro)}</span>
        </div>
        <div class="ent-acerto-peds">${a.pedidos.map((p) => `<span>#${esc(p.numero)} · ${moeda(p.dinheiro)}</span>`).join("")}</div>
        ${a.troco_levado ? `<p class="ent-muted ent-dica">Ele levou ${moeda(a.troco_levado)} de troco. Se pegou esse troco aqui no caixa, devolve junto.</p>` : ""}
        <div class="ent-acerto-acao">
          <label>Recebido <input type="text" inputmode="decimal" value="${String(a.dinheiro.toFixed(2)).replace(".", ",")}" aria-label="Valor recebido de ${esc(a.entregador.nome)}"></label>
          <button class="primary-button" type="button" data-acao="recebi">Recebi</button>
        </div>
      </div>`).join("");
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#ent-acertos [data-acao='recebi']");
    if (!b) return;
    const card = b.closest(".ent-acerto");
    const valor = card.querySelector("input").value.replace(/\./g, "").replace(",", ".");
    b.disabled = true;
    try {
      const r = await api(`/acertos/${card.dataset.id}`, { method: "POST", body: { valor_recebido: valor } });
      aviso(r.diferenca ? `Acerto salvo com diferença de ${moeda(r.diferenca)}` : "Acerto feito ✓", !!r.diferenca && r.diferenca < 0);
      carregarAcertos(); carregarHoje();
    } catch (err) { aviso(err.message, true); b.disabled = false; }
  });

  /* ---------- lista de entregadores ---------- */
  function situacao(e) {
    if (!e.ativo) return ["desativado", "off"];
    if (e.na_rua.length) return [`na rua com ${e.na_rua.length}`, "rua"];
    if (e.conectado && e.disponivel) return ["disponível", "ok"];
    if (e.conectado) return ["em pausa", "pausa"];
    if (!e.ja_entrou) return ["ainda não entrou no app", "off"];
    return ["fora do app", "off"];
  }
  function desenharEntregadores() {
    const box = document.getElementById("ent-lista");
    if (!box) return;
    const ativos = E.lista.filter((e) => e.ativo);
    const naRua = ativos.filter((e) => e.na_rua.length).length, disp = ativos.filter((e) => e.conectado && e.disponivel && !e.na_rua.length).length;
    document.getElementById("ent-agora-resumo").textContent = ativos.length ? `${naRua} na rua · ${disp} disponíve${disp === 1 ? "l" : "is"}` : "";
    if (!E.lista.length) {
      box.innerHTML = `<div class="ent-vazio"><b>Nenhum entregador cadastrado</b><p>Cadastre o nome e o WhatsApp. Ele entra no app com um código e pega os pedidos prontos sozinho.</p><button class="primary-button" type="button" onclick="document.getElementById('ent-novo').click()">+ Cadastrar o primeiro</button></div>`;
      return;
    }
    const ordem = { rua: 0, ok: 1, pausa: 2, off: 3 };
    box.innerHTML = [...E.lista].sort((a, b) => ordem[situacao(a)[1]] - ordem[situacao(b)[1]] || a.nome.localeCompare(b.nome)).map((e) => {
      const [txt, cls] = situacao(e);
      return `
      <div class="ent-item${e.ativo ? "" : " inativo"}" data-id="${esc(e.id)}">
        <span class="ent-ponto ${cls}" aria-hidden="true"></span>
        <div class="ent-item-meio">
          <b>${esc(e.nome)}</b>
          <span class="ent-muted">${esc(txt)}${e.posicao && e.na_rua.length ? ` · posição ${haQuanto(e.posicao.em)}` : ""} · ${esc(TIPO[e.tipo_pagamento])}${e.tipo_pagamento !== "entrega" ? ` ${moeda(e.valor_diaria)}` : ""}${e.tipo_pagamento !== "diaria" && e.valor_entrega ? ` · ${moeda(e.valor_entrega)}/${e.entrega_por_km ? "km" : "entrega"}` : ""}</span>
          ${e.na_rua.length ? `<span class="ent-peds">${e.na_rua.map((p) => `#${esc(p.numero)}${p.bairro ? " " + esc(p.bairro) : ""}`).join(" · ")}</span>` : ""}
        </div>
        <div class="ent-item-acoes">
          ${e.ativo ? `<button class="ghost-button small" type="button" data-acao="codigo" title="Código pra entrar no app">🔑 Código</button>` : ""}
          <button class="ghost-button small" type="button" data-acao="editar">Editar</button>
        </div>
      </div>`;
    }).join("");
  }
  function haQuanto(iso) {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 20 ? "agora" : s < 60 ? `há ${s}s` : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)}h`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#ent-lista [data-acao]");
    if (!b) return;
    const ent = E.lista.find((x) => x.id === b.closest("[data-id]").dataset.id);
    if (!ent) return;
    if (b.dataset.acao === "editar") formulario(ent);
    else if (b.dataset.acao === "codigo") gerarCodigo(ent);
  });

  /* ---------- janela própria (cadastro, código, escolher entregador) ---------- */
  function janela(html) {
    fecharJanela();
    const f = document.createElement("div");
    f.className = "ent-janela-fundo"; f.id = "ent-janela";
    f.innerHTML = `<div class="ent-janela" role="dialog" aria-modal="true">${html}</div>`;
    f.addEventListener("click", (e) => { if (e.target === f || e.target.closest("[data-fechar]")) fecharJanela(); });
    document.body.appendChild(f);
    setTimeout(() => f.querySelector("input, button.primary-button")?.focus(), 30);
    return f;
  }
  function fecharJanela() { document.getElementById("ent-janela")?.remove(); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharJanela(); });

  function formulario(ent) {
    const novo = !ent;
    const tel = String(ent?.telefone || "").replace(/^55/, "");
    const f = janela(`
      <h3>${novo ? "Novo entregador" : "Editar entregador"}</h3>
      <form id="ent-form" class="ent-form">
        <label>Nome<input name="nome" required maxlength="60" value="${esc(ent?.nome || "")}" placeholder="Ex.: João Pedro"></label>
        <label>WhatsApp<input name="telefone" required inputmode="tel" value="${esc(tel)}" placeholder="(14) 99999-9999"></label>
        <fieldset class="ent-seg"><legend>Como ele recebe</legend>
          ${Object.entries(TIPO).map(([k, v]) => `<label><input type="radio" name="tipo_pagamento" value="${k}" ${((ent?.tipo_pagamento || "entrega") === k) ? "checked" : ""}><span>${v}</span></label>`).join("")}
        </fieldset>
        <label id="ent-diaria-campo">Valor da diária por turno (R$)<input name="valor_diaria" inputmode="decimal" value="${ent?.valor_diaria ? String(ent.valor_diaria.toFixed(2)).replace(".", ",") : ""}" placeholder="Ex.: 50,00"></label>
        <div id="ent-entrega-campo" style="display:grid;gap:12px">
          <label><span id="ent-entrega-rotulo">Valor por entrega (R$)</span><input name="valor_entrega" inputmode="decimal" value="${ent?.valor_entrega ? String(ent.valor_entrega.toFixed(2)).replace(".", ",") : ""}" placeholder="Ex.: 5,00"></label>
          <label class="ent-check"><input type="checkbox" name="entrega_por_km" ${ent?.entrega_por_km ? "checked" : ""}> Por distância (valor por km)</label>
        </div>
        <p class="ent-muted ent-dica">Por enquanto esse valor só fica anotado. O acerto ainda usa a taxa de entrega de cada pedido.</p>
        ${novo ? "" : `<label class="ent-check"><input type="checkbox" name="ativo" ${ent.ativo ? "checked" : ""}> Ativo (desmarcar tira o acesso dele na hora)</label>`}
        <p class="ent-erro" id="ent-form-erro" role="alert"></p>
        <div class="ent-botoes">${novo ? "" : `<button type="button" class="ent-excluir" id="ent-excluir">Excluir entregador</button>`}<button type="button" class="ghost-button" data-fechar>Cancelar</button><button type="submit" class="primary-button">${novo ? "Cadastrar" : "Salvar"}</button></div>
      </form>`);
    const form = f.querySelector("#ent-form");
    const diaria = () => {
      const t = form.tipo_pagamento.value;
      const mostra = (sel, sim) => { f.querySelector(sel).style.display = sim ? "" : "none"; }; // style, porque o CSS do formulário passa por cima do "hidden"
      mostra("#ent-diaria-campo", t !== "entrega");
      f.querySelector("#ent-entrega-campo").style.display = t === "diaria" ? "none" : "grid";
      mostra(".ent-dica", t !== "diaria");
      f.querySelector("#ent-entrega-rotulo").textContent = form.entrega_por_km.checked ? "Valor por km (R$)" : "Valor por entrega (R$)";
    };
    form.addEventListener("change", diaria); diaria();
         // excluir: o primeiro toque pede confirmação, o segundo exclui
    f.querySelector("#ent-excluir")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.certeza) { b.dataset.certeza = "1"; b.textContent = `Toque de novo pra excluir o ${primeiro(ent.nome)}`; return; }
      b.disabled = true;
      try {
        await api(`/${ent.id}`, { method: "DELETE" });
        fecharJanela();
        aviso(`${primeiro(ent.nome)} excluído`);
        carregarLista(); carregarHoje();
      } catch (err) { f.querySelector("#ent-form-erro").textContent = err.message; b.disabled = false; }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { nome: form.nome.value, telefone: form.telefone.value, tipo_pagamento: form.tipo_pagamento.value, valor_diaria: (form.valor_diaria.value || "0").replace(/\./g, "").replace(",", "."),
        valor_entrega: (form.valor_entrega.value || "0").replace(/\./g, "").replace(",", "."), entrega_por_km: form.entrega_por_km.checked };
      if (!novo) body.ativo = form.ativo.checked;
      try {
        const salvo = await api(novo ? "" : `/${ent.id}`, { method: novo ? "POST" : "PATCH", body });
        fecharJanela();
        aviso(novo ? `${primeiro(salvo.nome)} cadastrado ✓` : "Salvo ✓");
        await carregarLista();
        if (novo) gerarCodigo(E.lista.find((x) => x.id === salvo.id) || salvo, true);
      } catch (err) { f.querySelector("#ent-form-erro").textContent = err.message; }
    });
  }

  async function gerarCodigo(ent, primeiraVez) {
    let r;
    try { r = await api(`/${ent.id}/codigo`, { method: "POST" }); } catch (err) { return aviso(err.message, true); }
    const link = E.config?.link_app;
    const msg = `Oi, ${primeiro(ent.nome)}! Este é o app de entregas${link ? `: ${link}` : ""}\nEntre com o seu WhatsApp. Se o código não chegar, use este: ${r.codigo} (vale ${r.minutos} min).`;
    const tel = String(ent.telefone || "").replace(/\D/g, "");
    janela(`
      <h3>${primeiraVez ? `Pronto! Agora mande o app pro ${esc(primeiro(ent.nome))}` : `Código do ${esc(primeiro(ent.nome))}`}</h3>
      <p class="ent-muted">${link ? `Ele abre <b>${esc(link)}</b> no celular, digita o WhatsApp e este código:` : "Ele abre o app de entregas no celular, digita o WhatsApp e este código:"}</p>
      <div class="ent-codigo">${esc(r.codigo)}</div>
      <p class="ent-muted">Vale ${r.minutos} minutos. Normalmente o código chega sozinho no WhatsApp dele; este é pra quando não chegar.</p>
      <div class="ent-botoes">
        <button type="button" class="ghost-button" data-fechar>Fechar</button>
        <a class="primary-button" href="https://wa.me/${esc(tel)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Mandar no WhatsApp dele</a>
      </div>`);
  }

  /* ---------- hoje ---------- */
  function desenharHoje() {
    const box = document.getElementById("ent-hoje");
    if (!box) return;
    const h = E.hoje;
    if (!h || !h.entregadores.length) { box.innerHTML = `<p class="ent-muted">Nenhuma entrega hoje ainda.</p>`; return; }
    box.innerHTML = `
      <table class="ent-tabela">
        <thead><tr><th>Entregador</th><th>Entregas</th><th>A pagar</th><th>Dinheiro</th></tr></thead>
        <tbody>${h.entregadores.map((e) => `
          <tr>
            <td><b>${esc(e.nome)}</b><small>${e.diaria ? `${e.turnos > 1 ? `${e.turnos} turnos` : "diária"} ${moeda(e.diaria)}` : ""}${e.diaria && e.por_entrega ? " + " : ""}${e.por_entrega ? `taxas ${moeda(e.por_entrega)}` : ""}</small>
              ${e.turno_aberto ? `<small class="ent-turno">● em turno desde ${new Date(e.turno_aberto).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small><button type="button" class="ghost-button ent-encerrar" data-encerrar="${esc(e.id)}" style="margin-top:6px;padding:6px 10px;font-size:12px">Encerrar turno</button>` : ""}</td>
            <td>${e.entregas}</td>
            <td><b>${moeda(e.total)}</b></td>
            <td>${moeda(e.dinheiro_recebido)}${e.dinheiro_pendente ? `<small class="ent-pend">falta ${moeda(e.dinheiro_pendente)}</small>` : ""}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr><td>Total a pagar</td><td></td><td><b>${moeda(h.total)}</b></td><td></td></tr></tfoot>
      </table>`;
    // encerrar o turno de quem esqueceu: o primeiro toque pede confirmação, o segundo encerra
    box.querySelectorAll("[data-encerrar]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.certeza) { b.dataset.certeza = "1"; b.textContent = "Toque de novo pra encerrar"; return; }
      b.disabled = true;
      try { await api(`/${b.dataset.encerrar}/encerrar-turno`, { method: "POST" }); aviso("Turno encerrado"); carregarHoje(); carregarLista(); }
      catch (err) { aviso(err.message); b.disabled = false; b.textContent = "Encerrar turno"; delete b.dataset.certeza; }
    }));
  }

  /* ---------- configurações e link do app ---------- */
  function desenharTopo() {
    const box = document.getElementById("ent-topo");
    if (!box || !E.config) return;
    const link = E.config.link_app;
    box.innerHTML = `
      <h3>Configurações</h3>
      <label class="ent-check"><input type="checkbox" id="ent-avisar" ${E.config.avisar_cliente ? "checked" : ""}> Avisar o cliente no WhatsApp quando o pedido sair, com o link do mapa</label>
      ${link ? `<div class="ent-link"><span>App dos entregadores</span><b>${esc(link)}</b><button class="ghost-button small" type="button" id="ent-copiar">Copiar link</button></div>` : ""}`;
    document.getElementById("ent-avisar").onchange = async (e) => {
      try { await api("/config", { method: "PATCH", body: { avisar_cliente: e.target.checked } }); E.config.avisar_cliente = e.target.checked; aviso("Salvo ✓"); }
      catch (err) { e.target.checked = !e.target.checked; aviso(err.message, true); }
    };
    document.getElementById("ent-copiar")?.addEventListener("click", () => { navigator.clipboard?.writeText(link).then(() => aviso("Link copiado ✓")); });
  }

  /* ---------- mapa ao vivo (OpenStreetMap) ---------- */
  let _leaflet = null;
  function carregarLeaflet() {
    if (window.L) return Promise.resolve();
    if (_leaflet) return _leaflet;
    _leaflet = new Promise((ok, ko) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = ok; s.onerror = ko;
      document.head.appendChild(s);
    });
    return _leaflet;
  }
  async function desenharMapa() {
    const el = document.getElementById("ent-mapa");
    if (!el || !visivel()) return;
    const comPos = E.lista.filter((e) => e.ativo && e.posicao && e.na_rua.length);
    el.hidden = !comPos.length;
    if (!comPos.length) return;
    try { await carregarLeaflet(); } catch { el.hidden = true; return; }
    if (!E.mapa) {
      E.mapa = L.map(el, { zoomControl: true }).setView([comPos[0].posicao.lat, comPos[0].posicao.lng], 14);
             E.mapa.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(E.mapa);
    }
    setTimeout(() => E.mapa.invalidateSize(), 50);
    const vistos = new Set();
    for (const e of comPos) { vistos.add(e.id); moverMarcador(e.id, e.nome, e.posicao); }
    for (const [id, m] of E.marcadores) if (!vistos.has(id)) { m.remove(); E.marcadores.delete(id); }
    const pts = [...E.marcadores.values()].map((m) => m.getLatLng());
    if (pts.length > 1) E.mapa.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    else if (pts.length) E.mapa.setView(pts[0], 15);
  }
  function moverMarcador(id, nome, p) {
    if (!E.mapa || !window.L) return;
    const ll = [p.lat, p.lng];
    let m = E.marcadores.get(id);
    if (!m) {
      m = L.marker(ll, { icon: L.divIcon({ className: "", html: `<div class="ent-moto"><span>🛵</span><b>${esc(primeiro(nome))}</b></div>`, iconSize: [0, 0], iconAnchor: [18, 18] }) }).addTo(E.mapa);
      E.marcadores.set(id, m);
    } else m.setLatLng(ll);
  }

  /* ---------- Kanban: etiqueta no card ---------- */
  let _tBuscarNome = null;
  window.entregadorTag = function (order) {
    if (!order?.entregador_id) return "";
    const e = E.lista.find((x) => x.id === order.entregador_id);
    if (!e && !_tBuscarNome) _tBuscarNome = setTimeout(() => { _tBuscarNome = null; carregarLista(); }, 800);
    return `<div class="order-entregador-tag">🛵 ${esc(e ? primeiro(e.nome) : "Entregador")}</div>`;
  };

  /* ---------- janela do pedido: mandar / trocar / tirar ---------- */
  function botoesEntregadores(excetoId) {
    const ordem = (e) => (e.conectado && e.disponivel ? 0 : e.conectado ? 1 : 2) + (e.na_rua.length ? 0.5 : 0);
    const ativos = E.lista.filter((e) => e.ativo && e.id !== excetoId).sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome));
    if (!ativos.length) return `<span class="ent-muted">Nenhum entregador ${excetoId ? "pra trocar" : "cadastrado"}. <a href="#" data-ent-abrir>Cadastrar</a></span>`;
    return ativos.map((e) => {
      const [txt, cls] = situacao(e);
      return `<button type="button" class="ent-escolha" data-ent="${esc(e.id)}"><span class="ent-ponto ${cls}"></span>${esc(primeiro(e.nome))}<small>${esc(txt)}</small></button>`;
    }).join("");
  }

  function fecharPedido() {
    closeOrderModal();
    if (typeof renderBoard === "function") setTimeout(renderBoard, 50); // com a janela aberta o Kanban não redesenha
  }
  const bairroDe = (o) => String(o.address || "").split(" - ")[1] || "";

  // outros pedidos prontos sem entregador: dá pra mandar junto no mesmo toque
  function juntoHtml(order) {
    const outros = orders.filter((o) => o.id !== order.id && o._frontStatus === "pronto" && !o.entregador_id && String(o.service_type || "").toLowerCase() === "delivery");
    if (!outros.length) return "";
    return `<div class="ent-junto"><span class="ent-muted">Levar junto (toque pra marcar):</span>
      <div class="ent-junto-lista">${outros.map((o) => `<button type="button" class="ent-junto-ped" data-junto="${esc(o.id)}" aria-pressed="false">#${esc(o.order_number)}${bairroDe(o) ? ` <small>${esc(bairroDe(o))}</small>` : ""}</button>`).join("")}</div></div>`;
  }

  window.entregadorNoModal = function (order) {
    document.getElementById("modal-entregador-row")?.remove();
    const delivery = String(order?.service_type || "").toLowerCase() === "delivery";
    if (!delivery || !["pronto", "caminho"].includes(order._frontStatus)) return;
    if (!E.carregou) carregarLista().then(() => { if (activeOrderId === order.id) window.entregadorNoModal(orders.find((o) => o.id === order.id) || order); });
    const row = document.createElement("div");
    row.id = "modal-entregador-row";
    row.className = "ent-modal";
    const atual = order.entregador_id ? E.lista.find((e) => e.id === order.entregador_id) : null;
    row.innerHTML = order.entregador_id
      ? `<div class="ent-modal-topo"><span>🛵 Com <b>${esc(atual?.nome || "entregador")}</b></span>
           <span><button type="button" class="ghost-button small" data-ent-trocar>Trocar</button>
           <button type="button" class="ghost-button small" data-ent-tirar>Tirar dele</button></span></div>
         <div class="ent-escolhas" hidden>${botoesEntregadores(order.entregador_id)}</div>`
      : `<div class="ent-modal-topo"><span>🛵 Mandar pro entregador</span></div><div class="ent-escolhas">${botoesEntregadores()}</div>${juntoHtml(order)}`;
    const ref = document.getElementById("modal-address-row");
    if (ref?.parentElement) ref.insertAdjacentElement("afterend", row);
    else (modalItems?.closest(".modal-body") || modalItems?.parentElement)?.prepend(row);

    row.onclick = async (e) => {
      const j = e.target.closest("[data-junto]");
      if (j) { j.classList.toggle("on"); j.setAttribute("aria-pressed", j.classList.contains("on")); return; }
      if (e.target.closest("[data-ent-abrir]")) { e.preventDefault(); closeOrderModal(); mostrar(); return; }
      if (e.target.closest("[data-ent-trocar]")) { row.querySelector(".ent-escolhas").hidden = false; return; }
      if (e.target.closest("[data-ent-tirar]")) {
        try { await api("/desatribuir", { method: "POST", body: { order_id: order.id } }); aviso(`#${order.order_number} voltou pra "Pronto"`); fecharPedido(); }
        catch (err) { aviso(err.message, true); }
        return;
      }
      const b = e.target.closest("[data-ent]");
      if (!b) return;
      b.disabled = true;
      try {
        const juntos = [...row.querySelectorAll("[data-junto].on")].map((x) => x.dataset.junto);
        const r = await api("/atribuir", { method: "POST", body: { entregador_id: b.dataset.ent, order_ids: [order.id, ...juntos] } });
        if (!r.enviados.length) throw new Error("Esse pedido não pode mais ser mandado (mudou de etapa)");
        const nums = r.enviados.map((id) => "#" + (orders.find((o) => o.id === id)?.order_number || "")).join(", ");
        aviso(`${nums} mandado${r.enviados.length > 1 ? "s" : ""} pro ${primeiro(E.lista.find((x) => x.id === b.dataset.ent)?.nome)} ✓`);
        fecharPedido();
      } catch (err) { aviso(err.message, true); b.disabled = false; }
    };
  };

  /* ---------- tempo real ---------- */
  function ligarSocket() {
    if (typeof socket === "undefined" || !socket) return setTimeout(ligarSocket, 1000);
    socket.on("connect", () => setTimeout(tudo, 300));
    socket.on("entregadores_mudou", () => { clearTimeout(E._tm); E._tm = setTimeout(() => { carregarLista(); if (visivel()) carregarHoje(); }, 400); });
    socket.on("acertos_mudou", () => { carregarAcertos(); if (visivel()) carregarHoje(); });
    socket.on("entregador_posicao", (p) => {
      const e = E.lista.find((x) => x.id === p.id);
      if (e) e.posicao = { lat: p.lat, lng: p.lng, em: p.em };
      if (visivel() && E.mapa) { if (E.marcadores.has(p.id)) moverMarcador(p.id, p.nome, p); else desenharMapa(); }
    });
    socket.on("order_updated", (o) => {
      if (String(o?.service_type || "").toLowerCase() !== "delivery") return;
      if (visivel()) { clearTimeout(E._to); E._to = setTimeout(() => { carregarLista(); if (o.status === "finished") carregarHoje(); }, 500); }
      else if (o.entregador_id && !E.lista.some((x) => x.id === o.entregador_id)) carregarLista();
    });
  }

  montarMenu();
  ligarSocket();
  if (localStorage.getItem("fluxon_token")) { carregarLista(); carregarAcertos(); carregarConfig(); }
  setInterval(() => { if (visivel() && !document.hidden) desenharEntregadores(); }, 30000);

  window.mostrarEntregadores = mostrar;
})();
