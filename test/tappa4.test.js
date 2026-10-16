// Test della Tappa 4: segnalazioni e movimenti dei fascicoli.
const test = require("node:test");
const assert = require("node:assert/strict");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const { generaPromemoria } = require("../src/servizi/promemoria");

const id = (db, nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente).id;
const notificheDi = (db, nomeUtente) =>
  db.prepare("SELECT testo, letta, link FROM notifiche WHERE utente_id = ?").all(id(db, nomeUtente));

// ── Segnalazioni ──────────────────────────────────────────────

test("segnalazione: arriva ai destinatari, con conferma di lettura; il testo non va nel registro", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const r = await invia(indirizzo, "/segnalazioni", paolo, [
    ["a", id(db, "a.ferrara")], ["a", id(db, "l.romano")],
    ["oggetto", "Memoria da rivedere"], ["testo", "Testo riservato della segnalazione"], ["priorita", "importante"],
  ]);
  assert.equal(r.status, 302);
  assert.match(notificheDi(db, "a.ferrara")[0].testo, /Segnalazione importante da Avv\. Paolo Russo: Memoria da rivedere/);

  // Anna la vede tra le ricevute, Giulia (non destinataria) no
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  assert.match(await (await apri(indirizzo, "/segnalazioni", anna)).text(), /Testo riservato/);
  const giulia = (await accedi(indirizzo, "g.esposito")).cookie;
  assert.equal((await (await apri(indirizzo, "/segnalazioni", giulia)).text()).includes("Testo riservato"), false);

  // Anna preme Letto: Paolo lo vede nelle inviate, la notifica di Anna è letta
  const sid = db.prepare("SELECT id FROM segnalazioni").get().id;
  await invia(indirizzo, `/segnalazioni/${sid}/letta`, anna, {});
  assert.ok(notificheDi(db, "a.ferrara")[0].letta);
  const inviate = await (await apri(indirizzo, "/segnalazioni?vista=inviate", paolo)).text();
  assert.match(inviate, /Anna Ferrara: <b>letta il/);
  assert.match(inviate, /Luca Romano: non ancora letta/);

  // Giulia non può segnarla come letta al posto di altri
  await invia(indirizzo, `/segnalazioni/${sid}/letta`, giulia, {});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM segnalazioni_a WHERE utente_id = ?").get(id(db, "g.esposito")).n, 0);

  const registro = db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Segnalazione'").all().map((r) => r.dettaglio).join(" | ");
  assert.match(registro, /Inviata a .*importante/);
  assert.match(registro, /Letta la segnalazione di Avv\. Paolo Russo/);
  assert.equal(registro.includes("Testo riservato") || registro.includes("Memoria da rivedere"), false);
});

test("segnalazione senza destinatario o senza testo: errore, niente inviato", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const r = await invia(indirizzo, "/segnalazioni", paolo, { oggetto: "Ciao", testo: "" });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Manca almeno un destinatario, il messaggio/);
  // A se stessi non si manda
  await invia(indirizzo, "/segnalazioni", paolo, { a: id(db, "p.russo"), oggetto: "x", testo: "y" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM segnalazioni").get().n, 0);
});

test("il numerino delle segnalazioni da leggere compare nel menu", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  await invia(indirizzo, "/segnalazioni", paolo, { a: id(db, "m.deluca"), oggetto: "Ciao", testo: "Prova" });
  const marco = (await accedi(indirizzo, "m.deluca")).cookie;
  assert.match(await (await apri(indirizzo, "/", marco)).text(), /class="pallino-menu" aria-label="1 da leggere"/);
});

// ── Fascicoli ─────────────────────────────────────────────────

const muovi = (indirizzo, cookie, campi) => invia(indirizzo, "/fascicoli/azione", cookie, campi);
const stato = (db, numero) => db.prepare("SELECT stato, chi_id, a_id FROM fascicoli WHERE numero = ?").get(numero);

test("fascicolo: prendo, consegno, il collega conferma, torna in archivio", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;

  // Il numero si scrive come capita: viene sistemato
  await muovi(indirizzo, paolo, { azione: "prendo", numero: "  1234/2025 ", cliente: "Kone Ibrahim" });
  assert.deepEqual({ ...stato(db, "1234/2025") }, { stato: "consultazione", chi_id: id(db, "p.russo"), a_id: null });

  // Anna non può prenderlo: ce l'ha Paolo
  const r = await muovi(indirizzo, anna, { azione: "prendo", numero: "1234/2025" });
  assert.match(new URL(r.headers.get("location"), "http://x").searchParams.get("errore"), /ce l'ha Avv\. Paolo Russo/);

  // Paolo lo consegna ad Anna: Anna riceve la richiesta di conferma
  await muovi(indirizzo, paolo, { azione: "consegno", numero: "1234/2025", a: id(db, "a.ferrara") });
  assert.equal(stato(db, "1234/2025").stato, "consegna");
  assert.match(notificheDi(db, "a.ferrara")[0].testo, /ti ha consegnato il fascicolo 1234\/2025/);

  // Solo Anna può confermare
  await muovi(indirizzo, paolo, { azione: "ricevuto", numero: "1234/2025" });
  assert.equal(stato(db, "1234/2025").stato, "consegna");
  await muovi(indirizzo, anna, { azione: "ricevuto", numero: "1234/2025" });
  assert.deepEqual({ ...stato(db, "1234/2025") }, { stato: "consultazione", chi_id: id(db, "a.ferrara"), a_id: null });
  assert.ok(notificheDi(db, "a.ferrara").find((n) => /ti ha consegnato/.test(n.testo)).letta); // la richiesta non serve più
  assert.match(notificheDi(db, "p.russo")[0].testo, /ha confermato di aver ricevuto/);

  await muovi(indirizzo, anna, { azione: "archivio", numero: "1234/2025" });
  assert.equal(stato(db, "1234/2025").stato, "archivio");

  // Tutti i passaggi sono registrati
  const passaggi = db.prepare("SELECT testo FROM movimenti_fascicoli WHERE numero = '1234/2025' ORDER BY id").all().map((m) => m.testo);
  assert.equal(passaggi.length, 5);
  assert.match(passaggi[0], /Registrato per la prima volta/);
  assert.match(passaggi.at(-1), /Rimesso in archivio/);
});

test("fascicolo: 'non l'ho ricevuto' lo lascia a chi lo consegnava, e lo avvisa", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  await muovi(indirizzo, paolo, { azione: "consegno", numero: "55/2026", a: id(db, "a.ferrara") }); // preso dall'archivio e consegnato
  await muovi(indirizzo, anna, { azione: "non-ricevuto", numero: "55/2026" });
  assert.deepEqual({ ...stato(db, "55/2026") }, { stato: "consultazione", chi_id: id(db, "p.russo"), a_id: null });
  assert.match(notificheDi(db, "p.russo")[0].testo, /dice di non aver ricevuto/);
});

test("fascicolo: solo chi lo ha (o l'Admin) lo rimette in archivio", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const giulia = (await accedi(indirizzo, "g.esposito")).cookie;
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  await muovi(indirizzo, paolo, { azione: "prendo", numero: "77/2026" });
  await muovi(indirizzo, giulia, { azione: "archivio", numero: "77/2026" });
  assert.equal(stato(db, "77/2026").stato, "consultazione");
  await muovi(indirizzo, anna, { azione: "archivio", numero: "77/2026" }); // Admin
  assert.equal(stato(db, "77/2026").stato, "archivio");
  assert.match(db.prepare("SELECT testo FROM movimenti_fascicoli ORDER BY id DESC").get().testo, /\(era a Paolo Russo\)/);
});

test("fascicolo fuori da troppo tempo: promemoria a chi ce l'ha, una volta sola", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  await muovi(indirizzo, paolo, { azione: "prendo", numero: "88/2026" });
  generaPromemoria(db);
  assert.equal(notificheDi(db, "p.russo").filter((n) => /88\/2026/.test(n.testo)).length, 0); // appena preso: niente
  db.prepare("UPDATE fascicoli SET dal = ? WHERE numero = '88/2026'").run(Date.now() - 31 * 86_400_000);
  generaPromemoria(db);
  generaPromemoria(db);
  const avvisi = notificheDi(db, "p.russo").filter((n) => /88\/2026 da 31 giorni/.test(n.testo));
  assert.equal(avvisi.length, 1);
  assert.equal(avvisi[0].link, "/fascicoli?n=88%2F2026");
  // L'email non contiene il numero del fascicolo
  const email = db.prepare("SELECT testo FROM email WHERE utente_id = ?").all(id(db, "p.russo")).map((e) => e.testo).join(" ");
  assert.equal(email.includes("88/2026"), false);
});

test("la pagina fascicoli trova per numero o per cliente", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  await muovi(indirizzo, paolo, { azione: "prendo", numero: "1234/2025", cliente: "Kone Ibrahim" });
  assert.match(await (await apri(indirizzo, "/fascicoli?n=kone", paolo)).text(), /Fascicolo 1234\/2025/);
  const nuovo = await (await apri(indirizzo, "/fascicoli?n=999/2026", paolo)).text();
  assert.match(nuovo, /Nessun fascicolo registrato con il numero «999\/2026»/);
});

test("la finestra sovrapposta riceve solo il modulo; l'invio risponde in breve", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const parziale = { cookie: paolo, "X-Parziale": "1" };
  const html = await (await fetch(indirizzo + "/segnalazioni/nuova", { headers: parziale })).text();
  assert.match(html, /<form method="post" action="\/segnalazioni"/);
  assert.equal(html.includes("<html"), false); // niente pagina intorno
  const errore = await fetch(indirizzo + "/segnalazioni", { method: "POST", headers: { ...parziale, "content-type": "application/x-www-form-urlencoded" }, body: "oggetto=x" });
  assert.equal(errore.status, 400);
  assert.equal((await errore.text()).includes("<html"), false);
  const ok = await fetch(indirizzo + "/segnalazioni", { method: "POST", headers: { ...parziale, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ a: id(db, "a.ferrara"), oggetto: "Ciao", testo: "Prova" }) });
  assert.deepEqual(await ok.json(), { ok: true, messaggio: "Segnalazione inviata." });
});
