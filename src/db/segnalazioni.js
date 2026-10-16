// ─────────────────────────────────────────────────────────────
// SEGNALAZIONI
// Un messaggio per attirare l'attenzione di uno o più colleghi su
// qualcosa. Non è una chat: oggetto, testo, priorità, e chi deve leggerla.
// Resta "da leggere" finché ognuno non preme "Letto": chi l'ha inviata
// vede chi l'ha letta e quando (conferma di lettura).
//
// Riservatezza: il Registro annota "inviata a…" e "letta", MAI il testo.
// La vedono solo chi l'ha scritta e i destinatari.
// ─────────────────────────────────────────────────────────────
const { inTransazione } = require("./scadenze");
const { notifica, segnaLetteConChiave } = require("./notifiche");
const { registra } = require("./registro");
const { normalizzaNumero } = require("./fascicoli");

const PRIORITA = ["normale", "importante"];
const chiaveNotifica = (id) => `seg@${id}`;

// Controlla il modulo. Restituisce { dati, errori }.
function controllaSegnalazione(db, corpo, mittente) {
  const destinatari = [...new Set([].concat(corpo?.a ?? []).map(Number))]
    .filter((id) => id && id !== mittente.id);
  const attivi = new Set(db.prepare("SELECT id FROM utenti WHERE attivo = 1").all().map((u) => u.id));
  const dati = {
    a: destinatari.filter((id) => attivi.has(id)),
    oggetto: String(corpo?.oggetto ?? "").trim().slice(0, 120),
    testo: String(corpo?.testo ?? "").trim().slice(0, 2000),
    priorita: PRIORITA.includes(corpo?.priorita) ? corpo.priorita : "normale",
    scadenzaId: Number(corpo?.scadenza) || null,
    fascicolo: normalizzaNumero(corpo?.fascicolo),
    rispostaA: Number(corpo?.risposta_a) || null,
  };
  const manca = [];
  if (!dati.a.length) manca.push("almeno un destinatario");
  if (!dati.oggetto) manca.push("l'oggetto");
  if (!dati.testo) manca.push("il messaggio");
  const errori = manca.length ? [`Manca ${manca.join(", ")}.`] : [];
  if (dati.scadenzaId && !db.prepare("SELECT id FROM scadenze WHERE id = ?").get(dati.scadenzaId)) dati.scadenzaId = null;
  // Si può rispondere solo a una segnalazione che si è scritta o ricevuta
  if (dati.rispostaA && !puoVedere(db, dati.rispostaA, mittente.id)) dati.rispostaA = null;
  return { dati, errori };
}

function inviaSegnalazione(db, dati, mittente) {
  return inTransazione(db, () => {
    const id = Number(db.prepare(
      `INSERT INTO segnalazioni (da_id, oggetto, testo, priorita, scadenza_id, fascicolo, risposta_a, creata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(mittente.id, dati.oggetto, dati.testo, dati.priorita, dati.scadenzaId, dati.fascicolo, dati.rispostaA, Date.now()).lastInsertRowid);
    const aggiungi = db.prepare("INSERT INTO segnalazioni_a (segnalazione_id, utente_id) VALUES (?, ?)");
    for (const uid of dati.a) aggiungi.run(id, uid);

    notifica(db, {
      utenti: dati.a, autore: mittente.id, tipo: "segnalazione", chiave: chiaveNotifica(id),
      scadenzaId: dati.scadenzaId, link: "/segnalazioni",
      testo: `${dati.priorita === "importante" ? "Segnalazione importante" : "Segnalazione"} da ${mittente.nome}: ${dati.oggetto}`,
    });
    const nomi = db.prepare(`SELECT nome FROM utenti WHERE id IN (${dati.a.map(() => "?").join(",")})`).all(...dati.a).map((u) => u.nome);
    registra(db, mittente.id, "Segnalazione", `Inviata a ${nomi.join(", ")}${dati.priorita === "importante" ? " · importante" : ""}`);
    return id;
  });
}

// "Letto": solo un destinatario, una volta sola
function segnaSegnalazioneLetta(db, id, utente) {
  const riga = db.prepare(
    `SELECT a.letta, s.creata, u.nome AS mittente FROM segnalazioni_a a
       JOIN segnalazioni s ON s.id = a.segnalazione_id JOIN utenti u ON u.id = s.da_id
      WHERE a.segnalazione_id = ? AND a.utente_id = ?`
  ).get(Number(id), utente.id);
  if (!riga || riga.letta) return;
  db.prepare("UPDATE segnalazioni_a SET letta = ? WHERE segnalazione_id = ? AND utente_id = ?").run(Date.now(), Number(id), utente.id);
  segnaLetteConChiave(db, chiaveNotifica(id), utente.id);
  registra(db, utente.id, "Segnalazione", `Letta la segnalazione di ${riga.mittente}`);
}

function puoVedere(db, id, utenteId) {
  return !!db.prepare(
    `SELECT 1 FROM segnalazioni s WHERE s.id = ? AND (s.da_id = ?
       OR EXISTS (SELECT 1 FROM segnalazioni_a a WHERE a.segnalazione_id = s.id AND a.utente_id = ?))`
  ).get(Number(id), utenteId, utenteId);
}

const CAMPI = `s.id, s.oggetto, s.testo, s.priorita, s.scadenza_id, s.fascicolo, s.risposta_a, s.creata,
  s.da_id, d.nome AS da_nome, sc.cliente AS scadenza_cliente, r.oggetto AS risposta_oggetto`;
const UNIONI = `JOIN utenti d ON d.id = s.da_id
  LEFT JOIN scadenze sc ON sc.id = s.scadenza_id
  LEFT JOIN segnalazioni r ON r.id = s.risposta_a`;

// Quelle ricevute: prima le da leggere, poi le importanti, poi le più recenti
function ricevute(db, utenteId, { soloDaLeggere = false, limite = 100 } = {}) {
  return db.prepare(
    `SELECT ${CAMPI}, a.letta FROM segnalazioni s JOIN segnalazioni_a a ON a.segnalazione_id = s.id ${UNIONI}
      WHERE a.utente_id = ? ${soloDaLeggere ? "AND a.letta IS NULL" : ""}
      ORDER BY a.letta IS NOT NULL, s.priorita = 'importante' DESC, s.creata DESC LIMIT ?`
  ).all(utenteId, limite);
}

// Quelle inviate, con chi le ha lette
function inviate(db, utenteId, { limite = 100 } = {}) {
  const elenco = db.prepare(`SELECT ${CAMPI} FROM segnalazioni s ${UNIONI} WHERE s.da_id = ? ORDER BY s.creata DESC LIMIT ?`).all(utenteId, limite);
  const letture = db.prepare(
    "SELECT u.nome, a.letta FROM segnalazioni_a a JOIN utenti u ON u.id = a.utente_id WHERE a.segnalazione_id = ? ORDER BY u.nome"
  );
  return elenco.map((s) => ({ ...s, letture: letture.all(s.id) }));
}

const segnalazioniDaLeggere = (db, utenteId) =>
  db.prepare("SELECT COUNT(*) AS n FROM segnalazioni_a WHERE utente_id = ? AND letta IS NULL").get(utenteId).n;

const trovaSegnalazione = (db, id, utenteId) =>
  puoVedere(db, id, utenteId) ? db.prepare(`SELECT ${CAMPI} FROM segnalazioni s ${UNIONI} WHERE s.id = ?`).get(Number(id)) : null;

module.exports = {
  PRIORITA, controllaSegnalazione, inviaSegnalazione, segnaSegnalazioneLetta,
  ricevute, inviate, segnalazioniDaLeggere, trovaSegnalazione,
};
