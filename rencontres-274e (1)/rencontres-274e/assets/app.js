(function () {
  const $ = (id) => document.getElementById(id);
  const S = { unites: [], creneaux: [], unite: "", jour: null, creneau: null, mois: null, envoi: false };
  const nomUnite = (id) => (S.unites.find((u) => u.id === id) || {}).nom || "";
  const moisCle = (k) => k.slice(0, 7);

  if (U.DEMO) $("demo").classList.remove("hidden");
  try { S.unite = localStorage.getItem("274e-unite") || ""; } catch {}

  async function charger(premier) {
    try {
      const [unites, creneaux] = await Promise.all([premier ? API.unites() : Promise.resolve(S.unites), API.creneaux()]);
      S.unites = unites; S.creneaux = creneaux;
      if (premier) remplirUnites();
      // Le créneau choisi a été pris entre-temps ?
      if (S.creneau) {
        const c = S.creneaux.find((x) => x.id === S.creneau);
        if (!c || c.unite_id) { S.creneau = null; montrerErreurForm(c ? "Ce créneau vient d'être réservé par une autre unité. Choisissez-en un autre." : ""); }
      }
      if (!S.jour) choisirJourParDefaut();
      rendre();
      $("liveTxt").textContent = "Disponibilités mises à jour en temps réel";
      $("loadErr").classList.add("hidden");
      if (!S.unites.length || !S.creneaux.length) throw new Error("La base de données ne renvoie aucune unité ou aucun créneau (vérifiez les permissions SQL).");
    } catch (e) {
      $("liveTxt").textContent = "Connexion impossible. Vérifiez votre réseau et rechargez la page.";
      const el = $("loadErr"); el.innerHTML = "<b>Impossible de charger les disponibilités.</b><br>" + U.esc(e.message || e); el.classList.remove("hidden");
      console.error(e);
    }
  }

  function remplirUnites() {
    const sel = $("unite");
    sel.innerHTML = '<option value="">Sélectionnez votre unité…</option>' + S.unites.map((u) => `<option value="${U.esc(u.id)}">${U.esc(u.nom)}</option>`).join("");
    if (S.unites.some((u) => u.id === S.unite)) sel.value = S.unite; else S.unite = "";
  }

  function choisirJourParDefaut() {
    const libres = S.creneaux.filter((c) => !c.unite_id && !U.estPasse(c.fin));
    const ref = libres[0] || S.creneaux[0];
    if (ref) { S.jour = U.dateKey(ref.debut); S.mois = moisCle(S.jour); }
    else { const k = U.dateKey(new Date().toISOString()); S.mois = moisCle(k); }
  }

  function moisDisponibles() {
    const set = new Set(S.creneaux.map((c) => moisCle(U.dateKey(c.debut))));
    if (S.mois) set.add(S.mois);
    return [...set].sort();
  }

  function rendre() {
    // Mise à jour des libellés du menu (unité déjà réservée)
    [...$("unite").options].forEach((o) => {
      if (!o.value) return;
      const pris = S.creneaux.some((c) => c.unite_id === o.value);
      o.textContent = nomUnite(o.value) + (pris ? " — déjà réservé" : "");
    });
    const resaUnite = S.creneaux.find((c) => c.unite_id === S.unite && S.unite);
    const info = $("unitInfo");
    if (resaUnite) {
      info.innerHTML = `Les <b>${U.esc(nomUnite(S.unite))}</b> ont déjà réservé : <b>${U.esc(U.jourLong(resaUnite.debut))}, ${U.esc(U.plage(resaUnite.debut, resaUnite.fin))}</b>.<br>Pour modifier, contactez le chef de groupe.`;
      info.classList.remove("hidden");
      S.creneau = null;
    } else info.classList.add("hidden");
    rendreCalendrier();
    rendreCreneaux(!!resaUnite);
    rendreFormulaire();
  }

  function rendreCalendrier() {
    const mois = moisDisponibles(); const i = mois.indexOf(S.mois);
    $("prevM").disabled = i <= 0; $("nextM").disabled = i >= mois.length - 1;
    const [y, m] = S.mois.split("-").map(Number);
    $("calMonth").textContent = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
    const premier = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = dim.
    const decal = (premier + 6) % 7; // semaine commençant lundi
    const nbJours = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const auj = U.dateKey(new Date().toISOString());
    let html = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let k = 0; k < decal; k++) html += "<div></div>";
    for (let d = 1; d <= nbJours; d++) {
      const key = `${S.mois}-${String(d).padStart(2, "0")}`;
      const du = S.creneaux.filter((c) => U.dateKey(c.debut) === key);
      const libre = du.some((c) => !c.unite_id && !U.estPasse(c.fin));
      let cls = "cal-day";
      if (du.length) cls += libre ? " has" : " full";
      if (key === S.jour) cls += " sel";
      if (key === auj) cls += " today";
      const label = du.length ? `${d} — ${libre ? du.filter((c) => !c.unite_id).length + " créneau(x) disponible(s)" : "complet"}` : String(d);
      html += du.length ? `<button class="${cls}" data-jour="${key}" aria-label="${label}">${d}</button>` : `<div class="${cls}">${d}</div>`;
    }
    $("calGrid").innerHTML = html;
  }

  function rendreCreneaux(uniteDejaReservee) {
    const list = $("slotList");
    if (!S.jour) { $("dayTitle").textContent = "Sélectionnez une date"; list.innerHTML = ""; return; }
    const du = S.creneaux.filter((c) => U.dateKey(c.debut) === S.jour);
    $("dayTitle").textContent = du.length ? U.jourLong(du[0].debut) : "Aucun créneau ce jour-là";
    if (!du.length) { list.innerHTML = '<div class="empty">Choisissez une date en vert dans le calendrier.</div>'; return; }
    list.innerHTML = du.map((c) => {
      const passe = U.estPasse(c.fin);
      if (c.unite_id) {
        const mine = c.unite_id === S.unite;
        return `<button class="slot ${mine ? "mine" : "taken"}" disabled aria-label="${U.esc(U.plage(c.debut, c.fin))}, réservé par ${U.esc(nomUnite(c.unite_id))}"><span>${U.esc(U.plage(c.debut, c.fin))}</span><span class="tag">${mine ? "Votre unité" : U.esc(nomUnite(c.unite_id))}</span></button>`;
      }
      if (passe) return `<button class="slot taken" disabled><span>${U.esc(U.plage(c.debut, c.fin))}</span><span class="tag">Passé</span></button>`;
      const sel = c.id === S.creneau;
      return `<button class="slot ${sel ? "sel" : ""}" data-creneau="${c.id}" ${uniteDejaReservee ? "disabled" : ""}><span>${U.esc(U.plage(c.debut, c.fin))}</span><span class="tag">${sel ? "Sélectionné" : "Disponible"}</span></button>`;
    }).join("");
  }

  function rendreFormulaire() {
    const c = S.creneaux.find((x) => x.id === S.creneau);
    const step = $("formStep");
    if (!c || !S.unite) { step.classList.add("hidden"); return; }
    step.classList.remove("hidden");
    $("summary").innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1b3a6b" stroke-width="2" style="flex:none;margin-top:2px"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg><div><b>${U.esc(nomUnite(S.unite))}</b><br>${U.esc(U.jourLong(c.debut))} · ${U.esc(U.plage(c.debut, c.fin))}</div>`;
  }

  function montrerErreurForm(msg) { const e = $("err"); if (!msg) { e.classList.add("hidden"); return; } e.textContent = msg; e.classList.remove("hidden"); }

  // ---------- Événements ----------
  $("unite").addEventListener("change", (e) => {
    S.unite = e.target.value; try { localStorage.setItem("274e-unite", S.unite); } catch {}
    montrerErreurForm(""); rendre();
  });
  $("calGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-jour]"); if (!b) return;
    S.jour = b.dataset.jour; S.creneau = null; rendre();
  });
  $("prevM").addEventListener("click", () => { const m = moisDisponibles(); S.mois = m[Math.max(0, m.indexOf(S.mois) - 1)]; rendreCalendrier(); });
  $("nextM").addEventListener("click", () => { const m = moisDisponibles(); S.mois = m[Math.min(m.length - 1, m.indexOf(S.mois) + 1)]; rendreCalendrier(); });
  $("slotList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-creneau]"); if (!b) return;
    if (!S.unite) {
      const sel = $("unite"); sel.focus(); sel.scrollIntoView({ behavior: "smooth", block: "center" });
      sel.style.borderColor = "#a63d2f"; setTimeout(() => (sel.style.borderColor = ""), 1600);
      return;
    }
    S.creneau = b.dataset.creneau; montrerErreurForm(""); rendre();
    setTimeout(() => $("formStep").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  });

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault(); if (S.envoi) return;
    const responsable = $("responsable").value.trim(), chefs = $("chefs").value.trim(), commentaire = $("commentaire").value.trim();
    if (responsable.length < 2) { montrerErreurForm("Veuillez indiquer le nom du responsable de la réservation."); $("responsable").focus(); return; }
    if (chefs.length < 2) { montrerErreurForm("Veuillez indiquer les noms des chefs qui seront présents."); $("chefs").focus(); return; }
    S.envoi = true; const btn = $("submit"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Réservation en cours…';
    montrerErreurForm("");
    try {
      const r = await API.reserver({ creneau_id: S.creneau, unite_id: S.unite, responsable, chefs, commentaire });
      afficherConfirmation({ unite: r.unite || nomUnite(S.unite), debut: r.debut, fin: r.fin, responsable, chefs, commentaire });
    } catch (err) {
      montrerErreurForm((err.message || "Une erreur est survenue. Réessayez.").replace("la chefferie", "le chef de groupe"));
      await charger(false);
    } finally {
      S.envoi = false; btn.disabled = false; btn.textContent = "Confirmer la réservation";
    }
  });

  function afficherConfirmation(d) {
    $("flow").classList.add("hidden"); $("done").classList.remove("hidden");
    $("doneWhen").textContent = `${U.jourLong(d.debut)} · ${U.plage(d.debut, d.fin)}`;
    $("doneDetails").innerHTML =
      `<div><b>Unité :</b> ${U.esc(d.unite)}</div><div><b>Responsable :</b> ${U.esc(d.responsable)}</div><div><b>Chefs présents :</b> ${U.esc(d.chefs)}</div>` +
      (d.commentaire ? `<div><b>Commentaire :</b> ${U.esc(d.commentaire)}</div>` : "") + `<div><b>Durée :</b> 1 h 30 · heure de l'Est</div>`;
    $("icsBtn").onclick = () => CalLinks.ics(d);
    $("gcalBtn").href = CalLinks.google(d);
    $("outlookBtn").href = CalLinks.outlook(d);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Temps réel ----------
  let t; const rafraichir = () => { clearTimeout(t); t = setTimeout(() => charger(false), 250); };
  API.ecouter(rafraichir);
  setInterval(() => { if (!document.hidden) charger(false); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) charger(false); });

  charger(true);
})();
