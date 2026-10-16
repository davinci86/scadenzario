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
  const aggiungi = (tabella, colonna, definizione) => {
    if (!colonne(tabella).includes(colonna)) db.exec(`ALTER TABLE ${tabella} ADD COLUMN ${colonna} ${definizione}`);
  };
  // La preferenza personale chiaro/scuro
  aggiungi("utenti", "tema", "TEXT NOT NULL DEFAULT 'chiaro'");
  // Dalla Tappa 3: preferenze personali e qualifica di titolare
  aggiungi("utenti", "minuti_blocco", "INTEGER NOT NULL DEFAULT 10");
  aggiungi("utenti", "email", "TEXT NOT NULL DEFAULT ''");
  aggiungi("utenti", "titolare", "INTEGER NOT NULL DEFAULT 0");
  // Dalla Tappa 3: blocco dello schermo
  aggiungi("sessioni", "bloccata", "INTEGER NOT NULL DEFAULT 0");
  aggiungi("sessioni", "tentativi_sblocco", "INTEGER NOT NULL DEFAULT 0");
  // Gestione utenti: password provvisoria da cambiare, utenti eliminati
  aggiungi("utenti", "cambia_password", "INTEGER NOT NULL DEFAULT 0"); // 1 = deve sceglierne una nuova
  aggiungi("utenti", "eliminato", "INTEGER"); // quando è stato eliminato (vuoto = no)
  // Menu laterale compresso (solo icone): preferenza personale
  aggiungi("utenti", "menu_compresso", "INTEGER NOT NULL DEFAULT 0");
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

    -- ── Dalla Tappa 3 ──────────────────────────────────────

    -- Le notifiche di ognuno: restano "da leggere" finché non si preme Letto
    CREATE TABLE IF NOT EXISTS notifiche (
      id          INTEGER PRIMARY KEY,
      utente_id   INTEGER NOT NULL REFERENCES utenti(id),
      scadenza_id INTEGER REFERENCES scadenze(id),
      tipo        TEXT NOT NULL DEFAULT 'evento',  -- 'evento' o 'promemoria'
      testo       TEXT NOT NULL,
      chiave      TEXT,      -- per non creare due volte lo stesso promemoria
      creata      INTEGER NOT NULL,
      letta       INTEGER,   -- quando è stata letta (vuoto = da leggere)
      avvisata    INTEGER NOT NULL DEFAULT 0,  -- 1 = il suono è già stato emesso
      UNIQUE (utente_id, chiave)
    );

    -- Le email in uscita (promemoria anonimi, senza nomi di clienti)
    CREATE TABLE IF NOT EXISTS email (
      id           INTEGER PRIMARY KEY,
      utente_id    INTEGER NOT NULL REFERENCES utenti(id),
      destinatario TEXT NOT NULL,
      oggetto      TEXT NOT NULL,
      testo        TEXT NOT NULL,
      creata       INTEGER NOT NULL,
      inviata      INTEGER,   -- quando è partita (vuoto = in coda)
      errore       TEXT
    );

    -- Ingressi e uscite: una riga per persona per giorno.
    -- Solo orari, nessun calcolo di ore.
    CREATE TABLE IF NOT EXISTS presenze (
      utente_id       INTEGER NOT NULL REFERENCES utenti(id),
      data            TEXT NOT NULL,     -- AAAA-MM-GG
      entrata         INTEGER NOT NULL,  -- primo accesso del giorno
      uscita          INTEGER,           -- ultima uscita con "Esci" (vuoto = non registrata)
      ultima_attivita INTEGER NOT NULL,
      PRIMARY KEY (utente_id, data)
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
