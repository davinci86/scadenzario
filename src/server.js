// ─────────────────────────────────────────────────────────────
// AVVIO
// È il file che parte con "npm start": apre il database e mette
// il server in ascolto. Da qui in poi il server resta acceso e
// risponde al browser finché non lo fermi (Ctrl + C).
// ─────────────────────────────────────────────────────────────
const config = require("./config");
const { apriDatabase } = require("./db/database");
const { inserisciUtentiDiProva, inserisciDatiDiProva, inserisciProvaTappa4 } = require("./db/seed");
const { creaApp } = require("./app");

const db = apriDatabase(config.percorsoDb);

if (config.sviluppo) {
  if (inserisciUtentiDiProva(db)) console.log("Creati gli utenti di prova (password per tutti: demo)");
  if (inserisciDatiDiProva(db)) console.log("Creati il catalogo e le scadenze di prova");
  if (inserisciProvaTappa4(db)) console.log("Creati fascicoli e segnalazioni di prova");
}

// ── Lavori programmati: promemoria ed email ──
// Ogni pochi minuti il server controlla se ci sono promemoria da creare
// e spedisce le email in coda (se il server di posta è configurato).
const { generaPromemoria } = require("./servizi/promemoria");
const { inviaEmailInCoda } = require("./servizi/email");
async function lavoriProgrammati() {
  try {
    const nuovi = generaPromemoria(db);
    if (nuovi) console.log(`Promemoria creati: ${nuovi}`);
    await inviaEmailInCoda(db);
  } catch (errore) {
    console.error("Errore nei lavori programmati:", errore.message);
  }
}
lavoriProgrammati();
setInterval(lavoriProgrammati, config.minutiControlloPromemoria * 60_000);

// ── Backup programmati: ogni 10 minuti (solo se qualcosa è cambiato),
//    più il giornaliero e il mensile. Vedi src/servizi/backup.js.
const { backupProgrammati } = require("./servizi/backup");
backupProgrammati(db);
setInterval(() => backupProgrammati(db), config.backup.minutiControllo * 60_000);

creaApp(db).listen(config.porta, () => {
  console.log(`Scadenzario avviato: apri http://localhost:${config.porta}`);
  console.log("Per fermarlo premi Ctrl + C");
});
