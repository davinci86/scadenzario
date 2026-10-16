// ─────────────────────────────────────────────────────────────
// L'APPLICAZIONE
// Qui si monta tutto, nell'ordine in cui ogni richiesta lo attraversa:
// 1. sicurezza di base   2. lettura dei moduli   3. file statici (CSS)
// 4. chi è collegato     5. rotte               6. pagina "non trovata"
// È separata da server.js così i test possono creare un'app di prova.
// ─────────────────────────────────────────────────────────────
const path = require("node:path");
const express = require("express");
const { caricaUtente } = require("./auth/permessi");
const { rotteAccesso } = require("./routes/accesso");
const { rottePagine } = require("./routes/pagine");
const { rotteUtenti } = require("./routes/utenti");
const { rotteScadenze } = require("./routes/scadenze");
const { rotteNotifiche } = require("./routes/notifiche");
const { paginaErrore } = require("./views/errore");

function creaApp(db) {
  const app = express();
  app.disable("x-powered-by"); // non dichiariamo che software usiamo

  // 1. Istruzioni di sicurezza per il browser
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY"); // la pagina non può essere incorniciata da altri siti
    res.setHeader("Referrer-Policy", "same-origin");
    // Il browser carica solo risorse dal nostro server: niente da internet.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'"
    );
    next();
  });

  // 2. Legge i dati inviati dai moduli (es. nome utente e password)
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));

  // 3. File statici: il foglio di stile
  app.use(express.static(path.join(__dirname, "..", "public")));

  // 4. Chi è collegato?
  app.use(caricaUtente(db));

  // 5. Le rotte
  app.use(rotteAccesso(db));
  app.use(rottePagine(db));
  app.use(rotteUtenti(db));
  app.use(rotteScadenze(db));
  app.use(rotteNotifiche(db));

  // 6. Nessuna rotta ha risposto: pagina inesistente
  app.use((req, res) => {
    res.status(404).send(paginaErrore(req.utente, "Pagina non trovata", "L'indirizzo richiesto non esiste."));
  });

  return app;
}

module.exports = { creaApp };
