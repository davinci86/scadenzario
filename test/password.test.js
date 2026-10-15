// ─────────────────────────────────────────────────────────────
// TEST DELLE PASSWORD
// Un test è un esempio con il risultato atteso. Se il codice
// cambia e il risultato non torna più, il test lo segnala.
// Si lanciano tutti con: npm test
// ─────────────────────────────────────────────────────────────
const test = require("node:test");
const assert = require("node:assert/strict");
const { creaHash, verificaPassword } = require("../src/auth/password");

test("la password giusta viene riconosciuta", () => {
  const salvato = creaHash("Primavera2026!");
  assert.equal(verificaPassword("Primavera2026!", salvato), true);
});

test("una password sbagliata viene rifiutata", () => {
  const salvato = creaHash("Primavera2026!");
  assert.equal(verificaPassword("primavera2026!", salvato), false);
});

test("nel database non finisce mai la password in chiaro", () => {
  const salvato = creaHash("Primavera2026!");
  assert.equal(salvato.includes("Primavera2026!"), false);
});

test("la stessa password dà ogni volta un'impronta diversa (grazie al sale)", () => {
  assert.notEqual(creaHash("demo"), creaHash("demo"));
});
