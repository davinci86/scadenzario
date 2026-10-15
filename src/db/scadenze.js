// ─────────────────────────────────────────────────────────────
// SCADENZE: lettura e scrittura nel database
// Tutte le operazioni sulle tabelle scadenze, squadre e storico
// passano da qui. Le pagine non scrivono mai SQL direttamente.
// ─────────────────────────────────────────────────────────────
const { CHIUSI } = require("../dominio/stati");

// Esegue più scritture "tutte o nessuna": se una fallisce, si annulla tutto.
function inTransazione(db, fn) {
  db.exec("BEGIN");
  try {
    const risultato = fn();
    db.exec("COMMIT");
    return risultato;
  } catch (errore) {
    db.exec("ROLLBACK");
    throw errore;
  }
}

// Aggiunge a ogni scadenza l'elenco delle persone della sua squadra.
function conSquadre(db, righe) {
  const squadra = db.prepare(
    `SELECT u.id, u.nome, u.titolo FROM squadre q JOIN utenti u ON u.id = q.utente_id
      WHERE q.scadenza_id = ? ORDER BY u.id`
  );
  return righe.map((r) => ({ ...r, squadra: squadra.all(r.id) }));
}

// L'elenco della tabella, con i filtri scelti dall'utente.
// Ogni filtro aggiunge una condizione; i valori vanno nei "?" (mai nel testo SQL).
function elencoScadenze(db, filtri = {}) {
  const condizioni = [];
  const valori = [];

  if (!filtri.chiuse) {
    condizioni.push(`s.stato NOT IN (${CHIUSI.map(() => "?").join(", ")})`);
    valori.push(...CHIUSI);
  }
  if (filtri.tipo) { condizioni.push("s.tipo = ?"); valori.push(filtri.tipo); }
  if (filtri.stato) { condizioni.push("s.stato = ?"); valori.push(filtri.stato); }
  if (filtri.persona === "nessuno") {
    condizioni.push("NOT EXISTS (SELECT 1 FROM squadre q WHERE q.scadenza_id = s.id)");
  } else if (filtri.persona) {
    condizioni.push("EXISTS (SELECT 1 FROM squadre q WHERE q.scadenza_id = s.id AND q.utente_id = ?)");
    valori.push(Number(filtri.persona));
  }
  if (filtri.daVerificare) condizioni.push("s.da_verificare = 1");
  if (filtri.q) {
    const testo = `%${filtri.q}%`;
    condizioni.push("(s.cliente LIKE ? OR s.attivita LIKE ? OR s.ufficio LIKE ? OR s.fascicolo LIKE ? OR CAST(s.id AS TEXT) = ?)");
    valori.push(testo, testo, testo, testo, filtri.q);
  }

  const dove = condizioni.length ? "WHERE " + condizioni.join(" AND ") : "";
  const righe = db.prepare(`SELECT s.* FROM scadenze s ${dove} ORDER BY s.data, s.ora, s.id`).all(...valori);
  return conSquadre(db, righe);
}

function trovaScadenza(db, id) {
  const riga = db.prepare("SELECT * FROM scadenze WHERE id = ?").get(id);
  return riga ? conSquadre(db, [riga])[0] : null;
}

function storicoScadenza(db, id) {
  return db.prepare(
    `SELECT st.quando, st.testo, u.nome FROM storico st LEFT JOIN utenti u ON u.id = st.utente_id
      WHERE st.scadenza_id = ? ORDER BY st.id DESC`
  ).all(id);
}

function aggiungiStorico(db, scadenzaId, utenteId, testo) {
  db.prepare("INSERT INTO storico (scadenza_id, quando, utente_id, testo) VALUES (?, ?, ?, ?)")
    .run(scadenzaId, Date.now(), utenteId ?? null, testo);
}

// Crea una scadenza con la sua squadra. Restituisce il nuovo numero.
function creaScadenza(db, dati, squadra, utenteId) {
  return inTransazione(db, () => {
    const esito = db.prepare(
      `INSERT INTO scadenze (tipo, cliente, attivita, ufficio, fascicolo, atto_id, data_evento, calcolo,
                             data, ora, stato, da_verificare, referente_id, creata, creata_da)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(dati.tipo, dati.cliente, dati.attivita, dati.ufficio || "", dati.fascicolo || "",
      dati.atto_id ?? null, dati.data_evento || null, dati.calcolo || "", dati.data, dati.ora || "",
      dati.stato, dati.da_verificare ? 1 : 0, dati.referente_id ?? null, Date.now(), utenteId ?? null);
    const id = Number(esito.lastInsertRowid);
    for (const persona of squadra) aggiungiAllaSquadra(db, id, persona);
    return id;
  });
}

// Aggiorna solo i campi indicati (e solo quelli ammessi).
const CAMPI_MODIFICABILI = ["stato", "data", "ora", "data_evento", "calcolo", "da_verificare",
  "correzione_manuale", "referente_id", "rinviata_a"];
function aggiornaScadenza(db, id, campi) {
  const chiavi = Object.keys(campi).filter((k) => CAMPI_MODIFICABILI.includes(k));
  if (!chiavi.length) return;
  db.prepare(`UPDATE scadenze SET ${chiavi.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...chiavi.map((k) => campi[k]), id);
}

function aggiungiAllaSquadra(db, scadenzaId, utenteId) {
  db.prepare("INSERT OR IGNORE INTO squadre (scadenza_id, utente_id) VALUES (?, ?)").run(scadenzaId, utenteId);
}
function togliDallaSquadra(db, scadenzaId, utenteId) {
  db.prepare("DELETE FROM squadre WHERE scadenza_id = ? AND utente_id = ?").run(scadenzaId, utenteId);
}

const utentiAttivi = (db) =>
  db.prepare("SELECT id, nome, titolo, ruolo FROM utenti WHERE attivo = 1 ORDER BY id").all();

module.exports = { inTransazione, elencoScadenze, trovaScadenza, storicoScadenza, aggiungiStorico,
  creaScadenza, aggiornaScadenza, aggiungiAllaSquadra, togliDallaSquadra, utentiAttivi };
