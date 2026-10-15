// ─────────────────────────────────────────────────────────────
// SESSIONI
// Dopo il login il browser riceve un "cookie": un biglietto con un
// codice casuale lunghissimo. A ogni pagina il browser lo ripresenta
// e noi sappiamo chi è. Nel database salviamo solo l'impronta del
// codice, come per le password.
//
// Dalla Tappa 3 la sessione NON scade per inattività: lo schermo si
// BLOCCA (serve la password per continuare). La sessione finisce:
//   • con "Esci";
//   • comunque la notte (config.oraFineSessione), come rete di sicurezza;
//   • dopo 5 tentativi di sblocco sbagliati.
// ─────────────────────────────────────────────────────────────
const crypto = require("node:crypto");
const config = require("../config");

const NOME_COOKIE = "sessione";
const impronta = (token) => crypto.createHash("sha256").update(token).digest("hex");

function creaSessione(db, utenteId) {
  const token = crypto.randomBytes(32).toString("hex");
  const ora = Date.now();
  db.prepare(
    "INSERT INTO sessioni (token_hash, utente_id, creata, ultima_attivita) VALUES (?, ?, ?, ?)"
  ).run(impronta(token), utenteId, ora, ora);
  return token;
}

// Il momento in cui una sessione nata a "creata" deve finire:
// la prossima volta che l'orologio segna l'ora di fine (es. le 2:00).
function fineNotte(creata) {
  const fine = new Date(creata);
  fine.setHours(config.oraFineSessione, 0, 0, 0);
  if (fine.getTime() <= creata) fine.setDate(fine.getDate() + 1);
  return fine.getTime();
}

// Restituisce l'utente collegato, oppure null.
// "automatica" = richiesta fatta dal programma da solo (es. il controllo
// delle notifiche ogni 30 secondi): non conta come attività della persona.
function leggiSessione(db, token, { automatica = false } = {}) {
  if (!token) return null;
  const riga = db
    .prepare(
      `SELECT s.token_hash, s.creata, s.ultima_attivita, s.bloccata,
              u.id, u.nome_utente, u.nome, u.titolo, u.ruolo, u.attivo, u.tema,
              u.minuti_blocco, u.email, u.titolare
         FROM sessioni s JOIN utenti u ON u.id = s.utente_id
        WHERE s.token_hash = ?`
    )
    .get(impronta(token));
  if (!riga) return null;

  const ora = Date.now();
  if (!riga.attivo || ora >= fineNotte(riga.creata)) {
    chiudiSessione(db, token);
    return null;
  }

  // Troppo tempo senza attività? La sessione si blocca (anche se il
  // browser era chiuso o il programma nel browser non ha fatto in tempo).
  let bloccata = !!riga.bloccata;
  if (!bloccata && ora - riga.ultima_attivita > riga.minuti_blocco * 60_000) {
    bloccaSessione(db, token);
    bloccata = true;
  }

  // Ogni pagina aperta dalla persona "rinnova" l'attività.
  if (!bloccata && !automatica) {
    db.prepare("UPDATE sessioni SET ultima_attivita = ? WHERE token_hash = ?").run(ora, riga.token_hash);
  }

  return {
    id: riga.id,
    nomeUtente: riga.nome_utente,
    nome: riga.nome,
    titolo: riga.titolo,
    ruolo: riga.ruolo,
    tema: riga.tema === "scuro" ? "scuro" : "chiaro",
    minutiBlocco: riga.minuti_blocco,
    email: riga.email,
    titolare: !!riga.titolare,
    bloccata,
  };
}

function bloccaSessione(db, token) {
  if (token) db.prepare("UPDATE sessioni SET bloccata = 1 WHERE token_hash = ?").run(impronta(token));
}

function sbloccaSessione(db, token) {
  db.prepare("UPDATE sessioni SET bloccata = 0, tentativi_sblocco = 0, ultima_attivita = ? WHERE token_hash = ?")
    .run(Date.now(), impronta(token));
}

// Un tentativo di sblocco sbagliato: restituisce quanti ne sono stati fatti.
function sbloccoFallito(db, token) {
  db.prepare("UPDATE sessioni SET tentativi_sblocco = tentativi_sblocco + 1 WHERE token_hash = ?").run(impronta(token));
  return db.prepare("SELECT tentativi_sblocco AS n FROM sessioni WHERE token_hash = ?").get(impronta(token))?.n ?? 0;
}

function chiudiSessione(db, token) {
  if (token) db.prepare("DELETE FROM sessioni WHERE token_hash = ?").run(impronta(token));
}

// ── Cookie: lettura e scrittura ──
function leggiCookie(req, nome = NOME_COOKIE) {
  for (const parte of (req.headers.cookie || "").split(";")) {
    const [chiave, ...valore] = parte.trim().split("=");
    if (chiave === nome) return decodeURIComponent(valore.join("="));
  }
  return null;
}

// HttpOnly: il cookie non è leggibile da codice JavaScript nella pagina.
// SameSite=Strict: il browser non lo manda se la richiesta parte da un
// altro sito (protegge da pagine malevole che provano ad agire per te).
function impostaCookie(res, token) {
  res.setHeader("Set-Cookie", `${NOME_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`);
}
function cancellaCookie(res) {
  res.setHeader("Set-Cookie", `${NOME_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

module.exports = {
  creaSessione, leggiSessione, chiudiSessione, bloccaSessione, sbloccaSessione, sbloccoFallito,
  leggiCookie, impostaCookie, cancellaCookie, fineNotte,
};
