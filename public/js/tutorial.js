// ─────────────────────────────────────────────────────────────
// IL TUTORIAL: il giro guidato sulla dashboard
// Un "faro" evidenzia un elemento alla volta, il fumetto spiega.
// Avanti / Indietro (anche con le frecce), Salta (anche con Esc).
// Alla fine, o saltando, l'app ricorda che l'hai visto.
// ─────────────────────────────────────────────────────────────
(function () {
  const segnaposto = document.getElementById("tutorial");
  if (!segnaposto) return;
  // Solo i passi il cui elemento è davvero nella pagina
  const passi = JSON.parse(segnaposto.dataset.passi || "[]").filter((p) => !p.dove || document.querySelector(p.dove));
  if (!passi.length) return;

  const velo = document.createElement("div");
  velo.className = "tutorial-velo";
  const faro = document.createElement("div");
  faro.className = "tutorial-faro";
  const fumetto = document.createElement("div");
  fumetto.className = "tutorial-fumetto";
  fumetto.setAttribute("role", "dialog");
  fumetto.setAttribute("aria-modal", "true");
  fumetto.setAttribute("aria-labelledby", "tutorial-titolo");
  fumetto.innerHTML = `
    <p class="tutorial-conta"></p>
    <h2 id="tutorial-titolo"></h2>
    <p class="tutorial-testo"></p>
    <div class="tutorial-azioni">
      <button type="button" class="link" data-t="salta">Salta</button>
      <span class="spazio"></span>
      <button type="button" class="btn piccolo" data-t="indietro">Indietro</button>
      <button type="button" class="btn piccolo pri" data-t="avanti">Avanti</button>
    </div>`;
  let i = 0;

  function mostra() {
    const passo = passi[i];
    const el = passo.dove && document.querySelector(passo.dove);
    fumetto.querySelector(".tutorial-conta").textContent = `${i + 1} di ${passi.length}`;
    fumetto.querySelector("h2").textContent = passo.titolo;           // textContent: solo testo
    fumetto.querySelector(".tutorial-testo").textContent = passo.testo;
    fumetto.querySelector("[data-t=indietro]").hidden = i === 0;
    fumetto.querySelector("[data-t=avanti]").textContent = i === passi.length - 1 ? "Fine" : "Avanti";

    if (!el) {
      // Passo "al centro": niente faro, solo il velo scuro
      faro.hidden = true;
      velo.classList.add("scuro");
      fumetto.classList.add("al-centro");
      fumetto.style.left = fumetto.style.top = "";
    } else {
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      const m = 6;
      Object.assign(faro.style, { left: `${r.left - m}px`, top: `${r.top - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
      faro.hidden = false;
      velo.classList.remove("scuro");
      fumetto.classList.remove("al-centro");
      // Il fumetto accanto all'elemento: a destra se c'è spazio, altrimenti sotto o sopra
      const w = fumetto.offsetWidth, h = fumetto.offsetHeight;
      let left = r.right + 16, top = r.top;
      if (left + w > innerWidth - 12) { left = Math.min(Math.max(12, r.left), innerWidth - w - 12); top = r.bottom + 16; }
      if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 16);
      fumetto.style.left = `${left}px`;
      fumetto.style.top = `${Math.max(12, top)}px`;
    }
    fumetto.querySelector("[data-t=avanti]").focus();
  }

  function chiudi() {
    velo.remove(); faro.remove(); fumetto.remove();
    document.removeEventListener("keydown", tasti, true);
    window.removeEventListener("resize", mostra);
    // L'app ricorda che l'hai visto (anche se l'hai saltato)
    fetch("/tutorial/visto", { method: "POST", headers: { "X-Parziale": "1" } }).catch(() => {});
    // Togliamo "?tutorial=1" dall'indirizzo, così ricaricando non riparte
    if (location.search.includes("tutorial=")) history.replaceState(null, "", location.pathname);
  }
  const avanti = () => (i < passi.length - 1 ? (i++, mostra()) : chiudi());
  const indietro = () => { if (i > 0) { i--; mostra(); } };

  fumetto.addEventListener("click", (e) => {
    const azione = e.target.closest("[data-t]")?.dataset.t;
    if (azione === "avanti") avanti();
    if (azione === "indietro") indietro();
    if (azione === "salta") chiudi();
  });
  function tasti(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); chiudi(); }
    if (e.key === "ArrowRight") { e.preventDefault(); avanti(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); indietro(); }
  }

  document.body.append(velo, faro, fumetto);
  document.addEventListener("keydown", tasti, true);
  window.addEventListener("resize", mostra);
  mostra();
})();
