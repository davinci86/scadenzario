// ─────────────────────────────────────────────────────────────
// CATEGORIE E SQUADRE PREDEFINITE
//
// Le categorie sono le materie del catalogo (Immigrazione, Civile…).
// Per ogni categoria l'Admin può scegliere una squadra predefinita
// (con un referente ★). Quando si inserisce una scadenza di quella
// categoria, la squadra si propone da sola nel modulo; chi inserisce
// può cambiarla prima di salvare, e dopo Admin ed Editor la cambiano
// a mano come sempre.
//
// L'Admin può anche creare, rinominare ed eliminare le categorie.
// Eliminandone una, atti e scadenze passano a un'altra categoria scelta.
//
// Cambiare la squadra di una categoria vale per le scadenze NUOVE.
// Per quelle aperte rimaste senza nessuno c'è "Assegna le aperte da
// assegnare". Le persone disattivate vengono saltate.
// ─────────────────────────────────────────────────────────────
const { CHIUSI } = require("../dominio/stati");
const { inTransazione, aggiungiAllaSquadra, aggiungiStorico } = require("./scadenze");
const { notifica } = require("./notifiche");
const { registra } = require("./registro");

const NON_CHIUSE = `stato NOT IN (${CHIUSI.map(() => "?").join(", ")})`;

// Tutte le categorie: quelle create, più le materie già usate da atti e scadenze
function categorie(db) {
  return db.prepare(
    `SELECT nome FROM categorie UNION SELECT materia FROM atti UNION SELECT materia FROM categorie_squadre UNION
     SELECT materia FROM scadenze WHERE materia <> '' ORDER BY 1 COLLATE NOCASE`
  ).all().map((r) => r.nome).filter(Boolean);
}

// Esiste già una categoria con questo nome? (senza badare a maiuscole/minuscole)
const trova = (db, nome) => categorie(db).find((c) => c.toLowerCase() === String(nome ?? "").trim().toLowerCase()) ?? null;

// Un nome di categoria accettabile: da 2 a 60 caratteri, spazi sistemati
function controllaNome(nome) {
  const n = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) return { errore: "Il nome della categoria deve avere da 2 a 60 caratteri." };
  return { nome: n };
}

// ── Creare, rinominare, eliminare ────────────────────────────
function creaCategoria(db, nome, autore) {
  const { nome: n, errore } = controllaNome(nome);
  if (errore) return errore;
  if (trova(db, n)) return `La categoria «${trova(db, n)}» esiste già.`;
  db.prepare("INSERT INTO categorie (nome) VALUES (?)").run(n);
  registra(db, autore, "Impostazioni", `Nuova categoria «${n}»`);
}

function rinominaCategoria(db, vecchio, nuovo, autore) {
  const attuale = trova(db, vecchio);
  if (!attuale) return "Categoria non trovata.";
  const { nome: n, errore } = controllaNome(nuovo);
  if (errore) return errore;
  if (n === attuale) return;
  const altra = trova(db, n);
  if (altra && altra !== attuale) return `La categoria «${altra}» esiste già: per unirle, elimina questa e scegli «${altra}» come destinazione.`;
  inTransazione(db, () => {
    db.prepare("DELETE FROM categorie WHERE nome = ?").run(attuale);
    db.prepare("INSERT OR IGNORE INTO categorie (nome) VALUES (?)").run(n);
    for (const [tabella, colonna] of [["atti", "materia"], ["scadenze", "materia"], ["categorie_squadre", "materia"]]) {
      db.prepare(`UPDATE ${tabella} SET ${colonna} = ? WHERE ${colonna} = ?`).run(n, attuale);
    }
    registra(db, autore, "Impostazioni", `Categoria «${attuale}» rinominata in «${n}»`);
  });
}

// Cosa c'è dentro una categoria (per la pagina di conferma dell'eliminazione)
function contenutoCategoria(db, nome) {
  const conta = (sql, ...p) => db.prepare(sql).get(...p).n;
  return {
    atti: conta("SELECT COUNT(*) AS n FROM atti WHERE materia = ?", nome),
    scadenze: conta("SELECT COUNT(*) AS n FROM scadenze WHERE materia = ?", nome),
    aperte: conta(`SELECT COUNT(*) AS n FROM scadenze WHERE materia = ? AND ${NON_CHIUSE}`, nome, ...CHIUSI),
    squadra: squadraDiCategoria(db, nome).utenti.length,
  };
}

// Elimina una categoria. Atti e scadenze passano a "destinazione"
// (obbligatoria se la categoria non è vuota). La sua squadra non si sposta.
function eliminaCategoria(db, nome, destinazione, autore) {
  const attuale = trova(db, nome);
  if (!attuale) return "Categoria non trovata.";
  const c = contenutoCategoria(db, attuale);
  const verso = destinazione ? trova(db, destinazione) : null;
  if ((c.atti || c.scadenze) && (!verso || verso === attuale)) return "Scegli in quale categoria spostare atti e scadenze.";
  inTransazione(db, () => {
    if (verso) {
      const spostate = db.prepare("SELECT id FROM scadenze WHERE materia = ?").all(attuale);
      db.prepare("UPDATE atti SET materia = ? WHERE materia = ?").run(verso, attuale);
      db.prepare("UPDATE scadenze SET materia = ? WHERE materia = ?").run(verso, attuale);
      for (const s of spostate) aggiungiStorico(db, s.id, autore, `Categoria cambiata da «${attuale}» a «${verso}» (categoria eliminata)`);
    }
    db.prepare("DELETE FROM categorie_squadre WHERE materia = ?").run(attuale);
    db.prepare("DELETE FROM categorie WHERE nome = ?").run(attuale);
    registra(db, autore, "Impostazioni", `Categoria «${attuale}» eliminata` +
      (verso ? `: ${c.atti} atti e ${c.scadenze} scadenze spostati in «${verso}»` : ""));
  });
}

// La squadra predefinita di una categoria (solo persone attive).
// Il referente è quello scelto, oppure il primo della squadra.
function squadraDiCategoria(db, materia) {
  const righe = db.prepare(
    `SELECT c.utente_id AS id, c.referente FROM categorie_squadre c JOIN utenti u ON u.id = c.utente_id
      WHERE c.materia = ? AND u.attivo = 1 ORDER BY c.referente DESC, u.nome`
  ).all(String(materia ?? ""));
  const utenti = righe.map((r) => r.id);
  return { utenti, referente: righe.find((r) => r.referente)?.id ?? utenti[0] ?? null };
}

// Per il modulo "Nuova scadenza": { materia: { utenti, referente } }
const mappaSquadre = (db) => Object.fromEntries(categorie(db).map((m) => [m, squadraDiCategoria(db, m)]));

// Le scadenze aperte di una categoria che non hanno ancora nessuno
const apertesenzaSquadra = (db, materia) => db.prepare(
  `SELECT id, tipo, cliente FROM scadenze s WHERE s.materia = ? AND ${NON_CHIUSE}
     AND NOT EXISTS (SELECT 1 FROM squadre q WHERE q.scadenza_id = s.id) ORDER BY s.data`
).all(materia, ...CHIUSI);

// Per la pagina delle impostazioni
function elencoCategorie(db) {
  return categorie(db).map((materia) => ({
    materia,
    ...squadraDiCategoria(db, materia),
    daAssegnare: apertesenzaSquadra(db, materia).length,
    atti: db.prepare("SELECT COUNT(*) AS n FROM atti WHERE materia = ? AND attivo = 1").get(materia).n,
  }));
}

const nomi = (db, ids) => ids.length
  ? db.prepare(`SELECT nome FROM utenti WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY nome`).all(...ids).map((u) => u.nome)
  : [];

// Salva la squadra di una categoria. Restituisce un testo d'errore, o niente.
function salvaSquadraCategoria(db, materia, corpo, autore) {
  if (!categorie(db).includes(materia)) return "Categoria non trovata.";
  const attivi = new Set(db.prepare("SELECT id FROM utenti WHERE attivo = 1").all().map((u) => u.id));
  const utenti = [...new Set([].concat(corpo?.squadra ?? []).map(Number))].filter((id) => attivi.has(id));
  const scelto = Number(corpo?.referente);
  const referente = utenti.includes(scelto) ? scelto : utenti[0] ?? null;
  const prima = squadraDiCategoria(db, materia);
  inTransazione(db, () => {
    db.prepare("DELETE FROM categorie_squadre WHERE materia = ?").run(materia);
    const ins = db.prepare("INSERT INTO categorie_squadre (materia, utente_id, referente) VALUES (?, ?, ?)");
    for (const id of utenti) ins.run(materia, id, id === referente ? 1 : 0);
  });
  const uguale = prima.referente === referente && prima.utenti.length === utenti.length && prima.utenti.every((id) => utenti.includes(id));
  if (!uguale) {
    const ref = referente ? nomi(db, [referente])[0] : "";
    registra(db, autore, "Impostazioni", `Squadra della categoria «${materia}»: ` +
      (utenti.length ? `${nomi(db, utenti).join(", ")}${ref ? ` (referente ${ref})` : ""}` : "nessuno (le nuove resteranno da assegnare)"));
  }
}

// Assegna la squadra della categoria alle scadenze aperte rimaste senza nessuno.
// Restituisce quante ne ha assegnate.
function assegnaApertesenzaSquadra(db, materia, autore) {
  const { utenti, referente } = squadraDiCategoria(db, materia);
  if (!utenti.length) return 0;
  const elenco = apertesenzaSquadra(db, materia);
  const chi = nomi(db, utenti).join(", ");
  inTransazione(db, () => {
    for (const s of elenco) {
      for (const id of utenti) aggiungiAllaSquadra(db, s.id, id);
      db.prepare("UPDATE scadenze SET referente_id = ? WHERE id = ?").run(referente, s.id);
      aggiungiStorico(db, s.id, autore.id, `Assegnata dalla squadra della categoria «${materia}»: ${chi}`);
      for (const id of utenti) {
        notifica(db, { utenti: [id], scadenzaId: s.id, autore: autore.id,
          testo: `Ti è stata assegnata ${s.tipo === "udienza" ? "un'udienza" : "una scadenza"} (categoria ${materia})${id === referente ? " come referente" : ""}` });
      }
    }
    if (elenco.length) registra(db, autore.id, "Impostazioni", `Categoria «${materia}»: assegnate ${elenco.length} scadenze aperte rimaste da assegnare`);
  });
  return elenco.length;
}

module.exports = {
  creaCategoria, rinominaCategoria, eliminaCategoria, contenutoCategoria, trova,
  categorie, squadraDiCategoria, mappaSquadre, elencoCategorie, salvaSquadraCategoria, assegnaApertesenzaSquadra,
};
