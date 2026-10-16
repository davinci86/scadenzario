// Test dei backup: farli, tenerli il giusto, ripristinarli.
// Ogni test usa cartelle temporanee tutte sue (server e "NAS").
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const config = require("../src/config");
const B = require("../src/servizi/backup");
const { avviaApp, accedi, apri, invia } = require("./aiuto");

function cartelleDiProva(t, { conNas = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scad-backup-"));
  const prima = { ...config.backup };
  config.backup.cartella = path.join(base, "server");
  config.backup.cartellaNas = conNas ? path.join(base, "nas") : "";
  if (conNas) fs.mkdirSync(config.backup.cartellaNas);
  B.stato.ultimoContatore = null;
  B.stato.nas = { ok: null, errore: "", quando: null };
  t.after(() => { Object.assign(config.backup, prima); fs.rmSync(base, { recursive: true, force: true }); });
  return base;
}

test("un backup è compresso, integro, e finisce anche sul NAS", async (t) => {
  cartelleDiProva(t);
  const { db } = await avviaApp(t, { conDati: true });
  const b = B.faiBackup(db, { tipo: "manuale" });
  assert.match(b.nome, /^scadenzario_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_manuale\.db\.gz$/);
  const file = path.join(config.backup.cartella, b.nome);
  assert.equal(zlib.gunzipSync(fs.readFileSync(file)).subarray(0, 15).toString(), "SQLite format 3"); // dentro c'è un database
  assert.ok(fs.existsSync(path.join(config.backup.cartellaNas, b.nome)));
  assert.equal(B.stato.nas.ok, true);
  assert.equal(B.elencoBackup()[0].sulNas, true);
  assert.match(db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Backup'").get().dettaglio, /Fatto a mano/);
});

test("programmati: automatico solo se qualcosa è cambiato; giornaliero e mensile una volta", async (t) => {
  cartelleDiProva(t);
  const { db } = await avviaApp(t, { conDati: true });
  const tipi = (fatti) => fatti.map((b) => b.tipo).sort();
  assert.deepEqual(tipi(B.backupProgrammati(db)), ["auto", "giornaliero", "mensile"]); // primo avvio
  assert.deepEqual(B.backupProgrammati(db), []);                                      // niente di nuovo
  db.prepare("UPDATE scadenze SET stato = 'In elaborazione' WHERE id = 1").run();
  assert.deepEqual(tipi(B.backupProgrammati(db)), ["auto"]);                          // una modifica → un automatico
  // Le sessioni e il registro non contano come "modifiche"
  db.prepare("INSERT INTO registro (quando, azione) VALUES (?, 'Prova')").run(Date.now());
  assert.deepEqual(B.backupProgrammati(db), []);
});

test("i backup vecchi si cancellano secondo la durata scelta; 0 = per sempre", async (t) => {
  cartelleDiProva(t, { conNas: false });
  const { db } = await avviaApp(t);
  fs.mkdirSync(config.backup.cartella, { recursive: true });
  const finto = (nome) => fs.writeFileSync(path.join(config.backup.cartella, nome), zlib.gzipSync("x"));
  finto("scadenzario_2020-01-01_21-00-00_mensile.db.gz");
  finto("scadenzario_2020-01-01_21-00-00_giornaliero.db.gz");
  finto("scadenzario_2020-01-01_21-00-00_auto.db.gz");
  finto("un-file-che-non-e-nostro.txt");
  B.pulisci(db);
  const resta = fs.readdirSync(config.backup.cartella).sort();
  assert.deepEqual(resta, ["scadenzario_2020-01-01_21-00-00_mensile.db.gz", "un-file-che-non-e-nostro.txt"]);
});

test("la durata dei backup: solo numeri sensati; si annota nel registro", async (t) => {
  cartelleDiProva(t, { conNas: false });
  const { db } = await avviaApp(t);
  assert.match(B.salvaGiorniDaTenere(db, { ...B.giorniDaTenere(db), giornaliero: "-3" }, null), /numero di giorni valido/);
  assert.match(B.salvaGiorniDaTenere(db, { ...B.giorniDaTenere(db), auto: "0" }, null), /automatici/);
  assert.equal(B.salvaGiorniDaTenere(db, { ...B.giorniDaTenere(db), giornaliero: "365" }, null), undefined);
  assert.equal(B.giorniDaTenere(db).giornaliero, 365);
  assert.match(db.prepare("SELECT dettaglio FROM registro WHERE azione = 'Backup'").get().dettaglio, /Giornaliero 90 → 365/);
});

test("ripristino: i dati tornano indietro, il registro no, e prima si salva una copia", async (t) => {
  cartelleDiProva(t);
  const { db, indirizzo } = await avviaApp(t, { conDati: true });
  const anna = (await accedi(indirizzo, "a.ferrara")).cookie;
  const paolo = (await accedi(indirizzo, "p.russo")).cookie;
  const backup = B.faiBackup(db, { tipo: "manuale" });

  // Dopo il backup: una scadenza cancellata (per finta: cambiata) e una nuova segnalazione
  db.prepare("UPDATE scadenze SET cliente = 'CAMBIATO DOPO' WHERE id = 1").run();
  await invia(indirizzo, "/segnalazioni", paolo, { a: db.prepare("SELECT id FROM utenti WHERE nome_utente = 'a.ferrara'").get().id, oggetto: "Dopo", testo: "x" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM segnalazioni").get().n, 1);

  // La pagina di conferma mostra il confronto
  const conferma = await (await apri(indirizzo, `/admin/backup/ripristina?nome=${encodeURIComponent(backup.nome)}`, anna)).text();
  assert.match(conferma, /Oggi e nel backup/);

  // Senza conferma: niente
  await invia(indirizzo, "/admin/backup/ripristina", anna, { nome: backup.nome });
  assert.equal(db.prepare("SELECT cliente FROM scadenze WHERE id = 1").get().cliente, "CAMBIATO DOPO");

  const r = await invia(indirizzo, "/admin/backup/ripristina", anna, { nome: backup.nome, conferma: "1" });
  assert.match(decodeURIComponent(r.headers.get("location")), /Ripristino fatto/);
  assert.notEqual(db.prepare("SELECT cliente FROM scadenze WHERE id = 1").get().cliente, "CAMBIATO DOPO"); // tornata com'era
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM segnalazioni").get().n, 0);                       // la segnalazione dopo non c'è

  // Il registro non è tornato indietro: c'è la segnalazione inviata e il ripristino
  const registro = db.prepare("SELECT azione, dettaglio FROM registro").all();
  assert.ok(registro.some((x) => x.azione === "Segnalazione"));
  assert.ok(registro.some((x) => /Ripristinato il backup/.test(x.dettaglio)));
  // La copia "prima del ripristino" esiste e contiene il dato cambiato
  assert.ok(B.elencoBackup().some((b) => b.tipo === "prima-del-ripristino"));

  // Anna resta dentro, Paolo deve rientrare
  assert.equal((await apri(indirizzo, "/admin/backup", anna)).status, 200);
  assert.equal((await apri(indirizzo, "/", paolo)).status, 302);
});

test("un backup rovinato non si ripristina e non cambia niente", async (t) => {
  cartelleDiProva(t, { conNas: false });
  const { db } = await avviaApp(t, { conDati: true });
  fs.mkdirSync(config.backup.cartella, { recursive: true });
  const nome = "scadenzario_2026-01-01_10-00-00_manuale.db.gz";
  fs.writeFileSync(path.join(config.backup.cartella, nome), zlib.gzipSync(Buffer.from("non sono un database")));
  const prima = db.prepare("SELECT COUNT(*) AS n FROM scadenze").get().n;
  const esito = B.ripristina(db, nome, { admin: { id: 1 }, sessioneAdmin: null });
  assert.match(esito, /non si può usare/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM scadenze").get().n, prima);
});

test("backup: solo l'Admin; niente percorsi strani", async (t) => {
  cartelleDiProva(t, { conNas: false });
  const { db, indirizzo } = await avviaApp(t);
  const editor = (await accedi(indirizzo, "p.russo")).cookie;
  assert.equal((await apri(indirizzo, "/admin/backup", editor)).status, 403);
  assert.equal((await invia(indirizzo, "/admin/backup", editor, {})).status, 403);
  assert.equal(B.ripristina(db, "../../dati/scadenzario.db", { admin: { id: 1 } }), "Backup non trovato.");
});

test("NAS irraggiungibile: il backup sul server si fa lo stesso, l'errore si vede", async (t) => {
  const base = cartelleDiProva(t, { conNas: false });
  config.backup.cartellaNas = path.join(base, "nas-che-non-esiste");
  const { db } = await avviaApp(t);
  B.faiBackup(db, { tipo: "manuale" });
  B.faiBackup(db, { tipo: "manuale" });
  assert.equal(B.elencoBackup().length, 2);
  assert.equal(B.stato.nas.ok, false);
  assert.match(B.stato.nas.errore, /non è raggiungibile/);
  // Nel registro una volta sola, non a ogni backup
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM registro WHERE dettaglio LIKE 'Copia sul NAS non riuscita%'").get().n, 1);
});
