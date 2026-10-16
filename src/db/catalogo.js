// ─────────────────────────────────────────────────────────────
// CATALOGO DEGLI ATTI: le modifiche dell'Admin
//
// Due tipi di modifica, trattati in modo diverso:
//  • i "dati" dell'atto (nome, materia, tipo, promemoria, attivo):
//    si salvano subito e finiscono nello storico dell'atto;
//  • la "regola" del termine (da cosa decorre, quanti giorni, in che
//    direzione, sospensione feriale, giorno utile): cambiarla può
//    spostare scadenze già in corso. Per questo serve un passaggio in
//    più (pagina "Modifica dei termini"):
//      1. perché cambia: normativa (con il riferimento alla norma),
//         errore, decisione interna; più una spiegazione;
//      2. da quando vale: retroattiva (tutte le aperte), per gli eventi
//         dal giorno X, oppure scelte una per una;
//      3. anteprima: quali scadenze cambiano e di quanto.
//    Prima di applicare si fa un backup; ogni scadenza ricalcolata ha la
//    sua riga nello storico e chi se ne occupa riceve una notifica.
// Le scadenze corrette a mano non vengono mai toccate.
// ─────────────────────────────────────────────────────────────
const { calcolaTermine, regolaAParole } = require("../dominio/termini");
const { EVENTI, CHIUSI } = require("../dominio/stati");
const D = require("../dominio/date");
const { aRegola, chiusure } = require("./atti");
const { inTransazione, aggiungiStorico } = require("./scadenze");
const { notifica } = require("./notifiche");
const { registra } = require("./registro");
const { leggiLista } = require("../servizi/impostazioni");

const MOTIVI = {
  normativa: { nome: "Modifica normativa", spiega: "Una legge o una riforma ha cambiato il termine." },
  errore: { nome: "Correzione di un errore", spiega: "La regola era stata impostata in modo sbagliato." },
  interna: { nome: "Decisione interna dello studio", spiega: "Lo studio sceglie di contare in modo più prudente o diverso." },
};
const MODI = {
  retro: "retroattiva su tutte le scadenze aperte",
  dal: "per gli eventi dal giorno indicato",
  scelta: "scelta una per una",
};

// ── Lettura ──────────────────────────────────────────────────
function elencoCatalogo(db) {
  const aperte = db.prepare(
    `SELECT COUNT(*) AS n FROM scadenze WHERE atto_id = ? AND stato NOT IN (${CHIUSI.map(() => "?").join(", ")})`
  );
  return db.prepare("SELECT * FROM atti ORDER BY materia, nome").all().map((a) => ({
    ...a,
    regolaTesto: regolaAParole(aRegola(a)),
    aperte: aperte.get(a.id, ...CHIUSI).n,
    versioni: versioniAtto(db, a.id),
  }));
}

const versioniAtto = (db, id) => db.prepare(
  `SELECT v.*, u.nome AS autore FROM atti_versioni v LEFT JOIN utenti u ON u.id = v.utente_id
    WHERE v.atto_id = ? ORDER BY v.id DESC`
).all(id);

const materie = (db) => db.prepare("SELECT DISTINCT materia FROM atti ORDER BY materia").all().map((r) => r.materia);

// ── Il modulo di un atto ─────────────────────────────────────
// Restituisce { dati, regola, errori }. "regola" è nel formato del calcolo.
function controllaAtto(corpo) {
  const testo = (c, max) => String(corpo?.[c] ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const evento = EVENTI[corpo?.evento] ? corpo.evento : "";
  const dati = {
    nome: testo("nome", 120),
    materia: testo("materia", 60),
    tipo: ["scadenza", "adempimento"].includes(corpo?.tipo) ? corpo.tipo : "",
    evento,
    // A ritroso ha senso solo se il termine dipende da un'udienza
    direzione: evento === "udienza" && corpo?.direzione === "ritroso" ? "ritroso" : "avanti",
    giorni: Number(corpo?.giorni),
    sospensione_feriale: corpo?.feriale === "1" ? 1 : 0,
    sposta_giorno_utile: corpo?.proroga === "1" ? 1 : 0,
    promemoria: leggiLista(corpo?.promemoria, { min: 1, max: 365 }),
    attivo: corpo?.attivo === "1" ? 1 : 0,
  };
  const errori = [];
  if (dati.nome.length < 3) errori.push("Scrivi il nome dell'atto.");
  if (!dati.materia) errori.push("Indica la materia.");
  if (!dati.tipo) errori.push("Scegli il tipo.");
  if (!dati.evento) errori.push("Scegli da cosa decorre il termine.");
  if (!Number.isInteger(dati.giorni) || dati.giorni < 1 || dati.giorni > 400) errori.push("I giorni devono essere un numero tra 1 e 400.");
  if (!dati.promemoria) errori.push("Promemoria: scrivi dei numeri di giorni separati da virgola, es. 15, 7, 1.");
  dati.promemoria = (dati.promemoria ?? []).join(",");
  return { dati, regola: aRegola(dati), errori };
}

const CAMPI_REGOLA = ["evento", "direzione", "giorni", "sospensione_feriale", "sposta_giorno_utile"];
const regolaCambia = (atto, dati) => CAMPI_REGOLA.some((c) => atto[c] !== dati[c]);

function aggiungiVersione(db, attoId, autore, v) {
  db.prepare(`INSERT INTO atti_versioni (atto_id, quando, utente_id, motivo, norma, testo, prima, dopo, modo)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(attoId, Date.now(), autore, v.motivo, v.norma ?? "", v.testo, v.prima ?? "", v.dopo ?? "", v.modo ?? "");
}

function creaAtto(db, dati, autore) {
  return inTransazione(db, () => {
    const id = Number(db.prepare(
      `INSERT INTO atti (nome, materia, tipo, evento, direzione, giorni, sospensione_feriale, sposta_giorno_utile, promemoria, attivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(dati.nome, dati.materia, dati.tipo, dati.evento, dati.direzione, dati.giorni,
      dati.sospensione_feriale, dati.sposta_giorno_utile, dati.promemoria, dati.attivo).lastInsertRowid);
    const regola = regolaAParole(aRegola(dati));
    aggiungiVersione(db, id, autore, { motivo: "creazione", testo: "Atto creato", dopo: regola });
    registra(db, autore, "Catalogo", `Nuovo atto «${dati.nome}» (${dati.materia}): ${regola}`);
    return id;
  });
}

// Salva solo i "dati" dell'atto (non la regola). Restituisce cosa è cambiato.
function aggiornaDatiAtto(db, atto, dati, autore) {
  const cambi = [];
  if (atto.nome !== dati.nome) cambi.push(`nome «${dati.nome}»`);
  if (atto.materia !== dati.materia) cambi.push(`materia «${dati.materia}»`);
  if (atto.tipo !== dati.tipo) cambi.push(`tipo ${dati.tipo}`);
  if (atto.promemoria !== dati.promemoria) cambi.push(`promemoria ${dati.promemoria.replaceAll(",", ", ") || "nessuno"}`);
  if (atto.attivo !== dati.attivo) cambi.push(dati.attivo ? "riattivato" : "disattivato");
  if (!cambi.length) return cambi;
  inTransazione(db, () => {
    db.prepare("UPDATE atti SET nome = ?, materia = ?, tipo = ?, promemoria = ?, attivo = ? WHERE id = ?")
      .run(dati.nome, dati.materia, dati.tipo, dati.promemoria, dati.attivo, atto.id);
    aggiungiVersione(db, atto.id, autore, { motivo: "interna", testo: `Aggiornati: ${cambi.join(", ")}`, dopo: regolaAParole(aRegola(atto)) });
    registra(db, autore, "Catalogo", `Atto «${dati.nome}»: ${cambi.join(", ")}`);
  });
  return cambi;
}

// ── L'anteprima: quali scadenze aperte cambierebbero con la nuova regola ──
function scadenzeInteressate(db, atto, regolaNuova) {
  const cal = chiusure(db);
  return db.prepare(
    `SELECT s.id, s.cliente, s.attivita, s.data, s.data_evento, s.correzione_manuale FROM scadenze s
      WHERE s.atto_id = ? AND s.data_evento IS NOT NULL AND s.stato NOT IN (${CHIUSI.map(() => "?").join(", ")})
      ORDER BY s.data`
  ).all(atto.id, ...CHIUSI).map((s) => {
    const nuova = calcolaTermine(s.data_evento, regolaNuova, cal).data;
    return { ...s, nuova, delta: D.giorniDaOggi(nuova, s.data), manuale: !!s.correzione_manuale };
  });
}

// Una scadenza è inclusa nel ricalcolo?
function inclusa(s, { modo, dal, scelte }) {
  if (s.manuale) return false;
  if (modo === "retro") return true;
  if (modo === "dal") return s.data_evento >= dal;
  return scelte.has(s.id);
}

// Controlla il modulo della "Modifica dei termini". Restituisce { scelta, errori }.
function controllaCambio(corpo) {
  const scelta = {
    motivo: MOTIVI[corpo?.motivo] ? corpo.motivo : "",
    norma: String(corpo?.norma ?? "").trim().slice(0, 300),
    testo: String(corpo?.testo ?? "").trim().slice(0, 2000),
    modo: MODI[corpo?.modo] ? corpo.modo : "",
    dal: String(corpo?.dal ?? ""),
    scelte: new Set([].concat(corpo?.scelte ?? []).map(Number)),
  };
  const errori = [];
  if (!scelta.motivo) errori.push("Scegli perché cambia il termine.");
  if (scelta.motivo === "normativa" && scelta.norma.length < 3) errori.push("Per una modifica normativa indica il riferimento alla norma.");
  if (scelta.testo.length < 10) errori.push("Scrivi una spiegazione di qualche parola: resterà nello storico.");
  if (!scelta.modo) errori.push("Scegli da quando vale la modifica.");
  if (scelta.modo === "dal" && !D.eValida(scelta.dal)) errori.push("Indica la data da cui vale la modifica.");
  return { scelta, errori };
}

// Applica la nuova regola. Il backup "prima di una modifica" lo fa chi chiama
// (la rotta), così qui restano solo i dati.
function applicaCambio(db, atto, nuovo, scelta, autore) {
  const regolaNuova = aRegola(nuovo);
  const prima = regolaAParole(aRegola(atto));
  const dopo = regolaAParole(regolaNuova);
  const daRicalcolare = scadenzeInteressate(db, atto, regolaNuova).filter((s) => inclusa(s, scelta));
  const modo = scelta.modo === "dal" ? `per gli eventi dal ${D.formatta(scelta.dal)}` : MODI[scelta.modo];
  const perche = `${MOTIVI[scelta.motivo].nome}${scelta.norma ? `, ${scelta.norma}` : ""}`;
  const gestori = db.prepare("SELECT id FROM utenti WHERE attivo = 1 AND ruolo IN ('admin', 'editor')").all().map((u) => u.id);

  inTransazione(db, () => {
    db.prepare(`UPDATE atti SET ${CAMPI_REGOLA.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
      .run(...CAMPI_REGOLA.map((c) => nuovo[c]), atto.id);
    aggiungiVersione(db, atto.id, autore, { motivo: scelta.motivo, norma: scelta.norma, testo: scelta.testo, prima, dopo,
      modo: `${modo} · ${daRicalcolare.length} ${daRicalcolare.length === 1 ? "scadenza ricalcolata" : "scadenze ricalcolate"}` });

    for (const s of daRicalcolare) {
      db.prepare("UPDATE scadenze SET data = ?, calcolo = ? WHERE id = ?").run(s.nuova, dopo, s.id);
      aggiungiStorico(db, s.id, autore, `Termine ricalcolato per modifica del catalogo (${perche}): da ${D.formatta(s.data)} a ${D.formatta(s.nuova)}`);
      if (s.delta !== 0) {
        const squadra = db.prepare("SELECT utente_id FROM squadre WHERE scadenza_id = ?").all(s.id).map((r) => r.utente_id);
        notifica(db, { utenti: squadra.length ? squadra : gestori, scadenzaId: s.id, autore,
          testo: `Termine cambiato per modifica delle regole: ora scade ${D.formatta(s.nuova)} (prima ${D.formatta(s.data)})` });
      }
    }
    registra(db, autore, "Catalogo", `Termini di «${atto.nome}»: da «${prima}» a «${dopo}» · ${perche} · ${modo}, ` +
      `${daRicalcolare.length} scadenze ricalcolate`);
  });
  return daRicalcolare.length;
}

// ── Chiusure dello studio ────────────────────────────────────
function aggiungiChiusura(db, data, motivo, autore) {
  if (!D.eValida(data)) return "Indica una data valida.";
  if (db.prepare("SELECT 1 FROM chiusure WHERE data = ?").get(data)) return "Questa data è già tra le chiusure.";
  const m = String(motivo ?? "").trim().slice(0, 100) || "Chiusura dello studio";
  db.prepare("INSERT INTO chiusure (data, motivo) VALUES (?, ?)").run(data, m);
  registra(db, autore, "Impostazioni", `Aggiunta chiusura del ${D.formatta(data)} (${m})`);
}
function togliChiusura(db, data, autore) {
  const c = db.prepare("SELECT * FROM chiusure WHERE data = ?").get(String(data));
  if (!c) return;
  db.prepare("DELETE FROM chiusure WHERE data = ?").run(c.data);
  registra(db, autore, "Impostazioni", `Tolta chiusura del ${D.formatta(c.data)} (${c.motivo})`);
}
const elencoChiusure = (db) => db.prepare("SELECT * FROM chiusure ORDER BY data").all();

// Scadenze aperte che cadono in un giorno di chiusura: vanno controllate
const scadenzeInChiusura = (db) => db.prepare(
  `SELECT s.id, s.cliente, s.attivita, s.data, c.motivo FROM scadenze s JOIN chiusure c ON c.data = s.data
    WHERE s.tipo <> 'udienza' AND s.stato NOT IN (${CHIUSI.map(() => "?").join(", ")}) ORDER BY s.data`
).all(...CHIUSI);

module.exports = {
  MOTIVI, MODI, elencoCatalogo, versioniAtto, materie, controllaAtto, regolaCambia, creaAtto, aggiornaDatiAtto,
  scadenzeInteressate, inclusa, controllaCambio, applicaCambio,
  aggiungiChiusura, togliChiusura, elencoChiusure, scadenzeInChiusura,
};
