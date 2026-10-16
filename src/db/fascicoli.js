// ─────────────────────────────────────────────────────────────
// FASCICOLI CARTACEI: dove sono e chi li ha
//
// Un fascicolo è in uno di tre stati:
//   archivio       è al suo posto
//   consultazione  ce l'ha qualcuno (chi_id), da una certa data
//   consegna       chi_id lo sta passando ad a_id, che deve confermare
//
// Il numero si scrive a mano, come è sulla copertina. Lo "normalizziamo"
// (maiuscolo, spazi sistemati) così «1234/2025 » e «1234/2025» sono lo stesso.
// La prima volta che si usa un numero, il fascicolo viene registrato.
//
// Ogni passaggio finisce nei movimenti del fascicolo e nel Registro.
// Le funzioni che cambiano lo stato restituiscono un testo d'errore
// se l'operazione non è permessa in quel momento, altrimenti niente.
// ─────────────────────────────────────────────────────────────
const { inTransazione } = require("./scadenze");
const { notifica, segnaLetteConChiave } = require("./notifiche");
const { registra } = require("./registro");

const normalizzaNumero = (testo) => String(testo ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 40);

const link = (numero) => `/fascicoli?n=${encodeURIComponent(numero)}`;
const chiaveConferma = (f) => `fasc-conf@${f.numero}@${f.dal}`;

function trovaFascicolo(db, numero) {
  return db.prepare(
    `SELECT f.*, c.nome AS chi_nome, a.nome AS a_nome FROM fascicoli f
       LEFT JOIN utenti c ON c.id = f.chi_id LEFT JOIN utenti a ON a.id = f.a_id WHERE f.numero = ?`
  ).get(normalizzaNumero(numero)) || null;
}

// Ricerca per numero o per cliente (anche parziale)
function cercaFascicoli(db, testo) {
  const q = `%${normalizzaNumero(testo)}%`;
  return db.prepare(
    `SELECT numero FROM fascicoli WHERE numero LIKE ? OR UPPER(cliente) LIKE ? ORDER BY numero LIMIT 20`
  ).all(q, q).map((r) => trovaFascicolo(db, r.numero));
}

const movimenti = (db, numero) => db.prepare(
  `SELECT m.quando, m.testo, u.nome FROM movimenti_fascicoli m LEFT JOIN utenti u ON u.id = m.utente_id
    WHERE m.numero = ? ORDER BY m.id DESC`
).all(normalizzaNumero(numero));

// Le scadenze aperte con quel fascicolo
const scadenzeCollegate = (db, numero) => db.prepare(
  `SELECT id, cliente, attivita FROM scadenze
    WHERE UPPER(TRIM(fascicolo)) = ? AND stato NOT IN ('Depositato', 'Completato', 'Tenuta', 'Rinviata') ORDER BY data`
).all(normalizzaNumero(numero));

// Elenchi per le pagine
const fuoriArchivio = (db) => db.prepare(
  `SELECT f.*, c.nome AS chi_nome, a.nome AS a_nome FROM fascicoli f
     LEFT JOIN utenti c ON c.id = f.chi_id LEFT JOIN utenti a ON a.id = f.a_id
    WHERE f.stato <> 'archivio' ORDER BY f.dal`
).all();
const inManoA = (db, utenteId) => fuoriArchivio(db).filter((f) => f.stato === "consultazione" && f.chi_id === utenteId);
const daConfermare = (db, utenteId) => fuoriArchivio(db).filter((f) => f.stato === "consegna" && f.a_id === utenteId);

// ── Le operazioni ────────────────────────────────────────────

function aggiungiMovimento(db, numero, utente, testo) {
  db.prepare("INSERT INTO movimenti_fascicoli (numero, quando, utente_id, testo) VALUES (?, ?, ?, ?)")
    .run(numero, Date.now(), utente.id, testo);
  registra(db, utente.id, "Fascicolo", `Fascicolo ${numero} · ${testo}`);
}

function imposta(db, numero, { stato, chi = null, a = null, nuovaData = true }) {
  db.prepare(`UPDATE fascicoli SET stato = ?, chi_id = ?, a_id = ?${nuovaData ? ", dal = ?" : ""} WHERE numero = ?`)
    .run(stato, chi, a, ...(nuovaData ? [Date.now()] : []), numero);
}

// Lo registra se non c'è ancora (in archivio). Aggiorna il cliente se mancava.
function registraSeNuovo(db, numero, cliente, utente) {
  const f = trovaFascicolo(db, numero);
  const c = String(cliente ?? "").trim().slice(0, 80);
  if (f) {
    if (c && !f.cliente) db.prepare("UPDATE fascicoli SET cliente = ? WHERE numero = ?").run(c, numero);
    return;
  }
  db.prepare("INSERT INTO fascicoli (numero, cliente, stato, dal) VALUES (?, ?, 'archivio', ?)").run(numero, c, Date.now());
  aggiungiMovimento(db, numero, utente, "Registrato per la prima volta");
}

// Tutte le azioni passano da qui. azione: prendo, consegno, ricevuto,
// non-ricevuto, annulla, archivio.
function muoviFascicolo(db, { azione, numero: grezzo, cliente, a }, utente) {
  const numero = normalizzaNumero(grezzo);
  if (!numero) return "Scrivi il numero del fascicolo.";
  return inTransazione(db, () => {
    if (["prendo", "consegno"].includes(azione)) registraSeNuovo(db, numero, cliente, utente);
    const f = trovaFascicolo(db, numero);
    if (!f) return "Questo fascicolo non è registrato.";
    const breve = (nome) => String(nome || "").replace(/^(Avv\.|Dott\.)\s*/, "");

    switch (azione) {
      case "prendo":
        if (f.stato !== "archivio") return `Il fascicolo non è in archivio: ce l'ha ${f.chi_nome}.`;
        imposta(db, numero, { stato: "consultazione", chi: utente.id });
        return aggiungiMovimento(db, numero, utente, `Preso dall'archivio da ${utente.nome}`);

      case "consegno": {
        const destinatario = db.prepare("SELECT id, nome FROM utenti WHERE id = ? AND attivo = 1").get(Number(a));
        if (!destinatario || destinatario.id === utente.id) return "Scegli il collega a cui consegnarlo.";
        const dallArchivio = f.stato === "archivio";
        if (!dallArchivio && !(f.stato === "consultazione" && f.chi_id === utente.id)) {
          return f.stato === "consegna" ? "Il fascicolo è già in consegna." : `Il fascicolo ce l'ha ${f.chi_nome}: solo chi l'ha in mano può consegnarlo.`;
        }
        imposta(db, numero, { stato: "consegna", chi: utente.id, a: destinatario.id });
        const ora = trovaFascicolo(db, numero);
        notifica(db, {
          utenti: [destinatario.id], tipo: "fascicolo", chiave: chiaveConferma(ora), link: link(numero),
          testo: `${utente.nome} ti ha consegnato il fascicolo ${numero}: conferma di averlo ricevuto`,
        });
        return aggiungiMovimento(db, numero, utente,
          `${dallArchivio ? "Preso dall'archivio e consegnato" : "Consegnato"} a ${destinatario.nome}, in attesa di conferma`);
      }

      case "ricevuto":
        if (f.stato !== "consegna" || f.a_id !== utente.id) return "Non c'è nessuna consegna da confermare per te.";
        segnaLetteConChiave(db, chiaveConferma(f));
        imposta(db, numero, { stato: "consultazione", chi: utente.id });
        notifica(db, { utenti: [f.chi_id], tipo: "fascicolo", link: link(numero),
          testo: `${utente.nome} ha confermato di aver ricevuto il fascicolo ${numero}` });
        return aggiungiMovimento(db, numero, utente, `Ricevuto, confermato da ${utente.nome}`);

      case "non-ricevuto":
        if (f.stato !== "consegna" || f.a_id !== utente.id) return "Non c'è nessuna consegna da confermare per te.";
        segnaLetteConChiave(db, chiaveConferma(f));
        imposta(db, numero, { stato: "consultazione", chi: f.chi_id, nuovaData: false });
        notifica(db, { utenti: [f.chi_id], tipo: "fascicolo", link: link(numero),
          testo: `Attenzione: ${utente.nome} dice di non aver ricevuto il fascicolo ${numero}. Risulta ancora a te.` });
        return aggiungiMovimento(db, numero, utente, `${utente.nome} dice di non averlo ricevuto: risulta ancora a ${breve(f.chi_nome)}`);

      case "annulla":
        if (f.stato !== "consegna" || f.chi_id !== utente.id) return "Non c'è nessuna tua consegna da annullare.";
        segnaLetteConChiave(db, chiaveConferma(f));
        imposta(db, numero, { stato: "consultazione", chi: utente.id, nuovaData: false });
        return aggiungiMovimento(db, numero, utente, `Consegna a ${f.a_nome} annullata`);

      case "archivio": {
        if (f.stato === "archivio") return "Il fascicolo è già in archivio.";
        const admin = utente.ruolo === "admin";
        if (f.chi_id !== utente.id && !admin) return `Il fascicolo ce l'ha ${f.chi_nome}: può rimetterlo in archivio solo lui o l'Admin.`;
        if (f.stato === "consegna") segnaLetteConChiave(db, chiaveConferma(f));
        imposta(db, numero, { stato: "archivio" });
        return aggiungiMovimento(db, numero, utente,
          `Rimesso in archivio da ${utente.nome}${f.chi_id !== utente.id ? ` (era a ${breve(f.chi_nome)})` : ""}`);
      }

      default:
        return "Azione sconosciuta.";
    }
  });
}

const giorniFuori = (f, ora = Date.now()) => Math.floor((ora - f.dal) / 86_400_000);

module.exports = {
  normalizzaNumero, trovaFascicolo, cercaFascicoli, movimenti, scadenzeCollegate,
  fuoriArchivio, inManoA, daConfermare, muoviFascicolo, giorniFuori, link,
};
