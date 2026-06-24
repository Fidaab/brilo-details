/* BriloDetails - mobile PWA logic. Data via Store (Supabase cloud or local). */

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
    { screen: "gallery", ico: "🎬", label: "Gallery" },
    { screen: "reviews", ico: "⭐", label: "Reviews" },
    { screen: "visits",  ico: "📍", label: "My Visits" },
  ],
  admin: [
    { screen: "jobs",     ico: "🧽", label: "Jobs" },
    { screen: "adgallery",ico: "🎬", label: "Gallery" },
    { screen: "inbox",    ico: "💬", label: "Inbox" },
    { screen: "team",     ico: "👥", label: "Team" },
    { screen: "pricing",  ico: "💲", label: "Pricing" },
  ],
};

/* Service packages, detailers, and reviews are provided by Store (store.js). */


let state = window.Store.data;   // populated by Store.init() below
let currentRole = "customer";
let boardFilter = "all";
let selectedPkgId = null;

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
  if (r.status === "completed")  return `Completed on ${fmtDate(r.date)}. Thanks for choosing BriloDetails.`;
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
      renderForScreen(item.screen);
    });
    nav.appendChild(btn);
  });
  showScreen(NAV[currentRole][0].screen);
}

function renderForScreen(screen) {
  switch (screen) {
    case "reviews": renderReviews(); break;
    case "gallery": renderGallery(); break;
    case "jobs": case "team": case "pricing": case "adgallery": case "inbox": renderAdmin(); break;
  }
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

  Store.addReservation({
    pkgId: selectedPkgId, name, phone, vehicle, address, date, slot, notes,
    status: "requested", detailerId: null,
  });
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
    Store.updateReservation(b.dataset.cancel, { status: "cancelled" });
    toast("Visit cancelled."); renderCustomerReservations();
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

  Store.addReview({ name, rating: selectedRating, vehicle, text, date: new Date().toISOString().slice(0, 10) });
  err.classList.add("hidden");
  document.getElementById("rev-name").value = "";
  document.getElementById("rev-vehicle").value = "";
  document.getElementById("rev-comment").value = "";
  selectedRating = 0; paintStars();
  renderReviews();
  document.getElementById("screens").scrollTop = 0;
  toast("Thanks for your review!");
});

/* ---------- gallery (photos + videos + comments) ---------- */
function isYouTube(url) { return /youtube\.com|youtu\.be/.test(url); }
function ytEmbed(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return "https://www.youtube.com/embed/" + (m ? m[1] : "");
}
function mediaFrameHtml(m) {
  if (m.type === "video") {
    if (isYouTube(m.url)) return `<iframe class="media-frame" src="${esc(ytEmbed(m.url))}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    return `<video class="media-frame" src="${esc(m.url)}" controls preload="metadata" playsinline></video>`;
  }
  return `<img class="media-frame" src="${esc(m.url)}" alt="${esc(m.caption)}" loading="lazy" />`;
}

function renderGallery() {
  const list = document.getElementById("gallery-list");
  const items = [...state.media].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!items.length) { list.innerHTML = `<div class="empty">No work posted yet. Check back soon.</div>`; return; }
  list.innerHTML = "";
  items.forEach(m => {
    const comments = state.mediaComments.filter(c => c.mediaId === m.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const card = document.createElement("div");
    card.className = "media-card";
    card.innerHTML = `
      ${mediaFrameHtml(m)}
      <div class="media-body">
        <div class="media-caption">${esc(m.caption) || (m.type === "video" ? "Video" : "Photo")}</div>
        <div class="comments">${comments.length
          ? comments.map(c => `<div class="comment"><span class="c-name">${esc(c.name) || "Guest"}:</span> <span class="c-text">${esc(c.text)}</span></div>`).join("")
          : `<div class="comment-empty">No comments yet. Be the first.</div>`}</div>
        <div class="comment-form">
          <input type="text" placeholder="Add a comment..." data-cinput="${m.id}" maxlength="200" />
          <button class="btn-primary" data-csend="${m.id}">Post</button>
        </div>
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll("[data-csend]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.csend;
    const inp = list.querySelector(`[data-cinput="${id}"]`);
    const text = inp.value.trim();
    if (!text) { inp.focus(); return; }
    Store.addMediaComment({ mediaId: id, name: "", text });
    inp.value = "";
    renderGallery();
    toast("Comment posted.");
  }));
}

function renderAdminGallery() {
  const list = document.getElementById("admin-gallery-list");
  const items = [...state.media].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!items.length) { list.innerHTML = `<div class="empty">No media yet. Add your first below.</div>`; }
  else {
    list.innerHTML = "";
    items.forEach(m => {
      const cc = state.mediaComments.filter(c => c.mediaId === m.id).length;
      const div = document.createElement("div");
      div.className = "media-card";
      div.innerHTML = `
        ${mediaFrameHtml(m)}
        <div class="media-body">
          <div class="media-caption">${esc(m.caption) || (m.type === "video" ? "Video" : "Photo")}</div>
          <div class="media-meta">${m.type === "video" ? "🎬 Video" : "🖼 Photo"} · ${cc} comment${cc === 1 ? "" : "s"}</div>
          <button class="link-btn" data-delmedia="${m.id}" style="text-align:left;width:auto;margin:0;padding:4px 0;">Remove</button>
        </div>`;
      list.appendChild(div);
    });
  }
  list.querySelectorAll("[data-delmedia]").forEach(b => b.addEventListener("click", () => {
    Store.removeMedia(b.dataset.delmedia);
    renderAdminGallery(); renderGallery(); toast("Media removed.");
  }));
}

document.getElementById("add-media").addEventListener("click", () => {
  const type = document.getElementById("new-media-type").value;
  const url = document.getElementById("new-media-url").value.trim();
  const caption = document.getElementById("new-media-caption").value.trim();
  if (!url) { toast("Enter a media URL."); return; }
  Store.addMedia({ type, url, caption });
  document.getElementById("new-media-url").value = "";
  document.getElementById("new-media-caption").value = "";
  renderAdminGallery(); renderGallery(); toast("Media added.");
});

/* ---------- suggestions ---------- */
function fmtDateTime(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
         d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderSuggestions() {
  const list = document.getElementById("suggestion-list");
  const items = [...state.suggestions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const newCount = items.filter(s => s.status !== "reviewed").length;
  const stats = document.getElementById("inbox-stats");
  if (stats) stats.innerHTML = `<span><b>${items.length}</b> total</span><span><b>${newCount}</b> new</span>`;
  if (!items.length) { list.innerHTML = `<div class="empty">No suggestions yet.</div>`; return; }
  list.innerHTML = "";
  items.forEach(s => {
    const card = document.createElement("div");
    card.className = "res-card";
    card.innerHTML = `
      <div class="res-head">
        <div><div class="res-title">${esc(s.name) || "Anonymous"}</div>
        <div class="res-sub">${s.createdAt ? fmtDateTime(s.createdAt) : ""}</div></div>
        <span class="badge ${s.status === "reviewed" ? "completed" : "requested"}">${s.status === "reviewed" ? "Reviewed" : "New"}</span>
      </div>
      <div class="review-text">${esc(s.message)}</div>
      <div class="res-actions">
        ${s.status !== "reviewed" ? `<button class="btn-primary" data-sugdone="${s.id}">Mark reviewed</button>` : ""}
        <button class="btn-secondary" data-sugdel="${s.id}">Delete</button>
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll("[data-sugdone]").forEach(b => b.addEventListener("click", () => {
    Store.updateSuggestion(b.dataset.sugdone, { status: "reviewed" }); renderSuggestions(); toast("Marked reviewed.");
  }));
  list.querySelectorAll("[data-sugdel]").forEach(b => b.addEventListener("click", () => {
    Store.removeSuggestion(b.dataset.sugdel); renderSuggestions(); toast("Suggestion deleted.");
  }));
}

document.getElementById("submit-suggestion").addEventListener("click", () => {
  const err = document.getElementById("suggestion-error");
  const name = document.getElementById("sug-name").value.trim();
  const message = document.getElementById("sug-message").value.trim();
  if (!message) return showErr(err, "Please write your suggestion.");
  Store.addSuggestion({ name, message });
  err.classList.add("hidden");
  document.getElementById("sug-name").value = "";
  document.getElementById("sug-message").value = "";
  toast("Thanks! Your suggestion was sent.");
});

/* ---------- admin ---------- */
function renderAdmin() { renderBoard(); renderDetailers(); renderPricingEditor(); renderAdminGallery(); renderSuggestions(); }

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
    const patch = { detailerId: sel.value || null };
    if (patch.detailerId && r.status === "requested") patch.status = "assigned";
    if (!patch.detailerId && r.status === "assigned") patch.status = "requested";
    Store.updateReservation(r.id, patch); renderBoard();
    toast(patch.detailerId ? "Detailer assigned." : "Detailer unassigned.");
  }));
  list.querySelectorAll("[data-advance]").forEach(btn => btn.addEventListener("click", () => {
    const r = state.reservations.find(x => x.id === btn.dataset.advance);
    const next = STATUS[r.status].next;
    if ((next === "on_the_way" || next === "assigned") && !r.detailerId) { toast("Assign a detailer first."); return; }
    Store.updateReservation(r.id, { status: next }); renderBoard(); toast(`Status: ${STATUS[next].label}`);
  }));
  list.querySelectorAll("[data-admincancel]").forEach(btn => btn.addEventListener("click", () => {
    Store.updateReservation(btn.dataset.admincancel, { status: "cancelled" });
    renderBoard(); toast("Job cancelled.");
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
    Store.removeDetailer(b.dataset.deldetailer);
    renderAdmin(); toast("Detailer removed.");
  }));
}

document.getElementById("add-detailer").addEventListener("click", () => {
  const name = document.getElementById("new-detailer-name").value.trim();
  const phone = document.getElementById("new-detailer-phone").value.trim();
  if (!name) { toast("Enter a name."); return; }
  Store.addDetailer({ name, phone });
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
    Store.updatePackage(inp.dataset.price, { price: Math.max(0, Number(inp.value) || 0) });
    renderPackages(); toast("Price updated.");
  }));
  grid.querySelectorAll("[data-delpkg]").forEach(b => b.addEventListener("click", () => {
    Store.removePackage(b.dataset.delpkg);
    renderPricingEditor(); renderPackages(); toast("Package removed.");
  }));
}

document.getElementById("add-pkg").addEventListener("click", () => {
  const name = document.getElementById("new-pkg-name").value.trim();
  const price = Number(document.getElementById("new-pkg-price").value);
  const duration = Number(document.getElementById("new-pkg-duration").value) || 60;
  const desc = document.getElementById("new-pkg-desc").value.trim();
  if (!name || isNaN(price)) { toast("Enter a name and price."); return; }
  Store.addPackage({ name, price, duration, desc });
  ["new-pkg-name","new-pkg-price","new-pkg-duration","new-pkg-desc"].forEach(id => document.getElementById(id).value = "");
  renderPricingEditor(); renderPackages(); toast("Package added.");
});

document.getElementById("reset-data").addEventListener("click", () => {
  if (confirm("Reset all demo data back to defaults?")) {
    if (Store.reset()) {
      renderPackages(); renderAdmin();
      document.getElementById("cust-reservations").innerHTML = `<div class="empty">Enter your phone number to see your visits.</div>`;
      toast("Demo data reset.");
    }
  }
});

/* ---------- utils ---------- */
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* Re-render everything currently on screen (called on realtime updates). */
function rerender() {
  if (!state) return;
  renderPackages();
  renderReviews();
  renderGallery();
  if (currentRole === "admin") renderAdmin();
  renderCustomerReservations();
}

/* ---------- init ---------- */
document.getElementById("cust-reservations").innerHTML = `<div class="empty">Enter your phone number to see your visits.</div>`;

Store.init(rerender).then(({ cloud }) => {
  state = Store.data;
  document.querySelector(".brand-sub").textContent = cloud ? "Mobile detailing · Live" : "Mobile detailing";
  renderPackages();
  buildNav();
  buildStarInput();
}).catch(err => { console.error(err); toast("Could not load data."); });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
