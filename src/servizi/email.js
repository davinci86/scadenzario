// ─────────────────────────────────────────────────────────────
// EMAIL
// Le email si mettono "in coda" nel database; un incaricato le spedisce.
// Il testo NON contiene mai nomi di clienti né dettagli della pratica:
// le informazioni restano nella rete dello studio.
// Finché il server di posta (SMTP) non è configurato, restano in coda.
// ─────────────────────────────────────────────────────────────
const config = require("../config");

function accodaEmail(db, utenteId, frase) {
  const utente = db.prepare("SELECT email FROM utenti WHERE id = ? AND attivo = 1").get(utenteId);
  if (!utente?.email) return; // chi non ha un indirizzo riceve solo la notifica nell'app
  db.prepare("INSERT INTO email (utente_id, destinatario, oggetto, testo, creata) VALUES (?, ?, ?, ?, ?)").run(
    utenteId,
    utente.email,
    "Scadenzario: hai un promemoria",
    `${frase}\n\nApri lo Scadenzario dalla rete dello studio per i dettagli.\n\n— Messaggio automatico, non rispondere.`,
    Date.now()
  );
}

// Spedisce le email in coda. "trasporto" si può sostituire nei test.
async function inviaEmailInCoda(db, trasporto = null) {
  if (!trasporto) {
    if (!config.email.host) return 0; // non configurato: restano in coda
    const nodemailer = require("nodemailer");
    trasporto = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.porta,
      secure: config.email.porta === 465,
      auth: config.email.utente ? { user: config.email.utente, pass: config.email.password } : undefined,
    });
  }
  const daInviare = db.prepare("SELECT * FROM email WHERE inviata IS NULL AND errore IS NULL ORDER BY id LIMIT 50").all();
  let inviate = 0;
  for (const m of daInviare) {
    try {
      await trasporto.sendMail({ from: config.email.mittente, to: m.destinatario, subject: m.oggetto, text: m.testo });
      db.prepare("UPDATE email SET inviata = ? WHERE id = ?").run(Date.now(), m.id);
      inviate++;
    } catch (errore) {
      db.prepare("UPDATE email SET errore = ? WHERE id = ?").run(String(errore.message).slice(0, 300), m.id);
    }
  }
  return inviate;
}

const ultimeEmail = (db, quante = 20) =>
  db.prepare(`SELECT e.*, u.nome FROM email e JOIN utenti u ON u.id = e.utente_id ORDER BY e.id DESC LIMIT ?`).all(quante);

module.exports = { accodaEmail, inviaEmailInCoda, ultimeEmail };
