/* BriloDetails - data store.
 * Works in two modes:
 *   - Cloud mode (Supabase): shared, real-time data across every device.
 *   - Local mode (localStorage): single-device fallback when no keys are set.
 * The rest of the app reads Store.data and calls Store.* to mutate.
 */
(function () {
  const cfg = window.BRILO_CONFIG || {};
  const CLOUD = !!(
    cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !/YOUR_/.test(cfg.supabaseUrl) && !/YOUR_/.test(cfg.supabaseAnonKey) &&
    window.supabase
  );

  const LOCAL_KEY = "brilo.v1";

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
    media: [
      { id: "m1", type: "image", url: "https://picsum.photos/seed/brilo-detail-1/800/500", caption: "Full Detail · Tesla Model 3", createdAt: 1 },
      { id: "m2", type: "image", url: "https://picsum.photos/seed/brilo-detail-2/800/500", caption: "Interior Refresh · Honda CR-V", createdAt: 2 },
      { id: "m3", type: "video", url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4", caption: "Ceramic coat in action", createdAt: 3 },
    ],
    mediaComments: [
      { id: "mc1", mediaId: "m1", name: "Marcus L.", text: "That shine is unreal!", createdAt: 4 },
    ],
    suggestions: [],
    jobNotes: [],
    maintenanceReminders: [],
    maintenancePlans: [],
  };

  /* Single, stable data object the app reads. Arrays are mutated in place so
     existing references (e.g. app's `state`) stay valid across refetches. */
  const data = { packages: [], detailers: [], reservations: [], reviews: [], media: [], mediaComments: [], suggestions: [], jobNotes: [], maintenanceReminders: [], maintenancePlans: [] };
  let onChange = () => {};
  let sb = null;
  let adminAuthed = false;
  let authCb = null;

  /* ---------- row <-> app object mapping ---------- */
  const fromPkg = p => ({ id: p.id, name: p.name, price: Number(p.price), duration: p.duration, desc: p.description || "" });
  const toPkg   = p => ({ id: p.id, name: p.name, price: p.price, duration: p.duration, description: p.desc || "" });
  const fromDet = d => ({ id: d.id, name: d.name, phone: d.phone || "" });
  const fromRes = r => ({ id: r.id, pkgId: r.pkg_id, name: r.name, phone: r.phone, vehicle: r.vehicle, address: r.address,
                          date: r.date, slot: r.slot, notes: r.notes, status: r.status, detailerId: r.detailer_id,
                          createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now() });
  const toRes   = r => ({ id: r.id, pkg_id: r.pkgId, name: r.name, phone: r.phone, vehicle: r.vehicle, address: r.address,
                          date: r.date, slot: r.slot, notes: r.notes, status: r.status, detailer_id: r.detailerId || null });
  const fromRev = r => ({ id: r.id, name: r.name, rating: r.rating, vehicle: r.vehicle || "", text: r.comment, date: r.date });
  const toRev   = r => ({ id: r.id, name: r.name, rating: r.rating, vehicle: r.vehicle || "", comment: r.text, date: r.date });
  const fromMedia = m => ({ id: m.id, type: m.type || "image", url: m.url, caption: m.caption || "", createdAt: m.created_at ? new Date(m.created_at).getTime() : Date.now() });
  const toMedia   = m => ({ id: m.id, type: m.type || "image", url: m.url, caption: m.caption || "" });
  const fromComment = c => ({ id: c.id, mediaId: c.media_id, name: c.name || "", text: c.text, createdAt: c.created_at ? new Date(c.created_at).getTime() : Date.now() });
  const toComment   = c => ({ id: c.id, media_id: c.mediaId, name: c.name || "", text: c.text });
  const fromSug = s => ({ id: s.id, name: s.name || "", message: s.message, status: s.status || "new", createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now() });
  const toSug   = s => ({ id: s.id, name: s.name || "", message: s.message, status: s.status || "new" });
  const fromNote = n => ({ id: n.id, reservationId: n.reservation_id, author: n.author || "customer", name: n.name || "", text: n.text, createdAt: n.created_at ? new Date(n.created_at).getTime() : Date.now() });
  const toNote   = n => ({ id: n.id, reservation_id: n.reservationId, author: n.author || "customer", name: n.name || "", text: n.text });
  const fromRem = r => ({ id: r.id, phone: r.phone, name: r.name || "", vehicle: r.vehicle || "", message: r.message, pkgId: r.pkg_id, status: r.status || "sent", createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now() });
  const toRem   = r => ({ id: r.id, phone: r.phone, name: r.name || "", vehicle: r.vehicle || "", message: r.message, pkg_id: r.pkgId || null, status: r.status || "sent" });
  const fromPlan = p => ({ id: p.id, phone: p.phone, name: p.name || "", vehicle: p.vehicle || "", pkgId: p.pkg_id, intervalWeeks: p.interval_weeks || 4, nextDue: p.next_due || null, active: p.active !== false, createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now() });
  const toPlan   = p => ({ id: p.id, phone: p.phone, name: p.name || "", vehicle: p.vehicle || "", pkg_id: p.pkgId || null, interval_weeks: p.intervalWeeks || 4, next_due: p.nextDue || null, active: p.active !== false });

  function replace(arr, items) { arr.length = 0; items.forEach(i => arr.push(i)); }
  function newId() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function notify(msg) { console.error("[Brilo sync]", msg); if (window.toast) window.toast("Sync error: " + msg); }

  /* ---------- local persistence ---------- */
  function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) {} }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (!Array.isArray(o.reviews)) o.reviews = JSON.parse(JSON.stringify(seed.reviews));
        if (!Array.isArray(o.media)) o.media = JSON.parse(JSON.stringify(seed.media));
        if (!Array.isArray(o.mediaComments)) o.mediaComments = JSON.parse(JSON.stringify(seed.mediaComments));
        if (!Array.isArray(o.suggestions)) o.suggestions = [];
        if (!Array.isArray(o.jobNotes)) o.jobNotes = [];
        if (!Array.isArray(o.maintenanceReminders)) o.maintenanceReminders = [];
        if (!Array.isArray(o.maintenancePlans)) o.maintenancePlans = [];
        return o;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(seed));
  }

  /* ---------- cloud helpers ----------
     NOTE: select explicit columns, never "*". On Supabase/PostgREST, "select=*"
     can return incomplete rows on recently-created tables (stale "*" expansion
     in the schema cache), which silently drops data. Explicit columns are reliable. */
  async function refetchAll() {
    const [pk, dt, rs, rv, md, mc, sg, jn, mr, mp] = await Promise.all([
      sb.from("packages").select("id,name,price,duration,description").order("price", { ascending: true }),
      sb.from("detailers").select("id,name,phone").order("name", { ascending: true }),
      sb.from("reservations").select("id,pkg_id,name,phone,vehicle,address,date,slot,notes,status,detailer_id,created_at"),
      sb.from("reviews").select("id,name,rating,vehicle,comment,date"),
      sb.from("media").select("id,type,url,caption,created_at"),
      sb.from("media_comments").select("id,media_id,name,text,created_at"),
      sb.from("suggestions").select("id,name,message,status,created_at"),
      sb.from("job_notes").select("id,reservation_id,author,name,text,created_at"),
      sb.from("maintenance_reminders").select("id,phone,name,vehicle,message,pkg_id,status,created_at"),
      sb.from("maintenance_plans").select("id,phone,name,vehicle,pkg_id,interval_weeks,next_due,active,created_at"),
    ]);
    if (pk.data) replace(data.packages, pk.data.map(fromPkg));
    if (dt.data) replace(data.detailers, dt.data.map(fromDet));
    if (rs.data) replace(data.reservations, rs.data.map(fromRes));
    if (rv.data) replace(data.reviews, rv.data.map(fromRev));
    if (md.data) replace(data.media, md.data.map(fromMedia));
    if (mc.data) replace(data.mediaComments, mc.data.map(fromComment));
    if (sg.data) replace(data.suggestions, sg.data.map(fromSug));
    if (jn.data) replace(data.jobNotes, jn.data.map(fromNote));
    if (mr.data) replace(data.maintenanceReminders, mr.data.map(fromRem));
    if (mp.data) replace(data.maintenancePlans, mp.data.map(fromPlan));
  }
  /* A write that affects 0 rows with no error means RLS silently rejected it
     (PostgREST returns 200 + []). For admin actions that almost always means the
     Admin session is missing or expired. Tell the user and revert the optimistic
     change so the UI reflects what actually persisted. */
  function blocked() {
    notify("Change didn't save. Your Admin session may have expired. Tap Admin and sign in again.");
    refetchAll().then(() => onChange()).catch(() => {});
  }
  async function cInsert(t, row, adminOnly) {
    if (adminOnly && CLOUD && !adminAuthed) return blocked();
    const { error } = await sb.from(t).insert(row);
    if (error) notify(error.message);
  }
  async function cUpdate(t, id, patch) {
    const { data, error } = await sb.from(t).update(patch).eq("id", id).select();
    if (error) return notify(error.message);
    if (!data || data.length === 0) blocked();
  }
  async function cDelete(t, id) {
    const { data, error } = await sb.from(t).delete().eq("id", id).select();
    if (error) return notify(error.message);
    if (!data || data.length === 0) blocked();
  }

  function resPatch(p) {
    const o = {};
    if ("status" in p) o.status = p.status;
    if ("detailerId" in p) o.detailer_id = p.detailerId || null;
    if ("notes" in p) o.notes = p.notes;
    if ("name" in p) o.name = p.name;
    if ("phone" in p) o.phone = p.phone;
    if ("vehicle" in p) o.vehicle = p.vehicle;
    if ("address" in p) o.address = p.address;
    if ("date" in p) o.date = p.date;
    if ("slot" in p) o.slot = p.slot;
    if ("pkgId" in p) o.pkg_id = p.pkgId;
    return o;
  }
  function pkgPatch(p) {
    const o = {};
    if ("price" in p) o.price = p.price;
    if ("name" in p) o.name = p.name;
    if ("duration" in p) o.duration = p.duration;
    if ("desc" in p) o.description = p.desc;
    return o;
  }

  /* ---------- init ---------- */
  async function init(cb) {
    onChange = cb || onChange;
    if (CLOUD) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 5 } },
      });
      try { const { data: s } = await sb.auth.getSession(); adminAuthed = !!s.session; } catch (e) {}
      sb.auth.onAuthStateChange(async (_event, session) => {
        adminAuthed = !!session;
        try { await refetchAll(); } catch (e) {}
        onChange();
        if (authCb) authCb(adminAuthed);
      });
      try { await refetchAll(); } catch (e) { notify(e.message || "load failed"); }
      const chan = sb.channel("brilo-all");
      ["packages", "detailers", "reservations", "reviews", "media", "media_comments", "suggestions", "job_notes", "maintenance_reminders", "maintenance_plans"].forEach(t =>
        chan.on("postgres_changes", { event: "*", schema: "public", table: t }, async () => {
          try { await refetchAll(); onChange(); } catch (e) { notify(e.message || "sync failed"); }
        }));
      chan.subscribe();
    } else {
      const o = loadLocal();
      replace(data.packages, o.packages);
      replace(data.detailers, o.detailers);
      replace(data.reservations, o.reservations);
      replace(data.reviews, o.reviews);
      replace(data.media, o.media || []);
      replace(data.mediaComments, o.mediaComments || []);
      replace(data.suggestions, o.suggestions || []);
      replace(data.jobNotes, o.jobNotes || []);
      replace(data.maintenanceReminders, o.maintenanceReminders || []);
      replace(data.maintenancePlans, o.maintenancePlans || []);
    }
    return { cloud: CLOUD };
  }

  const Store = {
    data,
    init,
    newId,
    isCloud: () => CLOUD,

    /* ---------- admin auth (Supabase Auth) ---------- */
    isAdminAuthed: () => CLOUD ? adminAuthed : true,
    onAuthChange(cb) { authCb = cb; },
    async signInAdmin(email, password) {
      if (!CLOUD) { adminAuthed = true; return { ok: true }; }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return { ok: !error, error: error && error.message };
    },
    async signOutAdmin() {
      if (!CLOUD) { adminAuthed = false; return; }
      await sb.auth.signOut();
    },

    addReservation(r) {
      r.id = r.id || newId();
      r.createdAt = Date.now();
      data.reservations.unshift(r);
      if (CLOUD) cInsert("reservations", toRes(r)); else saveLocal();
    },
    updateReservation(id, patch) {
      const r = data.reservations.find(x => x.id === id); if (!r) return;
      Object.assign(r, patch);
      if (CLOUD) cUpdate("reservations", id, resPatch(patch)); else saveLocal();
    },

    addJobNote(n) {
      n.id = n.id || newId();
      n.author = n.author || "customer";
      n.createdAt = Date.now();
      data.jobNotes.push(n);
      if (CLOUD) cInsert("job_notes", toNote(n)); else saveLocal();
    },

    /* ---------- maintenance: reminders (admin -> customer) ---------- */
    addMaintenanceReminder(m) {
      m.id = m.id || newId();
      m.status = m.status || "sent";
      m.createdAt = Date.now();
      data.maintenanceReminders.unshift(m);
      if (CLOUD) cInsert("maintenance_reminders", toRem(m), true); else saveLocal();
    },
    updateMaintenanceReminder(id, patch) {
      const m = data.maintenanceReminders.find(x => x.id === id); if (!m) return;
      Object.assign(m, patch);
      if (CLOUD) cUpdate("maintenance_reminders", id, { status: m.status }); else saveLocal();
    },
    removeMaintenanceReminder(id) {
      const i = data.maintenanceReminders.findIndex(x => x.id === id);
      if (i >= 0) data.maintenanceReminders.splice(i, 1);
      if (CLOUD) cDelete("maintenance_reminders", id); else saveLocal();
    },

    /* ---------- maintenance: plans (customer self-enroll) ---------- */
    addMaintenancePlan(p) {
      p.id = p.id || newId();
      p.active = p.active !== false;
      p.createdAt = Date.now();
      data.maintenancePlans.unshift(p);
      if (CLOUD) cInsert("maintenance_plans", toPlan(p)); else saveLocal();
    },
    updateMaintenancePlan(id, patch) {
      const p = data.maintenancePlans.find(x => x.id === id); if (!p) return;
      Object.assign(p, patch);
      if (CLOUD) cUpdate("maintenance_plans", id, toPlan(p)); else saveLocal();
    },
    removeMaintenancePlan(id) {
      const i = data.maintenancePlans.findIndex(x => x.id === id);
      if (i >= 0) data.maintenancePlans.splice(i, 1);
      if (CLOUD) cDelete("maintenance_plans", id); else saveLocal();
    },

    /* ---------- gallery: upload a file from the device ----------
       Returns { url, type } on success or { error } on failure. Requires the
       admin to be signed in (Storage write is restricted to authenticated). */
    async uploadFile(file) {
      if (!CLOUD) {
        try { const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
          return { url, type: file.type.startsWith("video") ? "video" : "image" }; } catch (e) { return { error: "Could not read file." }; }
      }
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await sb.storage.from("gallery").upload(path, file, { contentType: file.type, upsert: false });
      if (error) return { error: error.message };
      const { data: pub } = sb.storage.from("gallery").getPublicUrl(path);
      return { url: pub.publicUrl, type: file.type.startsWith("video") ? "video" : "image" };
    },

    addReview(rev) {
      rev.id = rev.id || newId();
      data.reviews.unshift(rev);
      if (CLOUD) cInsert("reviews", toRev(rev)); else saveLocal();
    },

    addMedia(m) {
      m.id = m.id || newId();
      m.createdAt = Date.now();
      data.media.unshift(m);
      if (CLOUD) cInsert("media", toMedia(m), true); else saveLocal();
    },
    updateMedia(id, patch) {
      const m = data.media.find(x => x.id === id); if (!m) return;
      Object.assign(m, patch);
      if (CLOUD) cUpdate("media", id, { caption: m.caption || "", url: m.url, type: m.type || "image" }); else saveLocal();
    },
    removeMedia(id) {
      const i = data.media.findIndex(x => x.id === id);
      if (i >= 0) data.media.splice(i, 1);
      for (let j = data.mediaComments.length - 1; j >= 0; j--)
        if (data.mediaComments[j].mediaId === id) data.mediaComments.splice(j, 1);
      if (CLOUD) cDelete("media", id); else saveLocal();
    },
    addMediaComment(c) {
      c.id = c.id || newId();
      c.createdAt = Date.now();
      data.mediaComments.push(c);
      if (CLOUD) cInsert("media_comments", toComment(c)); else saveLocal();
    },

    addSuggestion(s) {
      s.id = s.id || newId();
      s.status = s.status || "new";
      s.createdAt = Date.now();
      data.suggestions.unshift(s);
      if (CLOUD) cInsert("suggestions", toSug(s)); else saveLocal();
    },
    updateSuggestion(id, patch) {
      const s = data.suggestions.find(x => x.id === id); if (!s) return;
      Object.assign(s, patch);
      if (CLOUD) cUpdate("suggestions", id, { status: s.status }); else saveLocal();
    },
    removeSuggestion(id) {
      const i = data.suggestions.findIndex(x => x.id === id);
      if (i >= 0) data.suggestions.splice(i, 1);
      if (CLOUD) cDelete("suggestions", id); else saveLocal();
    },

    addDetailer(d) {
      d.id = d.id || newId();
      data.detailers.push(d);
      if (CLOUD) cInsert("detailers", { id: d.id, name: d.name, phone: d.phone || "" }, true); else saveLocal();
    },
    updateDetailer(id, patch) {
      const d = data.detailers.find(x => x.id === id); if (!d) return;
      Object.assign(d, patch);
      if (CLOUD) cUpdate("detailers", id, { name: d.name, phone: d.phone || "" }); else saveLocal();
    },
    removeDetailer(id) {
      const i = data.detailers.findIndex(d => d.id === id);
      if (i >= 0) data.detailers.splice(i, 1);
      const affected = data.reservations.filter(r => r.detailerId === id);
      affected.forEach(r => { r.detailerId = null; if (r.status === "assigned") r.status = "requested"; });
      if (CLOUD) {
        Promise.all(affected.map(r => cUpdate("reservations", r.id, { detailer_id: null, status: r.status })))
          .then(() => cDelete("detailers", id));
      } else saveLocal();
    },

    addPackage(p) {
      p.id = p.id || newId();
      data.packages.push(p);
      if (CLOUD) cInsert("packages", toPkg(p), true); else saveLocal();
    },
    updatePackage(id, patch) {
      const p = data.packages.find(x => x.id === id); if (!p) return;
      Object.assign(p, patch);
      if (CLOUD) cUpdate("packages", id, pkgPatch(patch)); else saveLocal();
    },
    removePackage(id) {
      const i = data.packages.findIndex(p => p.id === id);
      if (i >= 0) data.packages.splice(i, 1);
      if (CLOUD) cDelete("packages", id); else saveLocal();
    },

    reset() {
      if (CLOUD) { if (window.toast) window.toast("Reset is disabled in shared mode."); return false; }
      const s = JSON.parse(JSON.stringify(seed));
      replace(data.packages, s.packages);
      replace(data.detailers, s.detailers);
      replace(data.reservations, s.reservations);
      replace(data.reviews, s.reviews);
      replace(data.media, s.media);
      replace(data.mediaComments, s.mediaComments);
      replace(data.suggestions, s.suggestions);
      replace(data.jobNotes, s.jobNotes || []);
      saveLocal();
      return true;
    },
  };

  window.Store = Store;
})();
