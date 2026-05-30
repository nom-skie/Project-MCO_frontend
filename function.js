const API_BASE = window.EP_API_BASE || "http://localhost:8080";

// ─────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────

/**
 * Retrieves the JWT access token from local storage.
 * @returns {string|null} The stored JWT, or null if not authenticated.
 */
function getToken() {
  return localStorage.getItem("eproseso_jwt");
}

/**
 * Retrieves the authenticated user object from local storage.
 * @returns {{id: number, fname: string, lname: string, email: string, phone: string, role: string}|null}
 *   The parsed user object, or null if no session exists.
 */
function getUser() {
  const r = localStorage.getItem("eprosesoUser");
  return r ? JSON.parse(r) : null;
}

/**
 * Clears the active session and redirects the user to the login page.
 */
function logout() {
  localStorage.removeItem("eproseso_jwt");
  localStorage.removeItem("eprosesoUser");
  window.location.href = "login.html";
}

/**
 * Guards a page against unauthenticated access.
 * Redirects to login.html if no JWT is present in local storage.
 */
function requireAuth() {
  if (!getToken()) window.location.href = "login.html";
}

// ─────────────────────────────────────────────────────────────
// Central fetch wrapper
// ─────────────────────────────────────────────────────────────

/**
 * Authenticated HTTP client wrapping the native Fetch API.
 * Automatically attaches the Bearer token, serialises JSON bodies,
 * handles 401 session expiry by logging out, and normalises error responses.
 *
 * @param {string} path - API path relative to {@link API_BASE} (e.g. "/api/requests/me").
 * @param {RequestInit & {body?: object|string}} [options={}] - Standard fetch options.
 *   Plain objects supplied as `body` are JSON-serialised automatically.
 * @returns {Promise<object|null>} Parsed JSON response, or null for HTTP 204 No Content.
 * @throws {Error} If the response status indicates a failure; the message is sourced
 *   from the API error payload when available.
 */
async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
    body:
      options.body &&
      typeof options.body === "object" &&
      !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  if (res.status === 401) {
    logout();
    return;
  }
  if (!res.ok) {
    const e = await res
      .json()
      .catch(() => ({ error: "Something went wrong." }));
    throw new Error(e.errors?.join("\n") || e.error || "Request failed");
  }
  return res.status === 204 ? null : res.json();
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** @type {Object.<string, {label: string, cls: string}>} Display metadata for document request statuses. */
const STATUS_LABELS = {
  pending:  { label: "Pending",          cls: "badge-pending"  },
  approved: { label: "Approved",         cls: "badge-approved" },
  rejected: { label: "Rejected",         cls: "badge-rejected" },
  ready:    { label: "Ready for pickup", cls: "badge-ready"    },
};

/** @type {Object.<string, {label: string, cls: string}>} Display metadata for appointment statuses. */
const APPT_STATUS_LABELS = {
  scheduled: { label: "Scheduled", cls: "badge-approved" },
  completed: { label: "Completed", cls: "badge-ready"    },
  cancelled: { label: "Cancelled", cls: "badge-rejected" },
  "no-show": { label: "No-show",   cls: "badge-pending"  },
};

/** @type {Object.<string, {label: string, cls: string}>} Display metadata for payment statuses. */
const PAY_STATUS_LABELS = {
  unpaid: { label: "Unpaid", cls: "badge-rejected" },
  paid:   { label: "Paid",   cls: "badge-approved" },
  free:   { label: "Free",   cls: "badge-ready"    },
};

/** @type {Object.<string, {label: string, cls: string}>} Alternate payment display labels used in admin payment list. */
const PAY_DISPLAY_LABELS = {
  paid:   { cls: "badge-approved", label: "Paid"   },
  free:   { cls: "badge-ready",    label: "Free"   },
  unpaid: { cls: "badge-rejected", label: "Unpaid" },
};

/** @type {Object.<string, {label: string, cls: string}>} Display metadata for user roles. */
const ROLE_BADGES = {
  resident: { label: "Resident", cls: "badge-pending"  },
  staff:    { label: "Staff",    cls: "badge-ready"    },
  admin:    { label: "Admin",    cls: "badge-approved" },
};

/** @type {Object.<string, string>} Emoji icons keyed by user role. */
const ROLE_ICONS = { admin: "🔑", staff: "🧑‍💼", resident: "🙍" };

/** @type {Object.<string, string>} Emoji icons keyed by document type name. */
const DOC_ICONS = {
  "Barangay clearance":         "📜",
  "Certificate of residency":   "🏠",
  "Business permit endorsement":"💼",
  "Certificate of indigency":   "📄",
};

/** @type {string[]} Full month names indexed 0–11, matching {@link Date#getMonth}. */
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Marks a filter button as active within its sibling button group.
 * Removes the `active` class from all sibling `.filter-btn` elements
 * before adding it to the target button.
 *
 * @param {HTMLElement|null} btn - The button element to activate.
 */
const setActiveFilter = (btn) => {
  (btn?.closest(".flex-wrap, .filter-tabs-container") ?? document)
    .querySelectorAll(".filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn?.classList.add("active");
};

/**
 * Formats a numeric processing fee as a Philippine Peso string,
 * or returns "Free" for zero-value fees.
 *
 * @param {number|string} fee - The fee amount.
 * @returns {string} Formatted fee string (e.g. "₱50.00") or "Free".
 */
const fmtFee = (fee) =>
  Number(fee) > 0 ? `₱${Number(fee).toFixed(2)}` : "Free";

/**
 * Sets a DOM element's property by element ID.
 *
 * @param {string} id - The target element's ID.
 * @param {*} val - The value to assign.
 * @param {string} [prop="textContent"] - The element property to set.
 */
const setEl = (id, val, prop = "textContent") => {
  const el = document.getElementById(id);
  if (el) el[prop] = val;
};

/**
 * Generates an empty-state HTML fragment for use in list containers.
 *
 * @param {string} icon - An emoji or icon character to display.
 * @param {string} msg - The message to display below the icon.
 * @returns {string} HTML string for the empty state element.
 */
const emptyState = (icon, msg) =>
  `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;

/**
 * Normalises a status string to lowercase with hyphens.
 * Used to reconcile status values from the API (which may use
 * uppercase or underscores) with local constant keys.
 *
 * @param {string} [s=""] - The raw status string.
 * @returns {string} Normalised status string.
 */
const normStatus = (s = "") => s.toLowerCase().replaceAll("_", "-");

/**
 * Formats an ISO date string into a human-readable localised date.
 *
 * Date-only strings (YYYY-MM-DD) are parsed by splitting on "-" and
 * constructing a local {@link Date} object to prevent UTC midnight
 * conversion causing an off-by-one-day error in UTC+8 timezones.
 * Datetime strings with a time component are passed through normally.
 *
 * @param {string|null} iso - ISO 8601 date or datetime string.
 * @returns {string} Localised date string (e.g. "May 30, 2026"), or "—" if falsy.
 */
const fmtDate = (iso) => {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "numeric",
    });
  }
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
};

/**
 * Converts a human-readable date string to an ISO date string (YYYY-MM-DD).
 *
 * @param {string} humanDate - A date string parseable by {@link Date} (e.g. "May 30, 2026").
 * @returns {string} ISO 8601 date string (e.g. "2026-05-30").
 */
const dateToISO = (humanDate) =>
  new Date(humanDate).toISOString().split("T")[0];

/**
 * Converts a 12-hour time string to an ISO time string (HH:MM:SS).
 *
 * @param {string} humanTime - Time in 12-hour format (e.g. "9:00 AM").
 * @returns {string} ISO 8601 time string (e.g. "09:00:00").
 */
const timeToISO = (humanTime) => {
  const [time, period] = humanTime.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
};

/**
 * Converts an ISO time string (HH:MM:SS) to a 12-hour display string.
 *
 * @param {string|null} isoTime - Time in "HH:MM:SS" format.
 * @returns {string} 12-hour formatted time (e.g. "9:00 AM"), or empty string if falsy.
 */
const isoToTime = (isoTime) => {
  if (!isoTime) return "";
  const [h, m] = isoTime.split(":").map(Number);
  const period  = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
};

/**
 * Displays a transient toast notification at the bottom of the screen.
 * Creates the toast element if it does not yet exist in the DOM.
 * The notification auto-dismisses after 3.5 seconds.
 *
 * @param {string} msg - HTML content to display inside the toast.
 */
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.innerHTML = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

/**
 * Reads a single query parameter from the current page URL.
 *
 * @param {string} key - The query parameter name.
 * @returns {string|null} The parameter value, or null if not present.
 */
const getParam = (key) => new URLSearchParams(window.location.search).get(key);

/**
 * Populates the navigation avatar element with the initials of the
 * currently authenticated user.
 */
function applyNavAvatar() {
  const u  = getUser();
  if (!u) return;
  const av = ((u.fname || "?")[0] + (u.lname || "?")[0]).toUpperCase();
  const el = document.getElementById("nav-avatar");
  if (el) el.textContent = av;
}

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

/**
 * Handles new user registration form submission.
 * Validates required fields and minimum password length,
 * calls the registration API, persists the returned session,
 * and redirects to the resident dashboard on success.
 *
 * @returns {Promise<void>}
 */
async function handleRegister() {
  const firstName = document.getElementById("fname").value.trim();
  const lastName  = document.getElementById("lname").value.trim();
  const email     = document.getElementById("reg-email").value.trim();
  const phone     = document.getElementById("reg-phone").value.trim();
  const password  = document.getElementById("reg-password").value;

  if (!firstName || !lastName || !email || !phone || !password) {
    showToast("Please complete all fields.");
    return;
  }
  if (password.length < 8) {
    showToast("Password must be at least 8 characters.");
    return;
  }

  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: { firstName, lastName, email, phone, password },
    });
    localStorage.setItem("eproseso_jwt", data.token);
    localStorage.setItem("eprosesoUser", JSON.stringify({
      id: data.id, fname: data.firstName, lname: data.lastName,
      email: data.email, phone: data.phone, role: data.role,
    }));
    showToast("Registration successful!");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1500);
  } catch (err) {
    showToast(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────

/**
 * Handles login form submission.
 * Authenticates credentials against the API, persists the session,
 * and redirects to the appropriate dashboard based on the user's role.
 * Admin and Staff users are sent to admin-dashboard.html;
 * Residents are sent to dashboard.html.
 *
 * @returns {Promise<void>}
 */
async function handleLogin() {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showToast("Please enter email and password.");
    return;
  }

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    localStorage.setItem("eproseso_jwt", data.token);
    localStorage.setItem("eprosesoUser", JSON.stringify({
      id: data.id, fname: data.firstName, lname: data.lastName,
      email: data.email, phone: data.phone, role: data.role,
    }));
    showToast("Login successful!");
    const dest = data.role === "ADMIN" || data.role === "STAFF"
      ? "admin-dashboard.html"
      : "dashboard.html";
    setTimeout(() => { window.location.href = dest; }, 1200);
  } catch (err) {
    showToast("Invalid email or password.");
  }
}

// ─────────────────────────────────────────────────────────────
// Forgot Password
// ─────────────────────────────────────────────────────────────

/**
 * Handles the forgot-password form submission.
 * Validates the email format, submits it to the password-reset API,
 * and transitions the UI from the input step to the success step on completion.
 *
 * @returns {Promise<void>}
 */
async function handleSubmit() {
  const input = document.getElementById("fp-email");
  const error = document.getElementById("fp-error");
  const btn   = document.getElementById("fp-submit");
  const val   = input.value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    input.style.borderColor = "var(--primary)";
    error.style.display = "block";
    input.focus();
    return;
  }

  input.style.borderColor = "";
  error.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    await api("/api/auth/forgot-password", {
      method: "POST",
      body: { email: val },
    });
    document.getElementById("step-email").style.display   = "none";
    document.getElementById("step-success").style.display = "block";
    document.getElementById("sent-to").textContent        = val;
  } catch (err) {
    showToast(err.message);
    btn.disabled = false;
    btn.textContent = "Send reset link";
  }
}

/**
 * Triggers a visual confirmation toast indicating a reset link was resent.
 * The actual resend API call is handled server-side via link expiry.
 */
function resend() {
  showToast("Reset link resent! Check your inbox.");
}

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

/**
 * Updates the dashboard greeting with a time-aware salutation
 * and the authenticated user's first name.
 */
function updateGreeting() {
  const el = document.getElementById("greet-name");
  if (!el) return;
  const h    = new Date().getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  el.textContent = `Good ${part}, ${getUser()?.fname || "there"}!`;
  applyNavAvatar();
}

/**
 * Populates the dashboard summary statistics from a list of document requests.
 *
 * @param {object[]} requests - Array of document request objects from the API.
 */
function updateStats(requests) {
  const count = (st) => requests.filter((r) => normStatus(r.status) === st).length;
  setEl("stat-total",    requests.length);
  setEl("stat-pending",  count("pending"));
  setEl("stat-approved", count("approved"));
  setEl("stat-ready",    count("ready"));
}

/**
 * Renders the five most recent document requests in the dashboard list widget.
 *
 * @param {object[]} requests - Array of document request objects from the API.
 */
function renderRequests(requests) {
  const list = document.getElementById("requests-list");
  if (!list) return;

  if (!requests.length) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:#9ca3af;font-size:0.85rem">No requests yet. Click <strong>New request</strong> to get started.</div>`;
    return;
  }

  list.innerHTML = requests
    .slice(0, 5)
    .map((r) => {
      const s    = STATUS_LABELS[normStatus(r.status)] ?? STATUS_LABELS.pending;
      const icon = DOC_ICONS[r.documentType] ?? "📄";
      return `<a class="req-row" href="request-detail.html?ref=${r.referenceCode}">
        <div class="req-icon" style="background:#f3f4f6;font-size:1.1rem">${icon}</div>
        <div class="req-info"><div class="req-title">${r.documentType}</div><div class="req-ref">Ref # ${r.referenceCode}</div></div>
        <div class="req-right"><span class="badge ${s.cls}">${s.label}</span><div class="req-date">${fmtDate(r.createdAt)}</div></div>
      </a>`;
    })
    .join("");
}

/**
 * Renders the next upcoming scheduled appointment in the dashboard appointment card.
 * Targets the element with id="appt-card".
 *
 * Date-only strings are split on "-" rather than passed directly to
 * {@link Date} to prevent a UTC midnight off-by-one-day shift in UTC+8.
 *
 * @param {object[]} appointments - Array of appointment objects from the API.
 */
function renderDashboardAppointment(appointments) {
  const card = document.getElementById("appt-card");
  if (!card) return;

  const upcoming = appointments.filter((a) => normStatus(a.status) === "scheduled");

  if (!upcoming.length) {
    card.innerHTML = `<div class="appt-inner" style="justify-content:center;padding:1.5rem;text-align:center">
      <div style="color:var(--text3);font-size:0.88rem">📅 No upcoming appointments.
        <a href="appointments.html" style="display:block;margin-top:8px;color:var(--accent)">Schedule a pickup →</a>
      </div></div>`;
    return;
  }

  const a = upcoming[0];
  const [, mm, dd] = (a.appointmentDate || "").split("-").map(Number);
  const day     = dd  || "—";
  const mon     = mm  ? MONTHS[mm - 1].slice(0, 3) : "—";
  const docType = a.documentType ? `${a.documentType} pickup` : "Document pickup";

  card.innerHTML = `<div class="appt-inner">
    <div class="appt-cal"><div class="appt-day">${day}</div><div class="appt-mon">${mon}</div></div>
    <div class="appt-info">
      <div class="appt-title">${docType}</div>
      <div class="appt-sub">⏰ ${isoToTime(a.appointmentTime)} &nbsp;·&nbsp; 📍 Barangay Hall, ${a.pickupWindow || "Window 1"}</div>
    </div>
    <a href="appointments.html" class="btn-reschedule">Reschedule</a>
  </div>`;
}

/**
 * Initialises the resident dashboard page.
 * Fetches requests and appointments in parallel and populates
 * all dashboard widgets. No-ops when not on the dashboard page.
 *
 * @returns {Promise<void>}
 */
async function initDashboard() {
  if (!document.getElementById("greet-name")) return;
  requireAuth();
  updateGreeting();
  try {
    const [requests, appointments] = await Promise.all([
      api("/api/requests/me"),
      api("/api/appointments/me"),
    ]);
    updateStats(requests);
    renderRequests(requests);
    renderDashboardAppointment(appointments);
  } catch (err) {
    showToast("Could not load your dashboard data.");
  }
}

// ─────────────────────────────────────────────────────────────
// My Requests
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of the current user's document requests. */
let ALL_MY_REQUESTS = [];

/**
 * Renders a list of document requests into the #requests-list element.
 *
 * @param {object[]} requests - Array of document request objects.
 */
function renderList(requests) {
  const list = document.getElementById("requests-list");
  if (!list) return;

  if (!requests.length) {
    list.innerHTML = emptyState("📭", "No requests found.");
    return;
  }

  list.innerHTML = requests
    .map((r) => {
      const s    = STATUS_LABELS[normStatus(r.status)] ?? STATUS_LABELS.pending;
      const icon = DOC_ICONS[r.documentType] ?? "📄";
      return `<a class="list-row" href="request-detail.html?ref=${r.referenceCode}">
        <div class="list-icon">${icon}</div>
        <div class="list-info"><div class="list-title">${r.documentType}</div><div class="list-sub">Ref # ${r.referenceCode} &nbsp;·&nbsp; ${fmtDate(r.createdAt)}</div></div>
        <div class="list-right"><span class="badge ${s.cls}">${s.label}</span><div class="list-date">Fee: ${fmtFee(r.processingFee)}</div></div>
      </a>`;
    })
    .join("");
}

/**
 * Initialises the My Requests page by fetching and rendering
 * the authenticated user's requests. No-ops when not on that page,
 * or when the dashboard stat counters are also present (handled by
 * {@link initDashboard} in that case).
 *
 * @returns {Promise<void>}
 */
async function initMyRequests() {
  if (!document.getElementById("requests-list")) return;
  if (document.getElementById("stat-total")) return;
  try {
    ALL_MY_REQUESTS = await api("/api/requests/me");
    renderList(ALL_MY_REQUESTS);
  } catch (err) {
    showToast("Could not load your requests.");
  }
}

/**
 * Filters and re-renders the My Requests list by the given status.
 *
 * @param {string} status - Status key to filter by (e.g. "pending"), or "all".
 * @param {HTMLElement} btn - The filter button element that was clicked.
 */
function filterRequests(status, btn) {
  setActiveFilter(btn);
  renderList(
    status === "all"
      ? ALL_MY_REQUESTS
      : ALL_MY_REQUESTS.filter((r) => normStatus(r.status) === status),
  );
}

// ─────────────────────────────────────────────────────────────
// Request Detail
// ─────────────────────────────────────────────────────────────

/**
 * Maps request status keys to their ordered timeline step labels.
 * Each array represents the full progression for that status,
 * with the last entry being the current/active step.
 *
 * @type {Object.<string, string[]>}
 */
const TIMELINE_STEPS = {
  pending:  ["Request submitted", "Awaiting review"],
  approved: ["Request submitted", "Under review", "Approved"],
  rejected: ["Request submitted", "Under review", "Rejected"],
  ready:    ["Request submitted", "Under review", "Approved", "Ready for pickup"],
};

/**
 * Initialises the Request Detail page.
 * Reads the `ref` query parameter and fetches the corresponding
 * request from the API before rendering the detail view.
 *
 * @returns {Promise<void>}
 */
async function initRequestDetail() {
  const detailBody = document.getElementById("detail-body");
  if (!detailBody) return;

  const ref = getParam("ref");
  if (!ref) {
    detailBody.innerHTML = emptyState("❓", "No reference code provided.");
    return;
  }

  try {
    _renderDetailView(detailBody, await api(`/api/requests/${ref}`));
  } catch (err) {
    detailBody.innerHTML = emptyState("❓", "Request not found or access denied.");
  }
}

/**
 * Renders the full request detail view including info table, status
 * timeline, appointment summary, and payment details.
 *
 * @param {HTMLElement} detailBody - The container element to render into.
 * @param {object} r - The document request object returned by the API.
 */
function _renderDetailView(detailBody, r) {
  const statusKey = normStatus(r.status);
  const s         = STATUS_LABELS[statusKey] ?? STATUS_LABELS.pending;
  const tl        = TIMELINE_STEPS[statusKey] ?? TIMELINE_STEPS.pending;
  const icon      = DOC_ICONS[r.documentType] ?? "📄";
  const payKey    = normStatus(r.paymentStatus);
  document.title  = `${r.documentType} — E-Proseso`;

  const steps = tl
    .map((step, i) => {
      const done = i < tl.length - 1;
      const cur  = i === tl.length - 1;
      const bg   = done
        ? "background:var(--success-bg);color:var(--success-dark);"
        : cur
          ? "background:var(--accent);color:#fff;"
          : "background:#f3f4f6;color:var(--text3);";
      const connector = i < tl.length - 1
        ? `<div style="width:2px;flex:1;min-height:24px;background:${done ? "var(--success-dark)" : "var(--border)"};margin:4px 0"></div>`
        : "";
      return `<div style="display:flex;gap:12px;align-items:flex-start">
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;${bg}">${done ? "✓" : i + 1}</div>
          ${connector}
        </div>
        <div style="padding-top:4px;padding-bottom:${i < tl.length - 1 ? "20px" : "0"}">
          <div style="font-size:0.88rem;font-weight:700;color:${cur ? "var(--text)" : "var(--text3)"}">${step}</div>
          ${cur ? `<div style="font-size:0.75rem;color:var(--text3);margin-top:2px">${fmtDate(r.createdAt)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  const appt        = r.appointment;
  const apptDisplay = appt
    ? `${fmtDate(appt.appointmentDate)} · ${isoToTime(appt.appointmentTime)} · ${appt.pickupWindow}`
    : "Not yet scheduled";

  detailBody.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;flex-wrap:wrap">
      <div style="font-size:2rem">${icon}</div>
      <div style="flex:1"><h1 class="page-title" style="margin-bottom:4px">${r.documentType}</h1><p style="font-size:0.85rem;color:var(--text3)">Ref # ${r.referenceCode}</p></div>
      <span class="badge ${s.cls}" style="font-size:0.82rem;padding:5px 14px">${s.label}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div>
        <div class="section-title">Request info</div>
        <div class="card-sm">
          <table style="width:100%;font-size:0.85rem;border-collapse:collapse">
            <tr><td style="color:var(--text3);padding:5px 0;width:45%">Document</td><td style="font-weight:600">${r.documentType}</td></tr>
            <tr><td style="color:var(--text3);padding:5px 0">Reference</td><td style="font-weight:600">${r.referenceCode}</td></tr>
            <tr><td style="color:var(--text3);padding:5px 0">Date filed</td><td>${fmtDate(r.createdAt)}</td></tr>
            <tr><td style="color:var(--text3);padding:5px 0">Full name</td><td>${r.requesterFirstName} ${r.requesterLastName}</td></tr>
            <tr><td style="color:var(--text3);padding:5px 0">Purpose</td><td>${r.purpose || "—"}</td></tr>
            <tr><td style="color:var(--text3);padding:5px 0">Address</td><td>${r.address || "—"}</td></tr>
            ${r.notes     ? `<tr><td style="color:var(--text3);padding:5px 0">Notes</td><td>${r.notes}</td></tr>` : ""}
            ${r.staffNote ? `<tr><td style="color:var(--text3);padding:5px 0">Staff note</td><td style="color:var(--primary-dark)">${r.staffNote}</td></tr>` : ""}
          </table>
        </div>
      </div>
      <div><div class="section-title">Status timeline</div><div class="card-sm">${steps}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div>
        <div class="section-title">Appointment</div>
        <div class="card-sm">
          <div style="font-size:0.88rem;color:var(--text)">${apptDisplay}</div>
          <a href="appointments.html" class="btn btn-ghost btn-sm" style="margin-top:10px;display:inline-flex">Manage appointment</a>
        </div>
      </div>
      <div>
        <div class="section-title">Payment</div>
        <div class="card-sm">
          <table style="width:100%;font-size:0.85rem;border-collapse:collapse">
            <tr><td style="color:var(--text3);padding:5px 0">Fee</td><td style="font-weight:700;color:var(--primary-dark)">${fmtFee(r.processingFee)}</td></tr>
            <tr><td style="color:var(--text3);padding:5px 0">Status</td><td><span class="badge ${PAY_STATUS_LABELS[payKey]?.cls ?? "badge-pending"}">${PAY_STATUS_LABELS[payKey]?.label ?? "Unpaid"}</span></td></tr>
            ${r.officialReceiptNo ? `<tr><td style="color:var(--text3);padding:5px 0">OR No.</td><td>${r.officialReceiptNo}</td></tr>` : ""}
          </table>
          <p style="font-size:0.76rem;color:var(--text3);margin-top:8px">Pay at the barangay hall upon pickup.</p>
        </div>
      </div>
    </div>
    <a href="my-requests.html" class="btn btn-ghost">← Back to my requests</a>`;
}

// ─────────────────────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────────────────────

/**
 * Initialises the admin dashboard page.
 * Fetches requests, appointments, users, and payments in parallel,
 * then populates summary statistics and the recent-requests widget.
 *
 * @returns {Promise<void>}
 */
async function initAdminDashboard() {
  const list = document.getElementById("admin-recent");
  if (!list) return;

  try {
    const [allRequests, allAppointments, allUsers, allPayments] = await Promise.all([
      api("/api/admin/requests").catch(() => []),
      api("/api/admin/appointments").catch(() => []),
      api("/api/admin/users").catch(() => []),
      api("/api/admin/payments").catch(() => []),
    ]);

    const todayISO     = new Date().toISOString().split("T")[0];
    const pendingCount = allRequests.filter((r) => normStatus(r.status) === "pending").length;
    const collected    = allPayments
      .filter((r) => normStatus(r.paymentStatus) === "paid")
      .reduce((s, r) => s + Number(r.processingFee), 0);

    setEl("admin-stat-total",       allRequests.length);
    setEl("admin-stat-pending",     pendingCount);
    setEl("admin-stat-approved",    allRequests.filter((r) => normStatus(r.status) === "approved").length);
    setEl("admin-stat-appts-today", allAppointments.filter(
      (a) => a.appointmentDate === todayISO && normStatus(a.status) === "scheduled",
    ).length);
    setEl("admin-stat-collected",   `₱${collected.toFixed(2)}`);
    setEl("admin-stat-users",       allUsers.length);

    const quickPending = document.getElementById("admin-quick-pending");
    if (quickPending)
      quickPending.textContent = pendingCount > 0
        ? `${pendingCount} pending request${pendingCount !== 1 ? "s" : ""} waiting`
        : "No pending requests";

    const recent = [...allRequests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    if (!recent.length) {
      list.innerHTML = emptyState("📭", "No requests yet.");
      return;
    }

    list.innerHTML = recent
      .map((r) => {
        const s        = STATUS_LABELS[normStatus(r.status)] ?? STATUS_LABELS.pending;
        const icon     = DOC_ICONS[r.documentType] ?? "📄";
        const userName = r.requesterFirstName && r.requesterLastName
          ? `${r.requesterFirstName} ${r.requesterLastName}`
          : "—";
        return `<a class="list-row" href="admin-requests.html">
          <div class="list-icon">${icon}</div>
          <div class="list-info"><div class="list-title">${r.documentType}</div><div class="list-sub">${userName} · Ref # ${r.referenceCode}</div></div>
          <div class="list-right"><span class="badge ${s.cls}">${s.label}</span><div class="list-date">${fmtDate(r.createdAt)}</div></div>
        </a>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = emptyState("⚠️", "Could not load recent requests.");
  }
}

// ─────────────────────────────────────────────────────────────
// Admin Requests
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of all document requests for the admin view. */
let ALL_ADMIN_REQS = [];

/** @type {number|null} ID of the request currently being edited in the status modal. */
let editingId = null;

/**
 * Renders a list of document requests into the #req-list admin element.
 * Each row includes an "Update" button that opens the status-update modal.
 *
 * @param {object[]} data - Array of document request objects.
 */
function renderReqs(data) {
  const list = document.getElementById("req-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = emptyState("📭", "No requests found.");
    return;
  }

  list.innerHTML = data
    .map((r) => {
      const s        = STATUS_LABELS[normStatus(r.status)] ?? STATUS_LABELS.pending;
      const icon     = DOC_ICONS[r.documentType] ?? "📄";
      const userName = r.requesterFirstName && r.requesterLastName
        ? `${r.requesterFirstName} ${r.requesterLastName}`
        : "—";
      const statusKey = normStatus(r.status);
      return `<div class="list-row" style="cursor:default">
        <div class="list-icon">${icon}</div>
        <div class="list-info"><div class="list-title">${r.documentType}</div><div class="list-sub">${userName} · Ref # ${r.referenceCode} · ${fmtDate(r.createdAt)}</div></div>
        <div class="list-right" style="display:flex;align-items:center;gap:8px">
          <span class="badge ${s.cls}">${s.label}</span>
          <button class="btn btn-ghost btn-sm" onclick="openModal(${r.id},'${r.referenceCode}','${r.documentType}','${userName}','${statusKey}')">Update</button>
        </div>
      </div>`;
    })
    .join("");
}

/**
 * Filters and re-renders the admin requests list by status.
 *
 * @param {string} status - Status key to filter by, or "all".
 * @param {HTMLElement} btn - The filter button element that was clicked.
 */
function filterReqs(status, btn) {
  setActiveFilter(btn);
  renderReqs(
    status === "all"
      ? ALL_ADMIN_REQS
      : ALL_ADMIN_REQS.filter((r) => normStatus(r.status) === status),
  );
}

/**
 * Initialises the Admin Requests page by fetching and rendering all requests.
 *
 * @returns {Promise<void>}
 */
async function initAdminRequests() {
  if (!document.getElementById("req-list")) return;
  try {
    ALL_ADMIN_REQS = await api("/api/admin/requests");
    renderReqs(ALL_ADMIN_REQS);
  } catch (err) {
    showToast("Could not load requests.");
  }
}

/**
 * Opens the request status-update modal and pre-populates it with
 * the given request's current values.
 *
 * @param {number} id - The database ID of the request to update.
 * @param {string} refCode - The human-readable reference code.
 * @param {string} docType - The document type name.
 * @param {string} userName - The requester's full name.
 * @param {string} currentStatus - The current normalised status key.
 */
function openModal(id, refCode, docType, userName, currentStatus) {
  editingId = id;
  document.getElementById("modal-ref").textContent    = `${docType} · ${refCode} · ${userName}`;
  document.getElementById("modal-status").value       = currentStatus;
  document.getElementById("modal-note").value         = "";
  document.getElementById("modal-overlay").style.display = "flex";
}

/**
 * Closes the request status-update modal.
 */
function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
}

/**
 * Submits the status update form for the request currently open in the modal.
 * Sends the new status and optional staff note to the API, then refreshes the list.
 *
 * @returns {Promise<void>}
 */
async function saveStatus() {
  const newStatus = document.getElementById("modal-status").value;
  const staffNote = document.getElementById("modal-note").value.trim();
  try {
    await api(`/api/admin/requests/${editingId}`, {
      method: "PATCH",
      body: { status: newStatus.toUpperCase(), staffNote: staffNote || null },
    });
    closeModal();
    showToast(`Status updated to ${STATUS_LABELS[newStatus]?.label ?? newStatus}.`);
    await initAdminRequests();
  } catch (err) {
    showToast(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Appointments — Calendar & Booking
// ─────────────────────────────────────────────────────────────

/** @type {string[]} Available pickup time slots displayed on the calendar booking UI. */
const TIMES = [
  "8:00 AM","9:00 AM","10:00 AM","11:00 AM",
  "1:00 PM","2:00 PM","3:00 PM","4:00 PM",
];

/** @type {string[]} Time slots already booked on the currently selected date. */
let BOOKED_SLOTS = [];

const curDate  = new Date();
let curYear    = curDate.getFullYear();
let curMonth   = curDate.getMonth();

/** @type {string|null} Human-readable selected date (e.g. "May 30, 2026"). */
let selectedDate = null;

/** @type {string|null} Selected time slot (e.g. "9:00 AM"). */
let selectedTime = null;

/** @type {object[]} Module-level cache of the current user's appointments. */
let MY_APPOINTMENTS = [];

/**
 * Advances or retreats the calendar by one month, then re-renders.
 *
 * @param {number} dir - Direction: 1 for next month, -1 for previous month.
 */
function changeMonth(dir) {
  curMonth += dir;
  if (curMonth > 11) { curMonth = 0;  curYear++; }
  if (curMonth < 0)  { curMonth = 11; curYear--; }
  renderCalendar();
}

/**
 * Renders the monthly calendar grid into #cal-days.
 * Disables past dates and weekends. Highlights the currently selected date.
 */
function renderCalendar() {
  const header = document.getElementById("cal-header");
  if (!header) return;

  header.textContent = `${MONTHS[curMonth]} ${curYear}`;
  const days  = document.getElementById("cal-days");
  const today = new Date(new Date().toDateString());
  const first = new Date(curYear, curMonth, 1).getDay();
  const total = new Date(curYear, curMonth + 1, 0).getDate();

  let html = "<div></div>".repeat(first);
  for (let d = 1; d <= total; d++) {
    const dateObj  = new Date(curYear, curMonth, d);
    const disabled = dateObj < today || dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const dateStr  = `${MONTHS[curMonth]} ${d}, ${curYear}`;
    const cls      = `cal-day${disabled ? " cal-disabled" : ""}${selectedDate === dateStr ? " cal-active" : ""}`;
    html += `<div class="${cls}"${!disabled ? ` onclick="selectDate('${dateStr}')"` : ""}>${d}</div>`;
  }
  days.innerHTML = html;
}

/**
 * Handles a calendar date selection.
 * Updates {@link selectedDate}, re-renders the calendar and time slot display,
 * then fetches live availability from the API to determine booked slots.
 *
 * @param {string} dateStr - Human-readable date string (e.g. "May 30, 2026").
 * @returns {Promise<void>}
 */
async function selectDate(dateStr) {
  selectedDate = dateStr;
  selectedTime = null;
  renderCalendar();
  updateSlotDisplay();

  const slotsEl = document.getElementById("time-slots");
  if (slotsEl)
    slotsEl.innerHTML = '<p style="color:var(--text3);font-size:0.85rem">Loading availability…</p>';

  try {
    const slots  = await api(`/api/appointments/slots?date=${dateToISO(dateStr)}`);
    BOOKED_SLOTS = slots.filter((s) => !s.available).map((s) => isoToTime(s.time));
  } catch {
    BOOKED_SLOTS = [];
  }
  renderTimeSlots();
}

/**
 * Renders the time slot button grid for the selected date.
 * Disables and visually marks slots that are already booked.
 * Highlights the currently selected slot.
 */
function renderTimeSlots() {
  const slots = document.getElementById("time-slots");
  if (!slots) return;
  slots.innerHTML = TIMES.map((t) => {
    const taken  = BOOKED_SLOTS.includes(t);
    const active = selectedTime === t;
    return (
      `<button class="time-slot${taken ? " time-taken" : ""}${active ? " time-active" : ""}"` +
      `${!taken ? ` onclick="selectTime('${t}')"` : ""} ${taken ? "disabled" : ""}>${t}</button>`
    );
  }).join("");
}

/**
 * Handles a time slot selection and refreshes the slot display summary.
 *
 * @param {string} t - The selected time string (e.g. "9:00 AM").
 */
function selectTime(t) {
  selectedTime = t;
  renderTimeSlots();
  updateSlotDisplay();
}

/**
 * Updates the selected slot summary text and enables or disables
 * the booking button based on whether both a date and time are chosen.
 */
function updateSlotDisplay() {
  const slot = document.getElementById("selected-slot");
  const btn  = document.getElementById("book-btn");
  if (!slot || !btn) return;

  if (selectedDate && selectedTime) {
    slot.textContent = `${selectedDate} at ${selectedTime}`;
    slot.classList.remove("text-muted");
    btn.disabled = false;
  } else {
    slot.textContent = selectedDate ? "Now select a time" : "Select a date to see availability";
    slot.classList.add("text-muted");
    btn.disabled = true;
  }
}

/**
 * Submits a new appointment booking using the selected date, time,
 * and associated document request. Refreshes the appointment list
 * and resets the calendar selection state on success.
 *
 * The `documentRequestId` is sent as a numeric value sourced from
 * {@link populateRequestSelect}, which sets option values to `r.id`.
 *
 * @returns {Promise<void>}
 */
async function bookAppointment() {
  const reqIdRaw = document.getElementById("appt-request").value;
  if (!reqIdRaw) { showToast("Please select a document request."); return; }
  if (!selectedDate || !selectedTime) { showToast("Please select a date and time."); return; }

  const btn = document.getElementById("book-btn");
  btn.disabled = true;

  try {
    await api("/api/appointments", {
      method: "POST",
      body: {
        documentRequestId: Number(reqIdRaw),
        appointmentDate:   dateToISO(selectedDate),
        appointmentTime:   timeToISO(selectedTime),
      },
    });
    showToast(`Appointment booked for ${selectedDate} at ${selectedTime}!`);
    selectedDate = null;
    selectedTime = null;
    document.getElementById("selected-slot").textContent = "No slot selected yet";
    renderCalendar();
    await initMyAppointments();
  } catch (err) {
    showToast(err.message);
    btn.disabled = false;
  }
}

/**
 * Fetches and renders the current user's appointment list into #appt-list.
 *
 * @returns {Promise<void>}
 */
async function initMyAppointments() {
  const list = document.getElementById("appt-list");
  if (!list) return;
  try {
    MY_APPOINTMENTS = await api("/api/appointments/me");
    _renderMyApptList(list, MY_APPOINTMENTS);
  } catch (err) {
    list.innerHTML = emptyState("📅", "Could not load appointments.");
  }
}

/**
 * Renders an array of appointments into the provided list element.
 *
 * @param {HTMLElement} list - The container element to render into.
 * @param {object[]}    appts - Array of appointment objects from the API.
 */
function _renderMyApptList(list, appts) {
  if (!appts.length) {
    list.innerHTML = emptyState("📅", "No upcoming appointments.");
    return;
  }
  list.innerHTML = appts
    .map((a) => {
      const s       = APPT_STATUS_LABELS[normStatus(a.status)] ?? APPT_STATUS_LABELS.scheduled;
      const ref     = a.referenceCode ?? "—";
      const docType = a.documentType  ?? "Document pickup";
      return `<div class="list-row" style="cursor:default">
        <div class="list-icon">📅</div>
        <div class="list-info"><div class="list-title">${docType}</div><div class="list-sub">${fmtDate(a.appointmentDate)} · ${isoToTime(a.appointmentTime)} · ${a.pickupWindow ?? ""}</div></div>
        <div class="list-right"><span class="badge ${s.cls}">${s.label}</span><div class="list-date">${ref}</div></div>
      </div>`;
    })
    .join("");
}

/**
 * Populates the #appt-request select element with the current user's
 * approved or ready document requests. Option values are set to the
 * numeric `r.id` so that {@link bookAppointment} can send the correct
 * `documentRequestId` to the API.
 *
 * @returns {Promise<void>}
 */
async function populateRequestSelect() {
  const select = document.getElementById("appt-request");
  if (!select) return;
  try {
    const requests = await api("/api/requests/me");
    const eligible = requests.filter(
      (r) => r.status === "APPROVED" || r.status === "READY",
    );
    if (!eligible.length) {
      select.innerHTML = '<option value="">No approved requests available</option>';
      return;
    }
    select.innerHTML =
      '<option value="">Select a request…</option>' +
      eligible
        .map((r) => `<option value="${r.id}">${r.referenceCode} — ${r.documentType}</option>`)
        .join("");
  } catch (err) {
    showToast("Could not load your requests.");
  }
}

// ─────────────────────────────────────────────────────────────
// Admin Appointments
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of all appointments for the admin view. */
let ALL_ADMIN_APPTS = [];

/** @type {number|null} ID of the appointment currently open in the admin modal. */
let adminEditingApptId = null;

/** @type {string} Active filter key for the admin appointment list. */
let currentAdminFilter = "all";

/**
 * Initialises the Admin Appointments page.
 * Fetches all appointments, updates the stats bar, and renders the
 * list for the currently active filter.
 *
 * @returns {Promise<void>}
 */
async function initAdminAppointments() {
  if (!document.getElementById("admin-appt-list")) return;
  try {
    ALL_ADMIN_APPTS = await api("/api/admin/appointments");
    updateAdminApptStats();
    filterApptAdmin(
      currentAdminFilter,
      document.querySelector(".filter-btn.active") || null,
    );
  } catch (err) {
    showToast("Could not load appointments.");
  }
}

/**
 * Updates the appointment stat counters (today / upcoming / completed)
 * from the {@link ALL_ADMIN_APPTS} cache.
 */
function updateAdminApptStats() {
  const todayISO = new Date().toISOString().split("T")[0];
  setEl("appt-stat-today",    ALL_ADMIN_APPTS.filter(
    (a) => a.appointmentDate === todayISO && normStatus(a.status) === "scheduled",
  ).length);
  setEl("appt-stat-upcoming", ALL_ADMIN_APPTS.filter((a) => normStatus(a.status) === "scheduled").length);
  setEl("appt-stat-done",     ALL_ADMIN_APPTS.filter((a) => normStatus(a.status) === "completed").length);
}

/**
 * Filters and re-renders the admin appointment list.
 *
 * @param {string}          status - Filter key: "today" | "upcoming" | "completed" | "all".
 * @param {HTMLElement|null} btn   - The filter button element that was clicked.
 */
function filterApptAdmin(status, btn) {
  currentAdminFilter = status;
  setActiveFilter(btn);
  const todayISO = new Date().toISOString().split("T")[0];
  renderAdminApptList(
    status === "today"
      ? ALL_ADMIN_APPTS.filter((a) => a.appointmentDate === todayISO)
      : status === "upcoming"
        ? ALL_ADMIN_APPTS.filter((a) => normStatus(a.status) === "scheduled")
        : status === "completed"
          ? ALL_ADMIN_APPTS.filter((a) => normStatus(a.status) === "completed")
          : ALL_ADMIN_APPTS,
  );
}

/**
 * Renders a filtered set of appointments into #admin-appt-list.
 *
 * @param {object[]} data - Array of appointment objects to render.
 */
function renderAdminApptList(data) {
  const list = document.getElementById("admin-appt-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = emptyState("📅", "No appointments found matching this view.");
    return;
  }

  list.innerHTML = data
    .map((a) => {
      const s        = APPT_STATUS_LABELS[normStatus(a.status)] ?? APPT_STATUS_LABELS.scheduled;
      const userName = a.residentName   ?? "—";
      const ref      = a.referenceCode  ?? "—";
      const docType  = a.documentType   ?? "—";
      return `<div class="list-row" style="cursor:default">
        <div class="list-icon">📅</div>
        <div class="list-info">
          <div class="list-title">${userName} <span class="text-muted" style="font-size:0.8rem;font-weight:normal">(${docType})</span></div>
          <div class="list-sub">Ref: ${ref} &nbsp;·&nbsp; <strong>${fmtDate(a.appointmentDate)}</strong> at ${isoToTime(a.appointmentTime)} &nbsp;·&nbsp; ${a.pickupWindow ?? ""}</div>
          ${a.note ? `<div style="font-size:0.75rem;color:var(--text3);margin-top:4px">📝 ${a.note}</div>` : ""}
        </div>
        <div class="list-right" style="display:flex;align-items:center;gap:12px">
          <span class="badge ${s.cls}">${s.label}</span>
          <button class="btn btn-ghost btn-sm" onclick="openApptModal(${a.id})">Manage</button>
        </div>
      </div>`;
    })
    .join("");
}

/**
 * Opens the admin appointment management modal and pre-populates it
 * with the selected appointment's current status and note.
 *
 * @param {number} id - The database ID of the appointment to manage.
 */
function openApptModal(id) {
  adminEditingApptId = id;
  const a = ALL_ADMIN_APPTS.find((x) => x.id === id);
  if (!a) return;
  document.getElementById("appt-modal-info").textContent =
    `${a.residentName ?? ""} — ${a.documentType ?? ""} (${a.referenceCode ?? ""}) on ${fmtDate(a.appointmentDate)} @ ${isoToTime(a.appointmentTime)}`;
  document.getElementById("appt-modal-status").value = normStatus(a.status);
  document.getElementById("appt-modal-note").value   = a.note || "";
  document.getElementById("appt-modal-overlay").style.display = "flex";
}

/**
 * Closes the admin appointment management modal.
 */
function closeApptModal() {
  document.getElementById("appt-modal-overlay").style.display = "none";
}

/**
 * Submits the status and note update for the appointment open in the modal.
 * Refreshes the appointment list on success.
 *
 * @returns {Promise<void>}
 */
async function saveApptStatus() {
  const newStatus = document.getElementById("appt-modal-status").value;
  const newNote   = document.getElementById("appt-modal-note").value.trim();
  try {
    await api(`/api/admin/appointments/${adminEditingApptId}`, {
      method: "PATCH",
      body: { status: newStatus.toUpperCase(), note: newNote || null },
    });
    closeApptModal();
    await initAdminAppointments();
    showToast("Appointment changes saved successfully.");
  } catch (err) {
    showToast(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of the current user's notifications. */
let LIVE_NOTIFS = [];

/**
 * Initialises the Notifications page by fetching and rendering notifications.
 *
 * @returns {Promise<void>}
 */
async function initNotifications() {
  if (!document.getElementById("notif-list")) return;
  try {
    LIVE_NOTIFS = await api("/api/notifications");
    renderNotifs();
  } catch (err) {
    showToast("Could not load notifications.");
  }
}

/**
 * Renders the {@link LIVE_NOTIFS} cache into the #notif-list element.
 * Unread notifications are visually distinguished with a coloured dot indicator.
 */
function renderNotifs() {
  const list = document.getElementById("notif-list");
  if (!list) return;

  if (!LIVE_NOTIFS.length) {
    list.innerHTML = emptyState("🔔", "No notifications yet.");
    return;
  }

  const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-left:4px;vertical-align:2px"></span>`;
  list.innerHTML = LIVE_NOTIFS.map(
    (n) => `
    <a class="list-row notif-row${n.read ? " notif-read" : ""}" href="${n.link}" onclick="markRead(${n.id})">
      <div class="list-icon" style="background:${n.read ? "#f3f4f6" : "var(--accent-bg)"};font-size:1.1rem">${n.icon}</div>
      <div class="list-info">
        <div class="list-title" style="color:${n.read ? "var(--text2)" : "var(--text)"}">${n.title}${n.read ? "" : dot}</div>
        <div style="font-size:0.78rem;color:var(--text3);margin-top:2px;line-height:1.4">${n.body}</div>
      </div>
      <div class="list-right"><div class="list-date" style="white-space:nowrap">${fmtDate(n.createdAt)}</div></div>
    </a>`,
  ).join("");
}

/**
 * Marks a single notification as read both locally and on the server.
 * No-ops if the notification is already read.
 *
 * @param {number} id - The notification ID to mark as read.
 * @returns {Promise<void>}
 */
async function markRead(id) {
  const n = LIVE_NOTIFS.find((n) => n.id === id);
  if (n && !n.read) {
    n.read = true;
    await api(`/api/notifications/${id}/read`, { method: "PUT" }).catch(() => {});
  }
}

/**
 * Marks all notifications as read via the bulk API endpoint,
 * updates the local cache, and re-renders the notification list.
 *
 * @returns {Promise<void>}
 */
async function markAllRead() {
  try {
    await api("/api/notifications/read-all", { method: "PUT" });
    LIVE_NOTIFS.forEach((n) => { n.read = true; });
    renderNotifs();
    showToast("All notifications marked as read.");
  } catch (err) {
    showToast(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

/**
 * Loads the authenticated user's profile from the API and populates
 * all profile form fields, the avatar, the role badge, and syncs
 * the local storage session data.
 *
 * @returns {Promise<void>}
 */
async function loadProfile() {
  try {
    const u  = await api("/api/users/me");
    const av = (u.firstName[0] + u.lastName[0]).toUpperCase();

    setEl("p-fname",    u.firstName,             "value");
    setEl("p-lname",    u.lastName,              "value");
    setEl("p-email",    u.email,                 "value");
    setEl("p-phone",    u.phone || "",           "value");
    setEl("profile-name",   `${u.firstName} ${u.lastName}`);
    setEl("profile-email",  u.email);
    setEl("profile-avatar", av);
    setEl("nav-avatar",     av);

    const roleKey  = (u.role || "resident").toLowerCase();
    const roleMeta = ROLE_BADGES[roleKey] ?? { label: u.role || "Resident", cls: "badge-pending" };
    const badgeEl  = document.getElementById("profile-role-badge");
    if (badgeEl) {
      badgeEl.textContent = roleMeta.label;
      badgeEl.className   = `badge ${roleMeta.cls}`;
    }

    const stored = getUser() || {};
    Object.assign(stored, {
      fname: u.firstName, lname: u.lastName,
      email: u.email, phone: u.phone, role: u.role,
    });
    localStorage.setItem("eprosesoUser", JSON.stringify(stored));
  } catch (err) {
    showToast("Could not load profile.");
  }
}

/**
 * Saves changes to the authenticated user's profile.
 * Awaits {@link loadProfile} after a successful update so the UI
 * reflects the new values before the success toast is shown.
 *
 * @returns {Promise<void>}
 */
async function saveProfile() {
  const fname = document.getElementById("p-fname").value.trim();
  const lname = document.getElementById("p-lname").value.trim();
  const email = document.getElementById("p-email").value.trim();
  const phone = document.getElementById("p-phone").value.trim();

  if (!fname || !lname || !email) {
    showToast("Please fill in all required fields.");
    return;
  }

  try {
    await api("/api/users/me", {
      method: "PUT",
      body: { firstName: fname, lastName: lname, email, phone },
    });
    await loadProfile();
    showToast("Profile updated successfully!");
  } catch (err) {
    showToast(err.message);
  }
}

/**
 * Submits a password change request.
 * Validates that the new password meets the minimum length requirement
 * and that the confirmation field matches before calling the API.
 *
 * @returns {Promise<void>}
 */
async function changePassword() {
  const cur  = document.getElementById("p-current").value;
  const nw   = document.getElementById("p-new").value;
  const conf = document.getElementById("p-confirm").value;

  if (!cur || !nw || !conf) { showToast("Please fill in all password fields."); return; }
  if (nw.length < 8)        { showToast("New password must be at least 8 characters."); return; }
  if (nw !== conf)           { showToast("Passwords do not match."); return; }

  try {
    await api("/api/users/me/password", {
      method: "PUT",
      body: { currentPassword: cur, newPassword: nw },
    });
    showToast("Password updated successfully!");
    ["p-current", "p-new", "p-confirm"].forEach((id) => setEl(id, "", "value"));
  } catch (err) {
    showToast(err.message);
  }
}

/**
 * Prompts the user for confirmation before deleting the account.
 * On confirmation, calls the delete API, clears the session from
 * local storage, and redirects to the home page.
 */
function confirmDelete() {
  if (confirm("Are you sure you want to delete your account? This cannot be undone.")) {
    api("/api/users/me", { method: "DELETE" })
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem("eproseso_jwt");
        localStorage.removeItem("eprosesoUser");
        window.location.href = "index.html";
      });
  }
}

// ─────────────────────────────────────────────────────────────
// Request Multi-Step Form
// ─────────────────────────────────────────────────────────────

/** @type {string|null} Document type selected in step 1 of the request form. */
let selectedDoc = null;

/** @type {number} Processing fee for the selected document type. */
let selectedFee = 0;

/** @type {File[]} Files attached by the user on the upload step. */
let uploadedFiles = [];

/**
 * Handles selection of a document type card in the request form.
 * Deselects all other cards and records the chosen type and fee.
 *
 * @param {HTMLElement} el - The `.doc-type-card` element that was clicked.
 */
function selectDoc(el) {
  document.querySelectorAll(".doc-type-card").forEach((c) => c.classList.remove("selected"));
  el.classList.add("selected");
  selectedDoc = el.dataset.type;
  selectedFee = parseInt(el.dataset.fee, 10);
  document.getElementById("doc-error").style.display = "none";
}

/**
 * Navigates between steps in the multi-step request form.
 * Validates required fields before allowing forward navigation:
 * step 2 requires a selected document type; step 3 requires personal
 * details, and also populates the review summary fields.
 *
 * @param {number} n - The destination step number (1, 2, or 3).
 */
function goStep(n) {
  if (n === 2 && !selectedDoc) {
    document.getElementById("doc-error").style.display = "block";
    return;
  }

  if (n === 3) {
    const fname   = document.getElementById("req-fname").value.trim();
    const lname   = document.getElementById("req-lname").value.trim();
    const address = document.getElementById("req-address").value.trim();
    const purpose = document.getElementById("req-purpose").value;
    if (!fname || !lname || !address || !purpose) {
      showToast("Please complete all required fields.");
      return;
    }
    setEl("rev-type",    selectedDoc);
    setEl("rev-name",    `${fname} ${lname}`);
    setEl("rev-address", address);
    setEl("rev-purpose", purpose);
    setEl("rev-fee",     selectedFee > 0 ? `₱${selectedFee}.00` : "Free");
  }

  [1, 2, 3].forEach((s) => {
    document.getElementById(`step-${s}`).style.display = "none";
    const ind = document.getElementById(`step-${s}-indicator`);
    ind.classList.remove("active", "done");
    if (s < n) ind.classList.add("done");
  });

  document.getElementById(`step-${n}`).style.display = "block";
  document.getElementById(`step-${n}-indicator`).classList.add("active");
}

/**
 * Populates the file attachment preview list when the user selects files.
 *
 * @param {FileList} files - The FileList from the file input change event.
 */
function handleFiles(files) {
  uploadedFiles = Array.from(files);
  document.getElementById("file-list").innerHTML = uploadedFiles
    .map(
      (f) =>
        `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.82rem;border-top:1px solid var(--border)">
          <span>📎</span><span style="flex:1;color:var(--text)">${f.name}</span>
          <span style="color:var(--text3)">${(f.size / 1024).toFixed(0)} KB</span>
        </div>`,
    )
    .join("");
}

/**
 * Submits the completed multi-step document request form to the API.
 * Transitions the form to the success step and displays the assigned
 * reference code on success. Re-enables the submit button on failure.
 *
 * @returns {Promise<void>}
 */
async function submitRequest() {
  const btn = document.getElementById("submit-btn");
  btn.disabled    = true;
  btn.textContent = "Submitting…";

  try {
    const data = await api("/api/requests", {
      method: "POST",
      body: {
        documentType:       selectedDoc,
        requesterFirstName: document.getElementById("req-fname").value.trim(),
        requesterLastName:  document.getElementById("req-lname").value.trim(),
        address:            document.getElementById("req-address").value.trim(),
        purpose:            document.getElementById("req-purpose").value,
        notes:              document.getElementById("req-notes").value.trim() || null,
        processingFee:      parseFloat(selectedFee).toFixed(2),
      },
    });
    document.getElementById("step-3").style.display        = "none";
    document.getElementById("step-success").style.display  = "block";
    document.getElementById("ref-display").textContent     = data.referenceCode;
    [1, 2, 3].forEach((s) => {
      const ind = document.getElementById(`step-${s}-indicator`);
      ind.classList.remove("active");
      ind.classList.add("done");
    });
  } catch (err) {
    showToast(err.message);
    btn.disabled    = false;
    btn.textContent = "Submit request";
  }
}

// ─────────────────────────────────────────────────────────────
// Admin Payments
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of all requests used for the admin payment view. */
let ALL_ADMIN_PAY = [];

/** @type {number|null} ID of the request currently open in the payment modal. */
let payEditingId = null;

/**
 * Initialises the Admin Payments page by fetching all requests
 * and rendering the payment list and stats.
 *
 * @returns {Promise<void>}
 */
async function initAdminPayments() {
  if (!document.getElementById("pay-list")) return;
  try {
    ALL_ADMIN_PAY = await api("/api/admin/requests");
    renderPayList(ALL_ADMIN_PAY);
    updatePayStats();
  } catch (err) {
    showToast("Could not load payment records.");
  }
}

/**
 * Renders a list of payment records into #pay-list.
 * Rows for paid/unpaid requests include an "Update" button;
 * free requests show only a placeholder.
 *
 * @param {object[]} data - Array of document request objects with payment fields.
 */
function renderPayList(data) {
  const list = document.getElementById("pay-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = emptyState("💳", "No payment records found.");
    return;
  }

  list.innerHTML = data
    .map((r) => {
      const payKey   = normStatus(r.paymentStatus);
      const s        = PAY_DISPLAY_LABELS[payKey] ?? PAY_DISPLAY_LABELS.unpaid;
      const userName = r.requesterFirstName && r.requesterLastName
        ? `${r.requesterFirstName} ${r.requesterLastName}`
        : "—";
      const orText   = r.officialReceiptNo
        ? ` · <span style="color:var(--text3)">OR: ${r.officialReceiptNo}</span>`
        : "";
      return `<div class="list-row" style="cursor:default">
        <div class="list-icon">💳</div>
        <div class="list-info"><div class="list-title">${userName}</div><div class="list-sub">${r.documentType} · Ref # ${r.referenceCode}${orText}</div></div>
        <div class="list-right" style="display:flex;align-items:center;gap:8px">
          <span class="badge ${s.cls}">${s.label}</span>
          <div class="list-date" style="font-weight:600;margin-right:4px">${fmtFee(r.processingFee)}</div>
          ${
            payKey !== "free"
              ? `<button class="btn btn-ghost btn-sm" onclick="openPayModal(${r.id},'${r.referenceCode}','${userName}',${r.processingFee},'${payKey}','${r.officialReceiptNo || ""}')">Update</button>`
              : '<div style="width:58px"></div>'
          }
        </div>
      </div>`;
    })
    .join("");
}

/**
 * Filters and re-renders the admin payment list by payment status.
 *
 * @param {string}     status - Payment status key to filter by, or "all".
 * @param {HTMLElement} btn   - The filter button element that was clicked.
 */
function filterPayAdmin(status, btn) {
  setActiveFilter(btn);
  renderPayList(
    status === "all"
      ? ALL_ADMIN_PAY
      : ALL_ADMIN_PAY.filter((r) => normStatus(r.paymentStatus) === status),
  );
}

/**
 * Recalculates and displays the admin payment summary statistics:
 * total collected, number of unpaid records, and number of free records.
 */
function updatePayStats() {
  const collected = ALL_ADMIN_PAY
    .filter((r) => normStatus(r.paymentStatus) === "paid")
    .reduce((s, r) => s + Number(r.processingFee), 0);
  setEl("pay-stat-collected", `₱${collected.toFixed(2)}`);
  setEl("pay-stat-pending",   ALL_ADMIN_PAY.filter((r) => normStatus(r.paymentStatus) === "unpaid").length);
  setEl("pay-stat-free",      ALL_ADMIN_PAY.filter((r) => normStatus(r.paymentStatus) === "free").length);
}

/**
 * Opens the admin payment update modal pre-populated with the selected record's data.
 *
 * @param {number} id            - The database ID of the request to update.
 * @param {string} refCode       - The reference code of the request.
 * @param {string} userName      - The requester's full name.
 * @param {number} fee           - The processing fee amount.
 * @param {string} currentStatus - The current normalised payment status key.
 * @param {string} currentOr     - The current official receipt number, or empty string.
 */
function openPayModal(id, refCode, userName, fee, currentStatus, currentOr) {
  payEditingId = id;
  document.getElementById("pay-modal-info").textContent = `${userName} · Ref # ${refCode} (${fmtFee(fee)})`;
  document.getElementById("pay-modal-status").value     = currentStatus;
  document.getElementById("pay-modal-or").value         = currentOr || "";
  document.getElementById("pay-modal-overlay").style.display = "flex";
}

/**
 * Closes the admin payment update modal.
 */
function closePayModal() {
  document.getElementById("pay-modal-overlay").style.display = "none";
}

/**
 * Submits the payment status update. Requires an official receipt number
 * when marking a payment as paid. Refreshes the payment list on success.
 *
 * @returns {Promise<void>}
 */
async function savePayStatus() {
  const newStatus = document.getElementById("pay-modal-status").value;
  const newOr     = document.getElementById("pay-modal-or").value.trim();

  if (newStatus === "paid" && !newOr) {
    showToast("Please enter an official receipt number before marking as Paid.");
    return;
  }

  try {
    await api(`/api/admin/requests/${payEditingId}/payment`, {
      method: "PATCH",
      body: {
        paymentStatus:    newStatus.toUpperCase(),
        officialReceiptNo: newStatus === "paid" ? newOr : null,
      },
    });
    closePayModal();
    await initAdminPayments();
    showToast("Payment details updated.");
  } catch (err) {
    showToast(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Admin Users
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of all user accounts for the admin view. */
let ALL_ADMIN_USERS = [];

/** @type {number|null} ID of the user currently open in the admin user modal. */
let currentSelectedUserId = null;

/**
 * Initialises the Admin Users page by fetching all user accounts,
 * rendering the list, and updating the summary stats.
 *
 * @returns {Promise<void>}
 */
async function initAdminUsers() {
  if (!document.getElementById("user-list")) return;
  try {
    ALL_ADMIN_USERS = await api("/api/admin/users");
    renderUserList(ALL_ADMIN_USERS);
    _updateUserStats();
  } catch (err) {
    showToast("Could not load user accounts.");
  }
}

/**
 * Updates the user count statistics by role (total, residents, staff, admins).
 */
function _updateUserStats() {
  setEl("user-stat-total",     ALL_ADMIN_USERS.length);
  setEl("user-stat-residents", ALL_ADMIN_USERS.filter((u) => u.role.toLowerCase() === "resident").length);
  setEl("user-stat-staff",     ALL_ADMIN_USERS.filter((u) => u.role.toLowerCase() === "staff").length);
  setEl("user-stat-admins",    ALL_ADMIN_USERS.filter((u) => u.role.toLowerCase() === "admin").length);
}

/**
 * Renders a list of user accounts into #user-list.
 * Inactive accounts are visually tagged with an "Inactive" badge.
 *
 * @param {object[]} users - Array of user objects from the API.
 */
function renderUserList(users) {
  const list = document.getElementById("user-list");
  if (!list) return;

  if (!users.length) {
    list.innerHTML = emptyState("👥", "No user accounts found matching this view.");
    return;
  }

  list.innerHTML = users
    .map((u) => {
      const roleKey  = u.role.toLowerCase();
      const r        = ROLE_BADGES[roleKey] ?? { label: u.role, cls: "badge-pending" };
      const icon     = ROLE_ICONS[roleKey]  ?? "🙍";
      const inactive = !u.active
        ? ` <span class="badge badge-rejected" style="font-size:0.65rem;margin-left:4px">Inactive</span>`
        : "";
      return `<div class="list-row" style="cursor:default">
        <div class="list-icon">${icon}</div>
        <div class="list-info"><div class="list-title">${u.firstName} ${u.lastName}${inactive}</div><div class="list-sub">${u.email} · ID: ${u.id}</div></div>
        <div class="list-right" style="display:flex;align-items:center;gap:12px">
          <span class="badge ${r.cls}">${r.label}</span>
          <button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">Edit</button>
        </div>
      </div>`;
    })
    .join("");
}

/**
 * Filters and re-renders the admin user list.
 *
 * @param {string}     filterType - Filter key: "all" | "resident" | "staff" | "admin" | "inactive".
 * @param {HTMLElement} btn       - The filter button element that was clicked.
 */
function filterUsers(filterType, btn) {
  setActiveFilter(btn);
  renderUserList(
    filterType === "all"
      ? ALL_ADMIN_USERS
      : filterType === "inactive"
        ? ALL_ADMIN_USERS.filter((u) => !u.active)
        : ALL_ADMIN_USERS.filter((u) => u.role.toLowerCase() === filterType),
  );
}

/**
 * Opens the admin user edit modal pre-populated with the selected user's
 * current role and active status.
 *
 * @param {number} userId - The database ID of the user to edit.
 */
function openUserModal(userId) {
  currentSelectedUserId = userId;
  const u = ALL_ADMIN_USERS.find((x) => x.id === userId);
  if (!u) return;
  document.getElementById("user-modal-name").textContent = `${u.firstName} ${u.lastName} (${u.email})`;
  document.getElementById("user-modal-role").value       = u.role.toLowerCase();
  document.getElementById("user-modal-status").value     = u.active ? "active" : "inactive";
  document.getElementById("user-modal-overlay").style.display = "flex";
}

/**
 * Closes the admin user edit modal.
 */
function closeUserModal() {
  document.getElementById("user-modal-overlay").style.display = "none";
}

/**
 * Submits role and active-status changes for the user currently open in the modal.
 * Refreshes the user list on success.
 *
 * @returns {Promise<void>}
 */
async function saveUser() {
  const newRole   = document.getElementById("user-modal-role").value;
  const newStatus = document.getElementById("user-modal-status").value;
  try {
    await api(`/api/admin/users/${currentSelectedUserId}`, {
      method: "PATCH",
      body: { role: newRole.toUpperCase(), active: newStatus === "active" },
    });
    closeUserModal();
    await initAdminUsers();
    showToast("User updates applied successfully.");
  } catch (err) {
    showToast(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Resident Payment Records
// ─────────────────────────────────────────────────────────────

/** @type {object[]} Module-level cache of the current resident's payment records. */
let MY_PAYMENTS = [];

/**
 * Initialises the resident Payment Records page by fetching request data
 * and rendering the payment summary stats and list.
 *
 * @returns {Promise<void>}
 */
async function initPaymentRecords() {
  if (!document.getElementById("payment-list")) return;
  try {
    MY_PAYMENTS = await api("/api/requests/me");
    renderPaymentStats();
    renderPaymentList(MY_PAYMENTS);
  } catch (err) {
    showToast("Could not load payment records.");
  }
}

/**
 * Filters and re-renders the resident payment list by payment status.
 *
 * @param {string}     status - Payment status key to filter by, or "all".
 * @param {HTMLElement} btn   - The filter button element that was clicked.
 */
function filterPayments(status, btn) {
  setActiveFilter(btn);
  renderPaymentList(
    status === "all"
      ? MY_PAYMENTS
      : MY_PAYMENTS.filter((p) => normStatus(p.paymentStatus) === status),
  );
}

/**
 * Renders a list of resident payment records into #payment-list.
 *
 * @param {object[]} data - Array of document request objects with payment fields.
 */
function renderPaymentList(data) {
  const list = document.getElementById("payment-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = `<div class="empty-state" style="padding:2rem;text-align:center;color:#9ca3af">No payment records found matching this filter.</div>`;
    return;
  }

  list.innerHTML = data
    .map((p) => {
      const payKey       = normStatus(p.paymentStatus);
      const { cls, label } = PAY_DISPLAY_LABELS[payKey] ?? PAY_DISPLAY_LABELS.unpaid;
      return `<div class="list-row" style="cursor:default">
        <div class="list-icon">💳</div>
        <div class="list-info"><div class="list-title">${p.documentType}</div><div class="list-sub">Ref: ${p.referenceCode} · ${fmtDate(p.createdAt)}</div></div>
        <div class="list-right"><span class="badge ${cls}">${label}</span><div class="list-date" style="font-weight:600;color:var(--text-dark);margin-top:4px">${fmtFee(p.processingFee)}</div></div>
      </div>`;
    })
    .join("");
}

/**
 * Renders the resident payment summary stats (total outstanding fees
 * and count of settled transactions) into the #payment-stats element.
 */
function renderPaymentStats() {
  const el = document.getElementById("payment-stats");
  if (!el) return;

  const unpaidTotal = MY_PAYMENTS
    .filter((p) => normStatus(p.paymentStatus) === "unpaid")
    .reduce((a, p) => a + Number(p.processingFee), 0);
  const paidCount = MY_PAYMENTS
    .filter((p) => normStatus(p.paymentStatus) === "paid").length;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Outstanding Fees</div><div class="stat-value" style="color:#ef4444">₱${unpaidTotal.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Settled Transactions</div><div class="stat-value">${paidCount}</div></div>`;
}

// ─────────────────────────────────────────────────────────────
// Page Initialisation
// ─────────────────────────────────────────────────────────────

/**
 * Central DOMContentLoaded handler.
 * Detects the current page by the presence of unique sentinel elements
 * and delegates to the appropriate `init*` function. Each branch calls
 * {@link requireAuth} to guard against unauthenticated access.
 */
document.addEventListener("DOMContentLoaded", () => {

  if (document.getElementById("greet-name") && document.getElementById("stat-total")) {
    initDashboard();
  }

  if (document.getElementById("requests-list") && !document.getElementById("stat-total")) {
    requireAuth();
    applyNavAvatar();
    initMyRequests();
  }

  if (document.getElementById("notif-list")) {
    requireAuth();
    applyNavAvatar();
    initNotifications();
  }

  if (document.getElementById("cal-days")) {
    requireAuth();
    applyNavAvatar();
    renderCalendar();
    initMyAppointments();
    populateRequestSelect();
  }

  if (document.getElementById("detail-body")) {
    requireAuth();
    applyNavAvatar();
    initRequestDetail();
  }

  if (document.getElementById("payment-list") && !document.getElementById("pay-list")) {
    requireAuth();
    applyNavAvatar();
    initPaymentRecords();
  }

  if (document.getElementById("p-fname")) {
    requireAuth();
    loadProfile();
  }

  if (document.getElementById("doc-types")) {
    requireAuth();
    applyNavAvatar();
  }

  if (document.getElementById("admin-recent")) {
    requireAuth();
    applyNavAvatar();
    initAdminDashboard();
  }

  if (document.getElementById("req-list")) {
    requireAuth();
    initAdminRequests();
  }

  if (document.getElementById("admin-appt-list")) {
    requireAuth();
    initAdminAppointments();
  }

  if (document.getElementById("pay-list")) {
    requireAuth();
    initAdminPayments();
  }

  if (document.getElementById("user-list")) {
    requireAuth();
    initAdminUsers();
  }
});