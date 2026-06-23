/* Brilo Details - data store.
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
  };

  /* Single, stable data object the app reads. Arrays are mutated in place so
     existing references (e.g. app's `state`) stay valid across refetches. */
  const data = { packages: [], detailers: [], reservations: [], reviews: [] };
  let onChange = () => {};
  let sb = null;

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
        return o;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(seed));
  }

  /* ---------- cloud helpers ---------- */
  async function refetchAll() {
    const [pk, dt, rs, rv] = await Promise.all([
      sb.from("packages").select("*").order("price", { ascending: true }),
      sb.from("detailers").select("*").order("name", { ascending: true }),
      sb.from("reservations").select("*").order("created_at", { ascending: false }),
      sb.from("reviews").select("*").order("date", { ascending: false }),
    ]);
    if (pk.data) replace(data.packages, pk.data.map(fromPkg));
    if (dt.data) replace(data.detailers, dt.data.map(fromDet));
    if (rs.data) replace(data.reservations, rs.data.map(fromRes));
    if (rv.data) replace(data.reviews, rv.data.map(fromRev));
  }
  async function cInsert(t, row) { const { error } = await sb.from(t).insert(row); if (error) notify(error.message); }
  async function cUpdate(t, id, patch) { const { error } = await sb.from(t).update(patch).eq("id", id); if (error) notify(error.message); }
  async function cDelete(t, id) { const { error } = await sb.from(t).delete().eq("id", id); if (error) notify(error.message); }

  function resPatch(p) {
    const o = {};
    if ("status" in p) o.status = p.status;
    if ("detailerId" in p) o.detailer_id = p.detailerId || null;
    if ("notes" in p) o.notes = p.notes;
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
      try { await refetchAll(); } catch (e) { notify(e.message || "load failed"); }
      const chan = sb.channel("brilo-all");
      ["packages", "detailers", "reservations", "reviews"].forEach(t =>
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
    }
    return { cloud: CLOUD };
  }

  const Store = {
    data,
    init,
    newId,
    isCloud: () => CLOUD,

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

    addReview(rev) {
      rev.id = rev.id || newId();
      data.reviews.unshift(rev);
      if (CLOUD) cInsert("reviews", toRev(rev)); else saveLocal();
    },

    addDetailer(d) {
      d.id = d.id || newId();
      data.detailers.push(d);
      if (CLOUD) cInsert("detailers", { id: d.id, name: d.name, phone: d.phone || "" }); else saveLocal();
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
      if (CLOUD) cInsert("packages", toPkg(p)); else saveLocal();
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
      saveLocal();
      return true;
    },
  };

  window.Store = Store;
})();
