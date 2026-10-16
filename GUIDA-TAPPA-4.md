# Guida alla Tappa 4 · Segnalazioni e fascicoli

## Da provare

Avvia con `npm run dev`. Al primo avvio vengono creati alcuni fascicoli e segnalazioni
di prova (dati inventati).

**Segnalazioni**
1. Entra come **a.ferrara**: in dashboard, in cima, c'è la segnalazione *importante* di
   Paolo Russo. Nel menu, accanto a «Segnalazioni», il numerino di quelle da leggere.
2. Premi **Letto**. Poi esci, entra come **p.russo** → Segnalazioni → **Inviate**:
   vedi chi l'ha letta e quando (conferma di lettura).
3. **+ Segnala a un collega**: si apre una finestra sopra la pagina. Scegli uno o più
   destinatari, oggetto, messaggio, priorità; puoi collegarla a una scadenza o a un
   fascicolo. La finestra si chiude **solo con la ×** o inviando: il clic fuori e il
   tasto Esc non la chiudono, così non si perde un messaggio a metà. Vale lo stesso
   per «+ Nuova scadenza». Se hai scritto
   qualcosa e premi la ×, l'app ti chiede se salvarlo.
4. **Rispondi** apre il modulo già indirizzato a chi te l'ha mandata.
5. Apri **Registro**: c'è «Inviata a…» e «Letta…», ma mai il testo.

**Fascicoli**
1. Come **a.ferrara**: in dashboard c'è «Fascicoli da confermare» (Paolo ti ha consegnato
   il 0987/2024). Premi **Confermo di averlo ricevuto**: ora risulta a te.
2. Menu **Fascicoli** → scrivi `1234/2025`: ce l'ha Marco De Luca da 35 giorni
   (etichetta arancione: ha superato i 30 giorni, e ha ricevuto il promemoria).
   Come Admin puoi segnarlo come rimesso in archivio; gli altri possono chiederglielo.
3. Scrivi un numero nuovo, es. `42/2026`: «Lo prendo io dall'archivio» oppure
   «lo prendo e lo consegno a [persona] → Conferma». Il fascicolo viene registrato.
4. Apri «Tutti i passaggi»: ogni movimento, chi e quando.
5. Dalla scheda di una scadenza: accanto al fascicolo c'è «dov'è?», e sotto le note
   «Segnala a un collega su questa attività».

## Cosa c'è di nuovo nel codice

```
src/db/segnalazioni.js     invio, "Letto", ricevute e inviate
src/db/fascicoli.js        i tre stati e tutte le regole dei passaggi
src/routes/segnalazioni.js
src/routes/fascicoli.js
src/views/segnalazioni.js  la pagina, il modulo, la "scheda" di una segnalazione
src/views/fascicoli.js     "Dov'è il fascicolo?" e la scheda di un fascicolo
test/tappa4.test.js
```

### I tre stati di un fascicolo

```
archivio ──"lo prendo"──────────────▶ consultazione (ce l'ha qualcuno)
archivio ──"lo prendo e consegno"──▶ consegna (aspetta la conferma)
consultazione ──"lo consegno a"────▶ consegna
consegna ──"ricevuto"──────────────▶ consultazione (ora ce l'ha chi l'ha ricevuto)
consegna ──"non l'ho ricevuto"─────▶ consultazione (resta a chi lo consegnava)
consegna ──"annulla"───────────────▶ consultazione
consultazione/consegna ──"archivio"▶ archivio (chi ce l'ha, o l'Admin)
```

Tutto è in `muoviFascicolo` (`src/db/fascicoli.js`): un solo `switch`, un caso per
azione. Ogni caso prima controlla che l'azione sia permessa **in quel momento**
(es. "ricevuto" solo se il fascicolo è in consegna proprio a te), poi cambia lo stato.
La pagina mostra solo i pulsanti giusti, ma è il server che decide.

### Il numero del fascicolo

Si scrive a mano. `normalizzaNumero` lo mette in maiuscolo e sistema gli spazi:
«  1234/2025 » e «1234/2025» sono lo stesso fascicolo.

### Riservatezza delle segnalazioni

- La vedono solo chi l'ha scritta e i destinatari (`puoVedere`).
- Nel Registro: «Inviata a…», «Letta la segnalazione di…». Mai oggetto né testo.
- Le segnalazioni **non** mandano email (sono comunicazioni interne).
- Il promemoria email dei fascicoli non contiene il numero del fascicolo.

## Esercizi

1. In `src/config.js` porta `giorniFascicoloFuori` da 30 a 1: al prossimo controllo
   dei promemoria (ogni 5 minuti, o riavviando) chi ha un fascicolo da più di un giorno
   riceve l'avviso.
2. In `src/routes/fascicoli.js` cambia i messaggi in `FATTO`.

**Prossima tappa:** Impostazioni (catalogo degli atti con motivazione e anteprima,
festività e chiusure), backup e ripristino con copia sul NAS, registro completo.
