// ─────────────────────────────────────────────────────────────
// NOTIFICHE
// Ogni notifica appartiene a una persona e resta "da leggere" finché
// la persona non preme "Letto". La "chiave" evita i doppioni: lo stesso
// promemoria (es. "scade tra 7 giorni" per la scadenza N. 4) si crea una volta sola.
// ─────────────────────────────────────────────────────────────

// Crea una notifica per ciascuna persona indicata (tranne chi ha fatto l'azione).
// Restituisce gli id delle persone che l'hanno ricevuta davvero (nuova).
// "link" (facoltativo): la pagina a cui porta, es. /segnalazioni
function notifica(db, { utenti, scadenzaId = null, testo, tipo = "evento", chiave = null, autore = null, link = null }) {
  const inserisci = db.prepare(
    `INSERT OR IGNORE INTO notifiche (utente_id, scadenza_id, tipo, testo, chiave, creata, link)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const ricevute = [];
  for (const id of new Set(utenti)) {
    if (!id || id === autore) continue;
    const esito = inserisci.run(id, scadenzaId, tipo, testo, chiave, Date.now(), link);
    if (esito.changes) ricevute.push(id);
  }
  return ricevute;
}

function notificheDi(db, utenteId, { limite = 30, soloDaLeggere = false } = {}) {
  return db.prepare(
    `SELECT n.id, n.testo, n.tipo, n.creata, n.letta, n.avvisata, n.scadenza_id, n.link,
            s.cliente, s.attivita
       FROM notifiche n LEFT JOIN scadenze s ON s.id = n.scadenza_id
      WHERE n.utente_id = ? ${soloDaLeggere ? "AND n.letta IS NULL" : ""}
      ORDER BY n.letta IS NOT NULL, n.id DESC LIMIT ?`
  ).all(utenteId, limite);
}

const quanteDaLeggere = (db, utenteId) =>
  db.prepare("SELECT COUNT(*) AS n FROM notifiche WHERE utente_id = ? AND letta IS NULL").get(utenteId).n;

// Segna lette tutte le notifiche con una certa chiave (es. quando si legge
// la segnalazione, o si conferma un fascicolo, quella notifica non serve più)
function segnaLetteConChiave(db, chiave, utenteId = null) {
  db.prepare(`UPDATE notifiche SET letta = ? WHERE chiave = ? AND letta IS NULL ${utenteId ? "AND utente_id = ?" : ""}`)
    .run(Date.now(), chiave, ...(utenteId ? [utenteId] : []));
}

// Si può segnare come letta solo una notifica propria.
function segnaLetta(db, id, utenteId) {
  db.prepare("UPDATE notifiche SET letta = ? WHERE id = ? AND utente_id = ? AND letta IS NULL").run(Date.now(), id, utenteId);
}
function segnaTutteLette(db, utenteId) {
  db.prepare("UPDATE notifiche SET letta = ? WHERE utente_id = ? AND letta IS NULL").run(Date.now(), utenteId);
}

// Il suono si emette una volta sola per notifica: dopo, la segniamo "avvisata".
function segnaAvvisate(db, ids, utenteId) {
  const aggiorna = db.prepare("UPDATE notifiche SET avvisata = 1 WHERE id = ? AND utente_id = ?");
  for (const id of ids) aggiorna.run(Number(id), utenteId);
}

module.exports = { notifica, notificheDi, quanteDaLeggere, segnaLetta, segnaLetteConChiave, segnaTutteLette, segnaAvvisate };
