// ─────────────────────────────────────────────────────────────
// IL TUTORIAL: i passi del giro guidato
// Parte da solo al primo accesso (dopo la scelta della password) e si
// può rivedere dal menu sul nome o dalla Guida. È diverso per ruolo:
// ognuno vede solo quello che può fare.
//
// Ogni passo: dove puntare ("dove": un selettore CSS della dashboard;
// vuoto = al centro dello schermo), titolo e testo. Se l'elemento non c'è
// (es. la voce Ingressi per chi non è titolare) il passo si salta da solo.
// I testi si correggono qui.
// ─────────────────────────────────────────────────────────────
const { esc } = require("./html");

function passiTutorial(utente) {
  const nome = utente.nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ")[0];
  const editor = utente.ruolo === "admin" || utente.ruolo === "editor";
  const admin = utente.ruolo === "admin";
  return [
    { titolo: `Benvenuto nello Scadenzario, ${nome}`,
      testo: "Un giro di un minuto per orientarti. Puoi usare i pulsanti o le frecce della tastiera; «Salta» chiude il giro. Lo ritrovi quando vuoi nel menu sul tuo nome." },
    { dove: ".barra-voci a[href='/']", titolo: "La dashboard",
      testo: "È questa pagina: raccoglie quello che riguarda te. Ci torni sempre da qui." },
    { dove: ".testata-dash .contatori", titolo: "A colpo d'occhio",
      testo: "Quante cose hai da leggere, quante tue scadenze sono superate, quante cadono entro 7 giorni, le udienze della settimana." },
    { dove: ".griglia-dash > .colonna", titolo: "Le tue cose",
      testo: "Segnalazioni dei colleghi, fascicoli da confermare, notifiche da leggere, le tue scadenze e udienze. Un clic apre il pannello laterale, il doppio clic una nuova scheda. La ★ indica dove sei referente." },
    editor && { dove: ".griglia-dash > aside", titolo: "Tutto lo studio",
      testo: "Tu vedi anche il quadro dello studio: scadute, da verificare. Più in basso «Da assegnare» e «Chi ha cosa»." },
    { dove: ".barra-voci a[href='/scadenzario']", titolo: "Lo scadenzario",
      testo: "La tabella di tutto lo studio, come il foglio Word di sempre: i colori sono gli stati. Si cerca e si filtra per tipo, stato e persona." },
    editor && { dove: ".barra-voci a[href='/scadenzario']", titolo: "Inserire una scadenza",
      testo: "Nello scadenzario c'è «+ Nuova scadenza»: scegli l'atto e l'app calcola il termine. La squadra si propone da sola in base alla categoria, e puoi cambiarla." },
    { dove: ".barra-voci a[href='/segnalazioni']", titolo: "Segnalazioni",
      testo: "Messaggi per attirare l'attenzione di un collega su qualcosa: con priorità e conferma di lettura. Il numerino dice quante ne hai da leggere." },
    { dove: ".barra-voci a[href='/fascicoli']", titolo: "Fascicoli",
      testo: "Dov'è un fascicolo cartaceo e chi ce l'ha. Quando un collega te ne consegna uno, confermi di averlo ricevuto." },
    { dove: ".barra-voci a[href='/ingressi']", titolo: "Ingressi",
      testo: "Gli orari di entrata e di uscita del giorno, per chi ha la qualifica di titolare." },
    admin && { dove: ".barra-voci a[href='/admin/utenti']", titolo: "Utenti",
      testo: "Chi può entrare e con quale ruolo: nuovi utenti, password provvisorie, disattivare o eliminare." },
    admin && { dove: ".barra-voci a[href='/admin/registro']", titolo: "Registro",
      testo: "Tutto quello che succede nell'app, chi e quando. Non si può modificare." },
    admin && { dove: ".barra-voci a[href='/admin/backup']", titolo: "Backup",
      testo: "Le copie di sicurezza si fanno da sole. Da qui ne fai una a mano, scegli per quanto tenerle e, se serve, ripristini." },
    admin && { dove: ".barra-voci a[href='/admin/impostazioni']", titolo: "Impostazioni",
      testo: "Il catalogo degli atti e dei termini, le categorie con le loro squadre, festività e chiusure, i valori predefiniti. Solo tu puoi cambiarli." },
    { dove: "[data-campanella]", titolo: "La campanella",
      testo: "Notifiche e promemoria: suona una volta quando ne arriva una nuova. Restano da leggere finché non premi «Letto»." },
    { dove: "[data-menu-utente]", titolo: "Il menu sul tuo nome",
      testo: "Il tuo profilo, il tema chiaro o scuro, «Esci» e «Blocca lo schermo». Quando ti allontani bloccalo subito, anche con Ctrl+Alt+L." },
    { dove: ".barra-voci a[href='/guida']", titolo: "La guida",
      testo: "Come funziona tutto, con la ricerca, e le procedure dello studio. Nelle pagine trovi anche le piccole «i»: passaci sopra per una spiegazione." },
    { titolo: "Fatto!", testo: "Buon lavoro. Il giro lo ritrovi nel menu sul tuo nome, alla voce «Rivedi il tutorial»." },
  ].filter(Boolean);
}

// Il segnaposto nella pagina: i passi viaggiano in un attributo (mai come codice)
const segnapostoTutorial = (utente) => `<div id="tutorial" hidden data-passi="${esc(JSON.stringify(passiTutorial(utente)))}"></div>`;

module.exports = { passiTutorial, segnapostoTutorial };
