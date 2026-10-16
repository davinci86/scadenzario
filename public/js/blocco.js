// ─────────────────────────────────────────────────────────────
// BLOCCO DELLO SCHERMO
// • Dopo X minuti senza toccare mouse o tastiera (X si sceglie nel
//   profilo, da 1 a 20) lo schermo si copre e serve la password.
// • "🔒 Blocca" in alto lo fa subito, per quando ci si allontana.
// Il blocco vale anche sul server: finché non si sblocca, il server
// non risponde a nessuna richiesta. Il velo qui serve a nascondere lo schermo.
// ─────────────────────────────────────────────────────────────
(function () {
  const minuti = Number(document.documentElement.dataset.minutiBlocco) || 10;
  let timer = null;
  let attivoDaUltimoSegnale = false;
  let bloccato = false;

  // Il velo che copre tutto
  const velo = document.createElement("div");
  velo.className = "blocco";
  velo.hidden = true;
  velo.innerHTML = `
    <form class="scheda blocco-scheda" autocomplete="off">
      <div class="marchio">Scadenzario</div>
      <p><b>Schermo bloccato.</b> Inserisci la tua password per continuare.</p>
      <p class="errore" role="alert" hidden></p>
      <label for="blocco-password">Password</label>
      <input id="blocco-password" type="password" autocomplete="current-password" required>
      <button class="btn pri" type="submit">Sblocca</button>
      <button class="link" type="button" data-esci>Non sei tu? Esci</button>
    </form>`;
  document.body.append(velo);
  const campo = velo.querySelector("input");
  const errore = velo.querySelector(".errore");

  async function mostraBlocco(avvisaServer = true) {
    if (bloccato) return;
    bloccato = true;
    clearTimeout(timer);
    window.modifiche.chiudiAvviso(); // l'avviso "modifiche non salvate" non resta sopra il velo
    if (avvisaServer) await fetch("/blocca", { method: "POST", headers: { "X-Parziale": "1" } }).catch(() => {});
    velo.hidden = false;
    errore.hidden = true;
    campo.value = "";
    campo.focus();
  }
  window.mostraBlocco = mostraBlocco; // la usano anche campanella e pannelli

  velo.querySelector("form").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const risposta = await fetch("/sblocca", {
      method: "POST",
      headers: { "X-Parziale": "1", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: campo.value }),
    });
    if (risposta.status === 401) return window.modifiche.esci("/login");
    if (!risposta.ok) {
      errore.textContent = (await risposta.json().catch(() => ({}))).errore || "Password non corretta.";
      errore.hidden = false;
      campo.select();
      return;
    }
    bloccato = false;
    velo.hidden = true;
    riavvia();
    window.aggiornaCampanella?.();
  });

  velo.querySelector("[data-esci]").addEventListener("click", () => {
    const f = document.createElement("form");
    f.method = "post";
    f.action = "/logout";
    document.body.append(f);
    window.modifiche.consentiUscita(); // uscita voluta: niente avviso del browser
    f.submit();
  });

  // "🔒 Blocca" in alto
  document.addEventListener("submit", (evento) => {
    if (!evento.target.matches("[data-blocca-ora]")) return;
    evento.preventDefault();
    mostraBlocco(true);
  });

  // Scorciatoia da tastiera: Ctrl+Alt+L (su Mac Ctrl+⌥+L).
  // Usiamo il tasto "fisico" (e.code), così funziona con qualunque tastiera.
  document.addEventListener("keydown", (evento) => {
    if (evento.ctrlKey && evento.altKey && evento.code === "KeyL") {
      evento.preventDefault();
      mostraBlocco(true);
    }
  });

  // Il menu che si apre cliccando sul proprio nome
  const pulsanteMenu = document.querySelector("[data-menu-utente]");
  const menu = document.querySelector(".menu-utente");
  if (pulsanteMenu && menu) {
    const chiudiMenu = () => { menu.hidden = true; pulsanteMenu.setAttribute("aria-expanded", "false"); };
    pulsanteMenu.addEventListener("click", (evento) => {
      evento.stopPropagation();
      menu.hidden = !menu.hidden;
      pulsanteMenu.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", (evento) => { if (!evento.target.closest(".menu-utente")) chiudiMenu(); });
    document.addEventListener("keydown", (evento) => { if (evento.key === "Escape") chiudiMenu(); });
    menu.addEventListener("submit", chiudiMenu);
  }

  // Il conto alla rovescia riparte a ogni movimento
  function riavvia() {
    clearTimeout(timer);
    timer = setTimeout(() => mostraBlocco(true), minuti * 60_000);
  }
  for (const tipo of ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"]) {
    document.addEventListener(tipo, () => {
      if (bloccato) return;
      attivoDaUltimoSegnale = true;
      riavvia();
    }, { passive: true, capture: true });
  }

  // Ogni 20 secondi, se la persona si è mossa, lo diciamo al server:
  // così il server non blocca chi sta leggendo una pagina senza cliccare.
  setInterval(() => {
    if (!attivoDaUltimoSegnale || bloccato) return;
    attivoDaUltimoSegnale = false;
    fetch("/api/attivita", { method: "POST" }).then((r) => { if (r.status === 423) mostraBlocco(false); }).catch(() => {});
  }, 20_000);

  riavvia();
})();
