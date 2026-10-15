# Guida alla Tappa 2 · Lo scadenzario

In questa tappa nasce lo scadenzario vero: la **tabella stile Word**, l'**inserimento guidato**
dal catalogo degli atti con il **calcolo dei termini**, il **dettaglio** di ogni scadenza
(stato, squadra, referente, note, storico) e la **dashboard** personale.

Restano per le prossime tappe: notifiche e promemoria (3), segnalazioni e fascicoli (4),
impostazioni, catalogo modificabile e backup (5).

---

## 1. Provala

```
cd ~/Documents/Scadenzario
npm start
```

Apri **http://localhost:3000**. Al primo avvio dopo l'aggiornamento il database si riempie
con il catalogo e le scadenze di prova (le stesse del mockup).

Prove da fare:

1. **Come Admin** (`a.ferrara`): la dashboard mostra *Termini da verificare* e *Da assegnare*.
2. **Scadenzario**: prova i filtri; "Da assegnare" nel menu delle persone; "Mostra anche le chiuse".
3. **+ Nuova scadenza**: scegli "Ricorso avverso diniego…", metti come notifica il **20/07/2026**.
   L'anteprima dice *lun 21/09/2026* e spiega perché (agosto escluso, 19 settembre è sabato).
4. Prova **Altro**: scegli un termine dall'elenco, oppure *Forza la data a mano*.
   La scadenza nasce "da verificare"; solo l'Admin vede il pulsante per confermarla.
5. Nel **dettaglio**: cambia stato, coinvolgi un collega, cambia referente, scrivi una nota.
   Tutto finisce nello **storico** in fondo alla pagina (e nel registro dell'Admin).
6. **Correggi la data a mano** senza motivo: viene rifiutata. Con il motivo, la data
   compare con ✎ nella tabella.
7. Su un'**udienza**: "Segna come rinviata" con una nuova data → si apre la nuova udienza.
8. **Come Collaboratore** (`m.deluca`): non vedi "+ Nuova scadenza"; puoi cambiare lo stato
   delle tue scadenze, non di quelle degli altri.

---

## 2. I file nuovi

```
src/
├── dominio/              ← le REGOLE dello studio, senza database né pagine
│   ├── date.js           ← date in formato AAAA-MM-GG, giorni mancanti, formattazione
│   ├── termini.js        ← ★ IL CALCOLO DEI TERMINI (festività, agosto, giorno utile)
│   └── stati.js          ← tipi, stati e colori di evidenziatore
├── auth/regole.js        ← chi può fare cosa sulle scadenze
├── db/
│   ├── atti.js           ← legge il catalogo degli atti
│   └── scadenze.js       ← legge e scrive scadenze, squadre, storico
├── routes/scadenze.js    ← tutte le rotte dello scadenzario e delle sue azioni
└── views/
    ├── scadenzario.js    ← la tabella stile Word
    ├── nuova.js          ← il modulo di inserimento
    ├── scadenza.js       ← il dettaglio
    └── dashboard.js      ← (aggiornata) la dashboard
public/js/
├── nuova-scadenza.js     ← il modulo diventa "furbo" nel browser
└── scadenzario.js        ← filtri automatici e righe cliccabili
test/
├── termini.test.js       ← ★ 15 casi di calcolo, da far controllare a Daniela
└── scadenze.test.js      ← 17 prove di permessi e azioni
```

**Ordine consigliato:** `test/termini.test.js` → `src/dominio/termini.js` →
`src/routes/scadenze.js` (la funzione `leggiNuovaScadenza`) → `src/views/scadenza.js`.

---

## 3. I concetti nuovi

### Il "dominio": le regole separate da tutto il resto
La cartella `dominio/` contiene solo **regole**: come si conta un termine, quali stati
esistono. Non sa niente di database o pagine. Per questo si può testare facilmente:
dai una data e una regola, controlli il risultato. Se un giorno cambia la grafica
o il database, il calcolo dei termini non si tocca.

### Una sola fonte di verità per il calcolo
L'anteprima nel modulo **non** calcola nel browser: chiede al server (`/api/termine`),
che usa la stessa funzione del salvataggio. Se il calcolo fosse scritto due volte,
prima o poi le due versioni darebbero risultati diversi.

### JSON
È il formato con cui il server risponde all'anteprima: testo leggibile, tipo
`{"data":"2026-09-21","formattata":"lun 21/09/2026"}`. Prova ad aprire nel browser
(dopo aver fatto l'accesso):
`http://localhost:3000/api/termine?giorni=30&feriale=1&data=2026-07-20`

### Tabelle collegate
Una scadenza può avere più persone: per questo la squadra sta in una tabella a parte
(`squadre`), con una riga per ogni coppia scadenza–persona. È il modo standard di
rappresentare un "molti a molti" in un database.

### Transazioni: "tutto o niente"
Creare una scadenza vuol dire scrivere in più tabelle (scadenza + squadra). In
`db/scadenze.js` la funzione `inTransazione` fa sì che, se una scrittura fallisce,
si annulli tutto: mai una scadenza a metà.

### Il server ricontrolla sempre
Il pulsante "Correggi la data" non compare a un Collaboratore, ma questo è solo
estetica. La protezione vera è sul server: ogni azione in `routes/scadenze.js` passa
da un controllo (`puoLavorare`, `soloEditor`, `eAdmin`). I test lo verificano mandando
le richieste "di nascosto", senza passare dai pulsanti.

### Funziona anche senza JavaScript
Il modulo e i pulsanti sono normali moduli HTML: il server fa tutto il lavoro.
JavaScript aggiunge solo comodità (mostrare i campi giusti, l'anteprima). È una scelta
di robustezza: se qualcosa va storto nel browser, l'app resta utilizzabile.

---

## 4. Prova tu

1. **Aggiungi un caso di test.** In `test/termini.test.js` copia un test e cambia data
   e risultato con un caso che conosci. Lancia `npm test`. Se sbagli apposta il risultato,
   il test ti dice cosa si aspettava e cosa ha ottenuto.
2. **Cambia un colore.** In `public/stile.css` cerca `--ev-giallo` e prova un altro colore,
   per esempio `#ffe066`. Ricarica la tabella.
3. **Cambia i termini proposti per "Altro".** In `src/config.js`, `terminiAltro`:
   aggiungi `45`. Riavvia e guarda il menu nel modulo.

---

## 5. Note

- **Colori, stati e catalogo** sono provvisori: arriveranno quelli veri dello studio.
- Il catalogo si potrà modificare dall'app con le **Impostazioni** (Tappa 5), comprese
  le modifiche ai termini con motivazione e anteprima.
- **Se vuoi ripartire da zero** con i dati di prova: ferma l'app, cancella la cartella
  `dati/`, riavvia.

**Prossima tappa:** notifiche "Da leggere", promemoria (a 7 giorni, il giorno prima, udienze a 48 e 24 ore)
e l'invio via email.
