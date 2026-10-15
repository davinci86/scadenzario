// ─────────────────────────────────────────────────────────────
// ROTTE DI ACCESSO
// Una "rotta" collega un indirizzo a una funzione:
//   GET  /login   → mostra la pagina di accesso
//   POST /login   → controlla nome utente e password
//   POST /logout  → chiude la sessione
// GET = "dammi una pagina", POST = "ti mando dei dati".
// ─────────────────────────────────────────────────────────────
const express = require("express");
const config = require("../config");
const { verificaPassword, HASH_FINTO } = require("../auth/password");
const { creaSessione, chiudiSessione, leggiCookie, impostaCookie, cancellaCookie } = require("../auth/sessioni");
const { registra } = require("../db/registro");
const { paginaLogin } = require("../views/login");

function rotteAccesso(db) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    if (req.utente) return res.redirect("/");
    res.send(paginaLogin({ scaduta: req.query.scaduta === "1" }));
  });

  router.post("/login", (req, res) => {
    const nomeUtente = String(req.body?.nome_utente || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const ora = Date.now();

    // Rimostra il login con un messaggio (e il codice di stato HTTP giusto).
    const rifiuta = (errore, stato = 401) =>
      res.status(stato).send(paginaLogin({ errore, nomeUtente }));

    if (!nomeUtente || !password) return rifiuta("Inserisci nome utente e password.", 400);

    const utente = db.prepare("SELECT * FROM utenti WHERE nome_utente = ?").get(nomeUtente);

    // 1. Utente bloccato per troppi tentativi?
    if (utente?.bloccato_fino > ora) {
      const minuti = Math.ceil((utente.bloccato_fino - ora) / 60_000);
      return rifiuta(`Troppi tentativi sbagliati. Riprova tra ${minuti} minuti.`, 429);
    }

    // 2. Password giusta? (Se l'utente non esiste facciamo comunque il calcolo.)
    const passwordOk = verificaPassword(password, utente ? utente.password_hash : HASH_FINTO);
    if (!utente || !passwordOk) {
      if (utente) {
        const tentativi = utente.tentativi_falliti + 1;
        const blocca = tentativi >= config.tentativiMassimi;
        db.prepare("UPDATE utenti SET tentativi_falliti = ?, bloccato_fino = ? WHERE id = ?").run(
          blocca ? 0 : tentativi,
          blocca ? ora + config.minutiBlocco * 60_000 : null,
          utente.id
        );
        registra(db, utente.id, "Accesso fallito",
          blocca ? `Utente bloccato per ${config.minutiBlocco} minuti` : "Password errata");
      }
      // Stesso messaggio in entrambi i casi: non diciamo se il nome utente esiste.
      return rifiuta("Nome utente o password non corretti.");
    }

    // 3. Utente disattivato?
    if (!utente.attivo) {
      return rifiuta("Questo utente è stato disattivato. Rivolgiti all'amministratore.", 403);
    }

    // Tutto ok: azzeriamo i tentativi, creiamo la sessione, e via alla dashboard.
    db.prepare("UPDATE utenti SET tentativi_falliti = 0, bloccato_fino = NULL WHERE id = ?").run(utente.id);
    impostaCookie(res, creaSessione(db, utente.id));
    registra(db, utente.id, "Accesso");
    res.redirect("/");
  });

  router.post("/logout", (req, res) => {
    if (req.utente) registra(db, req.utente.id, "Uscita");
    chiudiSessione(db, leggiCookie(req));
    cancellaCookie(res);
    res.redirect("/login");
  });

  return router;
}

module.exports = { rotteAccesso };
