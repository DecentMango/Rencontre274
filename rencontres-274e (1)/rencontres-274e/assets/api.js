// Couche de données : Supabase en production, mémoire locale en mode démo.
(function () {
  const TZ = "America/Toronto";
  const cfg = window.APP_CONFIG || {};
  const DEMO = !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("VOTRE") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("VOTRE");

  // ---------- Utilitaires date / affichage ----------
  const fmtParts = (iso, opts) => new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, ...opts }).format(new Date(iso));
  const U = {
    TZ, DEMO,
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    heure(iso) {
      const p = new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
      const h = +p.find((x) => x.type === "hour").value, m = p.find((x) => x.type === "minute").value;
      return m === "00" ? `${h} h` : `${h} h ${m}`;
    },
    plage(a, b) { return `${U.heure(a)} à ${U.heure(b)}`; },
    jourLong(iso) { const s = fmtParts(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); },
    jourCourt(iso) { const s = fmtParts(iso, { weekday: "short", day: "numeric", month: "short" }); return s.charAt(0).toUpperCase() + s.slice(1); },
    dateKey(iso) { // AAAA-MM-JJ à Toronto
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
      const g = (t) => p.find((x) => x.type === t).value; return `${g("year")}-${g("month")}-${g("day")}`;
    },
    timeKey(iso) { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)); },
    tzOffsetMin(ts) {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts));
      const g = (t) => +p.find((x) => x.type === t).value;
      return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ts) / 60000;
    },
    // "2027-01-04" + "18:00" (heure de Toronto) -> ISO UTC
    torontoISO(dateStr, timeStr) {
      const [y, m, d] = dateStr.split("-").map(Number), [h, mi] = timeStr.split(":").map(Number);
      const guess = Date.UTC(y, m - 1, d, h, mi);
      let ts = guess - U.tzOffsetMin(guess) * 60000;
      ts = guess - U.tzOffsetMin(ts) * 60000;
      return new Date(ts).toISOString();
    },
    estPasse(iso) { return new Date(iso).getTime() < Date.now(); },
  };
  window.U = U;

  // ---------- Implémentation Supabase ----------
  function supabaseApi() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    return {
      async unites() { return ok(await sb.from("unites").select("id,nom,ordre").order("ordre")); },
      async creneaux() { return ok(await sb.from("creneaux").select("id,debut,fin,unite_id").order("debut")); },
      async reserver(p) {
        return ok(await sb.rpc("reserver", { p_creneau: p.creneau_id, p_unite: p.unite_id, p_responsable: p.responsable, p_chefs: p.chefs, p_commentaire: p.commentaire || "" }));
      },
      ecouter(cb) {
        const ch = sb.channel("creneaux-public").on("postgres_changes", { event: "*", schema: "public", table: "creneaux" }, () => cb()).subscribe();
        return () => sb.removeChannel(ch);
      },
      // --- Admin ---
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      async connexion(email, mdp) {
        ok(await sb.auth.signInWithPassword({ email, password: mdp }));
        const { data } = await sb.from("admins").select("user_id").limit(1);
        if (!data || !data.length) { await sb.auth.signOut(); throw new Error("Ce compte n'a pas accès à l'espace chef de groupe."); }
      },
      async estAdmin() { const { data } = await sb.from("admins").select("user_id").limit(1); return !!(data && data.length); },
      async deconnexion() { await sb.auth.signOut(); },
      async reservations() { return ok(await sb.from("reservations").select("*").order("created_at")); },
      async notes() { return ok(await sb.from("notes").select("*")); },
      async creerReservation(r) { return ok(await sb.from("reservations").insert({ ...r, source: "admin" }).select().single()); },
      async majReservation(id, champs) { return ok(await sb.from("reservations").update(champs).eq("id", id).select().single()); },
      async annulerReservation(id) { return ok(await sb.from("reservations").delete().eq("id", id)); },
      async enregistrerNote(reservation_id, contenu) { return ok(await sb.from("notes").upsert({ reservation_id, contenu, updated_at: new Date().toISOString() })); },
      async creerCreneau(debut, fin) { return ok(await sb.from("creneaux").insert({ debut, fin }).select().single()); },
      async majCreneau(id, debut, fin) { return ok(await sb.from("creneaux").update({ debut, fin }).eq("id", id)); },
      async supprimerCreneau(id) {
        const { error } = await sb.from("creneaux").delete().eq("id", id);
        if (error) throw new Error(error.code === "23503" ? "Ce créneau est réservé : annulez ou déplacez d'abord la réservation." : error.message);
      },
    };
  }

  // ---------- Implémentation démo (localStorage) ----------
  function demoApi() {
    const KEY = "rencontres274e-demo-v1";
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    const seed = () => {
      const unites = [["castors", "Castors"], ["louveteaux", "Louveteaux"], ["louvettes", "Louvettes"], ["eclaireurs", "Éclaireurs"], ["eclaireuses", "Éclaireuses"], ["pionniers", "Pionniers"], ["routiers", "Routiers"]].map(([id, nom], i) => ({ id, nom, ordre: i + 1 }));
      const def = [["2027-01-04", "18:00"], ["2027-01-04", "19:30"], ["2027-01-06", "18:00"], ["2027-01-06", "19:30"], ["2027-01-07", "18:00"], ["2027-01-07", "19:30"], ["2027-01-07", "21:00"]];
      const creneaux = def.map(([d, h]) => { const debut = U.torontoISO(d, h); return { id: uid(), debut, fin: new Date(new Date(debut).getTime() + 90 * 60000).toISOString(), unite_id: null }; });
      return { unites, creneaux, reservations: [], notes: [] };
    };
    let db;
    const load = () => {
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(KEY)); } catch {}
      if (stored) { db = stored; return; }
      db = db || seed();
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} listeners.forEach((f) => f()); };
    const listeners = new Set();
    const sync = () => { db.creneaux.forEach((c) => { const r = db.reservations.find((x) => x.creneau_id === c.id); c.unite_id = r ? r.unite_id : null; }); };
    const wait = () => new Promise((r) => setTimeout(r, 150));
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const tri = () => db.creneaux.sort((a, b) => a.debut.localeCompare(b.debut));
    load();
    window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); listeners.forEach((f) => f()); } });
    const checkUnique = (r, selfId) => {
      if (db.reservations.some((x) => x.id !== selfId && x.creneau_id === r.creneau_id)) throw new Error("Ce créneau est déjà réservé.");
      if (db.reservations.some((x) => x.id !== selfId && x.unite_id === r.unite_id)) throw new Error("Cette unité a déjà une réservation.");
    };
    let admin = sessionStorage.getItem("demo-admin") === "1";
    return {
      async unites() { await wait(); load(); return clone(db.unites); },
      async creneaux() { await wait(); load(); tri(); return clone(db.creneaux); },
      async reserver(p) {
        await wait(); load();
        if (!p.responsable || p.responsable.trim().length < 2) throw new Error("Veuillez indiquer le nom du responsable.");
        if (!p.chefs || p.chefs.trim().length < 2) throw new Error("Veuillez indiquer les chefs présents.");
        const c = db.creneaux.find((x) => x.id === p.creneau_id); if (!c) throw new Error("Ce créneau n'existe plus.");
        if (c.unite_id) throw new Error("Désolé, ce créneau vient d'être réservé par une autre unité.");
        if (db.reservations.some((x) => x.unite_id === p.unite_id)) throw new Error("Votre unité a déjà une réservation. Contactez le chef de groupe pour la modifier.");
        db.reservations.push({ id: uid(), creneau_id: p.creneau_id, unite_id: p.unite_id, responsable: p.responsable.trim(), chefs: p.chefs.trim(), commentaire: (p.commentaire || "").trim(), statut: "a_venir", source: "public", created_at: new Date().toISOString() });
        sync(); save();
        return { unite: db.unites.find((u) => u.id === p.unite_id).nom, debut: c.debut, fin: c.fin };
      },
      ecouter(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      async session() { return admin ? { user: { email: "demo@chef" } } : null; },
      async connexion(email, mdp) { await wait(); if (mdp !== "demo") throw new Error("Mode démo : utilisez le mot de passe « demo »."); admin = true; sessionStorage.setItem("demo-admin", "1"); },
      async estAdmin() { return admin; },
      async deconnexion() { admin = false; sessionStorage.removeItem("demo-admin"); },
      async reservations() { await wait(); load(); return clone(db.reservations); },
      async notes() { load(); return clone(db.notes); },
      async creerReservation(r) { load(); checkUnique(r); const n = { id: uid(), statut: "a_venir", commentaire: "", chefs: "", ...r, source: "admin", created_at: new Date().toISOString() }; db.reservations.push(n); sync(); save(); return n; },
      async majReservation(id, champs) { load(); const r = db.reservations.find((x) => x.id === id); checkUnique({ ...r, ...champs }, id); Object.assign(r, champs); sync(); save(); return r; },
      async annulerReservation(id) { load(); db.reservations = db.reservations.filter((x) => x.id !== id); db.notes = db.notes.filter((n) => n.reservation_id !== id); sync(); save(); },
      async enregistrerNote(reservation_id, contenu) { load(); const n = db.notes.find((x) => x.reservation_id === reservation_id); if (n) n.contenu = contenu; else db.notes.push({ reservation_id, contenu }); save(); },
      async creerCreneau(debut, fin) { load(); const c = { id: uid(), debut, fin, unite_id: null }; db.creneaux.push(c); save(); return c; },
      async majCreneau(id, debut, fin) { load(); Object.assign(db.creneaux.find((x) => x.id === id), { debut, fin }); save(); },
      async supprimerCreneau(id) { load(); if (db.reservations.some((r) => r.creneau_id === id)) throw new Error("Ce créneau est réservé : annulez ou déplacez d'abord la réservation."); db.creneaux = db.creneaux.filter((x) => x.id !== id); save(); },
    };
  }

  window.API = DEMO ? demoApi() : supabaseApi();
})();
