// ─────────────────────────────────────────────────────────────
// PERMESSI
// Queste funzioni sono "middleware": Express le esegue PRIMA della
// pagina vera e propria. Funzionano come un portiere: controllano
// chi sei e decidono se farti passare.
// ─────────────────────────────────────────────────────────────
const { leggiSessione, leggiCookie } = require("./sessioni");
const { paginaErrore } = require("../views/errore");

// Per ogni richiesta: chi è collegato? Lo mettiamo in req.utente.
function caricaUtente(db) {
  return (req, res, next) => {
    req.utente = leggiSessione(db, leggiCookie(req));
    next();
  };
}

// Pagine per chiunque abbia fatto l'accesso.
function richiediAccesso(req, res, next) {
  if (req.utente) return next();
  // Se aveva un cookie ma non vale più, la sessione è scaduta.
  const scaduta = leggiCookie(req) ? "?scaduta=1" : "";
  res.redirect("/login" + scaduta);
}

// Pagine solo per alcuni ruoli, es. richiediRuolo("admin").
function richiediRuolo(...ruoli) {
  return (req, res, next) => {
    if (!req.utente) return richiediAccesso(req, res, next);
    if (ruoli.includes(req.utente.ruolo)) return next();
    res
      .status(403)
      .send(
        paginaErrore(req.utente, "Accesso non consentito", "Questa pagina è riservata ad altri ruoli.")
      );
  };
}

module.exports = { caricaUtente, richiediAccesso, richiediRuolo };
