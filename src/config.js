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

  // Blocco dello schermo: dopo quanti minuti di inattività (ognuno può
  // scegliere il suo valore nel profilo, da 1 a 20). Non si esce: si blocca.
  minutiBloccoPredefiniti: 10,
  minutiBloccoMin: 1,
  minutiBloccoMax: 20,

  // Rete di sicurezza: ogni sessione finisce comunque la notte, a quest'ora.
  oraFineSessione: 2,

  // Promemoria (dalla Tappa 3). Gli atti del catalogo hanno i loro;
  // questi valgono per le scadenze senza atto. Il giorno prima e
  // l'avviso di scadenza superata sono sempre attivi.
  promemoriaPredefiniti: [7, 1],
  promemoriaUdienzeOre: [48, 24],
  // Ogni quanti minuti il server controlla se ci sono promemoria da creare
  minutiControlloPromemoria: 5,

  // Fascicoli (dalla Tappa 4): dopo quanti giorni fuori dall'archivio
  // chi ha un fascicolo riceve un promemoria per rimetterlo a posto.
  giorniFascicoloFuori: 30,

  // Email: si configura sul server dello studio con le variabili d'ambiente.
  // Finché SMTP_HOST è vuoto, le email restano "in coda" e non partono.
  email: {
    host: process.env.SMTP_HOST || "",
    porta: Number(process.env.SMTP_PORT) || 587,
    utente: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASS || "",
    mittente: process.env.SMTP_FROM || "Scadenzario <scadenzario@studio.example>",
  },

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
