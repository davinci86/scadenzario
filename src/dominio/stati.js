// ─────────────────────────────────────────────────────────────
// TIPI, STATI E COLORI
// Ogni tipo di scadenza ha i suoi stati, in ordine. Ogni stato ha il
// colore di evidenziatore con cui si colora la riga (come su Word).
// I colori sono provvisori: vanno sostituiti con quelli dello studio.
// ─────────────────────────────────────────────────────────────
const TIPI = { scadenza: "Scadenza", adempimento: "Adempimento", udienza: "Udienza" };

const STATI = {
  scadenza: [
    ["Da iniziare", "nessuno"], ["In elaborazione", "giallo"], ["Da correggere", "turchese"],
    ["Da depositare", "rosa"], ["Depositato", "verde"],
  ],
  adempimento: [["Da iniziare", "nessuno"], ["In elaborazione", "giallo"], ["Completato", "verde"]],
  udienza: [
    ["Da preparare", "nessuno"], ["In preparazione", "giallo"], ["Pronta", "rosa"],
    ["Tenuta", "verde"], ["Rinviata", "grigio"],
  ],
};

// Gli stati che "chiudono" una scadenza: non compare più tra le aperte.
const CHIUSI = ["Depositato", "Completato", "Tenuta", "Rinviata"];

const statiDi = (tipo) => STATI[tipo].map(([nome]) => nome);
const primoStato = (tipo) => STATI[tipo][0][0];
const eChiuso = (stato) => CHIUSI.includes(stato);
function coloreDi(stato) {
  for (const elenco of Object.values(STATI)) {
    const trovato = elenco.find(([nome]) => nome === stato);
    if (trovato) return trovato[1];
  }
  return "nessuno";
}
const tuttiGliStati = () => [...new Set(Object.values(STATI).flat().map(([nome]) => nome))];

// Da cosa decorre il termine (per le etichette del modulo)
const EVENTI = {
  notifica: "Data di notifica del provvedimento",
  deposito: "Data di deposito della sentenza",
  comunicazione: "Data della comunicazione",
  invio: "Data di invio della richiesta",
  udienza: "Data dell'udienza",
};

module.exports = { TIPI, STATI, CHIUSI, EVENTI, statiDi, primoStato, eChiuso, coloreDi, tuttiGliStati };
