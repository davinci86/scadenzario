// ─────────────────────────────────────────────────────────────
// LA DASHBOARD PERSONALE (impaginata come nel mockup)
//   a sinistra:  le cose MIE (da verificare, da assegnare, scadenze, udienze)
//   a destra:    il quadro dello STUDIO e due righe su come funziona
//   sotto:       "Chi ha cosa", per Admin ed Editor
// Una colonna stretta si legge meglio di una riga lunga quanto lo schermo.
// (Notifiche "Da leggere" e promemoria arrivano con la Tappa 3.)
// ─────────────────────────────────────────────────────────────
const { esc, layout, RUOLI } = require("./html");
const { formatta, formattaEsteso, oggi, giorniDaOggi } = require("../dominio/date");
const { TIPI } = require("../dominio/stati");
const { mancano, pillola } = require("./scadenze-comuni");

function saluto(ora = new Date().getHours()) {
  return ora < 13 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
}

const iniziali = (nome) => nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");
const attributiVoce = (s) =>
  `href="/scadenze/${s.id}" target="_blank" data-scadenza="${s.id}" title="Clic: apri il pannello · Doppio clic: apri in una nuova scheda"`;

// Una riga dell'elenco: data | cliente e attività | semaforo e stato
const voce = (s, utente, etichetta) => `
  <a class="voce" ${attributiVoce(s)}>
    <span class="quando">${formatta(s.data)}${s.ora ? `<small>ore ${esc(s.ora)}</small>` : ""}</span>
    <span class="cosa"><b>${esc(s.cliente)}${utente && s.referente_id === utente.id ? ` <span class="stella" title="Sei il referente">★</span>` : ""}</b><span>${esc(s.attivita)}</span></span>
    <span class="stato-voce">${mancano(s)}${etichetta || pillola(s.stato)}</span>
  </a>`;

const elenco = (righe, utente, vuoto, etichetta) =>
  righe.length ? `<div class="elenco">${righe.map((s) => voce(s, utente, etichetta)).join("")}</div>`
               : `<p class="nota">${vuoto}</p>`;

const pannello = (titolo, contenuto) => `<section class="pannello"><h2>${titolo}</h2>${contenuto}</section>`;

// "Chi ha cosa": una scheda per persona con le sue attività aperte
function chiHaCosa(persone) {
  return pannello("Chi ha cosa", `<div class="schede-persone">${persone.map(({ persona, scadenze }) => {
    const scadute = scadenze.filter((s) => giorniDaOggi(s.data) < 0).length;
    return `<div class="scheda-persona">
      <div class="scheda-testa"><span class="av">${esc(iniziali(persona.nome))}</span><b>${esc(persona.nome)}</b>
        <span class="contatore piccolo">${scadenze.length}</span>${scadute ? `<span class="contatore piccolo rosso">${scadute} scadute</span>` : ""}</div>
      ${scadenze.length ? scadenze.map((s) => `
        <a class="riga-persona" ${attributiVoce(s)}>
          <span>${s.referente_id === persona.id ? `<span class="stella" title="Referente">★</span> ` : ""}N. ${s.id} · ${esc(s.cliente)}
            <small>${TIPI[s.tipo]} · ${formatta(s.data)} · ${esc(s.stato)}</small></span>
          ${mancano(s)}
        </a>`).join("") : `<p class="nota">Nessuna attività aperta.</p>`}
    </div>`;
  }).join("")}</div>`);
}

function paginaDashboard(utente, d) {
  const nomeProprio = utente.nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ")[0];
  const scadute = d.mie.filter((s) => giorniDaOggi(s.data) < 0).length;
  const settimana = d.mie.filter((s) => { const g = giorniDaOggi(s.data); return g >= 0 && g <= 7; }).length;

  const contatori = [
    `<span class="contatore${scadute ? " rosso" : ""}"><b>${scadute}</b> scadute</span>`,
    `<span class="contatore${settimana ? " ambra" : ""}"><b>${settimana}</b> entro 7 giorni</span>`,
    `<span class="contatore"><b>${d.udienze.filter((s) => giorniDaOggi(s.data) <= 7).length}</b> udienze in settimana</span>`,
    d.daAssegnare ? `<span class="contatore${d.daAssegnare.length ? " ambra" : ""}"><b>${d.daAssegnare.length}</b> da assegnare</span>` : "",
  ].join("");

  // Colonna sinistra: le mie cose
  const sinistra = [
    d.daVerificare?.length ? pannello("Termini da verificare", elenco(d.daVerificare, utente, "", `<span class="etichetta attenzione">da verificare</span>`)) : "",
    d.daAssegnare ? pannello("Da assegnare", elenco(d.daAssegnare, utente, "Tutte le scadenze hanno qualcuno che se ne occupa.", `<span class="etichetta attenzione">Da assegnare</span>`)) : "",
    pannello("Le mie scadenze", elenco(d.mie.filter((s) => s.tipo !== "udienza"), utente, "Nessuna scadenza assegnata a te.")),
    pannello("Le mie udienze", elenco(d.udienze, utente, "Nessuna udienza in programma.")),
  ].join("");

  // Colonna destra: lo studio
  const studio = d.studio ? pannello("Tutto lo studio", `
    <div class="contatori"><span class="contatore"><b>${d.studio.aperte}</b> aperte</span>
      <span class="contatore${d.studio.scadute.length ? " rosso" : ""}"><b>${d.studio.scadute.length}</b> scadute</span>
      ${d.daVerificare ? `<span class="contatore${d.daVerificare.length ? " ambra" : ""}"><b>${d.daVerificare.length}</b> da verificare</span>` : ""}</div>
    <p class="nota spazio-sopra">${d.studio.scadute.length
      ? "Scadute: " + d.studio.scadute.map((s) => `<a href="/scadenze/${s.id}" target="_blank" data-scadenza="${s.id}">N. ${s.id} · ${esc(s.cliente)}</a>`).join("; ")
      : "Nessuna scadenza superata."}</p>`) : "";
  const comeFunziona = pannello("Come funziona", `<p class="nota">Un <b>clic</b> su una scadenza apre il pannello laterale; il <b>doppio clic</b> la apre in una nuova scheda. La ★ indica dove sei referente.</p>`);

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
<div class="griglia-dash">
  <div class="colonna">${sinistra}</div>
  <aside class="colonna">${studio}${comeFunziona}</aside>
</div>
${d.chiHaCosa ? chiHaCosa(d.chiHaCosa) : ""}
</div>`,
  });
}

module.exports = { paginaDashboard, saluto };
