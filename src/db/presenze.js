// ─────────────────────────────────────────────────────────────
// INGRESSI E USCITE
// Per ogni persona e ogni giorno: l'ora del primo accesso e l'ora
// dell'uscita con "Esci". Se qualcuno non esce, resta l'ultima attività.
// Solo orari: nessun calcolo di ore lavorate.
// ─────────────────────────────────────────────────────────────
const { oggi } = require("../dominio/date");

// Al login: se è il primo accesso del giorno si registra l'entrata;
// se era già uscito e rientra, l'uscita precedente si azzera.
function registraEntrata(db, utenteId, ora = Date.now(), giorno = oggi()) {
  db.prepare(
    `INSERT INTO presenze (utente_id, data, entrata, ultima_attivita) VALUES (?, ?, ?, ?)
     ON CONFLICT (utente_id, data) DO UPDATE SET uscita = NULL, ultima_attivita = excluded.ultima_attivita`
  ).run(utenteId, giorno, ora, ora);
}

// A ogni pagina aperta dalla persona: aggiorna l'ultima attività del giorno.
function registraAttivita(db, utenteId, ora = Date.now(), giorno = oggi()) {
  db.prepare(
    `INSERT INTO presenze (utente_id, data, entrata, ultima_attivita) VALUES (?, ?, ?, ?)
     ON CONFLICT (utente_id, data) DO UPDATE SET ultima_attivita = excluded.ultima_attivita`
  ).run(utenteId, giorno, ora, ora);
}

// Con "Esci": l'uscita del giorno.
function registraUscita(db, utenteId, ora = Date.now(), giorno = oggi()) {
  db.prepare("UPDATE presenze SET uscita = ?, ultima_attivita = ? WHERE utente_id = ? AND data = ?")
    .run(ora, ora, utenteId, giorno);
}

// Il registro di un giorno: tutte le persone attive, entrate o no.
function presenzeDelGiorno(db, giorno) {
  return db.prepare(
    `SELECT u.id, u.nome, u.titolo, p.entrata, p.uscita, p.ultima_attivita
       FROM utenti u LEFT JOIN presenze p ON p.utente_id = u.id AND p.data = ?
      WHERE u.attivo = 1 ORDER BY p.entrata IS NULL, p.entrata, u.id`
  ).all(giorno);
}

module.exports = { registraEntrata, registraAttivita, registraUscita, presenzeDelGiorno };
