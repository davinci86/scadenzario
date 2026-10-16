// ─────────────────────────────────────────────────────────────
// IL DETTAGLIO DI UNA SCADENZA
// A sinistra il lavoro di tutti i giorni (stato, squadra, note, storico).
// A destra i dati e gli strumenti riservati ad Admin ed Editor.
// Ogni pulsante è un piccolo modulo che invia una richiesta POST:
// il server ricontrolla sempre i permessi, qualunque cosa mostri la pagina.
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { TIPI, statiDi, eChiuso } = require("../dominio/stati");
const { formatta, formattaMomento } = require("../dominio/date");
const { puoModificare, puoLavorare, eAdmin } = require("../auth/regole");
const { mancano, campione } = require("./scadenze-comuni");

// Il contenuto del dettaglio, senza la cornice della pagina.
// Si usa sia nella pagina intera sia nel pannello laterale.
function contenutoScadenza(utente, s, { atto, rinvio, storico, utenti, errore }) {
  const lavora = puoLavorare(s, utente);
  const modifica = puoModificare(utente);
  const url = `/scadenze/${s.id}`;
  const fuori = utenti.filter((u) => !s.squadra.some((p) => p.id === u.id));
  const nessuno = s.squadra.length === 0;

  // ── Avvisi in cima ──
  const avvisi = [
    errore && `<div class="errore" role="alert">${esc(errore)}</div>`,
    s.da_verificare && `<div class="avviso"><b>Termine da verificare.</b> L'atto non è nel catalogo: solo l'Admin può confermare il termine.
      ${eAdmin(utente) ? `<form method="post" action="${url}/verifica" class="in-linea"><button class="btn pri piccolo">Ho verificato: il termine è corretto</button></form>` : ""}</div>`,
    rinvio && `<div class="avviso">Udienza rinviata: la nuova è la <a href="/scadenze/${rinvio.id}" data-scadenza="${rinvio.id}" target="_blank">N. ${rinvio.id} del ${formatta(rinvio.data)}</a>.</div>`,
  ].filter(Boolean).join("");

  // ── Stato ──
  const stati = statiDi(s.tipo).filter((st) => st !== "Rinviata");
  const blocoStato = `
<section class="pannello">
  <h2>Stato</h2>
  ${lavora ? "" : `<p class="nota">Puoi cambiare lo stato solo delle attività in cui sei coinvolto.</p>`}
  <form method="post" action="${url}/stato" class="stati">
    ${stati.map((st) => `<button class="stato${st === s.stato ? " attuale" : ""}" name="stato" value="${esc(st)}"${lavora ? "" : " disabled"}${st === s.stato ? ' aria-pressed="true"' : ""}>${campione(st)}${esc(st)}</button>`).join("")}
  </form>
  ${s.tipo === "udienza" && lavora && !eChiuso(s.stato) ? `
  <form method="post" action="${url}/rinvio" class="riquadro" data-nome="Rinvio dell'udienza">
    <b>Udienza rinviata?</b> Indica la nuova data: verrà creata la nuova udienza con la stessa squadra.
    <div class="in-linea"><input type="date" name="data" required aria-label="Nuova data"><input type="time" name="ora" value="${esc(s.ora)}" aria-label="Ora"><button class="btn piccolo">Segna come rinviata</button></div>
  </form>` : ""}
</section>`;

  // ── Squadra ──
  const blocoSquadra = `
<section class="pannello">
  <h2>Chi se ne occupa</h2>
  ${nessuno ? `<p class="avviso"><b>Non ancora assegnata.</b> Finché non la assegni, i promemoria arriveranno ad Admin ed Editor.</p>` : ""}
  <ul class="squadra">${s.squadra.map((p) => `
    <li><span class="av">${esc(p.nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ").map((x) => x[0]).slice(0, 2).join(""))}</span>
      <span class="chi"><b>${esc(p.nome)}</b>${p.id === s.referente_id ? ` <span class="stella">★ referente</span>` : ""}<span class="tenue">${esc(p.titolo)}</span></span>
      ${lavora && p.id !== s.referente_id ? `<form method="post" action="${url}/referente"><button class="btn piccolo" name="utente" value="${p.id}">Rendi referente</button></form>` : ""}
      ${modifica ? `<form method="post" action="${url}/squadra/togli"><button class="btn piccolo pericolo" name="utente" value="${p.id}">Togli</button></form>` : ""}
    </li>`).join("")}
  </ul>
  ${lavora && fuori.length ? `
  <form method="post" action="${url}/squadra" class="in-linea">
    <select name="utente" aria-label="Persona da coinvolgere">${fuori.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join("")}</select>
    <button class="btn piccolo${nessuno ? " pri" : ""}">${nessuno ? "Assegna" : "Coinvolgi"}</button>
  </form>` : ""}
</section>`;

  // ── Note e storico ──
  const blocoNote = lavora ? `
<section class="pannello">
  <h2>Aggiungi una nota</h2>
  <form method="post" action="${url}/nota" class="modulo">
    <textarea name="nota" rows="3" placeholder="Es. bozza inviata al dominus per la revisione" aria-label="Nota"></textarea>
    <button class="btn piccolo">Salva nota</button>
  </form>
  <p class="nota spazio-sopra"><a href="/segnalazioni/nuova?scadenza=${s.id}">Segnala a un collega su questa attività →</a></p>
</section>` : "";

  const blocoStorico = `
<section class="pannello">
  <h2>Storico</h2>
  <ol class="storico">${storico.map((h) =>
    `<li><time>${formattaMomento(h.quando)}</time><span><b>${esc(h.nome || "Sistema")}</b> · ${esc(h.testo)}</span></li>`).join("")}</ol>
</section>`;

  // ── Colonna destra: dati e strumenti ──
  const dati = `
<section class="pannello">
  <h2>Dati</h2>
  <dl class="dati">
    <dt>${s.tipo === "udienza" ? "Data udienza" : "Entro il"}</dt><dd><b>${formatta(s.data)}${s.ora ? " ore " + esc(s.ora) : ""}</b> ${mancano(s)}</dd>
    <dt>Stato</dt><dd>${esc(s.stato)}</dd>
    ${atto ? `<dt>Atto</dt><dd>${esc(atto.nome)}</dd>` : ""}
    ${s.data_evento ? `<dt>Decorrenza</dt><dd>${formatta(s.data_evento)}</dd>` : ""}
    ${s.calcolo ? `<dt>Calcolo</dt><dd>${esc(s.calcolo)}</dd>` : ""}
    ${s.correzione_manuale ? `<dt>Correzione</dt><dd>✎ Data corretta a mano: «${esc(s.correzione_manuale)}»</dd>` : ""}
    ${s.ufficio ? `<dt>Ufficio</dt><dd>${esc(s.ufficio)}</dd>` : ""}
    ${s.fascicolo ? `<dt>Fascicolo</dt><dd>${esc(s.fascicolo)} · <a href="/fascicoli?n=${encodeURIComponent(s.fascicolo)}">dov'è?</a></dd>` : ""}
  </dl>
</section>`;

  const strumenti = modifica ? `
${atto ? `
<section class="pannello">
  <h2>Ricalcola dalla decorrenza</h2>
  <form method="post" action="${url}/ricalcola" class="modulo">
    <input type="date" name="data_evento" value="${esc(s.data_evento || "")}" required aria-label="Data di decorrenza">
    <p class="nota">Usa la regola del catalogo per «${esc(atto.nome)}».</p>
    <button class="btn piccolo">Ricalcola</button>
  </form>
</section>` : ""}
<section class="pannello">
  <h2>Correggi la data a mano</h2>
  <form method="post" action="${url}/correggi" class="modulo">
    <div class="in-linea"><input type="date" name="data" value="${esc(s.data)}" required aria-label="Nuova data">${s.tipo === "udienza" ? `<input type="time" name="ora" value="${esc(s.ora)}" aria-label="Ora">` : ""}</div>
    <input name="motivo" placeholder="Motivo della correzione (obbligatorio)" required minlength="5" aria-label="Motivo">
    <button class="btn piccolo">Salva la correzione</button>
  </form>
</section>` : "";

  return `
<div class="testata">
  <div class="tenue maiuscolo">${TIPI[s.tipo]} · N. ${s.id}</div>
  <h1>${esc(s.cliente)}</h1>
  <p class="sottotitolo">${esc(s.attivita)}</p>
</div>
${avvisi}
<div class="griglia">
  <div class="colonna-lavoro">${blocoStato}${blocoSquadra}${blocoNote}${blocoStorico}</div>
  <div class="colonna-destra"><div class="blocco-dati">${dati}</div><div class="blocco-strumenti">${strumenti}</div></div>
</div>`;
}

// "← Torna allo scadenzario": chiude la scheda e si torna a quella di prima
// (il comportamento è in public/js/modifiche.js; senza JavaScript è un link normale)
const tornaAlloScadenzario =
  `<nav class="briciole" aria-label="Percorso"><a href="/scadenzario" data-torna><span aria-hidden="true">←</span> Torna allo scadenzario</a></nav>`;

// La pagina intera (si apre con il doppio clic, sempre in una nuova scheda)
function paginaScadenza(utente, s, extra) {
  return layout({
    titolo: `N. ${s.id} · ${s.cliente}`,
    utente,
    attiva: "scadenzario",
    script: ["pannelli.js"],
    contenuto: `${tornaAlloScadenzario}<div data-dettaglio="${s.id}">${contenutoScadenza(utente, s, extra)}</div>`,
  });
}

module.exports = { paginaScadenza, contenutoScadenza, tornaAlloScadenzario };
