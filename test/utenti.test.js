// Test della gestione utenti: creare, modificare, password, disattivare, eliminare.
const test = require("node:test");
const assert = require("node:assert/strict");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const { generaPromemoria } = require("../src/servizi/promemoria");

const id = (db, nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente).id;
const nuovoUtente = {
  nome: "Avv. Sara Neri", titolo: "Avvocato", nome_utente: "s.neri", ruolo: "editor", email: "", password: "provvisoria1",
};

test("l'admin crea un utente; al primo accesso deve scegliere la sua password", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const r = await invia(indirizzo, "/admin/utenti", admin, nuovoUtente);
  assert.equal(r.status, 302);
  assert.match(await (await apri(indirizzo, "/admin/utenti", admin)).text(), /Avv\. Sara Neri/);

  const sara = (await accedi(indirizzo, "s.neri", "provvisoria1")).cookie;
  const dash = await apri(indirizzo, "/", sara);
  assert.equal(dash.status, 302);
  assert.equal(dash.headers.get("location"), "/profilo/password");

  // Conferma sbagliata: errore
  assert.equal((await invia(indirizzo, "/profilo/password", sara, { attuale: "provvisoria1", nuova: "nuovapass99", conferma: "altra" })).status, 400);
  // Giusta: si entra
  assert.equal((await invia(indirizzo, "/profilo/password", sara, { attuale: "provvisoria1", nuova: "nuovapass99", conferma: "nuovapass99" })).status, 302);
  assert.equal((await apri(indirizzo, "/", sara)).status, 200);
  assert.equal((await accedi(indirizzo, "s.neri", "provvisoria1")).risposta.status, 401);
  assert.equal((await accedi(indirizzo, "s.neri", "nuovapass99")).risposta.status, 302);

  // Il registro annota, ma mai la password
  const registro = db.prepare("SELECT dettaglio FROM registro").all().map((r) => r.dettaglio).join(" ");
  assert.match(registro, /Creato Avv\. Sara Neri/);
  assert.equal(registro.includes("provvisoria1") || registro.includes("nuovapass99"), false);
});

test("solo l'Admin gestisce gli utenti", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const editor = (await accedi(indirizzo, "p.russo")).cookie;
  assert.equal((await invia(indirizzo, "/admin/utenti", editor, nuovoUtente)).status, 403);
  assert.equal((await invia(indirizzo, `/admin/utenti/${id(db, "l.romano")}/elimina`, editor, { conferma: "1" })).status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM utenti WHERE nome_utente = 's.neri'").get().n, 0);
});

test("nome utente già usato: errore e nessun utente creato", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const r = await invia(indirizzo, "/admin/utenti", admin, { ...nuovoUtente, nome_utente: "p.russo" });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /già usato/);
});

test("l'Admin non può togliersi il ruolo, disattivarsi o eliminarsi; resta sempre un Admin", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const io = id(db, "a.ferrara");
  const r1 = await invia(indirizzo, `/admin/utenti/${io}`, admin, { nome: "Anna Ferrara", nome_utente: "a.ferrara", ruolo: "editor" });
  assert.equal(r1.status, 400);
  assert.equal((await invia(indirizzo, `/admin/utenti/${io}/attivo`, admin, {})).status, 400);
  assert.equal((await invia(indirizzo, `/admin/utenti/${io}/elimina`, admin, { conferma: "1" })).status, 400);
  assert.equal(db.prepare("SELECT ruolo, attivo FROM utenti WHERE id = ?").get(io).ruolo, "admin");
});

test("disattivato: non entra, le sue sessioni si chiudono, si può riattivare", async (t) => {
  const { db, indirizzo } = await avviaApp(t);
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const luca = (await accedi(indirizzo, "l.romano")).cookie;
  await invia(indirizzo, `/admin/utenti/${id(db, "l.romano")}/attivo`, admin, {});
  assert.equal((await apri(indirizzo, "/", luca)).status, 302); // fuori
  assert.equal((await accedi(indirizzo, "l.romano")).risposta.status, 403);
  await invia(indirizzo, `/admin/utenti/${id(db, "l.romano")}/attivo`, admin, {});
  assert.equal((await accedi(indirizzo, "l.romano")).risposta.status, 302);
});

test("eliminato: sparisce e non entra, ma il suo nome resta nello storico", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const admin = (await accedi(indirizzo, "a.ferrara")).cookie;
  const luca = id(db, "l.romano");
  // Luca scrive una nota in una sua attività
  const sua = db.prepare("SELECT scadenza_id AS s FROM squadre WHERE utente_id = ? LIMIT 1").get(luca).s;
  const cookieLuca = (await accedi(indirizzo, "l.romano")).cookie;
  await invia(indirizzo, `/scadenze/${sua}/nota`, cookieLuca, { nota: "Nota scritta da Luca" });

  // Senza conferma non si elimina
  assert.equal((await invia(indirizzo, `/admin/utenti/${luca}/elimina`, admin, {})).status, 400);
  assert.equal((await invia(indirizzo, `/admin/utenti/${luca}/elimina`, admin, { conferma: "1" })).status, 302);

  // Non entra più, non è nell'elenco né nelle squadre aperte
  assert.equal((await apri(indirizzo, "/", cookieLuca)).status, 302);
  assert.equal((await accedi(indirizzo, "l.romano")).risposta.status, 401);
  const elenco = await (await apri(indirizzo, "/admin/utenti", admin)).text();
  assert.match(elenco, /Utenti eliminati \(1\)/);
  // (dalle attività già chiuse non viene tolto: lì la squadra è storia)
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM squadre q JOIN scadenze s ON s.id = q.scadenza_id
    WHERE q.utente_id = ? AND s.stato NOT IN ('Depositato', 'Completato', 'Tenuta', 'Rinviata')`).get(luca).n, 0);
  assert.equal(db.prepare("SELECT email FROM utenti WHERE id = ?").get(luca).email, "");

  // Lo storico mostra ancora il suo nome accanto alla sua nota
  const pagina = await (await apri(indirizzo, `/scadenze/${sua}`, admin)).text();
  assert.match(pagina, /Dott\. Luca Romano<\/b> · Nota: Nota scritta da Luca|Dott\. Luca Romano<\/b> · Nota scritta da Luca/);
  assert.match(pagina, /Tolto dalla squadra: Dott\. Luca Romano \(utente eliminato\)/);

  // Il nome utente è di nuovo libero
  assert.equal((await invia(indirizzo, "/admin/utenti", admin, { ...nuovoUtente, nome_utente: "l.romano" })).status, 302);
});

test("chi è disattivato non riceve promemoria: vanno ad Admin ed Editor", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const gio = id(db, "g.esposito");
  // un'attività dove Giovanni è da solo
  const sola = db.prepare(`SELECT scadenza_id AS s FROM squadre q WHERE utente_id = ?
    AND (SELECT COUNT(*) FROM squadre x WHERE x.scadenza_id = q.scadenza_id) = 1`).get(gio).s;
  // la portiamo a domani, così il promemoria parte di sicuro
  const domani = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  db.prepare("UPDATE scadenze SET data = ? WHERE id = ?").run(domani, sola);
  db.prepare("UPDATE utenti SET attivo = 0 WHERE id = ?").run(gio);
  generaPromemoria(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifiche WHERE utente_id = ?").get(gio).n, 0);
  const admin = db.prepare("SELECT testo FROM notifiche WHERE utente_id = ? AND scadenza_id = ?").all(id(db, "a.ferrara"), sola);
  assert.ok(admin.length > 0 && admin.every((n) => n.testo.startsWith("Da assegnare")));
});
