// ─────────────────────────────────────────────────────────────
// LE "i" CON LA SPIEGAZIONE: il comportamento
// • passando il mouse: la spiegazione compare e sparisce quando esci
// • cliccando (o con Invio dalla tastiera): resta aperta finché non
//   clicchi altrove, premi Esc o clicchi di nuovo la "i"
// Funziona anche nel pannello laterale e nelle finestre sovrapposte,
// che arrivano dopo: per questo ascoltiamo i clic su tutto il documento.
// ─────────────────────────────────────────────────────────────
(function () {
  const fumetto = document.createElement("div");
  fumetto.className = "fumetto-aiuto";
  fumetto.setAttribute("role", "tooltip");
  fumetto.id = "fumetto-aiuto";
  fumetto.hidden = true;
  document.body.append(fumetto);

  let aperta = null;   // la "i" di cui si vede la spiegazione
  let fissata = false; // aperta con un clic (resta) o col mouse (sparisce uscendo)

  function mostra(bottone, conClic) {
    if (aperta && aperta !== bottone) aperta.setAttribute("aria-expanded", "false");
    aperta = bottone;
    fissata = conClic;
    fumetto.textContent = bottone.dataset.aiuto; // textContent: solo testo, mai HTML
    fumetto.hidden = false;
    bottone.setAttribute("aria-expanded", "true");
    bottone.setAttribute("aria-describedby", "fumetto-aiuto");
    posiziona(bottone);
  }

  function nascondi() {
    if (!aperta) return;
    aperta.setAttribute("aria-expanded", "false");
    aperta.removeAttribute("aria-describedby");
    aperta = null;
    fissata = false;
    fumetto.hidden = true;
  }

  // Sotto la "i"; se non c'è spazio, sopra. Mai fuori dallo schermo.
  function posiziona(bottone) {
    const r = bottone.getBoundingClientRect();
    const larghezza = fumetto.offsetWidth;
    const altezza = fumetto.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - larghezza / 2), window.innerWidth - larghezza - 8);
    let top = r.bottom + 8;
    if (top + altezza > window.innerHeight - 8) top = Math.max(8, r.top - altezza - 8);
    fumetto.style.left = `${left}px`;
    fumetto.style.top = `${top}px`;
  }

  document.addEventListener("click", (evento) => {
    const bottone = evento.target.closest(".aiuto");
    if (bottone) {
      evento.preventDefault();
      if (aperta === bottone && fissata) return nascondi();
      return mostra(bottone, true);
    }
    if (!evento.target.closest(".fumetto-aiuto")) nascondi();
  });

  document.addEventListener("mouseover", (evento) => {
    const bottone = evento.target.closest?.(".aiuto");
    if (bottone && !fissata) mostra(bottone, false);
  });
  document.addEventListener("mouseout", (evento) => {
    const bottone = evento.target.closest?.(".aiuto");
    if (bottone && bottone === aperta && !fissata) nascondi();
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && aperta) {
      evento.preventDefault(); // Esc chiude la spiegazione, non la finestra o il pannello
      evento.stopPropagation();
      const bottone = aperta;
      nascondi();
      bottone.focus();
    }
  }, true);

  // Scorrendo la pagina o il pannello la spiegazione si chiude (resterebbe nel posto sbagliato)
  window.addEventListener("scroll", nascondi, true);
  window.addEventListener("resize", nascondi);
})();
