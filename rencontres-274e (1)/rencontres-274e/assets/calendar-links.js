// Liens « Ajouter au calendrier » (.ics, Google, Outlook)
window.CalLinks = (function () {
  const z = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  function evt({ unite, debut, fin, chefs }) {
    const lieu = (window.APP_CONFIG && window.APP_CONFIG.LIEU) || "";
    return {
      titre: `Rencontre de mi-année – ${unite} | 274e Saint-Éphrem`,
      description: `Rencontre de feedback de mi-année entre l'équipe d'animation des ${unite} et le chef de groupe.` + (chefs ? `\nChefs présents : ${chefs}` : ""),
      lieu, debut, fin,
    };
  }
  return {
    ics(data) {
      const e = evt(data);
      const lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//274e Saint-Ephrem//Rencontres mi-annee//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${z(e.debut)}-${Math.random().toString(36).slice(2)}@274e-saint-ephrem`,
        `DTSTAMP:${z(new Date().toISOString())}`,
        `DTSTART:${z(e.debut)}`, `DTEND:${z(e.fin)}`,
        `SUMMARY:${icsEsc(e.titre)}`, `DESCRIPTION:${icsEsc(e.description)}`,
        e.lieu ? `LOCATION:${icsEsc(e.lieu)}` : null,
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Rappel : rencontre de mi-année demain", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
      ].filter(Boolean);
      const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "rencontre-mi-annee-274e.ics";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    google(data) {
      const e = evt(data);
      const p = new URLSearchParams({ action: "TEMPLATE", text: e.titre, dates: `${z(e.debut)}/${z(e.fin)}`, details: e.description, location: e.lieu, ctz: "America/Toronto" });
      return `https://calendar.google.com/calendar/render?${p}`;
    },
    outlook(data) {
      const e = evt(data);
      const p = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.titre, body: e.description, location: e.lieu, startdt: new Date(e.debut).toISOString(), enddt: new Date(e.fin).toISOString() });
      return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
    },
  };
})();
