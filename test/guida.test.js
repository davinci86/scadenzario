// Test della Guida (manuale e procedure dello studio) e del tutorial.
const test = require("node:test");
const assert = require("node:assert/strict");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const { testoInHtml } = require("../src/servizi/testo");

test("il testo semplice diventa pagina, senza mai far passare codice", () => {
  const html = testoInHtml("# Titolo\n**grassetto** <script>alert(1)</script>\n\n- [ok](/guida)\n- [no](javascript:alert(1))\n\n> Attenzione");
  assert.match(html, /<h2 id="titolo">Titolo<\/h2>/);
  assert.match(html, /<b>grassetto<\/b> &lt;script&gt;/);
  assert.match(html, /<a href="\/guida">ok<\/a>/);
  assert.equal(html.includes("javascript:"), false);
  assert.match(html, /class="riquadro-guida">Attenzione/);
});

test("il manuale mostra a ognuno le pagine del suo ruolo", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const collab = (await accedi(indirizzo, "m.deluca")).cookie;
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const perCollab = await (await apri(indirizzo, "/guida", collab)).text();
  assert.match(perCollab, /Primi passi/);
  assert.equal(perCollab.includes("Backup e ripristino"), false);
  assert.equal(perCollab.includes("Inserire una scadenza"), false);
  assert.equal((await apri(indirizzo, "/guida/backup", collab)).status, 404); // nemmeno con l'indirizzo
  assert.match(await (await apri(indirizzo, "/guida", admin)).text(), /Backup e ripristino/);
  assert.match(await (await apri(indirizzo, "/guida/backup", admin)).text(), /Ripristinare/);
});

test("la ricerca trova nel manuale (secondo il ruolo) e nelle procedure", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const collab = (await accedi(indirizzo, "m.deluca")).cookie;
  const r = await (await apri(indirizzo, "/guida?q=referente", collab)).text();
  assert.match(r, /Risultati per «referente»/);
  assert.match(r, /La scheda di una scadenza/);
  assert.equal((await (await apri(indirizzo, "/guida?q=ripristino", collab)).text()).includes("Backup e ripristino"), false);
});

test("procedure dello studio: le scrive l'Admin, le leggono tutti, nel registro", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const collab = (await accedi(indirizzo, "m.deluca")).cookie;
  assert.equal((await invia(indirizzo, "/guida/studio", collab, { titolo: "Prova", testo: "Testo" })).status, 403);
  const r = await invia(indirizzo, "/guida/studio", admin, { titolo: "Come depositiamo", testo: "# Passi\n- Firma digitale <b>x</b>\n- Invio PEC" });
  const link = r.headers.get("location");
  assert.match(link, /^\/guida\/studio\/\d+$/);
  const pagina = await (await apri(indirizzo, link, collab)).text();
  assert.match(pagina, /Come depositiamo/);
  assert.match(pagina, /Firma digitale &lt;b&gt;x&lt;\/b&gt;/);
  assert.equal(pagina.includes("/modifica"), false); // il collaboratore non vede «Modifica»
  assert.match(await (await apri(indirizzo, "/guida?q=pec", collab)).text(), /Come depositiamo/);
  await invia(indirizzo, `${link}/elimina`, admin, { conferma: "1" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM guida_pagine").get().n, 0);
  assert.deepEqual(db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Guida' ORDER BY id").all().map((x) => x.dettaglio),
    ["Nuova pagina «Come depositiamo»", "Eliminata la pagina «Come depositiamo»"]);
});

test("tutorial: parte al primo accesso, diverso per ruolo; visto non riparte, ma si può rivedere", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const collab = (await accedi(indirizzo, "m.deluca")).cookie;
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const dashCollab = await (await apri(indirizzo, "/", collab)).text();
  assert.match(dashCollab, /id="tutorial"/);
  assert.equal(dashCollab.includes("Impostazioni&quot;"), false);  // niente passi da Admin
  assert.match(await (await apri(indirizzo, "/", admin)).text(), /Impostazioni&quot;/);
  await fetch(indirizzo + "/tutorial/visto", { method: "POST", headers: { cookie: collab, "X-Parziale": "1" } });
  assert.equal((await (await apri(indirizzo, "/", collab)).text()).includes('id="tutorial"'), false);
  assert.match(await (await apri(indirizzo, "/?tutorial=1", collab)).text(), /id="tutorial"/);
});
