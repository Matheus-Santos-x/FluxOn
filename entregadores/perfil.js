/* perfil.js — a bolinha lá em cima (no lugar do cabeçalho).
   Verde = disponível, vermelha = em pausa. Tocando nela: disponível/parar, tema claro/escuro,
   meus dados, instalar o app, trocar de restaurante e sair. */
const perfil = (() => {
  const TIPO = { entrega: "Por entrega", diaria_entrega: "Diária + por entrega", diaria: "Diária" };
  const inicial = () => (S.conta?.entregador?.nome || "?").trim().charAt(0).toUpperCase();

  // a bolinha muda de cor conforme a disponibilidade
  function bolinha() {
    const on = !!S.eu?.disponivel;
    const b = $("btn-avatar");
    b.classList.toggle("on", on);
    $("avatar-letra").textContent = inicial();
    b.setAttribute("aria-label", `Perfil · ${on ? "disponível" : "em pausa"}`);
  }

  /* ---------- tema ---------- */
  const temaAtual = () => { try { return localStorage.getItem("fx_ent_tema") || "auto"; } catch { return "auto"; } };
  function aplicarTema(t) {
    try { localStorage.setItem("fx_ent_tema", t); } catch {}
    if (t === "claro" || t === "escuro") document.documentElement.dataset.tema = t;
    else delete document.documentElement.dataset.tema;
    const escuro = t === "escuro" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", escuro ? "#16171a" : "#f2f2ef");
  }

  /* ---------- instalar o app ---------- */
  let pedidoInstalar = null;
  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; });
  const podeInstalar = () => !instalado() && (pedidoInstalar || /iphone|ipad|ipod/i.test(navigator.userAgent));
  async function instalar() {
    if (pedidoInstalar) { const p = pedidoInstalar; pedidoInstalar = null; fecharFolha(); p.prompt(); await p.userChoice.catch(() => null); return; }
    abrirFolha(`<h3>Instalar no iPhone</h3><p>Toque em <b>Compartilhar</b> (o quadrado com a setinha) e depois em <b>"Adicionar à Tela de Início"</b>. O app fica com ícone, igual aos outros.</p><div class="botoes"><button class="btn primario grande" type="button" id="btn-ok-ios">Entendi</button></div>`);
    $("btn-ok-ios").onclick = fecharFolha;
  }

  /* ---------- a janela do perfil ---------- */
  function abrir() {
    const e = S.eu || {}, r = S.conta.restaurante, on = !!e.disponivel, tema = temaAtual();
    const recebe = `${TIPO[e.tipo_pagamento] || "—"}${e.tipo_pagamento && e.tipo_pagamento !== "entrega" ? ` · ${moeda(e.valor_diaria)}` : ""}`;
    abrirFolha(`
      <div class="perfil-topo">
        <span class="avatar-grande${on ? " on" : ""}" aria-hidden="true">${esc(inicial())}</span>
        <div><b>${esc(S.conta.entregador.nome)}</b><small>${esc(r.nome)}</small></div>
      </div>
      <p class="estado${on ? " on" : ""}">${on ? "Disponível pra entregas" : "Em pausa · não está pegando entregas"}</p>
      ${on
        ? `<button class="btn grande largo perigo" type="button" id="pf-dispo">⏸️ Parar de pegar entregas</button>`
        : `<button class="btn grande largo ok" type="button" id="pf-dispo">▶️ Ficar disponível</button>`}

      <div class="perfil-grupo">
        <span>Aparência</span>
        <div class="seg" role="group" aria-label="Tema">
          ${[["auto", "Automático"], ["claro", "Claro"], ["escuro", "Escuro"]].map(([k, v]) => `<button type="button" data-tema="${k}" class="${tema === k ? "on" : ""}" aria-pressed="${tema === k}">${v}</button>`).join("")}
        </div>
      </div>

      <div class="perfil-grupo">
        <span>Meu perfil</span>
        <div class="dados">
          <div><span>WhatsApp</span><b>${esc(telBonito(e.telefone)) || "—"}</b></div>
          <div><span>Restaurante</span><b>${esc(r.nome)}</b></div>
          <div><span>Como recebo</span><b>${esc(recebe)}</b></div>
        </div>
      </div>

      <div class="perfil-acoes">
        ${podeInstalar() ? `<button class="btn largo" type="button" id="pf-instalar">📲 Instalar o app no celular</button>` : ""}
        ${S.contas.length > 1 ? `<button class="btn largo" type="button" id="pf-trocar">Trocar de restaurante</button>` : ""}
        <button class="btn link" type="button" id="pf-sair">Sair do app</button>
      </div>`);

    $("pf-dispo").onclick = async (ev) => {
      ev.currentTarget.disabled = true;
      const ok = await app.mudarDisponivel(!on);
      if (ok) fecharFolha(); else ev.currentTarget.disabled = false;
    };
    $("folha-corpo").querySelector(".seg").onclick = (ev) => {
      const b = ev.target.closest("[data-tema]");
      if (!b) return;
      aplicarTema(b.dataset.tema);
      $("folha-corpo").querySelectorAll(".seg button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    };
    $("pf-instalar")?.addEventListener("click", instalar);
    $("pf-trocar")?.addEventListener("click", () => { fecharFolha(); login.escolher(S.contas); });
    $("pf-sair").onclick = () => {
      abrirFolha(`<h3>Sair do app?</h3><p>Pra entrar de novo, é só pedir outro código no WhatsApp.</p>
        <div class="botoes"><button class="btn primario grande" type="button" id="btn-sair-sim">Sair</button><button class="btn link" type="button" id="btn-sair-nao">Ficar</button></div>`);
      $("btn-sair-nao").onclick = fecharFolha;
      $("btn-sair-sim").onclick = () => { fecharFolha(); sairDaConta(); };
    };
  }

  $("btn-avatar").addEventListener("click", abrir);
  aplicarTema(temaAtual());
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => aplicarTema(temaAtual()));

  return { bolinha, abrir };
})();
