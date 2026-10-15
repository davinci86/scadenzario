// ─────────────────────────────────────────────────────────────
// TEST DI ACCESSO E RUOLI
// Ogni test avvia un'app di prova con un database temporaneo in
// memoria, la usa come farebbe un browser, e controlla il risultato.
// ─────────────────────────────────────────────────────────────
const test = require("node:test");
const assert = require("node:assert/strict");
const { apriDatabase } = require("../src/db/database");
const { inserisciUtentiDiProva } = require("../src/db/seed");
const { creaApp } = require("../src/app");

// Avvia un'app di prova su una porta libera e la chiude a fine test.
async function avviaApp(t) {
  const db = apriDatabase(":memory:");
  inserisciUtentiDiProva(db);
  const server = creaApp(db).listen(0);
  await new Promise((pronto) => server.once("listening", pronto));
  t.after(() => server.close());
  return { db, indirizzo: `http://127.0.0.1:${server.address().port}` };
}

// Simula la compilazione del modulo di login.
async function accedi(indirizzo, nomeUtente, password) {
  const risposta = await fetch(indirizzo + "/login", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nome_utente: nomeUtente, password }),
  });
  const cookie = risposta.headers.get("set-cookie");
  return { risposta, cookie: cookie ? cookie.split(";")[0] : null };
}

const apri = (indirizzo, percorso, cookie) =>
  fetch(indirizzo + percorso, { redirect: "manual", headers: cookie ? { cookie } : {} });

test("con la password giusta si entra e la dashboard saluta per nome", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { risposta, cookie } = await accedi(indirizzo, "a.ferrara", "demo");
  assert.equal(risposta.status, 302);
  assert.equal(risposta.headers.get("location"), "/");

  const dashboard = await apri(indirizzo, "/", cookie);
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Anna/);
});

test("il nome utente non distingue maiuscole e minuscole", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { risposta } = await accedi(indirizzo, "A.Ferrara", "demo");
  assert.equal(risposta.status, 302);
});

test("con la password sbagliata non si entra", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { risposta, cookie } = await accedi(indirizzo, "a.ferrara", "sbagliata");
  assert.equal(risposta.status, 401);
  assert.equal(cookie, null);
  assert.match(await risposta.text(), /Nome utente o password non corretti/);
});

test("senza accesso la dashboard rimanda al login", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const risposta = await apri(indirizzo, "/");
  assert.equal(risposta.status, 302);
  assert.match(risposta.headers.get("location"), /^\/login/);
});

test("un collaboratore non può aprire la pagina degli utenti", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "m.deluca", "demo");
  const risposta = await apri(indirizzo, "/admin/utenti", cookie);
  assert.equal(risposta.status, 403);
});

test("un editor non può aprire la pagina degli utenti", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "p.russo", "demo");
  const risposta = await apri(indirizzo, "/admin/utenti", cookie);
  assert.equal(risposta.status, 403);
});

test("l'admin apre la pagina degli utenti e vede gli accessi nel registro", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "a.ferrara", "demo");
  const risposta = await apri(indirizzo, "/admin/utenti", cookie);
  assert.equal(risposta.status, 200);
  const html = await risposta.text();
  assert.match(html, /Dott\. Luca Romano/);
  assert.match(html, /Accesso/);
});

test("dopo 5 tentativi sbagliati l'utente è bloccato, anche con la password giusta", async (t) => {
  const { indirizzo } = await avviaApp(t);
  for (let i = 0; i < 5; i++) await accedi(indirizzo, "g.esposito", "sbagliata");
  const { risposta } = await accedi(indirizzo, "g.esposito", "demo");
  assert.equal(risposta.status, 429);
  assert.match(await risposta.text(), /Troppi tentativi/);
});

test("dopo l'uscita il vecchio cookie non vale più", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "l.romano", "demo");
  await fetch(indirizzo + "/logout", { method: "POST", redirect: "manual", headers: { cookie } });
  const risposta = await apri(indirizzo, "/", cookie);
  assert.equal(risposta.status, 302);
});

test("un utente disattivato non può entrare", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  db.prepare("UPDATE utenti SET attivo = 0 WHERE nome_utente = 'l.romano'").run();
  const { risposta, cookie } = await accedi(indirizzo, "l.romano", "demo");
  assert.equal(risposta.status, 403);
  assert.equal(cookie, null);
});

test("dopo il periodo di inattività lo schermo si blocca (la sessione resta, ma serve la password)", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "a.ferrara", "demo");
  // Facciamo finta che l'ultima attività sia di 11 minuti fa (il blocco predefinito è a 10)
  db.prepare("UPDATE sessioni SET ultima_attivita = ?").run(Date.now() - 11 * 60_000);
  const risposta = await apri(indirizzo, "/", cookie);
  assert.equal(risposta.status, 423);
  assert.match(await risposta.text(), /Schermo bloccato/);
});

test("un nome con caratteri speciali viene mostrato come testo, non eseguito", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  db.prepare("UPDATE utenti SET nome = '<script>alert(1)</script>' WHERE nome_utente = 'a.ferrara'").run();
  const { cookie } = await accedi(indirizzo, "a.ferrara", "demo");
  const html = await (await apri(indirizzo, "/admin/utenti", cookie)).text();
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.match(html, /&lt;script&gt;/);
});

test("il tema chiaro/scuro è una scelta personale che resta salvata", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "m.deluca", "demo");
  assert.match(await (await apri(indirizzo, "/", cookie)).text(), /data-tema="chiaro"/);
  await fetch(indirizzo + "/preferenze/tema", { method: "POST", redirect: "manual", headers: { cookie } });
  assert.match(await (await apri(indirizzo, "/", cookie)).text(), /data-tema="scuro"/);
  // Un altro utente resta con il tema chiaro
  const altro = (await accedi(indirizzo, "a.ferrara", "demo")).cookie;
  assert.match(await (await apri(indirizzo, "/", altro)).text(), /data-tema="chiaro"/);
});
