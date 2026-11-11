/* app.js — liga tudo: entra na conta, troca de aba, botão Disponível/Pausa e o "acordar" quando o celular volta. */
const app = (() => {
  async function entrar() {
    if (!S.conta) return login.mostrar();
    $("tela-login").classList.add("hidden");
    $("tela-app").classList.remove("hidden");
    const r = S.conta.restaurante, e = S.conta.entregador;
    aplicarCor(r);
    $("topo-rest").textContent = r.nome;
    $("topo-eu").textContent = e.nome;
    const logo = $("topo-logo");
    logo.style.backgroundImage = r.logo_url ? `url('${r.logo_url.replace(/'/g, "%27")}')` : "";
    logo.textContent = r.logo_url ? "" : r.nome.charAt(0).toUpperCase();
    $("btn-trocar-conta").hidden = S.contas.length < 2;
    S.fila = []; S.naRua = []; S.acertos = []; S.sel.clear(); S.dia = null;
    try {
      const eu = await api("/api/v1/entregador/eu");
      S.eu = eu.entregador;
      S.conta.restaurante = eu.restaurante; S.conta.entregador.nome = eu.entregador.nome;
      guardar.salvar();
      aplicarCor(eu.restaurante);
      $("topo-rest").textContent = eu.restaurante.nome;
      dispo();
    } catch { if (!S.conta) return; }
    tempoReal.ligar();
    await recarregar();
    irPara(S.naRua.length ? "rua" : "pedidos");
  }

  async function recarregar() {
    await Promise.all([pegar.recarregar(), rua.recarregar(), S.aba === "dia" ? ganhos.recarregar() : null]);
  }

  function irPara(aba) {
    S.aba = aba;
    for (const a of ["pedidos", "rua", "dia"]) {
      $(`aba-${a}`).classList.toggle("hidden", a !== aba);
      $(`tab-${a}`).classList.toggle("ativo", a === aba);
      $(`tab-${a}`).setAttribute("aria-current", a === aba ? "page" : "false");
    }
    pegar.barra();
    if (aba === "rua") rua.aoMostrar();
    if (aba === "dia") ganhos.recarregar();
    window.scrollTo({ top: 0 });
  }
  document.querySelector(".abas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (b) irPara(b.dataset.aba); });

  /* Disponível / Pausa */
  function dispo() {
    const on = !!S.eu?.disponivel;
    $("btn-dispo").setAttribute("aria-checked", on);
    $("dispo-txt").textContent = on ? "Disponível" : "Em pausa";
  }
  $("btn-dispo").addEventListener("click", async () => {
    if (!S.eu) return;
    const novo = !S.eu.disponivel;
    S.eu.disponivel = novo; dispo(); pegar.desenhar();
    try { await api("/api/v1/entregador/disponivel", { method: "PATCH", body: { disponivel: novo } }); aviso(novo ? "Você está disponível" : "Pausa ligada"); }
    catch (err) { S.eu.disponivel = !novo; dispo(); pegar.desenhar(); aviso(err.message, "ruim"); }
  });

  $("btn-sair").addEventListener("click", () => {
    abrirFolha(`<h3>Sair do app?</h3><p>Pra entrar de novo, é só pedir outro código no WhatsApp.</p>
      <div class="botoes"><button class="btn primario grande" type="button" id="btn-sair-sim">Sair</button><button class="btn link" type="button" id="btn-sair-nao">Ficar</button></div>`);
    $("btn-sair-nao").onclick = fecharFolha;
    $("btn-sair-sim").onclick = () => { fecharFolha(); sairDaConta(); };
  });
  $("btn-trocar-conta").addEventListener("click", () => login.escolher(S.contas));

  // celular voltou do bolso: atualiza tudo
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.conta) recarregar(); });
  window.addEventListener("online", () => S.conta && recarregar());

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  guardar.ler();
  entrar();

  return { entrar, recarregar, irPara };
})();
