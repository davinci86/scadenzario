// ─────────────────────────────────────────────────────────────
// TEST DELLO SCADENZARIO
// Usano l'app come farebbe una persona: accedono, compilano i moduli,
// premono i pulsanti, e controllano cosa è cambiato nel database.
// ─────────────────────────────────────────────────────────────
const test = require("node:test");
const assert = require("node:assert/strict");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const { calcolaTermine } = require("../src/dominio/termini");

const id = (db, nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente).id;
const scadenza = (db, cliente) => db.prepare("SELECT * FROM scadenze WHERE cliente = ? ORDER BY id DESC").get(cliente);
const squadraDi = (db, sid) => db.prepare("SELECT utente_id FROM squadre WHERE scadenza_id = ? ORDER BY utente_id").all(sid).map((r) => r.utente_id);

test("un Editor inserisce una scadenza scegliendo l'atto: la data la calcola l'app", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const atto = db.prepare("SELECT * FROM atti WHERE nome = 'Ricorso al TAR'").get();

  const r = await invia(indirizzo, "/scadenze", cookie, [
    ["tipo", "scadenza"], ["atto", String(atto.id)], ["cliente", "Prova Cliente"], ["attivita", ""],
    ["data_evento", "2026-07-20"], ["squadra", String(id(db, "g.esposito"))], ["referente", String(id(db, "g.esposito"))],
  ]);
  assert.equal(r.status, 302);

  const s = scadenza(db, "Prova Cliente");
  const atteso = calcolaTermine("2026-07-20", { giorni: 60, direzione: "avanti", sospensioneFeriale: true, spostaGiornoUtile: true }).data;
  assert.equal(s.data, atteso);
  assert.equal(s.attivita, "Ricorso al TAR"); // compilata con il nome dell'atto
  assert.equal(s.referente_id, id(db, "g.esposito"));
  assert.equal(s.da_verificare, 0);
});

test("se manca la data di notifica, il modulo torna indietro con l'errore e non salva nulla", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const atto = db.prepare("SELECT id FROM atti LIMIT 1").get();
  const r = await invia(indirizzo, "/scadenze", cookie, [["tipo", "scadenza"], ["atto", String(atto.id)], ["cliente", "Senza Data"]]);
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Manca la data/);
  assert.equal(scadenza(db, "Senza Data"), undefined);
});

test("un atto fuori catalogo resta da verificare, e solo l'Admin può confermarlo", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const editor = (await accedi(indirizzo, "p.russo")).cookie;
  await invia(indirizzo, "/scadenze", editor, [
    ["tipo", "scadenza"], ["atto", "altro"], ["cliente", "Atto Raro"], ["attivita", "Istanza particolare"],
    ["termine_altro", "15"], ["feriale_altro", "1"], ["data_evento", "2026-07-25"],
  ]);
  const s = scadenza(db, "Atto Raro");
  assert.equal(s.da_verificare, 1);
  assert.equal(s.data, "2026-09-09"); // 6 giorni di luglio + 9 di settembre

  const r1 = await invia(indirizzo, `/scadenze/${s.id}/verifica`, editor, []);
  assert.equal(r1.status, 403);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  await invia(indirizzo, `/scadenze/${s.id}/verifica`, admin, []);
  assert.equal(scadenza(db, "Atto Raro").da_verificare, 0);
});

test("con 'Forza la data a mano' si salva la data scritta", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  await invia(indirizzo, "/scadenze", cookie, [
    ["tipo", "scadenza"], ["atto", "altro"], ["cliente", "Data Forzata"], ["attivita", "X"],
    ["termine_altro", "manuale"], ["data", "2026-11-20"],
  ]);
  const s = scadenza(db, "Data Forzata");
  assert.equal(s.data, "2026-11-20");
  assert.equal(s.calcolo, "Data forzata a mano");
});

test("un Collaboratore non può inserire scadenze", async (t) => {
  const { indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "m.deluca");
  assert.equal((await apri(indirizzo, "/scadenze/nuova", cookie)).status, 403);
  const r = await invia(indirizzo, "/scadenze", cookie, [["tipo", "udienza"], ["cliente", "X"], ["attivita", "Y"], ["data", "2026-12-01"]]);
  assert.equal(r.status, 403);
});

test("un Collaboratore cambia lo stato solo delle scadenze in cui è coinvolto", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "m.deluca");
  const sua = scadenza(db, "Kone Ibrahim");     // De Luca è nella squadra
  const altrui = scadenza(db, "Bianchi Laura"); // De Luca non c'è

  await invia(indirizzo, `/scadenze/${sua.id}/stato`, cookie, [["stato", "Da depositare"]]);
  assert.equal(scadenza(db, "Kone Ibrahim").stato, "Da depositare");

  const r = await invia(indirizzo, `/scadenze/${altrui.id}/stato`, cookie, [["stato", "Pronta"]]);
  assert.equal(r.status, 403);
  assert.equal(scadenza(db, "Bianchi Laura").stato, "Da preparare");
});

test("ogni cambio di stato finisce nello storico e nel registro", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "m.deluca");
  const s = scadenza(db, "Kone Ibrahim");
  await invia(indirizzo, `/scadenze/${s.id}/stato`, cookie, [["stato", "Da depositare"]]);
  const storico = db.prepare("SELECT testo FROM storico WHERE scadenza_id = ? ORDER BY id DESC").get(s.id);
  assert.equal(storico.testo, "Stato: Da correggere → Da depositare");
  const registro = db.prepare("SELECT azione, utente_id FROM registro ORDER BY id DESC").get();
  assert.deepEqual({ ...registro }, { azione: "Stato", utente_id: id(db, "m.deluca") });
});

test("la correzione a mano della data senza motivo viene rifiutata", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const s = scadenza(db, "Popescu Elena");
  const r = await invia(indirizzo, `/scadenze/${s.id}/correggi`, cookie, [["data", "2027-01-15"], ["motivo", ""]]);
  assert.match(r.headers.get("location"), /errore=/);
  assert.equal(scadenza(db, "Popescu Elena").data, s.data);

  await invia(indirizzo, `/scadenze/${s.id}/correggi`, cookie, [["data", "2027-01-15"], ["motivo", "Termine prorogato dal giudice"]]);
  const dopo = scadenza(db, "Popescu Elena");
  assert.equal(dopo.data, "2027-01-15");
  assert.equal(dopo.correzione_manuale, "Termine prorogato dal giudice");
});

test("un Collaboratore non può correggere le date", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "m.deluca");
  const s = scadenza(db, "Kone Ibrahim");
  const r = await invia(indirizzo, `/scadenze/${s.id}/correggi`, cookie, [["data", "2027-01-15"], ["motivo", "Tentativo"]]);
  assert.equal(r.status, 403);
});

test("assegnare una scadenza senza squadra: la prima persona diventa referente", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  const s = scadenza(db, "Traoré Moussa");
  assert.deepEqual(squadraDi(db, s.id), []);
  await invia(indirizzo, `/scadenze/${s.id}/squadra`, cookie, [["utente", String(id(db, "g.esposito"))]]);
  assert.deepEqual(squadraDi(db, s.id), [id(db, "g.esposito")]);
  assert.equal(scadenza(db, "Traoré Moussa").referente_id, id(db, "g.esposito"));
});

test("togliendo il referente, il ruolo passa a un altro della squadra", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  const s = scadenza(db, "Kone Ibrahim"); // referente De Luca, squadra Ferrara + De Luca
  await invia(indirizzo, `/scadenze/${s.id}/squadra/togli`, cookie, [["utente", String(id(db, "m.deluca"))]]);
  assert.equal(scadenza(db, "Kone Ibrahim").referente_id, id(db, "a.ferrara"));
});

test("rinviare un'udienza crea la nuova udienza con la stessa squadra", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "g.esposito");
  const vecchia = scadenza(db, "Diallo Fatou");
  const r = await invia(indirizzo, `/scadenze/${vecchia.id}/rinvio`, cookie, [["data", "2027-02-10"], ["ora", "10:00"]]);
  const nuova = scadenza(db, "Diallo Fatou");
  assert.equal(r.headers.get("location"), `/scadenze/${nuova.id}`);
  assert.equal(nuova.data, "2027-02-10");
  assert.equal(nuova.stato, "Da preparare");
  assert.deepEqual(squadraDi(db, nuova.id), squadraDi(db, vecchia.id));
  const chiusa = db.prepare("SELECT stato, rinviata_a FROM scadenze WHERE id = ?").get(vecchia.id);
  assert.deepEqual({ ...chiusa }, { stato: "Rinviata", rinviata_a: nuova.id });
});

test("ricalcolare dalla decorrenza applica la regola del catalogo e toglie la correzione manuale", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const s = scadenza(db, "Hossain Rahim"); // Ricorso al TAR, 60 giorni
  await invia(indirizzo, `/scadenze/${s.id}/ricalcola`, cookie, [["data_evento", "2026-10-01"]]);
  const dopo = scadenza(db, "Hossain Rahim");
  assert.equal(dopo.data_evento, "2026-10-01");
  assert.equal(dopo.data, "2026-11-30");
});

test("il filtro 'Da assegnare' mostra solo le scadenze senza squadra", async (t) => {
  const { indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  const html = await (await apri(indirizzo, "/scadenzario?persona=nessuno", cookie)).text();
  assert.match(html, /Traoré Moussa/);
  assert.doesNotMatch(html, /Kone Ibrahim/);
});

test("le scadenze chiuse non compaiono, a meno di chiederlo", async (t) => {
  const { indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  assert.doesNotMatch(await (await apri(indirizzo, "/scadenzario", cookie)).text(), /Mendez Lucia/);
  assert.match(await (await apri(indirizzo, "/scadenzario?chiuse=1", cookie)).text(), /Mendez Lucia/);
});

test("la dashboard dell'Admin mostra da assegnare e da verificare; quella di un collaboratore no", async (t) => {
  const { indirizzo } = await avviaApp(t, { conDati: true });
  const admin = await (await apri(indirizzo, "/", (await accedi(indirizzo, "a.ferrara")).cookie)).text();
  assert.match(admin, /Da assegnare/);
  assert.match(admin, /Termini da verificare/);
  const collab = await (await apri(indirizzo, "/", (await accedi(indirizzo, "l.romano")).cookie)).text();
  assert.doesNotMatch(collab, /Termini da verificare/);
  assert.match(collab, /Okafor Chidi/); // una sua scadenza
});

test("l'anteprima del calcolo risponde con la data e la spiegazione", async (t) => {
  const { indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const r = await apri(indirizzo, "/api/termine?giorni=30&feriale=1&data=2026-07-20", cookie);
  const dati = await r.json();
  assert.equal(dati.data, "2026-09-21");
  assert.match(dati.spiegazione, /esclusi 31 giorni di agosto/);
});

test("per il pannello laterale il server manda solo il dettaglio, senza la pagina intorno", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "a.ferrara");
  const s = scadenza(db, "Kone Ibrahim");
  const html = await (await fetch(`${indirizzo}/scadenze/${s.id}`, { headers: { cookie, "X-Parziale": "1" } })).text();
  assert.doesNotMatch(html, /<html/);
  assert.match(html, /Kone Ibrahim/);
});

test("un'azione dal pannello risponde in JSON, anche con l'errore", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const s = scadenza(db, "Popescu Elena");
  const r = await fetch(`${indirizzo}/scadenze/${s.id}/correggi`, {
    method: "POST",
    headers: { cookie, "X-Parziale": "1", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: "2027-01-15", motivo: "" }),
  });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { id: s.id, errore: "Scrivi il motivo della correzione." });
});

test("dalla finestra di inserimento, una scadenza salvata risponde con il suo numero", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const { cookie } = await accedi(indirizzo, "p.russo");
  const r = await fetch(`${indirizzo}/scadenze`, {
    method: "POST",
    headers: { cookie, "X-Parziale": "1", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tipo: "udienza", cliente: "Finestra Prova", attivita: "Udienza", data: "2026-12-02", ora: "09:00" }),
  });
  const { id } = await r.json();
  assert.equal(id, scadenza(db, "Finestra Prova").id);
});
