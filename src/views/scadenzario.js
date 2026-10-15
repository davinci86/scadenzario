// ─────────────────────────────────────────────────────────────
// LA TABELLA STILE WORD
// Il "foglio" bianco con la tabella a bordi neri, ordinata per data.
// Il colore della riga viene dallo stato (come l'evidenziatore su Word).
// Sopra il foglio: ricerca, filtri e legenda.
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { TIPI, STATI, coloreDi, tuttiGliStati } = require("../dominio/stati");
const { formatta, formattaEsteso, oggi } = require("../dominio/date");
const { puoModificare } = require("../auth/regole");
const { mancano, squadraBreve, campione } = require("./scadenze-comuni");

const opzione = (valore, testo, scelto) =>
  `<option value="${esc(valore)}"${String(valore) === String(scelto) ? " selected" : ""}>${esc(testo)}</option>`;

function paginaScadenzario(utente, righe, filtri, utenti) {
  const strumenti = `
<form class="strumenti" method="get" action="/scadenzario" id="filtri">
  <input type="search" name="q" value="${esc(filtri.q)}" placeholder="Cerca cliente, attività, ufficio, fascicolo…" aria-label="Cerca">
  <select name="tipo" aria-label="Tipo">${opzione("", "Tutti i tipi", filtri.tipo)}${Object.entries(TIPI).map(([k, v]) => opzione(k, v, filtri.tipo)).join("")}</select>
  <select name="stato" aria-label="Stato">${opzione("", "Tutti gli stati", filtri.stato)}${tuttiGliStati().map((st) => opzione(st, st, filtri.stato)).join("")}</select>
  <select name="persona" aria-label="Persona">${opzione("", "Tutte le persone", filtri.persona)}${opzione("nessuno", "Da assegnare", filtri.persona)}${utenti.map((u) => opzione(u.id, u.nome, filtri.persona)).join("")}</select>
  <label class="spunta"><input type="checkbox" name="chiuse" value="1"${filtri.chiuse ? " checked" : ""}> Mostra anche le chiuse</label>
  <button class="btn" type="submit">Filtra</button>
  ${puoModificare(utente) ? `<a class="btn pri" href="/scadenze/nuova">+ Nuova scadenza</a>` : ""}
</form>`;

  const legenda = `<div class="legenda">${STATI.scadenza.concat([["Rinviata", "grigio"]])
    .map(([stato]) => `<span>${campione(stato)}${esc(stato)}</span>`).join("")}<span>✎ data corretta a mano</span></div>`;

  const corpo = righe.length
    ? righe.map((s) => `
      <tr class="ev-${coloreDi(s.stato)}" data-href="/scadenze/${s.id}">
        <td class="centro"><a href="/scadenze/${s.id}">${s.id}</a></td>
        <td><a class="cliente" href="/scadenze/${s.id}">${esc(s.cliente)}</a></td>
        <td>${esc(s.attivita)}<span class="tipo">${TIPI[s.tipo].toLowerCase()}${s.ufficio ? " · " + esc(s.ufficio) : ""}${s.fascicolo ? " · fasc. " + esc(s.fascicolo) : ""}</span></td>
        <td>${s.data_evento ? formatta(s.data_evento) : `<span class="tenue">—</span>`}</td>
        <td>${formatta(s.data)}${s.correzione_manuale ? ` <span title="Data corretta a mano">✎</span>` : ""}${s.ora ? `<br>ore ${esc(s.ora)}` : ""}${s.da_verificare ? `<br><span class="etichetta attenzione">da verificare</span>` : ""}</td>
        <td class="interfaccia">${mancano(s)}</td>
        <td>${squadraBreve(s)}</td>
        <td>${esc(s.stato)}</td>
      </tr>`).join("")
    : `<tr><td colspan="8" class="vuota">Nessuna riga corrisponde ai filtri.</td></tr>`;

  return layout({
    titolo: "Scadenzario",
    utente,
    attiva: "scadenzario",
    script: ["scadenzario.js"],
    contenuto: `${strumenti}${legenda}
<div class="foglio-contenitore">
  <div class="foglio">
    <div class="intestazione"><h2>SCADENZARIO</h2><div>aggiornato a ${formattaEsteso(oggi()).toLowerCase()}</div></div>
    <table class="word">
      <thead><tr><th class="c-n">N.</th><th>Cliente</th><th>Attività da svolgere</th><th class="c-data">Decorrenza</th>
        <th class="c-data">Entro il</th><th class="c-mancano">Mancano</th><th class="c-chi">Chi se ne occupa</th><th class="c-stato">Stato</th></tr></thead>
      <tbody>${corpo}</tbody>
    </table>
  </div>
</div>`,
  });
}

module.exports = { paginaScadenzario };
