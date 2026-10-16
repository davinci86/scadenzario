// ─────────────────────────────────────────────────────────────
// PROMEMORIA
// Il server, ogni pochi minuti, passa in rassegna le scadenze aperte
// e crea i promemoria dovuti. Grazie alla "chiave" ogni promemoria
// nasce una volta sola, anche se il controllo gira cento volte.
//
// Le regole decise insieme:
//  • scadenze e adempimenti: i giorni del loro atto (es. 15, 7, 3, 1),
//    oppure quelli predefiniti; il giorno prima è SEMPRE attivo.
//    Si avvisa solo per la soglia più vicina (niente raffiche).
//  • scadenza superata: avviso al referente.
//  • udienze: a 48 e a 24 ore.
//  • scadenze senza squadra: i promemoria vanno ad Admin ed Editor.
// I promemoria arrivano anche via email, senza nomi di clienti.
// ─────────────────────────────────────────────────────────────
const config = require("../config");
const { elencoScadenze } = require("../db/scadenze");
const { notifica } = require("../db/notifiche");
const { accodaEmail } = require("./email");
const { giorniDaOggi, oggi, formatta } = require("../dominio/date");

function sogliePromemoria(db, s) {
  let giorni = config.promemoriaPredefiniti;
  if (s.atto_id) {
    const atto = db.prepare("SELECT promemoria FROM atti WHERE id = ?").get(s.atto_id);
    if (atto) giorni = atto.promemoria.split(",").map(Number).filter((n) => n > 0);
  }
  return [...new Set([...giorni, 1])].sort((a, b) => a - b); // il giorno prima sempre
}

const quando = (g) => (g === 0 ? "oggi" : g === 1 ? "domani" : `tra ${g} giorni`);

function generaPromemoria(db, giorno = oggi()) {
  const gestori = db.prepare("SELECT id FROM utenti WHERE attivo = 1 AND ruolo IN ('admin', 'editor')").all().map((u) => u.id);
  // Chi è disattivato non riceve promemoria: se in squadra non resta nessuno
  // di attivo, l'attività è trattata come "da assegnare".
  const attivi = new Set(db.prepare("SELECT id FROM utenti WHERE attivo = 1").all().map((u) => u.id));
  let creati = 0;

  for (const s of elencoScadenze(db, {})) {
    const g = giorniDaOggi(s.data, giorno);
    const squadraAttiva = s.squadra.filter((p) => attivi.has(p.id));
    const orfana = squadraAttiva.length === 0;
    const destinatari = orfana ? gestori : squadraAttiva.map((p) => p.id);
    const prima = orfana ? "Da assegnare · " : "";
    const invia = (testo, chiave, perEmail) => {
      const ricevuta = notifica(db, { utenti: destinatari, scadenzaId: s.id, testo: prima + testo, tipo: "promemoria", chiave });
      for (const id of ricevuta) accodaEmail(db, id, perEmail);
      creati += ricevuta.length;
    };

    if (s.tipo === "udienza") {
      for (const ore of config.promemoriaUdienzeOre) {
        if (g >= 0 && g <= Math.ceil(ore / 24)) {
          invia(`Promemoria ${ore} ore: udienza ${quando(g)}${s.ora ? " alle " + s.ora : ""}`,
            `udienza-${ore}@${s.id}@${s.data}`,
            `Hai un'udienza ${quando(g)} (${formatta(s.data)}${s.ora ? " ore " + s.ora : ""}).`);
        }
      }
      continue;
    }

    if (g < 0) {
      // Scaduta: avviso al referente (o ai gestori, se non c'è nessuno)
      const a = orfana ? gestori : [attivi.has(s.referente_id) ? s.referente_id : squadraAttiva[0].id];
      const ricevuta = notifica(db, { utenti: a, scadenzaId: s.id, tipo: "promemoria", chiave: `scaduta@${s.id}@${s.data}`,
        testo: `${prima}Scaduta da ${-g} ${-g === 1 ? "giorno" : "giorni"}, stato ancora «${s.stato}»` });
      for (const id of ricevuta) accodaEmail(db, id, `Hai una scadenza superata del ${formatta(s.data)} non ancora chiusa.`);
      creati += ricevuta.length;
      continue;
    }

    const soglia = sogliePromemoria(db, s).find((x) => x >= g);
    if (soglia === undefined) continue;
    invia(g === 0 ? "Scade oggi" : g === 1 ? "Scade domani" : `Scade tra ${g} giorni`,
      `soglia-${soglia}@${s.id}@${s.data}`,
      `Hai una scadenza ${quando(g)} (${formatta(s.data)}).`);
  }
  return creati;
}

module.exports = { generaPromemoria, sogliePromemoria };
