// ─────────────────────────────────────────────────────────────
// PAGINE RISERVATE ALL'ADMIN
// • Utenti:   chi può entrare, con quale ruolo; aggiungere, disattivare, eliminare.
// • Registro: cosa è successo (attività) e le email in uscita.
// Sono due cose diverse, quindi due pagine e due voci di menu.
// ─────────────────────────────────────────────────────────────
const { esc, layout, RUOLI } = require("./html");
const { formattaMomento } = require("../dominio/date");

const DESCRIZIONE_RUOLI = {
  admin: "Gestisce tutto: utenti, catalogo degli atti, verifiche dei termini. Di solito una sola persona.",
  editor: "Inserisce e modifica le scadenze, assegna le persone, corregge le date.",
  collab: "Vede tutto lo scadenzario e lavora sulle attività in cui è coinvolto.",
};

// Le etichette di stato di un utente
function statoDi(u) {
  const t = [];
  t.push(u.attivo ? `<span class="etichetta ok">Attivo</span>` : `<span class="etichetta">Disattivato</span>`);
  if (u.bloccato_fino > Date.now()) t.push(`<span class="etichetta attenzione">Bloccato (troppi tentativi)</span>`);
  if (u.cambia_password) t.push(`<span class="etichetta">Password provvisoria</span>`);
  return t.join(" ");
}

function paginaUtenti(utente, utenti, eliminati = [], fatto = "") {
  return layout({
    titolo: "Utenti",
    utente,
    attiva: "utenti",
    contenuto: `
<div class="testata-azioni"><h1>Utenti</h1><a class="btn pri" href="/admin/utenti/nuovo">+ Nuovo utente</a></div>
${fatto ? `<p class="avviso">${esc(fatto)}</p>` : ""}
<section class="pannello">
  <table class="semplice">
    <thead><tr><th>Persona</th><th>Nome utente</th><th>Ruolo</th><th>Titolare</th><th>Email</th><th>Stato</th><th></th></tr></thead>
    <tbody>${utenti
      .map((u) => `<tr${u.attivo ? "" : ' class="spento"'}><td><a href="/admin/utenti/${u.id}"><b>${esc(u.nome)}</b></a><br><span class="nota">${esc(u.titolo)}</span></td>
        <td>${esc(u.nome_utente)}</td><td>${RUOLI[u.ruolo]}</td>
        <td><form method="post" action="/admin/utenti/${u.id}/titolare"><button class="btn piccolo${u.titolare ? " pri" : ""}" title="Il titolare vede il registro degli ingressi">${u.titolare ? "Sì · togli" : "No · assegna"}</button></form></td>
        <td>${u.email ? esc(u.email) : `<span class="nota">—</span>`}</td>
        <td>${statoDi(u)}</td>
        <td><a class="btn piccolo" href="/admin/utenti/${u.id}">Apri</a></td></tr>`)
      .join("")}</tbody>
  </table>
  <p class="nota spazio-sopra">La qualifica di titolare si aggiunge al ruolo: permette di vedere il registro degli ingressi.</p>
</section>
${eliminati.length ? `
<details class="pannello">
  <summary><b>Utenti eliminati (${eliminati.length})</b> <span class="nota">· non possono entrare; il loro nome resta nello storico delle attività</span></summary>
  <ul class="semplice">${eliminati.map((u) => `<li>${esc(u.nome)} <span class="nota">· ${esc(u.titolo)} · eliminato il ${formattaMomento(u.eliminato)}</span></li>`).join("")}</ul>
</details>` : ""}`,
  });
}

// La scheda di un utente (persona = null per un utente nuovo)
function paginaUtente(utente, persona, { valori, errori = [], fatto = "", aperte = [] } = {}) {
  const nuovo = !persona;
  const io = !nuovo && persona.id === utente.id;
  const v = (campo) => esc(valori?.[campo] ?? persona?.[campo] ?? "");
  const ruolo = valori?.ruolo ?? persona?.ruolo;
  const titolare = valori ? valori.titolare === "1" : !!persona?.titolare;
  const url = nuovo ? "/admin/utenti" : `/admin/utenti/${persona.id}`;

  const dati = `
<form method="post" action="${url}" class="pannello modulo-grande" data-nome="Dati dell'utente"${errori.length && valori ? " data-non-salvato" : ""}>
  <h2>Dati</h2>
  <div class="campo"><label for="nome">Nome e cognome</label>
    <input id="nome" name="nome" value="${v("nome")}" required maxlength="80" placeholder="Es. Avv. Mario Rossi"></div>
  <div class="campo"><label for="titolo">Qualifica <span class="facoltativo">(facoltativa)</span></label>
    <input id="titolo" name="titolo" value="${v("titolo")}" maxlength="60" placeholder="Es. Praticante, Segreteria, Avvocato"></div>
  <div class="campo"><label for="nome_utente">Nome utente</label>
    <input id="nome_utente" name="nome_utente" value="${v("nome_utente")}" required maxlength="30" autocomplete="off" placeholder="Es. m.rossi">
    <p class="nota">Serve per entrare. Lettere minuscole, numeri, punto o trattino.</p></div>
  <fieldset class="campo"><legend>Ruolo</legend>
    ${io
      ? `<input type="hidden" name="ruolo" value="${esc(persona.ruolo)}"><p><b>${RUOLI[persona.ruolo]}</b> <span class="nota">· non puoi cambiare il tuo stesso ruolo</span></p>`
      : `<div class="radios">${Object.entries(DESCRIZIONE_RUOLI).map(([k, d]) =>
          `<label class="radio"><input type="radio" name="ruolo" value="${k}"${ruolo === k ? " checked" : ""} required><span><b>${RUOLI[k]}</b> ${esc(d)}</span></label>`).join("")}</div>`}
  </fieldset>
  <div class="campo"><label class="radio"><input type="checkbox" name="titolare" value="1"${titolare ? " checked" : ""}><span><b>Titolare</b> Vede il registro degli ingressi (si aggiunge al ruolo).</span></label></div>
  <div class="campo"><label for="email">Email per i promemoria <span class="facoltativo">(facoltativa)</span></label>
    <input id="email" name="email" type="email" value="${v("email")}" maxlength="200" placeholder="nome@studio.it"></div>
  ${nuovo ? `
  <div class="campo"><label for="password">Password provvisoria</label>
    <input id="password" name="password" type="text" required minlength="8" autocomplete="off" spellcheck="false">
    <p class="nota">Almeno 8 caratteri. Comunicala di persona: al primo accesso dovrà sceglierne una sua.</p></div>` : ""}
  <div class="azioni"><button class="btn pri">${nuovo ? "Crea l'utente" : "Salva le modifiche"}</button></div>
</form>`;

  if (nuovo) {
    return layout({ titolo: "Nuovo utente", utente, attiva: "utenti", contenuto: `
<nav class="briciole"><a href="/admin/utenti"><span aria-hidden="true">←</span> Utenti</a></nav>
<h1>Nuovo utente</h1>
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
${dati}` });
  }

  const bloccato = persona.bloccato_fino > Date.now();
  const accesso = `
<section class="pannello">
  <h2>Accesso</h2>
  <p>${statoDi(persona)}</p>
  ${bloccato ? `<form method="post" action="${url}/sblocca" class="spazio-sotto"><button class="btn piccolo">Sblocca l'accesso adesso</button></form>` : ""}
  <form method="post" action="${url}/password" class="modulo" data-nome="Password provvisoria">
    <label for="nuova-password">${io ? "Nuova password" : "Nuova password provvisoria"}</label>
    <div class="in-linea"><input id="nuova-password" name="password" type="${io ? "password" : "text"}" required minlength="8" autocomplete="off" spellcheck="false">
    <button class="btn piccolo">${io ? "Cambia" : "Imposta"}</button></div>
    <p class="nota">${io ? "Per la tua password puoi anche usare «Il mio profilo»." : "Per chi l'ha dimenticata. Le sue sessioni aperte si chiudono e al prossimo accesso dovrà sceglierne una sua."}</p>
  </form>
</section>`;

  const elencoAperte = aperte.length
    ? `<ul class="semplice">${aperte.slice(0, 8).map((s) => `<li>N. ${s.id} · ${esc(s.cliente)}</li>`).join("")}${aperte.length > 8 ? `<li class="nota">…e altre ${aperte.length - 8}</li>` : ""}</ul>`
    : "";

  const uscita = io ? "" : `
<section class="pannello">
  <h2>${persona.attivo ? "Disattiva" : "Riattiva"}</h2>
  ${persona.attivo
    ? `<p>Non potrà più entrare, ma resta nell'elenco e si può riattivare quando serve (es. un'assenza lunga). Non riceve promemoria.</p>
       ${aperte.length ? `<p class="avviso">È nella squadra di <b>${aperte.length}</b> attività aperte: resta in squadra. Se non c'è nessun altro, i promemoria vanno ad Admin ed Editor. <a href="/scadenzario?persona=${persona.id}">Vedi le sue attività</a></p>` : ""}`
    : `<p>Potrà di nuovo entrare con la sua password.</p>`}
  <form method="post" action="${url}/attivo"><button class="btn${persona.attivo ? "" : " pri"}">${persona.attivo ? "Disattiva l'utente" : "Riattiva l'utente"}</button></form>
</section>
<section class="pannello zona-pericolo">
  <h2>Elimina</h2>
  <p>Per chi ha lasciato lo studio. Non potrà più entrare e sparisce dagli elenchi, ma <b>il suo nome resta</b> nello storico, nelle note e nel registro: si saprà sempre chi ha fatto cosa. Email e password vengono cancellate. <b>Non si può annullare.</b></p>
  ${aperte.length ? `<p class="avviso">Verrà tolto dalla squadra di <b>${aperte.length}</b> attività aperte (lo storico lo annota). Quelle in cui resta senza nessuno diventano «Da assegnare».</p>${elencoAperte}` : ""}
  <form method="post" action="${url}/elimina" class="modulo" data-nome="Elimina utente">
    <label class="radio"><input type="checkbox" name="conferma" value="1" required><span>Confermo: elimina <b>${esc(persona.nome)}</b></span></label>
    <div><button class="btn pericolo">Elimina l'utente</button></div>
  </form>
</section>`;

  return layout({ titolo: persona.nome, utente, attiva: "utenti", contenuto: `
<nav class="briciole"><a href="/admin/utenti"><span aria-hidden="true">←</span> Utenti</a></nav>
<h1>${esc(persona.nome)}</h1>
${fatto ? `<p class="avviso">${esc(fatto)}</p>` : ""}
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<div class="griglia">
  <div class="colonna-lavoro">${dati}</div>
  <div class="colonna-destra">${accesso}${uscita}</div>
</div>` });
}

// Ognuno cambia la propria password (obbligatorio se è provvisoria)
function paginaPassword(utente, { errori = [] } = {}) {
  return layout({ titolo: "Cambia la password", utente, attiva: "profilo", contenuto: `
${utente.cambiaPassword ? "" : `<nav class="briciole"><a href="/profilo"><span aria-hidden="true">←</span> Il mio profilo</a></nav>`}
<h1>${utente.cambiaPassword ? "Scegli la tua password" : "Cambia la password"}</h1>
${utente.cambiaPassword ? `<p class="avviso">Stai usando una password provvisoria. Prima di continuare scegline una tua: la conoscerai solo tu.</p>` : ""}
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/profilo/password" class="pannello modulo-grande" data-nome="Cambio password">
  <div class="campo"><label for="attuale">Password attuale${utente.cambiaPassword ? " (quella provvisoria)" : ""}</label>
    <input id="attuale" name="attuale" type="password" required autocomplete="current-password"></div>
  <div class="campo"><label for="nuova">Nuova password</label>
    <input id="nuova" name="nuova" type="password" required minlength="8" autocomplete="new-password">
    <p class="nota">Almeno 8 caratteri. Meglio una frase facile da ricordare per te, es. «Caffè alle 8 in via Toledo».</p></div>
  <div class="campo"><label for="conferma">Ripeti la nuova password</label>
    <input id="conferma" name="conferma" type="password" required minlength="8" autocomplete="new-password"></div>
  <div class="azioni"><button class="btn pri">Salva la password</button></div>
</form>` });
}

function paginaRegistro(utente, attivita, email = [], smtpConfigurato = false, conAccessi = false) {
  return layout({
    titolo: "Registro",
    utente,
    attiva: "registro",
    contenuto: `
<h1>Registro</h1>
<section class="pannello">
  <h2>Ultime attività</h2>
  <p class="nota">${conAccessi
    ? `Sono inclusi accessi e uscite. <a href="/admin/registro">Nascondili</a>`
    : `Accessi e uscite non sono mostrati (gli orari del giorno sono in <a href="/ingressi">Ingressi</a>); i tentativi falliti sì. <a href="/admin/registro?accessi=1">Mostra anche accessi e uscite</a>`}</p>
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
</section>`,
  });
}

module.exports = { paginaUtenti, paginaUtente, paginaPassword, paginaRegistro };
