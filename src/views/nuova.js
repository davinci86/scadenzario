// ─────────────────────────────────────────────────────────────
// IL MODULO "NUOVA SCADENZA"
// Funziona anche senza JavaScript (il server controlla e calcola tutto).
// Con JavaScript (public/js/nuova-scadenza.js) diventa più comodo:
// mostra solo i campi che servono e calcola l'anteprima mentre scrivi.
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { TIPI, EVENTI } = require("../dominio/stati");
const config = require("../config");

// Solo il modulo: si usa nella finestra sovrapposta e nella pagina.
function moduloNuova(atti, utenti, valori = {}, errori = []) {
  const v = (campo) => esc(valori[campo] ?? "");
  const tipo = TIPI[valori.tipo] ? valori.tipo : "scadenza";
  const squadraScelta = new Set([].concat(valori.squadra ?? []).map(String));
  const ferialeAltro = valori.tipo ? valori.feriale_altro === "1" : true; // spuntato di default

  // Gli atti raggruppati per materia
  const materie = [...new Set(atti.map((a) => a.materia))];
  const opzioniAtti = materie.map((m) => `<optgroup label="${esc(m)}">${atti.filter((a) => a.materia === m)
    .map((a) => `<option value="${a.id}" data-tipo="${a.tipo}" data-evento="${esc(EVENTI[a.evento])}" data-regola="${esc(a.regolaTesto)}"${String(valori.atto) === String(a.id) ? " selected" : ""}>${esc(a.nome)}</option>`)
    .join("")}</optgroup>`).join("");

  return `
<h2 class="titolo-finestra">Nuova scadenza</h2>
${errori.length ? `<div class="errore" role="alert"><b>Controlla il modulo:</b> ${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/scadenze" class="pannello modulo-grande" id="nuova">

  <fieldset class="campo">
    <legend>Tipo</legend>
    <div class="scelte">${Object.entries(TIPI).map(([k, nome]) =>
      `<label class="scelta"><input type="radio" name="tipo" value="${k}"${k === tipo ? " checked" : ""}> ${nome}</label>`).join("")}</div>
  </fieldset>

  <div class="campo" id="blocco-atto">
    <label for="atto">Atto</label>
    <select id="atto" name="atto">
      <option value="">Scegli l'atto…</option>
      ${opzioniAtti}
      <option value="altro"${valori.atto === "altro" ? " selected" : ""}>Altro: non è nel catalogo</option>
    </select>
    <p class="nota" id="regola-atto"></p>
  </div>

  <div class="due-colonne">
    <div class="campo"><label for="cliente">Cliente</label><input id="cliente" name="cliente" value="${v("cliente")}" placeholder="Cognome Nome" required></div>
    <div class="campo"><label for="ufficio">Ufficio <span class="facoltativo">(facoltativo)</span></label><input id="ufficio" name="ufficio" value="${v("ufficio")}" placeholder="Es. Tribunale di Napoli"></div>
  </div>
  <div class="due-colonne">
    <div class="campo"><label for="attivita">Attività da svolgere</label><input id="attivita" name="attivita" value="${v("attivita")}" placeholder="Si compila da sola scegliendo l'atto"></div>
    <div class="campo"><label for="fascicolo">N. fascicolo <span class="facoltativo">(facoltativo)</span></label><input id="fascicolo" name="fascicolo" value="${v("fascicolo")}" placeholder="Es. 1234/2025"></div>
  </div>

  <div class="riquadro" id="blocco-altro">
    <p class="avviso">Atto fuori catalogo: la scadenza resterà <b>da verificare</b> finché l'Admin non controlla il termine.</p>
    <div class="due-colonne">
      <div class="campo"><label for="termine_altro">Termine</label>
        <select id="termine_altro" name="termine_altro">${config.terminiAltro.map((g) =>
          `<option value="${g}"${String(valori.termine_altro ?? 30) === String(g) ? " selected" : ""}>${g} giorni</option>`).join("")}
          <option value="manuale"${valori.termine_altro === "manuale" ? " selected" : ""}>Forza la data a mano…</option>
        </select></div>
      <label class="spunta" id="blocco-feriale"><input type="checkbox" name="feriale_altro" value="1"${ferialeAltro ? " checked" : ""}> Si applica la sospensione feriale (1–31 agosto)</label>
    </div>
  </div>

  <div class="due-colonne">
    <div class="campo" id="blocco-evento"><label for="data_evento" id="etichetta-evento">Data di decorrenza</label><input type="date" id="data_evento" name="data_evento" value="${v("data_evento")}"></div>
    <div class="campo" id="blocco-data"><label for="data" id="etichetta-data">Data</label><div class="in-linea"><input type="date" id="data" name="data" value="${v("data")}"><input type="time" id="ora" name="ora" value="${v("ora")}" aria-label="Ora"></div></div>
  </div>
  <div class="anteprima" id="anteprima" hidden></div>

  <fieldset class="campo">
    <legend>Chi se ne occupa <span class="facoltativo">(facoltativo: puoi lasciarla da assegnare)</span></legend>
    <div class="persone">${utenti.map((u) => `
      <div class="persona">
        <label class="spunta"><input type="checkbox" name="squadra" value="${u.id}"${squadraScelta.has(String(u.id)) ? " checked" : ""}> ${esc(u.nome)} <span class="tenue">· ${esc(u.titolo)}</span></label>
        <label class="spunta tenue"><input type="radio" name="referente" value="${u.id}"${String(valori.referente) === String(u.id) ? " checked" : ""}> referente</label>
      </div>`).join("")}
    </div>
  </fieldset>

  <div class="azioni"><a class="btn" href="/scadenzario" data-chiudi>Annulla</a><button class="btn pri" type="submit">Inserisci nello scadenzario</button></div>
</form>`;
}

// La pagina intera (serve solo se JavaScript è spento)
function paginaNuova(utente, atti, utenti, valori, errori) {
  return layout({
    titolo: "Nuova scadenza",
    utente,
    attiva: "scadenzario",
    script: ["nuova-scadenza.js"],
    contenuto: moduloNuova(atti, utenti, valori, errori),
  });
}

module.exports = { paginaNuova, moduloNuova };
