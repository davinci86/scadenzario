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
function layout({ titolo, utente, attiva = "", contenuto, script = [] }) {
  const voci = [["/", "Dashboard", "dash"], ["/scadenzario", "Scadenzario", "scadenzario"]];
  if (utente && (utente.ruolo === "admin" || utente.titolare)) voci.push(["/ingressi", "Ingressi", "ingressi"]);
  if (utente && utente.ruolo === "admin") voci.push(["/admin/utenti", "Utenti e registro", "utenti"]);

  const menu = utente
    ? `<nav class="nav">${voci
        .map(([url, nome, id]) =>
          `<a href="${url}"${attiva === id ? ' aria-current="page"' : ""}>${nome}</a>`)
        .join("")}</nav>
      <div class="spazio"></div>
      <div class="io">
        <button class="campanella" type="button" data-campanella aria-label="Notifiche" title="Notifiche">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="numero" hidden></span>
        </button>
        <form method="post" action="/blocca" data-blocca-ora><button class="interruttore" type="submit" title="Blocca subito lo schermo (per la privacy, quando ti allontani)">🔒 Blocca</button></form>
        <a class="io-link" href="/profilo" title="Il mio profilo"><span class="av">${esc(iniziali(utente.nome))}</span>
        <span class="chi"><b>${esc(utente.nome)}</b><span class="ruolo ${esc(utente.ruolo)}">${RUOLI[utente.ruolo]}${utente.titolare ? " · titolare" : ""}</span></span></a>
        <form method="post" action="/preferenze/tema"><button class="interruttore" type="submit" title="Cambia tra tema chiaro e scuro">${utente.tema === "scuro" ? "☀ Chiaro" : "☾ Scuro"}</button></form>
        <form method="post" action="/logout"><button class="link" type="submit">Esci</button></form>
      </div>`
    : "";

  return `<!doctype html>
<html lang="it" data-tema="${utente?.tema === "scuro" ? "scuro" : "chiaro"}"${utente ? ` data-minuti-blocco="${Number(utente.minutiBlocco) || 10}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titolo)} · Scadenzario</title>
<link rel="stylesheet" href="/stile.css">
</head>
<body>
${utente ? `<header class="top"><div class="top-in"><a class="marchio" href="/">Scadenzario</a>${menu}</div></header>` : ""}
<main>${contenuto}</main>
${[...new Set(utente ? ["campanella.js", "blocco.js", ...script, "pannelli.js"] : script)].map((file) => `<script src="/js/${file}" defer></script>`).join("\n")}
</body>
</html>`;
}

const iniziali = (nome) =>
  String(nome).replace(/^(Avv\.|Dott\.)\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");

module.exports = { esc, layout, RUOLI };
