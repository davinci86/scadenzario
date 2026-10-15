// ─────────────────────────────────────────────────────────────
// SESSIONI
// Dopo il login il browser riceve un "cookie": un biglietto con un
// codice casuale lunghissimo. A ogni pagina il browser lo ripresenta
// e noi sappiamo chi è. Nel database salviamo solo l'impronta del
// codice, come per le password.
// Se una persona resta inattiva troppo a lungo, il biglietto scade.
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

// Restituisce l'utente collegato, oppure null se il biglietto
// non è valido, è scaduto o l'utente è stato disattivato.
function leggiSessione(db, token) {
  if (!token) return null;
  const riga = db
    .prepare(
      `SELECT s.token_hash, s.ultima_attivita,
              u.id, u.nome_utente, u.nome, u.titolo, u.ruolo, u.attivo
         FROM sessioni s JOIN utenti u ON u.id = s.utente_id
        WHERE s.token_hash = ?`
    )
    .get(impronta(token));
  if (!riga) return null;

  const inattivo = Date.now() - riga.ultima_attivita > config.minutiInattivita * 60_000;
  if (inattivo || !riga.attivo) {
    chiudiSessione(db, token);
    return null;
  }

  // Ogni pagina aperta "rinnova" la sessione.
  db.prepare("UPDATE sessioni SET ultima_attivita = ? WHERE token_hash = ?").run(
    Date.now(),
    riga.token_hash
  );
  return {
    id: riga.id,
    nomeUtente: riga.nome_utente,
    nome: riga.nome,
    titolo: riga.titolo,
    ruolo: riga.ruolo,
  };
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
  creaSessione,
  leggiSessione,
  chiudiSessione,
  leggiCookie,
  impostaCookie,
  cancellaCookie,
};
