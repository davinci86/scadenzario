// ─────────────────────────────────────────────────────────────
// FASCICOLI: la pagina "Dov'è il fascicolo?"
//   schedaFascicolo  un fascicolo con il suo stato e i pulsanti giusti
//                    per chi lo sta guardando (la usa anche la dashboard)
// I pulsanti sono piccoli moduli che inviano a POST /fascicoli/azione:
// è sempre il server a controllare se l'azione è permessa.
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { formattaMomento } = require("../dominio/date");
const { giorniFuori, link } = require("../db/fascicoli");
const config = require("../config");

const breve = (nome) => String(nome || "").replace(/^(Avv\.|Dott\.)\s*/, "");
const giorni = (g) => (g === 0 ? "da oggi" : `da ${g} ${g === 1 ? "giorno" : "giorni"}`);

// Lo stato a parole
// "limite": dopo quanti giorni fuori archivio l'etichetta diventa arancione (Impostazioni)
function statoFascicolo(f, limite = config.giorniFascicoloFuori) {
  if (!f) return `<span class="etichetta">Non registrato</span>`;
  if (f.stato === "archivio") return `<span class="etichetta ok">In archivio</span>`;
  if (f.stato === "consegna") return `<span class="etichetta attenzione">In consegna</span> da ${esc(breve(f.chi_nome))} a <b>${esc(breve(f.a_nome))}</b>, da confermare`;
  const g = giorniFuori(f);
  return `<span class="etichetta${g >= limite ? " attenzione" : ""}">In consultazione</span> da <b>${esc(f.chi_nome)}</b> · ${giorni(g)}`;
}

// Un pulsante = un piccolo modulo con il numero del fascicolo
function bottone(numero, azione, testo, { classe = "", cliente = "", torna, extra = "" } = {}) {
  return `<form method="post" action="/fascicoli/azione" class="in-linea" data-nome="Fascicolo ${esc(numero)}">
    <input type="hidden" name="numero" value="${esc(numero)}"><input type="hidden" name="azione" value="${azione}">
    <input type="hidden" name="cliente" value="${esc(cliente)}"><input type="hidden" name="torna" value="${esc(torna)}">
    ${extra}<button class="btn piccolo ${classe}">${testo}</button></form>`;
}

// I pulsanti giusti per chi guarda
function azioni(utente, f, numero, colleghi, { cliente, torna }) {
  const opzioni = colleghi.filter((c) => c.id !== utente.id)
    .map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  const scegli = (testo) => `<span>${testo}</span><select name="a" aria-label="Collega a cui consegnarlo">${opzioni}</select>`;
  const o = { cliente, torna };

  if (!f || f.stato === "archivio") {
    return bottone(numero, "prendo", "Lo prendo io dall'archivio", { ...o, classe: "pri" }) +
      bottone(numero, "consegno", "Conferma", { ...o, extra: scegli("oppure lo prendo e lo consegno a") });
  }
  if (f.stato === "consegna") {
    if (f.a_id === utente.id) {
      return bottone(numero, "ricevuto", "Confermo di averlo ricevuto", { ...o, classe: "pri" }) +
        bottone(numero, "non-ricevuto", "Non l'ho ricevuto", { ...o, classe: "pericolo" });
    }
    if (f.chi_id === utente.id) {
      return `<span class="nota">In attesa che ${esc(breve(f.a_nome))} confermi.</span>` + bottone(numero, "annulla", "Annulla la consegna", o);
    }
    return `<span class="nota">In consegna: deve confermare ${esc(f.a_nome)}.</span>`;
  }
  if (f.chi_id === utente.id) {
    return bottone(numero, "consegno", "Conferma", { ...o, extra: scegli("Lo consegno a") }) +
      bottone(numero, "archivio", "L'ho rimesso in archivio", { ...o, classe: "pri" });
  }
  return `<a class="btn piccolo" href="/segnalazioni/nuova?a=${f.chi_id}&fascicolo=${encodeURIComponent(numero)}" data-segnala>Chiedi a ${esc(breve(f.chi_nome))} il fascicolo</a>` +
    (utente.ruolo === "admin" ? bottone(numero, "archivio", "Segna come rimesso in archivio", o) : "");
}

function schedaFascicolo(utente, f, numero, colleghi, { movimenti = null, collegate = [], cliente = "", torna = "/fascicoli", limite } = {}) {
  return `
<article class="fascicolo">
  <header><b class="numero-fascicolo">Fascicolo ${esc(numero)}</b>${f?.cliente ? `<span>${esc(f.cliente)}</span>` : ""}</header>
  <div>${statoFascicolo(f, limite)}</div>
  ${collegate.length ? `<p class="nota">Scadenze collegate: ${collegate.map((s) =>
    `<a href="/scadenze/${s.id}" target="_blank" data-scadenza="${s.id}">N. ${s.id} · ${esc(s.cliente)}</a>`).join(", ")}</p>` : ""}
  <div class="azioni-fascicolo">${azioni(utente, f, numero, colleghi, { cliente, torna })}</div>
  ${movimenti ? `
  <details class="passaggi">
    <summary>Tutti i passaggi (${movimenti.length})</summary>
    <ol class="storico">${movimenti.map((m) =>
      `<li><time>${formattaMomento(m.quando)}</time><span><b>${esc(breve(m.nome) || "Sistema")}</b> · ${esc(m.testo)}</span></li>`).join("")}</ol>
  </details>` : ""}
</article>`;
}

function paginaFascicoli(utente, d) {
  const torna = `/fascicoli${d.q ? `?n=${encodeURIComponent(d.q)}` : ""}`;
  const limite = d.limite ?? config.giorniFascicoloFuori;
  const scheda = (f, extra = {}) => schedaFascicolo(utente, f, f.numero, d.colleghi, { torna, limite, ...extra });

  const risultati = d.q ? `
    ${d.esatto ? "" : `<p class="nota">Nessun fascicolo registrato con il numero «${esc(d.numero)}». Puoi registrarlo adesso con un movimento:</p>
      ${schedaFascicolo(utente, null, d.numero, d.colleghi, { cliente: d.cliente, torna })}`}
    ${d.risultati.map((f) => scheda(f, { movimenti: d.movimenti[f.numero], collegate: d.collegate[f.numero] })).join("")}`
    : `<p class="nota">Scrivi il numero come è sulla copertina per vedere dov'è il fascicolo o per registrare un movimento.</p>`;

  return layout({
    titolo: "Fascicoli",
    utente,
    attiva: "fascicoli",
    script: ["pannelli.js"],
    contenuto: `
<div class="testata-azioni"><div><h1>Fascicoli</h1>
  <p class="tenue">Chi ha in mano un fascicolo cartaceo, da quando, e tutti i passaggi.</p></div></div>
${d.fatto ? `<p class="avviso">${esc(d.fatto)}</p>` : ""}
${d.errore ? `<div class="errore" role="alert">${esc(d.errore)}</div>` : ""}
<div class="griglia">
  <div class="colonna-lavoro">
    <section class="pannello">
      <h2>Dov'è il fascicolo?</h2>
      <form method="get" action="/fascicoli" class="cerca-fascicolo">
        <input name="n" value="${esc(d.q)}" placeholder="Numero o cliente, es. 1234/2025" aria-label="Numero del fascicolo o cliente" autocomplete="off" autofocus>
        <input name="cliente" value="${esc(d.cliente)}" placeholder="Cliente (facoltativo, per i nuovi)" aria-label="Cliente">
        <button class="btn pri">Cerca</button>
      </form>
      <div class="pila spazio-sopra">${risultati}</div>
    </section>
    ${d.daConfermare.length ? `<section class="pannello"><h2>Da confermare</h2><div class="pila">${d.daConfermare.map((f) => scheda(f)).join("")}</div></section>` : ""}
    <section class="pannello"><h2>In mano a me</h2>
      ${d.inMano.length ? `<div class="pila">${d.inMano.map((f) => scheda(f)).join("")}</div>` : `<p class="nota">Non hai fascicoli fuori dall'archivio.</p>`}
    </section>
  </div>
  <aside class="colonna-destra">
    <section class="pannello"><h2>Fuori archivio in tutto lo studio</h2>
      ${d.fuori.length ? `<div class="elenco-fascicoli">${d.fuori.map((f) => {
        const g = giorniFuori(f);
        return `<a href="${link(f.numero)}"><span><b>${esc(f.numero)}</b>${f.cliente ? ` · ${esc(f.cliente)}` : ""}<br>
          <span class="nota">${f.stato === "consegna" ? `in consegna a ${esc(breve(f.a_nome))}` : esc(breve(f.chi_nome))}</span></span>
          <span class="etichetta${g >= limite ? " attenzione" : ""}">${g} gg</span></a>`;
      }).join("")}</div>` : `<p class="nota">Tutti i fascicoli registrati sono in archivio.</p>`}
      <p class="nota spazio-sopra">Dopo ${limite} giorni fuori dall'archivio chi ha il fascicolo riceve un promemoria.</p>
    </section>
  </aside>
</div>`,
  });
}

module.exports = { paginaFascicoli, schedaFascicolo };
