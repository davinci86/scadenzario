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
// Cambiare la squadra di una categoria vale per le scadenze NUOVE.
// Per quelle aperte rimaste senza nessuno c'è "Assegna le aperte da
// assegnare". Le persone disattivate vengono saltate.
// ─────────────────────────────────────────────────────────────
const { CHIUSI } = require("../dominio/stati");
const { inTransazione, aggiungiAllaSquadra, aggiungiStorico } = require("./scadenze");
const { notifica } = require("./notifiche");
const { registra } = require("./registro");

const NON_CHIUSE = `stato NOT IN (${CHIUSI.map(() => "?").join(", ")})`;

// Tutte le categorie: le materie degli atti, più quelle già usate
function categorie(db) {
  return db.prepare(
    `SELECT materia FROM atti UNION SELECT materia FROM categorie_squadre UNION
     SELECT materia FROM scadenze WHERE materia <> '' ORDER BY materia`
  ).all().map((r) => r.materia).filter(Boolean);
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

module.exports = { categorie, squadraDiCategoria, mappaSquadre, elencoCategorie, salvaSquadraCategoria, assegnaApertesenzaSquadra };
