// ─────────────────────────────────────────────────────────────
// LE "i" CON LA SPIEGAZIONE
// Tutti i testi stanno qui, in un posto solo: per correggerne uno
// basta cambiare la frase qui sotto. Brevi, in linguaggio da studio.
//
// aiuto("chiave") mette nella pagina il cerchietto con la "i".
// Il comportamento (clic, passaggio del mouse, Esc) è in public/js/aiuti.js.
// Gli avvisi importanti NON vanno qui: devono restare sempre a schermo.
// ─────────────────────────────────────────────────────────────
const { esc } = require("./html");

const AIUTI = {
  // ── Nuova scadenza ──
  tipo: "Scadenza: un termine da rispettare (es. un ricorso). Adempimento: una cosa da fare per lo studio o per il cliente " +
    "(es. un sollecito). Udienza: un appuntamento in tribunale, con data e ora.",
  atto: "Scegli l'atto dal catalogo: l'app calcola da sola il termine con le regole dello studio (decorrenza, giorni, " +
    "sospensione feriale, festivi). Se l'atto non c'è scegli «Altro»: il termine lo indichi tu e l'Admin dovrà verificarlo.",
  categoria: "La categoria raggruppa gli atti per materia (es. Immigrazione). Per un atto del catalogo è già decisa dall'atto; " +
    "per udienze e atti «Altro» la scegli tu. Dalla categoria dipende la squadra proposta qui sotto.",
  decorrenza: "Il giorno da cui parte il conteggio, ad esempio la data di notifica del provvedimento. " +
    "Il nome del campo cambia in base all'atto scelto. Sotto compare subito la scadenza calcolata.",
  termineAltro: "Per un atto fuori catalogo scegli il termine tra quelli proposti, oppure «Forza la data a mano» se la data " +
    "la conosci già. In entrambi i casi la scadenza resta «da verificare» finché l'Admin non la controlla.",
  feriale: "Dal 1° al 31 agosto i termini processuali sono sospesi: quei giorni non si contano e la scadenza slitta in avanti. " +
    "Togli la spunta per gli adempimenti che non si fermano ad agosto.",
  squadra: "Le persone che lavorano su questa attività: ricevono i promemoria e possono cambiarne lo stato. Se la categoria " +
    "ha una squadra predefinita è già spuntata, e puoi cambiarla. Se non scegli nessuno resta «Da assegnare» e i promemoria " +
    "vanno ad Admin ed Editor.",
  referente: "Il referente ★ è chi ne risponde: riceve l'avviso se la scadenza viene superata. Deve far parte della squadra.",

  // ── Scheda della scadenza ──
  stati: "Lo stato dice a che punto è il lavoro e colora la riga dello scadenzario, come un evidenziatore. " +
    "Quando l'attività è chiusa (es. «Depositato») esce dallo scadenzario e non manda più promemoria.",
  rinvio: "Se l'udienza viene rinviata indica la nuova data: questa diventa «Rinviata» e l'app crea la nuova udienza, " +
    "con la stessa squadra e collegata a questa.",
  squadraScheda: "«Coinvolgi» aggiunge una persona, «Togli» la rimuove, «Rendi referente» sposta la ★. Ogni cambio finisce " +
    "nello storico e chi viene coinvolto riceve una notifica.",
  nota: "La nota resta nello storico della scadenza, con il tuo nome e l'ora: la vede chiunque la apra. " +
    "Per avvisare qualcuno in particolare usa «Segnala a un collega».",
  storico: "Tutto quello che è successo a questa attività: inserimento, stati, assegnazioni, note, correzioni. " +
    "Chi e quando. Non si può modificare né cancellare.",
  ricalcola: (atto) => `Se la decorrenza era sbagliata o è cambiata (es. una nuova notifica), indica la data giusta: ` +
    `l'app ricalcola il termine con la regola del catalogo per «${atto}». Un'eventuale correzione a mano viene tolta.`,
  correggi: "Per quando la data giusta non è quella calcolata (es. un termine fissato dal giudice). Il motivo è obbligatorio " +
    "e resta nello storico. Le future modifiche del catalogo non toccheranno questa scadenza.",
};

// Il cerchietto con la "i". "parametro" serve ai testi che cambiano (es. il nome dell'atto).
function aiuto(chiave, parametro) {
  const voce = AIUTI[chiave];
  const testo = typeof voce === "function" ? voce(parametro) : voce;
  if (!testo) return "";
  return `<button type="button" class="aiuto" data-aiuto="${esc(testo)}" aria-label="Spiegazione" aria-expanded="false">i</button>`;
}

module.exports = { aiuto, AIUTI };
