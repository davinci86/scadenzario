// ─────────────────────────────────────────────────────────────
// LA DASHBOARD PERSONALE
// Quello che ognuno trova appena entra: le sue scadenze, le sue
// udienze e, per Admin ed Editor, le scadenze ancora da assegnare.
// All'Admin anche i termini da verificare.
// (Notifiche e promemoria arrivano con la Tappa 3.)
// ─────────────────────────────────────────────────────────────
const { esc, layout, RUOLI } = require("./html");
const { formatta, formattaEsteso, oggi, giorniDaOggi } = require("../dominio/date");
const { mancano, pillola } = require("./scadenze-comuni");

function saluto(ora = new Date().getHours()) {
  return ora < 13 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
}

// Una riga dell'elenco: data, cliente, attività, semaforo e stato
const voce = (s, utente, etichetta) => `
  <a class="voce" href="/scadenze/${s.id}" target="_blank" data-scadenza="${s.id}" title="Clic: apri il pannello · Doppio clic: apri in una nuova scheda">
    <span class="quando">${formatta(s.data)}${s.ora ? `<small>ore ${esc(s.ora)}</small>` : ""}</span>
    <span class="cosa"><b>${esc(s.cliente)}${utente && s.referente_id === utente.id ? ` <span class="stella" title="Sei il referente">★</span>` : ""}</b><span>${esc(s.attivita)}</span></span>
    <span class="stato-voce">${mancano(s)}${etichetta || pillola(s.stato)}</span>
  </a>`;

const elenco = (righe, utente, vuoto, etichetta) =>
  righe.length ? `<div class="elenco">${righe.map((s) => voce(s, utente, etichetta)).join("")}</div>`
               : `<p class="nota">${vuoto}</p>`;

function paginaDashboard(utente, d) {
  const nomeProprio = utente.nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ")[0];
  const scadute = d.mie.filter((s) => giorniDaOggi(s.data) < 0).length;
  const settimana = d.mie.filter((s) => { const g = giorniDaOggi(s.data); return g >= 0 && g <= 7; }).length;

  const contatori = [
    `<span class="contatore${scadute ? " rosso" : ""}"><b>${scadute}</b> scadute</span>`,
    `<span class="contatore${settimana ? " ambra" : ""}"><b>${settimana}</b> entro 7 giorni</span>`,
    `<span class="contatore"><b>${d.udienze.length}</b> udienze in programma</span>`,
    d.daAssegnare ? `<span class="contatore${d.daAssegnare.length ? " ambra" : ""}"><b>${d.daAssegnare.length}</b> da assegnare</span>` : "",
  ].join("");

  return layout({
    titolo: "Dashboard",
    utente,
    attiva: "dash",
    script: ["nuova-scadenza.js", "pannelli.js"],
    contenuto: `<div data-aggiornabile>
<div class="testata-dash">
  <div><h1>${saluto()}, ${esc(nomeProprio)}</h1><p class="tenue">${formattaEsteso(oggi())} · ${RUOLI[utente.ruolo]}</p></div>
  <div class="contatori">${contatori}</div>
</div>
${d.daVerificare ? `<section class="pannello"><h2>Termini da verificare</h2>${elenco(d.daVerificare, utente, "", `<span class="etichetta attenzione">da verificare</span>`)}</section>` : ""}
${d.daAssegnare ? `<section class="pannello"><h2>Da assegnare</h2>${elenco(d.daAssegnare, utente, "Tutte le scadenze hanno qualcuno che se ne occupa.", `<span class="etichetta attenzione">Da assegnare</span>`)}</section>` : ""}
<section class="pannello"><h2>Le mie scadenze</h2>${elenco(d.mie.filter((s) => s.tipo !== "udienza"), utente, "Nessuna scadenza assegnata a te.")}</section>
<section class="pannello"><h2>Le mie udienze</h2>${elenco(d.udienze, utente, "Nessuna udienza in programma.")}</section></div>`,
  });
}

module.exports = { paginaDashboard, saluto };
