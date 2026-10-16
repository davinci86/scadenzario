// ─────────────────────────────────────────────────────────────
// IL MENU LATERALE
// • «Comprimi» lascia solo le icone; la scelta resta salvata nel
//   profilo (come il tema), quindi vale su ogni computer.
// • Da compresso, fermandosi con il mouse su un'icona per qualche
//   secondo compare il nome della voce. Con la tastiera (Tab)
//   compare subito: chi usa la tastiera non deve aspettare.
// ─────────────────────────────────────────────────────────────
(function () {
  const ATTESA_ETICHETTA = 3000; // millisecondi prima che compaia il nome (3 secondi)

  const radice = document.documentElement;
  const barra = document.querySelector(".barra");
  if (!barra) return;
  const bottone = barra.querySelector("[data-comprimi]");

  // Compresso? (anche quando lo schermo è stretto: lì il CSS lo comprime da solo)
  const compresso = () => barra.offsetWidth < 100;

  function aggiornaBottone() {
    const chiuso = radice.dataset.menu === "compresso";
    bottone.setAttribute("aria-label", chiuso ? "Espandi il menu" : "Comprimi il menu");
    bottone.setAttribute("aria-expanded", String(!chiuso));
  }
  aggiornaBottone();

  bottone.addEventListener("click", () => {
    const chiuso = radice.dataset.menu !== "compresso";
    radice.dataset.menu = chiuso ? "compresso" : "aperto";
    aggiornaBottone();
    nascondi();
    // Salviamo la scelta dietro le quinte (se non riesce, pazienza: resta per questa pagina)
    fetch("/preferenze/menu", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "X-Parziale": "1" },
      body: new URLSearchParams({ compresso: chiuso ? "1" : "0" }),
    }).catch(() => {});
  });

  // ── L'etichetta che compare accanto all'icona ──
  const etichetta = document.createElement("div");
  etichetta.className = "etichetta-menu";
  etichetta.setAttribute("role", "tooltip");
  etichetta.hidden = true;
  document.body.append(etichetta);
  let timer = null;

  function mostra(voce) {
    const r = voce.getBoundingClientRect();
    etichetta.textContent = voce.dataset.etichetta; // textContent: solo testo
    etichetta.style.left = `${r.right + 10}px`;
    etichetta.style.top = `${r.top + r.height / 2}px`;
    etichetta.hidden = false;
  }
  function nascondi() {
    clearTimeout(timer);
    etichetta.hidden = true;
  }

  for (const voce of barra.querySelectorAll("[data-etichetta]")) {
    voce.addEventListener("mouseenter", () => {
      if (!compresso()) return;
      clearTimeout(timer);
      timer = setTimeout(() => mostra(voce), ATTESA_ETICHETTA);
    });
    voce.addEventListener("mouseleave", nascondi);
    voce.addEventListener("focus", () => { if (compresso() && voce.matches(":focus-visible")) mostra(voce); });
    voce.addEventListener("blur", nascondi);
    voce.addEventListener("click", nascondi);
  }
  // Il nome giusto per il pulsante, quando il menu è aperto o chiuso
  new MutationObserver(() => {
    bottone.dataset.etichetta = radice.dataset.menu === "compresso" ? "Espandi il menu" : "Comprimi il menu";
  }).observe(radice, { attributes: true, attributeFilter: ["data-menu"] });
  bottone.dataset.etichetta = radice.dataset.menu === "compresso" ? "Espandi il menu" : "Comprimi il menu";
})();
