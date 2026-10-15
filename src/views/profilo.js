// Il mio profilo: le preferenze personali di ognuno.
const { esc, layout, RUOLI } = require("./html");
const config = require("../config");

function paginaProfilo(utente, { salvato = false, errori = [], valori = {} } = {}) {
  const v = {
    minuti_blocco: valori.minuti_blocco ?? utente.minutiBlocco,
    email: valori.email ?? utente.email,
    tema: valori.tema ?? utente.tema,
  };
  return layout({
    titolo: "Il mio profilo",
    utente,
    attiva: "profilo",
    contenuto: `
<h1>Il mio profilo</h1>
${salvato ? `<p class="avviso">Preferenze salvate.</p>` : ""}
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/profilo" class="pannello modulo-grande">
  <p><b>${esc(utente.nome)}</b> · ${esc(utente.nomeUtente)} · ${RUOLI[utente.ruolo]}${utente.titolare ? " · titolare" : ""}</p>
  <div class="campo">
    <label for="minuti_blocco">Blocca lo schermo dopo quanti minuti di inattività</label>
    <input id="minuti_blocco" name="minuti_blocco" type="number" min="${config.minutiBloccoMin}" max="${config.minutiBloccoMax}" value="${esc(v.minuti_blocco)}" required>
    <p class="nota">Da ${config.minutiBloccoMin} a ${config.minutiBloccoMax} minuti. Per sbloccare serve la tua password. Puoi bloccarlo anche subito con «Blocca» in alto.</p>
  </div>
  <div class="campo">
    <label for="email">Email per i promemoria <span class="facoltativo">(facoltativa)</span></label>
    <input id="email" name="email" type="email" value="${esc(v.email)}" placeholder="nome@studio.it">
    <p class="nota">I promemoria via email non contengono nomi di clienti né dettagli della pratica.</p>
  </div>
  <fieldset class="campo">
    <legend>Tema</legend>
    <div class="scelte">
      <label class="scelta"><input type="radio" name="tema" value="chiaro"${v.tema !== "scuro" ? " checked" : ""}> Chiaro</label>
      <label class="scelta"><input type="radio" name="tema" value="scuro"${v.tema === "scuro" ? " checked" : ""}> Scuro</label>
    </div>
  </fieldset>
  <div class="azioni"><button class="btn pri">Salva</button></div>
</form>`,
  });
}

module.exports = { paginaProfilo };
