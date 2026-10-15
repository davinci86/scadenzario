// ─────────────────────────────────────────────────────────────
// CATALOGO DEGLI ATTI: lettura
// (La modifica del catalogo dall'app arriva con le Impostazioni, Tappa 5.)
// ─────────────────────────────────────────────────────────────
const { regolaAParole } = require("../dominio/termini");

// Trasforma una riga del database nella "regola" usata dal calcolo.
function aRegola(atto) {
  return {
    giorni: atto.giorni,
    direzione: atto.direzione,
    evento: atto.evento,
    sospensioneFeriale: !!atto.sospensione_feriale,
    spostaGiornoUtile: !!atto.sposta_giorno_utile,
  };
}

function attiAttivi(db) {
  return db.prepare("SELECT * FROM atti WHERE attivo = 1 ORDER BY materia, nome").all()
    .map((a) => ({ ...a, regolaTesto: regolaAParole(aRegola(a)) }));
}

const trovaAtto = (db, id) => db.prepare("SELECT * FROM atti WHERE id = ?").get(id);

// Le chiusure dello studio, come Map data → motivo (serve al calcolo)
function chiusure(db) {
  return new Map(db.prepare("SELECT data, motivo FROM chiusure").all().map((c) => [c.data, c.motivo]));
}

module.exports = { aRegola, attiAttivi, trovaAtto, chiusure };
