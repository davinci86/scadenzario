// ─────────────────────────────────────────────────────────────
// PEZZI COMUNI DELLE PAGINE DELLO SCADENZARIO
// ─────────────────────────────────────────────────────────────
const { esc } = require("./html");
const { coloreDi, eChiuso } = require("../dominio/stati");
const { giorniDaOggi } = require("../dominio/date");

// Il "semaforo": quanti giorni mancano, con il colore giusto.
function mancano(s) {
  if (eChiuso(s.stato)) return `<span class="giorni chiusa">chiusa</span>`;
  const g = giorniDaOggi(s.data);
  if (g < 0) return `<span class="giorni scaduta">scaduta da ${-g} gg</span>`;
  if (g === 0) return `<span class="giorni oggi">oggi</span>`;
  if (g === 1) return `<span class="giorni oggi">domani</span>`;
  if (g <= 7) return `<span class="giorni presto">tra ${g} gg</span>`;
  return `<span class="giorni lontana">tra ${g} gg</span>`;
}

// Chi se ne occupa: "★ De Luca, Ferrara" oppure "Da assegnare"
const cognome = (nome) => nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ").slice(1).join(" ") || nome;
function squadraBreve(s) {
  if (!s.squadra.length) return `<span class="etichetta attenzione">Da assegnare</span>`;
  return s.squadra
    .map((p) => (p.id === s.referente_id ? `<span class="stella" title="Referente">★</span> ` : "") + esc(cognome(p.nome)))
    .join(", ");
}

// Il quadratino colorato dello stato
const campione = (stato) => `<span class="campione ev-${coloreDi(stato)}"></span>`;
const pillola = (stato) => `<span class="pillola">${campione(stato)}${esc(stato)}</span>`;

module.exports = { mancano, squadraBreve, campione, pillola, cognome };
