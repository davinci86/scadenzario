// ─────────────────────────────────────────────────────────────
// ROTTE DELLO SCADENZARIO
//   GET  /scadenzario                 la tabella (con filtri)
//   GET  /scadenze/nuova              il modulo di inserimento
//   POST /scadenze                    salva una nuova scadenza
//   GET  /scadenze/:id                il dettaglio di una scadenza
//   POST /scadenze/:id/…              le azioni (stato, squadra, nota…)
//   GET  /api/termine                 calcola un termine (per l'anteprima nel modulo)
// ─────────────────────────────────────────────────────────────
const express = require("express");
const config = require("../config");
const { richiediAccesso } = require("../auth/permessi");
const { puoModificare, puoLavorare, eAdmin } = require("../auth/regole");
const { registra } = require("../db/registro");
const { notifica } = require("../db/notifiche");
const S = require("../db/scadenze");
const { attiAttivi, trovaAtto, aRegola, chiusure } = require("../db/atti");
const { calcolaTermine, regolaAParole, spiegaCalcolo } = require("../dominio/termini");
const { TIPI, statiDi, primoStato, eChiuso } = require("../dominio/stati");
const D = require("../dominio/date");
const { paginaScadenzario } = require("../views/scadenzario");
const { paginaNuova, moduloNuova } = require("../views/nuova");
const { paginaScadenza, contenutoScadenza } = require("../views/scadenza");

// Le richieste fatte dal pannello laterale e dalla finestra di inserimento
// arrivano con l'intestazione "X-Parziale": a loro mandiamo solo il pezzo
// di pagina che serve (o una risposta JSON), non la pagina intera.
const parziale = (req) => req.get("X-Parziale") === "1";
const { paginaErrore } = require("../views/errore");

// ── Lettura del modulo "Nuova scadenza" ─────────────────────
// Controlla i dati inviati e, se sono validi, calcola la scadenza.
// Restituisce { dati, squadra } oppure { errori }.
function leggiNuovaScadenza(db, corpo) {
  const errori = [];
  const testo = (campo, max) => String(corpo[campo] ?? "").trim().slice(0, max);

  const tipo = corpo.tipo;
  if (!TIPI[tipo]) errori.push("Scegli il tipo.");

  const dati = {
    tipo,
    cliente: testo("cliente", 200),
    attivita: testo("attivita", 300),
    ufficio: testo("ufficio", 200),
    fascicolo: testo("fascicolo", 50).toUpperCase(),
    stato: TIPI[tipo] ? primoStato(tipo) : "",
  };
  if (!dati.cliente) errori.push("Manca il cliente.");

  if (tipo === "udienza") {
    dati.data = testo("data", 10);
    dati.ora = testo("ora", 5);
    if (!D.eValida(dati.data)) errori.push("Manca la data dell'udienza.");
    if (dati.ora && !/^\d{2}:\d{2}$/.test(dati.ora)) errori.push("L'ora non è valida.");
    if (!dati.attivita) errori.push("Manca l'attività.");
  } else if (TIPI[tipo]) {
    const scelta = String(corpo.atto ?? "");
    dati.data_evento = testo("data_evento", 10) || null;

    if (!scelta) {
      errori.push("Scegli l'atto.");
    } else if (scelta === "altro") {
      // Atto fuori catalogo: resta "da verificare" per l'Admin
      dati.da_verificare = true;
      if (dati.data_evento && !D.eValida(dati.data_evento)) errori.push("La data di decorrenza non è valida.");
      if (corpo.termine_altro === "manuale") {
        dati.data = testo("data", 10);
        dati.calcolo = "Data forzata a mano";
        if (!D.eValida(dati.data)) errori.push("Manca la data di scadenza.");
      } else {
        const giorni = Number(corpo.termine_altro);
        if (!config.terminiAltro.includes(giorni)) errori.push("Scegli il termine.");
        else if (!D.eValida(dati.data_evento)) errori.push("Manca la data di decorrenza.");
        else {
          const regola = { giorni, direzione: "avanti", evento: "decorrenza",
            sospensioneFeriale: corpo.feriale_altro === "1", spostaGiornoUtile: true };
          dati.data = calcolaTermine(dati.data_evento, regola, chiusure(db)).data;
          dati.calcolo = regolaAParole(regola);
        }
      }
      if (!dati.attivita) errori.push("Manca l'attività.");
    } else {
      // Atto del catalogo: il termine lo calcola l'app
      const atto = trovaAtto(db, Number(scelta));
      if (!atto || !atto.attivo || atto.tipo !== tipo) errori.push("L'atto scelto non è valido.");
      else if (!D.eValida(dati.data_evento)) errori.push("Manca la data da cui decorre il termine.");
      else {
        const regola = aRegola(atto);
        dati.atto_id = atto.id;
        dati.data = calcolaTermine(dati.data_evento, regola, chiusure(db)).data;
        dati.calcolo = regolaAParole(regola);
        if (!dati.attivita) dati.attivita = atto.nome;
      }
    }
  }

  // La squadra: solo utenti attivi; il referente deve farne parte
  const attivi = new Set(S.utentiAttivi(db).map((u) => u.id));
  const squadra = [...new Set([].concat(corpo.squadra ?? []).map(Number))].filter((id) => attivi.has(id));
  const referente = Number(corpo.referente);
  dati.referente_id = squadra.includes(referente) ? referente : squadra[0] ?? null;

  return errori.length ? { errori } : { dati, squadra };
}

function rotteScadenze(db) {
  const router = express.Router();
  const nonTrovata = (req, res) =>
    res.status(404).send(paginaErrore(req.utente, "Scadenza non trovata", "Questa scadenza non esiste."));
  const vietato = (req, res) =>
    res.status(403).send(paginaErrore(req.utente, "Azione non consentita", "Non hai i permessi per questa azione."));

  // ── La tabella ──
  router.get("/scadenzario", richiediAccesso, (req, res) => {
    const filtri = {
      q: String(req.query.q ?? "").trim().slice(0, 100),
      tipo: TIPI[req.query.tipo] ? req.query.tipo : "",
      stato: String(req.query.stato ?? ""),
      persona: String(req.query.persona ?? ""),
      chiuse: req.query.chiuse === "1",
    };
    res.send(paginaScadenzario(req.utente, S.elencoScadenze(db, filtri), filtri, S.utentiAttivi(db)));
  });

  // ── Nuova scadenza ──
  router.get("/scadenze/nuova", richiediAccesso, (req, res) => {
    if (!puoModificare(req.utente)) return vietato(req, res);
    if (parziale(req)) return res.send(moduloNuova(attiAttivi(db), S.utentiAttivi(db)));
    res.send(paginaNuova(req.utente, attiAttivi(db), S.utentiAttivi(db)));
  });

  router.post("/scadenze", richiediAccesso, (req, res) => {
    if (!puoModificare(req.utente)) return vietato(req, res);
    const esito = leggiNuovaScadenza(db, req.body ?? {});
    if (esito.errori) {
      const modulo = parziale(req)
        ? moduloNuova(attiAttivi(db), S.utentiAttivi(db), req.body, esito.errori)
        : paginaNuova(req.utente, attiAttivi(db), S.utentiAttivi(db), req.body, esito.errori);
      return res.status(400).send(modulo);
    }
    const { dati, squadra } = esito;
    const id = S.creaScadenza(db, dati, squadra, req.utente.id);
    S.aggiungiStorico(db, id, req.utente.id,
      `Scadenza inserita${dati.calcolo ? " · " + dati.calcolo : ""}${dati.da_verificare ? " · termine da verificare" : ""}`);
    // Notifiche: a chi è stato assegnato, e all'Admin se il termine va verificato
    for (const persona of squadra) {
      notifica(db, { utenti: [persona], scadenzaId: id, autore: req.utente.id,
        testo: `${req.utente.nome} ti ha assegnato ${dati.tipo === "udienza" ? "un'udienza" : "una scadenza"}${persona === dati.referente_id ? " come referente" : ""}` });
    }
    if (dati.da_verificare) {
      const admin = db.prepare("SELECT id FROM utenti WHERE ruolo = 'admin' AND attivo = 1").all().map((u) => u.id);
      notifica(db, { utenti: admin, scadenzaId: id, autore: req.utente.id,
        testo: `Termine da verificare: atto fuori catalogo · ${dati.calcolo}, scadenza ${D.formatta(dati.data)}` });
    }
    registra(db, req.utente.id, "Creazione", `N. ${id} · ${dati.cliente} · ${dati.attivita}`);
    if (parziale(req)) return res.json({ id });
    res.redirect(`/scadenze/${id}`);
  });

  // ── Dettaglio ──
  router.get("/scadenze/:id", richiediAccesso, (req, res) => {
    const s = S.trovaScadenza(db, Number(req.params.id));
    if (!s) return nonTrovata(req, res);
    const atto = s.atto_id ? trovaAtto(db, s.atto_id) : null;
    const rinvio = s.rinviata_a ? S.trovaScadenza(db, s.rinviata_a) : null;
    const extra = {
      atto, rinvio, storico: S.storicoScadenza(db, s.id), utenti: S.utentiAttivi(db),
      errore: String(req.query.errore ?? "").slice(0, 200),
    };
    res.send(parziale(req) ? contenutoScadenza(req.utente, s, extra) : paginaScadenza(req.utente, s, extra));
  });

  // ── Le azioni sul dettaglio ──
  // Ogni azione: trova la scadenza, controlla il permesso, esegue,
  // e torna al dettaglio (con un eventuale messaggio d'errore).
  // "esegui" può restituire: niente (tutto ok), un testo (errore),
  // oppure { vai: numero } per passare a un'altra scadenza (es. il rinvio).
  function azione(percorso, permesso, esegui) {
    router.post(`/scadenze/:id/${percorso}`, richiediAccesso, (req, res) => {
      const s = S.trovaScadenza(db, Number(req.params.id));
      if (!s) return nonTrovata(req, res);
      if (!permesso(s, req.utente)) return vietato(req, res);
      const esito = esegui(s, req.body ?? {}, req.utente);
      const errore = typeof esito === "string" ? esito : "";
      const vai = esito?.vai ?? s.id;
      if (parziale(req)) return res.status(errore ? 400 : 200).json({ id: vai, errore });
      res.redirect(`/scadenze/${vai}` + (errore ? `?errore=${encodeURIComponent(errore)}` : ""));
    });
  }
  const traccia = (s, utente, testoStorico, azioneRegistro = "Modifica") => {
    S.aggiungiStorico(db, s.id, utente.id, testoStorico);
    registra(db, utente.id, azioneRegistro, `N. ${s.id} · ${s.cliente} · ${testoStorico}`);
  };
  const soloEditor = (s, u) => puoModificare(u);
  // Avvisa la squadra (tranne chi ha fatto l'azione); se non c'è squadra, nessuno.
  const avvisaSquadra = (s, utente, testo) =>
    notifica(db, { utenti: s.squadra.map((p) => p.id), scadenzaId: s.id, autore: utente.id, testo });

  // Cambio di stato
  azione("stato", puoLavorare, (s, corpo, utente) => {
    const nuovo = String(corpo.stato ?? "");
    if (!statiDi(s.tipo).includes(nuovo) || nuovo === "Rinviata") return "Stato non valido.";
    if (nuovo === s.stato) return;
    S.aggiornaScadenza(db, s.id, { stato: nuovo });
    traccia(s, utente, `Stato: ${s.stato} → ${nuovo}`, "Stato");
    avvisaSquadra(s, utente, `${utente.nome} ha portato lo stato a «${nuovo}»`);
  });

  // Rinvio di un'udienza: chiude questa e ne crea una nuova con la nuova data
  azione("rinvio", puoLavorare, (s, corpo, utente) => {
    if (s.tipo !== "udienza" || eChiuso(s.stato)) return "Si possono rinviare solo le udienze aperte.";
    const data = String(corpo.data ?? ""), ora = String(corpo.ora ?? "");
    if (!D.eValida(data)) return "Indica la nuova data dell'udienza.";
    if (ora && !/^\d{2}:\d{2}$/.test(ora)) return "L'ora non è valida.";
    const nuovaId = S.creaScadenza(db, {
      tipo: "udienza", cliente: s.cliente, attivita: s.attivita, ufficio: s.ufficio, fascicolo: s.fascicolo,
      data, ora, stato: primoStato("udienza"), referente_id: s.referente_id,
    }, s.squadra.map((p) => p.id), utente.id);
    S.aggiornaScadenza(db, s.id, { stato: "Rinviata", rinviata_a: nuovaId });
    traccia(s, utente, `Udienza rinviata al ${D.formatta(data)}${ora ? " ore " + ora : ""} (nuova udienza N. ${nuovaId})`, "Rinvio");
    S.aggiungiStorico(db, nuovaId, utente.id, `Creata dal rinvio dell'udienza N. ${s.id}`);
    notifica(db, { utenti: s.squadra.map((p) => p.id), scadenzaId: nuovaId, autore: utente.id,
      testo: `Udienza rinviata al ${D.formatta(data)}${ora ? " ore " + ora : ""}` });
    return { vai: nuovaId };
  });

  // Coinvolgere una persona (o assegnare una scadenza che non ha nessuno)
  azione("squadra", puoLavorare, (s, corpo, utente) => {
    const persona = S.utentiAttivi(db).find((u) => u.id === Number(corpo.utente));
    if (!persona) return "Persona non valida.";
    if (s.squadra.some((p) => p.id === persona.id)) return;
    S.aggiungiAllaSquadra(db, s.id, persona.id);
    const prima = s.squadra.length === 0;
    if (prima || !s.referente_id) S.aggiornaScadenza(db, s.id, { referente_id: persona.id });
    traccia(s, utente, prima ? `Assegnata a ${persona.nome} (referente)` : `Coinvolto: ${persona.nome}`, prima ? "Assegnazione" : "Modifica");
    notifica(db, { utenti: [persona.id], scadenzaId: s.id, autore: utente.id,
      testo: prima ? `${utente.nome} ti ha assegnato questa attività come referente` : `${utente.nome} ti ha coinvolto` });
  });

  // Togliere una persona (solo Admin ed Editor)
  azione("squadra/togli", soloEditor, (s, corpo, utente) => {
    const persona = s.squadra.find((p) => p.id === Number(corpo.utente));
    if (!persona) return;
    S.togliDallaSquadra(db, s.id, persona.id);
    if (s.referente_id === persona.id) {
      const altro = s.squadra.find((p) => p.id !== persona.id);
      S.aggiornaScadenza(db, s.id, { referente_id: altro ? altro.id : null });
    }
    traccia(s, utente, `Tolto dalla squadra: ${persona.nome}`);
  });

  // Cambiare referente
  azione("referente", puoLavorare, (s, corpo, utente) => {
    const persona = s.squadra.find((p) => p.id === Number(corpo.utente));
    if (!persona) return "Il referente deve far parte della squadra.";
    S.aggiornaScadenza(db, s.id, { referente_id: persona.id });
    traccia(s, utente, `Referente: ${persona.nome}`);
    notifica(db, { utenti: [persona.id], scadenzaId: s.id, autore: utente.id, testo: `${utente.nome} ti ha nominato referente` });
  });

  // Nota libera nello storico
  azione("nota", puoLavorare, (s, corpo, utente) => {
    const nota = String(corpo.nota ?? "").trim().slice(0, 2000);
    if (!nota) return "La nota è vuota.";
    traccia(s, utente, `Nota: ${nota}`, "Nota");
    avvisaSquadra(s, utente, `Nuova nota di ${utente.nome}: ${nota.length > 80 ? nota.slice(0, 80) + "…" : nota}`);
  });

  // Correzione manuale della data: sempre con il motivo
  azione("correggi", soloEditor, (s, corpo, utente) => {
    const data = String(corpo.data ?? ""), ora = String(corpo.ora ?? s.ora ?? "");
    const motivo = String(corpo.motivo ?? "").trim().slice(0, 500);
    if (!D.eValida(data)) return "La data non è valida.";
    if (ora && !/^\d{2}:\d{2}$/.test(ora)) return "L'ora non è valida.";
    if (motivo.length < 5) return "Scrivi il motivo della correzione.";
    if (data === s.data && ora === s.ora) return "La data è uguale a quella attuale.";
    S.aggiornaScadenza(db, s.id, { data, ora, correzione_manuale: s.tipo === "udienza" ? null : motivo });
    traccia(s, utente, `Data corretta a mano da ${D.formatta(s.data)} a ${D.formatta(data)}. Motivo: ${motivo}`, "Correzione");
    avvisaSquadra(s, utente, `Data cambiata: ora ${D.formatta(data)}${ora ? " ore " + ora : ""} (prima ${D.formatta(s.data)})`);
  });

  // Ricalcolo da una nuova data di decorrenza, con la regola del catalogo
  azione("ricalcola", soloEditor, (s, corpo, utente) => {
    const atto = s.atto_id ? trovaAtto(db, s.atto_id) : null;
    if (!atto) return "Questa scadenza non ha un atto del catalogo.";
    const dataEvento = String(corpo.data_evento ?? "");
    if (!D.eValida(dataEvento)) return "La data di decorrenza non è valida.";
    const regola = aRegola(atto);
    const { data } = calcolaTermine(dataEvento, regola, chiusure(db));
    S.aggiornaScadenza(db, s.id, { data_evento: dataEvento, data, calcolo: regolaAParole(regola), correzione_manuale: null });
    traccia(s, utente, `Ricalcolo dalla decorrenza del ${D.formatta(dataEvento)}: scadenza ${D.formatta(data)} (prima ${D.formatta(s.data)})`);
    if (data !== s.data) avvisaSquadra(s, utente, `Termine ricalcolato: ora scade ${D.formatta(data)} (prima ${D.formatta(s.data)})`);
  });

  // Conferma del termine di un atto fuori catalogo: solo l'Admin
  azione("verifica", (s, u) => eAdmin(u), (s, corpo, utente) => {
    if (!s.da_verificare) return;
    S.aggiornaScadenza(db, s.id, { da_verificare: 0 });
    traccia(s, utente, `Termine verificato e confermato: ${D.formatta(s.data)}`, "Verifica");
  });

  // ── Anteprima del calcolo (usata dal modulo mentre si compila) ──
  // Risponde in JSON, il formato con cui JavaScript si scambia dati.
  router.get("/api/termine", richiediAccesso, (req, res) => {
    const data = String(req.query.data ?? "");
    if (!D.eValida(data)) return res.status(400).json({ errore: "Data non valida" });
    let regola;
    if (req.query.atto) {
      const atto = trovaAtto(db, Number(req.query.atto));
      if (!atto) return res.status(404).json({ errore: "Atto non trovato" });
      regola = aRegola(atto);
    } else {
      const giorni = Number(req.query.giorni);
      if (!config.terminiAltro.includes(giorni)) return res.status(400).json({ errore: "Termine non valido" });
      regola = { giorni, direzione: "avanti", evento: "decorrenza", sospensioneFeriale: req.query.feriale === "1", spostaGiornoUtile: true };
    }
    const risultato = calcolaTermine(data, regola, chiusure(db));
    res.json({
      data: risultato.data,
      formattata: D.formatta(risultato.data),
      giorniDaOggi: D.giorniDaOggi(risultato.data),
      regola: regolaAParole(regola),
      spiegazione: spiegaCalcolo(data, regola, risultato),
    });
  });

  return router;
}

module.exports = { rotteScadenze, leggiNuovaScadenza };
