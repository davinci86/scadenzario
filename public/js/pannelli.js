// ─────────────────────────────────────────────────────────────
// PANNELLO LATERALE E FINESTRA DI INSERIMENTO
//
// • Clic su una scadenza (riga della tabella o voce della dashboard):
//   si apre il pannello che scorre da destra, sopra la pagina.
// • Doppio clic: si apre la pagina intera, SEMPRE in una nuova scheda.
// • "+ Nuova scadenza": il modulo si apre in una finestra sovrapposta.
//
// Le azioni fatte nel pannello (stato, note, squadra…) vengono inviate
// al server "dietro le quinte" (fetch), senza cambiare pagina: poi il
// pannello e la tabella sotto si aggiornano da soli.
//
// Prima di ogni "uscita" (chiudere, cambiare scadenza, un'altra azione)
// si chiede a modifiche.js se ci sono modifiche non salvate.
// ─────────────────────────────────────────────────────────────

// Chiede al server un pezzo di pagina. Se la sessione è scaduta,
// il server rimanda al login: in quel caso ricarichiamo tutta la pagina.
async function chiedi(url, opzioni = {}) {
  const risposta = await fetch(url, {
    ...opzioni,
    headers: { "X-Parziale": "1", ...(opzioni.headers || {}) },
  });
  if (risposta.status === 401 || (risposta.redirected && new URL(risposta.url).pathname === "/login")) {
    window.modifiche.esci("/login?scaduta=1");
    throw new Error("Sessione scaduta");
  }
  if (risposta.status === 423) {
    window.mostraBlocco?.(false); // schermo bloccato: serve la password
    throw new Error("Schermo bloccato");
  }
  return risposta;
}

// Ricarica la parte della pagina sotto il pannello (tabella o dashboard)
async function aggiornaSotto() {
  const zona = document.querySelector("[data-aggiornabile]");
  if (!zona) return;
  const html = await (await chiedi(location.href, { headers: { "X-Parziale": "0" } })).text();
  const nuova = new DOMParser().parseFromString(html, "text/html").querySelector("[data-aggiornabile]");
  if (nuova) zona.replaceWith(nuova);
}
window.aggiornaSotto = aggiornaSotto; // la usa anche la campanella

// ── Il pannello laterale ─────────────────────────────────────
const laterale = document.createElement("div");
laterale.className = "laterale";
laterale.hidden = true;
laterale.innerHTML = `
  <div class="velo" data-chiudi></div>
  <aside class="cassetto" role="dialog" aria-modal="true" aria-label="Dettaglio della scadenza">
    <div class="cassetto-testa">
      <a class="btn piccolo" target="_blank" data-nuova-scheda>Apri in una nuova scheda ↗</a>
      <button class="chiudi" type="button" data-chiudi aria-label="Chiudi">×</button>
    </div>
    <div class="cassetto-corpo"></div>
  </aside>`;
document.body.append(laterale);
const corpoLaterale = laterale.querySelector(".cassetto-corpo");
let scadenzaAperta = null;

async function apriPannello(id) {
  scadenzaAperta = String(id);
  laterale.querySelector("[data-nuova-scheda]").href = `/scadenze/${id}`;
  if (laterale.hidden) {
    corpoLaterale.innerHTML = `<p class="nota">Caricamento…</p>`;
    laterale.hidden = false;
    document.body.classList.add("senza-scorrimento");
  }
  const risposta = await chiedi(`/scadenze/${id}`);
  corpoLaterale.innerHTML = await risposta.text(); // HTML preparato (e "pulito") dal server
  corpoLaterale.scrollTop = 0;
}

// Chiusura "chiesta" dall'utente: prima controlliamo le modifiche non salvate
async function chiediChiusuraPannello() {
  if (await window.modifiche.primaDiUscire(corpoLaterale)) chiudiPannello();
}

function chiudiPannello() {
  laterale.hidden = true;
  scadenzaAperta = null;
  document.body.classList.remove("senza-scorrimento");
}

// I moduli "rapidi" (es. "Letto" sulle notifiche): partono dietro le quinte,
// poi si aggiornano la pagina sotto e la campanella.
document.addEventListener("submit", async (evento) => {
  const modulo = evento.target;
  if (!modulo.matches("[data-rapido]")) return;
  evento.preventDefault();
  await chiedi(modulo.action, { method: "POST", body: new URLSearchParams(new FormData(modulo)) });
  await aggiornaSotto();
  window.aggiornaCampanella?.();
});

// Le azioni dentro il pannello (e nella pagina intera) partono senza cambiare pagina
document.addEventListener("submit", async (evento) => {
  const modulo = evento.target;
  if (modulo.matches("[data-rapido], [data-blocca-ora]")) return;
  const dentroPannello = modulo.closest(".cassetto-corpo");
  const dentroPagina = modulo.closest("[data-dettaglio]");
  if (!dentroPannello && !dentroPagina) return;
  evento.preventDefault();
  const dati = new URLSearchParams(new FormData(modulo, evento.submitter)); // va letto subito

  // Se in un ALTRO modulo c'è qualcosa di scritto e non salvato, chiediamo prima:
  // dopo l'azione il dettaglio si ricarica e quel testo andrebbe perso.
  const contenitore = dentroPannello || dentroPagina;
  if (!(await window.modifiche.primaDiUscire(contenitore, { tranne: modulo }))) return;

  const esito = await inviaAzione(modulo, dati);

  if (dentroPagina) {
    // Nella pagina intera: ricarichiamo la pagina della scadenza giusta.
    // "sostituisci" non allunga la cronologia: così "Torna allo scadenzario"
    // può ancora chiudere la scheda.
    if (!esito.errore) avvisaAltreSchede(esito.id);
    window.modifiche.esci(`/scadenze/${esito.id}` +
      (esito.errore ? `?errore=${encodeURIComponent(esito.errore)}` : ""), { sostituisci: true });
    return;
  }
  await apriPannello(esito.id);
  if (esito.errore) mostraErrore(corpoLaterale, esito.errore);
  aggiornaSotto();
  window.aggiornaCampanella?.();
});

// Invia un'azione (stato, nota, squadra…) e restituisce { id, errore }
async function inviaAzione(modulo, dati = new URLSearchParams(new FormData(modulo))) {
  const risposta = await chiedi(modulo.action, { method: "POST", body: dati });
  let esito = {};
  try { esito = await risposta.json(); } catch { esito = { errore: "Azione non consentita." }; }
  return { id: esito.id || modulo.action.split("/")[2], errore: esito.errore || "" };
}

function mostraErrore(contenitore, testo) {
  contenitore.querySelector(":scope > .errore-azione")?.remove();
  const box = document.createElement("div");
  box.className = "errore errore-azione";
  box.setAttribute("role", "alert");
  box.textContent = testo;
  contenitore.prepend(box);
  box.scrollIntoView({ block: "nearest" });
}

// Come si salva un modulo quando, nell'avviso, si sceglie "Salva e continua".
// Risponde true (salvato), false (errore: si resta) o undefined (non è roba nostra).
window.modifiche.registraSalvataggio(async (modulo) => {
  if (modulo.closest(".finestra-box")) {
    const risposta = await chiedi("/scadenze", { method: "POST", body: new URLSearchParams(new FormData(modulo)) });
    if (risposta.status === 400) { mostraModulo(await risposta.text()); return false; } // errori nel modulo
    if (!risposta.ok) return false;
    await aggiornaSotto();
    return true;
  }
  const contenitore = modulo.closest(".cassetto-corpo, [data-dettaglio]");
  if (!contenitore) return undefined;
  const esito = await inviaAzione(modulo);
  if (esito.errore) { mostraErrore(contenitore, esito.errore); return false; }
  avvisaAltreSchede(esito.id);
  if (contenitore === corpoLaterale) { aggiornaSotto(); window.aggiornaCampanella?.(); }
  return true;
});

// ── Le altre schede dello scadenzario ────────────────────────
// Quando salvi qualcosa nella scheda di una scadenza, lo scadenzario
// aperto nell'altra scheda si aggiorna da solo (BroadcastChannel è il
// "canale" con cui le schede della stessa app si parlano).
const canale = "BroadcastChannel" in window ? new BroadcastChannel("scadenzario") : null;
function avvisaAltreSchede(id) { canale?.postMessage({ modificata: String(id) }); }
canale?.addEventListener("message", async ({ data }) => {
  await aggiornaSotto();
  window.aggiornaCampanella?.();
  // Se il pannello mostra proprio quella scadenza e non ci hai scritto niente, lo rinfreschiamo
  if (scadenzaAperta === data.modificata && !window.modifiche.moduliModificati(corpoLaterale).length) {
    apriPannello(scadenzaAperta);
  }
});

// ── La finestra di inserimento ───────────────────────────────
const finestra = document.createElement("div");
finestra.className = "finestra";
finestra.hidden = true;
finestra.innerHTML = `<div class="velo" data-chiudi></div><div class="finestra-box" role="dialog" aria-modal="true" aria-label="Nuova scadenza"></div>`;
document.body.append(finestra);
const boxFinestra = finestra.querySelector(".finestra-box");

// Chiusura "chiesta" dall'utente: prima controlliamo le modifiche non salvate
async function chiediChiusuraFinestra() {
  if (await window.modifiche.primaDiUscire(boxFinestra)) chiudiFinestra();
}

function mostraModulo(html) {
  boxFinestra.innerHTML = html;
  const modulo = boxFinestra.querySelector("form");
  avviaModuloNuova(modulo); // da nuova-scadenza.js
  modulo.querySelector("#cliente")?.focus();
}

async function apriFinestra() {
  mostraModulo(await (await chiedi("/scadenze/nuova")).text());
  finestra.hidden = false;
  document.body.classList.add("senza-scorrimento");
}

function chiudiFinestra() {
  finestra.hidden = true;
  boxFinestra.innerHTML = "";
  if (laterale.hidden) document.body.classList.remove("senza-scorrimento");
}

boxFinestra.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const modulo = evento.target;
  const risposta = await chiedi("/scadenze", { method: "POST", body: new URLSearchParams(new FormData(modulo)) });
  if (risposta.status === 400) return mostraModulo(await risposta.text()); // errori: rimostra il modulo
  if (!risposta.ok) return alert("Non è stato possibile salvare la scadenza.");
  const { id } = await risposta.json();
  chiudiFinestra();
  await aggiornaSotto();
  apriPannello(id); // la nuova scadenza si apre subito nel pannello
});

// ── Clic, doppio clic e tasti ────────────────────────────────
document.addEventListener("click", (evento) => {
  if (evento.target.closest("[data-chiudi]")) {
    evento.preventDefault();
    return finestra.hidden ? chiediChiusuraPannello() : chiediChiusuraFinestra();
  }
  if (evento.target.closest("[data-nuova]")) {
    evento.preventDefault();
    return apriFinestra();
  }
  if (evento.target.closest("[data-nuova-scheda]")) return; // lascia aprire la nuova scheda

  const voce = evento.target.closest("[data-scadenza]");
  if (!voce) return;
  // Ctrl/Cmd + clic o clic con la rotellina: lasciamo fare al browser (nuova scheda)
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
  evento.preventDefault();
  // Aspettiamo un attimo prima di aprire il pannello: se arriva un secondo
  // clic è un doppio clic, e allora si apre la nuova scheda al suo posto.
  clearTimeout(attesaClic);
  if (evento.detail > 1) return;
  attesaClic = setTimeout(async () => {
    const id = voce.dataset.scadenza;
    // Pannello già aperto su un'altra scadenza con modifiche in sospeso? Chiediamo.
    if (!laterale.hidden && id !== scadenzaAperta && !(await window.modifiche.primaDiUscire(corpoLaterale))) return;
    apriPannello(id);
  }, 250);
});
let attesaClic;

document.addEventListener("dblclick", (evento) => {
  const voce = evento.target.closest("[data-scadenza]");
  if (!voce || voce.closest(".cassetto")) return;
  evento.preventDefault();
  clearTimeout(attesaClic);
  window.open(`/scadenze/${voce.dataset.scadenza}`, "_blank", "noopener");
});

document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Escape" || evento.defaultPrevented) return;
  if (document.querySelector("dialog[open]")) return; // Esc chiude solo l'avviso
  if (!finestra.hidden) chiediChiusuraFinestra();
  else if (!laterale.hidden) chiediChiusuraPannello();
});

// I filtri della tabella si applicano appena li cambi
document.addEventListener("change", (evento) => {
  const filtri = evento.target.closest("#filtri");
  if (filtri && evento.target.name !== "q") filtri.submit();
});
