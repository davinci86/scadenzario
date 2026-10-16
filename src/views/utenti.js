// Pagina riservata all'Admin: utenti (con la qualifica di titolare),
// ultime attività ed email in uscita.
// (Dalla Tappa 5 diventerà la sezione Impostazioni completa.)
const { esc, layout, RUOLI } = require("./html");
const { formattaMomento } = require("../dominio/date");

function paginaUtenti(utente, utenti, attivita, email = [], smtpConfigurato = false) {
  return layout({
    titolo: "Registro",
    utente,
    attiva: "utenti",
    contenuto: `
<h1>Registro</h1>
<section class="pannello">
  <h2>Utenti</h2>
  <table class="semplice">
    <thead><tr><th>Persona</th><th>Nome utente</th><th>Ruolo</th><th>Titolare</th><th>Email</th><th>Stato</th></tr></thead>
    <tbody>${utenti
      .map((u) => `<tr><td><b>${esc(u.nome)}</b><br><span class="nota">${esc(u.titolo)}</span></td>
        <td>${esc(u.nome_utente)}</td><td>${RUOLI[u.ruolo]}</td>
        <td><form method="post" action="/admin/utenti/${u.id}/titolare"><button class="btn piccolo${u.titolare ? " pri" : ""}" title="Il titolare vede il registro degli ingressi">${u.titolare ? "Sì · togli" : "No · assegna"}</button></form></td>
        <td>${u.email ? esc(u.email) : `<span class="nota">—</span>`}</td>
        <td>${u.attivo ? "Attivo" : "Disattivato"}${u.bloccato_fino > Date.now() ? " · bloccato" : ""}</td></tr>`)
      .join("")}</tbody>
  </table>
  <p class="nota spazio-sopra">La qualifica di titolare si aggiunge al ruolo: permette di vedere il registro degli ingressi.</p>
</section>
<section class="pannello">
  <h2>Email in uscita</h2>
  ${smtpConfigurato ? "" : `<p class="avviso">Il server di posta non è ancora configurato: le email restano in coda e partiranno quando lo sarà.</p>`}
  <table class="semplice">
    <thead><tr><th>Creata</th><th>A</th><th>Testo</th><th>Stato</th></tr></thead>
    <tbody>${email.length ? email.map((m) => `<tr><td>${formattaMomento(m.creata)}</td><td>${esc(m.nome)}<br><span class="nota">${esc(m.destinatario)}</span></td>
      <td class="testo-email">${esc(m.testo.split("\n")[0])}</td>
      <td>${m.inviata ? "Inviata " + formattaMomento(m.inviata) : m.errore ? `<span class="etichetta attenzione">Errore</span> ${esc(m.errore)}` : "In coda"}</td></tr>`).join("")
      : `<tr><td colspan="4" class="nota">Nessuna email.</td></tr>`}</tbody>
  </table>
</section>
<section class="pannello">
  <h2>Ultime attività</h2>
  <table class="semplice">
    <thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Dettaglio</th></tr></thead>
    <tbody>${
      attivita.length
        ? attivita
            .map((a) => `<tr><td>${formattaMomento(a.quando)}</td><td>${esc(a.nome || "—")}</td>
              <td><span class="etichetta">${esc(a.azione)}</span></td><td>${esc(a.dettaglio)}</td></tr>`)
            .join("")
        : `<tr><td colspan="4" class="nota">Nessuna attività.</td></tr>`
    }</tbody>
  </table>
</section>`,
  });
}

module.exports = { paginaUtenti };
