// Pagina d'errore semplice (pagina inesistente, accesso negato…).
const { esc, layout } = require("./html");

function paginaErrore(utente, titolo, messaggio) {
  return layout({
    titolo,
    utente,
    contenuto: `<section class="pannello"><h1>${esc(titolo)}</h1><p>${esc(messaggio)}</p>
      <p><a href="/">Torna alla dashboard</a></p></section>`,
  });
}

module.exports = { paginaErrore };
