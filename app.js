/* Brilo Details - mobile PWA logic. Data persists in localStorage. */

const STORE_KEY = "brilo.v1";

const STATUS = {
  requested:  { label: "Requested",  next: "assigned" },
  assigned:   { label: "Assigned",   next: "on_the_way" },
  on_the_way: { label: "En route",   next: "completed" },
  completed:  { label: "Completed",  next: null },
  cancelled:  { label: "Cancelled",  next: null },
};

const SLOT_LABELS = {
  "08:00": "8:00 AM", "10:00": "10:00 AM", "12:00": "12:00 PM",
  "14:00": "2:00 PM", "16:00": "4:00 PM",
};

const NAV = {
  customer: [
    { screen: "book",    ico: "✨", label: "Book" },
    { screen: "reviews", ico: "⭐", label: "Reviews" },
    { screen: "visits",  ico: "📍", label: "My Visits" },
  ],
  admin: [
    { screen: "jobs",    ico: "🧽", label: "Jobs" },
    { screen: "team",    ico: "👥", label: "Team" },
    { screen: "pricing", ico: "💲", label: "Pricing" },
  ],
};

const seed = {
  packages: [
    { id: "p1", name: "Express Wash",     price: 49,  duration: 45,  desc: "Exterior hand wash, dry, and tire shine." },
    { id: "p2", name: "Interior Refresh", price: 89,  duration: 90,  desc: "Full vacuum, wipe-down, glass, and air freshener." },
    { id: "p3", name: "Full Detail",      price: 179, duration: 180, desc: "Interior and exterior deep clean, wax, and trim restore." },
    { id: "p4", name: "Ceramic Coat",     price: 449, duration: 300, desc: "Paint correction plus 12-month ceramic coating." },
  ],
  detailers: [
    { id: "d1", name: "Carlos R.", phone: "555-0123" },
    { id: "d2", name: "Maya T.",   phone: "555-0144" },
  ],
  reviews: [
    { id: "r1", name: "Marcus L.", rating: 5, vehicle: "Tesla Model 3", text: "Paint looks brand new. Carlos showed up on time and was incredibly thorough.", date: "2026-06-19" },
    { id: "r2", name: "Priya S.",  rating: 5, vehicle: "Honda CR-V",    text: "Interior refresh was amazing. Smells great and not a speck of dust left.", date: "2026-06-17" },
    { id: "r3", name: "Dan W.",    rating: 4, vehicle: "Ford F-150",    text: "Great wash and the tire shine really pops. Would book again.", date: "2026-06-15" },
  ],
  reservations: [],
};

let state = load();
if (!Array.isArray(state.reviews)) state.reviews = structuredClone(seed.reviews);
let currentRole = "customer";
let boardFilter = "all";
let selectedPkgId = null;

function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return structuredClone(seed);
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function uid() { return Math.random().toString(36).slice(2, 9); }
function pkgById(id) { return state.packages.find(p => p.id === id); }
function detailerById(id) { return state.detailers.find(d => d.id === id); }

/* ---------- dates (weekday only) ---------- */
function isWeekend(s) { const d = new Date(s + "T00:00:00"); return d.getDay() === 0 || d.getDay() === 6; }
function fmtDate(s) { return new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
function nextWeekdayISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function arrivalText(r) {
  const start = SLOT_LABELS[r.slot] || r.slot;
  const name = detailerById(r.detailerId)?.name || "";
  if (r.status === "on_the_way") return `Your detailer ${name} is on the way. Arriving around ${start}.`;
  if (r.status === "assigned")   return `${name || "A detailer"} is scheduled to arrive ${fmtDate(r.date)} at ${start}.`;
  if (r.status === "completed")  return `Completed on ${fmtDate(r.date)}. Thanks for choosing Brilo.`;
  if (r.status === "requested")  return `Requested for ${fmtDate(r.date)} at ${start}. Awaiting detailer assignment.`;
  return "Reservation cancelled.";
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

/* ---------- navigation ---------- */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.dataset.screen === name));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.screen === name));
  document.getElementById("screens").scrollTop = 0;
}

function buildNav() {
  const nav = document.getElementById("bottom-nav");
  nav.innerHTML = "";
  NAV[currentRole].forEach((item, i) => {
    const btn = document.createElement("button");
    btn.className = "nav-item" + (i === 0 ? " active" : "");
    btn.dataset.screen = item.screen;
    btn.innerHTML = `<span class="nav-ico">${item.ico}</span>${item.label}`;
    btn.addEventListener("click", () => {
      showScreen(item.screen);
      if (currentRole === "admin") renderAdmin();
      if (item.screen === "reviews") renderReviews();
    });
    nav.appendChild(btn);
  });
  showScreen(NAV[currentRole][0].screen);
}

document.querySelectorAll(".role-opt").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".role-opt").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRole = btn.dataset.role;
    buildNav();
    if (currentRole === "admin") renderAdmin();
  });
});

document.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => showScreen(b.dataset.back)));

/* ---------- customer: packages ---------- */
function renderPackages() {
  const list = document.getElementById("package-list");
  list.innerHTML = "";
  state.packages.forEach(p => {
    const div = document.createElement("div");
    div.className = "pkg-card selectable";
    div.innerHTML = `
      <div class="pkg-top"><span class="pkg-name">${esc(p.name)}</span><span class="pkg-price">$${p.price}</span></div>
      <div class="pkg-desc">${esc(p.desc)}</div>
      <div class="pkg-meta">~${p.duration} min</div>`;
    div.addEventListener("click", () => openBooking(p.id));
    list.appendChild(div);
  });
}

function openBooking(pkgId) {
  selectedPkgId = pkgId;
  const p = pkgById(pkgId);
  document.getElementById("selected-pkg-name").textContent = p.name;
  document.getElementById("selected-pkg-price").textContent = "$" + p.price;
  const dateInput = document.getElementById("cust-date");
  dateInput.min = nextWeekdayISO();
  dateInput.value = nextWeekdayISO();
  document.getElementById("booking-error").classList.add("hidden");
  showScreen("bookform");
}

document.getElementById("submit-booking").addEventListener("click", () => {
  const err = document.getElementById("booking-error");
  const get = id => document.getElementById(id).value.trim();
  const name = get("cust-name"), phone = get("cust-phone"), vehicle = get("cust-vehicle");
  const address = get("cust-address"), date = get("cust-date"), slot = get("cust-slot"), notes = get("cust-notes");

  if (!name || !phone || !vehicle || !address || !date)
    return showErr(err, "Please fill in name, phone, vehicle, address, and date.");
  if (isWeekend(date))
    return showErr(err, "We only book on weekdays (Monday to Friday). Please pick a weekday.");

  state.reservations.push({
    id: uid(), pkgId: selectedPkgId, name, phone, vehicle, address, date, slot, notes,
    status: "requested", detailerId: null, createdAt: Date.now(),
  });
  save();
  toast("Reservation confirmed. We'll assign a detailer shortly.");
  ["cust-name","cust-vehicle","cust-address","cust-notes"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("lookup-phone").value = phone;
  selectedPkgId = null;
  showScreen("visits");
  renderCustomerReservations();
});

function showErr(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }

/* ---------- customer: my visits ---------- */
document.getElementById("lookup-btn").addEventListener("click", renderCustomerReservations);
document.getElementById("lookup-phone").addEventListener("keydown", e => { if (e.key === "Enter") renderCustomerReservations(); });

function renderCustomerReservations() {
  const phone = document.getElementById("lookup-phone").value.trim();
  const list = document.getElementById("cust-reservations");
  if (!phone) { list.innerHTML = `<div class="empty">Enter your phone number to see your visits.</div>`; return; }
  const mine = state.reservations.filter(r => r.phone === phone).sort((a, b) => b.createdAt - a.createdAt);
  if (!mine.length) { list.innerHTML = `<div class="empty">No visits found for that number.</div>`; return; }

  list.innerHTML = "";
  mine.forEach(r => {
    const p = pkgById(r.pkgId);
    const card = document.createElement("div");
    card.className = "res-card";
    const canCancel = r.status === "requested" || r.status === "assigned";
    card.innerHTML = `
      <div class="res-head">
        <div><div class="res-title">${esc(p?.name || "Service")} <span class="price-tag">$${p?.price ?? ""}</span></div>
        <div class="res-sub">${esc(r.vehicle)}</div></div>
        <span class="badge ${r.status}">${STATUS[r.status].label}</span>
      </div>
      <div class="eta-banner">${esc(arrivalText(r))}</div>
      <div class="res-grid">
        <div><div class="k">Date</div>${fmtDate(r.date)}</div>
        <div><div class="k">Time</div>${SLOT_LABELS[r.slot] || r.slot}</div>
        <div><div class="k">Address</div>${esc(r.address)}</div>
        <div><div class="k">Detailer</div>${r.detailerId ? esc(detailerById(r.detailerId)?.name || "-") : "Not yet assigned"}</div>
      </div>
      ${canCancel ? `<div class="res-actions"><button class="btn-secondary" data-cancel="${r.id}">Cancel visit</button></div>` : ""}
      ${r.status === "completed" ? `<div class="res-actions"><button class="btn-primary" data-review="${r.id}">Leave a review</button></div>` : ""}`;
    list.appendChild(card);
  });
  list.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => {
    state.reservations.find(x => x.id === b.dataset.cancel).status = "cancelled";
    save(); toast("Visit cancelled."); renderCustomerReservations();
  }));
  list.querySelectorAll("[data-review]").forEach(b => b.addEventListener("click", () => {
    const r = state.reservations.find(x => x.id === b.dataset.review);
    document.getElementById("rev-name").value = r.name || "";
    document.getElementById("rev-vehicle").value = r.vehicle || "";
    selectedRating = 0; paintStars();
    showScreen("reviews"); renderReviews();
    document.getElementById("rev-comment").focus();
  }));
}

/* ---------- reviews ---------- */
let selectedRating = 0;

function starsHtml(rating) {
  let out = "";
  for (let i = 1; i <= 5; i++) out += i <= rating ? "★" : `<span class="empty">★</span>`;
  return out;
}

function buildStarInput() {
  const box = document.getElementById("rev-stars");
  box.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement("span");
    s.className = "star";
    s.textContent = "★";
    s.dataset.val = i;
    s.setAttribute("role", "radio");
    s.addEventListener("click", () => { selectedRating = i; paintStars(); });
    box.appendChild(s);
  }
  paintStars();
}
function paintStars() {
  document.querySelectorAll("#rev-stars .star").forEach(s =>
    s.classList.toggle("on", Number(s.dataset.val) <= selectedRating));
}

function renderReviews() {
  const list = document.getElementById("reviews-list");
  const summary = document.getElementById("reviews-summary");
  const all = [...state.reviews].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (all.length) {
    const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
    summary.innerHTML = `
      <div><div class="avg">${avg.toFixed(1)}</div></div>
      <div>
        <div class="avg-stars">${starsHtml(Math.round(avg))}</div>
        <div class="avg-count">${all.length} review${all.length === 1 ? "" : "s"}</div>
      </div>`;
  } else {
    summary.innerHTML = `<div class="avg-count">No reviews yet. Be the first to leave one.</div>`;
  }

  list.innerHTML = "";
  all.forEach(r => {
    const div = document.createElement("div");
    div.className = "review-card";
    div.innerHTML = `
      <div class="review-head">
        <div><div class="review-name">${esc(r.name)}</div>
        <div class="review-meta">${esc(r.vehicle) || ""}${r.vehicle && r.date ? " · " : ""}${r.date ? fmtDate(r.date) : ""}</div></div>
        <div class="review-stars">${starsHtml(r.rating)}</div>
      </div>
      <div class="review-text">${esc(r.text)}</div>`;
    list.appendChild(div);
  });
}

document.getElementById("submit-review").addEventListener("click", () => {
  const err = document.getElementById("review-error");
  const name = document.getElementById("rev-name").value.trim();
  const vehicle = document.getElementById("rev-vehicle").value.trim();
  const text = document.getElementById("rev-comment").value.trim();
  if (!name || !text) return showErr(err, "Please add your name and a comment.");
  if (!selectedRating) return showErr(err, "Please tap a star rating.");

  state.reviews.push({ id: uid(), name, rating: selectedRating, vehicle, text, date: new Date().toISOString().slice(0, 10) });
  save();
  err.classList.add("hidden");
  document.getElementById("rev-name").value = "";
  document.getElementById("rev-vehicle").value = "";
  document.getElementById("rev-comment").value = "";
  selectedRating = 0; paintStars();
  renderReviews();
  document.getElementById("screens").scrollTop = 0;
  toast("Thanks for your review!");
});

/* ---------- admin ---------- */
function renderAdmin() { renderBoard(); renderDetailers(); renderPricingEditor(); }

document.querySelectorAll("#filter-row .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#filter-row .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    boardFilter = chip.dataset.filter;
    renderBoard();
  });
});

function renderBoard() {
  const list = document.getElementById("admin-reservations");
  const all = [...state.reservations].sort((a, b) => b.createdAt - a.createdAt);
  const count = s => all.filter(r => r.status === s).length;
  document.getElementById("admin-stats").innerHTML =
    `<span><b>${all.length}</b> total</span><span><b>${count("requested")}</b> requested</span>` +
    `<span><b>${count("on_the_way")}</b> en route</span><span><b>${count("completed")}</b> done</span>`;

  const rows = boardFilter === "all" ? all : all.filter(r => r.status === boardFilter);
  if (!rows.length) { list.innerHTML = `<div class="empty">No jobs in this view.</div>`; return; }

  list.innerHTML = "";
  rows.forEach(r => {
    const p = pkgById(r.pkgId);
    const card = document.createElement("div");
    card.className = "res-card";
    const opts = state.detailers.map(d => `<option value="${d.id}" ${r.detailerId === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("");
    const next = STATUS[r.status].next;
    card.innerHTML = `
      <div class="res-head">
        <div><div class="res-title">${esc(r.name)} · ${esc(p?.name || "Service")} <span class="price-tag">$${p?.price ?? ""}</span></div>
        <div class="res-sub">${esc(r.vehicle)} · ${esc(r.phone)}</div></div>
        <span class="badge ${r.status}">${STATUS[r.status].label}</span>
      </div>
      <div class="res-grid">
        <div><div class="k">Date</div>${fmtDate(r.date)}</div>
        <div><div class="k">Time</div>${SLOT_LABELS[r.slot] || r.slot}</div>
        <div><div class="k">Address</div>${esc(r.address)}</div>
        <div><div class="k">Notes</div>${esc(r.notes) || "-"}</div>
      </div>
      <div class="res-actions">
        <select data-assign="${r.id}"><option value="">Unassigned</option>${opts}</select>
        ${next ? `<button class="btn-primary" data-advance="${r.id}">Mark ${STATUS[next].label}</button>` : ""}
        ${r.status !== "cancelled" && r.status !== "completed" ? `<button class="btn-secondary" data-admincancel="${r.id}">Cancel</button>` : ""}
      </div>`;
    list.appendChild(card);
  });

  list.querySelectorAll("[data-assign]").forEach(sel => sel.addEventListener("change", () => {
    const r = state.reservations.find(x => x.id === sel.dataset.assign);
    r.detailerId = sel.value || null;
    if (r.detailerId && r.status === "requested") r.status = "assigned";
    if (!r.detailerId && r.status === "assigned") r.status = "requested";
    save(); renderBoard();
    toast(r.detailerId ? "Detailer assigned." : "Detailer unassigned.");
  }));
  list.querySelectorAll("[data-advance]").forEach(btn => btn.addEventListener("click", () => {
    const r = state.reservations.find(x => x.id === btn.dataset.advance);
    const next = STATUS[r.status].next;
    if ((next === "on_the_way" || next === "assigned") && !r.detailerId) { toast("Assign a detailer first."); return; }
    r.status = next; save(); renderBoard(); toast(`Status: ${STATUS[next].label}`);
  }));
  list.querySelectorAll("[data-admincancel]").forEach(btn => btn.addEventListener("click", () => {
    state.reservations.find(x => x.id === btn.dataset.admincancel).status = "cancelled";
    save(); renderBoard(); toast("Job cancelled.");
  }));
}

function renderDetailers() {
  const grid = document.getElementById("detailer-list");
  grid.innerHTML = "";
  if (!state.detailers.length) grid.innerHTML = `<div class="empty">No detailers yet.</div>`;
  state.detailers.forEach(d => {
    const active = state.reservations.filter(r => r.detailerId === d.id && (r.status === "assigned" || r.status === "on_the_way")).length;
    const div = document.createElement("div");
    div.className = "pkg-card";
    div.innerHTML = `
      <div class="pkg-top"><span class="pkg-name">${esc(d.name)}</span><span class="pkg-meta">${active} active job${active === 1 ? "" : "s"}</span></div>
      <div class="pkg-desc">${esc(d.phone)}</div>
      <button class="link-btn" data-deldetailer="${d.id}" style="text-align:left;width:auto;margin:0;padding:4px 0;">Remove</button>`;
    grid.appendChild(div);
  });
  grid.querySelectorAll("[data-deldetailer]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.deldetailer;
    state.detailers = state.detailers.filter(d => d.id !== id);
    state.reservations.forEach(r => { if (r.detailerId === id) { r.detailerId = null; if (r.status === "assigned") r.status = "requested"; } });
    save(); renderAdmin(); toast("Detailer removed.");
  }));
}

document.getElementById("add-detailer").addEventListener("click", () => {
  const name = document.getElementById("new-detailer-name").value.trim();
  const phone = document.getElementById("new-detailer-phone").value.trim();
  if (!name) { toast("Enter a name."); return; }
  state.detailers.push({ id: uid(), name, phone }); save();
  document.getElementById("new-detailer-name").value = "";
  document.getElementById("new-detailer-phone").value = "";
  renderDetailers(); toast("Detailer added.");
});

function renderPricingEditor() {
  const grid = document.getElementById("pricing-editor");
  grid.innerHTML = "";
  state.packages.forEach(p => {
    const div = document.createElement("div");
    div.className = "pkg-card";
    div.innerHTML = `
      <div class="pkg-top"><span class="pkg-name">${esc(p.name)}</span>
        <span class="pkg-price">$<input type="number" value="${p.price}" min="0" data-price="${p.id}" style="width:84px;display:inline-block;padding:6px 8px;"></span></div>
      <div class="pkg-desc">${esc(p.desc)}</div>
      <div class="pkg-meta">~${p.duration} min</div>
      <button class="link-btn" data-delpkg="${p.id}" style="text-align:left;width:auto;margin:0;padding:4px 0;">Remove package</button>`;
    grid.appendChild(div);
  });
  grid.querySelectorAll("[data-price]").forEach(inp => inp.addEventListener("change", () => {
    pkgById(inp.dataset.price).price = Math.max(0, Number(inp.value) || 0);
    save(); renderPackages(); toast("Price updated.");
  }));
  grid.querySelectorAll("[data-delpkg]").forEach(b => b.addEventListener("click", () => {
    state.packages = state.packages.filter(p => p.id !== b.dataset.delpkg);
    save(); renderPricingEditor(); renderPackages(); toast("Package removed.");
  }));
}

document.getElementById("add-pkg").addEventListener("click", () => {
  const name = document.getElementById("new-pkg-name").value.trim();
  const price = Number(document.getElementById("new-pkg-price").value);
  const duration = Number(document.getElementById("new-pkg-duration").value) || 60;
  const desc = document.getElementById("new-pkg-desc").value.trim();
  if (!name || isNaN(price)) { toast("Enter a name and price."); return; }
  state.packages.push({ id: uid(), name, price, duration, desc }); save();
  ["new-pkg-name","new-pkg-price","new-pkg-duration","new-pkg-desc"].forEach(id => document.getElementById(id).value = "");
  renderPricingEditor(); renderPackages(); toast("Package added.");
});

document.getElementById("reset-data").addEventListener("click", () => {
  if (confirm("Reset all demo data back to defaults?")) {
    state = structuredClone(seed); save();
    renderPackages(); renderAdmin();
    document.getElementById("cust-reservations").innerHTML = `<div class="empty">Enter your phone number to see your visits.</div>`;
    toast("Demo data reset.");
  }
});

/* ---------- utils ---------- */
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* ---------- init ---------- */
renderPackages();
buildNav();
buildStarInput();
document.getElementById("cust-reservations").innerHTML = `<div class="empty">Enter your phone number to see your visits.</div>`;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
