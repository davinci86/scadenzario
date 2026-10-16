// ─────────────────────────────────────────────────────────────
// REGISTRO ATTIVITÀ
// Una sola funzione per scrivere nel registro, usata da tutta l'app.
// Esiste solo "registra": per scelta, non c'è "modifica" né "cancella".
// ─────────────────────────────────────────────────────────────
function registra(db, utenteId, azione, dettaglio = "") {
  db.prepare(
    "INSERT INTO registro (quando, utente_id, azione, dettaglio) VALUES (?, ?, ?, ?)"
  ).run(Date.now(), utenteId ?? null, azione, dettaglio);
}

// Accessi e uscite riempirebbero il registro (sono decine al giorno):
// di solito non si mostrano. Gli orari del giorno sono già in "Ingressi".
// Gli accessi FALLITI invece restano sempre visibili: servono alla sicurezza.
const ACCESSI = ["Accesso", "Uscita"];

function ultimeAttivita(db, quante = 20, { conAccessi = false } = {}) {
  return db
    .prepare(
      `SELECT r.quando, r.azione, r.dettaglio, u.nome
         FROM registro r LEFT JOIN utenti u ON u.id = r.utente_id
        ${conAccessi ? "" : `WHERE r.azione NOT IN (${ACCESSI.map(() => "?").join(", ")})`}
        ORDER BY r.id DESC LIMIT ?`
    )
    .all(...(conAccessi ? [] : ACCESSI), quante);
}

module.exports = { registra, ultimeAttivita };
