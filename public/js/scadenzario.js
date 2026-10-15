// Tabella dello scadenzario: i filtri si applicano appena li cambi,
// e cliccando su una riga si apre il dettaglio della scadenza.
const filtri = document.getElementById("filtri");
filtri.addEventListener("change", (e) => {
  if (e.target.name !== "q") filtri.submit();
});
for (const riga of document.querySelectorAll("tr[data-href]")) {
  riga.addEventListener("click", (e) => {
    if (!e.target.closest("a")) location.href = riga.dataset.href;
  });
}
