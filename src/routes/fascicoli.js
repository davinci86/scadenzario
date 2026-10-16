// ─────────────────────────────────────────────────────────────
// ROTTE DEI FASCICOLI
//   GET  /fascicoli?n=…        "Dov'è il fascicolo?" (per tutti)
//   POST /fascicoli/azione     prendo, consegno, ricevuto, non-ricevuto,
//                              annulla, archivio (le regole sono in db/fascicoli.js)
// ─────────────────────────────────────────────────────────────
const express = require("express");
const F = require("../db/fascicoli");
const { utentiAttivi } = require("../db/scadenze");
const { richiediAccesso } = require("../auth/permessi");
const { paginaFascicoli } = require("../views/fascicoli");
const { percorsoLocale } = require("./segnalazioni");

// Cosa dire dopo ogni azione riuscita
const FATTO = {
  prendo: "preso dall'archivio: ora risulta a te.",
  consegno: "consegna registrata: aspettiamo la conferma di chi lo riceve.",
  ricevuto: "ricezione confermata: ora risulta a te.",
  "non-ricevuto": "segnalato: risulta ancora a chi lo stava consegnando.",
  annulla: "consegna annullata: risulta ancora a te.",
  archivio: "rimesso in archivio.",
};

function rotteFascicoli(db) {
  const router = express.Router();

  router.get("/fascicoli", richiediAccesso, (req, res) => {
    const q = String(req.query.n ?? "").trim().slice(0, 40);
    const numero = F.normalizzaNumero(q);
    const risultati = q ? F.cercaFascicoli(db, q) : [];
    // Per i risultati: tutti i passaggi e le scadenze collegate
    const movimenti = {}, collegate = {};
    for (const f of risultati) {
      movimenti[f.numero] = F.movimenti(db, f.numero);
      collegate[f.numero] = F.scadenzeCollegate(db, f.numero);
    }
    res.send(paginaFascicoli(req.utente, {
      q, numero, risultati, movimenti, collegate,
      esatto: risultati.some((f) => f.numero === numero),
      cliente: String(req.query.cliente ?? "").slice(0, 80),
      colleghi: utentiAttivi(db),
      daConfermare: F.daConfermare(db, req.utente.id),
      inMano: F.inManoA(db, req.utente.id),
      fuori: F.fuoriArchivio(db),
      fatto: String(req.query.fatto ?? "").slice(0, 200),
      errore: String(req.query.errore ?? "").slice(0, 200),
    }));
  });

  router.post("/fascicoli/azione", richiediAccesso, (req, res) => {
    const errore = F.muoviFascicolo(db, req.body ?? {}, req.utente);
    const numero = F.normalizzaNumero(req.body?.numero);
    const torna = new URL(percorsoLocale(req.body?.torna, "/fascicoli?n=" + encodeURIComponent(numero)), "http://x");
    if (errore) torna.searchParams.set("errore", errore);
    else if (torna.pathname === "/fascicoli") torna.searchParams.set("fatto", `Fascicolo ${numero}: ${FATTO[req.body?.azione] ?? "fatto."}`);
    if (req.get("X-Parziale") === "1") return res.status(errore ? 400 : 200).json({ errore: errore || "" });
    res.redirect(torna.pathname + torna.search);
  });

  return router;
}

module.exports = { rotteFascicoli };
