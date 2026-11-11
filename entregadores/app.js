/* app.js — liga tudo: entra na conta, troca de aba (sempre abre em "Na rua"),
   disponível/pausa e o "acordar" quando o celular volta do bolso. */
const app = (() => {
  async function entrar() {
    if (!S.conta) return login.mostrar();
    $("tela-login").classList.add("hidden");
    $("tela-app").classList.remove("hidden");
    aplicarCor(S.conta.restaurante);
    S.fila = []; S.naRua = []; S.acertos = []; S.sel.clear(); S.dia = null; S.rotaOrdem = [];
    perfil.bolinha();
    irPara("rua");
    try {
      const eu = await api("/api/v1/entregador/eu");
      S.eu = eu.entregador;
      S.conta.restaurante = eu.restaurante; S.conta.entregador.nome = eu.entregador.nome;
      guardar.salvar();
      aplicarCor(eu.restaurante);
      perfil.bolinha();
      mapa.mostrarLoja();
    } catch { if (!S.conta) return; }
    tempoReal.ligar();
    await recarregar();
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
    if (aba === "rua") { mapa.mostrar(); rua.desenhar(); }
    else mapa.atualizar({ visivel: false, temEntrega: S.naRua.length > 0 });
    if (aba === "dia") ganhos.recarregar();
    window.scrollTo({ top: 0 });
  }
  document.querySelector(".abas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (b) irPara(b.dataset.aba); });

  // disponível / pausa (chamado pelo perfil)
  async function mudarDisponivel(novo) {
    if (!S.eu) return false;
    try {
      await api("/api/v1/entregador/disponivel", { method: "PATCH", body: { disponivel: novo } });
      S.eu.disponivel = novo;
      perfil.bolinha(); pegar.desenhar(); rua.desenhar();
      aviso(novo ? "Você está disponível" : "Pausa ligada. Bom descanso!", novo ? "bom" : "");
      return true;
    } catch (err) { aviso(err.message, "ruim"); return false; }
  }

  // celular voltou do bolso: atualiza tudo
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.conta) recarregar(); });
  window.addEventListener("online", () => S.conta && recarregar());

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  guardar.ler();
  entrar();

  return { entrar, recarregar, irPara, mudarDisponivel };
})();
