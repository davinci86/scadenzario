// ─────────────────────────────────────────────────────────────
// UTENTI: le operazioni dell'Admin sul database
//
// Tre "vite" possibili per un utente:
//  • attivo       entra e lavora
//  • disattivato  non entra, ma resta in elenco e si può riattivare
//                 (es. un'assenza lunga)
//  • eliminato    non entra e sparisce dagli elenchi. La riga però RESTA
//                 nel database: lo storico, le note e il registro devono
//                 continuare a dire chi ha fatto cosa. Si cancellano solo
//                 i dati personali che non servono più (email, password).
// ─────────────────────────────────────────────────────────────
const crypto = require("node:crypto");
const { creaHash } = require("../auth/password");
const { inTransazione, aggiungiStorico, togliDallaSquadra } = require("./scadenze");
const { CHIUSI } = require("../dominio/stati");

const RUOLI_VALIDI = ["admin", "editor", "collab"];

// Il nome utente: lettere minuscole, numeri, punto, trattino. Es. m.rossi
const NOME_UTENTE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const PASSWORD_MINIMA = 8;

const CAMPI = "id, nome_utente, nome, titolo, ruolo, attivo, bloccato_fino, titolare, email, cambia_password, eliminato";

const elencoUtenti = (db) => db.prepare(`SELECT ${CAMPI} FROM utenti WHERE eliminato IS NULL ORDER BY attivo DESC, nome`).all();
const utentiEliminati = (db) => db.prepare(`SELECT id, nome, titolo, eliminato FROM utenti WHERE eliminato IS NOT NULL ORDER BY eliminato DESC`).all();
const trovaUtente = (db, id) => db.prepare(`SELECT ${CAMPI} FROM utenti WHERE id = ? AND eliminato IS NULL`).get(Number(id));

// Quanti Admin attivi ci sono (deve restarne sempre almeno uno)
const adminAttivi = (db) =>
  db.prepare("SELECT COUNT(*) AS n FROM utenti WHERE ruolo = 'admin' AND attivo = 1 AND eliminato IS NULL").get().n;

// Le attività aperte in cui la persona è in squadra
function attivitaAperte(db, id) {
  return db.prepare(
    `SELECT s.id, s.cliente, s.referente_id FROM scadenze s JOIN squadre q ON q.scadenza_id = s.id
      WHERE q.utente_id = ? AND s.stato NOT IN (${CHIUSI.map(() => "?").join(", ")}) ORDER BY s.data`
  ).all(Number(id), ...CHIUSI);
}

// Controlla i dati di un modulo "utente". Restituisce { dati, errori }.
function controllaDati(db, corpo, { id = null, nuovo = false } = {}) {
  const testo = (campo, max) => String(corpo?.[campo] ?? "").trim().slice(0, max);
  const dati = {
    nome: testo("nome", 80),
    titolo: testo("titolo", 60),
    nome_utente: testo("nome_utente", 30).toLowerCase(),
    ruolo: String(corpo?.ruolo ?? ""),
    email: testo("email", 200),
    titolare: corpo?.titolare === "1" ? 1 : 0,
  };
  const errori = [];
  if (dati.nome.length < 2) errori.push("Scrivi nome e cognome.");
  if (!NOME_UTENTE.test(dati.nome_utente)) {
    errori.push("Il nome utente deve avere da 3 a 30 caratteri: lettere minuscole, numeri, punto o trattino (es. m.rossi).");
  } else if (db.prepare("SELECT id FROM utenti WHERE nome_utente = ? AND id IS NOT ?").get(dati.nome_utente, id)) {
    errori.push(`Il nome utente «${dati.nome_utente}» è già usato.`);
  }
  if (!RUOLI_VALIDI.includes(dati.ruolo)) errori.push("Scegli il ruolo.");
  if (dati.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dati.email)) errori.push("L'indirizzo email non sembra valido.");
  if (nuovo) {
    dati.password = String(corpo?.password ?? "");
    if (dati.password.length < PASSWORD_MINIMA) errori.push(`La password provvisoria deve avere almeno ${PASSWORD_MINIMA} caratteri.`);
  }
  return { dati, errori };
}

function creaUtente(db, dati) {
  return Number(db.prepare(
    `INSERT INTO utenti (nome_utente, nome, titolo, ruolo, email, titolare, password_hash, cambia_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(dati.nome_utente, dati.nome, dati.titolo, dati.ruolo, dati.email, dati.titolare, creaHash(dati.password)).lastInsertRowid);
}

function aggiornaUtente(db, id, dati) {
  db.prepare("UPDATE utenti SET nome_utente = ?, nome = ?, titolo = ?, ruolo = ?, email = ?, titolare = ? WHERE id = ?")
    .run(dati.nome_utente, dati.nome, dati.titolo, dati.ruolo, dati.email, dati.titolare, Number(id));
}

// Nuova password. "provvisoria" = alla prossima entrata dovrà cambiarla.
// Tutte le sessioni aperte di quella persona si chiudono (tranne "tranneToken").
function impostaPassword(db, id, password, { provvisoria, tranneSessione = null } = {}) {
  db.prepare("UPDATE utenti SET password_hash = ?, cambia_password = ?, tentativi_falliti = 0, bloccato_fino = NULL WHERE id = ?")
    .run(creaHash(password), provvisoria ? 1 : 0, Number(id));
  db.prepare("DELETE FROM sessioni WHERE utente_id = ? AND token_hash IS NOT ?").run(Number(id), tranneSessione);
}

const sbloccaAccesso = (db, id) =>
  db.prepare("UPDATE utenti SET tentativi_falliti = 0, bloccato_fino = NULL WHERE id = ?").run(Number(id));

function impostaAttivo(db, id, attivo) {
  db.prepare("UPDATE utenti SET attivo = ? WHERE id = ?").run(attivo ? 1 : 0, Number(id));
  if (!attivo) db.prepare("DELETE FROM sessioni WHERE utente_id = ?").run(Number(id)); // esce subito
}

// Elimina: vedi la spiegazione in cima al file.
function eliminaUtente(db, id, autoreId) {
  const persona = trovaUtente(db, id);
  return inTransazione(db, () => {
    // 1. Esce dalle squadre delle attività ancora aperte (lo storico lo annota)
    for (const s of attivitaAperte(db, id)) {
      togliDallaSquadra(db, s.id, persona.id);
      if (s.referente_id === persona.id) {
        const altro = db.prepare("SELECT utente_id FROM squadre WHERE scadenza_id = ? LIMIT 1").get(s.id);
        db.prepare("UPDATE scadenze SET referente_id = ? WHERE id = ?").run(altro ? altro.utente_id : null, s.id);
      }
      aggiungiStorico(db, s.id, autoreId, `Tolto dalla squadra: ${persona.nome} (utente eliminato)`);
    }
    // 2. Niente più accesso, niente più dati personali inutili.
    //    Il nome utente viene liberato (potrà usarlo una persona nuova).
    db.prepare("DELETE FROM sessioni WHERE utente_id = ?").run(persona.id);
    db.prepare(
      `UPDATE utenti SET attivo = 0, eliminato = ?, email = '', titolare = 0, cambia_password = 0,
              nome_utente = ?, password_hash = ? WHERE id = ?`
    ).run(Date.now(), `eliminato-${persona.id}`, creaHash(crypto.randomBytes(24).toString("hex")), persona.id);
  });
}

module.exports = {
  RUOLI_VALIDI, PASSWORD_MINIMA, elencoUtenti, utentiEliminati, trovaUtente, adminAttivi, attivitaAperte,
  controllaDati, creaUtente, aggiornaUtente, impostaPassword, sbloccaAccesso, impostaAttivo, eliminaUtente,
};
