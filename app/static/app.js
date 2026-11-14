"use strict";

/* ------------------------------------------------------------------ *
 * Session storage
 *
 * Tokens live in localStorage so every tab shares one session. Refresh
 * tokens rotate and each one works only once, so a refresh is run under a
 * cross-tab lock: two tabs refreshing with the same token would look like
 * a replay and the API would end the session.
 * ------------------------------------------------------------------ */

const STORE_KEY = "veloce.session";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSession(tokens) {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token })
    );
  } catch {
    /* storage unavailable: the session only lasts until the page closes */
  }
  memorySession = { access: tokens.access_token, refresh: tokens.refresh_token };
}

function clearSession() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
  memorySession = {};
}

let memorySession = loadSession();
const session = () => {
  const stored = loadSession();
  return stored.access ? stored : memorySession;
};

function withLock(fn) {
  if (navigator.locks?.request) {
    return navigator.locks.request("veloce.refresh", fn);
  }
  return fn();
}

let refreshInFlight = null;

/** Get a fresh access token. `staleAccess` is the token that just failed. */
function refreshTokens(staleAccess) {
  if (!refreshInFlight) {
    refreshInFlight = withLock(async () => {
      const current = session();
      // Another tab (or an earlier call) already refreshed: use its result.
      if (current.access && current.access !== staleAccess) return true;
      if (!current.refresh) return false;

      const res = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh }),
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      saveSession(await res.json());
      return true;
    }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* ------------------------------------------------------------------ *
 * API client
 * ------------------------------------------------------------------ */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function errorMessage(body, status) {
  const detail = body?.detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail
      .map((d) => `${(d.loc || []).filter((p) => p !== "body").join(".")}: ${d.msg}`)
      .join("\n");
  }
  if (typeof detail === "string") return detail;
  return `Request failed (${status})`;
}

async function api(path, { method = "GET", body, auth = true, retry = true } = {}) {
  const headers = {};
  const access = session().access;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retry) {
    if (await refreshTokens(access)) {
      return api(path, { method, body, auth, retry: false });
    }
    signedOut("Your session has ended. Please sign in again.");
    const err = new ApiError(401, "Not signed in");
    err.silent = true; // the sign-in screen already explains it
    throw err;
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data;
}

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const label = (s) => String(s).replace(/_/g, " ");
const badge = (value, cls = value) => h("span", { class: `badge ${cls}` }, label(value));

let toastTimer;
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3000);
}

/** Run an async action, disabling `button` meanwhile and showing errors. */
async function run(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    if (!err.silent) toast(err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

/** Read a form into a nested object; "pickup.city" becomes {pickup: {city}}. */
function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    let value = el.value.trim();
    if (el.type === "number") value = value === "" ? null : Number(value);
    else if (value === "") value = null;
    const keys = el.name.split(".");
    let target = out;
    keys.slice(0, -1).forEach((k) => (target = target[k] ??= {}));
    target[keys.at(-1)] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Side panel
 * ------------------------------------------------------------------ */

function openPanel(title, ...content) {
  $("#panel-title").textContent = title;
  $("#panel-body").replaceChildren(...content);
  $("#panel").hidden = false;
  $("#panel-backdrop").hidden = false;
}

function closePanel() {
  $("#panel").hidden = true;
  $("#panel-backdrop").hidden = true;
}

const fromTemplate = (id) => $(`#${id}`).content.firstElementChild.cloneNode(true);

/* ------------------------------------------------------------------ *
 * App state
 * ------------------------------------------------------------------ */

const state = {
  user: null,
  page: 1,
  pageSize: 20,
  total: 0,
  couriers: new Map(), // admin only: id -> courier, for showing names
};

const hasRole = (...roles) => state.user && roles.includes(state.user.role);

/* ------------------------------------------------------------------ *
 * Auth screens
 * ------------------------------------------------------------------ */

function showAuthTab(name) {
  $$("[data-auth-tab]").forEach((t) => t.classList.toggle("active", t.dataset.authTab === name));
  $("#login-form").hidden = name !== "login";
  $("#register-form").hidden = name !== "register";
}

async function login(email, password) {
  const tokens = await api("/auth/login/json", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  saveSession(tokens);
  await start();
}

function signedOut(message) {
  clearSession();
  state.user = null;
  closePanel();
  $("#app-view").hidden = true;
  $("#auth-view").hidden = false;
  showAuthTab("login");
  if (message) toast(message, true);
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

const PAGES = { deliveries: loadDeliveries, couriers: loadCouriers, account: loadAccount };

function route() {
  if (!state.user) return;
  let name = location.hash.replace(/^#\//, "") || "deliveries";
  if (!(name in PAGES) || (name === "couriers" && !hasRole("admin"))) name = "deliveries";

  $$(".page").forEach((p) => (p.hidden = p.id !== `page-${name}`));
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
  closePanel();
  PAGES[name]();
}

/* ------------------------------------------------------------------ *
 * Deliveries
 * ------------------------------------------------------------------ */

const CANCELLABLE = ["pending", "assigned"];

function courierName(id) {
  if (id == null) return h("span", { class: "muted" }, "—");
  return state.couriers.get(id)?.name ?? `#${id}`;
}

async function refreshCourierCache() {
  if (!hasRole("admin")) return;
  const list = await api("/couriers");
  state.couriers = new Map(list.map((c) => [c.id, c]));
}

async function loadDeliveries() {
  const body = $("#deliveries-body");
  await run(null, async () => {
    const [data] = await Promise.all([
      api(`/deliveries?page=${state.page}&page_size=${state.pageSize}`),
      refreshCourierCache(),
    ]);

    // Stepped past the end (e.g. after cancelling the last item): go back.
    if (data.items.length === 0 && state.page > 1 && data.total > 0) {
      state.page = Math.ceil(data.total / state.pageSize);
      return loadDeliveries();
    }

    state.total = data.total;
    body.replaceChildren(
      ...(data.items.length
        ? data.items.map((d) =>
            h(
              "tr",
              { class: "clickable", onclick: () => showDelivery(d.id) },
              h("td", {}, d.id),
              h("td", {}, d.recipient_name),
              h("td", {}, d.pickup.city),
              h("td", {}, d.dropoff.city),
              h("td", {}, courierName(d.courier_id)),
              h("td", {}, badge(d.status))
            )
          )
        : [h("tr", {}, h("td", { colspan: 6, class: "empty" }, "No deliveries yet."))])
    );

    const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    $("#page-info").textContent = `Page ${state.page} of ${pages} · ${state.total} total`;
    $("#prev-page").disabled = state.page <= 1;
    $("#next-page").disabled = state.page >= pages;
  });
}

function locationBlock(title, loc) {
  return h(
    "div",
    { class: "section" },
    h("h3", {}, title),
    h(
      "dl",
      { class: "details" },
      h("dt", {}, "Address"), h("dd", {}, loc.address),
      h("dt", {}, "City"), h("dd", {}, loc.city),
      h("dt", {}, "Coordinates"), h("dd", {}, `${loc.latitude}, ${loc.longitude}`)
    )
  );
}

async function showDelivery(id) {
  const d = await run(null, () => api(`/deliveries/${id}`));
  if (!d) return;

  const actions = [];

  if (hasRole("admin") && d.status === "pending") {
    const available = await run(null, () => api("/couriers?available=true"));
    const select = h(
      "select",
      { "aria-label": "Courier" },
      available?.length
        ? available.map((c) => h("option", { value: c.id }, `${c.name} (${c.phone})`))
        : h("option", { value: "" }, "No available couriers")
    );
    const assignBtn = h("button", { class: "btn primary", type: "button" }, "Assign");
    assignBtn.disabled = !available?.length;
    assignBtn.addEventListener("click", () =>
      run(assignBtn, async () => {
        await api(`/deliveries/${id}/assign`, {
          method: "POST",
          body: { courier_id: Number(select.value) },
        });
        toast("Courier assigned");
        await loadDeliveries();
        showDelivery(id);
      })
    );
    actions.push(h("div", { class: "section stack" }, h("h3", {}, "Assign courier"), h("div", { class: "row" }, select, assignBtn)));
  }

  if (hasRole("customer", "admin") && CANCELLABLE.includes(d.status)) {
    const cancelBtn = h("button", { class: "btn danger", type: "button" }, "Cancel delivery");
    cancelBtn.addEventListener("click", () => {
      if (!confirm(`Cancel delivery #${id}?`)) return;
      run(cancelBtn, async () => {
        await api(`/deliveries/${id}/cancel`, { method: "POST" });
        toast("Delivery cancelled");
        await loadDeliveries();
        showDelivery(id);
      });
    });
    actions.push(h("div", { class: "section" }, cancelBtn));
  }

  openPanel(
    `Delivery #${d.id}`,
    h(
      "dl",
      { class: "details" },
      h("dt", {}, "Status"), h("dd", {}, badge(d.status)),
      h("dt", {}, "Recipient"), h("dd", {}, d.recipient_name),
      h("dt", {}, "Package"), h("dd", {}, d.package_description),
      h("dt", {}, "Note"), h("dd", {}, d.delivery_note || h("span", { class: "muted" }, "—")),
      h("dt", {}, "Courier"), h("dd", {}, courierName(d.courier_id))
    ),
    locationBlock("Pickup", d.pickup),
    locationBlock("Drop-off", d.dropoff),
    ...actions
  );
}

function newDelivery() {
  const form = fromTemplate("tpl-delivery-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(form.querySelector("[type=submit]"), async () => {
      const created = await api("/deliveries", { method: "POST", body: formData(form) });
      toast(`Delivery #${created.id} created`);
      state.page = 1;
      await loadDeliveries();
      showDelivery(created.id);
    });
  });
  openPanel("New delivery", form);
}

/* ------------------------------------------------------------------ *
 * Couriers (admin)
 * ------------------------------------------------------------------ */

async function loadCouriers() {
  const filter = $("#courier-filter").value;
  await run(null, async () => {
    const list = await api(filter ? `/couriers?available=${filter}` : "/couriers");
    $("#couriers-body").replaceChildren(
      ...(list.length
        ? list.map((c) =>
            h(
              "tr",
              { class: "clickable", onclick: () => editCourier(c.id) },
              h("td", {}, c.id),
              h("td", {}, c.name),
              h("td", {}, c.phone),
              h("td", {}, c.available ? badge("available") : badge("busy")),
              h("td", {}, h("span", { class: "muted" }, "Edit"))
            )
          )
        : [h("tr", {}, h("td", { colspan: 5, class: "empty" }, "No couriers."))])
    );
  });
}

function courierForm(onSubmit, initial = {}) {
  const form = fromTemplate("tpl-courier-form");
  form.elements.name.value = initial.name ?? "";
  form.elements.phone.value = initial.phone ?? "";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(form.querySelector("[type=submit]"), () => onSubmit(formData(form)));
  });
  return form;
}

function newCourier() {
  openPanel(
    "New courier",
    courierForm(async (data) => {
      const c = await api("/couriers", { method: "POST", body: data });
      toast(`Courier ${c.name} created`);
      closePanel();
      loadCouriers();
    })
  );
}

async function editCourier(id) {
  const c = await run(null, () => api(`/couriers/${id}`));
  if (!c) return;
  openPanel(
    `Courier #${c.id}`,
    h(
      "dl",
      { class: "details" },
      h("dt", {}, "Status"), h("dd", {}, c.available ? badge("available") : badge("busy")),
      h("dt", {}, "Linked user"), h("dd", {}, c.user_id ?? h("span", { class: "muted" }, "—"))
    ),
    courierForm(async (data) => {
      // Send only what changed; PATCH ignores missing fields.
      const changes = {};
      if (data.name !== c.name) changes.name = data.name;
      if (data.phone !== c.phone) changes.phone = data.phone;
      if (!Object.keys(changes).length) return toast("Nothing to save");
      await api(`/couriers/${id}`, { method: "PATCH", body: changes });
      toast("Courier updated");
      closePanel();
      loadCouriers();
    }, c)
  );
}

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

async function loadAccount() {
  const u = state.user;
  $("#account-details").replaceChildren(
    h("dt", {}, "Name"), h("dd", {}, u.full_name),
    h("dt", {}, "Email"), h("dd", {}, u.email),
    h("dt", {}, "Role"), h("dd", {}, badge(u.role)),
    h("dt", {}, "User ID"), h("dd", {}, u.id),
    h("dt", {}, "Active"), h("dd", {}, u.is_active ? "Yes" : "No")
  );
  const status = $("#api-status");
  try {
    const res = await api("/", { auth: false });
    status.textContent = `API: ${res.message}`;
  } catch {
    status.textContent = "API: unreachable";
  }
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function start() {
  if (!session().refresh && !session().access) return signedOut();
  try {
    state.user = await api("/auth/me");
  } catch {
    return; // api() already showed the sign-in screen on 401
  }

  $("#user-name").textContent = state.user.full_name;
  $("#user-role").textContent = state.user.role;
  $$("[data-role]").forEach((el) => {
    el.hidden = !hasRole(...el.dataset.role.split(" "));
  });

  $("#auth-view").hidden = true;
  $("#app-view").hidden = false;
  state.page = 1;
  route();
}

function bind() {
  $$("[data-auth-tab]").forEach((t) => t.addEventListener("click", () => showAuthTab(t.dataset.authTab)));

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    run(f.querySelector("[type=submit]"), () => login(f.email.value.trim(), f.password.value));
  });

  $("#register-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    run(f.querySelector("[type=submit]"), async () => {
      const data = formData(f);
      data.password = f.password.value; // don't trim passwords
      await api("/auth/register", { method: "POST", body: data, auth: false });
      toast("Account created");
      await login(data.email, data.password);
    });
  });

  $("#logout-btn").addEventListener("click", (e) =>
    run(e.target, async () => {
      const { refresh } = session();
      if (refresh) await api("/auth/logout", { method: "POST", body: { refresh_token: refresh }, auth: false });
      signedOut();
    })
  );

  $("#logout-all-btn").addEventListener("click", (e) => {
    if (!confirm("Sign out of every device?")) return;
    run(e.target, async () => {
      await api("/auth/logout-all", { method: "POST" });
      signedOut();
      toast("Signed out everywhere");
    });
  });

  $("#new-delivery-btn").addEventListener("click", newDelivery);
  $("#new-courier-btn").addEventListener("click", newCourier);
  $("#courier-filter").addEventListener("change", loadCouriers);
  $("#prev-page").addEventListener("click", () => { state.page--; loadDeliveries(); });
  $("#next-page").addEventListener("click", () => { state.page++; loadDeliveries(); });

  $("#panel-close").addEventListener("click", closePanel);
  $("#panel-backdrop").addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePanel());

  window.addEventListener("hashchange", route);

  // Signing out in another tab signs this one out too.
  window.addEventListener("storage", (e) => {
    if (e.key === STORE_KEY && !e.newValue && state.user) signedOut();
  });
}

bind();
start();
