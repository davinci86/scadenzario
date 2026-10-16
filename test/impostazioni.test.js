// Test delle Impostazioni: catalogo, modifica dei termini, chiusure, valori predefiniti.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const config = require("../src/config");
const { avviaApp, accedi, apri, invia } = require("./aiuto");
const { elencoBackup } = require("../src/servizi/backup");
const { generaPromemoria } = require("../src/servizi/promemoria");
const { aggiungiGiorni, oggi } = require("../src/dominio/date");

// I backup "prima di una modifica" vanno in una cartella temporanea
function cartellaBackup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scad-imp-"));
  const prima = { ...config.backup };
  config.backup.cartella = base;
  config.backup.cartellaNas = "";
  t.after(() => { Object.assign(config.backup, prima); fs.rmSync(base, { recursive: true, force: true }); });
}

const tar = (db) => db.prepare("SELECT * FROM atti WHERE nome = 'Ricorso al TAR'").get();
const scadenzeTar = (db) => db.prepare("SELECT id, data, data_evento, calcolo FROM scadenze WHERE atto_id = ? ORDER BY id").all(tar(db).id);
// Il modulo di un atto, con la regola cambiata
const moduloAtto = (a, cambi = {}) => ({
  nome: a.nome, materia: a.materia, tipo: a.tipo, evento: a.evento, direzione: a.direzione, giorni: a.giorni,
  feriale: a.sospensione_feriale ? "1" : "", proroga: a.sposta_giorno_utile ? "1" : "", promemoria: a.promemoria, attivo: "1", ...cambi,
});
const regolaNascosta = (a, giorni) => ({ evento: a.evento, direzione: a.direzione, giorni, sospensione_feriale: a.sospensione_feriale, sposta_giorno_utile: a.sposta_giorno_utile });

test("nuovo atto: compare subito nell'inserimento, con lo storico e il registro", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const r = await invia(indirizzo, "/admin/impostazioni/atti", anna, {
    nome: "Opposizione a decreto ingiuntivo", materia: "Civile", tipo: "scadenza", evento: "notifica", direzione: "avanti",
    giorni: "40", feriale: "1", proroga: "1", promemoria: "15, 7", attivo: "1" });
  assert.equal(r.status, 302);
  const nuova = await (await apri(indirizzo, "/scadenze/nuova", anna)).text();
  assert.match(nuova, /Opposizione a decreto ingiuntivo/);
  const a = db.prepare("SELECT * FROM atti WHERE nome = 'Opposizione a decreto ingiuntivo'").get();
  assert.equal(a.promemoria, "15,7");
  assert.equal(db.prepare("SELECT motivo FROM atti_versioni WHERE atto_id = ?").get(a.id).motivo, "creazione");
  assert.match(db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Catalogo'").get().dettaglio, /Nuovo atto/);
});

test("cambiare solo nome o promemoria non tocca le scadenze e non chiede il motivo", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const a = tar(db), prima = scadenzeTar(db);
  const r = await invia(indirizzo, `/admin/impostazioni/atti/${a.id}`, anna, moduloAtto(a, { promemoria: "30, 7" }));
  assert.match(r.headers.get("location"), /^\/admin\/impostazioni\?fatto=/);
  assert.deepEqual(scadenzeTar(db), prima);
  assert.match(db.prepare("SELECT testo FROM atti_versioni WHERE atto_id = ? ORDER BY id DESC").get(a.id).testo, /promemoria 30, 7/);
});

test("cambiare la regola porta alla pagina con motivo, decorrenza e anteprima", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const a = tar(db);
  const r = await invia(indirizzo, `/admin/impostazioni/atti/${a.id}`, anna, moduloAtto(a, { giorni: "90" }));
  assert.match(r.headers.get("location"), /\/cambio\?.*giorni=90/);
  assert.equal(tar(db).giorni, 60); // la regola NON è ancora cambiata
  const pagina = await (await apri(indirizzo, r.headers.get("location"), anna)).text();
  assert.match(pagina, /Modifica dei termini/);
  assert.match(pagina, /90 giorni dalla notifica del provvedimento/);
  assert.match(pagina, /posticipata di \d+ gg/); // circa 30: i fine settimana spostano un po' le date
});

test("modifica normativa senza riferimento alla norma: non si applica", async (t) => {
  cartellaBackup(t);
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const a = tar(db);
  const r = await invia(indirizzo, `/admin/impostazioni/atti/${a.id}/cambio`, anna,
    { ...regolaNascosta(a, 90), motivo: "normativa", testo: "La riforma allunga il termine", modo: "retro" });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /riferimento alla norma/);
  assert.equal(tar(db).giorni, 60);
});

test("retroattiva: tutte le aperte ricalcolate (non quelle corrette a mano), con backup, storico e notifiche", async (t) => {
  cartellaBackup(t);
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const a = tar(db);
  const [prima, seconda] = scadenzeTar(db);
  // La seconda è stata corretta a mano: non va toccata
  db.prepare("UPDATE scadenze SET correzione_manuale = 'Concordato col cliente' WHERE id = ?").run(seconda.id);

  const r = await invia(indirizzo, `/admin/impostazioni/atti/${a.id}/cambio`, anna, {
    ...regolaNascosta(a, 90), motivo: "normativa", norma: "art. 99 d.lgs. 1/2026", testo: "La riforma porta il termine a 90 giorni", modo: "retro" });
  assert.match(decodeURIComponent(r.headers.get("location")), /1 scadenza ricalcolata/);
  assert.equal(tar(db).giorni, 90);
  const [p, s] = scadenzeTar(db);
  assert.notEqual(p.data, prima.data);
  assert.match(p.calcolo, /^90 giorni/);
  assert.equal(s.data, seconda.data); // corretta a mano: invariata

  assert.ok(elencoBackup().some((b) => b.tipo === "prima-di-modifica"));
  assert.match(db.prepare("SELECT testo FROM storico WHERE scadenza_id = ? ORDER BY id DESC").get(p.id).testo,
    /Termine ricalcolato per modifica del catalogo \(Modifica normativa, art\. 99 d\.lgs\. 1\/2026\)/);
  const v = db.prepare("SELECT * FROM atti_versioni WHERE atto_id = ? ORDER BY id DESC").get(a.id);
  assert.equal(v.motivo, "normativa");
  assert.match(v.prima, /^60 giorni/);
  assert.match(v.dopo, /^90 giorni/);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notifiche WHERE scadenza_id = ? AND testo LIKE 'Termine cambiato%'").get(p.id).n > 0);
});

test("'dal giorno': solo le scadenze con la decorrenza da quella data in poi", async (t) => {
  cartellaBackup(t);
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const a = tar(db);
  const prima = scadenzeTar(db); // decorrenze: 44 e 10 giorni fa
  const dal = aggiungiGiorni(oggi(), -20);
  await invia(indirizzo, `/admin/impostazioni/atti/${a.id}/cambio`, anna, {
    ...regolaNascosta(a, 90), motivo: "interna", testo: "Lo studio conta in modo più prudente", modo: "dal", dal });
  const dopo = scadenzeTar(db);
  for (const [i, s] of prima.entries()) {
    if (s.data_evento >= dal) assert.notEqual(dopo[i].data, s.data);
    else assert.equal(dopo[i].data, s.data);
  }
});

test("'una per una': solo quelle spuntate", async (t) => {
  cartellaBackup(t);
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const a = tar(db);
  const [p, s] = scadenzeTar(db);
  await invia(indirizzo, `/admin/impostazioni/atti/${a.id}/cambio`, anna, [
    ...Object.entries(regolaNascosta(a, 90)), ["motivo", "errore"], ["testo", "Il termine era impostato male"], ["modo", "scelta"], ["scelte", String(s.id)]]);
  const [p2, s2] = scadenzeTar(db);
  assert.equal(p2.data, p.data);
  assert.notEqual(s2.data, s.data);
});

test("chiusure: si aggiungono, le scadenze che ci cadono sono segnalate, si tolgono", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const s = db.prepare("SELECT id, data FROM scadenze WHERE tipo <> 'udienza' AND stato = 'Da iniziare' LIMIT 1").get();
  await invia(indirizzo, "/admin/impostazioni/chiusure", anna, { data: s.data, motivo: "Ufficio chiuso per disinfestazione" });
  const pagina = await (await apri(indirizzo, "/admin/impostazioni?scheda=festivita", anna)).text();
  assert.match(pagina, /Da controllare/);
  assert.match(pagina, new RegExp(`N\\. ${s.id} `));
  const doppia = await invia(indirizzo, "/admin/impostazioni/chiusure", anna, { data: s.data, motivo: "x" });
  assert.match(decodeURIComponent(doppia.headers.get("location")), /già tra le chiusure/);
  await invia(indirizzo, "/admin/impostazioni/chiusure/togli", anna, { data: s.data });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chiusure").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM registro WHERE azione = 'Impostazioni'").get().n, 2);
});

test("valori predefiniti: si salvano e l'app li usa", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const errato = await invia(indirizzo, "/admin/impostazioni/valori", anna,
    { promemoriaPredefiniti: "7, uno", promemoriaUdienzeOre: "48", terminiAltro: "30", giorniFascicoloFuori: "30" });
  assert.match(decodeURIComponent(errato.headers.get("location")), /errore=/);
  await invia(indirizzo, "/admin/impostazioni/valori", anna,
    { promemoriaPredefiniti: "5, 2", promemoriaUdienzeOre: "72, 24", terminiAltro: "45, 10", giorniFascicoloFuori: "1" });
  // I termini per gli atti fuori catalogo compaiono nel modulo
  const modulo = await (await apri(indirizzo, "/scadenze/nuova", anna)).text();
  assert.match(modulo, /<option value="45"/);
  // Il promemoria dei fascicoli parte dopo 1 giorno
  db.prepare("INSERT INTO fascicoli (numero, stato, chi_id, dal) VALUES ('9/2026', 'consultazione', ?, ?)")
    .run(db.prepare("SELECT id FROM utenti WHERE nome_utente = 'p.russo'").get().id, Date.now() - 2 * 86_400_000);
  generaPromemoria(db);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notifiche WHERE testo LIKE 'Hai il fascicolo 9/2026%'").get().n);
  assert.match(db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Impostazioni'").get().dettaglio, /Fascicoli: promemoria dopo quanti giorni fuori archivio: 30 → 1/);
});

test("impostazioni: solo l'Admin", async (t) => {
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const editor = (await accedi(indirizzo, "p.russo")).cookie;
  assert.equal((await apri(indirizzo, "/admin/impostazioni", editor)).status, 403);
  assert.equal((await invia(indirizzo, `/admin/impostazioni/atti/${tar(db).id}/cambio`, editor,
    { ...regolaNascosta(tar(db), 5), motivo: "interna", testo: "tentativo non permesso", modo: "retro" })).status, 403);
  assert.equal(tar(db).giorni, 60);
});
