// ─────────────────────────────────────────────────────────────
// AVVIO
// È il file che parte con "npm start": apre il database e mette
// il server in ascolto. Da qui in poi il server resta acceso e
// risponde al browser finché non lo fermi (Ctrl + C).
// ─────────────────────────────────────────────────────────────
const config = require("./config");
const { apriDatabase } = require("./db/database");
const { inserisciUtentiDiProva } = require("./db/seed");
const { creaApp } = require("./app");

const db = apriDatabase(config.percorsoDb);

if (config.sviluppo && inserisciUtentiDiProva(db)) {
  console.log("Creati gli utenti di prova (password per tutti: demo)");
}

creaApp(db).listen(config.porta, () => {
  console.log(`Scadenzario avviato: apri http://localhost:${config.porta}`);
  console.log("Per fermarlo premi Ctrl + C");
});
