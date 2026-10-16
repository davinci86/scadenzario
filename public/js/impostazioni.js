// ─────────────────────────────────────────────────────────────
// IMPOSTAZIONI: comodità nel browser
//  1. Modulo di un atto: mentre scrivi, la regola a parole e un esempio
//     di calcolo (li prepara il server: /api/regola).
//  2. Modifica dei termini: scegliendo "da quando vale", l'anteprima
//     mostra subito quali scadenze verranno ricalcolate.
// Senza JavaScript tutto funziona lo stesso: decide sempre il server.
// ─────────────────────────────────────────────────────────────
(function () {
  // ── 1. Il modulo di un atto ──
  const atto = document.getElementById("modulo-atto");
  if (atto) {
    const anteprima = document.getElementById("anteprima-regola");
    const evento = atto.querySelector("[name=evento]");
    const direzione = atto.querySelector("[name=direzione]");
    let attesa;

    async function aggiorna() {
      // A ritroso solo per i termini che dipendono da un'udienza
      direzione.disabled = evento.value !== "udienza";
      if (direzione.disabled) direzione.value = "avanti";
      const q = new URLSearchParams({
        evento: evento.value, direzione: direzione.value, giorni: atto.querySelector("[name=giorni]").value,
        feriale: atto.querySelector("[name=feriale]").checked ? "1" : "", proroga: atto.querySelector("[name=proroga]").checked ? "1" : "",
      });
      const risposta = await fetch(`/api/regola?${q}`, { headers: { "X-Automatico": "1" } });
      if (!risposta.ok) return;
      const { testo, esempio } = await risposta.json();
      anteprima.replaceChildren();
      if (testo) { const b = document.createElement("b"); b.textContent = testo; anteprima.append(b, document.createElement("br")); }
      const n = document.createElement("span"); n.className = "nota"; n.textContent = esempio; anteprima.append(n);
    }
    atto.addEventListener("input", () => { clearTimeout(attesa); attesa = setTimeout(aggiorna, 250); });
    atto.addEventListener("change", aggiorna);
    // Prima di inviare riabilitiamo la direzione, altrimenti il browser non la manda
    atto.addEventListener("submit", () => { direzione.disabled = false; });
    aggiorna();
  }

  // ── 2. La modifica dei termini ──
  const cambio = document.getElementById("modulo-cambio");
  if (cambio) {
    const oggi = cambio.dataset.oggi;
    const righe = [...cambio.querySelectorAll("tr[data-evento]")];
    const riepilogo = document.getElementById("riepilogo-cambio");

    function aggiorna() {
      const modo = cambio.querySelector("[name=modo]:checked")?.value;
      const dal = cambio.querySelector("[name=dal]").value;
      let incluse = 0, anticipate = 0, giaScadute = 0;
      for (const riga of righe) {
        const casella = riga.querySelector("input[type=checkbox]");
        if (modo === "retro") { casella.checked = true; casella.disabled = true; }
        else if (modo === "dal") { casella.checked = !!dal && riga.dataset.evento >= dal; casella.disabled = true; }
        else casella.disabled = false;
        riga.classList.toggle("esclusa", !casella.checked);
        if (casella.checked) {
          incluse++;
          if (Number(riga.dataset.delta) < 0) anticipate++;
          if (riga.dataset.nuova < oggi) giaScadute++;
        }
      }
      if (!riepilogo) return;
      riepilogo.textContent = incluse
        ? `${incluse} ${incluse === 1 ? "scadenza verrà ricalcolata" : "scadenze verranno ricalcolate"}` +
          (anticipate ? `, di cui ${anticipate} anticipate` : "") +
          (giaScadute ? `. Attenzione: ${giaScadute} risulterebbero già scadute` : "") + "."
        : "Nessuna scadenza aperta verrà ricalcolata: la nuova regola vale per quelle che verranno inserite.";
      riepilogo.classList.toggle("attenzione-forte", giaScadute > 0);
    }
    cambio.addEventListener("change", aggiorna);
    cambio.addEventListener("input", (e) => { if (e.target.name === "dal") aggiorna(); });
    aggiorna();
  }
})();
