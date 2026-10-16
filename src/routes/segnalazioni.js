// ─────────────────────────────────────────────────────────────
// ROTTE DELLE SEGNALAZIONI
//   GET  /segnalazioni                ricevute (?vista=inviate per le inviate)
//   GET  /segnalazioni/nuova          il modulo (?a=… &fascicolo=… &scadenza=… &risposta=…)
//   POST /segnalazioni                invia
//   POST /segnalazioni/:id/letta      "Letto" (solo chi l'ha ricevuta)
// ─────────────────────────────────────────────────────────────
const express = require("express");
const S = require("../db/segnalazioni");
const { utentiAttivi, elencoScadenze } = require("../db/scadenze");
const { richiediAccesso } = require("../auth/permessi");
const { paginaSegnalazioni, paginaNuovaSegnalazione, moduloSegnalazione } = require("../views/segnalazioni");

// La finestra sovrapposta chiede solo il modulo (intestazione X-Parziale: 1)
const parziale = (req) => req.get("X-Parziale") === "1";

// Solo indirizzi del nostro sito (mai "//altrosito")
const percorsoLocale = (p, riserva) => (typeof p === "string" && /^\/(?!\/)/.test(p) ? p : riserva);

function rotteSegnalazioni(db) {
  const router = express.Router();

  router.get("/segnalazioni", richiediAccesso, (req, res) => {
    res.send(paginaSegnalazioni(req.utente, {
      vista: req.query.vista === "inviate" ? "inviate" : "ricevute",
      ricevute: S.ricevute(db, req.utente.id),
      inviate: S.inviate(db, req.utente.id),
      fatto: String(req.query.fatto ?? "").slice(0, 200),
    }));
  });

  const modulo = (req, valori, errori = [], risposta = null) => {
    const dati = {
      colleghi: utentiAttivi(db).filter((u) => u.id !== req.utente.id),
      scadenze: elencoScadenze(db, {}).sort((a, b) => a.id - b.id),
      valori, errori, risposta, inFinestra: parziale(req),
    };
    return parziale(req) ? moduloSegnalazione(dati) : paginaNuovaSegnalazione(req.utente, dati);
  };

  router.get("/segnalazioni/nuova", richiediAccesso, (req, res) => {
    const q = req.query;
    const risposta = q.risposta ? S.trovaSegnalazione(db, q.risposta, req.utente.id) : null;
    const valori = risposta
      ? { a: [risposta.da_id === req.utente.id ? "" : risposta.da_id], oggetto: `Re: ${risposta.oggetto}`.slice(0, 120),
          scadenza: risposta.scadenza_id ?? "", fascicolo: risposta.fascicolo }
      : { a: q.a ? [q.a] : [], scadenza: q.scadenza ?? "", fascicolo: q.fascicolo ?? "",
          oggetto: q.fascicolo ? `Mi serve il fascicolo ${String(q.fascicolo).slice(0, 40)}` : "" };
    res.send(modulo(req, valori, [], risposta));
  });

  router.post("/segnalazioni", richiediAccesso, (req, res) => {
    const { dati, errori } = S.controllaSegnalazione(db, req.body, req.utente);
    if (errori.length) {
      const risposta = dati.rispostaA ? S.trovaSegnalazione(db, dati.rispostaA, req.utente.id) : null;
      return res.status(400).send(modulo(req, req.body, errori, risposta));
    }
    S.inviaSegnalazione(db, dati, req.utente);
    if (parziale(req)) return res.json({ ok: true, messaggio: "Segnalazione inviata." });
    res.redirect("/segnalazioni?vista=inviate&fatto=" + encodeURIComponent("Segnalazione inviata."));
  });

  router.post("/segnalazioni/:id/letta", richiediAccesso, (req, res) => {
    S.segnaSegnalazioneLetta(db, req.params.id, req.utente);
    if (req.get("X-Parziale") === "1") return res.json({ ok: true });
    res.redirect(percorsoLocale(req.body?.torna, "/segnalazioni"));
  });

  return router;
}

module.exports = { rotteSegnalazioni, percorsoLocale };
