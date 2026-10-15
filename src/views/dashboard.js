// La dashboard personale. Per ora saluta e spiega il ruolo:
// dalla Tappa 2 qui compariranno scadenze, udienze e notifiche.
const { esc, layout, RUOLI } = require("./html");

const COSA_PUOI_FARE = {
  admin: "Vedi e modifichi tutto. Sei l'unica persona ad accedere a registro, backup e impostazioni.",
  editor: "Puoi creare e modificare le scadenze. Ogni modifica finisce nel registro.",
  collab: "Consulti lo scadenzario, aggiorni lo stato delle tue attività e coinvolgi i colleghi.",
};

function saluto(ora = new Date().getHours()) {
  return ora < 13 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
}

function paginaDashboard(utente) {
  const nomeProprio = utente.nome.replace(/^(Avv\.|Dott\.)\s*/, "").split(" ")[0];
  return layout({
    titolo: "Dashboard",
    utente,
    attiva: "dash",
    contenuto: `
<h1>${saluto()}, ${esc(nomeProprio)}</h1>
<section class="pannello">
  <h2>Il tuo ruolo: ${RUOLI[utente.ruolo]}</h2>
  <p>${COSA_PUOI_FARE[utente.ruolo]}</p>
</section>
<section class="pannello">
  <h2>Le mie scadenze</h2>
  <p class="nota">Arrivano con la Tappa 2.</p>
</section>`,
  });
}

module.exports = { paginaDashboard, saluto };
