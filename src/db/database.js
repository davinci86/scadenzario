// ─────────────────────────────────────────────────────────────
// DATABASE
// Usiamo SQLite, già incluso in Node.js: niente da installare.
// Il database è un unico file (dati/scadenzario.db).
// Dentro ci sono "tabelle", come fogli Excel: righe e colonne.
// ─────────────────────────────────────────────────────────────
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

function apriDatabase(percorso) {
  // ":memory:" = database temporaneo in memoria, lo usano i test.
  if (percorso !== ":memory:") {
    fs.mkdirSync(path.dirname(percorso), { recursive: true });
  }
  const db = new DatabaseSync(percorso);

  // Controlla che i collegamenti tra tabelle siano sempre validi
  // (es. una sessione deve appartenere a un utente che esiste).
  db.exec("PRAGMA foreign_keys = ON;");

  creaTabelle(db);
  return db;
}

// Crea le tabelle se non esistono ancora. "IF NOT EXISTS" fa sì che,
// riavviando l'app, le tabelle già piene non vengano toccate.
function creaTabelle(db) {
  db.exec(`
    -- Le persone che possono accedere
    CREATE TABLE IF NOT EXISTS utenti (
      id                INTEGER PRIMARY KEY,
      nome_utente       TEXT NOT NULL UNIQUE,  -- es. a.ferrara
      nome              TEXT NOT NULL,         -- es. Anna Ferrara
      titolo            TEXT NOT NULL DEFAULT '', -- es. Segreteria, Avvocato
      ruolo             TEXT NOT NULL CHECK (ruolo IN ('admin', 'editor', 'collab')),
      password_hash     TEXT NOT NULL,         -- mai la password vera!
      attivo            INTEGER NOT NULL DEFAULT 1,  -- 1 = sì, 0 = disattivato
      tentativi_falliti INTEGER NOT NULL DEFAULT 0,
      bloccato_fino     INTEGER                -- ora (in millisecondi) o vuoto
    );

    -- Chi è collegato in questo momento
    CREATE TABLE IF NOT EXISTS sessioni (
      token_hash      TEXT PRIMARY KEY,
      utente_id       INTEGER NOT NULL REFERENCES utenti(id),
      creata          INTEGER NOT NULL,
      ultima_attivita INTEGER NOT NULL
    );

    -- Il registro attività: ogni azione importante, con chi e quando.
    -- Nell'app non c'è nessuna funzione che modifica o cancella righe qui.
    CREATE TABLE IF NOT EXISTS registro (
      id        INTEGER PRIMARY KEY,
      quando    INTEGER NOT NULL,
      utente_id INTEGER REFERENCES utenti(id),
      azione    TEXT NOT NULL,
      dettaglio TEXT NOT NULL DEFAULT ''
    );
  `);
}

module.exports = { apriDatabase };
