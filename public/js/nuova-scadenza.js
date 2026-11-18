// ─────────────────────────────────────────────────────────────
// MODULO "NUOVA SCADENZA": comodità nel browser
// Questo codice gira nel browser, non sul server. Fa tre cose:
//  1. mostra solo i campi che servono per il tipo e l'atto scelti
//  2. chiede al server il calcolo del termine e lo mostra in anteprima
//  3. tiene coerenti squadra e referente
//  4. propone la squadra predefinita della categoria (finché non la
//     cambi tu: da quel momento la tua scelta non viene più toccata)
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

    // La categoria: per un atto del catalogo è la sua materia (e non si cambia)
    const categoria = $("categoria");
    const materiaAtto = !udienza && opzione?.dataset.materia;
    if (materiaAtto) categoria.value = materiaAtto;
    categoria.disabled = !!materiaAtto; // il server usa comunque la materia dell'atto
    $("nota-categoria").hidden = !materiaAtto;

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

  // ── La squadra predefinita della categoria ──
  const squadre = JSON.parse(modulo.dataset.squadre || "{}");
  const daCategoria = modulo.querySelector("input[name=squadra_da_categoria]");
  const nota = $("nota-squadra");
  const categoriaScelta = () => $("categoria").value;

  function proponiSquadra() {
    const materia = categoriaScelta();
    const predefinita = squadre[materia];
    if (daCategoria.value === "1" && predefinita) {
      // Spunta la squadra della categoria e il suo referente
      for (const c of modulo.querySelectorAll("input[name=squadra]")) c.checked = predefinita.utenti.includes(Number(c.value));
      for (const r of modulo.querySelectorAll("input[name=referente]")) r.checked = Number(r.value) === predefinita.referente;
    }
    aggiornaNotaSquadra();
  }

  function aggiornaNotaSquadra() {
    const materia = categoriaScelta();
    const predefinita = squadre[materia];
    nota.replaceChildren();
    if (!materia) { nota.hidden = true; return; }
    nota.hidden = false;
    if (daCategoria.value === "0") {
      nota.append("Scelta a mano. ");
      if (predefinita?.utenti.length) {
        const ripristina = document.createElement("button");
        ripristina.type = "button";
        ripristina.className = "link";
        ripristina.textContent = `Usa la squadra della categoria «${materia}»`;
        ripristina.addEventListener("click", () => { daCategoria.value = "1"; proponiSquadra(); });
        nota.append(ripristina);
      }
    } else if (predefinita?.utenti.length) {
      nota.append(`Proposta dalla categoria «${materia}»: puoi cambiarla prima di inserire.`);
    } else {
      nota.append(`La categoria «${materia}» non ha una squadra predefinita: se non scegli nessuno resterà da assegnare.`);
    }
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
    if (["squadra", "referente"].includes(evento.target.name)) {
      daCategoria.value = "0"; // l'hai toccata tu: da qui in poi decidi tu
      aggiornaNotaSquadra();
      return sistemaReferente(evento);
    }
    if (evento.target.id === "attivita") return;
    aggiornaCampi();
    // Cambiando tipo, atto o categoria si ripropone la squadra (se non l'hai scelta tu)
    if (["tipo", "atto", "categoria"].includes(evento.target.name)) proponiSquadra();
  });
  $("attivita").addEventListener("input", (e) => (e.target.dataset.automatica = "0"));
  $("data_evento").addEventListener("input", aggiornaAnteprima);
  aggiornaCampi();
  aggiornaNotaSquadra(); // all'apertura non si spunta niente: solo la nota
  // Il campo disabilitato non verrebbe inviato: prima di inviare lo riabilitiamo
  modulo.addEventListener("submit", () => { $("categoria").disabled = false; });
}

// Se la pagina contiene già il modulo (pagina intera), lo avviamo subito.
const moduloInPagina = document.getElementById("nuova");
if (moduloInPagina) avviaModuloNuova(moduloInPagina);
