// Attrezzi comuni ai test: avviare un'app di prova e "fare finta di essere il browser".
const { apriDatabase } = require("../src/db/database");
const { inserisciUtentiDiProva, inserisciDatiDiProva } = require("../src/db/seed");
const { creaApp } = require("../src/app");

async function avviaApp(t, { conDati = false } = {}) {
  const db = apriDatabase(":memory:");
  inserisciUtentiDiProva(db);
  if (conDati) inserisciDatiDiProva(db);
  const server = creaApp(db).listen(0);
  await new Promise((pronto) => server.once("listening", pronto));
  t.after(() => server.close());
  return { db, indirizzo: `http://127.0.0.1:${server.address().port}` };
}

async function accedi(indirizzo, nomeUtente, password = "demo") {
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

// Invia un modulo. "campi" può avere valori ripetuti: [["squadra","1"],["squadra","2"]]
const invia = (indirizzo, percorso, cookie, campi) =>
  fetch(indirizzo + percorso, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(campi),
  });

module.exports = { avviaApp, accedi, apri, invia };
