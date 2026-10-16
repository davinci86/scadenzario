// ─────────────────────────────────────────────────────────────
// SEGNALAZIONI: le pagine
//   paginaSegnalazioni       Ricevute / Inviate
//   paginaNuovaSegnalazione  il modulo "Segnala a un collega"
//   schedaSegnalazione       una segnalazione (la usa anche la dashboard)
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { formattaMomento } = require("../dominio/date");
const { link: linkFascicolo } = require("../db/fascicoli");

const breve = (nome) => String(nome || "").replace(/^(Avv\.|Dott\.)\s*/, "");

// Una segnalazione. "ricevuta" = la sto leggendo come destinatario.
// "torna" = dove tornare dopo "Letto" se il browser non usa JavaScript.
function schedaSegnalazione(s, { ricevuta, torna = "/segnalazioni" }) {
  const importante = s.priorita === "importante";
  const daLeggere = ricevuta && !s.letta;
  const collegamenti = [
    s.scadenza_id && `<a href="/scadenze/${s.scadenza_id}" target="_blank" data-scadenza="${s.scadenza_id}">N. ${s.scadenza_id} · ${esc(s.scadenza_cliente)}</a>`,
    s.fascicolo && `<a href="${linkFascicolo(s.fascicolo)}">Fascicolo ${esc(s.fascicolo)}</a>`,
  ].filter(Boolean);

  const piede = ricevuta
    ? `<div class="azioni-segnalazione">
        ${s.letta ? `<span class="nota">Letta il ${formattaMomento(s.letta)}</span>`
          : `<form method="post" action="/segnalazioni/${s.id}/letta" data-rapido><input type="hidden" name="torna" value="${esc(torna)}"><button class="btn piccolo pri">Letto</button></form>`}
        <a class="btn piccolo" href="/segnalazioni/nuova?risposta=${s.id}">Rispondi</a>
      </div>`
    : `<p class="nota letture">${s.letture.map((l) =>
        `${esc(breve(l.nome))}: ${l.letta ? `<b>letta il ${formattaMomento(l.letta)}</b>` : "non ancora letta"}`).join(" · ")}</p>`;

  return `
<article class="segnalazione${importante ? " importante" : ""}${daLeggere ? " da-leggere" : ""}">
  <header>
    ${importante ? `<span class="etichetta attenzione">Importante</span>` : ""}
    <b class="oggetto">${esc(s.oggetto)}</b>
    <span class="nota">${ricevuta ? `da ${esc(s.da_nome)}` : `a ${s.letture.map((l) => esc(breve(l.nome))).join(", ")}`} · ${formattaMomento(s.creata)}</span>
  </header>
  ${s.risposta_oggetto ? `<p class="nota">In risposta a «${esc(s.risposta_oggetto)}»</p>` : ""}
  <p class="testo-segnalazione">${esc(s.testo)}</p>
  ${collegamenti.length ? `<p class="nota">Collegata a: ${collegamenti.join(" · ")}</p>` : ""}
  ${piede}
</article>`;
}

function paginaSegnalazioni(utente, { vista, ricevute, inviate, fatto }) {
  const daLeggere = ricevute.filter((s) => !s.letta).length;
  const elenco = vista === "inviate" ? inviate : ricevute;
  return layout({
    titolo: "Segnalazioni",
    utente,
    attiva: "segnalazioni",
    script: ["pannelli.js"],
    contenuto: `
<div class="testata-azioni">
  <div><h1>Segnalazioni</h1><p class="tenue">Per attirare l'attenzione di un collega su qualcosa. Restano da leggere finché non premi «Letto».</p></div>
  <a class="btn pri" href="/segnalazioni/nuova">+ Segnala a un collega</a>
</div>
${fatto ? `<p class="avviso">${esc(fatto)}</p>` : ""}
<nav class="schede" aria-label="Quali segnalazioni">
  <a href="/segnalazioni"${vista !== "inviate" ? ' aria-current="page"' : ""}>Ricevute${daLeggere ? ` <span class="contatore piccolo accento">${daLeggere} da leggere</span>` : ""}</a>
  <a href="/segnalazioni?vista=inviate"${vista === "inviate" ? ' aria-current="page"' : ""}>Inviate</a>
</nav>
<div class="pila" data-aggiornabile>
  ${elenco.length ? elenco.map((s) => schedaSegnalazione(s, { ricevuta: vista !== "inviate" })).join("")
    : `<p class="nota">Nessuna segnalazione ${vista === "inviate" ? "inviata" : "ricevuta"}.</p>`}
</div>`,
  });
}

// Il modulo. "valori" precompila (risposta, fascicolo, scadenza…).
function paginaNuovaSegnalazione(utente, { colleghi, scadenze, valori = {}, errori = [], risposta = null }) {
  const scelti = new Set([].concat(valori.a ?? []).map(String));
  const v = (campo) => esc(valori[campo] ?? "");
  return layout({
    titolo: risposta ? "Rispondi" : "Segnala a un collega",
    utente,
    attiva: "segnalazioni",
    contenuto: `
<nav class="briciole"><a href="/segnalazioni"><span aria-hidden="true">←</span> Segnalazioni</a></nav>
<h1>${risposta ? "Rispondi" : "Segnala a un collega"}</h1>
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/segnalazioni" class="pannello modulo-grande" data-nome="Segnalazione"${errori.length ? " data-non-salvato" : ""}>
  ${risposta ? `<input type="hidden" name="risposta_a" value="${risposta.id}"><p class="nota">In risposta a «${esc(risposta.oggetto)}» di ${esc(risposta.da_nome)}</p>` : ""}
  <fieldset class="campo"><legend>A chi</legend>
    <div class="radios">${colleghi.map((c) =>
      `<label class="radio"><input type="checkbox" name="a" value="${c.id}"${scelti.has(String(c.id)) ? " checked" : ""}><span><b>${esc(c.nome)}</b> <span class="nota">${esc(c.titolo)}</span></span></label>`).join("")}</div>
  </fieldset>
  <div class="campo"><label for="oggetto">Oggetto</label>
    <input id="oggetto" name="oggetto" value="${v("oggetto")}" required maxlength="120" placeholder="Es. Controlla la memoria prima di mercoledì"></div>
  <div class="campo"><label for="testo">Messaggio</label>
    <textarea id="testo" name="testo" rows="5" required maxlength="2000" placeholder="Scrivi in breve cosa deve sapere o fare.">${v("testo")}</textarea></div>
  <fieldset class="campo"><legend>Priorità</legend>
    <div class="scelte">
      <label class="scelta"><input type="radio" name="priorita" value="normale"${valori.priorita !== "importante" ? " checked" : ""}> Normale</label>
      <label class="scelta"><input type="radio" name="priorita" value="importante"${valori.priorita === "importante" ? " checked" : ""}> Importante</label>
    </div>
  </fieldset>
  <div class="due-colonne">
    <div class="campo"><label for="scadenza">Collega a una scadenza <span class="facoltativo">(facoltativo)</span></label>
      <select id="scadenza" name="scadenza"><option value="">Nessuna</option>${scadenze.map((s) =>
        `<option value="${s.id}"${String(valori.scadenza) === String(s.id) ? " selected" : ""}>N. ${s.id} · ${esc(s.cliente)}</option>`).join("")}</select></div>
    <div class="campo"><label for="fascicolo">Fascicolo <span class="facoltativo">(facoltativo)</span></label>
      <input id="fascicolo" name="fascicolo" value="${v("fascicolo")}" maxlength="40" placeholder="Es. 1234/2025"></div>
  </div>
  <p class="nota">Il Registro annota che la segnalazione è stata inviata e letta, ma non il testo.</p>
  <div class="azioni"><a class="btn" href="/segnalazioni">Annulla</a><button class="btn pri">Invia</button></div>
</form>`,
  });
}

module.exports = { paginaSegnalazioni, paginaNuovaSegnalazione, schedaSegnalazione };
