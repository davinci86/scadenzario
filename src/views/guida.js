// ─────────────────────────────────────────────────────────────
// LA GUIDA: le pagine
//   paginaIndice     ricerca, manuale (secondo il ruolo), procedure dello studio
//   paginaLettura    una pagina, con l'elenco delle altre a lato
//   paginaModifica   l'Admin scrive o corregge una procedura dello studio
// ─────────────────────────────────────────────────────────────
const { esc, layout } = require("./html");
const { testoInHtml } = require("../servizi/testo");
const { formattaMomento } = require("../dominio/date");

const cerca = (q = "") => `
<form method="get" action="/guida" class="cerca-guida" role="search">
  <input name="q" value="${esc(q)}" placeholder="Cerca nella guida, es. «referente», «backup», «fascicolo»" aria-label="Cerca nella guida">
  <button class="btn pri">Cerca</button>
</form>`;

function paginaIndice(utente, { manuale, procedure, q, risultati }) {
  const admin = utente.ruolo === "admin";
  return layout({
    titolo: "Guida",
    utente,
    attiva: "guida",
    contenuto: `
<div class="testata-azioni"><div><h1>Guida</h1>
  <p class="tenue">Come funziona lo Scadenzario e come lavora lo studio. Sempre qui, da qualunque pagina.</p></div>
  <a class="btn" href="/?tutorial=1">Rivedi il tutorial</a></div>
${cerca(q)}
${q ? `<section class="pannello spazio-sopra"><h2>Risultati per «${esc(q)}»</h2>
  ${risultati.length ? `<ul class="risultati-guida">${risultati.map((r) => `
    <li><a href="${r.link}"><b>${esc(r.titolo)}</b></a> <span class="etichetta">${r.tipo === "studio" ? "Procedure dello studio" : "Manuale"}</span>
      <p class="nota">${esc(r.estratto)}</p></li>`).join("")}</ul>`
    : `<p class="nota">Nessun risultato. Prova con un'altra parola.</p>`}
</section>` : ""}
<div class="griglia-guida spazio-sopra">
  <section class="pannello">
    <h2>Come funziona lo Scadenzario</h2>
    <ol class="indice-guida">${manuale.map((p) => `<li><a href="/guida/${p.slug}">${esc(p.titolo)}</a>${
      p.ruoli.includes("tutti") ? "" : ` <span class="etichetta">${p.ruoli.includes("editor") ? "Admin ed Editor" : "Solo Admin"}</span>`}</li>`).join("")}</ol>
  </section>
  <section class="pannello">
    <h2>Procedure dello studio</h2>
    <p class="nota">Istruzioni operative scritte dallo studio: come si lavora, a chi rivolgersi, le abitudini di casa.</p>
    ${procedure.length ? `<ul class="indice-guida">${procedure.map((p) => `<li><a href="/guida/studio/${p.id}">${esc(p.titolo)}</a></li>`).join("")}</ul>`
      : `<p class="nota">${admin ? "Ancora nessuna pagina: scrivi la prima." : "Ancora nessuna pagina."}</p>`}
    ${admin ? `<p class="spazio-sopra"><a class="btn piccolo pri" href="/guida/studio/nuova">+ Nuova pagina</a></p>` : ""}
  </section>
</div>`,
  });
}

function paginaLettura(utente, { titolo, testo, altre, studio = null }) {
  const admin = utente.ruolo === "admin";
  return layout({
    titolo,
    utente,
    attiva: "guida",
    contenuto: `
<nav class="briciole"><a href="/guida"><span aria-hidden="true">←</span> Guida</a></nav>
<div class="griglia">
  <article class="colonna-lavoro pannello testo-guida">
    <h1>${esc(titolo)}</h1>
    ${studio ? `<p class="nota">Procedure dello studio · aggiornata il ${formattaMomento(studio.modificata)}${studio.autore ? ` da ${esc(studio.autore)}` : ""}</p>` : ""}
    ${testoInHtml(testo)}
    ${studio && admin ? `<p class="azioni-guida"><a class="btn piccolo" href="/guida/studio/${studio.id}/modifica">Modifica</a></p>` : ""}
  </article>
  <aside class="colonna-destra">
    ${cerca()}
    <section class="pannello spazio-sopra"><h2>Altre pagine</h2>
      <ul class="indice-guida">${altre.map((p) => `<li><a href="${p.link}"${p.attuale ? ' aria-current="page"' : ""}>${esc(p.titolo)}</a></li>`).join("")}</ul>
    </section>
  </aside>
</div>`,
  });
}

function paginaModifica(utente, pagina, { valori, errori = [] } = {}) {
  const v = valori ?? pagina ?? {};
  const nuova = !pagina;
  return layout({
    titolo: nuova ? "Nuova pagina della guida" : `Modifica · ${pagina.titolo}`,
    utente,
    attiva: "guida",
    contenuto: `
<nav class="briciole"><a href="${nuova ? "/guida" : `/guida/studio/${pagina.id}`}"><span aria-hidden="true">←</span> ${nuova ? "Guida" : esc(pagina.titolo)}</a></nav>
<h1>${nuova ? "Nuova pagina · Procedure dello studio" : "Modifica la pagina"}</h1>
${errori.length ? `<div class="errore" role="alert">${errori.map(esc).join(" ")}</div>` : ""}
<div class="griglia">
  <form method="post" action="${nuova ? "/guida/studio" : `/guida/studio/${pagina.id}`}" class="colonna-lavoro pannello modulo-grande" data-nome="Pagina della guida"${errori.length ? " data-non-salvato" : ""}>
    <div class="campo"><label for="titolo">Titolo</label>
      <input id="titolo" name="titolo" value="${esc(v.titolo ?? "")}" required maxlength="120" placeholder="Es. Come depositiamo un ricorso"></div>
    <div class="campo"><label for="testo">Testo</label>
      <textarea id="testo" name="testo" rows="18" required class="testo-lungo">${esc(v.testo ?? "")}</textarea></div>
    <div class="campo"><label for="ordine">Posizione nell'elenco <span class="facoltativo">(i numeri più bassi vanno prima)</span></label>
      <input id="ordine" name="ordine" type="number" value="${esc(v.ordine ?? 0)}" class="numero-corto"></div>
    <div class="azioni"><a class="btn" href="${nuova ? "/guida" : `/guida/studio/${pagina.id}`}">Annulla</a><button class="btn pri">Salva</button></div>
  </form>
  <aside class="colonna-destra">
    <section class="pannello"><h2>Come si scrive</h2>
      <ul class="semplice nota">
        <li><code># Titolo</code> e <code>## Sottotitolo</code></li>
        <li><code>- voce</code> per un elenco, <code>1. voce</code> numerato</li>
        <li><code>**parola**</code> per il <b>grassetto</b></li>
        <li><code>&gt; Attenzione: …</code> per un riquadro evidenziato</li>
        <li><code>[testo](/scadenzario)</code> per un link a una pagina dell'app</li>
        <li>Una riga vuota separa i paragrafi.</li>
      </ul>
    </section>
    ${nuova ? "" : `
    <section class="pannello zona-pericolo"><h2>Elimina</h2>
      <form method="post" action="/guida/studio/${pagina.id}/elimina" class="modulo">
        <label class="radio"><input type="checkbox" name="conferma" value="1" required><span>Confermo: elimina questa pagina</span></label>
        <div><button class="btn piccolo pericolo">Elimina la pagina</button></div>
      </form>
    </section>`}
  </aside>
</div>`,
  });
}

module.exports = { paginaIndice, paginaLettura, paginaModifica };
