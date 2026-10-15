// ─────────────────────────────────────────────────────────────
// LA DASHBOARD PERSONALE (impaginata come nel mockup)
//   a sinistra:  le cose MIE (da verificare, da assegnare, scadenze, udienze)
//   a destra:    il quadro dello STUDIO e due righe su come funziona
//   sotto:       "Chi ha cosa", per Admin ed Editor
// Una colonna stretta si legge meglio di una riga lunga quanto lo schermo.
// (Notifiche "Da leggere" e promemoria arrivano con la Tappa 3.)
// ─────────────────────────────────────────────────────────────
const { esc, layout, RUOLI } = require("./html");
const { formatta, formattaEsteso, formattaMomento, oggi, giorniDaOggi } = require("../dominio/date");
const { TIPI } = require("../dominio/stati");
const { mancano, pillola } = require("./scadenze-comuni");

function saluto(ora = new Date().getHours()) {
  return ora < 13 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
}

const iniziali = (nome) => nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");
const attributiVoce = (s) =>
  `href="/scadenze/${s.id}" target="_blank" data-scadenza="${s.id}" title="Clic: apri il pannello · Doppio clic: apri in una nuova scheda"`;

// Una riga dell'elenco: data | cliente e attività | semaforo e stato
const voce = (s, utente, etichetta, evidenza) => `
  <a class="voce${evidenza ? " evidenza" : ""}" ${attributiVoce(s)}>
    <span class="quando">${formatta(s.data)}${s.ora ? `<small>ore ${esc(s.ora)}</small>` : ""}</span>
    <span class="cosa"><b>${esc(s.cliente)}${utente && s.referente_id === utente.id ? ` <span class="stella" title="Sei il referente">★</span>` : ""}</b><span>${esc(s.attivita)}</span></span>
    <span class="stato-voce">${mancano(s)}${etichetta || pillola(s.stato)}</span>
  </a>`;

// "evidenza": le cose che chiedono un'azione (da verificare, da assegnare)
// stanno su un fondo colorato, come le notifiche nel mockup.
const elenco = (righe, utente, vuoto, etichetta, evidenza = false) =>
  righe.length ? `<div class="elenco${evidenza ? " evidenziato" : ""}">${righe.map((s) => voce(s, utente, etichetta, evidenza)).join("")}</div>`
               : `<p class="nota">${vuoto}</p>`;

const pannello = (titolo, contenuto) => `<section class="pannello"><h2>${titolo}</h2>${contenuto}</section>`;

// "Da leggere": le notifiche restano qui finché non si preme Letto
function daLeggere(notifiche) {
  if (!notifiche.length) return pannello("Da leggere", `<p class="nota">Hai letto tutto.</p>`);
  return pannello(`Da leggere <span class="contatore piccolo accento">${notifiche.length}</span>`, `
    <div class="elenco evidenziato">${notifiche.map((n) => `
      <div class="notifica">
        <span class="pallino"></span>
        <div class="testo"><b>${esc(n.testo)}</b>${n.scadenza_id ? `<span>N. ${n.scadenza_id} · ${esc(n.cliente)} · ${esc(n.attivita)}</span>` : ""}<small>${formattaMomento(n.creata)}</small></div>
        <div class="azioni-notifica">
          ${n.scadenza_id ? `<a class="btn piccolo" href="/scadenze/${n.scadenza_id}" target="_blank" data-scadenza="${n.scadenza_id}">Apri</a>` : ""}
          <form method="post" action="/notifiche/${n.id}/letta" data-rapido><button class="btn piccolo pri">Letto</button></form>
        </div>
      </div>`).join("")}
    </div>
    ${notifiche.length > 1 ? `<form method="post" action="/notifiche/tutte" data-rapido class="spazio-sopra"><button class="link">Segna tutte come lette</button></form>` : ""}`);
}

// Anteprima dell'email di promemoria: senza nomi di clienti
function anteprimaEmail(utente, mie) {
  const prossima = mie[0];
  return pannello("Promemoria via email", `
    <div class="email-anteprima">
      <div class="email-testa"><span>Da: scadenzario@studio</span><span>A: ${esc(utente.email || utente.nome)}</span><span>Oggetto: Scadenzario: hai un promemoria</span></div>
      <div class="email-corpo">${prossima
        ? `<p>Hai ${prossima.tipo === "udienza" ? "un'udienza" : "una scadenza"} il ${formatta(prossima.data)}.</p><p>Apri lo Scadenzario dalla rete dello studio per i dettagli.</p>`
        : "<p>Nessun promemoria in arrivo.</p>"}</div>
    </div>
    <p class="nota spazio-sopra">Il messaggio non contiene nomi di clienti né dettagli della pratica.${utente.email ? "" : ` Per riceverlo, aggiungi la tua email nel <a href="/profilo">profilo</a>.`}</p>`);
}

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
    `<span class="contatore${d.daLeggere.length ? " accento" : ""}"><b>${d.daLeggere.length}</b> da leggere</span>`,
    `<span class="contatore${scadute ? " rosso" : ""}"><b>${scadute}</b> scadute</span>`,
    `<span class="contatore${settimana ? " ambra" : ""}"><b>${settimana}</b> entro 7 giorni</span>`,
    `<span class="contatore"><b>${d.udienze.filter((s) => giorniDaOggi(s.data) <= 7).length}</b> udienze in settimana</span>`,
    d.daAssegnare ? `<span class="contatore${d.daAssegnare.length ? " ambra" : ""}"><b>${d.daAssegnare.length}</b> da assegnare</span>` : "",
  ].join("");

  // Colonna sinistra: le mie cose
  const sinistra = [
    daLeggere(d.daLeggere),
    d.daVerificare?.length ? pannello("Termini da verificare", elenco(d.daVerificare, utente, "", `<span class="etichetta attenzione">da verificare</span>`, true)) : "",
    d.daAssegnare ? pannello("Da assegnare", elenco(d.daAssegnare, utente, "Tutte le scadenze hanno qualcuno che se ne occupa.", `<span class="etichetta attenzione">Da assegnare</span>`, true)) : "",
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
  const comeFunziona = pannello("Come funziona", `<p class="nota">Le notifiche restano in «Da leggere» finché non premi <b>Letto</b>. Un <b>clic</b> su una scadenza apre il pannello laterale; il <b>doppio clic</b> la apre in una nuova scheda. La ★ indica dove sei referente.</p>`);

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
  <aside class="colonna">${studio}${anteprimaEmail(utente, d.mie)}${comeFunziona}</aside>
</div>
${d.chiHaCosa ? chiHaCosa(d.chiHaCosa) : ""}
</div>`,
  });
}

module.exports = { paginaDashboard, saluto };
