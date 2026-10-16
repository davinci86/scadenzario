// ─────────────────────────────────────────────────────────────
// ROTTE DEI BACKUP (solo Admin)
//   GET  /admin/backup                   la pagina (?tipo=… per filtrare)
//   POST /admin/backup                   "Fai un backup adesso"
//   POST /admin/backup/durata            per quanto tenerli
//   GET  /admin/backup/ripristina?nome=  la conferma
//   POST /admin/backup/ripristina        il ripristino
// ─────────────────────────────────────────────────────────────
const express = require("express");
const config = require("../config");
const B = require("../servizi/backup");
const { richiediRuolo } = require("../auth/permessi");
const { leggiCookie, impronta } = require("../auth/sessioni");
const { paginaBackup, paginaRipristino } = require("../views/backup");

function rotteBackup(db) {
  const router = express.Router();
  const soloAdmin = richiediRuolo("admin");
  const torna = (res, chiave, testo) => res.redirect(`/admin/backup?${chiave}=${encodeURIComponent(testo)}`);

  router.get("/admin/backup", soloAdmin, (req, res) => {
    const filtro = ["giornaliero", "mensile", "auto", "altri"].includes(req.query.tipo) ? req.query.tipo : "";
    res.send(paginaBackup(req.utente, {
      elenco: B.elencoBackup(), stato: B.stato, durata: B.giorniDaTenere(db), spazio: B.spazioOccupato(),
      cartella: config.backup.cartella, cartellaNas: config.backup.cartellaNas, filtro,
      fatto: String(req.query.fatto ?? "").slice(0, 300), errore: String(req.query.errore ?? "").slice(0, 300),
    }));
  });

  router.post("/admin/backup", soloAdmin, (req, res) => {
    try {
      const b = B.faiBackup(db, { tipo: "manuale", autore: req.utente.id });
      torna(res, "fatto", `Backup fatto e controllato: ${b.nome}`);
    } catch (errore) {
      torna(res, "errore", `Il backup non è riuscito: ${errore.message}`);
    }
  });

  router.post("/admin/backup/durata", soloAdmin, (req, res) => {
    const errore = B.salvaGiorniDaTenere(db, req.body ?? {}, req.utente.id);
    errore ? torna(res, "errore", errore) : torna(res, "fatto", "Durata dei backup salvata.");
  });

  router.get("/admin/backup/ripristina", soloAdmin, (req, res) => {
    const b = B.elencoBackup().find((x) => x.nome === req.query.nome);
    if (!b) return torna(res, "errore", "Backup non trovato.");
    let nelBackup = null;
    try { nelBackup = B.conteggiDelBackup(b.nome); } catch { /* lo si vedrà al ripristino */ }
    res.send(paginaRipristino(req.utente, b, B.conteggi(db), nelBackup));
  });

  router.post("/admin/backup/ripristina", soloAdmin, (req, res) => {
    if (req.body?.conferma !== "1") return torna(res, "errore", "Per ripristinare devi spuntare la conferma.");
    const esito = B.ripristina(db, req.body?.nome, { admin: req.utente, sessioneAdmin: impronta(leggiCookie(req)) });
    if (typeof esito === "string") return torna(res, "errore", esito);
    torna(res, "fatto", `Ripristino fatto. La copia di com'era prima è «${esito.prima.nome}»: se serve, puoi ripristinare quella.`);
  });

  return router;
}

module.exports = { rotteBackup };
