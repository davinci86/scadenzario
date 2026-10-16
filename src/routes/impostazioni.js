// ─────────────────────────────────────────────────────────────
// ROTTE DELLE IMPOSTAZIONI (solo Admin)
//   GET  /admin/impostazioni                    catalogo (?scheda=festivita | valori)
//   GET  /admin/impostazioni/atti/nuovo         modulo per un nuovo atto
//   POST /admin/impostazioni/atti               crea l'atto
//   GET  /admin/impostazioni/atti/:id           modulo di un atto
//   POST /admin/impostazioni/atti/:id           salva; se cambia la regola → "Modifica dei termini"
//   GET  /admin/impostazioni/atti/:id/cambio    la pagina con motivo, da quando, anteprima
//   POST /admin/impostazioni/atti/:id/cambio    applica (dopo un backup)
//   POST /admin/impostazioni/chiusure           aggiunge una chiusura
//   POST /admin/impostazioni/chiusure/togli     toglie una chiusura
//   POST /admin/impostazioni/valori             valori predefiniti
//   GET  /api/regola                            anteprima a parole mentre si compila un atto
// ─────────────────────────────────────────────────────────────
const express = require("express");
const C = require("../db/catalogo");
const { trovaAtto, aRegola, chiusure } = require("../db/atti");
const { regolaAParole, calcolaTermine, FESTE_FISSE, pasqua } = require("../dominio/termini");
const D = require("../dominio/date");
const { leggiImpostazioni, salvaImpostazioni } = require("../servizi/impostazioni");
const { faiBackup } = require("../servizi/backup");
const { richiediRuolo } = require("../auth/permessi");
const V = require("../views/impostazioni");

function rotteImpostazioni(db) {
  const router = express.Router();
  const soloAdmin = richiediRuolo("admin");
  const messaggi = (req) => ({ fatto: String(req.query.fatto ?? "").slice(0, 300), errore: String(req.query.errore ?? "").slice(0, 300) });
  const vai = (res, dove, chiave, testo) => res.redirect(`${dove}${dove.includes("?") ? "&" : "?"}${chiave}=${encodeURIComponent(testo)}`);

  // Un atto con il numero di scadenze aperte e lo storico (o null)
  const atto = (id) => C.elencoCatalogo(db).find((a) => a.id === Number(id)) ?? null;

  router.get("/admin/impostazioni", soloAdmin, (req, res) => {
    if (req.query.scheda === "festivita") {
      const anno = Number(D.oggi().slice(0, 4));
      const pasquetta = (a) => { const p = pasqua(a); p.setUTCDate(p.getUTCDate() + 1); return D.aTesto(p).split("-").reverse().join("/"); };
      const feste = [
        ...Object.entries(FESTE_FISSE).map(([mg, nome]) => [mg.split("-").reverse().join("/"), nome]),
        [pasquetta(anno), "Lunedì dell'Angelo"], [pasquetta(anno + 1), "Lunedì dell'Angelo"],
      ];
      return res.send(V.paginaFestivita(req.utente, { chiusure: C.elencoChiusure(db), inChiusura: C.scadenzeInChiusura(db), feste, ...messaggi(req) }));
    }
    if (req.query.scheda === "valori") return res.send(V.paginaValori(req.utente, { imp: leggiImpostazioni(db), ...messaggi(req) }));
    res.send(V.paginaCatalogo(req.utente, { atti: C.elencoCatalogo(db), ...messaggi(req) }));
  });

  // ── Atti ──
  router.get("/admin/impostazioni/atti/nuovo", soloAdmin, (req, res) => {
    res.send(V.paginaAtto(req.utente, null, { materie: C.materie(db) }));
  });
  router.post("/admin/impostazioni/atti", soloAdmin, (req, res) => {
    const { dati, errori } = C.controllaAtto(req.body);
    if (errori.length) return res.status(400).send(V.paginaAtto(req.utente, null, { valori: req.body, errori, materie: C.materie(db) }));
    C.creaAtto(db, dati, req.utente.id);
    vai(res, "/admin/impostazioni", "fatto", `Atto «${dati.nome}» creato: è già disponibile nell'inserimento delle scadenze.`);
  });

  router.get("/admin/impostazioni/atti/:id", soloAdmin, (req, res) => {
    const a = atto(req.params.id);
    if (!a) return vai(res, "/admin/impostazioni", "errore", "Atto non trovato.");
    res.send(V.paginaAtto(req.utente, a, { materie: C.materie(db) }));
  });
  router.post("/admin/impostazioni/atti/:id", soloAdmin, (req, res) => {
    const a = atto(req.params.id);
    if (!a) return vai(res, "/admin/impostazioni", "errore", "Atto non trovato.");
    const { dati, errori } = C.controllaAtto(req.body);
    if (errori.length) return res.status(400).send(V.paginaAtto(req.utente, a, { valori: req.body, errori, materie: C.materie(db) }));
    const cambi = C.aggiornaDatiAtto(db, a, dati, req.utente.id);
    if (C.regolaCambia(a, dati)) {
      // La regola cambia: prima di applicarla serve sapere perché e da quando
      const q = new URLSearchParams({ evento: dati.evento, direzione: dati.direzione, giorni: dati.giorni,
        sospensione_feriale: dati.sospensione_feriale, sposta_giorno_utile: dati.sposta_giorno_utile });
      return res.redirect(`/admin/impostazioni/atti/${a.id}/cambio?${q}`);
    }
    vai(res, "/admin/impostazioni", "fatto", cambi.length ? `Atto «${dati.nome}» aggiornato.` : "Nessuna modifica.");
  });

  // ── Modifica dei termini ──
  // La nuova regola arriva dai campi (nell'indirizzo o nel modulo): la controlliamo come un atto
  const nuovaRegola = (a, campi) => C.controllaAtto({
    nome: a.nome, materia: a.materia, tipo: a.tipo, promemoria: a.promemoria, attivo: "1",
    evento: campi.evento, direzione: campi.direzione, giorni: campi.giorni,
    feriale: String(campi.sospensione_feriale) === "1" ? "1" : "", proroga: String(campi.sposta_giorno_utile) === "1" ? "1" : "",
  });
  const paginaCambio = (req, a, nuovo, valori, errori) => V.paginaCambio(req.utente, a, nuovo, {
    prima: regolaAParole(aRegola(a)), dopo: regolaAParole(aRegola(nuovo)),
    interessate: C.scadenzeInteressate(db, a, aRegola(nuovo)), valori, errori,
  });

  router.get("/admin/impostazioni/atti/:id/cambio", soloAdmin, (req, res) => {
    const a = atto(req.params.id);
    if (!a) return vai(res, "/admin/impostazioni", "errore", "Atto non trovato.");
    const { dati, errori } = nuovaRegola(a, req.query);
    if (errori.length || !C.regolaCambia(a, dati)) return res.redirect(`/admin/impostazioni/atti/${a.id}`);
    res.send(paginaCambio(req, a, dati, {}, []));
  });

  router.post("/admin/impostazioni/atti/:id/cambio", soloAdmin, (req, res) => {
    const a = atto(req.params.id);
    if (!a) return vai(res, "/admin/impostazioni", "errore", "Atto non trovato.");
    const { dati, errori: erroriRegola } = nuovaRegola(a, req.body ?? {});
    if (erroriRegola.length) return vai(res, `/admin/impostazioni/atti/${a.id}`, "errore", erroriRegola.join(" "));
    if (!C.regolaCambia(a, dati)) return vai(res, "/admin/impostazioni", "fatto", "La regola è già questa: nessuna modifica.");
    const { scelta, errori } = C.controllaCambio(req.body);
    if (errori.length) return res.status(400).send(paginaCambio(req, a, dati, req.body, errori));
    // Prima di toccare le scadenze: un backup. Se non riesce, non si procede.
    try {
      faiBackup(db, { tipo: "prima-di-modifica", autore: req.utente.id });
    } catch (errore) {
      return res.status(500).send(paginaCambio(req, a, dati, req.body, [`Il backup di sicurezza non è riuscito (${errore.message}): la modifica non è stata applicata.`]));
    }
    const n = C.applicaCambio(db, a, dati, scelta, req.utente.id);
    vai(res, "/admin/impostazioni", "fatto", `Termini di «${a.nome}» aggiornati: ${n} ${n === 1 ? "scadenza ricalcolata" : "scadenze ricalcolate"}. Prima è stato fatto un backup.`);
  });

  // Anteprima a parole della regola mentre si compila il modulo di un atto
  router.get("/api/regola", soloAdmin, (req, res) => {
    const { dati, errori } = C.controllaAtto({ ...req.query, nome: "anteprima", materia: "x", tipo: "scadenza", attivo: "1", promemoria: "" });
    if (errori.length) return res.json({ testo: "", esempio: "Indica i giorni per vedere un esempio." });
    const regola = aRegola(dati);
    const evento = regola.direzione === "ritroso" ? D.aggiungiGiorni(D.oggi(), 40) : D.oggi();
    const r = calcolaTermine(evento, regola, chiusure(db));
    res.json({
      testo: regolaAParole(regola),
      esempio: `Esempio: con decorrenza ${D.formatta(evento)}, il termine cade ${D.formatta(r.data)}` +
        (r.spostamenti.length ? ` (spostato: il ${D.formatta(r.spostamenti[0].data)} era ${r.spostamenti[0].motivo})` : "") +
        (r.giorniAgostoSaltati ? `, esclusi ${r.giorniAgostoSaltati} giorni di agosto` : "") + ".",
    });
  });

  // ── Chiusure e valori predefiniti ──
  router.post("/admin/impostazioni/chiusure", soloAdmin, (req, res) => {
    const errore = C.aggiungiChiusura(db, String(req.body?.data ?? ""), req.body?.motivo, req.utente.id);
    vai(res, "/admin/impostazioni?scheda=festivita", errore ? "errore" : "fatto", errore || "Chiusura aggiunta.");
  });
  router.post("/admin/impostazioni/chiusure/togli", soloAdmin, (req, res) => {
    C.togliChiusura(db, req.body?.data, req.utente.id);
    vai(res, "/admin/impostazioni?scheda=festivita", "fatto", "Chiusura tolta.");
  });
  router.post("/admin/impostazioni/valori", soloAdmin, (req, res) => {
    const errore = salvaImpostazioni(db, req.body ?? {}, req.utente.id);
    vai(res, "/admin/impostazioni?scheda=valori", errore ? "errore" : "fatto", errore || "Valori salvati.");
  });

  return router;
}

module.exports = { rotteImpostazioni };
