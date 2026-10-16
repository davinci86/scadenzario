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
  // Dalla Tappa 3: email di prova (dominio inesistente) e un titolare
  db.prepare("UPDATE utenti SET email = nome_utente || '@studio.example'").run();
  db.prepare("UPDATE utenti SET titolare = 1 WHERE nome_utente = 'm.deluca'").run();
  return true;
}

module.exports = { inserisciUtentiDiProva, UTENTI_DI_PROVA };

// ─────────────────────────────────────────────────────────────
// CATALOGO E SCADENZE DI PROVA (dalla Tappa 2)
// Atti e termini sono ESEMPI: quelli veri li detta lo studio.
// Le date delle scadenze sono calcolate rispetto a oggi, così la
// demo ha sempre scadenze vicine, lontane e scadute.
// ─────────────────────────────────────────────────────────────
const { calcolaTermine, regolaAParole } = require("../dominio/termini");
const { aggiungiGiorni, oggi } = require("../dominio/date");

const ATTI_DI_PROVA = [
  // nome, materia, tipo, evento, direzione, giorni, feriale, promemoria
  ["Ricorso avverso diniego di protezione internazionale", "Immigrazione", "scadenza", "notifica", "avanti", 30, 1, "15,7,3,1"],
  ["Appello penale", "Penale", "scadenza", "deposito", "avanti", 45, 1, "15,7,1"],
  ["Appello civile (termine breve)", "Civile", "scadenza", "notifica", "avanti", 30, 1, "15,7,1"],
  ["Memoria prima dell'udienza", "Civile", "scadenza", "udienza", "ritroso", 20, 1, "7,3,1"],
  ["Sollecito alla compagnia assicurativa", "Infortunistica stradale", "adempimento", "invio", "avanti", 30, 0, "3,1"],
  ["Ricorso al TAR", "Amministrativo", "scadenza", "notifica", "avanti", 60, 1, "30,15,7,1"],
];

function inserisciDatiDiProva(db) {
  let fatto = false;
  const { n: atti } = db.prepare("SELECT COUNT(*) AS n FROM atti").get();
  if (atti === 0) {
    const ins = db.prepare(`INSERT INTO atti (nome, materia, tipo, evento, direzione, giorni, sospensione_feriale, promemoria)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const a of ATTI_DI_PROVA) ins.run(...a);
    fatto = true;
  }

  const { n: scadenze } = db.prepare("SELECT COUNT(*) AS n FROM scadenze").get();
  if (scadenze > 0) return fatto;

  const utente = (nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente)?.id;
  const atto = (nome) => db.prepare("SELECT * FROM atti WHERE nome = ?").get(nome);
  const g = (n) => aggiungiGiorni(oggi(), n);
  // Le udienze di prova non cadono mai di sabato o di domenica
  const feriale = (n) => {
    let d = g(n);
    while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = aggiungiGiorni(d, 1);
    return d;
  };
  const ins = db.prepare(`INSERT INTO scadenze (tipo, cliente, attivita, ufficio, fascicolo, atto_id, data_evento, calcolo,
    data, ora, stato, da_verificare, referente_id, creata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insSq = db.prepare("INSERT INTO squadre (scadenza_id, utente_id) VALUES (?, ?)");
  const insSt = db.prepare("INSERT INTO storico (scadenza_id, quando, utente_id, testo) VALUES (?, ?, ?, ?)");

  // Una scadenza di prova: se ha un atto, la data la calcola il catalogo.
  function crea({ tipo = "scadenza", cliente, attivita, ufficio = "", fascicolo = "", nomeAtto, evento, data, ora = "",
                  stato, verificare = 0, squadra = [], referente }) {
    let calcolo = "", attoId = null;
    if (nomeAtto) {
      const a = atto(nomeAtto);
      const regola = { giorni: a.giorni, direzione: a.direzione, evento: a.evento,
        sospensioneFeriale: !!a.sospensione_feriale, spostaGiornoUtile: !!a.sposta_giorno_utile };
      data = calcolaTermine(evento, regola).data;
      calcolo = regolaAParole(regola);
      attoId = a.id;
    }
    const ids = squadra.map(utente);
    const id = Number(ins.run(tipo, cliente, attivita, ufficio, fascicolo, attoId, evento || null, calcolo, data, ora,
      stato, verificare, referente ? utente(referente) : ids[0] ?? null, Date.now()).lastInsertRowid);
    for (const u of ids) insSq.run(id, u);
    insSt.run(id, Date.now(), utente("a.ferrara"), "Scadenza inserita (dato di prova)");
  }

  crea({ cliente: "Kone Ibrahim", attivita: "Ricorso avverso diniego di protezione internazionale",
    ufficio: "Tribunale di Napoli, Sez. Immigrazione", fascicolo: "1234/2025", nomeAtto: "Ricorso avverso diniego di protezione internazionale",
    evento: g(-27), stato: "Da correggere", squadra: ["a.ferrara", "m.deluca"], referente: "m.deluca" });
  crea({ tipo: "udienza", cliente: "Diallo Fatou", attivita: "Udienza di comparizione delle parti",
    ufficio: "Tribunale di Napoli, Sez. Immigrazione", data: feriale(1), ora: "09:30", stato: "In preparazione", squadra: ["g.esposito"] });
  crea({ cliente: "Rossi Antonio", attivita: "Memoria prima dell'udienza di precisazione delle conclusioni", ufficio: "Tribunale di Napoli",
    fascicolo: "0987/2024", nomeAtto: "Memoria prima dell'udienza", evento: feriale(38), stato: "In elaborazione", squadra: ["p.russo", "l.romano"] });
  crea({ tipo: "udienza", cliente: "Rossi Antonio", attivita: "Udienza di precisazione delle conclusioni", ufficio: "Tribunale di Napoli",
    fascicolo: "0987/2024", data: feriale(38), ora: "10:15", stato: "Da preparare", squadra: ["p.russo"] });
  crea({ cliente: "Hossain Rahim", attivita: "Ricorso al TAR, rigetto rinnovo permesso di soggiorno", ufficio: "TAR Campania",
    fascicolo: "1502/2026", nomeAtto: "Ricorso al TAR", evento: g(-44), stato: "Da iniziare",
    squadra: ["a.ferrara", "g.esposito", "m.deluca"], referente: "g.esposito" });
  crea({ cliente: "Popescu Elena", attivita: "Appello avverso sentenza di primo grado", ufficio: "Corte d'Appello di Napoli",
    nomeAtto: "Appello civile (termine breve)", evento: g(-30), stato: "Da depositare", squadra: ["l.romano", "m.deluca"] });
  crea({ tipo: "udienza", cliente: "Bianchi Laura", attivita: "Udienza istruttoria", ufficio: "Giudice di Pace di Napoli",
    data: feriale(2), ora: "11:00", stato: "Da preparare", squadra: ["p.russo"] });
  crea({ tipo: "adempimento", cliente: "Okafor Chidi", attivita: "Invio documentazione integrativa al cliente",
    data: g(-2), stato: "In elaborazione", squadra: ["l.romano"] });
  crea({ tipo: "adempimento", cliente: "Esposito Ciro", attivita: "Sollecito alla compagnia assicurativa",
    nomeAtto: "Sollecito alla compagnia assicurativa", evento: g(-25), stato: "In elaborazione",
    squadra: ["l.romano", "p.russo"], referente: "p.russo" });
  crea({ cliente: "Mendez Lucia", attivita: "Ricorso per ricongiungimento familiare", ufficio: "Tribunale di Napoli",
    data: g(-10), stato: "Depositato", squadra: ["g.esposito", "l.romano"] });
  crea({ cliente: "Traoré Moussa", attivita: "Ricorso al TAR, diniego del permesso di soggiorno", ufficio: "TAR Campania",
    nomeAtto: "Ricorso al TAR", evento: g(-10), stato: "Da iniziare" });
  crea({ cliente: "Ferraro Giovanni", attivita: "Atto di citazione, sinistro stradale con lesioni", ufficio: "Tribunale di Napoli",
    data: g(21), stato: "Da iniziare", verificare: 1 });
  return true;
}

module.exports.inserisciDatiDiProva = inserisciDatiDiProva;

// ── Tappa 4: qualche fascicolo e segnalazione di prova (dati inventati) ──
// Parte solo se non ce ne sono ancora: così vale anche per un database
// creato nelle tappe precedenti.
function inserisciProvaTappa4(db) {
  const vuoto = db.prepare("SELECT (SELECT COUNT(*) FROM fascicoli) + (SELECT COUNT(*) FROM segnalazioni) AS n").get().n === 0;
  if (!vuoto) return false;
  const utente = (nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente)?.id;
  if (!utente("a.ferrara")) return false;
  const giorniFa = (n) => Date.now() - n * 86_400_000;

  // Fascicoli: uno fuori da 35 giorni (scatterà il promemoria), uno in consegna, uno in archivio
  const insF = db.prepare("INSERT INTO fascicoli (numero, cliente, stato, chi_id, a_id, dal) VALUES (?, ?, ?, ?, ?, ?)");
  const insM = db.prepare("INSERT INTO movimenti_fascicoli (numero, quando, utente_id, testo) VALUES (?, ?, ?, ?)");
  insF.run("1234/2025", "Kone Ibrahim", "consultazione", utente("m.deluca"), null, giorniFa(35));
  insM.run("1234/2025", giorniFa(35), utente("m.deluca"), "Preso dall'archivio da Avv. Marco De Luca");
  const dalConsegna = giorniFa(0);
  insF.run("0987/2024", "Rossi Antonio", "consegna", utente("p.russo"), utente("a.ferrara"), dalConsegna);
  insM.run("0987/2024", giorniFa(3), utente("p.russo"), "Preso dall'archivio da Avv. Paolo Russo");
  insM.run("0987/2024", giorniFa(0), utente("p.russo"), "Consegnato a Anna Ferrara, in attesa di conferma");
  db.prepare(`INSERT INTO notifiche (utente_id, tipo, testo, chiave, creata, link) VALUES (?, 'fascicolo', ?, ?, ?, ?)`)
    .run(utente("a.ferrara"), "Avv. Paolo Russo ti ha consegnato il fascicolo 0987/2024: conferma di averlo ricevuto",
      `fasc-conf@0987/2024@${dalConsegna}`, Date.now(), "/fascicoli?n=0987%2F2024");
  insF.run("1502/2026", "Hossain Rahim", "archivio", null, null, giorniFa(10));
  insM.run("1502/2026", giorniFa(10), utente("g.esposito"), "Registrato per la prima volta");

  // Segnalazioni
  const insS = db.prepare(`INSERT INTO segnalazioni (da_id, oggetto, testo, priorita, scadenza_id, fascicolo, creata)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insA = db.prepare("INSERT INTO segnalazioni_a (segnalazione_id, utente_id, letta) VALUES (?, ?, ?)");
  const s1 = insS.run(utente("p.russo"), "Controlla la memoria prima di mercoledì",
    "Ho lasciato la bozza nella cartella condivisa. Mi servono le tue correzioni entro martedì sera.",
    "importante", null, "0987/2024", giorniFa(0)).lastInsertRowid;
  insA.run(s1, utente("a.ferrara"), null);
  insA.run(s1, utente("l.romano"), giorniFa(0));
  const s2 = insS.run(utente("a.ferrara"), "Telefonata del cliente Kone",
    "Ha chiamato il cliente: richiama nel pomeriggio per l'appuntamento.", "normale", null, "", giorniFa(1)).lastInsertRowid;
  insA.run(s2, utente("m.deluca"), null);
  return true;
}

module.exports.inserisciProvaTappa4 = inserisciProvaTappa4;
