// Pagina riservata all'Admin: elenco utenti e ultime attività.
// (Dalla Tappa 5 diventerà la sezione Impostazioni completa.)
const { esc, layout, RUOLI } = require("./html");

const dataOra = (ms) =>
  new Date(ms).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

function paginaUtenti(utente, utenti, attivita) {
  return layout({
    titolo: "Utenti e registro",
    utente,
    attiva: "utenti",
    contenuto: `
<h1>Utenti e registro</h1>
<section class="pannello">
  <h2>Utenti</h2>
  <table class="semplice">
    <thead><tr><th>Persona</th><th>Nome utente</th><th>Ruolo</th><th>Stato</th></tr></thead>
    <tbody>${utenti
      .map((u) => `<tr><td><b>${esc(u.nome)}</b><br><span class="nota">${esc(u.titolo)}</span></td>
        <td>${esc(u.nome_utente)}</td><td>${RUOLI[u.ruolo]}</td>
        <td>${u.attivo ? "Attivo" : "Disattivato"}${u.bloccato_fino > Date.now() ? " · bloccato" : ""}</td></tr>`)
      .join("")}</tbody>
  </table>
</section>
<section class="pannello">
  <h2>Ultime attività</h2>
  <table class="semplice">
    <thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Dettaglio</th></tr></thead>
    <tbody>${
      attivita.length
        ? attivita
            .map((a) => `<tr><td>${dataOra(a.quando)}</td><td>${esc(a.nome || "—")}</td>
              <td><span class="etichetta">${esc(a.azione)}</span></td><td>${esc(a.dettaglio)}</td></tr>`)
            .join("")
        : `<tr><td colspan="4" class="nota">Nessuna attività.</td></tr>`
    }</tbody>
  </table>
</section>`,
  });
}

module.exports = { paginaUtenti };
