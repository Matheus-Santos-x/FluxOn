// FluxON — Painel Admin (app separado do Operacional)
// Login Google só para os e-mails da ADMIN_EMAILS (backend). "Abrir no FluxON" abre o Operacional
// do restaurante numa aba nova, já logado como ele (impersonação de 4h).

// ===== CONFIG =====
const GOOGLE_CLIENT_ID = "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";
const API_BASE = "https://backend.evoriseai.com.br";
const ADMIN_URL = `${API_BASE}/admin`;
const OPERACIONAL_URL = "https://fluxon.evoriseai.com.br";

let adminRestaurantsCache = [];
let adminSelectedRestaurant = null;

// ===== SESSÃO =====
function lerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLocal(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

function getAdminToken() { return lerLocal("fx_admin_token"); }

function buildAdminHeaders() {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
}

function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(window.atob(base64))));
  } catch { return null; }
}

function tokenAdminValido(t = getAdminToken()) {
  const p = t ? decodeJwt(t) : null;
  return !!p?.is_admin && (!p.exp || p.exp * 1000 > Date.now() + 60 * 1000);
}

// Toda chamada pra API leva o token do admin (inclusive o upload de foto, que antes ia sem).
// Se o token venceu, volta pra tela de login.
const _fetchOriginal = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const u = typeof url === "string" ? url : (url?.url || "");
  if (u.startsWith(API_BASE)) {
    const t = getAdminToken();
    const h = new Headers(opts.headers || {});
    if (t && !h.has("Authorization")) h.set("Authorization", `Bearer ${t}`);
    opts = { ...opts, headers: h };
  }
  const resp = await _fetchOriginal(url, opts);
  if ((resp.status === 401 || resp.status === 403) && u.startsWith(ADMIN_URL) && !tokenAdminValido()) sessaoExpirou();
  return resp;
};

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleAccordion(id) {
  const body = document.getElementById(`accordion-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);
  const isOpen = body.style.display === "flex";
  body.style.display = isOpen ? "none" : "flex";
  body.style.flexDirection = "column";
  body.style.gap = "12px";
  body.style.padding = "0 24px 24px 24px";
  arrow.style.transform = isOpen ? "" : "rotate(180deg)";
}

// ===== LOGIN =====
function loginStatus(texto, erro) {
  const el = document.getElementById("login-status");
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("erro", !!erro);
}

async function entrarComGoogle(resposta) {
  loginStatus("Entrando...");
  try {
    const resp = await fetch(`${ADMIN_URL}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: resposta.credential })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.token) throw new Error(data.error || "Não foi possível entrar");
    gravarLocal("fx_admin_token", data.token);
    gravarLocal("fx_admin_email", data.email || "");
    gravarLocal("fx_admin_foto", data.foto || "");
    loginStatus("");
    mostrarPainel();
  } catch (e) {
    loginStatus("❌ " + e.message, true);
  }
}

function iniciarBotaoGoogle() {
  const box = document.getElementById("google-btn");
  if (!box) return;
  if (!window.google?.accounts?.id) return setTimeout(iniciarBotaoGoogle, 300);
  window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: entrarComGoogle });
  box.innerHTML = "";
  window.google.accounts.id.renderButton(box, { theme: "filled_black", size: "large", shape: "pill", width: 260 });
}

function mostrarLogin() {
  document.getElementById("admin-topo")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.getElementById("login-screen")?.classList.remove("hidden");
  iniciarBotaoGoogle();
}

function mostrarPainel() {
  document.getElementById("login-screen")?.classList.add("hidden");
  document.getElementById("admin-topo")?.classList.remove("hidden");
  document.getElementById("admin-view")?.classList.remove("hidden");
  const email = lerLocal("fx_admin_email") || decodeJwt(getAdminToken())?.email || "";
  const emailEl = document.getElementById("admin-user-email");
  if (emailEl) emailEl.textContent = email;
  const foto = document.getElementById("admin-user-foto");
  const fotoUrl = lerLocal("fx_admin_foto");
  if (foto) { foto.src = fotoUrl || ""; foto.classList.toggle("hidden", !fotoUrl); }
  fetchAdminRestaurants().then(() => {
    const ultimo = lerLocal("fx_admin_ultimo");
    if (ultimo && !adminSelectedRestaurant && adminRestaurantsCache.some(r => r.id === ultimo)) selecionarAdminRestaurante(ultimo);
  });
}

function sairDoAdmin() {
  ["fx_admin_token", "fx_admin_email", "fx_admin_foto"].forEach(k => gravarLocal(k, null));
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
  adminSelectedRestaurant = null;
  document.getElementById("admin-selected-card")?.classList.add("hidden");
  document.getElementById("admin-forms")?.classList.add("hidden");
  mostrarLogin();
}

let _avisouExpirou = false;
function sessaoExpirou() {
  if (_avisouExpirou) return;
  _avisouExpirou = true;
  sairDoAdmin();
  loginStatus("Sua sessão expirou. Entre de novo.", true);
  setTimeout(() => { _avisouExpirou = false; }, 2000);
}

// ===== CROP (recorte de foto — Cropper.js) =====
let cropperInstance = null;
let cropResolve = null;
let cropSaida = { width: 800, height: 800 };

// opcoes (tudo opcional): { proporcao: 9/16, largura: 1080, altura: 1920, titulo: "..." }
function openCropModal(file, opcoes = {}) {
  return new Promise((resolve) => {
    cropResolve = resolve;
    cropSaida = { width: opcoes.largura || 800, height: opcoes.altura || 800 };
    const titulo = document.querySelector("#crop-modal-backdrop .crop-modal-title");
    if (titulo) titulo.textContent = opcoes.titulo || "✂️ Recortar imagem";
    const area = document.querySelector("#crop-modal-backdrop .crop-img-wrap");
    if (area) area.style.height = (opcoes.proporcao || 1) < 1 ? "min(62vh, 520px)" : "";
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById("crop-image");
      img.src = e.target.result;
      document.getElementById("crop-modal-backdrop").classList.remove("hidden");
      if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
      img.onload = () => {
        cropperInstance = new Cropper(img, {
          aspectRatio: opcoes.proporcao || 1,
          viewMode: 1,
          dragMode: "move",
          autoCropArea: 0.9,
          restore: false,
          guides: false,
          center: false,
          highlight: false,
          cropBoxMovable: false,
          cropBoxResizable: false,
          toggleDragModeOnDblclick: false,
        });
      };
    };
    reader.readAsDataURL(file);
  });
}

function cancelCrop() {
  document.getElementById("crop-modal-backdrop").classList.add("hidden");
  if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  if (cropResolve) { cropResolve(null); cropResolve = null; }
}

function confirmCrop() {
  if (!cropperInstance || !cropResolve) return;
  const canvas = cropperInstance.getCroppedCanvas({ ...cropSaida, imageSmoothingQuality: "high" });
  canvas.toBlob((blob) => {
    document.getElementById("crop-modal-backdrop").classList.add("hidden");
    cropperInstance.destroy();
    cropperInstance = null;
    const resolve = cropResolve;
    cropResolve = null;
    resolve(blob);
  }, "image/jpeg", 0.9);
}

// ===== PAINEL (mesmo código que vivia no Operacional) =====

async function fetchAdminRestaurants() {
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants`, { headers: buildAdminHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro ao buscar restaurantes");
    adminRestaurantsCache = data;
  } catch (e) {
    console.error("Erro ao buscar restaurantes (admin):", e);
    if (tokenAdminValido()) alert("Erro ao carregar lista de restaurantes: " + e.message);
  }
}

function renderAdminDropdown(query) {
  const dropdown = document.getElementById("admin-search-dropdown");
  if (!dropdown) return;
  const q = query.trim().toLowerCase();
  const filtrados = q
    ? adminRestaurantsCache.filter(r => r.name.toLowerCase().includes(q))
    : adminRestaurantsCache;

  if (filtrados.length === 0) {
    dropdown.innerHTML = `<div style="padding:14px; color:rgba(252,228,228,0.4); font-size:13px;">Nenhum restaurante encontrado.</div>`;
    dropdown.style.display = "block";
    return;
  }

  dropdown.innerHTML = filtrados.map(r => `
    <div onclick="selecionarAdminRestaurante('${r.id}')" style="
      padding:12px 16px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.07);
      display:flex; justify-content:space-between; align-items:center;"
      onmouseover="this.style.background='rgba(255,255,255,0.09)'"
      onmouseout="this.style.background='transparent'">
      <div>
        <div style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px;">${escapeHtml(r.name)}</div>
        <div style="color:rgba(252,228,228,0.4); font-size:11px;">${escapeHtml(r.email)}</div>
      </div>
      <span style="color:rgba(251,191,36,0.8); font-size:11px; font-weight:700; text-transform:uppercase;">${escapeHtml(r.plan || "")}</span>
    </div>
  `).join("");
  dropdown.style.display = "block";
}

async function selecionarAdminRestaurante(id) {
  const r = adminRestaurantsCache.find(x => x.id === id);
  if (!r) return;
  adminSelectedRestaurant = r;
  gravarLocal("fx_admin_ultimo", id);

  document.getElementById("admin-search-dropdown").style.display = "none";
  document.getElementById("admin-search-restaurant").value = "";

  document.getElementById("admin-selected-card")?.classList.remove("hidden");
  document.getElementById("admin-selected-name").textContent = r.name;
  document.getElementById("admin-selected-meta").textContent = `${r.email} · ${r.plan}`;
  document.getElementById("admin-forms")?.classList.remove("hidden");

  // Preenche formulário "Restaurante"
  document.getElementById("admin-f-name").value = r.name || "";
  document.getElementById("admin-f-email").value = r.email || "";
  document.getElementById("admin-f-plan").value = r.plan || "essential";

  // Preenche "Domínios"
  document.getElementById("admin-f-dom-mesa").value = r.cardapio_url || "";
  document.getElementById("admin-f-dom-delivery").value = r.cardapio_delivery_url || "";
  document.getElementById("admin-f-dom-central").value = r.central_url || "";
  document.getElementById("admin-f-dom-vouchers").value = r.vouchers_url || "";
  document.getElementById("admin-f-dom-reservas").value = r.reservas_url || "";
  document.getElementById("admin-f-dom-avaliacao").value = r.avaliacao_url || "";
  document.getElementById("admin-status-dominios").textContent = "";
  carregarAdminCentral();
  carregarAdminVouchers();
  carregarAdminReservas();

  // Carrega config (aparência + operação) — rota GET não exige token do próprio restaurante
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${r.id}/config`);
    const cfg = await resp.json();
    document.getElementById("admin-f-nome-exibicao").value = cfg.nome_exibicao || "";
    document.getElementById("admin-f-subtitulo").value = cfg.subtitulo || "";
        _setAdminImagePreview("logo", cfg.logo_url || "");
    _setAdminImagePreview("banner", cfg.banner_url || "");
    _setAdminImagePreview("logo-fisico", cfg.logo_fisico_url || "");
    document.getElementById("admin-f-cor-primaria").value = cfg.cor_primaria || "#f97373";
    document.getElementById("admin-f-cor-secundaria").value = cfg.cor_secundaria || "#b91c1c";
    document.getElementById("admin-f-cor-fundo").value = cfg.cor_fundo || "#0c0a09";
    document.getElementById("admin-f-tema").value = cfg.tema || "dark";
    document.getElementById("admin-f-telefone").value = cfg.telefone || "";
    document.getElementById("admin-f-instagram").value = cfg.instagram || "";
    document.getElementById("admin-f-endereco").value = cfg.endereco || "";
    document.getElementById("admin-f-google-avaliacao").value = cfg.google_avaliacao_url || "";
    document.getElementById("admin-f-mesas").value = cfg.num_mesas ?? 10;
    document.getElementById("admin-f-pedido-minimo").value = cfg.pedido_minimo ?? 0;
        document.getElementById("admin-f-agendamento").value = cfg.agendamento_ativo ? "1" : "0";
    document.getElementById("admin-f-agendamento-min").value = cfg.agendamento_antecedencia_min ?? 30;
    document.getElementById("admin-f-entrega-min").value = cfg.tempo_entrega_min ?? "";
    document.getElementById("admin-f-entrega-max").value = cfg.tempo_entrega_max ?? "";
    document.getElementById("admin-f-pagamento-online").value = (cfg.pagamento_online || []).join(", ");
    document.getElementById("admin-f-pagamento-entrega").value = (cfg.pagamento_entrega || []).join(", ");
  } catch (e) {
    console.error("Erro ao carregar config do restaurante:", e);
  }

  // Carrega horários
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${r.id}/horarios`);
    const data = await resp.json();
    renderAdminHorariosForm(data.horarios || []);
  } catch (e) {
    renderAdminHorariosForm([]);
  }
}

function renderAdminHorariosForm(horariosExistentes) {
  const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const lista = document.getElementById("admin-horarios-lista");
  if (!lista) return;

  lista.innerHTML = dias.map((nome, i) => {
    const existente = horariosExistentes.find(h => h.dia_semana === i);
    const abertura = existente?.abertura?.slice(0,5) || "08:00";
    const fechamento = existente?.fechamento?.slice(0,5) || "22:00";
    return `
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="width:80px; font-size:12px; color:rgba(252,228,228,0.6); font-weight:700;">${nome}</span>
        <input type="time" class="admin-horario-abertura" data-dia="${i}" value="${abertura}"
          style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:#0a0a0a; color:rgba(252,228,228,1); font-size:13px; outline:none;" />
        <span style="color:rgba(252,228,228,0.3);">até</span>
        <input type="time" class="admin-horario-fechamento" data-dia="${i}" value="${fechamento}"
          style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:#0a0a0a; color:rgba(252,228,228,1); font-size:13px; outline:none;" />
      </div>
    `;
  }).join("");
}

async function salvarAdminRestauranteBasico() {
  if (!adminSelectedRestaurant) return;
  const status = document.getElementById("admin-status-restaurante");
  const body = {
    name: document.getElementById("admin-f-name").value.trim(),
    email: document.getElementById("admin-f-email").value.trim(),
    plan: document.getElementById("admin-f-plan").value
  };
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    Object.assign(adminSelectedRestaurant, body);
    document.getElementById("admin-selected-name").textContent = body.name;
    document.getElementById("admin-selected-meta").textContent = `${body.email} · ${body.plan}`;
    status.textContent = "✅ Salvo!"; status.style.color = "rgba(34,197,94,0.9)";
  } catch (e) {
    status.textContent = "❌ " + e.message; status.style.color = "rgba(239,68,68,0.9)";
  }
}

// ===== UPLOAD DE LOGO / BANNER (painel admin) =====
function _setAdminImagePreview(type, url) {
  const hiddenMap = { "logo": "admin-f-logo", "banner": "admin-f-banner", "logo-fisico": "admin-f-logo-fisico" };
  const labelMap = { "logo": "Logo", "banner": "Banner", "logo-fisico": "Logo física" };
  const hiddenId = hiddenMap[type];
  const dropzoneId = `admin-${type}-dropzone`;
  const fileInputId = `admin-${type}-file`;

  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = url || "";

  const dropzone = document.getElementById(dropzoneId);
  if (!dropzone) return;

  if (url) {
    dropzone.innerHTML = `
      <img src="${url}" style="width:100%; height:70px; object-fit:cover; border-radius:8px;" />
      <button type="button" onclick="removerAdminImagem('${type}')" style="
        position:absolute; top:4px; right:4px; width:20px; height:20px;
        border-radius:50%; border:none; background:rgba(239,68,68,0.9);
        color:white; font-size:11px; cursor:pointer; line-height:1;
      ">×</button>
      <input type="file" id="${fileInputId}" accept="image/*" style="
        position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
      " />
    `;
  } else {
    dropzone.innerHTML = `
      <div style="font-size:22px;">📷</div>
      <div style="color:rgba(252,228,228,0.4); font-size:10px;">${labelMap[type]}</div>
      <input type="file" id="${fileInputId}" accept="image/*" style="
        position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
      " />
    `;
  }

  document.getElementById(fileInputId)?.addEventListener("change", function () {
    if (this.files[0]) handleAdminImageUpload(this.files[0], type);
  });
}

async function handleAdminImageUpload(file, type) {
  try {
    const formData = new FormData();
    formData.append("file", file, file.name || "foto.jpg");
    formData.append("bucket", type === "banner" ? "restaurante-banners" : "restaurante-logos");

    const resp = await fetch(`${API_BASE}/api/v1/upload-image`, { method: "POST", body: formData });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro no upload");

    _setAdminImagePreview(type, data.url);
  } catch (e) {
    alert("Erro ao enviar imagem: " + e.message);
  }
}

function removerAdminImagem(type) {
  _setAdminImagePreview(type, "");
}

function setupAdminImageInputs() {
  document.getElementById("admin-logo-file")?.addEventListener("change", function () {
    if (this.files[0]) handleAdminImageUpload(this.files[0], "logo");
  });
  document.getElementById("admin-banner-file")?.addEventListener("change", function () {
    if (this.files[0]) handleAdminImageUpload(this.files[0], "banner");
  });
  document.getElementById("admin-logo-fisico-file")?.addEventListener("change", function () {
    if (this.files[0]) handleAdminImageUpload(this.files[0], "logo-fisico");
  });
}

async function salvarAdminAparencia() {
  if (!adminSelectedRestaurant) return;
  const status = document.getElementById("admin-status-aparencia");
      const body = {
    nome_exibicao: document.getElementById("admin-f-nome-exibicao").value.trim(),
    subtitulo: document.getElementById("admin-f-subtitulo").value.trim(),
    logo_url: document.getElementById("admin-f-logo").value.trim(),
    logo_fisico_url: document.getElementById("admin-f-logo-fisico").value.trim(),
    banner_url: document.getElementById("admin-f-banner").value.trim(),
    cor_primaria: document.getElementById("admin-f-cor-primaria").value,
    cor_secundaria: document.getElementById("admin-f-cor-secundaria").value,
    cor_fundo: document.getElementById("admin-f-cor-fundo").value,
    tema: document.getElementById("admin-f-tema").value
  };
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/config`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    status.textContent = "✅ Salvo!"; status.style.color = "rgba(34,197,94,0.9)";
  } catch (e) {
    status.textContent = "❌ " + e.message; status.style.color = "rgba(239,68,68,0.9)";
  }
}

async function salvarAdminOperacao() {
  if (!adminSelectedRestaurant) return;
  const status = document.getElementById("admin-status-operacao");
  const toArray = (v) => v.split(",").map(s => s.trim()).filter(Boolean);
  const body = {
    telefone: document.getElementById("admin-f-telefone").value.trim(),
    instagram: document.getElementById("admin-f-instagram").value.trim(),
    endereco: document.getElementById("admin-f-endereco").value.trim(),
    google_avaliacao_url: document.getElementById("admin-f-google-avaliacao").value.trim(),
    num_mesas: parseInt(document.getElementById("admin-f-mesas").value) || 0,
    pedido_minimo: parseFloat(document.getElementById("admin-f-pedido-minimo").value) || 0,
        agendamento_ativo: document.getElementById("admin-f-agendamento").value === "1",
    agendamento_antecedencia_min: (v => isNaN(v) ? 30 : Math.min(180, Math.max(0, v)))(parseInt(document.getElementById("admin-f-agendamento-min").value)),
    tempo_entrega_min: document.getElementById("admin-f-entrega-min").value ? parseInt(document.getElementById("admin-f-entrega-min").value) : null,
    tempo_entrega_max: document.getElementById("admin-f-entrega-max").value ? parseInt(document.getElementById("admin-f-entrega-max").value) : null,
    pagamento_online: toArray(document.getElementById("admin-f-pagamento-online").value),
    pagamento_entrega: toArray(document.getElementById("admin-f-pagamento-entrega").value)
  };
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/config`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    status.textContent = "✅ Salvo!"; status.style.color = "rgba(34,197,94,0.9)";
  } catch (e) {
    status.textContent = "❌ " + e.message; status.style.color = "rgba(239,68,68,0.9)";
  }
}

async function salvarAdminDominios() {
  if (!adminSelectedRestaurant) return;
  const status = document.getElementById("admin-status-dominios");
  const body = {
    cardapio_url: document.getElementById("admin-f-dom-mesa").value.trim(),
    cardapio_delivery_url: document.getElementById("admin-f-dom-delivery").value.trim(),
    central_url: document.getElementById("admin-f-dom-central").value.trim(),
    vouchers_url: document.getElementById("admin-f-dom-vouchers").value.trim(),
    reservas_url: document.getElementById("admin-f-dom-reservas").value.trim(),
    avaliacao_url: document.getElementById("admin-f-dom-avaliacao").value.trim()
  };
  status.textContent = "Salvando..."; status.style.color = "rgba(252,228,228,0.6)";
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/dominios`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Erro ao salvar");
    Object.assign(adminSelectedRestaurant, data.dominios || {});
    document.getElementById("admin-f-dom-mesa").value = adminSelectedRestaurant.cardapio_url || "";
    document.getElementById("admin-f-dom-delivery").value = adminSelectedRestaurant.cardapio_delivery_url || "";
    document.getElementById("admin-f-dom-central").value = adminSelectedRestaurant.central_url || "";
    document.getElementById("admin-f-dom-vouchers").value = adminSelectedRestaurant.vouchers_url || "";
    document.getElementById("admin-f-dom-reservas").value = adminSelectedRestaurant.reservas_url || "";
    document.getElementById("admin-f-dom-avaliacao").value = adminSelectedRestaurant.avaliacao_url || "";
    status.textContent = "✅ Salvo! Já vale agora."; status.style.color = "rgba(34,197,94,0.9)";
  } catch (e) {
    status.textContent = "❌ " + e.message; status.style.color = "rgba(239,68,68,0.9)";
  }
}

/* ========================================
   🏠 CENTRAL DO CLIENTE (Admin) — editor visual
   Mostra a central como o cliente vê. Tocar num botão edita ícone, nome e link;
   o "+" adiciona; a frase é editada direto na prévia.
======================================== */
let adminCentral = null;
let _acEditando = null; // índice do botão aberto no editor (-1 = botão novo)

const AC_ICONES = {
  cardapio:  ["Cardápio", '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M8 8h7M8 12h7M8 16h4"/>'],
  delivery:  ["Delivery", '<path d="M3 7h10v8H3z"/><path d="M13 10h4l3 3v2h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'],
  fidelidade:["Fidelidade", '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>'],
  reserva:   ["Reserva", '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/>'],
  voucher:   ["Vale-presente", '<rect x="3.5" y="8" width="17" height="12.5" rx="1.5"/><path d="M2.5 8h19v4h-19zM12 8v12.5"/><path d="M12 8c-1.8 0-4.5-.7-4.5-2.6S10 3.6 12 8zm0 0c1.8 0 4.5-.7 4.5-2.6S14 3.6 12 8z"/>'],
  mapa:      ["Localização", '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>'],
  whatsapp:  ["WhatsApp", '<path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6z"/><path d="M9 8.6c.2-.4.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c-.1.1-.1.3 0 .5a6 6 0 0 0 2.5 2.4c.2.1.4.1.5 0l.6-.6c.2-.2.4-.2.6-.1l1.6.7c.2.1.4.3.4.5v.5c0 .3-.1.6-.5.8-.6.4-1.5.6-2.4.3a9 9 0 0 1-5-4.9c-.4-1-.2-2 .3-2.7z"/>'],
  instagram: ["Instagram", '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/>'],
  avaliar:   ["Avaliação", '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/><path d="M12 8.5v4"/><circle cx="12" cy="14.8" r=".6" fill="currentColor"/>'],
  link:      ["Link", '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>']
};

function _acSvg(icone) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(AC_ICONES[icone] || AC_ICONES.link)[1]}</svg>`;
}
function _acEsc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _acHttps(v) {
  try { const u = new URL(String(v || "").trim()); return u.protocol === "https:" ? u.href : null; } catch { return null; }
}

// estilos do editor (entram uma vez só na página)
function _acEstilos() {
  if (document.getElementById("ac-estilos")) return;
  const st = document.createElement("style");
  st.id = "ac-estilos";
  st.textContent = `
    .cped{ display:flex; flex-direction:column; gap:14px; }
    .cped-aviso{ margin:0; padding:10px 12px; border-radius:8px; background:rgba(251,191,36,.08); border:1px solid rgba(251,191,36,.25); color:rgba(251,191,36,.9); font-size:12px; line-height:1.5; }
    .cped-grid{ display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start; }
    .cped-fone{ position:relative; width:300px; max-width:100%; height:600px; border-radius:34px; overflow:hidden; border:6px solid #1c1c1c; box-shadow:0 20px 50px -20px rgba(0,0,0,.9); background:#0b0a09; font-family:"Poppins", system-ui, sans-serif; color:#fff; display:flex; flex-direction:column; justify-content:space-between; flex-shrink:0; }
    .cped-fundo{ position:absolute; inset:0; background:radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--cor) 38%, #0b0a09), #0b0a09 72%) center/cover no-repeat; }
    .cped-fundo::after{ content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.18) 30%, rgba(0,0,0,.18) 52%, rgba(0,0,0,.72) 82%, rgba(0,0,0,.9) 100%); }
    .cped-topo{ position:relative; z-index:1; padding:56px 16px 0; display:flex; flex-direction:column; align-items:center; text-align:center; }
    .cped-logo{ width:64px; height:64px; border-radius:50%; background:#141110; border:2px solid rgba(255,255,255,.14); overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:24px; }
    .cped-logo img{ width:100%; height:100%; object-fit:cover; }
    .cped-status{ margin-top:10px; display:inline-flex; align-items:center; gap:6px; padding:4px 10px 4px 8px; border-radius:100px; background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.12); font-size:9.5px; }
    .cped-status::before{ content:""; width:6px; height:6px; border-radius:50%; background:#22c55e; }
    .cped-nome{ margin-top:10px; font-size:22px; font-weight:300; line-height:1.15; text-shadow:0 2px 14px rgba(0,0,0,.6); }
    .cped-frase{ margin-top:6px; min-width:120px; max-width:240px; font-size:11px; line-height:1.45; color:rgba(255,255,255,.88); padding:3px 6px; border-radius:6px; border:1px dashed rgba(255,255,255,.35); outline:none; cursor:text; }
    .cped-frase:focus{ border-color:var(--cor); background:rgba(0,0,0,.35); }
    .cped-frase:empty::before{ content:attr(data-ph); color:rgba(255,255,255,.5); }
    .cped-painel{ position:relative; z-index:1; margin:0 8px 8px; padding:14px 6px 8px; border-radius:22px; background:rgba(18,14,12,.55); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.10); }
    .cped-botoes{ display:flex; flex-wrap:wrap; justify-content:center; row-gap:12px; }
    .cped-botao{ flex:0 0 25%; display:flex; flex-direction:column; align-items:center; gap:6px; padding:0 2px; background:none; border:none; color:rgba(255,255,255,.92); font-family:inherit; font-size:9.5px; line-height:1.2; cursor:pointer; text-align:center; }
    .cped-ico{ width:42px; height:42px; border-radius:13px; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--cor) 34%, rgba(255,255,255,.06)); border:1px solid rgba(255,255,255,.14); transition:transform .15s ease, box-shadow .15s ease; }
    .cped-ico svg{ width:19px; height:19px; color:#fff; }
    .cped-botao:hover .cped-ico{ box-shadow:0 0 0 2px var(--cor); }
    .cped-botao.add .cped-ico{ background:transparent; border:1.5px dashed rgba(255,255,255,.45); font-size:22px; font-weight:300; }
    .cped-ass{ margin-top:10px; text-align:center; font-size:8.5px; color:rgba(255,255,255,.5); }
    .cped-lado{ flex:1; min-width:240px; display:flex; flex-direction:column; gap:12px; }
    .cped-dica{ margin:0; color:rgba(252,228,228,.6); font-size:12.5px; line-height:1.55; }
    .cped-titulo{ color:rgba(252,228,228,.5); font-size:11px; font-weight:700; text-transform:uppercase; }
    .cped-linha{ display:flex; gap:8px; flex-wrap:wrap; }
    .cped-linha > *{ flex:1; }
    .cped-check{ display:flex; align-items:center; gap:10px; color:rgba(252,228,228,.85); font-size:13px; cursor:pointer; }
    .cped-check input{ width:18px; height:18px; accent-color:#ef4444; }
    .cped-modal{ position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; padding:16px; }
    .cped-modal[hidden]{ display:none; }
    .cped-sheet{ width:100%; max-width:440px; max-height:90vh; overflow:auto; background:#0f0f0f; border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:18px; display:flex; flex-direction:column; gap:10px; color:rgba(252,228,228,1); }
    .cped-sheet h3{ margin:0 0 4px; font-size:16px; font-weight:800; }
    .cped-sheet input{ padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:#0a0a0a; color:rgba(252,228,228,1); font-size:13px; outline:none; font-family:inherit; width:100%; box-sizing:border-box; }
    .cped-icones{ display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; }
    .cped-icone{ display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 2px; border-radius:10px; border:1px solid rgba(255,255,255,.1); background:#0a0a0a; color:rgba(252,228,228,.8); font-size:9.5px; cursor:pointer; font-family:inherit; }
    .cped-icone svg{ width:20px; height:20px; }
    .cped-icone.on{ border-color:#ef4444; background:rgba(239,68,68,.12); color:#fff; }
    .cped-sugs{ display:flex; flex-wrap:wrap; gap:6px; }
    .cped-sug{ padding:6px 10px; border-radius:100px; border:1px solid rgba(255,255,255,.14); background:#0a0a0a; color:rgba(252,228,228,.8); font-size:11.5px; cursor:pointer; font-family:inherit; }
    .cped-sug:hover{ border-color:#ef4444; }
    .cped-erro{ margin:0; min-height:16px; color:rgba(239,68,68,.95); font-size:12px; }
    .cped-acoes{ display:flex; gap:8px; flex-wrap:wrap; margin-top:4px; }
    .cped-acoes button{ padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:#0a0a0a; color:rgba(252,228,228,.9); font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; }
    .cped-acoes button:disabled{ opacity:.35; cursor:default; }
    .cped-acoes .perigo{ color:rgba(239,68,68,.95); }
    .cped-acoes .ok{ margin-left:auto; background:#ef4444; border-color:#ef4444; color:#fff; }
    @media (max-width:560px){ .cped-fone{ margin:0 auto; } .cped-lado{ min-width:100%; } }
  `;
  document.head.appendChild(st);
}

async function carregarAdminCentral(msg) {
  const corpo = document.getElementById("admin-central-corpo");
  if (!corpo || !adminSelectedRestaurant) return;
  _acEstilos();
  const rid = adminSelectedRestaurant.id;
  adminCentral = null;
  corpo.innerHTML = `<p style="color:rgba(252,228,228,0.5); font-size:13px; margin:0;">Carregando...</p>`;
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${rid}/central`, { headers: buildAdminHeaders() });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Erro ao carregar");
    if (adminSelectedRestaurant?.id !== rid) return; // trocou de restaurante no meio
    adminCentral = data;
    renderAdminCentral();
    if (msg) _acStatus(msg, "ok");
  } catch (e) {
    corpo.innerHTML = `<p style="color:rgba(239,68,68,0.9); font-size:13px; margin:0;">❌ ${_acEsc(e.message)}</p>`;
  }
}

function _acStatus(texto, tipo) {
  const st = document.getElementById("admin-status-central");
  if (!st) return;
  st.textContent = texto;
  st.style.color = tipo === "ok" ? "rgba(34,197,94,0.9)" : tipo === "erro" ? "rgba(239,68,68,0.9)" : "rgba(252,228,228,0.6)";
}
function _acMudou() { _acStatus("Alterações não salvas"); }

function renderAdminCentral() {
  const c = adminCentral, corpo = document.getElementById("admin-central-corpo");
  if (!c || !corpo) return;
  const foto = c.fundo_url || c.banner_url;
  const dominio = adminSelectedRestaurant?.central_url;
  const logo = _acHttps(c.logo_url);

  corpo.innerHTML = `
    <div class="cped" style="--cor:${_acEsc(c.cor || "#d62828")}">
      ${c.plano_ok ? "" : `<p class="cped-aviso">⚠️ A central só fica no ar a partir do plano Advanced. Dá pra deixar tudo configurado antes.</p>`}
      <div class="cped-grid">
        <div class="cped-fone">
          <div class="cped-fundo"${foto ? ` style="background-image:url('${_acEsc(foto)}')"` : ""}></div>
          <div class="cped-topo">
            <div class="cped-logo">${logo ? `<img src="${_acEsc(logo)}" alt="">` : _acEsc(String(c.nome || "?").charAt(0).toUpperCase())}</div>
            ${c.mostrar_aberto ? `<div class="cped-status">Aberto agora · fecha 23:00</div>` : ""}
            <div class="cped-nome">${_acEsc(c.nome)}</div>
            <div class="cped-frase" id="cped-frase" contenteditable="plaintext-only" spellcheck="false" data-ph="Toque para escrever uma frase">${_acEsc(c.frase)}</div>
          </div>
          <div class="cped-painel">
            <div class="cped-botoes">
              ${c.botoes.map((b, i) => `
                <button type="button" class="cped-botao" data-ac-botao="${i}" title="Editar">
                  <span class="cped-ico">${_acSvg(b.icone)}</span><span>${_acEsc(b.rotulo)}</span>
                </button>`).join("")}
              ${c.botoes.length < 12 ? `<button type="button" class="cped-botao add" id="cped-add" title="Adicionar botão"><span class="cped-ico">+</span><span>Adicionar</span></button>` : ""}
            </div>
            <div class="cped-ass">Desenvolvido por <b>FluxON</b></div>
          </div>
        </div>

        <div class="cped-lado">
          <p class="cped-dica">Essa é a central do jeito que o cliente vê. <b>Toque num botão</b> para trocar o ícone, o nome ou o link, mudar de lugar ou excluir. <b>Toque na frase</b> para escrever. O <b>+</b> adiciona um botão.</p>

          <span class="cped-titulo">Foto de fundo</span>
          <div class="cped-linha">
            <label class="primary-button" style="text-align:center; cursor:pointer; position:relative; overflow:hidden;">📷 Trocar foto
              <input type="file" id="admin-central-foto" accept="image/*" style="position:absolute; inset:0; opacity:0; cursor:pointer;">
            </label>
            ${c.fundo_url ? `<button type="button" class="primary-button" id="admin-central-tirar-foto">Usar o banner</button>` : ""}
          </div>
          <span style="color:rgba(252,228,228,0.4); font-size:11px;">${c.fundo_url ? "Usando a foto da central." : c.banner_url ? "Usando o banner do cardápio." : "Sem foto: fundo na cor do restaurante."} Melhor foto em pé (vertical).</span>

          <label class="cped-check">
            <input type="checkbox" id="admin-central-aberto" ${c.mostrar_aberto ? "checked" : ""}>
            Mostrar "Aberto agora / Fechado" (usa os Horários de Funcionamento)
          </label>

          <button type="button" class="primary-button" id="admin-btn-save-central">Salvar</button>
          <p id="admin-status-central" style="font-size:13px; min-height:18px; margin:0;"></p>
          ${dominio
            ? `<a href="https://${_acEsc(dominio)}" target="_blank" rel="noopener" style="color:rgba(252,228,228,0.7); font-size:13px;">Abrir a central ↗</a>`
            : `<p style="color:rgba(252,228,228,0.45); font-size:12px; margin:0;">Cadastre o domínio em Domínios → Central do cliente para abrir a central.</p>`}
        </div>
      </div>
      <div class="cped-modal" id="cped-modal" hidden></div>
    </div>
  `;

  const frase = document.getElementById("cped-frase");
  frase.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); frase.blur(); } });
  frase.addEventListener("input", () => {
    if (frase.textContent.length > 140) frase.textContent = frase.textContent.slice(0, 140);
    adminCentral.frase = frase.textContent;
    _acMudou();
  });
  corpo.querySelectorAll("[data-ac-botao]").forEach(b => b.onclick = () => abrirBotaoAdminCentral(Number(b.dataset.acBotao)));
  const add = document.getElementById("cped-add");
  if (add) add.onclick = () => abrirBotaoAdminCentral(-1);
  document.getElementById("admin-central-foto").onchange = function () {
    if (this.files[0]) enviarFotoAdminCentral(this.files[0]);
  };
  const tirar = document.getElementById("admin-central-tirar-foto");
  if (tirar) tirar.onclick = () => { adminCentral.fundo_url = ""; renderAdminCentral(); _acMudou(); };
  document.getElementById("admin-central-aberto").onchange = function () {
    adminCentral.mostrar_aberto = this.checked; renderAdminCentral(); _acMudou();
  };
  document.getElementById("admin-btn-save-central").onclick = salvarAdminCentral;
}

// janelinha de um botão: ícone, nome, link (com sugestões), mover e excluir
function abrirBotaoAdminCentral(i) {
  _acEditando = i;
  const novo = i < 0;
  const b = novo ? { icone: "link", rotulo: "", url: "" } : { ...adminCentral.botoes[i] };
  const total = adminCentral.botoes.length;
  const modal = document.getElementById("cped-modal");
  modal.innerHTML = `
    <div class="cped-sheet" role="dialog" aria-modal="true">
      <h3>${novo ? "Novo botão" : "Editar botão"}</h3>
      <span class="cped-titulo">Ícone</span>
      <div class="cped-icones">
        ${Object.entries(AC_ICONES).map(([k, [nome]]) => `
          <button type="button" class="cped-icone${k === b.icone ? " on" : ""}" data-ac-icone="${k}">${_acSvg(k)}<span>${nome}</span></button>`).join("")}
      </div>
      <span class="cped-titulo">Nome</span>
      <input id="cped-rotulo" maxlength="30" value="${_acEsc(b.rotulo)}" placeholder="Ex.: Faça sua reserva" autocomplete="off">
      <span class="cped-titulo">Link</span>
      <input id="cped-url" value="${_acEsc(b.url)}" placeholder="https://..." autocomplete="off" inputmode="url">
      ${adminCentral.sugestoes?.length ? `
        <span style="color:rgba(252,228,228,0.45); font-size:11px;">Links que o sistema já conhece (toque para usar):</span>
        <div class="cped-sugs">
          ${adminCentral.sugestoes.map((s, k) => `<button type="button" class="cped-sug" data-ac-sug="${k}">${_acEsc(s.origem)}</button>`).join("")}
        </div>` : ""}
      <p class="cped-erro" id="cped-erro"></p>
      <div class="cped-acoes">
        ${novo ? "" : `
          <button type="button" id="cped-esq" ${i === 0 ? "disabled" : ""} title="Mover para a esquerda">◀</button>
          <button type="button" id="cped-dir" ${i === total - 1 ? "disabled" : ""} title="Mover para a direita">▶</button>
          <button type="button" class="perigo" id="cped-excluir">Excluir</button>`}
        <button type="button" id="cped-cancelar">Cancelar</button>
        <button type="button" class="ok" id="cped-pronto">Pronto</button>
      </div>
    </div>`;
  modal.hidden = false;

  let icone = b.icone;
  modal.querySelectorAll("[data-ac-icone]").forEach(el => el.onclick = () => {
    icone = el.dataset.acIcone;
    modal.querySelectorAll("[data-ac-icone]").forEach(x => x.classList.toggle("on", x === el));
  });
  modal.querySelectorAll("[data-ac-sug]").forEach(el => el.onclick = () => {
    const s = adminCentral.sugestoes[Number(el.dataset.acSug)];
    document.getElementById("cped-url").value = s.url;
    const rot = document.getElementById("cped-rotulo");
    if (!rot.value.trim()) rot.value = s.rotulo;
    icone = s.icone;
    modal.querySelectorAll("[data-ac-icone]").forEach(x => x.classList.toggle("on", x.dataset.acIcone === icone));
  });
  const fechar = () => { modal.hidden = true; modal.innerHTML = ""; _acEditando = null; };
  modal.onclick = e => { if (e.target === modal) fechar(); };
  document.getElementById("cped-cancelar").onclick = fechar;

  const mover = d => {
    const lista = adminCentral.botoes, j = i + d;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    fechar(); renderAdminCentral(); _acMudou();
  };
  if (!novo) {
    document.getElementById("cped-esq").onclick = () => mover(-1);
    document.getElementById("cped-dir").onclick = () => mover(1);
    document.getElementById("cped-excluir").onclick = () => {
      if (!confirm(`Excluir o botão "${adminCentral.botoes[i].rotulo}"?`)) return;
      adminCentral.botoes.splice(i, 1);
      fechar(); renderAdminCentral(); _acMudou();
    };
  }
  document.getElementById("cped-pronto").onclick = () => {
    const rotulo = document.getElementById("cped-rotulo").value.trim();
    let url = document.getElementById("cped-url").value.trim();
    if (url && !/^[a-z]+:\/\//i.test(url)) url = "https://" + url; // colou sem o https://
    const erro = document.getElementById("cped-erro");
    if (!rotulo) { erro.textContent = "Dê um nome para o botão."; return; }
    if (!_acHttps(url)) { erro.textContent = "Cole um link que comece com https://"; return; }
    const item = { icone, rotulo, url: _acHttps(url) };
    if (novo) adminCentral.botoes.push(item); else adminCentral.botoes[i] = item;
    fechar(); renderAdminCentral(); _acMudou();
  };
  setTimeout(() => document.getElementById(novo ? "cped-rotulo" : "cped-url")?.focus(), 50);
}

async function enviarFotoAdminCentral(file) {
  // abre o recorte em pé (formato de celular): dá pra dar zoom e arrastar a foto
  const recorte = await openCropModal(file, { proporcao: 9 / 16, largura: 1080, altura: 1920, titulo: "✂️ Ajustar foto de fundo" });
  const input = document.getElementById("admin-central-foto");
  if (input) input.value = ""; // deixa escolher a mesma foto de novo
  if (!recorte) return;
  _acStatus("Enviando foto...");
  try {
    const formData = new FormData();
    formData.append("file", recorte, "fundo.jpg");
    formData.append("bucket", "restaurante-banners");
    const resp = await fetch(`${API_BASE}/api/v1/upload-image`, { method: "POST", body: formData });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.url) throw new Error(data.error || "Erro no upload");
    adminCentral.fundo_url = data.url;
    renderAdminCentral();
    _acStatus("Foto pronta. Clique em Salvar para publicar.");
  } catch (e) {
    _acStatus("❌ " + e.message, "erro");
  }
}

async function salvarAdminCentral() {
  if (!adminCentral || !adminSelectedRestaurant) return;
  const body = {
    fundo_url: adminCentral.fundo_url || null,
    frase: adminCentral.frase || "",
    mostrar_aberto: !!adminCentral.mostrar_aberto,
    botoes: adminCentral.botoes.map(b => ({ icone: b.icone, rotulo: b.rotulo, url: b.url }))
  };
  _acStatus("Salvando...");
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/central`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "Erro ao salvar");
    await carregarAdminCentral("✅ Salvo! Já vale agora.");
  } catch (e) {
    _acStatus("❌ " + e.message, "erro");
  }
}

/* ========================================
   🎁 VALE-PRESENTE (Admin)
   Liga/desliga a venda, define a validade e mostra o resumo do que foi vendido
======================================== */
async function carregarAdminVouchers(msg) {
  const corpo = document.getElementById("admin-vouchers-corpo");
  if (!corpo || !adminSelectedRestaurant) return;
  const rid = adminSelectedRestaurant.id;
  corpo.innerHTML = `<p style="color:rgba(252,228,228,0.5); font-size:13px; margin:0;">Carregando...</p>`;
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${rid}/vouchers`, { headers: buildAdminHeaders() });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(d.error || "Erro ao carregar");
    if (adminSelectedRestaurant?.id !== rid) return;
    const dominio = adminSelectedRestaurant.vouchers_url;
    const brl = v => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
    const caixa = "padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:#0d0d0d; flex:1; min-width:110px;";
    corpo.innerHTML = `
      ${d.pix_online ? "" : `<p style="margin:0; padding:10px 12px; border-radius:8px; background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.25); color:rgba(251,191,36,0.9); font-size:12px; line-height:1.5;">⚠️ Este restaurante ainda não tem Pix online configurado. Sem ele, a página de compra não abre.</p>`}
      <label style="display:flex; align-items:center; gap:10px; color:rgba(252,228,228,0.9); font-size:14px; cursor:pointer;">
        <input type="checkbox" id="admin-vp-ativo" ${d.ativo ? "checked" : ""} style="width:18px; height:18px; accent-color:#ef4444;">
        Vender vale-presente
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="color:rgba(252,228,228,0.5); font-size:11px; font-weight:700; text-transform:uppercase;">Validade (a partir da compra)</span>
        <select id="admin-vp-validade" style="padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:#0a0a0a; color:rgba(252,228,228,1); font-size:13px; outline:none; font-family:inherit;">
          ${d.opcoes_validade.map(n => `<option value="${n}" ${n === d.validade_dias ? "selected" : ""}>${n} dias</option>`).join("")}
        </select>
      </label>
      <p style="color:rgba(252,228,228,0.45); font-size:12px; line-height:1.5; margin:0;">Valores à venda: ${d.valores.map(v => `R$ ${v}`).join(", ")}. O saldo que sobra depois de um uso vence na mesma data.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <div style="${caixa}"><div style="color:rgba(252,228,228,0.5); font-size:11px;">Vendidos</div><div style="color:rgba(252,228,228,1); font-size:16px; font-weight:800;">${d.vendidos}</div></div>
        <div style="${caixa}"><div style="color:rgba(252,228,228,0.5); font-size:11px;">Total vendido</div><div style="color:rgba(252,228,228,1); font-size:16px; font-weight:800;">${brl(d.total_vendido)}</div></div>
        <div style="${caixa}"><div style="color:rgba(252,228,228,0.5); font-size:11px;">Saldo em aberto</div><div style="color:rgba(252,228,228,1); font-size:16px; font-weight:800;">${brl(d.saldo_em_aberto)}</div></div>
      </div>
      <button type="button" class="primary-button" id="admin-btn-save-vouchers">Salvar</button>
      <p id="admin-status-vouchers" style="font-size:13px; min-height:18px; margin:0;"></p>
      ${dominio
              ? `<a href="https://${_acEsc(dominio)}" target="_blank" rel="noopener" style="color:rgba(252,228,228,0.7); font-size:13px;">Abrir a página de compra ↗</a>`
        : `<p style="color:rgba(252,228,228,0.45); font-size:12px; margin:0;">Cadastre o domínio em Domínios → Vouchers para abrir a página de compra.</p>`}
    `;
    document.getElementById("admin-btn-save-vouchers").onclick = salvarAdminVouchers;
    if (msg) {
      const st = document.getElementById("admin-status-vouchers");
      st.textContent = msg; st.style.color = "rgba(34,197,94,0.9)";
    }
  } catch (e) {
    corpo.innerHTML = `<p style="color:rgba(239,68,68,0.9); font-size:13px; margin:0;">❌ ${_acEsc(e.message)}</p>`;
  }
}

async function salvarAdminVouchers() {
  if (!adminSelectedRestaurant) return;
  const st = document.getElementById("admin-status-vouchers");
  st.textContent = "Salvando..."; st.style.color = "rgba(252,228,228,0.6)";
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/vouchers`, {
      method: "PATCH", headers: buildAdminHeaders(),
      body: JSON.stringify({
        ativo: document.getElementById("admin-vp-ativo").checked,
        validade_dias: Number(document.getElementById("admin-vp-validade").value)
      })
    });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(d.error || "Erro ao salvar");
    await carregarAdminVouchers("✅ Salvo! Já vale agora.");
    if (typeof carregarAdminCentral === "function") carregarAdminCentral(); // atualiza a sugestão de link na Central
  } catch (e) {
    st.textContent = "❌ " + e.message; st.style.color = "rgba(239,68,68,0.9)";
  }
}

/* ========================================
   📅 RESERVA DE MESA (Admin)
   Liga/desliga, valor do Pix (vira crédito), tempos e lugares de cada mesa
======================================== */
async function carregarAdminReservas(msg) {
  const corpo = document.getElementById("admin-reservas-corpo");
  if (!corpo || !adminSelectedRestaurant) return;
  const rid = adminSelectedRestaurant.id;
  corpo.innerHTML = `<p style="color:rgba(252,228,228,0.5); font-size:13px; margin:0;">Carregando...</p>`;
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${rid}/reservas`, { headers: buildAdminHeaders() });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(d.error || "Erro ao carregar");
    if (adminSelectedRestaurant?.id !== rid) return;
    const inp = "padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:#0a0a0a; color:rgba(252,228,228,1); font-size:13px; outline:none; font-family:inherit; width:100%; box-sizing:border-box;";
    const rot = "color:rgba(252,228,228,0.5); font-size:11px; font-weight:700; text-transform:uppercase;";
    const tempo = n => n >= 1440 ? `${n / 1440} dia${n >= 2880 ? "s" : ""}` : n >= 60 ? `${n / 60}h`.replace(".5h", "h30") : `${n} min`;
    const sel = (id, lista, atual, fmt) => `<select id="${id}" style="${inp}">${lista.map(n => `<option value="${n}" ${n === atual ? "selected" : ""}>${fmt(n)}</option>`).join("")}</select>`;
    const campo = (titulo, html) => `<label style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:140px;"><span style="${rot}">${titulo}</span>${html}</label>`;
    const dominio = adminSelectedRestaurant.reservas_url;
    const quando = iso => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    corpo.innerHTML = `
      ${d.pix_online ? "" : `<p style="margin:0; padding:10px 12px; border-radius:8px; background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.25); color:rgba(251,191,36,0.9); font-size:12px; line-height:1.5;">⚠️ Este restaurante ainda não tem Pix online configurado. Sem ele, a página de reservas não abre.</p>`}
      <label style="display:flex; align-items:center; gap:10px; color:rgba(252,228,228,0.9); font-size:14px; cursor:pointer;">
        <input type="checkbox" id="admin-rs-ativo" ${d.ativo ? "checked" : ""} style="width:18px; height:18px; accent-color:#ef4444;">
        Aceitar reservas de mesa
      </label>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${campo("Valor no Pix (vira crédito)", `<input id="admin-rs-valor" type="number" min="1" max="1000" step="1" value="${d.valor}" style="${inp}">`)}
        ${campo("Duração da reserva", sel("admin-rs-duracao", d.opcoes.duracao, d.duracao, tempo))}
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${campo("Mesa bloqueada antes", sel("admin-rs-bloqueio", d.opcoes.bloqueio, d.bloqueio, n => n ? tempo(n) + " antes" : "Não bloquear"))}
        ${campo("Tolerância de atraso", sel("admin-rs-tolerancia", d.opcoes.tolerancia, d.tolerancia, tempo))}
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${campo("Antecedência mínima", sel("admin-rs-antecedencia", d.opcoes.antecedencia, d.antecedencia, tempo))}
        ${campo("Reservar com até", sel("admin-rs-dias", d.opcoes.dias, d.dias, n => `${n} dias de antecedência`))}
      </div>
      <p style="color:rgba(252,228,228,0.45); font-size:12px; line-height:1.5; margin:0;">Os horários saem dos Horários de Funcionamento, de 30 em 30 minutos, até 1h antes de fechar. O número de mesas vem de Dados e Operação.</p>

      <span style="${rot}">Mesas (lugares e se aceitam reserva)</span>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px;">
        ${d.mesas.map(m => `
          <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:#0d0d0d;">
            <input type="checkbox" data-rs-mesa="${m.numero}" ${m.reservavel ? "checked" : ""} title="Aceita reserva" style="width:16px; height:16px; accent-color:#ef4444;">
            <span style="color:rgba(252,228,228,0.9); font-size:13px; font-weight:700; flex:1;">Mesa ${m.numero}</span>
            <input type="number" data-rs-lugares="${m.numero}" min="1" max="30" value="${m.lugares}" title="Lugares" style="${inp} width:54px; padding:6px 8px;">
          </div>`).join("")}
      </div>
      <span style="color:rgba(252,228,228,0.4); font-size:11px;">Marcado = aceita reserva · número = quantos lugares a mesa tem.</span>

      <button type="button" class="primary-button" id="admin-btn-save-reservas">Salvar</button>
      <p id="admin-status-reservas" style="font-size:13px; min-height:18px; margin:0;"></p>
      ${dominio
        ? `<a href="https://${_acEsc(dominio)}" target="_blank" rel="noopener" style="color:rgba(252,228,228,0.7); font-size:13px;">Abrir a página de reservas ↗</a>`
        : `<p style="color:rgba(252,228,228,0.45); font-size:12px; margin:0;">Cadastre o domínio em Domínios → Reservas para abrir a página.</p>`}

      <span style="${rot}">Próximas reservas</span>
      ${d.proximas.length ? d.proximas.map(r => `
        <div style="display:flex; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:#0d0d0d; font-size:13px; color:rgba(252,228,228,0.9);">
          <span><b>${_acEsc(quando(r.inicio))}</b> · Mesa ${r.mesa} · ${r.pessoas}p</span>
          <span style="color:rgba(252,228,228,0.6);">${_acEsc(r.nome)}</span>
        </div>`).join("") : `<p style="color:rgba(252,228,228,0.45); font-size:12px; margin:0;">Nenhuma reserva por enquanto.</p>`}
    `;
    document.getElementById("admin-btn-save-reservas").onclick = () => salvarAdminReservas(d.mesas);
    if (msg) {
      const st = document.getElementById("admin-status-reservas");
      st.textContent = msg; st.style.color = "rgba(34,197,94,0.9)";
    }
  } catch (e) {
    corpo.innerHTML = `<p style="color:rgba(239,68,68,0.9); font-size:13px; margin:0;">❌ ${_acEsc(e.message)}</p>`;
  }
}

async function salvarAdminReservas(mesas) {
  if (!adminSelectedRestaurant) return;
  const st = document.getElementById("admin-status-reservas");
  const v = id => document.getElementById(id).value;
  st.textContent = "Salvando..."; st.style.color = "rgba(252,228,228,0.6)";
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/reservas`, {
      method: "PATCH", headers: buildAdminHeaders(),
      body: JSON.stringify({
        ativo: document.getElementById("admin-rs-ativo").checked,
        valor: Number(v("admin-rs-valor")),
        duracao: Number(v("admin-rs-duracao")), bloqueio: Number(v("admin-rs-bloqueio")),
        tolerancia: Number(v("admin-rs-tolerancia")), antecedencia: Number(v("admin-rs-antecedencia")), dias: Number(v("admin-rs-dias")),
        mesas: mesas.map(m => ({
          numero: m.numero,
          lugares: Number(document.querySelector(`[data-rs-lugares="${m.numero}"]`).value) || 4,
          reservavel: document.querySelector(`[data-rs-mesa="${m.numero}"]`).checked
        }))
      })
    });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(d.error || "Erro ao salvar");
    await carregarAdminReservas("✅ Salvo! Já vale agora.");
  } catch (e) {
    st.textContent = "❌ " + e.message; st.style.color = "rgba(239,68,68,0.9)";
  }
}

async function salvarAdminHorarios() {
  if (!adminSelectedRestaurant) return;
  const status = document.getElementById("admin-status-horarios");
  const aberturas = document.querySelectorAll(".admin-horario-abertura");
  const horarios = [...aberturas].map(input => {
    const dia = parseInt(input.dataset.dia);
    const fechamento = document.querySelector(`.admin-horario-fechamento[data-dia="${dia}"]`)?.value;
    return { dia_semana: dia, abertura: input.value, fechamento };
  });
  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants/${adminSelectedRestaurant.id}/horarios`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify({ horarios })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    status.textContent = "✅ Salvo!"; status.style.color = "rgba(34,197,94,0.9)";
  } catch (e) {
    status.textContent = "❌ " + e.message; status.style.color = "rgba(239,68,68,0.9)";
  }
}

// ===== DONOS (FluxON Owner) =====
const DONO_INPUT_STYLE = "width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(28,28,30,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;";
let adminDonosCache = [];

function donosCheckboxes(selecionados = [], cls = "dono-rest-check") {
  if (!adminRestaurantsCache.length) return `<span style="font-size:13px; color:rgba(252,228,228,0.5);">Nenhum restaurante encontrado.</span>`;
  return adminRestaurantsCache.map(r => `
    <label style="display:flex; align-items:center; gap:10px; padding:6px 0; color:rgba(252,228,228,0.9); font-size:14px;">
      <input type="checkbox" class="${cls}" value="${escapeHtml(r.id)}" ${selecionados.includes(r.id) ? "checked" : ""}>
      <span>${escapeHtml(r.name)} <span style="color:rgba(252,228,228,0.4); font-size:12px;">· ${escapeHtml(r.plan || "")}</span></span>
    </label>`).join("");
}

function donoFormatarTelefone(t) {
  const d = String(t || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || "";
}

function donoStatus(id, texto, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.style.color = ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)";
}

async function openAdminDonosModal() {
  document.getElementById("admin-donos-modal")?.remove();
  if (!adminRestaurantsCache.length) await fetchAdminRestaurants();

  const modal = document.createElement("div");
  modal.id = "admin-donos-modal";
  modal.className = "modal-backdrop open";
  modal.innerHTML = `
    <div class="modal confirm-modal" style="max-width:560px; max-height:88vh; overflow-y:auto;">
      <div class="modal-header"><h3>👑 Donos do FluxON Owner</h3></div>
      <div class="modal-body" style="gap:14px;">
        <div id="donos-lista" style="display:flex; flex-direction:column; gap:10px;"></div>
        <hr style="border:none; border-top:1px solid rgba(255,255,255,0.12); width:100%; margin:4px 0;">
        <b style="color:rgba(252,228,228,0.9);">+ Novo dono</b>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Nome *
          <input id="dono-novo-nome" style="${DONO_INPUT_STYLE}" /></label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">CPF *
          <input id="dono-novo-cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" style="${DONO_INPUT_STYLE}" /></label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">WhatsApp (com DDD) *
          <input id="dono-novo-tel" inputmode="tel" placeholder="(11) 99999-9999" style="${DONO_INPUT_STYLE}" /></label>
        <div style="color:rgba(252,228,228,0.8); font-size:13px;">Restaurantes pelos quais é responsável *
          <div id="dono-novo-rests" style="margin-top:6px; max-height:180px; overflow-y:auto;">${donosCheckboxes()}</div>
        </div>
        <p id="donos-status" style="font-size:13px; min-height:18px; margin:0;"></p>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="donos-fechar">Fechar</button>
        <button class="primary-button" id="donos-criar">Criar dono</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.getElementById("donos-fechar").addEventListener("click", () => modal.remove());
  document.getElementById("donos-criar").addEventListener("click", criarDonoAdmin);
  document.getElementById("donos-lista").addEventListener("click", cliqueListaDonos);
  await carregarDonosAdmin();
}

async function carregarDonosAdmin() {
  const box = document.getElementById("donos-lista");
  if (!box) return;
  try {
    const resp = await fetch(`${ADMIN_URL}/owners`, { headers: buildAdminHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erro ao listar donos");
    adminDonosCache = data;
    if (!data.length) {
      box.innerHTML = `<span style="font-size:13px; color:rgba(252,228,228,0.5);">Nenhum dono cadastrado ainda.</span>`;
      return;
    }
    box.innerHTML = data.map(o => {
      const nomes = (o.restaurant_ids || []).map(id => adminRestaurantsCache.find(r => r.id === id)?.name || "—");
      return `
        <div style="border:1px solid rgba(255,255,255,0.14); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; ${o.ativo ? "" : "opacity:0.55;"}">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
            <div>
              <div style="font-weight:800; color:rgba(252,228,228,0.95);">${escapeHtml(o.nome)} ${o.ativo ? "" : "<span style='font-size:11px; color:rgba(239,68,68,0.9);'>(desativado)</span>"}</div>
              <div style="font-size:12px; color:rgba(252,228,228,0.45); margin-top:2px;">${escapeHtml(donoFormatarTelefone(o.telefone))}</div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
              <button class="ghost-button" data-act="rest" data-id="${escapeHtml(o.id)}">Restaurantes</button>
              <button class="ghost-button" data-act="ativo" data-id="${escapeHtml(o.id)}">${o.ativo ? "Desativar" : "Ativar"}</button>
            </div>
          </div>
          <div style="font-size:13px; color:rgba(252,228,228,0.7);">🏪 ${nomes.length ? nomes.map(escapeHtml).join(", ") : "Nenhum restaurante"}</div>
        </div>`;
    }).join("");
  } catch (e) {
    box.innerHTML = `<span style="font-size:13px; color:rgba(239,68,68,0.9);">❌ ${escapeHtml(e.message)}</span>`;
  }
}

function cliqueListaDonos(e) {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const dono = adminDonosCache.find(o => o.id === b.dataset.id);
  if (!dono) return;
  if (b.dataset.act === "ativo") alternarDonoAtivo(dono);
  if (b.dataset.act === "rest") abrirEditarRestaurantesDono(dono);
}

async function alternarDonoAtivo(dono) {
  const acao = dono.ativo ? "desativar" : "ativar";
  if (!confirm(`Deseja ${acao} ${dono.nome}?${dono.ativo ? " Ele será desconectado de todos os aparelhos." : ""}`)) return;
  try {
    const resp = await fetch(`${ADMIN_URL}/owners/${dono.id}`, {
      method: "PATCH", headers: buildAdminHeaders(), body: JSON.stringify({ ativo: !dono.ativo })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    await carregarDonosAdmin();
  } catch (e) { donoStatus("donos-status", "❌ " + e.message, false); }
}

function abrirEditarRestaurantesDono(dono) {
  document.getElementById("admin-donos-rest-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "admin-donos-rest-modal";
  modal.className = "modal-backdrop open";
  modal.style.zIndex = "10000";
  modal.innerHTML = `
    <div class="modal confirm-modal" style="max-width:420px; max-height:80vh; overflow-y:auto;">
      <div class="modal-header"><h3>Restaurantes de ${escapeHtml(dono.nome)}</h3></div>
      <div class="modal-body" style="gap:8px;">
        <div>${donosCheckboxes(dono.restaurant_ids || [], "dono-edit-check")}</div>
        <p id="donos-rest-status" style="font-size:13px; min-height:18px; margin:0;"></p>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="donos-rest-cancel">Cancelar</button>
        <button class="primary-button" id="donos-rest-save">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.getElementById("donos-rest-cancel").addEventListener("click", () => modal.remove());
  document.getElementById("donos-rest-save").addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".dono-edit-check:checked")].map(c => c.value);
    if (!ids.length) { donoStatus("donos-rest-status", "❌ Marque ao menos um restaurante.", false); return; }
    try {
      const resp = await fetch(`${ADMIN_URL}/owners/${dono.id}/restaurantes`, {
        method: "PUT", headers: buildAdminHeaders(), body: JSON.stringify({ restaurant_ids: ids })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      modal.remove();
      await carregarDonosAdmin();
    } catch (e) { donoStatus("donos-rest-status", "❌ " + e.message, false); }
  });
}

async function criarDonoAdmin() {
  const nome = document.getElementById("dono-novo-nome").value.trim();
  const cpf = document.getElementById("dono-novo-cpf").value.replace(/\D/g, "");
  const telefone = document.getElementById("dono-novo-tel").value.replace(/\D/g, "");
  const ids = [...document.querySelectorAll(".dono-rest-check:checked")].map(c => c.value);

  if (!nome || cpf.length !== 11 || telefone.length < 10 || !ids.length) {
    donoStatus("donos-status", "❌ Preencha nome, CPF, telefone e marque ao menos um restaurante.", false);
    return;
  }
  const btn = document.getElementById("donos-criar");
  btn.disabled = true;
  try {
    const resp = await fetch(`${ADMIN_URL}/owners`, {
      method: "POST", headers: buildAdminHeaders(),
      body: JSON.stringify({ nome, cpf, telefone, restaurant_ids: ids })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    ["dono-novo-nome", "dono-novo-cpf", "dono-novo-tel"].forEach(id => { document.getElementById(id).value = ""; });
    document.querySelectorAll(".dono-rest-check").forEach(c => { c.checked = false; });
    donoStatus("donos-status", "✅ Dono criado! Ele já pode entrar no FluxON Owner.", true);
    await carregarDonosAdmin();
  } catch (e) {
    donoStatus("donos-status", "❌ " + e.message, false);
  } finally { btn.disabled = false; }
}

function openAdminCreateModal() {
  const existing = document.getElementById("admin-create-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "admin-create-modal";
  modal.className = "modal-backdrop open";
  modal.innerHTML = `
    <div class="modal confirm-modal" style="max-width:420px;">
      <div class="modal-header"><h3>+ Novo Restaurante</h3></div>
      <div class="modal-body" style="gap:12px;">
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Nome *
          <input id="admin-new-name" style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(28,28,30,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Email de login (Google) *
          <input id="admin-new-email" type="email" style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(28,28,30,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Plano
          <select id="admin-new-plan" style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(28,28,30,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;">
            <option value="essential">Essential</option>
            <option value="advanced">Advanced</option>
            <option value="executive">Executive</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <p id="admin-new-status" style="font-size:13px; min-height:18px; margin:0;"></p>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="admin-new-cancel">Cancelar</button>
        <button class="primary-button" id="admin-new-save">Criar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.getElementById("admin-new-cancel").addEventListener("click", () => modal.remove());
  document.getElementById("admin-new-save").addEventListener("click", criarRestauranteAdmin);
}

async function criarRestauranteAdmin() {
  const name = document.getElementById("admin-new-name").value.trim();
  const email = document.getElementById("admin-new-email").value.trim();
  const plan = document.getElementById("admin-new-plan").value;
  const status = document.getElementById("admin-new-status");

  if (!name || !email) { status.textContent = "❌ Preencha nome e email."; status.style.color = "rgba(239,68,68,0.9)"; return; }

  try {
    const resp = await fetch(`${ADMIN_URL}/restaurants`, {
      method: "POST", headers: buildAdminHeaders(), body: JSON.stringify({ name, email, plan })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    document.getElementById("admin-create-modal")?.remove();
    await fetchAdminRestaurants();
    selecionarAdminRestaurante(data.restaurant.id);
  } catch (e) {
    status.textContent = "❌ " + e.message; status.style.color = "rgba(239,68,68,0.9)";
  }
}

// ===== ABRIR NO FLUXON (impersonação numa aba nova) =====
async function impersonarRestaurante(id) {
  // a aba abre já no clique (se abrir depois do fetch, o navegador bloqueia como pop-up)
  const aba = window.open("about:blank", "_blank");
  if (aba) aba.document.write('<body style="background:#050505;color:#fce4e4;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">Abrindo o FluxON...</body>');
  try {
    const resp = await fetch(`${ADMIN_URL}/impersonate`, {
      method: "POST", headers: buildAdminHeaders(), body: JSON.stringify({ restaurant_id: id })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.token) throw new Error(data.error || "Não foi possível abrir");
    const url = `${OPERACIONAL_URL}/#imp=${encodeURIComponent(data.token)}&n=${encodeURIComponent(data.restaurant?.name || "")}`;
    if (aba) { aba.opener = null; aba.location.replace(url); }
    else location.href = url; // pop-up bloqueado: abre aqui mesmo
  } catch (e) {
    aba?.close();
    alert("Erro ao abrir o restaurante: " + e.message);
  }
}

// ===== EVENTOS =====
document.getElementById("admin-btn-sair")?.addEventListener("click", sairDoAdmin);
document.getElementById("admin-btn-novo")?.addEventListener("click", openAdminCreateModal);
document.getElementById("admin-btn-donos")?.addEventListener("click", openAdminDonosModal);
document.getElementById("admin-btn-impersonate")?.addEventListener("click", () => {
  if (adminSelectedRestaurant) impersonarRestaurante(adminSelectedRestaurant.id);
});
document.getElementById("admin-btn-save-restaurante")?.addEventListener("click", salvarAdminRestauranteBasico);
document.getElementById("admin-btn-save-aparencia")?.addEventListener("click", salvarAdminAparencia);
document.getElementById("admin-btn-save-horarios")?.addEventListener("click", salvarAdminHorarios);
document.getElementById("admin-btn-save-operacao")?.addEventListener("click", salvarAdminOperacao);
document.getElementById("admin-btn-save-dominios")?.addEventListener("click", salvarAdminDominios);

const adminSearchInput = document.getElementById("admin-search-restaurant");
if (adminSearchInput) {
  adminSearchInput.addEventListener("input", () => renderAdminDropdown(adminSearchInput.value));
  adminSearchInput.addEventListener("focus", () => renderAdminDropdown(adminSearchInput.value));
}
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("admin-search-dropdown");
  const input = document.getElementById("admin-search-restaurant");
  if (dropdown && !dropdown.contains(e.target) && e.target !== input) dropdown.style.display = "none";
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("crop-modal-backdrop")?.classList.contains("hidden")) return cancelCrop();
  document.querySelector(".modal-backdrop.open")?.remove();
});

setupAdminImageInputs();

// ===== INÍCIO =====
if (tokenAdminValido()) mostrarPainel();
else { gravarLocal("fx_admin_token", null); mostrarLogin(); }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
