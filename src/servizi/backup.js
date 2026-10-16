// ─────────────────────────────────────────────────────────────
// BACKUP E RIPRISTINO
//
// Il database è un unico file: un backup è una sua copia.
// Non basta copiare il file mentre l'app lavora (si rischia una copia
// "a metà"): usiamo VACUUM INTO, un comando di SQLite che scrive una
// copia completa e coerente anche mentre le persone lavorano.
// Dopo ogni copia controlliamo che il file sia integro (integrity_check),
// poi lo comprimiamo (gzip, già incluso in Node): un database si riduce
// di circa il 90%. Un anno di lavoro dello studio ≈ 2,5 MB, compresso ≈ 0,2 MB.
// I file .db.gz si aprono anche con 7-Zip, se un giorno servisse.
//
// I backup "a strati" decisi insieme:
//   auto           entro 10 minuti da una modifica
//   giornaliero    ogni sera dopo le 21
//   mensile        il primo giornaliero del mese
//   manuale        "Fai un backup adesso"
//   prima-del-ripristino  fatto da solo prima di ogni ripristino
//   prima-di-modifica     fatto da solo prima di cambiare i termini di un atto
// Per quanti giorni tenerli lo decide l'Admin (pagina Backup); 0 = per sempre.
// Ogni copia va nella cartella del server e, se configurata, sul NAS.
//
// Il ripristino riporta indietro tutti i dati TRANNE il Registro (che
// deve restare la prova di cosa è successo, ripristino compreso),
// le presenze, la coda delle email e le sessioni.
// ─────────────────────────────────────────────────────────────
const fs = require("node:fs");
const zlib = require("node:zlib");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../config");
const { registra } = require("../db/registro");
const { inTransazione } = require("../db/scadenze");
const { tabelleDeiDati } = require("../db/database");

const TIPI = {
  auto: "Automatico",
  giornaliero: "Giornaliero",
  mensile: "Mensile",
  manuale: "Fatto a mano",
  "prima-del-ripristino": "Prima di un ripristino",
  "prima-di-modifica": "Prima di una modifica dei termini",
};
// Il nome del file dice tutto: scadenzario_2026-10-16_14-30-00_auto.db.gz
// (Se due backup cadono nello stesso secondo, il secondo nome ha anche i millesimi.)
const NOME = /^scadenzario_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?_([a-z-]+)\.db\.gz$/;

// Lo stato in memoria (si azzera se il server riparte: va bene così)
const stato = {
  ultimoContatore: null,  // il contatore delle modifiche al momento dell'ultimo backup
  nas: { ok: null, errore: "", quando: null }, // esito dell'ultima copia sul NAS
  errore: "",             // l'ultimo errore dei backup programmati
};

const due = (n) => String(n).padStart(2, "0");
const giornoDi = (d) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
const contatore = (db) => db.prepare("SELECT n FROM modifiche WHERE id = 1").get()?.n ?? 0;
const sqlStringa = (testo) => `'${String(testo).replaceAll("'", "''")}'`;

function nomeFile(tipo, d = new Date(), millesimi = false) {
  const ms = millesimi ? `-${String(d.getMilliseconds()).padStart(3, "0")}` : "";
  return `scadenzario_${giornoDi(d)}_${due(d.getHours())}-${due(d.getMinutes())}-${due(d.getSeconds())}${ms}_${tipo}.db.gz`;
}

// Legge il nome di un file di backup. Restituisce null se non è un backup.
function leggiNome(nome) {
  const m = NOME.exec(nome);
  if (!m || !TIPI[m[8]]) return null;
  const quando = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] ?? 0));
  return { nome, tipo: m[8], quando, giorno: `${m[1]}-${m[2]}-${m[3]}` };
}

// Un file di backup è integro? (Lo apriamo in sola lettura e lo facciamo controllare a SQLite)
function controllaIntegrita(file) {
  const copia = new DatabaseSync(file, { readOnly: true });
  try {
    const esito = Object.values(copia.prepare("PRAGMA integrity_check").get())[0];
    if (esito !== "ok") throw new Error(`il file non è integro (${esito})`);
  } finally {
    copia.close();
  }
}

// Per usare un backup (ripristino, conteggi) lo decomprimiamo in un file
// temporaneo accanto ai backup; "usa" riceve il percorso, poi il file si cancella.
function conBackupAperto(nome, usa) {
  const temp = path.join(config.backup.cartella, `_in-uso-${process.pid}-${Date.now()}.db`);
  fs.writeFileSync(temp, zlib.gunzipSync(fs.readFileSync(path.join(config.backup.cartella, nome))));
  try { return usa(temp); } finally { fs.rmSync(temp, { force: true }); }
}

// ── Per quanti giorni tenere i backup (lo decide l'Admin) ────
function giorniDaTenere(db) {
  const salvati = Object.fromEntries(db.prepare("SELECT tipo, giorni FROM impostazioni_backup").all().map((r) => [r.tipo, r.giorni]));
  return Object.fromEntries(Object.keys(TIPI).map((t) => [t, salvati[t] ?? config.backup.giorniDaTenere[t] ?? 90]));
}
function salvaGiorniDaTenere(db, valori, autore) {
  const prima = giorniDaTenere(db);
  const cambi = [];
  for (const tipo of Object.keys(TIPI)) {
    const g = Number(valori[tipo]);
    if (!Number.isInteger(g) || g < 0 || g > 36500) return `Indica un numero di giorni valido per «${TIPI[tipo]}» (0 = per sempre).`;
    if (tipo === "auto" && g === 0) return "I backup automatici sono tanti: tienili al massimo qualche settimana (es. 3 giorni).";
    if (g !== prima[tipo]) cambi.push(`${TIPI[tipo]} ${prima[tipo] || "sempre"} → ${g || "sempre"}`);
    db.prepare("INSERT INTO impostazioni_backup (tipo, giorni) VALUES (?, ?) ON CONFLICT (tipo) DO UPDATE SET giorni = excluded.giorni").run(tipo, g);
  }
  if (cambi.length) registra(db, autore, "Backup", `Durata dei backup cambiata: ${cambi.join(", ")}`);
  pulisci(db);
}

// Copia un file in una cartella passando da un nome temporaneo:
// così nella cartella non resta mai un file copiato a metà.
function copiaSicura(da, cartella, nome) {
  const temp = path.join(cartella, nome + ".parziale");
  fs.copyFileSync(da, temp);
  fs.renameSync(temp, path.join(cartella, nome));
}

function copiaSulNas(db, file, nome) {
  const nas = config.backup.cartellaNas;
  if (!nas) { stato.nas = { ok: null, errore: "", quando: null }; return; }
  const eraOk = stato.nas.ok !== false;
  try {
    if (!fs.existsSync(nas)) throw new Error(`la cartella ${nas} non è raggiungibile`);
    copiaSicura(file, nas, nome);
    stato.nas = { ok: true, errore: "", quando: Date.now() };
  } catch (errore) {
    stato.nas = { ok: false, errore: errore.message, quando: Date.now() };
    // Nel registro solo quando smette di funzionare (non ogni 10 minuti)
    if (eraOk) registra(db, null, "Backup", `Copia sul NAS non riuscita: ${errore.message}`);
  }
}

// ── Fare un backup ───────────────────────────────────────────
function faiBackup(db, { tipo = "manuale", autore = null } = {}) {
  if (!TIPI[tipo]) throw new Error("Tipo di backup sconosciuto");
  const cartella = config.backup.cartella;
  fs.mkdirSync(cartella, { recursive: true });
  const adesso = new Date();
  let nome = nomeFile(tipo, adesso);
  if (fs.existsSync(path.join(cartella, nome))) nome = nomeFile(tipo, adesso, true); // stesso secondo: aggiungiamo i millesimi
  const finale = path.join(cartella, nome);

  const temp = finale.replace(/\.gz$/, ".parziale");
  fs.rmSync(temp, { force: true });
  const contatoreOra = contatore(db);
  try {
    db.exec(`VACUUM INTO ${sqlStringa(temp)}`); // 1. la copia
    controllaIntegrita(temp);                   // 2. il controllo
    fs.writeFileSync(finale + ".parziale", zlib.gzipSync(fs.readFileSync(temp), { level: 9 })); // 3. la compressione
    fs.renameSync(finale + ".parziale", finale);
  } finally {
    fs.rmSync(temp, { force: true });
    fs.rmSync(finale + ".parziale", { force: true });
  }
  stato.ultimoContatore = contatoreOra;

  copiaSulNas(db, finale, nome);
  pulisci(db);
  // Gli automatici sono tanti: nel Registro finiscono solo gli altri
  if (tipo !== "auto") registra(db, autore, "Backup", `${TIPI[tipo]}: ${nome}`);
  return leggiNome(nome);
}

// ── L'elenco dei backup (dalla cartella del server) ──────────
function elencoBackup() {
  const cartella = config.backup.cartella;
  if (!fs.existsSync(cartella)) return [];
  const nas = config.backup.cartellaNas;
  const sulNas = new Set(nas && fs.existsSync(nas) ? fs.readdirSync(nas) : []);
  return fs.readdirSync(cartella)
    .map(leggiNome).filter(Boolean)
    .map((b) => ({ ...b, dimensione: fs.statSync(path.join(cartella, b.nome)).size, sulNas: sulNas.has(b.nome) }))
    .sort((a, b) => b.quando - a.quando);
}

// Quanto spazio occupano i backup (sul server e sul NAS)
function spazioOccupato() {
  const somma = (cartella) => {
    if (!cartella || !fs.existsSync(cartella)) return null;
    return fs.readdirSync(cartella).filter((n) => leggiNome(n)).reduce((t, n) => t + fs.statSync(path.join(cartella, n)).size, 0);
  };
  return { server: somma(config.backup.cartella), nas: somma(config.backup.cartellaNas) };
}

// ── Togliere i backup troppo vecchi (dal server e dal NAS) ───
function pulisci(db, ora = Date.now()) {
  const durata = giorniDaTenere(db);
  for (const cartella of [config.backup.cartella, config.backup.cartellaNas].filter(Boolean)) {
    if (!fs.existsSync(cartella)) continue;
    for (const nome of fs.readdirSync(cartella)) {
      const file = path.join(cartella, nome);
      // Copie rimaste a metà (es. il server si è spento durante un backup)
      if (/\.parziale$|^_in-uso-/.test(nome) && ora - fs.statSync(file).mtimeMs > 86_400_000) { fs.rmSync(file, { force: true }); continue; }
      const b = leggiNome(nome);
      if (!b) continue; // non è un nostro backup: non lo tocchiamo
      const giorni = durata[b.tipo];
      if (giorni > 0 && ora - b.quando.getTime() > giorni * 86_400_000) fs.rmSync(file, { force: true });
    }
  }
}

// ── I backup programmati (li chiama il server ogni 10 minuti) ──
function backupProgrammati(db, ora = new Date()) {
  try {
    const fatti = [];
    // 1. Automatico: solo se qualcosa è cambiato dall'ultimo backup
    if (contatore(db) !== stato.ultimoContatore) fatti.push(faiBackup(db, { tipo: "auto" }));

    // 2. Giornaliero: dopo le 21; oppure subito, se ieri è saltato (server spento)
    const elenco = elencoBackup();
    const ieri = new Date(ora); ieri.setDate(ieri.getDate() - 1);
    const giornalieri = elenco.filter((b) => b.tipo === "giornaliero").map((b) => b.giorno);
    const haOggi = giornalieri.includes(giornoDi(ora));
    const haIeri = giornalieri.includes(giornoDi(ieri));
    if (!haOggi && (ora.getHours() >= config.backup.oraGiornaliero || !haIeri)) {
      fatti.push(faiBackup(db, { tipo: "giornaliero" }));
      // 3. Mensile: il primo giornaliero del mese vale anche come mensile
      const mese = giornoDi(ora).slice(0, 7);
      if (!elenco.some((b) => b.tipo === "mensile" && b.giorno.startsWith(mese))) fatti.push(faiBackup(db, { tipo: "mensile" }));
    }
    stato.errore = "";
    return fatti;
  } catch (errore) {
    stato.errore = `${new Date().toLocaleString("it-IT")}: ${errore.message}`;
    console.error("Errore nei backup:", errore.message);
    return [];
  }
}

// ── Quanti dati ci sono (per confrontare oggi e il backup) ────
function conteggi(db) {
  const conta = (sql) => { try { return db.prepare(sql).get().n; } catch { return null; } };
  return {
    scadenzeAperte: conta(`SELECT COUNT(*) AS n FROM scadenze WHERE stato NOT IN ('Depositato', 'Completato', 'Tenuta', 'Rinviata')`),
    scadenze: conta("SELECT COUNT(*) AS n FROM scadenze"),
    utenti: conta("SELECT COUNT(*) AS n FROM utenti WHERE attivo = 1"),
    segnalazioni: conta("SELECT COUNT(*) AS n FROM segnalazioni"),
    fascicoli: conta("SELECT COUNT(*) AS n FROM fascicoli"),
  };
}
function conteggiDelBackup(nome) {
  const b = leggiNome(String(nome));
  if (!b || !fs.existsSync(path.join(config.backup.cartella, b.nome))) return null;
  return conBackupAperto(b.nome, (file) => {
    const copia = new DatabaseSync(file, { readOnly: true });
    try { return conteggi(copia); } finally { copia.close(); }
  });
}

// ── Ripristinare un backup ───────────────────────────────────
// Restituisce un testo d'errore, oppure { prima } con il backup fatto prima.
function ripristina(db, nome, { admin, sessioneAdmin }) {
  const b = leggiNome(String(nome));  // solo nomi "nostri": niente percorsi strani
  if (!b || !fs.existsSync(path.join(config.backup.cartella, b.nome))) return "Backup non trovato.";
  return conBackupAperto(b.nome, (file) => ripristinaDaFile(db, file, b, { admin, sessioneAdmin }));
}

function ripristinaDaFile(db, file, b, { admin, sessioneAdmin }) {
  try { controllaIntegrita(file); } catch (errore) { return `Questo backup non si può usare: ${errore.message}.`; }

  // 1. Prima di tutto, una copia di com'è adesso: anche il ripristino si può annullare
  const prima = faiBackup(db, { tipo: "prima-del-ripristino", autore: admin.id });

  // 2. Si sostituiscono i dati, tabella per tabella, in un'unica transazione:
  //    o va tutto bene, o non cambia niente.
  db.exec("PRAGMA foreign_keys = OFF"); // durante lo scambio i collegamenti sono "a metà"
  db.exec(`ATTACH DATABASE ${sqlStringa(file)} AS copia`);
  try {
    inTransazione(db, () => {
      const nelBackup = new Set(tabelleDeiDati(db, "copia"));
      for (const t of tabelleDeiDati(db)) {
        db.exec(`DELETE FROM main."${t}"`);
        if (!nelBackup.has(t)) continue; // tabella nata dopo il backup: resta vuota
        // Solo le colonne che esistono in entrambi (il backup può essere di una versione precedente)
        const qui = db.prepare(`PRAGMA main.table_info("${t}")`).all().map((c) => c.name);
        const la = new Set(db.prepare(`PRAGMA copia.table_info("${t}")`).all().map((c) => c.name));
        const colonne = qui.filter((c) => la.has(c)).map((c) => `"${c}"`).join(", ");
        db.exec(`INSERT INTO main."${t}" (${colonne}) SELECT ${colonne} FROM copia."${t}"`);
      }
      // Le sessioni: resta collegata solo l'Admin che ha fatto il ripristino
      // (se nel backup esiste ancora come Admin attiva). Gli altri rientrano.
      const ancoraAdmin = db.prepare("SELECT 1 FROM utenti WHERE id = ? AND attivo = 1 AND ruolo = 'admin'").get(admin.id);
      db.prepare("DELETE FROM sessioni WHERE token_hash IS NOT ?").run(ancoraAdmin ? sessioneAdmin : null);
      if (!ancoraAdmin) db.exec("DELETE FROM sessioni");
      // Controllo finale: i collegamenti tra i dati ripristinati sono tutti validi?
      for (const t of tabelleDeiDati(db)) {
        if (db.prepare(`PRAGMA foreign_key_check("${t}")`).all().length) throw new Error(`collegamenti non validi nella tabella ${t}`);
      }
    });
  } catch (errore) {
    return `Ripristino non riuscito, nessun dato è stato cambiato: ${errore.message}.`;
  } finally {
    db.exec("DETACH DATABASE copia");
    db.exec("PRAGMA foreign_keys = ON");
  }

  // 3. Dopo un ripristino il prossimo backup automatico deve partire
  stato.ultimoContatore = null;
  registra(db, admin.id, "Backup", `Ripristinato il backup del ${b.quando.toLocaleString("it-IT")} (${b.nome}). ` +
    `Prima è stata salvata una copia: ${prima.nome}`);
  return { prima };
}

module.exports = {
  TIPI, stato, faiBackup, elencoBackup, backupProgrammati, ripristina, conteggi, conteggiDelBackup, leggiNome, pulisci,
  giorniDaTenere, salvaGiorniDaTenere, spazioOccupato,
};
