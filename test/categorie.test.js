// Test delle categorie: squadra predefinita, assegnazione automatica, modifiche a mano.
const test = require("node:test");
const assert = require("node:assert/strict");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const C = require("../src/db/categorie");
const { oggi, aggiungiGiorni } = require("../src/dominio/date");

const id = (db, nomeUtente) => db.prepare("SELECT id FROM utenti WHERE nome_utente = ?").get(nomeUtente).id;
const atto = (db, nome) => db.prepare("SELECT * FROM atti WHERE nome = ?").get(nome);
const squadraDi = (db, sid) => db.prepare("SELECT utente_id FROM squadre WHERE scadenza_id = ? ORDER BY utente_id").all(sid).map((r) => r.utente_id);
const ultima = (db) => db.prepare("SELECT * FROM scadenze ORDER BY id DESC").get();

// L'Admin imposta la squadra di Immigrazione: Giulia (referente) e Luca
async function preparaImmigrazione(t) {
  const app = await avviaApp(t, { conDati: true });
  const anna = (await accedi(app.indirizzo, "a.ferrara")).cookie;
  await invia(app.indirizzo, "/admin/impostazioni/categorie", anna, [
    ["materia", "Immigrazione"], ["squadra", id(app.db, "g.esposito")], ["squadra", id(app.db, "l.romano")], ["referente", id(app.db, "g.esposito")]]);
  return { ...app, anna };
}
const nuovaImmigrazione = (db, extra = []) => [
  ["tipo", "scadenza"], ["atto", atto(db, "Ricorso avverso diniego di protezione internazionale").id], ["cliente", "Cliente di prova"],
  ["data_evento", aggiungiGiorni(oggi(), -2)], ...extra];

test("l'Admin imposta la squadra di una categoria; finisce nel registro", async (t) => {
  const { db } = await preparaImmigrazione(t);
  const s = C.squadraDiCategoria(db, "Immigrazione");
  assert.deepEqual(s.utenti.sort(), [id(db, "g.esposito"), id(db, "l.romano")].sort());
  assert.equal(s.referente, id(db, "g.esposito"));
  assert.match(db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Impostazioni'").get().dettaglio,
    /Squadra della categoria «Immigrazione»: .*\(referente Avv\. Giulia Esposito\)/);
});

test("nuova scadenza non toccata: squadra della categoria, annotata come automatica", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  // Come il modulo con JavaScript: squadra spuntata dalla categoria, squadra_da_categoria = 1
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [
    ["squadra", id(db, "g.esposito")], ["squadra", id(db, "l.romano")], ["referente", id(db, "g.esposito")], ["squadra_da_categoria", "1"]]));
  const s = ultima(db);
  assert.equal(s.materia, "Immigrazione");
  assert.deepEqual(squadraDi(db, s.id), [id(db, "g.esposito"), id(db, "l.romano")].sort((a, b) => a - b));
  assert.equal(s.referente_id, id(db, "g.esposito"));
  assert.ok(db.prepare("SELECT 1 FROM storico WHERE scadenza_id = ? AND testo LIKE 'Assegnata in automatico (categoria Immigrazione)%'").get(s.id));
  assert.match(db.prepare("SELECT testo FROM notifiche WHERE utente_id = ? AND scadenza_id = ?").get(id(db, "g.esposito"), s.id).testo,
    /\(categoria Immigrazione\) come referente/);
});

test("senza JavaScript (nessuna persona inviata): si usa comunque la squadra della categoria", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [["squadra_da_categoria", "1"]]));
  assert.equal(squadraDi(db, ultima(db).id).length, 2);
});

test("chi inserisce cambia la squadra: vale la sua scelta, annotata a mano", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [["squadra", id(db, "p.russo")], ["squadra_da_categoria", "0"]]));
  const s = ultima(db);
  assert.deepEqual(squadraDi(db, s.id), [id(db, "p.russo")]);
  assert.ok(db.prepare("SELECT 1 FROM storico WHERE scadenza_id = ? AND testo LIKE 'Assegnata a mano%'").get(s.id));
});

test("lasciata vuota apposta: resta da assegnare", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [["squadra_da_categoria", "0"]]));
  assert.deepEqual(squadraDi(db, ultima(db).id), []);
});

test("udienza: la categoria si sceglie nel modulo", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  await invia(indirizzo, "/scadenze", anna, [["tipo", "udienza"], ["cliente", "Prova"], ["attivita", "Udienza"],
    ["data", aggiungiGiorni(oggi(), 10)], ["categoria", "Immigrazione"], ["squadra_da_categoria", "1"]]);
  const s = ultima(db);
  assert.equal(s.materia, "Immigrazione");
  assert.equal(squadraDi(db, s.id).length, 2);
  // Una categoria inventata non si accetta
  await invia(indirizzo, "/scadenze", anna, [["tipo", "udienza"], ["cliente", "Prova 2"], ["attivita", "Udienza"],
    ["data", aggiungiGiorni(oggi(), 10)], ["categoria", "Non esiste"], ["squadra_da_categoria", "1"]]);
  assert.equal(ultima(db).materia, "");
});

test("chi è disattivato viene saltato; se non resta nessuno, da assegnare", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  db.prepare("UPDATE utenti SET attivo = 0 WHERE nome_utente IN ('g.esposito', 'l.romano')").run();
  assert.deepEqual(C.squadraDiCategoria(db, "Immigrazione"), { utenti: [], referente: null });
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [["squadra_da_categoria", "1"]]));
  assert.deepEqual(squadraDi(db, ultima(db).id), []);
});

test("le aperte rimaste da assegnare si assegnano con un pulsante; le altre non si toccano", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  // Una scadenza di Immigrazione con squadra (già nei dati) e una senza
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [["squadra_da_categoria", "0"]]));
  const senza = ultima(db).id;
  const altre = db.prepare("SELECT s.id FROM scadenze s WHERE s.materia = 'Immigrazione' AND s.id <> ?").all(senza).map((r) => [r.id, squadraDi(db, r.id)]);
  const r = await invia(indirizzo, "/admin/impostazioni/categorie/assegna", anna, { materia: "Immigrazione" });
  assert.match(decodeURIComponent(r.headers.get("location")), /1 scadenza assegnata/);
  assert.equal(squadraDi(db, senza).length, 2);
  for (const [sid, prima] of altre) assert.deepEqual(squadraDi(db, sid), prima);
});

test("dopo l'inserimento l'assegnazione resta modificabile a mano", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  await invia(indirizzo, "/scadenze", anna, nuovaImmigrazione(db, [["squadra_da_categoria", "1"]]));
  const s = ultima(db);
  await invia(indirizzo, `/scadenze/${s.id}/squadra/togli`, anna, { utente: id(db, "l.romano") });
  await invia(indirizzo, `/scadenze/${s.id}/squadra`, anna, { utente: id(db, "m.deluca") });
  assert.deepEqual(squadraDi(db, s.id), [id(db, "m.deluca"), id(db, "g.esposito")].sort((a, b) => a - b));
});

test("il modulo riceve categorie e squadre; la pagina è solo per l'Admin", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  const modulo = await (await apri(indirizzo, "/scadenze/nuova", anna)).text();
  assert.match(modulo, /<option value="Immigrazione"/);
  assert.match(modulo, /data-squadre="\{&quot;/);
  const editor = (await accedi(indirizzo, "p.russo")).cookie;
  assert.equal((await apri(indirizzo, "/admin/impostazioni?scheda=categorie", editor)).status, 403);
  assert.equal((await invia(indirizzo, "/admin/impostazioni/categorie", editor, { materia: "Immigrazione" })).status, 403);
  assert.equal(C.squadraDiCategoria(db, "Immigrazione").utenti.length, 2);
});

test("un utente eliminato esce anche dalle squadre delle categorie", async (t) => {
  const { db, indirizzo, anna } = await preparaImmigrazione(t);
  await invia(indirizzo, `/admin/utenti/${id(db, "l.romano")}/elimina`, anna, { conferma: "1" });
  assert.deepEqual(C.squadraDiCategoria(db, "Immigrazione").utenti, [id(db, "g.esposito")]);
});
