// ─────────────────────────────────────────────────────────────
// TEST DELLA TAPPA 3: blocco dello schermo, notifiche, promemoria,
// email, ingressi e uscite, profilo.
// ─────────────────────────────────────────────────────────────
const test = require("node:test");
const assert = require("node:assert/strict");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const { generaPromemoria } = require("../src/servizi/promemoria");
const { inviaEmailInCoda } = require("../src/servizi/email");
const { oggi } = require("../src/dominio/date");

const id = (db, nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente).id;
const scadenza = (db, cliente) => db.prepare("SELECT * FROM scadenze WHERE cliente = ? ORDER BY id").get(cliente);
const notificheDi = (db, nomeUtente) =>
  db.prepare("SELECT * FROM notifiche WHERE utente_id = ? ORDER BY id").all(id(db, nomeUtente));

// ── Blocco dello schermo ──
test("«Blocca» blocca subito: il server rifiuta tutto finché non si reinserisce la password", async (t) => {
  const { indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  await invia(indirizzo, "/blocca", cookie, []);
  assert.equal((await apri(indirizzo, "/scadenzario", cookie)).status, 423);
  const api = await fetch(indirizzo + "/api/notifiche", { headers: { cookie, "X-Automatico": "1" } });
  assert.equal(api.status, 423);

  const sbagliata = await invia(indirizzo, "/sblocca", cookie, [["password", "nonè"], ["torna", "/scadenzario"]]);
  assert.equal(sbagliata.status, 400);
  const giusta = await invia(indirizzo, "/sblocca", cookie, [["password", "demo"], ["torna", "/scadenzario"]]);
  assert.equal(giusta.headers.get("location"), "/scadenzario");
  assert.equal((await apri(indirizzo, "/scadenzario", cookie)).status, 200);
});

test("dopo 5 tentativi di sblocco sbagliati si viene fatti uscire", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "g.esposito");
  await invia(indirizzo, "/blocca", cookie, []);
  for (let i = 0; i < 5; i++) await invia(indirizzo, "/sblocca", cookie, [["password", "x"]]);
  const r = await apri(indirizzo, "/", cookie);
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location"), /^\/login/);
});

test("lo sblocco non manda mai su un altro sito", async (t) => {
  const { indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  await invia(indirizzo, "/blocca", cookie, []);
  const r = await invia(indirizzo, "/sblocca", cookie, [["password", "demo"], ["torna", "//sito-malevolo.example"]]);
  assert.equal(r.headers.get("location"), "/");
});

test("il controllo automatico delle notifiche non conta come attività", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  const prima = Date.now() - 5 * 60_000;
  db.prepare("UPDATE sessioni SET ultima_attivita = ?").run(prima);
  await fetch(indirizzo + "/api/notifiche", { headers: { cookie, "X-Automatico": "1" } });
  assert.equal(db.prepare("SELECT ultima_attivita AS u FROM sessioni").get().u, prima);
});

test("la sessione finisce comunque la notte", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  // Sessione nata ieri alle 10: la notte (alle 2:00) è passata
  const ieri = new Date(); ieri.setDate(ieri.getDate() - 1); ieri.setHours(10, 0, 0, 0);
  db.prepare("UPDATE sessioni SET creata = ?").run(ieri.getTime());
  const r = await apri(indirizzo, "/", cookie);
  assert.equal(r.status, 302);
});

// ── Notifiche ──
test("chi cambia lo stato non riceve la notifica; il resto della squadra sì", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "m.deluca");
  const s = scadenza(db, "Kone Ibrahim"); // squadra: Ferrara e De Luca
  await invia(indirizzo, `/scadenze/${s.id}/stato`, cookie, [["stato", "Da depositare"]]);
  assert.match(notificheDi(db, "a.ferrara").at(-1).testo, /ha portato lo stato a «Da depositare»/);
  assert.equal(notificheDi(db, "m.deluca").length, 0);
});

test("«Letto» vale solo per le proprie notifiche", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const deluca = (await accedi(indirizzo, "m.deluca")).cookie;
  const s = scadenza(db, "Kone Ibrahim");
  await invia(indirizzo, `/scadenze/${s.id}/nota`, deluca, [["nota", "Bozza pronta"]]);
  const n = notificheDi(db, "a.ferrara").at(-1);
  // De Luca prova a segnare come letta la notifica di Ferrara: non succede nulla
  await invia(indirizzo, `/notifiche/${n.id}/letta`, deluca, []);
  assert.equal(db.prepare("SELECT letta FROM notifiche WHERE id = ?").get(n.id).letta, null);
  const ferrara = (await accedi(indirizzo, "a.ferrara")).cookie;
  await invia(indirizzo, `/notifiche/${n.id}/letta`, ferrara, []);
  assert.notEqual(db.prepare("SELECT letta FROM notifiche WHERE id = ?").get(n.id).letta, null);
});

test("il suono: le notifiche nuove compaiono «da avvisare» una volta sola", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  generaPromemoria(db);
  const { cookie } = await accedi(indirizzo, "l.romano");
  const dati = await (await fetch(indirizzo + "/api/notifiche", { headers: { cookie, "X-Automatico": "1" } })).json();
  assert.ok(dati.daAvvisare.length > 0);
  await invia(indirizzo, "/api/notifiche/avvisate", cookie, dati.daAvvisare.map((x) => ["ids", String(x)]));
  const dopo = await (await fetch(indirizzo + "/api/notifiche", { headers: { cookie, "X-Automatico": "1" } })).json();
  assert.deepEqual(dopo.daAvvisare, []);
  assert.equal(dopo.daLeggere, dati.daLeggere); // avvisate, ma ancora da leggere
});

// ── Promemoria ──
test("i promemoria si creano una volta sola, anche se il controllo gira più volte", async (t) => {
  const { db } = await avviaApp(t, { conDati: true });
  const primi = generaPromemoria(db);
  assert.ok(primi > 0);
  assert.equal(generaPromemoria(db), 0);
});

test("scadenza senza squadra: il promemoria va ad Admin ed Editor, con «Da assegnare»", async (t) => {
  const { db } = await avviaApp(t, { conDati: true });
  // Spostiamo la scadenza senza squadra a domani
  const s = scadenza(db, "Ferraro Giovanni");
  const domani = new Date(Date.now() + 864e5);
  const d = `${domani.getFullYear()}-${String(domani.getMonth() + 1).padStart(2, "0")}-${String(domani.getDate()).padStart(2, "0")}`;
  db.prepare("UPDATE scadenze SET data = ? WHERE id = ?").run(d, s.id);
  generaPromemoria(db);
  const n = notificheDi(db, "p.russo").find((x) => x.scadenza_id === s.id);
  assert.match(n.testo, /^Da assegnare · Scade domani/);
  assert.ok(notificheDi(db, "a.ferrara").some((x) => x.scadenza_id === s.id));
  assert.ok(!notificheDi(db, "m.deluca").some((x) => x.scadenza_id === s.id)); // collaboratore: no
});

test("scadenza superata: l'avviso va al referente", async (t) => {
  const { db } = await avviaApp(t, { conDati: true });
  generaPromemoria(db);
  const s = scadenza(db, "Okafor Chidi"); // scaduta da 2 giorni, referente Romano
  assert.match(notificheDi(db, "l.romano").find((x) => x.scadenza_id === s.id).testo, /^Scaduta da 2 giorni/);
});

test("le email di promemoria non contengono mai il nome del cliente", async (t) => {
  const { db } = await avviaApp(t, { conDati: true });
  generaPromemoria(db);
  const email = db.prepare("SELECT * FROM email").all();
  assert.ok(email.length > 0);
  const clienti = db.prepare("SELECT DISTINCT cliente FROM scadenze").all().map((r) => r.cliente);
  for (const m of email) for (const c of clienti) assert.equal(m.testo.includes(c) || m.oggetto.includes(c), false);
});

test("le email in coda vengono spedite e segnate come inviate", async (t) => {
  const { db } = await avviaApp(t, { conDati: true });
  generaPromemoria(db);
  const spedite = [];
  const finto = { sendMail: async (m) => spedite.push(m) };
  const n = await inviaEmailInCoda(db, finto);
  assert.equal(n, spedite.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email WHERE inviata IS NULL").get().n, 0);
});

// ── Ingressi e uscite ──
test("il login registra l'entrata, «Esci» l'uscita", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "l.romano");
  const riga = () => db.prepare("SELECT * FROM presenze WHERE utente_id = ? AND data = ?").get(id(db, "l.romano"), oggi());
  assert.ok(riga().entrata);
  assert.equal(riga().uscita, null);
  await invia(indirizzo, "/logout", cookie, []);
  assert.ok(riga().uscita);
});

test("il registro degli ingressi lo vedono l'Admin e i titolari, non gli altri", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  assert.equal((await apri(indirizzo, "/ingressi", admin)).status, 200);
  assert.equal((await apri(indirizzo, "/ingressi", (await accedi(indirizzo, "m.deluca")).cookie)).status, 200); // titolare
  const esposito = (await accedi(indirizzo, "g.esposito")).cookie;
  assert.equal((await apri(indirizzo, "/ingressi", esposito)).status, 403);
  // L'Admin le assegna la qualifica di titolare
  await invia(indirizzo, `/admin/utenti/${id(db, "g.esposito")}/titolare`, admin, []);
  assert.equal((await apri(indirizzo, "/ingressi", esposito)).status, 200);
});

test("solo l'Admin può assegnare la qualifica di titolare", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const editor = (await accedi(indirizzo, "p.russo")).cookie;
  const r = await invia(indirizzo, `/admin/utenti/${id(db, "p.russo")}/titolare`, editor, []);
  assert.equal(r.status, 403);
  assert.equal(db.prepare("SELECT titolare FROM utenti WHERE nome_utente = 'p.russo'").get().titolare, 0);
});

// ── Profilo ──
test("i minuti per il blocco vanno da 1 a 20", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const { cookie } = await accedi(indirizzo, "m.deluca");
  const troppi = await invia(indirizzo, "/profilo", cookie, [["minuti_blocco", "25"], ["tema", "chiaro"]]);
  assert.equal(troppi.status, 400);
  await invia(indirizzo, "/profilo", cookie, [["minuti_blocco", "3"], ["tema", "chiaro"], ["email", ""]]);
  assert.equal(db.prepare("SELECT minuti_blocco FROM utenti WHERE nome_utente = 'm.deluca'").get().minuti_blocco, 3);
});
