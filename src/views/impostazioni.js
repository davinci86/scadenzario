// ─────────────────────────────────────────────────────────────
// IMPOSTAZIONI (solo Admin): le pagine
//   Catalogo degli atti · un atto · Modifica dei termini
//   Festività e chiusure · Valori predefiniti
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { EVENTI } = require("../dominio/stati");
const { formatta, formattaMomento, oggi } = require("../dominio/date");
const { MOTIVI } = require("../db/catalogo");
const { VALORI } = require("../servizi/impostazioni");

const SCHEDE = [["", "Catalogo degli atti"], ["categorie", "Categorie e squadre"], ["festivita", "Festività e chiusure"], ["valori", "Valori predefiniti"]];
const TIPO = { scadenza: "Scadenza", adempimento: "Adempimento" };

function cornice(utente, { titolo, scheda = null, contenuto, fatto = "", errore = "" }) {
  return layout({
    titolo,
    utente,
    attiva: "impostazioni",
    script: ["impostazioni.js"],
    contenuto: `
${scheda === null ? "" : `<div class="testata-azioni"><div><h1>Impostazioni</h1>
  <p class="tenue">Visibili solo all'Admin. Ogni modifica finisce nel Registro.</p></div></div>
<nav class="schede" aria-label="Sezioni delle impostazioni">${SCHEDE.map(([v, nome]) =>
  `<a href="/admin/impostazioni${v ? `?scheda=${v}` : ""}"${scheda === v ? ' aria-current="page"' : ""}>${nome}</a>`).join("")}</nav>`}
${fatto ? `<p class="avviso">${esc(fatto)}</p>` : ""}
${errore ? `<div class="errore" role="alert">${esc(errore)}</div>` : ""}
${contenuto}`,
  });
}

const etichettaMotivo = (m) => (m === "creazione" ? "Creazione" : MOTIVI[m]?.nome ?? m);

// ── Il catalogo ──────────────────────────────────────────────
function paginaCatalogo(utente, { atti, fatto, errore }) {
  const materie = [...new Set(atti.map((a) => a.materia))];
  return cornice(utente, { titolo: "Impostazioni", scheda: "", fatto, errore, contenuto: `
<div class="testata-azioni">
  <p class="nota">Solo l'Admin modifica il catalogo; Editor e Collaboratori lo usano per inserire le scadenze.
  Se cambi come si calcola un termine, ti verrà chiesto il motivo e da quando applicarlo.</p>
  <a class="btn pri" href="/admin/impostazioni/atti/nuovo">+ Nuovo atto</a>
</div>
${materie.map((m) => `
<section class="pannello">
  <h2>${esc(m)}</h2>
  <table class="semplice catalogo">
    <thead><tr><th>Atto</th><th>Come si calcola</th><th>Promemoria</th><th>Stato</th><th></th></tr></thead>
    <tbody>${atti.filter((a) => a.materia === m).map((a) => `
      <tr${a.attivo ? "" : ' class="spento"'}>
        <td><b>${esc(a.nome)}</b><br><span class="nota">${TIPO[a.tipo]} · ${a.aperte} ${a.aperte === 1 ? "aperta" : "aperte"}</span></td>
        <td>${esc(a.regolaTesto)}</td>
        <td>${a.promemoria ? `${esc(a.promemoria.replaceAll(",", ", "))} gg prima` : `<span class="nota">solo il giorno prima</span>`}</td>
        <td>${a.attivo ? `<span class="etichetta ok">Attivo</span>` : `<span class="etichetta">Disattivato</span>`}</td>
        <td class="azioni-riga"><a class="btn piccolo" href="/admin/impostazioni/atti/${a.id}">Modifica</a></td>
      </tr>
      ${a.versioni.length ? `<tr class="riga-storico"><td colspan="5"><details><summary>Storico (${a.versioni.length})</summary>${storicoAtto(a.versioni)}</details></td></tr>` : ""}`).join("")}
    </tbody>
  </table>
</section>`).join("") || `<p class="nota">Il catalogo è vuoto: aggiungi il primo atto.</p>`}` });
}

function storicoAtto(versioni) {
  return `<div class="versioni">${versioni.map((v) => `
    <div><span class="nota">${formattaMomento(v.quando)}</span> · <b>${esc(v.autore || "Sistema")}</b> ·
      <span class="etichetta">${esc(etichettaMotivo(v.motivo))}</span>${v.norma ? ` · ${esc(v.norma)}` : ""}<br>
      ${esc(v.testo)}
      ${v.prima ? `<br><span class="nota">Da «${esc(v.prima)}» a «${esc(v.dopo)}»${v.modo ? ` · ${esc(v.modo)}` : ""}</span>`
        : v.dopo ? `<br><span class="nota">Regola: ${esc(v.dopo)}</span>` : ""}
    </div>`).join("")}</div>`;
}

// ── Un atto (nuovo o da modificare) ──────────────────────────
function paginaAtto(utente, atto, { valori, errori = [], materie = [] }) {
  const nuovo = !atto;
  const v = valori ?? (atto ? {
    nome: atto.nome, materia: atto.materia, tipo: atto.tipo, evento: atto.evento, direzione: atto.direzione, giorni: atto.giorni,
    feriale: atto.sospensione_feriale ? "1" : "", proroga: atto.sposta_giorno_utile ? "1" : "",
    promemoria: atto.promemoria.replaceAll(",", ", "), attivo: atto.attivo ? "1" : "",
  } : { tipo: "scadenza", evento: "notifica", direzione: "avanti", giorni: 30, feriale: "1", proroga: "1", promemoria: "7, 1", attivo: "1" });
  const sel = (opzioni, attuale) => Object.entries(opzioni).map(([k, nome]) =>
    `<option value="${k}"${String(attuale) === k ? " selected" : ""}>${esc(nome)}</option>`).join("");
  const spunta = (campo, testo) =>
    `<label class="radio"><input type="checkbox" name="${campo}" value="1"${v[campo] === "1" ? " checked" : ""}><span>${testo}</span></label>`;

  return cornice(utente, { titolo: nuovo ? "Nuovo atto" : `Atto · ${atto.nome}`, contenuto: `
<nav class="briciole"><a href="/admin/impostazioni"><span aria-hidden="true">←</span> Catalogo degli atti</a></nav>
<h1>${nuovo ? "Nuovo atto" : esc(atto.nome)}</h1>
<p class="tenue">${nuovo ? "Il nuovo atto sarà subito disponibile nell'inserimento delle scadenze."
  : `${atto.aperte} scadenze aperte usano questo atto. Se cambi il modo di calcolo ti verrà chiesto il motivo e da quando applicarlo.`}</p>
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/admin/impostazioni/atti${nuovo ? "" : `/${atto.id}`}" class="pannello modulo-grande" id="modulo-atto"
  data-nome="Atto del catalogo"${errori.length ? " data-non-salvato" : ""}>
  <div class="campo"><label for="nome">Nome dell'atto</label>
    <input id="nome" name="nome" value="${esc(v.nome ?? "")}" required maxlength="120" placeholder="Es. Ricorso avverso diniego"></div>
  <div class="due-colonne">
    <div class="campo"><label for="materia">Categoria</label>
      <select id="materia" name="materia" required>
        <option value="">Scegli la categoria…</option>
        ${materie.map((m) => `<option value="${esc(m)}"${v.materia === m ? " selected" : ""}>${esc(m)}</option>`).join("")}
      </select>
      <p class="nota">Per una categoria nuova: <a href="/admin/impostazioni?scheda=categorie">Categorie e squadre</a>.</p></div>
    <div class="campo"><label for="tipo">Tipo</label><select id="tipo" name="tipo">${sel(TIPO, v.tipo)}</select></div>
  </div>
  <fieldset class="campo riquadro-regola"><legend>Come si calcola il termine</legend>
    <div class="due-colonne">
      <div class="campo"><label for="evento">Decorre da</label><select id="evento" name="evento">${sel(EVENTI, v.evento)}</select></div>
      <div class="campo"><label for="direzione">Direzione del conteggio</label>
        <select id="direzione" name="direzione">${sel({ avanti: "In avanti (entro X giorni da…)", ritroso: "A ritroso (X giorni prima dell'udienza)" }, v.direzione)}</select>
        <p class="nota">A ritroso vale solo se decorre dall'udienza.</p></div>
    </div>
    <div class="campo"><label for="giorni">Giorni</label><input id="giorni" name="giorni" type="number" min="1" max="400" value="${esc(v.giorni ?? "")}" required class="numero-corto"></div>
    ${spunta("feriale", "Si applica la <b>sospensione feriale</b> (1–31 agosto)")}
    ${spunta("proroga", "Se cade di sabato, domenica o festivo <b>si sposta al primo giorno utile</b>")}
    <p class="anteprima-regola" id="anteprima-regola" aria-live="polite"></p>
  </fieldset>
  <div class="campo"><label for="promemoria">Promemoria (giorni prima, separati da virgola)</label>
    <input id="promemoria" name="promemoria" value="${esc(v.promemoria ?? "")}" placeholder="Es. 15, 7, 1">
    <p class="nota">Il giorno prima e l'avviso di scadenza superata ci sono sempre.</p></div>
  ${spunta("attivo", "<b>Atto attivo</b>. Disattivandolo non si cancella: resta nelle scadenze che lo usano e nello storico.")}
  <div class="azioni"><a class="btn" href="/admin/impostazioni">Annulla</a><button class="btn pri">${nuovo ? "Crea l'atto" : "Salva le modifiche"}</button></div>
</form>
${!nuovo && atto.versioni.length ? `<section class="pannello modulo-grande spazio-sopra"><h2>Storico dell'atto</h2>${storicoAtto(atto.versioni)}</section>` : ""}` });
}

// ── Modifica dei termini ─────────────────────────────────────
function paginaCambio(utente, atto, nuovo, { prima, dopo, interessate, valori = {}, errori = [] }) {
  const modo = valori.modo ?? "dal";
  const dal = valori.dal ?? oggi();
  const scelte = new Set([].concat(valori.scelte ?? interessate.map((s) => String(s.id))).map(String));
  const auto = interessate.filter((s) => !s.manuale);
  const manuali = interessate.filter((s) => s.manuale);
  const effetto = (s) => s.delta === 0 ? `<span class="nota">stessa data</span>`
    : s.delta < 0 ? `<span class="anticipata">anticipata di ${-s.delta} gg</span>` : `<span class="posticipata">posticipata di ${s.delta} gg</span>`;
  const nascosti = ["evento", "direzione", "giorni", "sospensione_feriale", "sposta_giorno_utile"]
    .map((c) => `<input type="hidden" name="${c}" value="${esc(nuovo[c])}">`).join("");

  return cornice(utente, { titolo: "Modifica dei termini", contenuto: `
<nav class="briciole"><a href="/admin/impostazioni/atti/${atto.id}"><span aria-hidden="true">←</span> ${esc(atto.nome)}</a></nav>
<h1>Modifica dei termini</h1>
<p class="tenue">${esc(atto.nome)} · categoria ${esc(atto.materia)}</p>
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/admin/impostazioni/atti/${atto.id}/cambio" class="pannello modulo-cambio" id="modulo-cambio" data-nome="Modifica dei termini"
  data-oggi="${oggi()}"${errori.length ? " data-non-salvato" : ""}>
  ${nascosti}
  <div class="confronto"><div><span class="nota">Prima</span><br>${esc(prima)}</div><span aria-hidden="true">→</span>
    <div class="dopo"><span class="nota">Dopo</span><br><b>${esc(dopo)}</b></div></div>

  <div class="passo"><h3>1 · Perché cambia</h3>
    <div class="radios">${Object.entries(MOTIVI).map(([k, m]) =>
      `<label class="radio"><input type="radio" name="motivo" value="${k}"${valori.motivo === k ? " checked" : ""} required><span><b>${m.nome}</b> ${m.spiega}</span></label>`).join("")}</div>
    <div class="campo"><label for="norma">Riferimento normativo <span class="facoltativo">(obbligatorio per le modifiche normative)</span></label>
      <input id="norma" name="norma" value="${esc(valori.norma ?? "")}" maxlength="300" placeholder="Es. art. … del d.lgs. … / legge n. … del …"></div>
    <div class="campo"><label for="testo">Spiegazione</label>
      <textarea id="testo" name="testo" rows="3" required minlength="10" maxlength="2000" placeholder="Cosa cambia e perché, in poche parole. Resterà nello storico dell'atto e delle scadenze.">${esc(valori.testo ?? "")}</textarea></div>
  </div>

  <div class="passo"><h3>2 · Da quando vale</h3>
    <div class="radios">
      <label class="radio"><input type="radio" name="modo" value="retro"${modo === "retro" ? " checked" : ""}><span><b>Su tutte le scadenze aperte (retroattiva)</b> Ricalcola tutte le scadenze non ancora chiuse di questo atto.</span></label>
      <label class="radio"><input type="radio" name="modo" value="dal"${modo === "dal" ? " checked" : ""}><span><b>Per gli eventi dal giorno</b>
        <input type="date" name="dal" value="${esc(dal)}" aria-label="Data da cui vale" class="data-in-linea">
        Vale per le scadenze nuove e per quelle aperte con la decorrenza da quella data in poi. Con la data di oggi, vale solo per il futuro.</span></label>
      <label class="radio"><input type="radio" name="modo" value="scelta"${modo === "scelta" ? " checked" : ""}><span><b>Scelgo io una per una</b> Spunta nell'anteprima le scadenze da ricalcolare.</span></label>
    </div>
  </div>

  <div class="passo"><h3>3 · Anteprima</h3>
    ${auto.length ? `
    <p id="riepilogo-cambio" class="riepilogo-cambio">${auto.length} scadenze aperte usano questo atto.</p>
    <table class="semplice anteprima-cambio">
      <thead><tr><th></th><th>Scadenza</th><th>Decorrenza</th><th>Adesso</th><th>Dopo</th><th>Effetto</th></tr></thead>
      <tbody>${auto.map((s) => `
        <tr data-evento="${s.data_evento}" data-delta="${s.delta}" data-nuova="${s.nuova}">
          <td><input type="checkbox" name="scelte" value="${s.id}"${scelte.has(String(s.id)) ? " checked" : ""} aria-label="Ricalcola N. ${s.id}"></td>
          <td><b>N. ${s.id} · ${esc(s.cliente)}</b><br><span class="nota">${esc(s.attivita)}</span></td>
          <td>${formatta(s.data_evento)}</td><td>${formatta(s.data)}</td><td><b>${formatta(s.nuova)}</b></td>
          <td class="effetto">${effetto(s)}</td></tr>`).join("")}
      </tbody>
    </table>` : `<p class="nota">Nessuna scadenza aperta usa questo atto: la modifica vale per quelle che verranno inserite.</p>`}
    ${manuali.length ? `<p class="avviso spazio-sopra"><b>Corrette a mano, non vengono toccate:</b> ${manuali.map((s) =>
      `N. ${s.id} · ${esc(s.cliente)} (scade ${formatta(s.data)}; con la nuova regola sarebbe ${formatta(s.nuova)})`).join("; ")}. Se serve, ricalcolale dal loro dettaglio.</p>` : ""}
    <p class="nota spazio-sopra">Prima di applicare viene fatto un backup. Chi si occupa delle scadenze che cambiano data riceve una notifica.</p>
  </div>
  <div class="azioni"><a class="btn" href="/admin/impostazioni/atti/${atto.id}">Annulla</a><button class="btn pri">Applica la modifica</button></div>
</form>` });
}

// ── Categorie e squadre ──────────────────────────────────────
// Per ogni categoria (materia) la squadra che si propone da sola
// quando si inserisce una scadenza di quella categoria.
function paginaCategorie(utente, { categorie, persone, fatto, errore }) {
  return cornice(utente, { titolo: "Impostazioni", scheda: "categorie", fatto, errore, contenuto: `
<p class="nota">Quando si inserisce una scadenza, la squadra della sua categoria si spunta da sola nel modulo: chi inserisce
  può cambiarla prima di salvare, e dopo Admin ed Editor la cambiano a mano come sempre. Una modifica qui vale per le
  scadenze <b>nuove</b>. Ogni atto del catalogo appartiene a una categoria.</p>
<form method="post" action="/admin/impostazioni/categorie/nuova" class="in-linea spazio-sopra" data-nome="Nuova categoria">
  <input name="nome" required minlength="2" maxlength="60" placeholder="Nome della nuova categoria, es. Lavoro" aria-label="Nome della nuova categoria" class="campo-categoria">
  <button class="btn piccolo pri">+ Nuova categoria</button>
</form>
${categorie.length ? `<div class="griglia-categorie">${categorie.map((c) => `
<section class="pannello">
  <h2>${esc(c.materia)}</h2>
  <p class="nota">${c.atti} ${c.atti === 1 ? "atto" : "atti"} nel catalogo${c.utenti.length ? "" : " · <b>nessuna squadra</b>: le nuove scadenze restano da assegnare"}</p>
  <details class="gestione-categoria">
    <summary>Rinomina o elimina</summary>
    <form method="post" action="/admin/impostazioni/categorie/rinomina" class="in-linea" data-nome="Rinomina ${esc(c.materia)}">
      <input type="hidden" name="nome" value="${esc(c.materia)}">
      <input name="nuovo" value="${esc(c.materia)}" required minlength="2" maxlength="60" aria-label="Nuovo nome">
      <button class="btn piccolo">Rinomina</button>
    </form>
    <p><a class="btn piccolo pericolo" href="/admin/impostazioni/categorie/elimina?nome=${encodeURIComponent(c.materia)}">Elimina la categoria…</a></p>
  </details>
  <form method="post" action="/admin/impostazioni/categorie" class="modulo" data-nome="Squadra della categoria ${esc(c.materia)}">
    <input type="hidden" name="materia" value="${esc(c.materia)}">
    <div class="persone-categoria">${persone.map((p) => `
      <div class="persona">
        <label class="spunta"><input type="checkbox" name="squadra" value="${p.id}"${c.utenti.includes(p.id) ? " checked" : ""}> ${esc(p.nome)}</label>
        <label class="spunta tenue"><input type="radio" name="referente" value="${p.id}"${c.referente === p.id ? " checked" : ""}> ★ referente</label>
      </div>`).join("")}
    </div>
    <button class="btn piccolo pri">Salva</button>
  </form>
  ${c.daAssegnare && c.utenti.length ? `
  <form method="post" action="/admin/impostazioni/categorie/assegna" class="spazio-sopra">
    <input type="hidden" name="materia" value="${esc(c.materia)}">
    <p class="avviso">${c.daAssegnare} ${c.daAssegnare === 1 ? "scadenza aperta" : "scadenze aperte"} di questa categoria ${c.daAssegnare === 1 ? "è" : "sono"} ancora da assegnare.
      <button class="btn piccolo">Assegnale a questa squadra</button></p>
  </form>` : ""}
</section>`).join("")}</div>` : `<p class="nota">Nessuna categoria: aggiungi prima degli atti al catalogo.</p>`}` });
}

// ── Eliminare una categoria: conferma, con la destinazione ──
function paginaEliminaCategoria(utente, nome, { contenuto: c, altre, errori = [] }) {
  const vuota = !c.atti && !c.scadenze;
  return cornice(utente, { titolo: "Elimina categoria", contenuto: `
<nav class="briciole"><a href="/admin/impostazioni?scheda=categorie"><span aria-hidden="true">←</span> Categorie e squadre</a></nav>
<h1>Elimina la categoria «${esc(nome)}»</h1>
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<form method="post" action="/admin/impostazioni/categorie/elimina" class="pannello modulo-grande zona-pericolo" data-nome="Elimina categoria">
  <input type="hidden" name="nome" value="${esc(nome)}">
  <ul class="semplice">
    <li><b>${c.atti}</b> ${c.atti === 1 ? "atto del catalogo" : "atti del catalogo"} e <b>${c.scadenze}</b> ${c.scadenze === 1 ? "scadenza" : "scadenze"}
      (${c.aperte === 1 ? "1 aperta" : `${c.aperte} aperte`}) fanno parte di questa categoria.</li>
    ${c.squadra ? `<li>La sua squadra predefinita (${c.squadra} ${c.squadra === 1 ? "persona" : "persone"}) viene tolta: per le nuove scadenze varrà quella della categoria di destinazione.</li>` : ""}
    <li>Le squadre già assegnate alle scadenze <b>non cambiano</b>.</li>
  </ul>
  ${vuota ? `<p class="nota">La categoria è vuota: si può eliminare senza spostare niente.</p>` : altre.length ? `
  <div class="campo"><label for="destinazione">In quale categoria spostare atti e scadenze?</label>
    <select id="destinazione" name="destinazione" required>
      <option value="">Scegli la categoria…</option>
      ${altre.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("")}
    </select>
    <p class="nota">Ogni scadenza spostata avrà una riga nel suo storico.</p></div>` : `
  <p class="avviso">Non c'è un'altra categoria in cui spostare atti e scadenze: <a href="/admin/impostazioni?scheda=categorie">creane prima una</a>.</p>`}
  ${vuota || altre.length ? `
  <label class="radio"><input type="checkbox" name="conferma" value="1" required><span>Confermo: elimina la categoria <b>${esc(nome)}</b></span></label>
  <div class="azioni"><a class="btn" href="/admin/impostazioni?scheda=categorie">Annulla</a><button class="btn pericolo">Elimina la categoria</button></div>` : ""}
</form>` });
}

// ── Festività e chiusure ─────────────────────────────────────
function paginaFestivita(utente, { chiusure, inChiusura, feste, fatto, errore }) {
  return cornice(utente, { titolo: "Impostazioni", scheda: "festivita", fatto, errore, contenuto: `
${inChiusura.length ? `<div class="avviso"><b>Da controllare:</b> queste scadenze aperte cadono in un giorno di chiusura. Aprile e, se serve, ricalcolale o correggile:
  <ul class="semplice">${inChiusura.map((s) => `<li><a href="/scadenze/${s.id}" target="_blank" data-scadenza="${s.id}">N. ${s.id} · ${esc(s.cliente)}</a> · ${formatta(s.data)} (${esc(s.motivo)})</li>`).join("")}</ul></div>` : ""}
<div class="griglia">
  <div class="colonna-lavoro">
    <section class="pannello">
      <h2>Chiusure aggiunte dallo studio</h2>
      <p class="nota">Ad esempio un ufficio giudiziario chiuso o un ponte. Queste date spostano i termini al primo giorno utile
        nei calcoli fatti da qui in poi.</p>
      ${chiusure.length ? `<table class="semplice"><tbody>${chiusure.map((c) => `
        <tr><td>${formatta(c.data)}</td><td>${esc(c.motivo)}</td>
          <td class="azioni-riga"><form method="post" action="/admin/impostazioni/chiusure/togli"><input type="hidden" name="data" value="${c.data}"><button class="btn piccolo pericolo">Togli</button></form></td></tr>`).join("")}
      </tbody></table>` : `<p class="nota">Nessuna chiusura aggiunta.</p>`}
      <form method="post" action="/admin/impostazioni/chiusure" class="in-linea spazio-sopra" data-nome="Nuova chiusura">
        <input type="date" name="data" required aria-label="Data">
        <input name="motivo" maxlength="100" placeholder="Motivo, es. Ponte dell'Immacolata" aria-label="Motivo">
        <button class="btn piccolo pri">Aggiungi</button>
      </form>
    </section>
  </div>
  <aside class="colonna-destra">
    <section class="pannello">
      <h2>Festività</h2>
      <p class="nota">Calcolate in automatico ogni anno.</p>
      <table class="semplice"><tbody>${feste.map(([data, nome]) => `<tr><td>${esc(data)}</td><td>${esc(nome)}</td></tr>`).join("")}</tbody></table>
    </section>
  </aside>
</div>` });
}

// ── Valori predefiniti ───────────────────────────────────────
function paginaValori(utente, { imp, fatto, errore }) {
  const campo = (k, tipo = "text", nota = "") => `
  <div class="campo"><label for="${k}">${VALORI[k].nome}</label>
    <input id="${k}" name="${k}" ${tipo === "number" ? `type="number" min="1" max="365" class="numero-corto"` : ""} value="${esc([].concat(imp[k]).join(", "))}" required>
    ${nota ? `<p class="nota">${nota}</p>` : ""}</div>`;
  return cornice(utente, { titolo: "Impostazioni", scheda: "valori", fatto, errore, contenuto: `
<form method="post" action="/admin/impostazioni/valori" class="pannello modulo-grande" data-nome="Valori predefiniti">
  ${campo("promemoriaPredefiniti", "text", "Separati da virgola, es. 7, 1. Gli atti del catalogo hanno i loro promemoria.")}
  ${campo("promemoriaUdienzeOre", "text", "Es. 48, 24.")}
  ${campo("terminiAltro", "text", "Le scelte proposte quando si inserisce un atto che non è nel catalogo.")}
  ${campo("giorniFascicoloFuori", "number")}
  <p class="nota">Il giorno prima e l'avviso di scadenza superata restano sempre attivi.</p>
  <div class="azioni"><button class="btn pri">Salva</button></div>
</form>` });
}

module.exports = { paginaCatalogo, paginaAtto, paginaCambio, paginaCategorie, paginaEliminaCategoria, paginaFestivita, paginaValori };
