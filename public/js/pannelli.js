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
// ─────────────────────────────────────────────────────────────

// Chiede al server un pezzo di pagina. Se la sessione è scaduta,
// il server rimanda al login: in quel caso ricarichiamo tutta la pagina.
async function chiedi(url, opzioni = {}) {
  const risposta = await fetch(url, {
    ...opzioni,
    headers: { "X-Parziale": "1", ...(opzioni.headers || {}) },
  });
  if (risposta.redirected && new URL(risposta.url).pathname === "/login") {
    location.href = "/login?scaduta=1";
    throw new Error("Sessione scaduta");
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
  scadenzaAperta = id;
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

function chiudiPannello() {
  laterale.hidden = true;
  scadenzaAperta = null;
  document.body.classList.remove("senza-scorrimento");
}

// Le azioni dentro il pannello (e nella pagina intera) partono senza cambiare pagina
document.addEventListener("submit", async (evento) => {
  const modulo = evento.target;
  const dentroPannello = modulo.closest(".cassetto-corpo");
  const dentroPagina = modulo.closest("[data-dettaglio]");
  if (!dentroPannello && !dentroPagina) return;
  evento.preventDefault();

  const dati = new URLSearchParams(new FormData(modulo, evento.submitter));
  const risposta = await chiedi(modulo.action, { method: "POST", body: dati });
  let esito = {};
  try { esito = await risposta.json(); } catch { esito = { errore: "Azione non consentita." }; }

  if (dentroPagina) {
    // Nella pagina intera: ricarichiamo la pagina della scadenza giusta
    location.href = `/scadenze/${esito.id || modulo.action.split("/")[2]}` +
      (esito.errore ? `?errore=${encodeURIComponent(esito.errore)}` : "");
    return;
  }
  await apriPannello(esito.id || scadenzaAperta);
  if (esito.errore) mostraErrore(esito.errore);
  aggiornaSotto();
});

function mostraErrore(testo) {
  const box = document.createElement("div");
  box.className = "errore";
  box.setAttribute("role", "alert");
  box.textContent = testo;
  corpoLaterale.prepend(box);
}

// ── La finestra di inserimento ───────────────────────────────
const finestra = document.createElement("div");
finestra.className = "finestra";
finestra.hidden = true;
finestra.innerHTML = `<div class="velo" data-chiudi></div><div class="finestra-box" role="dialog" aria-modal="true" aria-label="Nuova scadenza"></div>`;
document.body.append(finestra);
const boxFinestra = finestra.querySelector(".finestra-box");

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
    return finestra.hidden ? chiudiPannello() : chiudiFinestra();
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
  attesaClic = setTimeout(() => apriPannello(voce.dataset.scadenza), 250);
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
  if (evento.key !== "Escape") return;
  if (!finestra.hidden) chiudiFinestra();
  else if (!laterale.hidden) chiudiPannello();
});

// I filtri della tabella si applicano appena li cambi
document.addEventListener("change", (evento) => {
  const filtri = evento.target.closest("#filtri");
  if (filtri && evento.target.name !== "q") filtri.submit();
});
