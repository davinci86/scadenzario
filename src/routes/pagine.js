// ─────────────────────────────────────────────────────────────
// ROTTE DELLE PAGINE
// Ogni rotta passa prima dal "portiere" (richiediAccesso o
// richiediRuolo) e solo dopo mostra la pagina.
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { richiediAccesso, richiediRuolo } = require("../auth/permessi");
const { ultimeAttivita } = require("../db/registro");
const { paginaDashboard } = require("../views/dashboard");
const { paginaUtenti } = require("../views/utenti");

function rottePagine(db) {
  const router = express.Router();

  // La dashboard: per chiunque abbia fatto l'accesso.
  router.get("/", richiediAccesso, (req, res) => {
    res.send(paginaDashboard(req.utente));
  });

  // Utenti e registro: solo per l'Admin.
  router.get("/admin/utenti", richiediRuolo("admin"), (req, res) => {
    const utenti = db
      .prepare("SELECT nome_utente, nome, titolo, ruolo, attivo, bloccato_fino FROM utenti ORDER BY id")
      .all();
    res.send(paginaUtenti(req.utente, utenti, ultimeAttivita(db, 30)));
  });

  return router;
}

module.exports = { rottePagine };
