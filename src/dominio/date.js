// ─────────────────────────────────────────────────────────────
// DATE
// Tutte le date sono salvate come testo "AAAA-MM-GG" (es. 2026-10-15).
// È il formato più sicuro: si ordina bene e non ha problemi di fuso orario.
// Per i calcoli usiamo l'orario UTC ("universale"), così un giorno è
// sempre un giorno, anche nei cambi tra ora legale e ora solare.
// ─────────────────────────────────────────────────────────────
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const due = (n) => String(n).padStart(2, "0");

// "2026-10-15" → oggetto Date
function daTesto(testo) {
  const [a, m, g] = testo.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g));
}
// oggetto Date → "2026-10-15"
const aTesto = (data) => data.toISOString().slice(0, 10);

// È una data vera? (esclude "2026-02-31", "ciao", campi vuoti…)
function eValida(testo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(testo))) return false;
  return aTesto(daTesto(testo)) === testo;
}

function aggiungiGiorni(testo, n) {
  const d = daTesto(testo);
  d.setUTCDate(d.getUTCDate() + n);
  return aTesto(d);
}

// La data di oggi secondo l'orologio del computer (ora italiana).
function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

// Quanti giorni mancano (negativo = già passata).
const giorniDaOggi = (testo, rispettoA = oggi()) =>
  Math.round((daTesto(testo) - daTesto(rispettoA)) / 86_400_000);

// "2026-10-15" → "gio 15/10/2026"
function formatta(testo) {
  if (!testo) return "";
  const d = daTesto(testo);
  return `${GIORNI[d.getUTCDay()]} ${due(d.getUTCDate())}/${due(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// "2026-10-15" → "Giovedì 15 ottobre 2026" (per i titoli)
function formattaEsteso(testo) {
  const nomi = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const d = daTesto(testo);
  return `${nomi[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Data e ora di un momento (es. per lo storico): "15/10/26 14:32"
const formattaMomento = (ms) =>
  new Date(ms).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

module.exports = { daTesto, aTesto, eValida, aggiungiGiorni, oggi, giorniDaOggi,
  formatta, formattaEsteso, formattaMomento };
