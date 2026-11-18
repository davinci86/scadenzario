// ─────────────────────────────────────────────────────────────
// ROTTE DELLA GUIDA
//   GET  /guida                    indice e ricerca (?q=…)
//   GET  /guida/:slug              una pagina del manuale (se il ruolo può leggerla)
//   GET  /guida/studio/:id         una procedura dello studio
//   GET  /guida/studio/nuova       (Admin) nuova procedura
//   POST /guida/studio             (Admin) crea
//   GET  /guida/studio/:id/modifica, POST /guida/studio/:id, POST /guida/studio/:id/elimina   (Admin)
//   POST /tutorial/visto           il tutorial è stato completato o saltato
// ─────────────────────────────────────────────────────────────
const express = require("express");
const G = require("../servizi/guida");
const { richiediAccesso, richiediRuolo } = require("../auth/permessi");
const V = require("../views/guida");
const { paginaErrore } = require("../views/errore");

function rotteGuida(db) {
  const router = express.Router();
  const soloAdmin = richiediRuolo("admin");
  const nonTrovata = (req, res) => res.status(404).send(paginaErrore(req.utente, "Pagina non trovata", "Questa pagina della guida non esiste."));

  // L'elenco a lato di ogni pagina
  const altre = (utente, attuale) => [
    ...G.paginePerUtente(utente).map((p) => ({ titolo: p.titolo, link: `/guida/${p.slug}`, attuale: attuale === `/guida/${p.slug}` })),
    ...G.procedure(db).map((p) => ({ titolo: `★ ${p.titolo}`, link: `/guida/studio/${p.id}`, attuale: attuale === `/guida/studio/${p.id}` })),
  ];

  router.get("/guida", richiediAccesso, (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 80);
    res.send(V.paginaIndice(req.utente, { manuale: G.paginePerUtente(req.utente), procedure: G.procedure(db), q, risultati: q ? G.cerca(db, req.utente, q) : [] }));
  });

  // ── Procedure dello studio ──
  router.get("/guida/studio/nuova", soloAdmin, (req, res) => res.send(V.paginaModifica(req.utente, null)));
  router.post("/guida/studio", soloAdmin, (req, res) => {
    const { dati, errori } = G.controllaProcedura(req.body);
    if (errori.length) return res.status(400).send(V.paginaModifica(req.utente, null, { valori: req.body, errori }));
    res.redirect(`/guida/studio/${G.salvaProcedura(db, null, dati, req.utente.id)}`);
  });
  router.get("/guida/studio/:id", richiediAccesso, (req, res) => {
    const p = G.trovaProcedura(db, req.params.id);
    if (!p) return nonTrovata(req, res);
    res.send(V.paginaLettura(req.utente, { titolo: p.titolo, testo: p.testo, studio: p, altre: altre(req.utente, `/guida/studio/${p.id}`) }));
  });
  router.get("/guida/studio/:id/modifica", soloAdmin, (req, res) => {
    const p = G.trovaProcedura(db, req.params.id);
    if (!p) return nonTrovata(req, res);
    res.send(V.paginaModifica(req.utente, p));
  });
  router.post("/guida/studio/:id", soloAdmin, (req, res) => {
    const p = G.trovaProcedura(db, req.params.id);
    if (!p) return nonTrovata(req, res);
    const { dati, errori } = G.controllaProcedura(req.body);
    if (errori.length) return res.status(400).send(V.paginaModifica(req.utente, p, { valori: req.body, errori }));
    G.salvaProcedura(db, p.id, dati, req.utente.id);
    res.redirect(`/guida/studio/${p.id}`);
  });
  router.post("/guida/studio/:id/elimina", soloAdmin, (req, res) => {
    if (req.body?.conferma === "1") G.eliminaProcedura(db, req.params.id, req.utente.id);
    res.redirect("/guida");
  });

  // ── Una pagina del manuale ──
  router.get("/guida/:slug", richiediAccesso, (req, res) => {
    const p = G.paginaManuale(req.params.slug, req.utente);
    if (!p) return nonTrovata(req, res);
    res.send(V.paginaLettura(req.utente, { titolo: p.titolo, testo: p.testo, altre: altre(req.utente, `/guida/${p.slug}`) }));
  });

  // ── Tutorial completato o saltato ──
  router.post("/tutorial/visto", richiediAccesso, (req, res) => {
    db.prepare("UPDATE utenti SET tutorial_visto = 1 WHERE id = ?").run(req.utente.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { rotteGuida };
