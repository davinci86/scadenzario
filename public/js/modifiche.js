// ─────────────────────────────────────────────────────────────
// MODIFICHE NON SALVATE
// Se hai scritto qualcosa e stai per uscire senza salvare, l'app se ne
// accorge e ti chiede cosa fare:
//   [Salva e continua]  [Continua senza salvare]  [Resta qui]
//
// Come capisce che hai scritto qualcosa? Ogni campo di un modulo ricorda
// il valore con cui la pagina l'ha mostrato (il suo "valore di partenza":
// defaultValue, defaultChecked, defaultSelected). Se il valore attuale è
// diverso, quel modulo ha modifiche non salvate.
//
// Si controllano solo i moduli che salvano qualcosa (method="post").
// I filtri e le ricerche (method="get") non contano.
//
// Le uscite controllate:
//  • chiudere il pannello laterale o la finestra (×, Esc, clic fuori)
//  • passare a un'altra scadenza nel pannello
//  • "← Torna allo scadenzario", i link del menu, Esci, cambio tema…
//  • un'altra azione nella stessa scheda (che la ricaricherebbe)
//  • chiudere la scheda, ricaricarla, tornare indietro col browser:
//    qui il browser mostra il SUO avviso (il testo non si può cambiare,
//    e non può offrire "Salva": per sicurezza i browser non lo permettono).
// ─────────────────────────────────────────────────────────────
(function () {
  let uscitaConsentita = false; // true quando l'uscita è voluta (già confermata)
  let salvataggio = null;       // funzione fornita da pannelli.js (vedi registraSalvataggio)

  // ── 1. Capire se un modulo ha modifiche ──────────────────────
  function campoCambiato(campo) {
    if (campo.disabled || !campo.name) return false;
    if (["hidden", "submit", "button", "reset", "file"].includes(campo.type)) return false;
    if (campo.type === "checkbox" || campo.type === "radio") return campo.checked !== campo.defaultChecked;
    if (campo.tagName === "SELECT") {
      if (campo.multiple) return [...campo.options].some((o) => o.selected !== o.defaultSelected);
      const partenza = [...campo.options].findIndex((o) => o.defaultSelected);
      return campo.selectedIndex !== (partenza < 0 ? 0 : partenza);
    }
    return campo.value !== campo.defaultValue; // testo, data, ora, numero, area di testo
  }

  function haModifiche(modulo) {
    if ((modulo.getAttribute("method") || "get").toLowerCase() !== "post") return false;
    if (modulo.matches("[data-rapido], [data-blocca-ora]")) return false;
    // Il server ha rimandato indietro il modulo con degli errori: non è salvato
    if (modulo.hasAttribute("data-non-salvato")) return true;
    return [...modulo.elements].some(campoCambiato);
  }

  // Tutti i moduli con modifiche dentro "radice" (di solito tutta la pagina)
  function moduliModificati(radice = document) {
    return [...radice.querySelectorAll("form")].filter(haModifiche);
  }

  // Dopo un salvataggio: i valori attuali diventano i nuovi "valori di partenza"
  function fissa(modulo) {
    modulo.removeAttribute("data-non-salvato");
    for (const campo of modulo.elements) {
      if ("defaultChecked" in campo && (campo.type === "checkbox" || campo.type === "radio")) campo.defaultChecked = campo.checked;
      else if (campo.tagName === "SELECT") for (const o of campo.options) o.defaultSelected = o.selected;
      else if ("defaultValue" in campo) campo.defaultValue = campo.value;
    }
  }

  // "Continua senza salvare": i campi tornano come erano
  function scarta(modulo) {
    modulo.removeAttribute("data-non-salvato");
    modulo.reset();
  }

  // Un nome comprensibile per l'elenco nella finestra di avviso
  function nomeDi(modulo) {
    return modulo.dataset.nome
      || modulo.closest("section")?.querySelector("h2")?.textContent.trim()
      || "Un modulo";
  }

  // ── 2. La finestra di avviso ────────────────────────────────
  // <dialog> è un elemento del browser fatto apposta: sta sopra a tutto
  // e con Esc si chiude da solo (e Esc qui vuol dire "Resta qui").
  const avviso = document.createElement("dialog");
  avviso.className = "avviso-modifiche";
  avviso.innerHTML = `
    <h2>Ci sono modifiche non salvate</h2>
    <p>Hai scritto qualcosa che non è ancora stato salvato:</p>
    <ul></ul>
    <p class="nota">Cosa vuoi fare?</p>
    <div class="scelte-avviso">
      <button type="button" class="btn pri" data-scelta="salva">Salva e continua</button>
      <button type="button" class="btn pericolo" data-scelta="scarta">Continua senza salvare</button>
      <button type="button" class="btn" data-scelta="resta">Resta qui</button>
    </div>`;
  document.body.append(avviso);

  avviso.addEventListener("click", (evento) => {
    const bottone = evento.target.closest("[data-scelta]");
    if (bottone) avviso.close(bottone.dataset.scelta);
  });

  async function chiediCosaFare(moduli) {
    // Aspettiamo un istante: se l'uscita è partita col tasto Esc, quello
    // stesso Esc altrimenti chiuderebbe subito anche l'avviso appena aperto.
    await new Promise((pronto) => setTimeout(pronto, 0));
    const elenco = avviso.querySelector("ul");
    elenco.replaceChildren(...[...new Set(moduli.map(nomeDi))].map((nome) => {
      const voce = document.createElement("li");
      voce.textContent = nome; // textContent: niente HTML, solo testo
      return voce;
    }));
    avviso.returnValue = "";
    avviso.showModal();
    avviso.querySelector("[data-scelta=salva]").focus();
    return new Promise((risolvi) =>
      avviso.addEventListener("close", () => risolvi(avviso.returnValue || "resta"), { once: true }));
  }

  // ── 3. La domanda vera e propria ────────────────────────────
  // Da chiamare PRIMA di fare qualcosa che farebbe perdere le modifiche.
  // Risponde true (vai pure) o false (fermati, l'utente resta qui).
  //   radice: dove guardare (tutta la pagina, il pannello, la finestra…)
  //   tranne: un modulo da non considerare (quello che si sta inviando)
  async function primaDiUscire(radice = document, { tranne } = {}) {
    const moduli = moduliModificati(radice).filter((m) => m !== tranne);
    if (!moduli.length) return true;

    const scelta = await chiediCosaFare(moduli);
    if (scelta === "resta") return false;
    if (scelta === "scarta") { moduli.forEach(scarta); return true; }

    // "Salva e continua": si salvano uno alla volta; al primo problema ci si ferma
    for (const modulo of moduli) {
      if (!modulo.checkValidity()) { modulo.reportValidity(); return false; } // es. manca il motivo
      const esito = salvataggio ? await salvataggio(modulo) : undefined;
      if (esito === undefined) {
        // Modulo "normale" (es. il profilo): lo inviamo come farebbe il pulsante.
        // La pagina cambia, quindi l'uscita originale non prosegue.
        uscitaConsentita = true;
        modulo.submit();
        return false;
      }
      if (!esito) return false; // il server ha segnalato un errore: resta qui e lo vedi
      fissa(modulo);
    }
    return true;
  }

  // Per uscire da codice (dopo aver già chiesto, o quando non c'è scelta)
  function esci(url, { sostituisci = false } = {}) {
    uscitaConsentita = true;
    if (sostituisci) location.replace(url); // non aggiunge un passo al "indietro"
    else location.href = url;
  }

  // ── 4. Le uscite "normali" della pagina ─────────────────────

  // "← Torna allo scadenzario": chiude questa scheda e si torna a quella di prima.
  // Se il browser non permette di chiuderla (succede se la scheda non è stata
  // aperta dall'app), si va semplicemente allo scadenzario.
  document.addEventListener("click", async (evento) => {
    const torna = evento.target.closest("a[data-torna]");
    if (!torna) return;
    evento.preventDefault();
    if (!(await primaDiUscire())) return;
    uscitaConsentita = true;
    window.close();
    setTimeout(() => esci(torna.href), 300); // se siamo ancora qui, la chiusura non è riuscita
  });

  // I link che portano altrove nella stessa scheda (menu, profilo…)
  document.addEventListener("click", async (evento) => {
    const link = evento.target.closest("a[href]");
    if (!link || evento.defaultPrevented) return;
    if (link.matches("[data-torna], [data-scadenza], [data-nuova], [data-chiudi], [data-segnala]")) return; // li gestisce pannelli.js
    if (link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href").startsWith("#")) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return; // nuova scheda
    if (!moduliModificati().length) return;
    evento.preventDefault();
    if (await primaDiUscire()) esci(link.href);
  });

  // I moduli che cambiano pagina (Esci, tema, profilo, filtri…).
  // Quelli del pannello, della finestra e del dettaglio li gestisce pannelli.js.
  document.addEventListener("submit", async (evento) => {
    const modulo = evento.target;
    if (modulo.matches("[data-rapido], [data-blocca-ora]")) return;
    if (modulo.closest(".cassetto-corpo, [data-dettaglio], .finestra-box, .blocco")) return;
    if (moduliModificati().some((m) => m !== modulo)) {
      evento.preventDefault();
      if (!(await primaDiUscire(document, { tranne: modulo }))) return;
      uscitaConsentita = true;
      return modulo.requestSubmit(evento.submitter);
    }
    uscitaConsentita = true; // si sta salvando proprio questo modulo: nessun avviso
  }, true);

  // Chiusura della scheda, ricarica, "indietro" del browser: avviso del browser
  window.addEventListener("beforeunload", (evento) => {
    if (uscitaConsentita || !moduliModificati().length) return;
    evento.preventDefault();
    evento.returnValue = ""; // per i browser più vecchi
  });
  // Se la pagina torna visibile dalla cache del browser, si riparte da capo
  window.addEventListener("pageshow", () => { uscitaConsentita = false; });

  window.modifiche = {
    moduliModificati,
    primaDiUscire,
    esci,
    fissa,
    consentiUscita: () => { uscitaConsentita = true; },
    chiudiAvviso: () => { if (avviso.open) avviso.close("resta"); },
    registraSalvataggio: (funzione) => { salvataggio = funzione; },
  };
})();
