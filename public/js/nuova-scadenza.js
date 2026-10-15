// ─────────────────────────────────────────────────────────────
// MODULO "NUOVA SCADENZA": comodità nel browser
// Questo codice gira nel browser, non sul server. Fa tre cose:
//  1. mostra solo i campi che servono per il tipo e l'atto scelti
//  2. chiede al server il calcolo del termine e lo mostra in anteprima
//  3. tiene coerenti squadra e referente
// È una funzione perché il modulo può comparire due volte in modi
// diversi: nella finestra sovrapposta (pannelli.js) o in una pagina sola.
// Se JavaScript fosse spento, il modulo funziona lo stesso.
// ─────────────────────────────────────────────────────────────
function avviaModuloNuova(modulo) {
  const $ = (id) => modulo.querySelector("#" + id);
  const tipoScelto = () => modulo.querySelector("input[name=tipo]:checked").value;

  function aggiornaCampi() {
    const tipo = tipoScelto();
    const udienza = tipo === "udienza";
    const atto = $("atto");

    // Gli atti si filtrano per tipo (scadenza o adempimento)
    for (const opzione of atto.querySelectorAll("option[data-tipo]")) {
      opzione.hidden = opzione.dataset.tipo !== tipo;
      if (opzione.hidden && opzione.selected) atto.value = "";
    }

    const scelta = atto.value;
    const altro = scelta === "altro";
    const manuale = altro && $("termine_altro").value === "manuale";
    const opzione = atto.selectedOptions[0];

    $("blocco-atto").hidden = udienza;
    $("blocco-altro").hidden = udienza || !altro;
    $("blocco-feriale").hidden = manuale;
    $("blocco-evento").hidden = udienza || !scelta;
    $("blocco-data").hidden = !(udienza || manuale);
    $("ora").hidden = !udienza;

    $("etichetta-evento").textContent = altro
      ? (manuale ? "Data di decorrenza (facoltativa)" : "Data di decorrenza")
      : opzione?.dataset.evento || "Data di decorrenza";
    $("etichetta-data").textContent = udienza ? "Data e ora dell'udienza" : "Data di scadenza, forzata a mano";
    $("regola-atto").textContent = opzione?.dataset.regola || "";

    // L'attività si compila con il nome dell'atto, se non l'hai già scritta tu
    const attivita = $("attivita");
    if (opzione?.dataset.tipo && (!attivita.value || attivita.dataset.automatica === "1")) {
      attivita.value = opzione.textContent;
      attivita.dataset.automatica = "1";
    }
    aggiornaAnteprima();
  }

  // Chiede al server di calcolare il termine: la regola sta in un posto solo.
  async function aggiornaAnteprima() {
    const box = $("anteprima");
    const scelta = $("atto").value;
    const dataEvento = $("data_evento").value;
    const manuale = scelta === "altro" && $("termine_altro").value === "manuale";
    if (tipoScelto() === "udienza" || !scelta || manuale || !dataEvento) { box.hidden = true; return; }

    const parametri = new URLSearchParams({ data: dataEvento });
    if (scelta === "altro") {
      parametri.set("giorni", $("termine_altro").value);
      parametri.set("feriale", modulo.feriale_altro.checked ? "1" : "0");
    } else {
      parametri.set("atto", scelta);
    }
    const risposta = await fetch("/api/termine?" + parametri);
    if (!risposta.ok) { box.hidden = true; return; }
    const r = await risposta.json();

    // Costruiamo il testo con textContent (mai innerHTML con dati): è più sicuro
    box.hidden = false;
    box.replaceChildren();
    const riga1 = document.createElement("div");
    const data = document.createElement("b");
    data.textContent = r.formattata;
    riga1.append("Scade ", data);
    if (r.giorniDaOggi < 0) riga1.append(" · già scaduta");
    else if (r.giorniDaOggi <= 7) riga1.append(` · tra ${r.giorniDaOggi} giorni`);
    const riga2 = document.createElement("div");
    riga2.className = "nota";
    riga2.textContent = r.spiegazione + ".";
    box.append(riga1, riga2);
  }

  // Squadra e referente sempre coerenti
  function sistemaReferente(evento) {
    const spuntati = [...modulo.querySelectorAll("input[name=squadra]:checked")].map((c) => c.value);
    const referenti = [...modulo.querySelectorAll("input[name=referente]")];
    if (evento.target.name === "referente") {
      modulo.querySelector(`input[name=squadra][value="${evento.target.value}"]`).checked = true;
      return;
    }
    if (!spuntati.length) referenti.forEach((r) => (r.checked = false));
    else if (!referenti.some((r) => r.checked && spuntati.includes(r.value))) {
      referenti.forEach((r) => (r.checked = r.value === spuntati[0]));
    }
  }

  modulo.addEventListener("change", (evento) => {
    if (["squadra", "referente"].includes(evento.target.name)) return sistemaReferente(evento);
    if (evento.target.id === "attivita") return;
    aggiornaCampi();
  });
  $("attivita").addEventListener("input", (e) => (e.target.dataset.automatica = "0"));
  $("data_evento").addEventListener("input", aggiornaAnteprima);
  aggiornaCampi();
}

// Se la pagina contiene già il modulo (pagina intera), lo avviamo subito.
const moduloInPagina = document.getElementById("nuova");
if (moduloInPagina) avviaModuloNuova(moduloInPagina);
