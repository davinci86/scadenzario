// ─────────────────────────────────────────────────────────────
// UTENTI DI PROVA
// Persone inventate, le stesse del mockup. Si creano solo se il
// database è vuoto e solo in sviluppo: sul server dello studio
// gli utenti veri li crea l'Admin.
// ─────────────────────────────────────────────────────────────
const { creaHash } = require("../auth/password");

const UTENTI_DI_PROVA = [
  { nomeUtente: "a.ferrara", nome: "Anna Ferrara", titolo: "Segreteria", ruolo: "admin" },
  { nomeUtente: "p.russo", nome: "Avv. Paolo Russo", titolo: "Avvocato", ruolo: "editor" },
  { nomeUtente: "m.deluca", nome: "Avv. Marco De Luca", titolo: "Titolare", ruolo: "collab" },
  { nomeUtente: "g.esposito", nome: "Avv. Giulia Esposito", titolo: "Avvocato", ruolo: "collab" },
  { nomeUtente: "l.romano", nome: "Dott. Luca Romano", titolo: "Praticante", ruolo: "collab" },
];

function inserisciUtentiDiProva(db, password = "demo") {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM utenti").get();
  if (n > 0) return false; // il database ha già degli utenti: non tocchiamo nulla

  const inserisci = db.prepare(
    "INSERT INTO utenti (nome_utente, nome, titolo, ruolo, password_hash) VALUES (?, ?, ?, ?, ?)"
  );
  for (const u of UTENTI_DI_PROVA) {
    inserisci.run(u.nomeUtente, u.nome, u.titolo, u.ruolo, creaHash(password));
  }
  return true;
}

module.exports = { inserisciUtentiDiProva, UTENTI_DI_PROVA };
