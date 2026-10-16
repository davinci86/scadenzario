// ─────────────────────────────────────────────────────────────
// ROTTE DELLE PAGINE
// Ogni rotta passa prima dal "portiere" (richiediAccesso o
// richiediRuolo) e solo dopo mostra la pagina.
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { richiediAccesso, richiediRuolo } = require("../auth/permessi");
const { ultimeAttivita } = require("../db/registro");
const { paginaDashboard } = require("../views/dashboard");
const { paginaRegistro } = require("../views/utenti");
const { elencoScadenze, utentiAttivi } = require("../db/scadenze");
const { giorniDaOggi } = require("../dominio/date");
const { puoModificare, eAdmin, vedeIngressi } = require("../auth/regole");
const { notificheDi } = require("../db/notifiche");
const { ricevute } = require("../db/segnalazioni");
const { daConfermare } = require("../db/fascicoli");
const { leggiImpostazioni } = require("../servizi/impostazioni");
const { presenzeDelGiorno } = require("../db/presenze");
const { ultimeEmail } = require("../servizi/email");
const { registra } = require("../db/registro");
const { eValida, oggi } = require("../dominio/date");
const config = require("../config");
const { paginaIngressi } = require("../views/ingressi");
const { paginaProfilo } = require("../views/profilo");
const { paginaErrore } = require("../views/errore");

// Torna alla pagina da cui si è premuto il pulsante (solo se è del nostro sito)
function tornaIndietro(req, res) {
  let destinazione = "/";
  try {
    const url = new URL(req.get("Referer"));
    if (url.host === req.get("Host")) destinazione = url.pathname + url.search;
  } catch { /* nessuna provenienza valida: si torna alla dashboard */ }
  res.redirect(destinazione);
}

function rottePagine(db) {
  const router = express.Router();

  // La dashboard: per chiunque abbia fatto l'accesso.
  router.get("/", richiediAccesso, (req, res) => {
    const u = req.utente;
    const mie = elencoScadenze(db, { persona: u.id });
    const dati = {
      mie,
      udienze: mie.filter((s) => s.tipo === "udienza"),
      // Le notifiche delle segnalazioni non si ripetono qui: hanno il loro pannello
      daLeggere: notificheDi(db, u.id, { soloDaLeggere: true, limite: 50 }).filter((n) => n.tipo !== "segnalazione"),
      segnalazioni: ricevute(db, u.id, { soloDaLeggere: true, limite: 20 }),
      fascicoliDaConfermare: daConfermare(db, u.id),
      giorniFascicoli: leggiImpostazioni(db).giorniFascicoloFuori,
      colleghi: utentiAttivi(db),
      // Solo per l'Admin
      daVerificare: eAdmin(u) ? elencoScadenze(db, { daVerificare: true }) : null,
    };
    // Solo per chi può assegnare: scadenze senza squadra, quadro dello studio, chi ha cosa
    if (puoModificare(u)) {
      const aperte = elencoScadenze(db, {});
      dati.daAssegnare = aperte.filter((s) => s.squadra.length === 0);
      dati.studio = { aperte: aperte.length, scadute: aperte.filter((s) => giorniDaOggi(s.data) < 0) };
      dati.chiHaCosa = utentiAttivi(db).map((persona) => ({
        persona,
        scadenze: aperte.filter((s) => s.squadra.some((p) => p.id === persona.id)),
      }));
    }
    res.send(paginaDashboard(u, dati));
  });

  // Tema chiaro/scuro: una preferenza personale, salvata nel profilo.
  router.post("/preferenze/tema", richiediAccesso, (req, res) => {
    const nuovo = req.utente.tema === "scuro" ? "chiaro" : "scuro";
    db.prepare("UPDATE utenti SET tema = ? WHERE id = ?").run(nuovo, req.utente.id);
    tornaIndietro(req, res);
  });

  // Menu laterale compresso o aperto: anche questa è una preferenza personale.
  // La chiama menu.js dietro le quinte (il menu cambia subito, senza ricaricare).
  router.post("/preferenze/menu", richiediAccesso, (req, res) => {
    db.prepare("UPDATE utenti SET menu_compresso = ? WHERE id = ?").run(req.body?.compresso === "1" ? 1 : 0, req.utente.id);
    res.json({ ok: true });
  });

  // Il browser segnala che la persona sta usando la pagina (mouse, tastiera):
  // basta passare dal "portiere" per aggiornare l'ultima attività.
  router.post("/api/attivita", richiediAccesso, (req, res) => res.json({ ok: true }));

  // ── Il mio profilo: tema, minuti per il blocco dello schermo, email ──
  router.get("/profilo", richiediAccesso, (req, res) => {
    res.send(paginaProfilo(req.utente, { salvato: req.query.salvato === "1", password: req.query.password === "1" }));
  });
  router.post("/profilo", richiediAccesso, (req, res) => {
    const minuti = Number(req.body?.minuti_blocco);
    const email = String(req.body?.email ?? "").trim().slice(0, 200);
    const tema = req.body?.tema === "scuro" ? "scuro" : "chiaro";
    const errori = [];
    if (!Number.isInteger(minuti) || minuti < config.minutiBloccoMin || minuti > config.minutiBloccoMax) {
      errori.push(`I minuti per il blocco devono essere tra ${config.minutiBloccoMin} e ${config.minutiBloccoMax}.`);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errori.push("L'indirizzo email non sembra valido.");
    if (errori.length) {
      return res.status(400).send(paginaProfilo(req.utente, { errori, valori: { minuti_blocco: req.body?.minuti_blocco, email, tema } }));
    }
    db.prepare("UPDATE utenti SET minuti_blocco = ?, email = ?, tema = ? WHERE id = ?").run(minuti, email, tema, req.utente.id);
    res.redirect("/profilo?salvato=1");
  });

  // ── Ingressi e uscite: Admin e titolari ──
  router.get("/ingressi", richiediAccesso, (req, res) => {
    if (!vedeIngressi(req.utente)) {
      return res.status(403).send(paginaErrore(req.utente, "Accesso non consentito", "Il registro degli ingressi è riservato all'Admin e ai titolari."));
    }
    const giorno = eValida(String(req.query.data)) ? req.query.data : oggi();
    res.send(paginaIngressi(req.utente, giorno, presenzeDelGiorno(db, giorno)));
  });

  // Registro (attività ed email in uscita): solo per l'Admin.
  router.get("/admin/registro", richiediRuolo("admin"), (req, res) => {
    const conAccessi = req.query.accessi === "1";
    res.send(paginaRegistro(req.utente, ultimeAttivita(db, 100, { conAccessi }), ultimeEmail(db, 15), !!config.email.host, conAccessi));
  });

  return router;
}

module.exports = { rottePagine };
