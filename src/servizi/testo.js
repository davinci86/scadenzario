// ─────────────────────────────────────────────────────────────
// TESTO SEMPLICE → PAGINA (per la Guida)
// Le pagine della Guida si scrivono in testo con pochi segni:
//   # Titolo      ## Sottotitolo      ### Titoletto
//   - voce di elenco        1. voce numerata
//   **grassetto**   *corsivo*   `parola tecnica`
//   [testo del link](/indirizzo)
//   > Attenzione: …   (riquadro evidenziato)
//   una riga vuota separa i paragrafi
//
// Sicurezza: PRIMA si "neutralizza" tutto il testo con esc(), POI si
// aggiungono solo questi pochi tag. Quindi chi scrive una pagina non può
// inserire codice nella pagina, nemmeno per sbaglio. I link possono andare
// solo a pagine dell'app (che iniziano con /) o a siti http(s).
// ─────────────────────────────────────────────────────────────
const { esc } = require("../views/html");

// Il testo di una riga: grassetto, corsivo, codice, link
function inLinea(testo) {
  return esc(testo)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (tutto, etichetta, indirizzo) => {
      const sicuro = /^\/(?!\/)/.test(indirizzo) || /^https?:\/\//.test(indirizzo);
      if (!sicuro) return etichetta;
      const esterno = indirizzo.startsWith("http");
      return `<a href="${indirizzo}"${esterno ? ' target="_blank" rel="noopener noreferrer"' : ""}>${etichetta}</a>`;
    });
}

// Un'ancora per i titoli: "Stati e colori" → "stati-e-colori"
const ancora = (testo) => testo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function testoInHtml(sorgente) {
  const righe = String(sorgente ?? "").replace(/\r/g, "").split("\n");
  const html = [];
  let elenco = null;      // "ul" o "ol" se siamo dentro un elenco
  let paragrafo = [];     // le righe del paragrafo in corso

  const chiudiParagrafo = () => { if (paragrafo.length) { html.push(`<p>${paragrafo.map(inLinea).join("<br>")}</p>`); paragrafo = []; } };
  const chiudiElenco = () => { if (elenco) { html.push(`</${elenco}>`); elenco = null; } };

  for (const riga of righe) {
    const r = riga.trimEnd();
    let m;
    if (!r.trim()) { chiudiParagrafo(); chiudiElenco(); continue; }
    if ((m = /^(#{1,3})\s+(.+)$/.exec(r))) {
      chiudiParagrafo(); chiudiElenco();
      const livello = m[1].length + 1; // # → h2 (l'h1 è il titolo della pagina)
      html.push(`<h${livello} id="${ancora(m[2])}">${inLinea(m[2])}</h${livello}>`);
    } else if ((m = /^\s*[-*]\s+(.+)$/.exec(r)) || (m = /^\s*\d+[.)]\s+(.+)$/.exec(r))) {
      chiudiParagrafo();
      const tipo = /^\s*\d/.test(r) ? "ol" : "ul";
      if (elenco !== tipo) { chiudiElenco(); html.push(`<${tipo}>`); elenco = tipo; }
      html.push(`<li>${inLinea(m[1])}</li>`);
    } else if ((m = /^>\s?(.*)$/.exec(r))) {
      chiudiParagrafo(); chiudiElenco();
      html.push(`<p class="riquadro-guida">${inLinea(m[1])}</p>`);
    } else {
      chiudiElenco();
      paragrafo.push(r.trim());
    }
  }
  chiudiParagrafo(); chiudiElenco();
  return html.join("\n");
}

// Testo senza segni, per la ricerca e le anteprime
const testoPiano = (sorgente) => String(sorgente ?? "")
  .replace(/^#{1,3}\s+/gm, "").replace(/^\s*([-*]|\d+[.)])\s+/gm, "").replace(/^>\s?/gm, "")
  .replace(/\*\*|`|\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();

module.exports = { testoInHtml, testoPiano, ancora };
