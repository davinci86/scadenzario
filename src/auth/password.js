// ─────────────────────────────────────────────────────────────
// PASSWORD
// Non salviamo MAI la password. Salviamo un "hash": un'impronta
// calcolata dalla password, da cui non si può risalire alla password.
// Al login ricalcoliamo l'impronta di ciò che l'utente ha scritto
// e la confrontiamo con quella salvata.
//
// Il "sale" è un valore casuale, diverso per ogni password: così due
// persone con la stessa password hanno impronte diverse.
// ─────────────────────────────────────────────────────────────
const crypto = require("node:crypto");

function creaHash(password) {
  const sale = crypto.randomBytes(16);
  const impronta = crypto.scryptSync(password, sale, 64);
  // Salviamo: algoritmo $ sale $ impronta
  return `scrypt$${sale.toString("hex")}$${impronta.toString("hex")}`;
}

function verificaPassword(password, salvato) {
  const [algoritmo, saleHex, improntaHex] = String(salvato).split("$");
  if (algoritmo !== "scrypt" || !saleHex || !improntaHex) return false;

  const attesa = Buffer.from(improntaHex, "hex");
  const calcolata = crypto.scryptSync(password, Buffer.from(saleHex, "hex"), attesa.length);

  // Confronto "a tempo costante": impiega sempre lo stesso tempo,
  // così nessuno può indovinare la password misurando i tempi.
  return crypto.timingSafeEqual(attesa, calcolata);
}

// Un'impronta finta, usata quando il nome utente non esiste:
// facciamo comunque il calcolo, così la risposta ha gli stessi tempi
// e non si capisce quali nomi utente esistono.
const HASH_FINTO = creaHash("nessuno");

module.exports = { creaHash, verificaPassword, HASH_FINTO };
