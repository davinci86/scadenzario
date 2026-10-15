// ─────────────────────────────────────────────────────────────
// IMPOSTAZIONI DELL'APP
// Tutti i valori "regolabili" stanno qui, in un posto solo.
// Ognuno si può cambiare anche senza toccare il codice, con una
// "variabile d'ambiente" (utile sul server dello studio).
// ─────────────────────────────────────────────────────────────
const path = require("node:path");

module.exports = {
  // La porta su cui il server risponde: http://localhost:3000
  porta: Number(process.env.PORTA) || 3000,

  // Il database è un unico file. È questo file che finisce nei backup.
  percorsoDb:
    process.env.DB_PATH || path.join(__dirname, "..", "dati", "scadenzario.db"),

  // Dopo quanti minuti senza fare nulla si viene disconnessi.
  minutiInattivita: Number(process.env.MINUTI_INATTIVITA) || 30,

  // Dopo quanti tentativi di accesso sbagliati l'utente viene bloccato…
  tentativiMassimi: 5,
  // …e per quanti minuti.
  minutiBlocco: 15,

  // Per gli atti fuori catalogo ("Altro"): i termini proposti, in giorni.
  terminiAltro: [10, 15, 20, 30, 60, 90],

  // In sviluppo (sul tuo Mac) il database si riempie da solo con gli
  // utenti di prova. Sul server dello studio questo NON succede.
  sviluppo: process.env.NODE_ENV !== "production",
};
