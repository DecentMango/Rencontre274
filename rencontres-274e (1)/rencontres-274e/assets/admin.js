(function () {
  const $ = (id) => document.getElementById(id);
  const S = { unites: [], creneaux: [], resas: [], notes: {}, tab: "resa" };
  const nomUnite = (id) => (S.unites.find((u) => u.id === id) || {}).nom || id;
  const cren = (id) => S.creneaux.find((c) => c.id === id);
  if (U.DEMO) $("demo").classList.remove("hidden");

  function toast(msg, err) {
    const t = $("toast"); t.textContent = msg; t.className = "toast on" + (err ? " err" : "");
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), 2800);
  }
  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); await charger(); return true; }
    catch (e) {
      let m = e.message || "Erreur";
      if (/reservations_creneau_id_key|duplicate key.*creneau/i.test(m)) m = "Ce créneau est déjà réservé par une autre unité.";
      else if (/reservations_unite_id_key|duplicate key.*unite/i.test(m)) m = "Cette unité a déjà une réservation.";
      else if (/foreign key|violates/i.test(m)) m = "Ce créneau est réservé : annulez ou déplacez d'abord la réservation.";
      toast(m, true); return false;
    }
  }

  // ---------- Authentification ----------
  async function demarrer() {
    const s = await API.session();
    if (s && (await API.estAdmin())) { montrerDash(); } else { $("loginView").classList.remove("hidden"); $("dashView").classList.add("hidden"); }
  }
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const btn = $("loginBtn"); btn.disabled = true; $("loginErr").classList.add("hidden");
    try { await API.connexion($("email").value.trim(), $("mdp").value); montrerDash(); }
    catch (err) { const el = $("loginErr"); el.textContent = /Invalid login/i.test(err.message) ? "Courriel ou mot de passe incorrect." : err.message; el.classList.remove("hidden"); }
    finally { btn.disabled = false; }
  });
  $("logoutBtn").addEventListener("click", async () => { await API.deconnexion(); location.reload(); });

  let ecoute = false;
  function montrerDash() {
    $("loginView").classList.add("hidden"); $("dashView").classList.remove("hidden");
    charger();
    if (!ecoute) { ecoute = true; let t; API.ecouter(() => { clearTimeout(t); t = setTimeout(charger, 300); }); setInterval(() => !document.hidden && charger(), 45000); }
  }

  // ---------- Données ----------
  async function charger() {
    try {
      const [unites, creneaux, resas, notes] = await Promise.all([API.unites(), API.creneaux(), API.reservations(), API.notes()]);
      S.unites = unites; S.creneaux = creneaux;
      S.resas = resas.sort((a, b) => ((cren(a.creneau_id) || {}).debut || "").localeCompare((cren(b.creneau_id) || {}).debut || ""));
      S.notes = Object.fromEntries(notes.map((n) => [n.reservation_id, n.contenu]));
      rendre();
    } catch (e) { toast("Chargement impossible : " + e.message, true); }
  }

  function rendre() {
    const total = S.unites.length, n = S.resas.length, pct = total ? Math.round((n / total) * 100) : 0;
    $("stProg").textContent = `${n} / ${total}`; $("progFill").style.width = pct + "%"; $("progPct").textContent = pct + " %";
    $("progBar").setAttribute("aria-valuenow", n); $("progBar").setAttribute("aria-valuemax", total);
    $("progLeft").textContent = total - n ? `${total - n} unité${total - n > 1 ? "s" : ""} en attente` : "Toutes les unités ont réservé 🎉";
    $("stLibres").textContent = S.creneaux.filter((c) => !c.unite_id).length;
    $("stVenir").textContent = S.resas.filter((r) => r.statut !== "terminee").length;
    $("stFini").textContent = S.resas.filter((r) => r.statut === "terminee").length;
    const attente = S.unites.filter((u) => !S.resas.some((r) => r.unite_id === u.id));
    $("cResa").textContent = n; $("cAttente").textContent = attente.length; $("cCren").textContent = S.creneaux.length;
    rendreResas(); rendreAttente(attente); rendreCreneaux();
  }

  function rendreResas() {
    const el = $("tab-resa");
    if (!S.resas.length) { el.innerHTML = '<div class="empty">Aucune réservation pour le moment.</div>'; return; }
    // Préserve les notes en cours de saisie
    const focus = document.activeElement && document.activeElement.dataset.note;
    const brouillons = {}; el.querySelectorAll("textarea[data-note]").forEach((t) => { if (t.value !== (S.notes[t.dataset.note] || "")) brouillons[t.dataset.note] = t.value; });
    el.innerHTML = S.resas.map((r) => {
      const c = cren(r.creneau_id) || {};
      const fini = r.statut === "terminee";
      const passee = !fini && c.fin && U.estPasse(c.fin);
      return `<article class="resa" data-id="${r.id}">
        <div>
          <h3>${U.esc(nomUnite(r.unite_id))}
            <span class="badge ${fini ? "done" : "up"}">${fini ? "Terminée" : "À venir"}</span>
            ${passee ? '<span class="badge warn">Date passée</span>' : ""}
            ${r.source === "admin" ? '<span class="badge adm">Ajoutée par le chef de groupe</span>' : ""}
          </h3>
          <div class="when">${c.debut ? U.esc(U.jourLong(c.debut) + " · " + U.plage(c.debut, c.fin)) : "—"}</div>
        </div>
        <div class="tools">
          <button class="btn btn-ghost btn-sm" data-a="edit">Modifier / déplacer</button>
          <button class="btn btn-ghost btn-sm" data-a="statut">${fini ? "Remettre à venir" : "Marquer terminée"}</button>
          <button class="btn btn-danger btn-sm" data-a="cancel">Annuler</button>
        </div>
        <div class="info">
          <div><span>Responsable :</span> ${U.esc(r.responsable)}</div>
          <div><span>Chefs présents :</span> ${U.esc(r.chefs) || "—"}</div>
          ${r.commentaire ? `<div><span>Commentaire :</span> ${U.esc(r.commentaire)}</div>` : ""}
          <div><span>Réservé le :</span> ${U.esc(new Date(r.created_at).toLocaleString("fr-CA", { timeZone: U.TZ, dateStyle: "medium", timeStyle: "short" }))}</div>
        </div>
        <div class="note-box">
          <label><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Notes confidentielles (chef de groupe seulement)</label>
          <textarea data-note="${r.id}" placeholder="Points discutés, suivis, observations…">${U.esc(brouillons[r.id] ?? S.notes[r.id] ?? "")}</textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="note-saved" data-saved="${r.id}">${S.notes[r.id] ? "Enregistrée" : ""}</span><button class="btn btn-ghost btn-sm" data-a="note">Enregistrer la note</button></div>
        </div>
      </article>`;
    }).join("");
    if (focus) { const t = el.querySelector(`textarea[data-note="${focus}"]`); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
  }

  function rendreAttente(attente) {
    const el = $("tab-attente");
    if (!attente.length) { el.innerHTML = '<div class="empty">Toutes les unités ont réservé leur rencontre. 🎉</div>'; return; }
    el.innerHTML = attente.map((u) => `<div class="unit-row"><b>${U.esc(u.nom)}</b><button class="btn btn-primary btn-sm" data-manuel="${U.esc(u.id)}">Réserver pour cette unité</button></div>`).join("");
  }

  function rendreCreneaux() {
    const el = $("slotRows");
    if (!S.creneaux.length) { el.innerHTML = '<div class="empty">Aucun créneau. Ajoutez-en un ci-dessus.</div>'; return; }
    el.innerHTML = S.creneaux.map((c) => `<div class="slot-row">
      <div><b>${U.esc(U.jourCourt(c.debut))}</b> · ${U.esc(U.plage(c.debut, c.fin))}<div class="who">${c.unite_id ? "Réservé : " + U.esc(nomUnite(c.unite_id)) : '<span style="color:var(--forest-2);font-weight:600">Libre</span>'}</div></div>
      <div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-ecren="${c.id}">Modifier</button><button class="btn btn-danger btn-sm" data-dcren="${c.id}">Supprimer</button></div>
    </div>`).join("");
  }

  // ---------- Onglets ----------
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
    ["resa", "attente", "creneaux"].forEach((t) => $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
  }));

  // ---------- Dialogue générique ----------
  function dialogue(titre, corps, libelle, onOk) {
    const f = $("dlgForm");
    f.innerHTML = `<h2>${titre}</h2><div class="form-grid">${corps}</div><div id="dlgErr" class="alert alert-err hidden" style="margin-top:12px"></div>
      <div class="dlg-actions"><button class="btn btn-ghost" value="cancel" formnovalidate>Fermer</button><button class="btn btn-primary" value="ok">${libelle}</button></div>`;
    const d = $("dlg");
    f.onsubmit = async (e) => {
      if (e.submitter && e.submitter.value === "cancel") return;
      e.preventDefault();
      const ok = await onOk(f);
      if (ok !== false) d.close();
    };
    d.showModal();
  }
  const optionsCreneaux = (actuel) => S.creneaux.filter((c) => !c.unite_id || c.id === actuel)
    .map((c) => `<option value="${c.id}" ${c.id === actuel ? "selected" : ""}>${U.esc(U.jourCourt(c.debut) + " · " + U.plage(c.debut, c.fin))}${c.id === actuel ? " (actuel)" : ""}</option>`).join("");
  const champ = (id, label, val, type = "input") => type === "textarea"
    ? `<div><label class="field" for="${id}">${label}</label><textarea class="input" id="${id}" maxlength="1000">${U.esc(val)}</textarea></div>`
    : `<div><label class="field" for="${id}">${label}</label><input class="input" id="${id}" value="${U.esc(val)}" maxlength="120"></div>`;

  // ---------- Actions réservations ----------
  $("tab-resa").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const id = b.closest(".resa").dataset.id; const r = S.resas.find((x) => x.id === id);
    if (b.dataset.a === "cancel") {
      if (!confirm(`Annuler la réservation des ${nomUnite(r.unite_id)} ? Le créneau redeviendra disponible et les notes seront supprimées.`)) return;
      act(() => API.annulerReservation(id), "Réservation annulée");
    }
    if (b.dataset.a === "statut") act(() => API.majReservation(id, { statut: r.statut === "terminee" ? "a_venir" : "terminee" }), "Statut mis à jour");
    if (b.dataset.a === "note") {
      const v = document.querySelector(`textarea[data-note="${id}"]`).value;
      act(() => API.enregistrerNote(id, v), "Note enregistrée");
    }
    if (b.dataset.a === "edit") {
      dialogue(`Modifier — ${U.esc(nomUnite(r.unite_id))}`,
        `<div><label class="field" for="eCren">Créneau (déplacer)</label><select class="input" id="eCren">${optionsCreneaux(r.creneau_id)}</select></div>
         ${champ("eResp", "Responsable", r.responsable)}${champ("eChefs", "Chefs présents", r.chefs, "textarea")}${champ("eCom", "Commentaire", r.commentaire, "textarea")}
         <div><label class="field" for="eStat">Statut</label><select class="input" id="eStat"><option value="a_venir" ${r.statut !== "terminee" ? "selected" : ""}>À venir</option><option value="terminee" ${r.statut === "terminee" ? "selected" : ""}>Terminée</option></select></div>`,
        "Enregistrer",
        (f) => act(() => API.majReservation(id, { creneau_id: f.querySelector("#eCren").value, responsable: f.querySelector("#eResp").value.trim() || r.responsable, chefs: f.querySelector("#eChefs").value.trim(), commentaire: f.querySelector("#eCom").value.trim(), statut: f.querySelector("#eStat").value }), "Réservation modifiée"));
    }
  });

  // ---------- Réservation manuelle ----------
  $("tab-attente").addEventListener("click", (e) => {
    const b = e.target.closest("[data-manuel]"); if (!b) return;
    const uid = b.dataset.manuel;
    if (!S.creneaux.some((c) => !c.unite_id)) { toast("Aucun créneau libre : ajoutez-en un dans l'onglet Créneaux.", true); return; }
    dialogue(`Réserver pour les ${U.esc(nomUnite(uid))}`,
      `<div><label class="field" for="mCren">Créneau</label><select class="input" id="mCren">${optionsCreneaux(null)}</select></div>
       ${champ("mResp", "Responsable", "Chef de groupe")}${champ("mChefs", "Chefs présents", "", "textarea")}${champ("mCom", "Commentaire", "", "textarea")}`,
      "Réserver",
      (f) => act(() => API.creerReservation({ unite_id: uid, creneau_id: f.querySelector("#mCren").value, responsable: f.querySelector("#mResp").value.trim() || "Chef de groupe", chefs: f.querySelector("#mChefs").value.trim(), commentaire: f.querySelector("#mCom").value.trim() }), "Réservation ajoutée"));
  });

  // ---------- Créneaux ----------
  $("addSlot").addEventListener("submit", (e) => {
    e.preventDefault();
    const debut = U.torontoISO($("nsDate").value, $("nsHeure").value);
    const fin = new Date(new Date(debut).getTime() + (+$("nsDuree").value || 90) * 60000).toISOString();
    if (S.creneaux.some((c) => c.debut < fin && c.fin > debut) && !confirm("Ce créneau chevauche un créneau existant. L'ajouter quand même ?")) return;
    act(() => API.creerCreneau(debut, fin), "Créneau ajouté");
  });
  $("slotRows").addEventListener("click", (e) => {
    const d = e.target.closest("[data-dcren]"), m = e.target.closest("[data-ecren]");
    if (d) {
      const c = cren(d.dataset.dcren);
      if (c.unite_id) { toast("Ce créneau est réservé : annulez ou déplacez d'abord la réservation.", true); return; }
      if (confirm(`Supprimer le créneau du ${U.jourCourt(c.debut)} (${U.plage(c.debut, c.fin)}) ?`)) act(() => API.supprimerCreneau(c.id), "Créneau supprimé");
    }
    if (m) {
      const c = cren(m.dataset.ecren);
      dialogue("Modifier le créneau",
        `<div><label class="field" for="cDate">Date</label><input class="input" type="date" id="cDate" value="${U.dateKey(c.debut)}" required></div>
         <div><label class="field" for="cDeb">Début</label><input class="input" type="time" id="cDeb" value="${U.timeKey(c.debut)}" step="900" required></div>
         <div><label class="field" for="cFin">Fin</label><input class="input" type="time" id="cFin" value="${U.timeKey(c.fin)}" step="900" required></div>`,
        "Enregistrer",
        (f) => {
          const dt = f.querySelector("#cDate").value, debut = U.torontoISO(dt, f.querySelector("#cDeb").value), fin = U.torontoISO(dt, f.querySelector("#cFin").value);
          if (fin <= debut) { const er = f.querySelector("#dlgErr"); er.textContent = "L'heure de fin doit être après l'heure de début."; er.classList.remove("hidden"); return false; }
          return act(() => API.majCreneau(c.id, debut, fin), "Créneau modifié");
        });
    }
  });

  // ---------- Export CSV ----------
  $("csvBtn").addEventListener("click", () => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Unité", "Date", "Début", "Fin", "Responsable", "Chefs présents", "Commentaire", "Statut", "Source", "Réservé le", "Notes confidentielles"]];
    S.unites.forEach((u) => {
      const r = S.resas.find((x) => x.unite_id === u.id);
      if (!r) { rows.push([u.nom, "", "", "", "", "", "", "Non réservé", "", "", ""]); return; }
      const c = cren(r.creneau_id) || {};
      rows.push([u.nom, c.debut ? U.dateKey(c.debut) : "", c.debut ? U.timeKey(c.debut) : "", c.fin ? U.timeKey(c.fin) : "", r.responsable, r.chefs, r.commentaire,
        r.statut === "terminee" ? "Terminée" : "À venir", r.source === "admin" ? "Chef de groupe" : "En ligne",
        new Date(r.created_at).toLocaleString("fr-CA", { timeZone: U.TZ }), S.notes[r.id] || ""]);
    });
    const csv = "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `rencontres-mi-annee-274e-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("Export CSV téléchargé");
  });

  demarrer();
})();
