// ─────────────────────────────────────────────────────────────
// ROTTE DELLE NOTIFICHE
//   GET  /api/notifiche            elenco e numero da leggere (lo chiede la campanella ogni 30 secondi)
//   POST /api/notifiche/avvisate   segna quelle per cui il suono è già stato emesso
//   POST /notifiche/:id/letta      "Letto"
//   POST /notifiche/tutte          "Segna tutte come lette"
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { richiediAccesso } = require("../auth/permessi");
const N = require("../db/notifiche");
const { formattaMomento } = require("../dominio/date");

function rotteNotifiche(db) {
  const router = express.Router();

  router.get("/api/notifiche", richiediAccesso, (req, res) => {
    const elenco = N.notificheDi(db, req.utente.id, { limite: 20 });
    res.json({
      daLeggere: N.quanteDaLeggere(db, req.utente.id),
      // Le nuove, per cui il suono non è ancora stato emesso
      daAvvisare: elenco.filter((n) => !n.letta && !n.avvisata).map((n) => n.id),
      elenco: elenco.map((n) => ({
        id: n.id,
        testo: n.testo,
        quando: formattaMomento(n.creata),
        letta: !!n.letta,
        scadenza: n.scadenza_id ? { id: n.scadenza_id, cliente: n.cliente, attivita: n.attivita } : null,
      })),
    });
  });

  router.post("/api/notifiche/avvisate", richiediAccesso, (req, res) => {
    N.segnaAvvisate(db, [].concat(req.body?.ids ?? []), req.utente.id);
    res.json({ ok: true });
  });

  // Dopo "Letto" si torna dove si era (o si risponde in JSON alla pagina)
  const fatto = (req, res) => {
    if (req.get("X-Parziale") === "1") return res.json({ ok: true });
    let destinazione = "/";
    try {
      const url = new URL(req.get("Referer"));
      if (url.host === req.get("Host")) destinazione = url.pathname + url.search;
    } catch { /* torna alla dashboard */ }
    res.redirect(destinazione);
  };

  router.post("/notifiche/tutte", richiediAccesso, (req, res) => {
    N.segnaTutteLette(db, req.utente.id);
    fatto(req, res);
  });

  router.post("/notifiche/:id/letta", richiediAccesso, (req, res) => {
    N.segnaLetta(db, Number(req.params.id), req.utente.id);
    fatto(req, res);
  });

  return router;
}

module.exports = { rotteNotifiche };
