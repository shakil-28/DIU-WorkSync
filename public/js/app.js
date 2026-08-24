// DIU WorkSync - API Client
const API = "/api";

// Auth Session
const Session = {
  async login(email, password) {
    try {
      const r = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await r.json();
      if (r.ok) { localStorage.setItem("ws_user", JSON.stringify(data)); return { success: true, user: data }; }
      return { success: false, error: data.error };
    } catch (e) { return { success: false, error: e.message }; }
  },
  async register(name, email, password, role) {
    try {
      const r = await fetch(API + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
        credentials: "include",
      });
      const data = await r.json();
      if (r.ok) return { success: true, user: data };
      return { success: false, error: data.error };
    } catch (e) { return { success: false, error: e.message }; }
  },
  async logout() {
    localStorage.removeItem("ws_user"); await fetch(API + "/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/index.html";
  },
  get() {
    // Try localStorage first (most reliable), then cookie fallback
    const local = localStorage.getItem("ws_user");
    if (local) { try { return JSON.parse(local); } catch {} }
    const m = document.cookie.match(/(?:^|; )session=([^;]*)/);
    if (m) { try { return JSON.parse(Buffer.from(m[1], "base64").toString()); } catch {} }
    return null;
  },
  isAuthenticated() { return !!this.get(); },
  isTeacher() { const s = this.get(); return s?.role === "teacher"; },
  isStudent() { const s = this.get(); return s?.role === "student"; },
  async refresh() {
    try {
      const r = await fetch(API + "/auth/me", { credentials: "include" });
      if (r.ok) { const d = await r.json(); localStorage.setItem("ws_user", JSON.stringify(d)); return d; }
    } catch (e) {}
    return null;
  },
};



async function apiFetch(endpoint, options = {}) {
  const opts = { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "include" };
  const r = await fetch(API + endpoint, opts);
  if (r.status === 401) { window.location.href = "/index.html"; return null; }
  return r.json();
}

function requireAuth() { if (!Session.isAuthenticated()) window.location.href = "/index.html"; }
function requireRole(role) {
  requireAuth();
  const s = Session.get();
  if (role === "teacher" && s?.role !== "teacher") window.location.href = "/pages/student/dashboard.html";
  if (role === "student" && s?.role !== "student") window.location.href = "/pages/teacher/dashboard.html";
}

function $(s) { return document.querySelector(s); }
function $$ (s) { return document.querySelectorAll(s); }
function escapeHtml(s) { if (!s) return ""; return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function formatDate(d) { if (!d) return "-"; return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatDateTime(d) { if (!d) return "-"; return new Date(d).toLocaleString(); }
function getStatusClass(s) {
  const m = { "Not Started": "badge-notstarted", "In Progress": "badge-inprogress", Completed: "badge-completed", Overdue: "badge-overdue", Approved: "badge-approved", Rejected: "badge-rejected", "Revision Requested": "badge-revision", Pending: "badge-pending", Active: "badge-active" };
  return m[s] || "badge-pending";
}
function getPriorityClass(p) { return { High: "priority-high", Medium: "priority-medium", Low: "priority-low" }[p] || ""; }
function showNotif(msg, type = "info") {
  const div = document.createElement("div"); div.className = "alert alert-" + type; div.textContent = msg;
  const c = document.querySelector(".main-content") || document.body; c.insertBefore(div, c.firstChild);
  setTimeout(() => div.remove(), 4000);
}

function initSidebar() {
  const h = $("#hamburgerBtn"), s = $("#sidebar");
  if (h && s) {
    h.addEventListener("click", () => s.classList.toggle("open"));
    document.addEventListener("click", (e) => { if (!s.contains(e.target) && !h.contains(e.target)) s.classList.remove("open"); });
  }
}

function initTheme() {
  const t = $("#themeToggle"), i = t?.querySelector("i"), s = localStorage.getItem("ws_theme");
  if (s === "dark") { document.body.classList.add("dark-mode"); if (i) { i.classList.replace("fa-moon", "fa-sun"); } }
  if (t) {
    t.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const d = document.body.classList.contains("dark-mode");
      localStorage.setItem("ws_theme", d ? "dark" : "light");
      if (i) { i.classList.toggle("fa-moon", !d); i.classList.toggle("fa-sun", d); }
    });
  }
}

function initNavbar() {
  const s = Session.get();
  if (s) {
    const nameEl = $("#userName"), roleEl = $("#roleBadge");
    if (nameEl) nameEl.textContent = s.name;
    if (roleEl) { roleEl.textContent = s.role === "teacher" ? "Teacher" : "Student"; roleEl.className = "role-badge role-" + s.role; }
  }
}

document.addEventListener("DOMContentLoaded", () => { initSidebar(); initTheme(); initNavbar(); });

// Search & Filter Helpers
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function updateUrlParams(params) {
  const url = new URL(window.location);
  Object.keys(params).forEach(k => {
    if (params[k] === null || params[k] === '') url.searchParams.delete(k);
    else url.searchParams.set(k, params[k]);
  });
  window.history.replaceState({}, '', url);
}

// Pagination
function renderPagination(currentPage, totalPages, onPageChange) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  html += '<button class="page-btn" ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="(' + onPageChange + ')(prev)"><i class="fas fa-chevron-left"></i></button>';
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);
  if (start > 1) { html += '<button class="page-btn" onclick="(' + onPageChange + ')(1)">1</button>'; if (start > 2) html += '<span class="page-info">...</span>'; }
  for (let i = start; i <= end; i++) {
    html += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" onclick="(' + onPageChange + ')(' + i + ')">' + i + '</button>';
  }
  if (end < totalPages) { if (end < totalPages - 1) html += '<span class="page-info">...</span>'; html += '<button class="page-btn" onclick="(' + onPageChange + ')(' + totalPages + ')">' + totalPages + '</button>'; }
  html += '<button class="page-btn" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="(' + onPageChange + ')(next)"><i class="fas fa-chevron-right"></i></button>';
  html += '</div>';
  return html;
}

function getPagination(page, total, perPage) {
  return Math.max(1, Math.min(Math.ceil(total / perPage), page));
}

// Search filter
function searchFilter(items, query, fields) {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
}

// Filter by field
function filterBy(items, field, value) {
  if (!value) return items;
  return items.filter(item => String(item[field] || '').toLowerCase() === value.toLowerCase());
}

// Combined: search + filters + pagination
function applyFilters(items, query, filters, page, perPage) {
  let result = searchFilter(items, query, filters.searchFields || ['title', 'name', 'course_code', 'project_name']);
  if (filters.status) result = result.filter(i => i.status === filters.status);
  if (filters.priority) result = result.filter(i => i.priority === filters.priority);
  if (filters.course) result = result.filter(i => i.course_code === filters.course);
  const total = result.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  return { items: result.slice(start, start + perPage), total, page: safePage, totalPages };
}
