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

function ultimeAttivita(db, quante = 20) {
  return db
    .prepare(
      `SELECT r.quando, r.azione, r.dettaglio, u.nome
         FROM registro r LEFT JOIN utenti u ON u.id = r.utente_id
        ORDER BY r.id DESC LIMIT ?`
    )
    .all(quante);
}

module.exports = { registra, ultimeAttivita };
