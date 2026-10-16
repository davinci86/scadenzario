// ─────────────────────────────────────────────────────────────
// VALORI PREDEFINITI (Impostazioni → Valori predefiniti)
// Prima stavano in src/config.js; ora li sceglie l'Admin dall'app.
// Nel database c'è solo ciò che l'Admin ha cambiato: per tutto il resto
// valgono i valori iniziali di config.js.
// Fanno parte dei backup: un ripristino li riporta com'erano.
// ─────────────────────────────────────────────────────────────
const config = require("../config");
const { registra } = require("../db/registro");

// Le chiavi, con il valore iniziale e come si spiegano
const VALORI = {
  promemoriaPredefiniti: { iniziale: () => config.promemoriaPredefiniti, nome: "Promemoria per scadenze senza atto (giorni prima)" },
  promemoriaUdienzeOre: { iniziale: () => config.promemoriaUdienzeOre, nome: "Promemoria per le udienze (ore prima)" },
  terminiAltro: { iniziale: () => config.terminiAltro, nome: "Termini proposti per gli atti fuori catalogo (giorni)" },
  giorniFascicoloFuori: { iniziale: () => config.giorniFascicoloFuori, nome: "Fascicoli: promemoria dopo quanti giorni fuori archivio" },
};

function leggiImpostazioni(db) {
  const salvati = Object.fromEntries(db.prepare("SELECT chiave, valore FROM impostazioni").all().map((r) => [r.chiave, JSON.parse(r.valore)]));
  return Object.fromEntries(Object.entries(VALORI).map(([k, v]) => [k, salvati[k] ?? v.iniziale()]));
}

// Una lista di numeri scritta a mano: "15, 7, 1" → [15, 7, 1] (ordinata, senza doppioni)
function leggiLista(testo, { min = 1, max = 400 } = {}) {
  const pezzi = String(testo ?? "").split(/[\s,;]+/).filter(Boolean);
  const numeri = pezzi.map(Number);
  if (numeri.some((n) => !Number.isInteger(n) || n < min || n > max)) return null;
  return [...new Set(numeri)].sort((a, b) => b - a);
}

// Controlla e salva il modulo. Restituisce un testo d'errore, o niente.
function salvaImpostazioni(db, corpo, autore) {
  const nuovi = {
    promemoriaPredefiniti: leggiLista(corpo.promemoriaPredefiniti, { min: 1, max: 365 }),
    promemoriaUdienzeOre: leggiLista(corpo.promemoriaUdienzeOre, { min: 1, max: 24 * 30 }),
    terminiAltro: leggiLista(corpo.terminiAltro, { min: 1, max: 400 })?.sort((a, b) => a - b),
    giorniFascicoloFuori: Number(corpo.giorniFascicoloFuori),
  };
  if (!nuovi.promemoriaPredefiniti) return "Promemoria per le scadenze: scrivi dei numeri di giorni separati da virgola, es. 7, 1.";
  if (!nuovi.promemoriaUdienzeOre?.length) return "Udienze: indica almeno un promemoria, in ore (es. 48, 24).";
  if (!nuovi.terminiAltro?.length) return "Termini per gli atti fuori catalogo: indica almeno un numero di giorni.";
  if (!Number.isInteger(nuovi.giorniFascicoloFuori) || nuovi.giorniFascicoloFuori < 1 || nuovi.giorniFascicoloFuori > 365) {
    return "Fascicoli: indica un numero di giorni tra 1 e 365.";
  }
  const prima = leggiImpostazioni(db);
  const cambi = [];
  for (const [k, v] of Object.entries(nuovi)) {
    if (JSON.stringify(v) === JSON.stringify(prima[k])) continue;
    db.prepare("INSERT INTO impostazioni (chiave, valore) VALUES (?, ?) ON CONFLICT (chiave) DO UPDATE SET valore = excluded.valore")
      .run(k, JSON.stringify(v));
    cambi.push(`${VALORI[k].nome}: ${[].concat(prima[k]).join(", ")} → ${[].concat(v).join(", ")}`);
  }
  if (cambi.length) registra(db, autore, "Impostazioni", cambi.join(" · "));
}

module.exports = { VALORI, leggiImpostazioni, salvaImpostazioni, leggiLista };
