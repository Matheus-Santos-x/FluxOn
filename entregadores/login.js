/* login.js — WhatsApp → código de 6 números → (se trabalha em mais de um restaurante) escolhe onde. */
const login = (() => {
  let tel = "";
  const passo = (id) => ["form-tel", "form-cod", "passo-contas"].forEach((p) => $(p).classList.toggle("hidden", p !== id));
  const msg = (t, bom) => { const m = $("login-msg"); m.textContent = t || ""; m.classList.toggle("ok", !!bom); };

  function mostrar() {
    $("tela-app").classList.add("hidden");
    $("tela-login").classList.remove("hidden");
    $("barra-pegar").classList.remove("on");
    document.documentElement.style.setProperty("--acc", "#e5484d");
    passo("form-tel");
    msg("");
    setTimeout(() => $("in-tel").focus(), 50);
  }

  mascaraTel($("in-tel"));

  $("form-tel").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = $("in-tel").value.replace(/\D/g, "");
    if (d.length < 10) { msg("Digite o WhatsApp com DDD"); return; }
    const btn = $("btn-tel");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const r = await api("/api/v1/entregador/auth/solicitar", { method: "POST", body: { telefone: d } });
      tel = d;
      passo("form-cod");
      $("cod-dica").textContent = `Mandamos 6 números no WhatsApp ${telBonito(d)}.`;
      msg(r?.message || "", true);
      $("in-cod").value = "";
      setTimeout(() => $("in-cod").focus(), 50);
    } catch (err) { msg(err.message); }
    btn.disabled = false; btn.textContent = "Receber código";
  });

  $("in-cod").addEventListener("input", () => {
    const i = $("in-cod");
    i.value = i.value.replace(/\D/g, "").slice(0, 6);
    if (i.value.length === 6) $("form-cod").requestSubmit();
  });

  $("form-cod").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = $("in-cod").value;
    if (codigo.length !== 6) { msg("O código tem 6 números"); return; }
    const btn = $("btn-cod");
    btn.disabled = true; btn.textContent = "Entrando…";
    try {
      const r = await api("/api/v1/entregador/auth/verificar", { method: "POST", body: { telefone: tel, codigo } });
      // junta com as contas que já estavam no celular (troca o token das repetidas)
      for (const c of r.contas) {
        S.contas = S.contas.filter((x) => x.entregador.id !== c.entregador.id);
        S.contas.push(c);
      }
      if (r.contas.length === 1) { S.conta = r.contas[0]; guardar.salvar(); msg(""); app.entrar(); }
      else escolher(r.contas);
    } catch (err) { msg(err.message); $("in-cod").select(); }
    btn.disabled = false; btn.textContent = "Entrar";
  });

  $("btn-voltar-tel").addEventListener("click", () => { passo("form-tel"); msg(""); });

  function escolher(contas) {
    $("tela-app").classList.add("hidden");
    $("tela-login").classList.remove("hidden");
    passo("passo-contas");
    msg("");
    $("lista-contas").innerHTML = contas.map((c, i) => `
      <button type="button" class="conta" data-i="${i}">
        <span class="topo-logo" style="${c.restaurante.logo_url ? `background-image:url('${esc(c.restaurante.logo_url)}')` : ""}">${c.restaurante.logo_url ? "" : esc(c.restaurante.nome.charAt(0))}</span>
        <span><b>${esc(c.restaurante.nome)}</b><br><small class="muted">como ${esc(c.entregador.nome)}</small></span>
      </button>`).join("");
    $("lista-contas").onclick = (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      S.conta = contas[Number(b.dataset.i)];
      guardar.salvar();
      app.entrar();
    };
  }

  return { mostrar, msg, escolher };
})();
