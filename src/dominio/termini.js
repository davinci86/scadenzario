// ─────────────────────────────────────────────────────────────
// CALCOLO DEI TERMINI
// Il cuore dell'app. È una "funzione pura": riceve dei dati e
// restituisce un risultato, senza leggere né scrivere il database.
// Per questo si può testare a fondo (vedi test/termini.test.js).
//
// Una "regola" (presa dal catalogo degli atti) dice:
//   giorni              quanti giorni contare
//   direzione           "avanti" (entro X giorni da…) o "ritroso" (X giorni prima dell'udienza)
//   sospensioneFeriale  se i giorni dal 1 al 31 agosto non si contano
//   spostaGiornoUtile   se un termine che cade in un giorno non lavorativo si sposta
// ─────────────────────────────────────────────────────────────
const { daTesto, aTesto, formatta } = require("./date");

// Festività nazionali fisse, più il patrono di Napoli.
const FESTE_FISSE = {
  "01-01": "Capodanno",
  "01-06": "Epifania",
  "04-25": "Festa della Liberazione",
  "05-01": "Festa del lavoro",
  "06-02": "Festa della Repubblica",
  "08-15": "Ferragosto",
  "09-19": "San Gennaro, patrono di Napoli",
  "11-01": "Ognissanti",
  "12-08": "Immacolata Concezione",
  "12-25": "Natale",
  "12-26": "Santo Stefano",
};

// La data di Pasqua cambia ogni anno: la calcoliamo con il metodo
// tradizionale (algoritmo "di Gauss/Meeus"). Pasquetta è il giorno dopo.
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anno, mese - 1, giorno));
}

// Se la data è festiva restituisce il motivo, altrimenti null.
// "chiusure" = le chiusure aggiunte dallo studio: una Map data → motivo.
function festivita(testo, chiusure = new Map()) {
  const fissa = FESTE_FISSE[testo.slice(5)];
  if (fissa) return fissa;
  const pasquetta = pasqua(Number(testo.slice(0, 4)));
  pasquetta.setUTCDate(pasquetta.getUTCDate() + 1);
  if (aTesto(pasquetta) === testo) return "Lunedì dell'Angelo";
  return chiusure.get(testo) || null;
}

// Perché un giorno non è lavorativo? (null = è lavorativo)
function motivoNonLavorativo(testo, chiusure) {
  const giornoSettimana = daTesto(testo).getUTCDay();
  if (giornoSettimana === 6) return "sabato";
  if (giornoSettimana === 0) return "domenica";
  return festivita(testo, chiusure);
}

function calcolaTermine(dataEvento, regola, chiusure = new Map()) {
  const passo = regola.direzione === "ritroso" ? -1 : 1;
  const d = daTesto(dataEvento);
  let contati = 0;
  let giorniAgostoSaltati = 0;

  // 1. Contiamo i giorni uno alla volta
  while (contati < regola.giorni) {
    d.setUTCDate(d.getUTCDate() + passo);
    // Ad agosto (mese 7, perché gennaio è 0) i termini sono sospesi
    if (regola.sospensioneFeriale && d.getUTCMonth() === 7) {
      giorniAgostoSaltati++;
      continue;
    }
    contati++;
  }

  // 2. Se cade in un giorno non lavorativo, spostiamo
  //    (in avanti per i termini in avanti, indietro per quelli a ritroso)
  const spostamenti = [];
  if (regola.spostaGiornoUtile) {
    let motivo;
    while ((motivo = motivoNonLavorativo(aTesto(d), chiusure))) {
      spostamenti.push({ data: aTesto(d), motivo });
      d.setUTCDate(d.getUTCDate() + passo);
    }
  }

  return { data: aTesto(d), giorniAgostoSaltati, spostamenti };
}

// La regola scritta a parole, es. "30 giorni dalla notifica del provvedimento, con sospensione feriale"
const DA_EVENTO = {
  notifica: "dalla notifica del provvedimento",
  deposito: "dal deposito della sentenza",
  comunicazione: "dalla comunicazione",
  invio: "dall'invio della richiesta",
  udienza: "dall'udienza",
  decorrenza: "dalla data di decorrenza",
};
function regolaAParole(regola) {
  const da = regola.direzione === "ritroso" ? "prima dell'udienza" : DA_EVENTO[regola.evento] || "";
  const feriale = regola.sospensioneFeriale ? ", con sospensione feriale" : ", senza sospensione feriale";
  return `${regola.giorni} giorni ${da}${feriale}`;
}

// La spiegazione di un calcolo già fatto, per l'utente.
function spiegaCalcolo(dataEvento, regola, risultato) {
  const parti = [`${regola.giorni} giorni ${regola.direzione === "ritroso" ? "prima del" : "dal"} ${formatta(dataEvento)}`];
  if (risultato.giorniAgostoSaltati) parti.push(`esclusi ${risultato.giorniAgostoSaltati} giorni di agosto`);
  if (risultato.spostamenti.length) {
    const primo = risultato.spostamenti[0];
    parti.push(`cadeva ${formatta(primo.data)} (${primo.motivo}): spostato al primo giorno utile`);
  }
  return parti.join(", ");
}

module.exports = { calcolaTermine, festivita, pasqua, regolaAParole, spiegaCalcolo, FESTE_FISSE };
