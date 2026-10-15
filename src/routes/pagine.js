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
const { elencoScadenze } = require("../db/scadenze");
const { puoModificare, eAdmin } = require("../auth/regole");

function rottePagine(db) {
  const router = express.Router();

  // La dashboard: per chiunque abbia fatto l'accesso.
  router.get("/", richiediAccesso, (req, res) => {
    const u = req.utente;
    const mie = elencoScadenze(db, { persona: u.id });
    res.send(paginaDashboard(u, {
      mie,
      udienze: mie.filter((s) => s.tipo === "udienza"),
      // Solo per chi può assegnare
      daAssegnare: puoModificare(u) ? elencoScadenze(db, { persona: "nessuno" }) : null,
      // Solo per l'Admin
      daVerificare: eAdmin(u) ? elencoScadenze(db, { daVerificare: true }) : null,
    }));
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
