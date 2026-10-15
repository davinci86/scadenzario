// ─────────────────────────────────────────────────────────────
// TEST DEL CALCOLO DEI TERMINI
// Ogni test è un caso concreto, scritto come lo direbbe una persona:
// "notifica il …, 30 giorni con sospensione feriale: scade il …".
// Sono gli esempi da far controllare a Daniela, uno per uno.
// ATTENZIONE: le regole (30, 60 giorni…) qui sono ESEMPI di calcolo,
// non indicazioni sui termini di legge.
// ─────────────────────────────────────────────────────────────
const test = require("node:test");
const assert = require("node:assert/strict");
const { calcolaTermine, pasqua, festivita, regolaAParole } = require("../src/dominio/termini");

const avanti = (giorni, sospensioneFeriale = true) =>
  ({ giorni, direzione: "avanti", evento: "notifica", sospensioneFeriale, spostaGiornoUtile: true });
const ritroso = (giorni, sospensioneFeriale = true) =>
  ({ giorni, direzione: "ritroso", evento: "udienza", sospensioneFeriale, spostaGiornoUtile: true });

test("notifica giovedì 1 ottobre 2026, 30 giorni: cade sabato 31, poi domenica 1 (Ognissanti) → lunedì 2 novembre", () => {
  const r = calcolaTermine("2026-10-01", avanti(30));
  assert.equal(r.data, "2026-11-02");
  assert.deepEqual(r.spostamenti.map((s) => s.motivo), ["sabato", "domenica"]);
});

test("lo stesso caso, senza spostamento al giorno utile → resta sabato 31 ottobre", () => {
  const r = calcolaTermine("2026-10-01", { ...avanti(30), spostaGiornoUtile: false });
  assert.equal(r.data, "2026-10-31");
});

test("notifica 20 luglio 2026, 30 giorni CON sospensione feriale → agosto non conta; cade sabato 19 settembre → lunedì 21", () => {
  // 11 giorni di luglio (21–31) + 19 di settembre = 30
  const r = calcolaTermine("2026-07-20", avanti(30, true));
  assert.equal(r.giorniAgostoSaltati, 31);
  assert.equal(r.data, "2026-09-21");
});

test("notifica 20 luglio 2026, 30 giorni SENZA sospensione feriale → mercoledì 19 agosto", () => {
  const r = calcolaTermine("2026-07-20", avanti(30, false));
  assert.equal(r.data, "2026-08-19");
});

test("notifica ad agosto (10 agosto 2026) con sospensione feriale → si comincia a contare dal 1 settembre → 30 settembre", () => {
  assert.equal(calcolaTermine("2026-08-10", avanti(30)).data, "2026-09-30");
});

test("San Gennaro: un termine che cade venerdì 19 settembre 2025 slitta a lunedì 22", () => {
  const r = calcolaTermine("2025-09-09", avanti(10, false));
  assert.equal(r.data, "2025-09-22");
  assert.equal(r.spostamenti[0].motivo, "San Gennaro, patrono di Napoli");
});

test("Pasquetta: un termine che cade lunedì 6 aprile 2026 slitta a martedì 7", () => {
  const r = calcolaTermine("2026-03-27", avanti(10, false));
  assert.equal(r.data, "2026-04-07");
  assert.equal(r.spostamenti[0].motivo, "Lunedì dell'Angelo");
});

test("Capodanno: un termine che cade venerdì 1 gennaio 2027 slitta a lunedì 4", () => {
  assert.equal(calcolaTermine("2026-12-22", avanti(10, false)).data, "2027-01-04");
});

test("chiusura dello studio il 24 dicembre: poi Natale, Santo Stefano e domenica → lunedì 28 dicembre 2026", () => {
  const chiusure = new Map([["2026-12-24", "Chiusura degli uffici"]]);
  const r = calcolaTermine("2026-12-14", avanti(10, false), chiusure);
  assert.equal(r.data, "2026-12-28");
  assert.equal(r.spostamenti[0].motivo, "Chiusura degli uffici");
});

test("a ritroso: 20 giorni prima dell'udienza del 10 settembre 2026, con sospensione feriale → martedì 21 luglio", () => {
  // 9 giorni di settembre (9–1) + 11 di luglio (31–21) = 20; agosto non conta
  assert.equal(calcolaTermine("2026-09-10", ritroso(20)).data, "2026-07-21");
});

test("a ritroso: se cade di sabato si ANTICIPA a venerdì (udienza 1 dicembre 2026, 10 giorni prima → venerdì 20 novembre)", () => {
  const r = calcolaTermine("2026-12-01", ritroso(10, false));
  assert.equal(r.data, "2026-11-20");
});

test("le date di Pasqua sono giuste", () => {
  assert.equal(pasqua(2025).toISOString().slice(0, 10), "2025-04-20");
  assert.equal(pasqua(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.equal(pasqua(2027).toISOString().slice(0, 10), "2027-03-28");
});

test("le festività fisse vengono riconosciute, i giorni normali no", () => {
  assert.equal(festivita("2026-06-02"), "Festa della Repubblica");
  assert.equal(festivita("2026-08-15"), "Ferragosto");
  assert.equal(festivita("2026-06-03"), null);
});

test("la regola si legge a parole", () => {
  assert.equal(regolaAParole(avanti(30)), "30 giorni dalla notifica del provvedimento, con sospensione feriale");
  assert.equal(regolaAParole(ritroso(20, false)), "20 giorni prima dell'udienza, senza sospensione feriale");
});
