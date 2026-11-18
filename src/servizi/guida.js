// ─────────────────────────────────────────────────────────────
// LA GUIDA (il "wiki" dello Scadenzario)
// Due parti:
//  • il MANUALE: come funziona l'app. Lo scriviamo noi, nella cartella
//    guida/ del progetto (un file per pagina), e cambia insieme al codice.
//    Ogni file inizia con:   titolo: …   ruoli: tutti | editor, admin | admin   ---
//  • le PROCEDURE DELLO STUDIO: istruzioni operative scritte dall'Admin
//    dall'app (tabella guida_pagine). Fanno parte dei backup.
// Entrambe si scrivono in "testo semplice" (vedi servizi/testo.js).
// ─────────────────────────────────────────────────────────────
const fs = require("node:fs");
const path = require("node:path");
const { testoPiano } = require("./testo");
const { registra } = require("../db/registro");

const CARTELLA = path.join(__dirname, "..", "..", "guida");

// Il manuale: letto dai file (una volta sola: cambia solo con un aggiornamento dell'app)
let manuale = null;
function leggiManuale() {
  if (manuale) return manuale;
  const file = fs.existsSync(CARTELLA) ? fs.readdirSync(CARTELLA).filter((f) => f.endsWith(".md")).sort() : [];
  manuale = file.map((nome) => {
    const tutto = fs.readFileSync(path.join(CARTELLA, nome), "utf8").replace(/\r/g, "");
    const [testa, ...corpo] = tutto.split(/^---$/m);
    const campo = (k) => (new RegExp(`^${k}:\\s*(.+)$`, "m").exec(testa) || [])[1]?.trim() ?? "";
    const ruoli = campo("ruoli").split(",").map((r) => r.trim()).filter(Boolean);
    return {
      slug: nome.replace(/^\d+-/, "").replace(/\.md$/, ""),
      titolo: campo("titolo") || nome,
      ruoli: ruoli.length ? ruoli : ["tutti"],
      testo: corpo.join("---").trim(),
    };
  });
  return manuale;
}

const puoLeggere = (pagina, utente) => pagina.ruoli.includes("tutti") || pagina.ruoli.includes(utente.ruolo);
const paginePerUtente = (utente) => leggiManuale().filter((p) => puoLeggere(p, utente));
const paginaManuale = (slug, utente) => paginePerUtente(utente).find((p) => p.slug === slug) ?? null;

// ── Procedure dello studio ───────────────────────────────────
const procedure = (db) => db.prepare(
  `SELECT g.*, u.nome AS autore FROM guida_pagine g LEFT JOIN utenti u ON u.id = g.autore_id ORDER BY g.ordine, g.titolo`
).all();
const trovaProcedura = (db, id) => db.prepare(
  "SELECT g.*, u.nome AS autore FROM guida_pagine g LEFT JOIN utenti u ON u.id = g.autore_id WHERE g.id = ?"
).get(Number(id)) ?? null;

function controllaProcedura(corpo) {
  const dati = {
    titolo: String(corpo?.titolo ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
    testo: String(corpo?.testo ?? "").replace(/\r/g, "").trim().slice(0, 50_000),
    ordine: Number.isInteger(Number(corpo?.ordine)) ? Number(corpo.ordine) : 0,
  };
  const errori = [];
  if (dati.titolo.length < 3) errori.push("Scrivi il titolo della pagina.");
  if (dati.testo.length < 3) errori.push("La pagina è vuota.");
  return { dati, errori };
}

function salvaProcedura(db, id, dati, autore) {
  if (id) {
    db.prepare("UPDATE guida_pagine SET titolo = ?, testo = ?, ordine = ?, modificata = ?, autore_id = ? WHERE id = ?")
      .run(dati.titolo, dati.testo, dati.ordine, Date.now(), autore, Number(id));
    registra(db, autore, "Guida", `Modificata la pagina «${dati.titolo}»`);
    return Number(id);
  }
  const nuovo = Number(db.prepare("INSERT INTO guida_pagine (titolo, testo, ordine, modificata, autore_id) VALUES (?, ?, ?, ?, ?)")
    .run(dati.titolo, dati.testo, dati.ordine, Date.now(), autore).lastInsertRowid);
  registra(db, autore, "Guida", `Nuova pagina «${dati.titolo}»`);
  return nuovo;
}

function eliminaProcedura(db, id, autore) {
  const p = trovaProcedura(db, id);
  if (!p) return;
  db.prepare("DELETE FROM guida_pagine WHERE id = ?").run(p.id);
  registra(db, autore, "Guida", `Eliminata la pagina «${p.titolo}»`);
}

// ── Ricerca nel manuale e nelle procedure ────────────────────
// Restituisce i risultati con un pezzetto di testo intorno alla parola trovata.
function cerca(db, utente, q) {
  const parole = String(q ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 2).slice(0, 6);
  if (!parole.length) return [];
  const voci = [
    ...paginePerUtente(utente).map((p) => ({ tipo: "manuale", titolo: p.titolo, link: `/guida/${p.slug}`, testo: testoPiano(p.testo) })),
    ...procedure(db).map((p) => ({ tipo: "studio", titolo: p.titolo, link: `/guida/studio/${p.id}`, testo: testoPiano(p.testo) })),
  ];
  return voci
    .map((v) => {
      const dove = `${v.titolo} ${v.testo}`.toLowerCase();
      if (!parole.every((p) => dove.includes(p))) return null;
      const punteggio = parole.reduce((t, p) => t + (v.titolo.toLowerCase().includes(p) ? 5 : 1), 0);
      const i = v.testo.toLowerCase().indexOf(parole[0]);
      const da = Math.max(0, i - 60);
      const estratto = (da > 0 ? "…" : "") + v.testo.slice(da, da + 180) + (v.testo.length > da + 180 ? "…" : "");
      return { ...v, punteggio, estratto };
    })
    .filter(Boolean)
    .sort((a, b) => b.punteggio - a.punteggio);
}

module.exports = { paginePerUtente, paginaManuale, procedure, trovaProcedura, controllaProcedura, salvaProcedura, eliminaProcedura, cerca };
