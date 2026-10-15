// ─────────────────────────────────────────────────────────────
// REGISTRO DEGLI INGRESSI
// Chi è entrato in un certo giorno, a che ora, e a che ora è uscito.
// Solo orari: nessun calcolo di ore. Visibile all'Admin e ai titolari.
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { formattaEsteso, aggiungiGiorni, oggi } = require("../dominio/date");

const ora = (ms) => new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function paginaIngressi(utente, giorno, righe) {
  const entrati = righe.filter((r) => r.entrata);
  const corpo = righe.map((r) => {
    if (!r.entrata) {
      return `<tr class="assente"><td><b>${esc(r.nome)}</b><br><span class="nota">${esc(r.titolo)}</span></td><td>—</td><td>—</td><td class="nota">Nessun accesso</td></tr>`;
    }
    const uscita = r.uscita
      ? ora(r.uscita)
      : `<span class="tenue">—</span>`;
    const nota = r.uscita ? "" : giorno === oggi()
      ? `Ancora collegato · ultima attività alle ${ora(r.ultima_attivita)}`
      : `<span class="etichetta attenzione">Uscita non registrata</span> ultima attività alle ${ora(r.ultima_attivita)}`;
    return `<tr><td><b>${esc(r.nome)}</b><br><span class="nota">${esc(r.titolo)}</span></td>
      <td class="orario">${ora(r.entrata)}</td><td class="orario">${uscita}</td><td class="nota">${nota}</td></tr>`;
  }).join("");

  return layout({
    titolo: "Ingressi",
    utente,
    attiva: "ingressi",
    contenuto: `
<div class="testata-dash">
  <div><h1>Ingressi e uscite</h1><p class="tenue">${formattaEsteso(giorno)} · ${entrati.length} su ${righe.length} hanno effettuato l'accesso</p></div>
  <form class="in-linea" method="get" action="/ingressi">
    <a class="btn piccolo" href="/ingressi?data=${aggiungiGiorni(giorno, -1)}">← Giorno prima</a>
    <input type="date" name="data" value="${giorno}" aria-label="Giorno">
    <button class="btn piccolo">Vai</button>
    ${giorno !== oggi() ? `<a class="btn piccolo" href="/ingressi?data=${aggiungiGiorni(giorno, 1)}">Giorno dopo →</a><a class="btn piccolo" href="/ingressi">Oggi</a>` : ""}
  </form>
</div>
<section class="pannello">
  <table class="semplice">
    <thead><tr><th>Persona</th><th>Entrata</th><th>Uscita</th><th>Note</th></tr></thead>
    <tbody>${corpo}</tbody>
  </table>
  <p class="nota spazio-sopra">L'entrata è il primo accesso del giorno; l'uscita è l'ultima volta che si è premuto «Esci».
  Se qualcuno non esce, compare l'ultima attività. Il blocco dello schermo non conta come uscita.</p>
</section>`,
  });
}

module.exports = { paginaIngressi };
