// ─────────────────────────────────────────────────────────────
// HTML: ATTREZZI COMUNI
// Le pagine sono costruite come testo HTML dentro JavaScript.
// Funzione chiave: esc(), che "neutralizza" i caratteri speciali.
// Se qualcuno scrivesse <script> nel nome di un cliente, senza esc()
// il browser lo eseguirebbe come codice. Con esc() resta solo testo.
// ─────────────────────────────────────────────────────────────
const SOSTITUZIONI = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => SOSTITUZIONI[c]);

const RUOLI = { admin: "Admin", editor: "Editor", collab: "Collaboratore" };

// La cornice comune a tutte le pagine: intestazione, menu, contenuto.
// "attiva" indica quale voce del menu evidenziare.
// Le icone del menu: piccoli disegni SVG (linee), così non serve scaricare nulla.
// Ognuna è 24×24; il colore lo decide il CSS (currentColor).
const ICONE = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  scadenzario: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3"/>',
  ingressi: '<path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21H13"/><path d="M10 12h11M17.5 8.5 21 12l-3.5 3.5"/>',
  utenti: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20.5a6.5 6.5 0 0 0-2.6-5.2"/>',
  registro: '<path d="M6 3h11.5A1.5 1.5 0 0 1 19 4.5V21H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1Z"/><path d="M5 19a2 2 0 0 1 2-2h12M9 7.5h6M9 11h6"/>',
  segnalazioni: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"/><path d="M12 7.5v3.5M12 13.5h.01"/>',
  fascicoli: '<path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9a1.5 1.5 0 0 0-1.5-1.5H12l-2-2.5H4.5A1.5 1.5 0 0 0 3 6.5z"/><path d="M8 13h8"/>',
  comprimi: '<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>',
};
const icona = (nome) =>
  `<svg class="icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[nome]}</svg>`;

// La cornice comune a tutte le pagine: menu a sinistra, barra in alto, contenuto.
// "attiva" indica quale voce del menu evidenziare.
function layout({ titolo, utente, attiva = "", contenuto, script = [] }) {
  const voci = [["/", "Dashboard", "dash"], ["/scadenzario", "Scadenzario", "scadenzario"],
    ["/segnalazioni", "Segnalazioni", "segnalazioni"], ["/fascicoli", "Fascicoli", "fascicoli"]];
  if (utente && (utente.ruolo === "admin" || utente.titolare)) voci.push(["/ingressi", "Ingressi", "ingressi"]);
  if (utente && utente.ruolo === "admin") voci.push(["/admin/utenti", "Utenti", "utenti"], ["/admin/registro", "Registro", "registro"]);

  // Il menu laterale. Da compresso si vedono solo le icone: il nome compare
  // fermandosi sopra con il mouse (vedi public/js/menu.js).
  const barra = utente ? `
<aside class="barra" aria-label="Menu principale">
  <a class="barra-marchio" href="/" aria-label="Scadenzario, vai alla dashboard"><span class="monogramma" aria-hidden="true">S</span><span class="testo-voce">Scadenzario</span></a>
  <nav class="barra-voci">${voci.map(([url, nome, id]) =>
    `<a class="voce-menu" href="${url}" data-etichetta="${nome}"${attiva === id ? ' aria-current="page"' : ""}>${icona(id)}<span class="testo-voce">${nome}</span>${
      id === "segnalazioni" && utente.segnalazioniDaLeggere ? `<span class="pallino-menu" aria-label="${utente.segnalazioniDaLeggere} da leggere">${utente.segnalazioniDaLeggere}</span>` : ""}</a>`).join("")}
  </nav>
  <button class="voce-menu comprimi" type="button" data-comprimi data-etichetta="Espandi il menu" aria-label="Comprimi il menu">${icona("comprimi")}<span class="testo-voce">Comprimi</span></button>
</aside>` : "";

  const barraAlta = utente ? `
<header class="top"><div class="top-in">
      <div class="spazio"></div>
      <div class="io">
        <button class="campanella" type="button" data-campanella aria-label="Notifiche" title="Notifiche">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="numero" hidden></span>
        </button>
        <div class="menu-utente-contenitore">
          <button class="io-link" type="button" data-menu-utente aria-haspopup="menu" aria-expanded="false">
            <span class="av">${esc(iniziali(utente.nome))}</span>
            <span class="chi"><b>${esc(utente.nome)}</b><span class="ruolo ${esc(utente.ruolo)}">${RUOLI[utente.ruolo]}${utente.titolare ? " · titolare" : ""}</span></span>
            <span class="freccia" aria-hidden="true">▾</span>
          </button>
          <div class="menu-utente" role="menu" hidden>
            <a role="menuitem" href="/profilo">Il mio profilo</a>
            <form method="post" action="/blocca" data-blocca-ora><button role="menuitem" type="submit">🔒 Blocca lo schermo <kbd>Ctrl+Alt+L</kbd></button></form>
            <form method="post" action="/preferenze/tema"><button role="menuitem" type="submit">${utente.tema === "scuro" ? "☀ Tema chiaro" : "☾ Tema scuro"}</button></form>
            <form method="post" action="/logout"><button role="menuitem" type="submit" class="esci">Esci</button></form>
          </div>
        </div>
      </div>
</div></header>` : "";

  return `<!doctype html>
<html lang="it" data-tema="${utente?.tema === "scuro" ? "scuro" : "chiaro"}"${utente ? ` data-minuti-blocco="${Number(utente.minutiBlocco) || 10}" data-menu="${utente.menuCompresso ? "compresso" : "aperto"}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titolo)} · Scadenzario</title>
<link rel="stylesheet" href="/stile.css">
</head>
<body>
${utente ? `<div class="app">${barra}<div class="app-colonna">${barraAlta}<main>${contenuto}</main></div></div>` : `<main>${contenuto}</main>`}
${[...new Set(utente ? ["modifiche.js", "menu.js", "campanella.js", "blocco.js", ...script, "pannelli.js"] : script)].map((file) => `<script src="/js/${file}" defer></script>`).join("\n")}
</body>
</html>`;
}

const iniziali = (nome) =>
  String(nome).replace(/^(Avv\.|Dott\.)\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");

module.exports = { esc, layout, RUOLI };
