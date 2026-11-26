const CONFIG = window.RMS_CONTROL_CONFIG ?? {};
const ROOT = document.getElementById("app");
const state = {
  session: null,
  emailHint: "",
  tenants: [],
  page: "overview",
  search: "",
  modal: null,
  busy: false,
  upstream: { loading: false, data: null, error: "" },
};

const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10v10h16V10M3 9l2-5h14l2 5M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0M9 20v-6h6v6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2m4 0h2m-8 4h2m4 0h2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 4.2a3.5 3.5 0 0 1 0 6.8M18 14.5a4 4 0 0 1 3 3.9V20"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  branch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="6" cy="4" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M18 16a6 6 0 0 0-6-6H6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function initials(value = "") { return String(value).trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "R"; }
function formatDate(value) { return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function toast(message, kind = "success") {
  const host = document.getElementById("toasts");
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.innerHTML = `${kind === "success" ? ICONS.check : ICONS.close}<span>${escapeHtml(message)}</span>`;
  host.append(node);
  setTimeout(() => node.remove(), 3800);
}
function configError() {
  return !CONFIG.supabaseUrl || !CONFIG.publishableKey || CONFIG.supabaseUrl.includes("__SUPABASE");
}
function url(path) { return `${String(CONFIG.supabaseUrl).replace(/\/$/, "")}${path}`; }
async function request(path, { method = "GET", body, token, auth = false } = {}) {
  const headers = { apikey: CONFIG.publishableKey, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Error ${response.status}`);
  return data;
}
async function functionCall(action, payload = {}, needsAuth = true) {
  await refreshSession();
  return request("/functions/v1/rms-admin", {
    method: "POST",
    body: { action, ...payload },
    token: needsAuth ? state.session?.access_token : undefined,
  });
}
function saveSession(session) {
  state.session = session;
  localStorage.setItem("rms_control_session", JSON.stringify(session));
}
function loadSession() {
  try { state.session = JSON.parse(localStorage.getItem("rms_control_session") || "null"); }
  catch { state.session = null; }
}
async function refreshSession() {
  const session = state.session;
  if (!session?.access_token) return;
  if (Number(session.expires_at || 0) * 1000 > Date.now() + 60_000) return;
  if (!session.refresh_token) { logout(false); return; }
  const renewed = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: { refresh_token: session.refresh_token },
  });
  saveSession({ ...renewed, expires_at: Math.floor(Date.now() / 1000) + Number(renewed.expires_in || 3600) });
}
function logout(repaint = true) {
  if (state.session?.access_token) request("/auth/v1/logout", { method: "POST", token: state.session.access_token }).catch(() => {});
  localStorage.removeItem("rms_control_session");
  state.session = null;
  state.tenants = [];
  if (repaint) render();
}

function brand(dark = false) {
  return `<div class="${dark ? "login-brand" : "brand"}"><img src="./brand/desk-mark-gradient.jpg" alt="" /><span class="${dark ? "login-brand-copy" : "brand-copy"}"><strong>Desk</strong><small>by Rekov Systems</small></span></div>`;
}

function renderLogin(message = "") {
  ROOT.innerHTML = `<div class="login-page">
    <section class="login-story">
      ${brand(true)}
      <div class="login-copy">
        <div class="eyebrow">REKOV RETAIL MANAGEMENT SYSTEM</div>
        <h1>Una plataforma.<br /><em>Cada negocio,</em><br />en su lugar.</h1>
        <p>Administra las empresas, accesos y espacios comerciales que viven en Rekov RMS.</p>
      </div>
      <div class="login-footer">© ${new Date().getFullYear()} Rekov Systems · Acceso interno</div>
    </section>
    <section class="login-box-wrap"><div class="login-box">
      <div class="desk-mobile">${brand(true)}</div>
      <div class="eyebrow">PANEL DE PLATAFORMA</div>
      <h2>Bienvenido</h2>
      <p>Ingresa con la cuenta administradora de Rekov para gestionar los negocios.</p>
      ${message ? `<div class="error-box">${ICONS.lock}<span>${escapeHtml(message)}</span></div>` : ""}
      <form id="login-form">
        <div class="field"><label for="email">Correo administrador</label><input id="email" name="email" type="email" autocomplete="username" value="${escapeHtml(state.emailHint)}" required /></div>
        <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required /></div>
        <button class="button button-primary" id="login-button" type="submit">Iniciar sesión ${ICONS.arrow}</button>
      </form>
      <div class="login-footnote">Sin registro público · Administrado por Rekov Systems</div>
    </div></section>
  </div>`;
  ROOT.querySelector("#login-form").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = ROOT.querySelector("#login-button");
  button.disabled = true;
  button.innerHTML = '<span class="loader" style="width:15px;height:15px;border-color:#777;border-top-color:#fff"></span> Validando';
  try {
    const session = await request("/auth/v1/token?grant_type=password", {
      method: "POST", body: { email: form.get("email"), password: form.get("password") },
    });
    saveSession({ ...session, expires_at: Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600) });
    state.emailHint = session.user?.email || String(form.get("email"));
    await loadTenants();
    state.page = "overview";
    render();
  } catch (error) {
    renderLogin(error.message || "No se pudo iniciar sesión");
  }
}

async function loadTenants() {
  const data = await functionCall("list_tenants");
  state.tenants = data.tenants || [];
}

function sidebar() {
  const links = [
    ["overview", "Resumen", "grid"],
    ["businesses", "Negocios", "store"],
    ["upstream", "Cambios del proyecto", "branch"],
  ];
  return `<aside class="sidebar" id="sidebar">
    ${brand()}
    <div class="nav-label">PLATAFORMA</div>
    <nav class="nav-list">${links.map(([id, label, icon]) => `<button class="nav-item ${state.page === id ? "active" : ""}" data-page="${id}">${ICONS[icon]}<span>${label}</span>${state.page === id ? ICONS.chevron : ""}</button>`).join("")}</nav>
    <div class="sidebar-bottom">
      <div class="sidebar-note">Administración privada de empresas y accesos de Rekov RMS.</div>
      <div class="profile"><span class="avatar">${escapeHtml(initials(state.emailHint))}</span><span class="profile-copy"><strong>${escapeHtml(state.session?.user?.user_metadata?.full_name || "Rekov Admin")}</strong><small>${escapeHtml(state.emailHint || state.session?.user?.email || "Administrador")}</small></span><button class="logout" id="logout" title="Cerrar sesión">${ICONS.close}</button></div>
    </div>
  </aside><div class="backdrop" id="backdrop"></div>`;
}

function shell(content) {
  const sectionName = ({ businesses: "Negocios", upstream: "Cambios del proyecto", overview: "Resumen" })[state.page] || "Resumen";
  ROOT.innerHTML = `<div class="app-shell">${sidebar()}<div class="main">
    <header class="topbar"><div class="topbar-left"><button class="menu-toggle" id="menu-toggle" aria-label="Abrir menú">${ICONS.menu}</button><div class="crumb">Rekov RMS <span style="color:#bbb;padding:0 7px">/</span><b>${sectionName}</b></div></div>
      <div class="topbar-right"><div class="online"><i></i> Plataforma activa</div><span class="top-divider"></span><span class="top-user"><strong>Rekov Systems</strong><small>Administración</small></span></div>
    </header>${content}</div>${state.modal ? modal() : ""}</div>`;
  ROOT.querySelectorAll("[data-page]").forEach((el) => el.addEventListener("click", () => {
    state.page = el.dataset.page; state.search = ""; closeSidebar(); render();
    if (state.page === "upstream") void loadUpstream();
  }));
  ROOT.querySelector("#logout").addEventListener("click", () => logout());
  ROOT.querySelector("#menu-toggle").addEventListener("click", openSidebar);
  ROOT.querySelector("#backdrop").addEventListener("click", closeSidebar);
  ROOT.querySelectorAll("[data-create]").forEach((el) => el.addEventListener("click", () => { state.modal = { type: "create" }; render(); }));
  ROOT.querySelectorAll("[data-details]").forEach((el) => el.addEventListener("click", () => { state.modal = { type: "details", id: el.dataset.details }; render(); }));
  ROOT.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", () => { state.modal = null; render(); }));
  const search = ROOT.querySelector("#tenant-search");
  if (search) {
    search.value = state.search;
    search.addEventListener("input", (event) => { state.search = event.target.value; updateTenantRows(); });
  }
  const form = ROOT.querySelector("#create-tenant-form");
  if (form) {
    const name = form.elements.name;
    const slug = form.elements.slug;
    name.addEventListener("input", () => { if (!slug.dataset.edited) slug.value = toSlug(name.value); });
    slug.addEventListener("input", () => { slug.dataset.edited = "true"; slug.value = toSlug(slug.value); });
    form.addEventListener("submit", createTenant);
  }
  ROOT.querySelectorAll("[data-copy]").forEach((el) => el.addEventListener("click", () => copyText(el.dataset.copy)));
  ROOT.querySelectorAll("[data-open-domain]").forEach((el) => el.addEventListener("click", () => window.open(`https://${el.dataset.openDomain}`, "_blank", "noopener")));
  ROOT.querySelectorAll("[data-upstream-refresh]").forEach((el) => el.addEventListener("click", () => void loadUpstream()));
}

function openSidebar() { ROOT.querySelector("#sidebar")?.classList.add("open"); ROOT.querySelector("#backdrop")?.classList.add("show"); }
function closeSidebar() { ROOT.querySelector("#sidebar")?.classList.remove("open"); ROOT.querySelector("#backdrop")?.classList.remove("show"); }
function toSlug(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48); }

function tenantRow(tenant) {
  const owner = tenant.owner || {};
  return `<tr data-tenant-row="${escapeHtml(`${tenant.name} ${tenant.slug} ${tenant.domain} ${owner.email || ""}`.toLowerCase())}">
    <td><div class="business-cell"><span class="business-mark">${escapeHtml(initials(tenant.name))}</span><span class="business-name"><b>${escapeHtml(tenant.name)}</b><small>${escapeHtml(tenant.slug)}</small></span></div></td>
    <td><a class="domain-link" href="https://${escapeHtml(tenant.domain || "desk.rekov.co")}" target="_blank" rel="noreferrer">${escapeHtml(tenant.domain || "desk.rekov.co")} ${ICONS.external}</a></td>
    <td class="owner-email">${escapeHtml(owner.email || "Sin dueño")}</td>
    <td><span class="status ${tenant.status === "active" ? "" : "off"}"><i></i>${tenant.status === "active" ? "Activo" : "Inactivo"}</span></td>
    <td>${escapeHtml(formatDate(tenant.created_at))}</td>
    <td><button class="table-action" data-details="${escapeHtml(tenant.id)}" aria-label="Ver negocio">${ICONS.arrow}</button></td>
  </tr>`;
}
function tenantTable(list, compact = false) {
  if (!list.length) return `<div class="empty"><span class="empty-icon">${ICONS.store}</span><h3>Aún no hay negocios</h3><p>Crea el primero y entrégale a su dueño un acceso seguro a su espacio.</p><button class="button button-primary" data-create>${ICONS.plus} Crear negocio</button></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Negocio</th><th>Acceso</th><th>Dueño</th><th>Estado</th><th>Creado</th><th></th></tr></thead><tbody>${list.slice(0, compact ? 6 : undefined).map(tenantRow).join("")}</tbody></table></div>`;
}
function statCard(label, value, meta, icon) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${ICONS[icon]}</span></div><div class="stat-value">${value}</div><div class="stat-meta">${meta}</div></article>`;
}

function overviewPage() {
  const active = state.tenants.filter((tenant) => tenant.status === "active").length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = state.tenants.filter((tenant) => new Date(tenant.created_at) >= monthStart).length;
  return `<main class="content animate-rise">
    <div class="page-head"><div><div class="eyebrow">CENTRO DE CONTROL</div><h1>Buenos días, Rekov</h1><p class="page-subtitle">Administra los negocios y accesos que operan en tu plataforma.</p></div><button class="button button-primary" data-create>${ICONS.plus}<span class="button-label">Crear negocio</span></button></div>
    <section class="stats">
      ${statCard("Negocios registrados", state.tenants.length, "Empresas en la plataforma", "building")}
      ${statCard("Negocios activos", active, "Con acceso habilitado", "pulse")}
      ${statCard("Creados este mes", newThisMonth, "Altas desde el día 1", "plus")}
      ${statCard("Usuarios dueños", state.tenants.filter((tenant) => tenant.owner?.email).length, "Un responsable por negocio", "users")}
    </section>
    <section class="panel"><div class="panel-head"><div><h2>Negocios recientes</h2><small style="display:block;margin-top:4px">Últimas empresas creadas</small></div><button class="button button-quiet" data-page="businesses">Ver todos ${ICONS.arrow}</button></div><div class="panel-body">${tenantTable(state.tenants, true)}</div></section>
  </main>`;
}

function businessesPage() {
  const matches = filteredTenants();
  return `<main class="content animate-rise">
    <div class="page-head"><div><div class="eyebrow">GESTIÓN COMERCIAL</div><h1>Negocios</h1><p class="page-subtitle">Cada negocio tiene su propio espacio, usuarios y datos aislados.</p></div><button class="button button-primary" data-create>${ICONS.plus}<span class="button-label">Crear negocio</span></button></div>
    <div class="toolbar"><label class="search">${ICONS.search}<input id="tenant-search" type="search" placeholder="Buscar por nombre, dominio o dueño" value="${escapeHtml(state.search)}" /></label><span class="results"><b id="result-count">${matches.length}</b> de ${state.tenants.length}</span></div>
    <section class="panel"><div class="panel-body" style="padding:0 18px">${tenantTable(matches)}</div></section>
  </main>`;
}

async function loadUpstream() {
  state.upstream.loading = true;
  state.upstream.error = "";
  render();
  try {
    const manifestResponse = await fetch("./pos-upstream.json", { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error("No está publicado el manifiesto del upstream.");
    const manifest = await manifestResponse.json();
    const compareUrl = `https://api.github.com/repos/${manifest.repository}/compare/${manifest.base_sha}...${manifest.branch || "main"}`;
    const response = await fetch(`${compareUrl}?per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `GitHub respondió ${response.status}`);
    const overlayPaths = new Set(manifest.overlay_paths || []);
    const files = (result.files || []).map((file) => ({ ...file, overlayConflict: overlayPaths.has(file.filename) }));
    state.upstream.data = { manifest, result: { ...result, files }, compareUrl };
  } catch (error) {
    state.upstream.error = error.message || "No se pudieron consultar los cambios.";
  } finally {
    state.upstream.loading = false;
    if (state.page === "upstream") render();
  }
}

function upstreamPage() {
  const { loading, data, error } = state.upstream;
  if (loading && !data) return `<main class="content animate-rise"><div class="page-head"><div><div class="eyebrow">UPSTREAM · AI POINT OF SALE</div><h1>Cambios del proyecto original</h1><p class="page-subtitle">Consultando commits y archivos nuevos…</p></div><span class="loader"></span></div></main>`;
  if (error && !data) return `<main class="content animate-rise"><div class="page-head"><div><div class="eyebrow">UPSTREAM · AI POINT OF SALE</div><h1>Cambios del proyecto original</h1><p class="page-subtitle">${escapeHtml(error)}</p></div><button class="button button-primary" data-upstream-refresh>${ICONS.refresh} Reintentar</button></div><div class="panel panel-body upstream-note">GitHub limita las consultas anónimas. Si alcanzaste el límite, espera o revisa la comparación directamente.</div><a class="button button-quiet" href="https://github.com/mateopiza/ai-point-of-sale/commits/main" target="_blank" rel="noreferrer">Abrir commits del original ${ICONS.external}</a></main>`;
  const { manifest, result } = data;
  const commits = result.commits || [];
  const files = result.files || [];
  const conflicts = files.filter((file) => file.overlayConflict);
  const count = Number(result.ahead_by || commits.length || 0);
  const status = result.status === "identical" ? "Al día" : `${count} commit${count === 1 ? "" : "s"} nuevo${count === 1 ? "" : "s"}`;
  return `<main class="content animate-rise">
    <div class="page-head"><div><div class="eyebrow">UPSTREAM · AI POINT OF SALE</div><h1>Cambios del proyecto original</h1><p class="page-subtitle">Revisa las novedades del repositorio fuente y detecta archivos que Rekov también personaliza.</p></div><button class="button button-primary" data-upstream-refresh ${loading ? "disabled" : ""}>${ICONS.refresh} Actualizar</button></div>
    <section class="stats upstream-stats">
      ${statCard("Estado upstream", escapeHtml(status), "Comparado con la base integrada", "branch")}
      ${statCard("Archivos cambiados", files.length, "Desde la última sincronización", "store")}
      ${statCard("Superposición posible", conflicts.length, "Mismo archivo en upstream y Rekov", "pulse")}
      ${statCard("Base integrada", escapeHtml(manifest.base_sha.slice(0, 8)), "Commit fuente en esta versión", "check")}
    </section>
    <div class="upstream-actions"><a class="button button-quiet" href="${escapeHtml(data.compareUrl)}" target="_blank" rel="noreferrer">Ver comparación en GitHub ${ICONS.external}</a><a class="button button-quiet" href="https://github.com/rekov-systems/infra/actions/workflows/sync-pos-upstream.yml" target="_blank" rel="noreferrer">Ver sincronización y validación ${ICONS.external}</a></div>
    ${conflicts.length ? `<section class="upstream-warning"><b>Revisión requerida: ${conflicts.length} archivo${conflicts.length === 1 ? "" : "s"} coinciden con el overlay Rekov.</b><span>El panel no aplica cambios. Abre la PR de sincronización y espera el check de compatibilidad antes de integrar.</span></section>` : `<section class="upstream-ok"><b>Sin superposición de archivos detectada.</b><span>El build de la PR sigue siendo la validación final de compatibilidad.</span></section>`}
    ${error ? `<p class="upstream-inline-error">Falló la actualización; se muestran los últimos datos cargados: ${escapeHtml(error)}</p>` : ""}
    <section class="panel upstream-panel"><div class="panel-head"><div><h2>Commits nuevos</h2><small>Rama ${escapeHtml(manifest.branch || "main")} · consultado ${escapeHtml(new Date().toLocaleString("es-CO"))}</small></div></div><div class="upstream-commits">${commits.length ? commits.map((commit) => `<article class="upstream-commit"><span class="commit-dot"></span><div><b>${escapeHtml(commit.commit?.message?.split("\n")[0] || "Actualización")}</b><small>${escapeHtml(commit.sha.slice(0, 8))} · ${escapeHtml(new Date(commit.commit?.author?.date || Date.now()).toLocaleDateString("es-CO"))}</small></div><a href="${escapeHtml(commit.html_url)}" target="_blank" rel="noreferrer" aria-label="Abrir commit">${ICONS.external}</a></article>`).join("") : `<div class="empty"><h3>No hay commits nuevos</h3><p>El repositorio original no tiene cambios posteriores a la base integrada.</p></div>`}</div></section>
    <section class="panel upstream-panel"><div class="panel-head"><div><h2>Archivos cambiados</h2><small>Los marcados en naranja también tienen personalización Rekov.</small></div></div><div class="upstream-files">${files.length ? files.map((file) => `<div class="upstream-file ${file.overlayConflict ? "overlap" : ""}"><code>${escapeHtml(file.filename)}</code><span>${escapeHtml(file.status)}</span><small>+${file.additions} / −${file.deletions}</small></div>`).join("") : `<div class="empty"><p>No hay archivos para revisar.</p></div>`}</div></section>
  </main>`;
}

function filteredTenants() {
  const query = state.search.trim().toLowerCase();
  if (!query) return state.tenants;
  return state.tenants.filter((tenant) => `${tenant.name} ${tenant.slug} ${tenant.domain} ${tenant.owner?.email || ""}`.toLowerCase().includes(query));
}
function updateTenantRows() {
  const matches = filteredTenants();
  const tbody = ROOT.querySelector("tbody");
  const count = ROOT.querySelector("#result-count");
  if (count) count.textContent = String(matches.length);
  if (tbody) tbody.innerHTML = matches.map(tenantRow).join("");
  ROOT.querySelectorAll("[data-details]").forEach((el) => el.addEventListener("click", () => { state.modal = { type: "details", id: el.dataset.details }; render(); }));
}

function modal() {
  if (state.modal.type === "created") return createdModal(state.modal.data);
  if (state.modal.type === "details") return detailsModal(state.tenants.find((tenant) => tenant.id === state.modal.id));
  return createModal();
}
function createModal() {
  return `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()">
    <div class="modal-head"><div><h2 id="modal-title">Crear negocio</h2><p>Configura el acceso inicial y el espacio de la empresa.</p></div><button class="modal-close" data-close-modal aria-label="Cerrar">${ICONS.close}</button></div>
    <form class="modal-form" id="create-tenant-form">
      <div class="form-section"><div class="form-section-title"><span>1</span> Datos del negocio</div><div class="form-grid">
        <div class="field full"><label for="business-name">Nombre comercial</label><input id="business-name" name="name" placeholder="Ej. Mercado La 14" autocomplete="organization" required maxlength="100" /></div>
        <div class="field"><label for="business-slug">Identificador interno</label><input id="business-slug" name="slug" placeholder="mercado-la-14" required minlength="3" maxlength="48" pattern="[a-z0-9]+(-[a-z0-9]+)*" /></div>
        <div class="field"><label>Acceso de la empresa</label><div class="domain-input"><input value="desk.rekov.co" aria-label="Dirección de acceso" disabled /></div></div>
        <div class="field full"><label for="branch-name">Sucursal inicial</label><input id="branch-name" name="branch_name" value="Sucursal principal" required maxlength="80" /></div>
      </div></div>
      <div class="form-section"><div class="form-section-title"><span>2</span> Dueño del negocio</div><div class="form-grid">
        <div class="field"><label for="owner-name">Nombre</label><input id="owner-name" name="owner_name" placeholder="Nombre del responsable" autocomplete="name" /></div>
        <div class="field"><label for="owner-email">Correo de acceso</label><input id="owner-email" name="owner_email" type="email" placeholder="dueno@empresa.com" autocomplete="email" required /></div>
        <div class="field full"><div class="field-hint">Se crea una cuenta activa con rol Dueño. La contraseña temporal se genera al crear el negocio y se muestra una sola vez.</div></div>
      </div></div>
      <div class="error-box" id="create-error" hidden></div>
      <div class="modal-actions"><button type="button" class="button button-quiet" data-close-modal>Cancelar</button><button class="button button-primary" id="create-submit" type="submit">Crear y generar acceso ${ICONS.arrow}</button></div>
    </form>
  </section></div>`;
}
function detailsModal(tenant) {
  if (!tenant) return "";
  const owner = tenant.owner || {};
  return `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
    <div class="modal-head"><div><h2>${escapeHtml(tenant.name)}</h2><p>Ficha del negocio en Desk.</p></div><button class="modal-close" data-close-modal>${ICONS.close}</button></div>
    <div class="detail-grid">
      <div class="detail-item"><small>URL de acceso</small><a href="https://desk.rekov.co" target="_blank" rel="noreferrer">${escapeHtml(tenant.domain || "desk.rekov.co")} ↗</a></div>
      <div class="detail-item"><small>Estado</small><strong>${tenant.status === "active" ? "Activo" : "Inactivo"}</strong></div>
      <div class="detail-item"><small>Identificador</small><strong>${escapeHtml(tenant.slug)}</strong></div>
      <div class="detail-item"><small>Creado</small><strong>${escapeHtml(formatDate(tenant.created_at))}</strong></div>
      <div class="detail-item"><small>Dueño</small><strong>${escapeHtml(owner.full_name || "Sin nombre")}</strong></div>
      <div class="detail-item"><small>Correo</small><strong>${escapeHtml(owner.email || "Sin dueño")}</strong></div>
    </div><div class="modal-actions" style="margin:0 23px 20px"><button class="button button-quiet" data-copy="https://${escapeHtml(tenant.domain || "desk.rekov.co")}">${ICONS.copy} Copiar URL</button><button class="button button-primary" data-close-modal>Aceptar</button></div>
  </section></div>`;
}
function createdModal(data) {
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="created-title">
    <div class="modal-head"><div><div class="eyebrow">ALTA COMPLETADA</div></div><button class="modal-close" data-close-modal aria-label="Cerrar">${ICONS.close}</button></div>
    <div class="success-panel"><span class="success-mark">${ICONS.check}</span><h3 id="created-title">${escapeHtml(data.tenant.name)} está listo</h3><p>Entrégale estas credenciales al dueño. La contraseña temporal no volverá a mostrarse.</p>
      <div class="credential-box">
        <div class="credential-row"><label>Desk</label><code>https://desk.rekov.co</code><button class="copy" data-copy="https://desk.rekov.co" title="Copiar">${ICONS.copy}</button></div>
        <div class="credential-row"><label>Correo</label><code>${escapeHtml(data.owner.email)}</code><button class="copy" data-copy="${escapeHtml(data.owner.email)}" title="Copiar">${ICONS.copy}</button></div>
        <div class="credential-row"><label>Contraseña</label><code>${escapeHtml(data.temporary_password)}</code><button class="copy" data-copy="${escapeHtml(data.temporary_password)}" title="Copiar">${ICONS.copy}</button></div>
      </div><p class="password-warning">Guarda o comparte la contraseña antes de cerrar esta ventana.</p>
      <div class="modal-actions"><button class="button button-quiet" data-copy="${escapeHtml(`Negocio: ${data.tenant.name}\nURL: https://desk.rekov.co\nCorreo: ${data.owner.email}\nContraseña temporal: ${data.temporary_password}`)}">${ICONS.copy} Copiar acceso</button><button class="button button-primary" data-close-modal>Listo</button></div>
    </div>
  </section></div>`;
}

async function createTenant(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = form.querySelector("#create-submit");
  const errorBox = form.querySelector("#create-error");
  errorBox.hidden = true;
  button.disabled = true;
  button.innerHTML = '<span class="loader" style="width:14px;height:14px"></span> Creando negocio';
  try {
    const result = await functionCall("create_tenant", {
      name: data.get("name"),
      slug: data.get("slug"),
      branch_name: data.get("branch_name"),
      owner_name: data.get("owner_name"),
      owner_email: data.get("owner_email"),
    });
    state.modal = { type: "created", data: result };
    await loadTenants();
    render();
    toast("Negocio y acceso creados");
  } catch (error) {
    errorBox.innerHTML = `${ICONS.close}<span>${escapeHtml(error.message || "No se pudo crear el negocio")}</span>`;
    errorBox.hidden = false;
    button.disabled = false;
    button.innerHTML = `Crear y generar acceso ${ICONS.arrow}`;
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast("Copiado al portapapeles");
  } catch {
    toast("No se pudo copiar. Selecciona el texto manualmente.", "error");
  }
}

function render() {
  if (configError()) {
    ROOT.innerHTML = `<div class="boot"><span class="error-box">Falta configurar la URL y la clave pública de Supabase al desplegar este panel.</span></div>`;
    return;
  }
  if (!state.session) { renderLogin(); return; }
  const content = state.page === "businesses" ? businessesPage() : state.page === "upstream" ? upstreamPage() : overviewPage();
  shell(content);
}

async function start() {
  if (configError()) { render(); return; }
  try {
    const bootstrap = await functionCall("bootstrap", {}, false);
    state.emailHint = bootstrap.admin_email || "";
    if (!bootstrap.ready) throw new Error(bootstrap.error || "No se pudo preparar el acceso de plataforma");
  } catch (error) {
    renderLogin(error.message);
    return;
  }
  loadSession();
  if (state.session?.access_token) {
    try {
      await refreshSession();
      const user = await request("/auth/v1/user", { token: state.session.access_token });
      state.session.user = user;
      state.emailHint = user.email || state.emailHint;
      await loadTenants();
      render();
      return;
    } catch (error) {
      logout(false);
    }
  }
  renderLogin();
}

start();
