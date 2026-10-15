// La pagina mostrata quando lo schermo è bloccato e si apre un indirizzo.
// (Dentro l'app lo stesso blocco compare come velo, vedi public/js/blocco.js.)
const { esc, layout } = require("./html");

function paginaBloccata(utente, torna = "/", errore = "") {
  return layout({
    titolo: "Schermo bloccato",
    contenuto: `
<div class="login">
  <div class="scheda">
    <div class="marchio">Scadenzario</div>
    <p><b>Schermo bloccato.</b> ${esc(utente.nome)}, inserisci la tua password per continuare.</p>
    ${errore ? `<p class="errore" role="alert">${esc(errore)}</p>` : ""}
    <form method="post" action="/sblocca" class="modulo">
      <input type="hidden" name="torna" value="${esc(torna)}">
      <label for="password-sblocco">Password</label>
      <input id="password-sblocco" name="password" type="password" autocomplete="current-password" required autofocus>
      <button class="btn pri" type="submit">Sblocca</button>
    </form>
    <form method="post" action="/logout"><button class="link" type="submit">Non sei tu? Esci</button></form>
  </div>
</div>`,
  });
}

module.exports = { paginaBloccata };
