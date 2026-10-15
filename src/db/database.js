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
  aggiornaTabelle(db);
  return db;
}

// Aggiunge le colonne nate dopo la creazione delle tabelle.
// (Così un database già esistente si aggiorna da solo, senza perdere dati.)
function aggiornaTabelle(db) {
  const colonne = (tabella) => db.prepare(`PRAGMA table_info(${tabella})`).all().map((c) => c.name);
  if (!colonne("utenti").includes("tema")) {
    // La preferenza personale chiaro/scuro
    db.exec("ALTER TABLE utenti ADD COLUMN tema TEXT NOT NULL DEFAULT 'chiaro'");
  }
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
    -- ── Dalla Tappa 2 ──────────────────────────────────────

    -- Il catalogo degli atti: per ogni atto, come si calcola il termine
    CREATE TABLE IF NOT EXISTS atti (
      id                  INTEGER PRIMARY KEY,
      nome                TEXT NOT NULL,
      materia             TEXT NOT NULL,
      tipo                TEXT NOT NULL CHECK (tipo IN ('scadenza', 'adempimento')),
      evento              TEXT NOT NULL CHECK (evento IN ('notifica', 'deposito', 'comunicazione', 'invio', 'udienza')),
      direzione           TEXT NOT NULL CHECK (direzione IN ('avanti', 'ritroso')),
      giorni              INTEGER NOT NULL CHECK (giorni > 0),
      sospensione_feriale INTEGER NOT NULL DEFAULT 1,
      sposta_giorno_utile INTEGER NOT NULL DEFAULT 1,
      promemoria          TEXT NOT NULL DEFAULT '7,1',  -- giorni prima, separati da virgola
      attivo              INTEGER NOT NULL DEFAULT 1
    );

    -- Chiusure aggiunte dallo studio (oltre alle festività nazionali)
    CREATE TABLE IF NOT EXISTS chiusure (
      data   TEXT PRIMARY KEY,   -- AAAA-MM-GG
      motivo TEXT NOT NULL
    );

    -- Le scadenze (comprese udienze e adempimenti): una riga per riga della tabella Word
    CREATE TABLE IF NOT EXISTS scadenze (
      id                 INTEGER PRIMARY KEY,    -- è anche il "N." della tabella
      tipo               TEXT NOT NULL CHECK (tipo IN ('scadenza', 'adempimento', 'udienza')),
      cliente            TEXT NOT NULL,
      attivita           TEXT NOT NULL,
      ufficio            TEXT NOT NULL DEFAULT '',
      fascicolo          TEXT NOT NULL DEFAULT '',
      atto_id            INTEGER REFERENCES atti(id),  -- vuoto per udienze e atti "Altro"
      data_evento        TEXT,                    -- la decorrenza (es. la notifica)
      calcolo            TEXT NOT NULL DEFAULT '',-- come è stata calcolata, a parole
      data               TEXT NOT NULL,           -- la scadenza (o la data dell'udienza)
      ora                TEXT NOT NULL DEFAULT '',
      stato              TEXT NOT NULL,
      da_verificare      INTEGER NOT NULL DEFAULT 0,  -- 1 = atto fuori catalogo, deve controllare l'Admin
      correzione_manuale TEXT,                    -- il motivo, se la data è stata corretta a mano
      referente_id       INTEGER REFERENCES utenti(id),
      rinviata_a         INTEGER REFERENCES scadenze(id), -- per le udienze rinviate
      creata             INTEGER NOT NULL,
      creata_da          INTEGER REFERENCES utenti(id)
    );

    -- Chi se ne occupa: una riga per ogni persona di ogni scadenza
    CREATE TABLE IF NOT EXISTS squadre (
      scadenza_id INTEGER NOT NULL REFERENCES scadenze(id),
      utente_id   INTEGER NOT NULL REFERENCES utenti(id),
      PRIMARY KEY (scadenza_id, utente_id)
    );

    -- Lo storico di ogni scadenza: tutto quello che le è successo
    CREATE TABLE IF NOT EXISTS storico (
      id          INTEGER PRIMARY KEY,
      scadenza_id INTEGER NOT NULL REFERENCES scadenze(id),
      quando      INTEGER NOT NULL,
      utente_id   INTEGER REFERENCES utenti(id),
      testo       TEXT NOT NULL
    );

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
