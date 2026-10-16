// ─────────────────────────────────────────────────────────────
// PERMESSI
// Queste funzioni sono "middleware": Express le esegue PRIMA della
// pagina vera e propria. Funzionano come un portiere: controllano
// chi sei e decidono se farti passare.
// ─────────────────────────────────────────────────────────────
const { leggiSessione, leggiCookie } = require("./sessioni");
const { registraAttivita } = require("../db/presenze");
const { paginaErrore } = require("../views/errore");
const { paginaBloccata } = require("../views/blocco");

// Le richieste fatte dal programma da solo (il controllo delle notifiche)
// arrivano con l'intestazione "X-Automatico": non contano come attività.
const automatica = (req) => req.get("X-Automatico") === "1";
const vuoleJson = (req) => automatica(req) || req.get("X-Parziale") === "1";

// Per ogni richiesta: chi è collegato? Lo mettiamo in req.utente.
function caricaUtente(db) {
  return (req, res, next) => {
    req.utente = leggiSessione(db, leggiCookie(req), { automatica: automatica(req) });
    // Una pagina aperta dalla persona aggiorna "l'ultima attività" del giorno
    if (req.utente && !req.utente.bloccata && !automatica(req)) registraAttivita(db, req.utente.id);
    next();
  };
}

// Se lo schermo è bloccato, si passa solo per sbloccare o per uscire.
function fermaSeBloccata(req, res) {
  if (!req.utente?.bloccata) return false;
  if (vuoleJson(req)) res.status(423).json({ bloccata: true });
  else res.status(423).send(paginaBloccata(req.utente, req.originalUrl));
  return true;
}

// Pagine per chiunque abbia fatto l'accesso.
function richiediAccesso(req, res, next) {
  if (!req.utente) {
    if (vuoleJson(req)) return res.status(401).json({ uscito: true });
    // Se aveva un cookie ma non vale più, la sessione è finita.
    return res.redirect("/login" + (leggiCookie(req) ? "?scaduta=1" : ""));
  }
  if (fermaSeBloccata(req, res)) return;
  // Password provvisoria (data dall'Admin): prima di tutto se ne sceglie una propria
  if (req.utente.cambiaPassword && req.path !== "/profilo/password") {
    if (vuoleJson(req)) return res.status(403).json({ cambiaPassword: true });
    return res.redirect("/profilo/password");
  }
  next();
}

// Pagine solo per alcuni ruoli, es. richiediRuolo("admin").
function richiediRuolo(...ruoli) {
  return (req, res, next) =>
    richiediAccesso(req, res, () => {
      if (ruoli.includes(req.utente.ruolo)) return next();
      res.status(403).send(paginaErrore(req.utente, "Accesso non consentito", "Questa pagina è riservata ad altri ruoli."));
    });
}

module.exports = { caricaUtente, richiediAccesso, richiediRuolo, automatica };
