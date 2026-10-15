// La pagina di accesso.
const { esc, layout } = require("./html");

function paginaLogin({ errore = "", nomeUtente = "", scaduta = false } = {}) {
  const avviso = errore
    ? `<p class="errore" role="alert">${esc(errore)}</p>`
    : scaduta
      ? `<p class="avviso">La sessione è scaduta per inattività. Accedi di nuovo.</p>`
      : "";

  return layout({
    titolo: "Accesso",
    contenuto: `
<div class="login">
  <div class="scheda">
    <div class="marchio">Scadenzario</div>
    <p class="nota">Accedi con le tue credenziali dello studio.</p>
    ${avviso}
    <form method="post" action="/login" class="modulo">
      <label for="nome_utente">Nome utente</label>
      <input id="nome_utente" name="nome_utente" autocomplete="username" value="${esc(nomeUtente)}" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button class="btn pri" type="submit">Accedi</button>
    </form>
    <p class="nota">Raggiungibile solo dalla rete interna dello studio.</p>
  </div>
</div>`,
  });
}

module.exports = { paginaLogin };
