// ─────────────────────────────────────────────────────────────
// ROTTE DEGLI UTENTI
//   GET  /admin/utenti                 l'elenco (solo Admin)
//   GET  /admin/utenti/nuovo           modulo per un nuovo utente
//   POST /admin/utenti                 crea l'utente
//   GET  /admin/utenti/:id             scheda di un utente
//   POST /admin/utenti/:id             salva i dati (nome, ruolo, email…)
//   POST /admin/utenti/:id/password    password provvisoria
//   POST /admin/utenti/:id/sblocca     sblocca dopo troppi tentativi
//   POST /admin/utenti/:id/attivo      disattiva / riattiva
//   POST /admin/utenti/:id/elimina     elimina (vedi db/utenti.js)
//   POST /admin/utenti/:id/titolare    assegna / toglie la qualifica
//   GET/POST /profilo/password         ognuno cambia la propria password
//
// Regole di sicurezza (le controlla il server, sempre):
//  • l'Admin non può togliersi il ruolo, disattivarsi o eliminarsi da sola;
//  • deve restare sempre almeno un Admin attivo;
//  • ogni operazione finisce nel Registro (mai le password).
// ─────────────────────────────────────────────────────────────
const express = require("express");
const U = require("../db/utenti");
const { registra } = require("../db/registro");
const { richiediAccesso, richiediRuolo } = require("../auth/permessi");
const { verificaPassword } = require("../auth/password");
const { leggiCookie, impronta } = require("../auth/sessioni");
const { paginaUtenti, paginaUtente, paginaPassword } = require("../views/utenti");
const { paginaErrore } = require("../views/errore");
const { RUOLI } = require("../views/html");

function rotteUtenti(db) {
  const router = express.Router();
  const soloAdmin = richiediRuolo("admin");

  // Trova l'utente dell'indirizzo, oppure risponde "non trovato"
  const conUtente = (gestore) => (req, res) => {
    const persona = U.trovaUtente(db, req.params.id);
    if (!persona) return res.status(404).send(paginaErrore(req.utente, "Utente non trovato", "Forse è stato eliminato."));
    gestore(req, res, persona);
  };

  // Mostra la scheda dell'utente (con eventuale messaggio o errori)
  const scheda = (req, persona, extra = {}) =>
    paginaUtente(req.utente, persona, { aperte: U.attivitaAperte(db, persona.id), ...extra });

  const vai = (res, id, messaggio) =>
    res.redirect(`/admin/utenti/${id}` + (messaggio ? `?fatto=${encodeURIComponent(messaggio)}` : ""));

  // ── Elenco ──
  router.get("/admin/utenti", soloAdmin, (req, res) => {
    res.send(paginaUtenti(req.utente, U.elencoUtenti(db), U.utentiEliminati(db), String(req.query.fatto ?? "").slice(0, 200)));
  });

  // ── Nuovo utente ──
  router.get("/admin/utenti/nuovo", soloAdmin, (req, res) => {
    res.send(paginaUtente(req.utente, null, { valori: { ruolo: "collab" } }));
  });
  router.post("/admin/utenti", soloAdmin, (req, res) => {
    const { dati, errori } = U.controllaDati(db, req.body, { nuovo: true });
    if (errori.length) return res.status(400).send(paginaUtente(req.utente, null, { valori: req.body, errori }));
    const id = U.creaUtente(db, dati);
    registra(db, req.utente.id, "Utenti", `Creato ${dati.nome} (${dati.nome_utente}, ${RUOLI[dati.ruolo]})`);
    vai(res, id, "Utente creato. Comunica di persona la password provvisoria: al primo accesso dovrà sceglierne una sua.");
  });

  // ── Scheda e modifica ──
  router.get("/admin/utenti/:id", soloAdmin, conUtente((req, res, persona) => {
    res.send(scheda(req, persona, { fatto: String(req.query.fatto ?? "").slice(0, 300) }));
  }));

  router.post("/admin/utenti/:id", soloAdmin, conUtente((req, res, persona) => {
    const { dati, errori } = U.controllaDati(db, req.body, { id: persona.id });
    const io = persona.id === req.utente.id;
    if (io && dati.ruolo !== persona.ruolo) errori.push("Non puoi cambiare il tuo stesso ruolo.");
    if (persona.ruolo === "admin" && dati.ruolo !== "admin" && persona.attivo && U.adminAttivi(db) <= 1) {
      errori.push("Deve restare almeno un Admin attivo.");
    }
    if (errori.length) return res.status(400).send(scheda(req, persona, { valori: req.body, errori }));

    // Nel registro scriviamo cosa è cambiato
    const cambi = [];
    if (dati.nome !== persona.nome) cambi.push(`nome «${dati.nome}»`);
    if (dati.nome_utente !== persona.nome_utente) cambi.push(`nome utente «${dati.nome_utente}»`);
    if (dati.titolo !== persona.titolo) cambi.push(`qualifica «${dati.titolo}»`);
    if (dati.ruolo !== persona.ruolo) cambi.push(`ruolo ${RUOLI[persona.ruolo]} → ${RUOLI[dati.ruolo]}`);
    if (dati.email !== persona.email) cambi.push("email");
    if (dati.titolare !== persona.titolare) cambi.push(dati.titolare ? "assegnato titolare" : "tolto titolare");
    U.aggiornaUtente(db, persona.id, dati);
    if (cambi.length) registra(db, req.utente.id, "Utenti", `${persona.nome}: ${cambi.join(", ")}`);
    vai(res, persona.id, cambi.length ? "Modifiche salvate." : "Nessuna modifica.");
  }));

  // ── Password provvisoria ──
  router.post("/admin/utenti/:id/password", soloAdmin, conUtente((req, res, persona) => {
    const password = String(req.body?.password ?? "");
    if (password.length < U.PASSWORD_MINIMA) {
      return res.status(400).send(scheda(req, persona, { errori: [`La password provvisoria deve avere almeno ${U.PASSWORD_MINIMA} caratteri.`] }));
    }
    const io = persona.id === req.utente.id;
    U.impostaPassword(db, persona.id, password, { provvisoria: !io, tranneSessione: io ? impronta(leggiCookie(req)) : null });
    registra(db, req.utente.id, "Utenti", `${persona.nome}: nuova password provvisoria`);
    vai(res, persona.id, io ? "Password cambiata." : "Password provvisoria impostata. Al prossimo accesso dovrà sceglierne una sua.");
  }));

  router.post("/admin/utenti/:id/sblocca", soloAdmin, conUtente((req, res, persona) => {
    U.sbloccaAccesso(db, persona.id);
    registra(db, req.utente.id, "Utenti", `${persona.nome}: accesso sbloccato`);
    vai(res, persona.id, "Accesso sbloccato.");
  }));

  // ── Disattiva / riattiva ──
  router.post("/admin/utenti/:id/attivo", soloAdmin, conUtente((req, res, persona) => {
    const attiva = !persona.attivo;
    if (!attiva) {
      if (persona.id === req.utente.id) return res.status(400).send(scheda(req, persona, { errori: ["Non puoi disattivare te stessa."] }));
      if (persona.ruolo === "admin" && U.adminAttivi(db) <= 1) return res.status(400).send(scheda(req, persona, { errori: ["Deve restare almeno un Admin attivo."] }));
    }
    U.impostaAttivo(db, persona.id, attiva);
    registra(db, req.utente.id, "Utenti", `${persona.nome}: ${attiva ? "riattivato" : "disattivato"}`);
    vai(res, persona.id, attiva ? "Utente riattivato." : "Utente disattivato: non può più entrare.");
  }));

  // ── Elimina ──
  router.post("/admin/utenti/:id/elimina", soloAdmin, conUtente((req, res, persona) => {
    const errori = [];
    if (persona.id === req.utente.id) errori.push("Non puoi eliminare te stessa.");
    if (persona.ruolo === "admin" && persona.attivo && U.adminAttivi(db) <= 1) errori.push("Deve restare almeno un Admin attivo.");
    if (req.body?.conferma !== "1") errori.push("Spunta la conferma per eliminare.");
    if (errori.length) return res.status(400).send(scheda(req, persona, { errori }));
    const aperte = U.attivitaAperte(db, persona.id).length;
    U.eliminaUtente(db, persona.id, req.utente.id);
    registra(db, req.utente.id, "Utenti", `Eliminato ${persona.nome} (${persona.nome_utente})` +
      (aperte ? `; tolto da ${aperte} attività aperte` : ""));
    res.redirect(`/admin/utenti?fatto=${encodeURIComponent(`${persona.nome} è stato eliminato. Il suo nome resta nello storico.`)}`);
  }));

  // ── Qualifica di titolare (pulsante rapido nell'elenco) ──
  router.post("/admin/utenti/:id/titolare", soloAdmin, conUtente((req, res, persona) => {
    db.prepare("UPDATE utenti SET titolare = ? WHERE id = ?").run(persona.titolare ? 0 : 1, persona.id);
    registra(db, req.utente.id, "Utenti", `${persona.nome}: ${persona.titolare ? "tolta" : "assegnata"} la qualifica di titolare`);
    res.redirect("/admin/utenti");
  }));

  // ── Ognuno cambia la propria password ──
  router.get("/profilo/password", richiediAccesso, (req, res) => {
    res.send(paginaPassword(req.utente));
  });
  router.post("/profilo/password", richiediAccesso, (req, res) => {
    const attuale = String(req.body?.attuale ?? "");
    const nuova = String(req.body?.nuova ?? "");
    const conferma = String(req.body?.conferma ?? "");
    const riga = db.prepare("SELECT password_hash FROM utenti WHERE id = ?").get(req.utente.id);
    const errori = [];
    if (!verificaPassword(attuale, riga.password_hash)) errori.push("La password attuale non è corretta.");
    if (nuova.length < U.PASSWORD_MINIMA) errori.push(`La nuova password deve avere almeno ${U.PASSWORD_MINIMA} caratteri.`);
    else if (nuova !== conferma) errori.push("Le due nuove password non coincidono.");
    else if (nuova === attuale) errori.push("La nuova password deve essere diversa da quella attuale.");
    if (errori.length) return res.status(400).send(paginaPassword(req.utente, { errori }));
    // Le altre sessioni aperte con la vecchia password si chiudono; questa resta
    U.impostaPassword(db, req.utente.id, nuova, { provvisoria: false, tranneSessione: impronta(leggiCookie(req)) });
    registra(db, req.utente.id, "Password cambiata");
    res.redirect("/profilo?password=1");
  });

  return router;
}

module.exports = { rotteUtenti };
