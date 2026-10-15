// ─────────────────────────────────────────────────────────────
// LA CAMPANELLA
// • Ogni 30 secondi chiede al server le notifiche (come "richiesta
//   automatica": non conta come attività e non impedisce il blocco).
// • Mostra il numero di quelle da leggere e, con un clic, l'elenco.
// • Suona UNA volta per ogni nuova notifica: dopo il suono la segna
//   come "avvisata" sul server, così non suona più (neanche in altre schede).
// Nota: i browser permettono i suoni solo dopo che la persona ha
// cliccato o premuto un tasto nella pagina; finché non succede, aspettiamo.
// ─────────────────────────────────────────────────────────────
(function () {
  const bottone = document.querySelector("[data-campanella]");
  if (!bottone) return;
  const numero = bottone.querySelector(".numero");
  let audio = null;
  let inAttesa = []; // notifiche nuove che non hanno ancora suonato
  let ultimiDati = null;

  // Il menu a tendina
  const tendina = document.createElement("div");
  tendina.className = "tendina-notifiche";
  tendina.hidden = true;
  bottone.closest(".io").append(tendina);

  // ── Il suono: due note brevi, generate dal browser (nessun file audio) ──
  function preparaAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    if (inAttesa.length) suona();
  }
  document.addEventListener("pointerdown", preparaAudio, { once: false, passive: true });
  document.addEventListener("keydown", preparaAudio, { passive: true });

  async function suona() {
    if (!audio || audio.state !== "running" || !inAttesa.length) return;
    const t = audio.currentTime;
    for (const [frequenza, inizio] of [[880, 0], [1320, 0.16]]) {
      const oscillatore = audio.createOscillator();
      const volume = audio.createGain();
      oscillatore.frequency.value = frequenza;
      volume.gain.setValueAtTime(0.0001, t + inizio);
      volume.gain.exponentialRampToValueAtTime(0.2, t + inizio + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + inizio + 0.35);
      oscillatore.connect(volume).connect(audio.destination);
      oscillatore.start(t + inizio);
      oscillatore.stop(t + inizio + 0.4);
    }
    const ids = inAttesa;
    inAttesa = [];
    await fetch("/api/notifiche/avvisate", {
      method: "POST",
      headers: { "X-Automatico": "1", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(ids.map((id) => ["ids", String(id)])),
    }).catch(() => {});
  }

  // ── Chiede le notifiche al server ──
  async function aggiorna() {
    let risposta;
    try {
      risposta = await fetch("/api/notifiche", { headers: { "X-Automatico": "1" } });
    } catch { return; } // server irraggiungibile: riproveremo
    if (risposta.status === 423) return window.mostraBlocco?.(false);
    if (risposta.status === 401) return (location.href = "/login?scaduta=1");
    if (!risposta.ok) return;
    ultimiDati = await risposta.json();

    numero.hidden = !ultimiDati.daLeggere;
    numero.textContent = ultimiDati.daLeggere > 99 ? "99+" : String(ultimiDati.daLeggere);
    bottone.classList.toggle("con-notifiche", ultimiDati.daLeggere > 0);

    const nuove = ultimiDati.daAvvisare.filter((id) => !inAttesa.includes(id));
    if (nuove.length) {
      inAttesa.push(...nuove);
      suona();
    }
    if (!tendina.hidden) disegnaTendina();
  }
  window.aggiornaCampanella = aggiorna;

  // ── Il menu delle notifiche (costruito con textContent: mai HTML dai dati) ──
  function disegnaTendina() {
    tendina.replaceChildren();
    const testa = document.createElement("div");
    testa.className = "tendina-testa";
    const titolo = document.createElement("b");
    titolo.textContent = "Notifiche";
    testa.append(titolo);
    if (ultimiDati?.daLeggere) {
      const tutte = document.createElement("button");
      tutte.className = "link";
      tutte.textContent = "Segna tutte come lette";
      tutte.onclick = () => segna("/notifiche/tutte");
      testa.append(tutte);
    }
    tendina.append(testa);

    const elenco = ultimiDati?.elenco || [];
    if (!elenco.length) {
      const vuoto = document.createElement("p");
      vuoto.className = "nota tendina-vuota";
      vuoto.textContent = "Nessuna notifica.";
      tendina.append(vuoto);
    }
    for (const n of elenco) {
      const riga = document.createElement("div");
      riga.className = "tendina-voce" + (n.letta ? " letta" : "");
      const testo = document.createElement("div");
      testo.className = "tendina-testo";
      const frase = document.createElement("b");
      frase.textContent = n.testo;
      testo.append(frase);
      if (n.scadenza) {
        const link = document.createElement("a");
        link.href = `/scadenze/${n.scadenza.id}`;
        link.target = "_blank";
        link.dataset.scadenza = n.scadenza.id;
        link.textContent = `N. ${n.scadenza.id} · ${n.scadenza.cliente}`;
        link.addEventListener("click", () => (tendina.hidden = true));
        testo.append(link);
      }
      const quando = document.createElement("small");
      quando.textContent = n.quando;
      testo.append(quando);
      riga.append(testo);
      if (!n.letta) {
        const letto = document.createElement("button");
        letto.className = "btn piccolo";
        letto.textContent = "Letto";
        letto.onclick = () => segna(`/notifiche/${n.id}/letta`);
        riga.append(letto);
      } else {
        const etichetta = document.createElement("span");
        etichetta.className = "nota";
        etichetta.textContent = "Letto";
        riga.append(etichetta);
      }
      tendina.append(riga);
    }
  }

  async function segna(url) {
    await fetch(url, { method: "POST", headers: { "X-Parziale": "1" } });
    await aggiorna();
    window.aggiornaSotto?.();
  }

  bottone.addEventListener("click", (evento) => {
    evento.stopPropagation();
    tendina.hidden = !tendina.hidden;
    if (!tendina.hidden) disegnaTendina();
  });
  document.addEventListener("click", (evento) => {
    if (!tendina.hidden && !evento.target.closest(".tendina-notifiche")) tendina.hidden = true;
  });

  aggiorna();
  setInterval(aggiorna, 30_000);
})();
