// ─────────────────────────────────────────────────────────────
// CHI PUÒ FARE COSA SULLE SCADENZE
// Le regole decise insieme, scritte come piccole funzioni.
// Si usano sia per mostrare/nascondere i pulsanti, sia (soprattutto)
// sul server, prima di eseguire qualsiasi modifica.
// ─────────────────────────────────────────────────────────────

// Admin ed Editor: creano, assegnano, correggono, ricalcolano.
const puoModificare = (utente) => utente.ruolo === "admin" || utente.ruolo === "editor";

const eAdmin = (utente) => utente.ruolo === "admin";

const inSquadra = (scadenza, utente) => scadenza.squadra.some((p) => p.id === utente.id);

// Cambiare lo stato, coinvolgere colleghi, cambiare referente, scrivere note:
// Admin ed Editor sempre; gli altri solo dove sono coinvolti.
const puoLavorare = (scadenza, utente) => puoModificare(utente) || inSquadra(scadenza, utente);

// Il registro degli ingressi: l'Admin e chi ha la qualifica di titolare.
const vedeIngressi = (utente) => utente.ruolo === "admin" || !!utente.titolare;

module.exports = { puoModificare, eAdmin, inSquadra, puoLavorare, vedeIngressi };
