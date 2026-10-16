// ─────────────────────────────────────────────────────────────
// BACKUP: le pagine (solo Admin)
//   paginaBackup      stato, "Fai un backup adesso", elenco, per quanto tenerli
//   paginaRipristino  conferma, con il confronto tra oggi e il backup
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { TIPI } = require("../servizi/backup");

const quando = (d) => d.toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const peso = (byte) => byte == null ? "—" : byte < 1024 * 1024 ? `${Math.max(1, Math.round(byte / 1024))} KB` : `${(byte / 1024 / 1024).toFixed(1)} MB`;

const FILTRI = [["", "Tutti"], ["giornaliero", "Giornalieri"], ["mensile", "Mensili"], ["auto", "Automatici"], ["altri", "Manuali e prima dei ripristini"]];

function paginaBackup(utente, d) {
  const ultimo = d.elenco[0];
  const nas = !d.cartellaNas
    ? `<span class="etichetta">Non configurata</span> <span class="nota">Le copie restano solo sul server. Si imposta con la messa in servizio.</span>`
    : d.stato.nas.ok === false
      ? `<span class="etichetta errore-etichetta">Non riuscita</span> ${esc(d.stato.nas.errore)}`
      : d.stato.nas.ok ? `<span class="etichetta ok">Funziona</span> <span class="nota">ultima copia ${quando(new Date(d.stato.nas.quando))}</span>`
      : `<span class="etichetta">In attesa</span> <span class="nota">al prossimo backup</span>`;

  const filtrati = d.elenco.filter((b) => !d.filtro ? true : d.filtro === "altri" ? ["manuale", "prima-del-ripristino"].includes(b.tipo) : b.tipo === d.filtro);

  return layout({
    titolo: "Backup",
    utente,
    attiva: "backup",
    contenuto: `
<div class="testata-azioni">
  <div><h1>Backup</h1><p class="tenue">Copie di sicurezza di tutti i dati. Si fanno da sole; puoi farne una anche adesso.</p></div>
  <form method="post" action="/admin/backup"><button class="btn pri">Fai un backup adesso</button></form>
</div>
${d.fatto ? `<p class="avviso">${esc(d.fatto)}</p>` : ""}
${d.errore ? `<div class="errore" role="alert">${esc(d.errore)}</div>` : ""}
${d.stato.errore ? `<div class="errore" role="alert"><b>L'ultimo backup automatico non è riuscito.</b> ${esc(d.stato.errore)}</div>` : ""}

<div class="griglia">
  <div class="colonna-lavoro">
    <section class="pannello">
      <h2>I backup</h2>
      <nav class="schede" aria-label="Quali backup">${FILTRI.map(([v, nome]) =>
        `<a href="/admin/backup${v ? `?tipo=${v}` : ""}"${d.filtro === v ? ' aria-current="page"' : ""}>${nome}</a>`).join("")}</nav>
      ${filtrati.length ? `
      <table class="semplice">
        <thead><tr><th>Quando</th><th>Tipo</th><th>Dimensione</th><th>NAS</th><th></th></tr></thead>
        <tbody>${filtrati.slice(0, 200).map((b) => `<tr>
          <td>${quando(b.quando)}</td><td>${TIPI[b.tipo]}</td><td>${peso(b.dimensione)}</td>
          <td>${d.cartellaNas ? (b.sulNas ? "✓" : `<span class="nota">no</span>`) : `<span class="nota">—</span>`}</td>
          <td><a class="btn piccolo" href="/admin/backup/ripristina?nome=${encodeURIComponent(b.nome)}">Ripristina…</a></td></tr>`).join("")}
        </tbody>
      </table>
      ${filtrati.length > 200 ? `<p class="nota spazio-sopra">Mostrati i 200 più recenti di ${filtrati.length}.</p>` : ""}`
      : `<p class="nota">Nessun backup di questo tipo.</p>`}
    </section>
  </div>
  <aside class="colonna-destra">
    <section class="pannello">
      <h2>Stato</h2>
      <dl class="dati">
        <dt>Ultimo backup</dt><dd>${ultimo ? `${quando(ultimo.quando)} <span class="nota">· ${TIPI[ultimo.tipo]}</span>` : "Nessuno ancora"}</dd>
        <dt>Sul server</dt><dd>${d.elenco.length} file · ${peso(d.spazio.server)}<br><span class="nota">${esc(d.cartella)}</span></dd>
        <dt>Copia sul NAS</dt><dd>${nas}${d.cartellaNas ? `<br><span class="nota">${esc(d.cartellaNas)} · ${peso(d.spazio.nas)}</span>` : ""}</dd>
      </dl>
    </section>
    <section class="pannello">
      <h2>Per quanto tenerli</h2>
      <form method="post" action="/admin/backup/durata" class="modulo" data-nome="Durata dei backup">
        ${Object.entries(TIPI).map(([tipo, nome]) => `
        <label for="durata-${tipo}">${nome}</label>
        <div class="in-linea"><input id="durata-${tipo}" name="${tipo}" type="number" min="${tipo === "auto" ? 1 : 0}" max="36500" value="${d.durata[tipo]}" required class="numero-corto"> <span class="nota">giorni${tipo === "auto" ? "" : " · 0 = per sempre"}</span></div>`).join("")}
        <p class="nota">Un backup compresso pesa pochissimo: un anno di lavoro dello studio sta in circa 0,2 MB.</p>
        <button class="btn piccolo">Salva</button>
      </form>
    </section>
    <section class="pannello">
      <h2>Come funziona</h2>
      <p class="nota">Un backup <b>automatico</b> entro 10 minuti da ogni modifica, uno <b>giornaliero</b> ogni sera e uno <b>mensile</b>. Ogni copia viene controllata e compressa, e se è configurato va anche sul NAS.</p>
      <p class="nota spazio-sopra">Il <b>ripristino</b> riporta tutti i dati al momento del backup, tranne il Registro. Prima di ripristinare viene sempre salvata una copia di com'è adesso, quindi si può tornare indietro.</p>
    </section>
  </aside>
</div>`,
  });
}

function paginaRipristino(utente, b, oggi, nelBackup) {
  const righe = [
    ["Scadenze aperte", "scadenzeAperte"], ["Scadenze in tutto", "scadenze"], ["Utenti attivi", "utenti"],
    ["Segnalazioni", "segnalazioni"], ["Fascicoli registrati", "fascicoli"],
  ];
  const cella = (v) => (v == null ? "—" : v);
  return layout({
    titolo: "Ripristina un backup",
    utente,
    attiva: "backup",
    contenuto: `
<nav class="briciole"><a href="/admin/backup"><span aria-hidden="true">←</span> Backup</a></nav>
<h1>Ripristina il backup del ${quando(b.quando)}</h1>
<div class="griglia">
  <div class="colonna-lavoro">
    <section class="pannello zona-pericolo">
      <h2>Cosa succede</h2>
      <ul class="semplice">
        <li>Scadenze, squadre, storico, utenti, catalogo, notifiche, segnalazioni e fascicoli <b>tornano com'erano il ${quando(b.quando)}</b>. Quello che è stato fatto dopo non ci sarà più.</li>
        <li><b>Prima</b> viene salvata una copia di com'è adesso: se ti accorgi di un errore, puoi ripristinare quella.</li>
        <li>Il <b>Registro</b>, le presenze e le email già partite <b>non cambiano</b>: il ripristino stesso finisce nel Registro.</li>
        <li>Tutti gli altri utenti collegati dovranno <b>rientrare</b> con la loro password.</li>
      </ul>
      <form method="post" action="/admin/backup/ripristina" class="modulo spazio-sopra" data-nome="Ripristino">
        <input type="hidden" name="nome" value="${esc(b.nome)}">
        <label class="radio"><input type="checkbox" name="conferma" value="1" required><span>Ho capito: ripristina il backup del <b>${quando(b.quando)}</b></span></label>
        <div><button class="btn pericolo">Ripristina questo backup</button> <a class="btn" href="/admin/backup">Annulla</a></div>
      </form>
    </section>
  </div>
  <aside class="colonna-destra">
    <section class="pannello">
      <h2>Oggi e nel backup</h2>
      <table class="semplice">
        <thead><tr><th></th><th>Oggi</th><th>Nel backup</th></tr></thead>
        <tbody>${righe.map(([nome, k]) => `<tr><td>${nome}</td><td>${cella(oggi[k])}</td>
          <td${nelBackup && oggi[k] !== nelBackup[k] ? ' class="diverso"' : ""}>${cella(nelBackup?.[k])}</td></tr>`).join("")}</tbody>
      </table>
      <p class="nota spazio-sopra">In evidenza i numeri che cambierebbero.</p>
    </section>
  </aside>
</div>`,
  });
}

module.exports = { paginaBackup, paginaRipristino };
