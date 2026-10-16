# Guida alla Tappa 3 · Notifiche, promemoria, blocco dello schermo, ingressi

In questa tappa l'app impara ad **avvisare** (notifiche, campanella con suono, email),
a **proteggere lo schermo** quando ci si allontana, e a **registrare ingressi e uscite**.

---

## 1. Provala

```
cd ~/Documents/Scadenzario
npm install     # questa volta serve: c'è una libreria nuova (per le email)
npm start
```

Se vuoi vedere subito i promemoria con i dati di prova, ricomincia da zero:
ferma l'app, cancella la cartella `dati/`, riavvia.

Prove da fare:

1. Entra come **m.deluca**: in dashboard c'è **Da leggere** con i promemoria; la **campanella**
   in alto mostra il numero. Premi **Letto**: il numero scende.
2. Apri una seconda finestra del browser come **a.ferrara**, cambia lo stato della scadenza
   "Kone Ibrahim". Entro 30 secondi la campanella di De Luca si aggiorna e **suona una volta**.
   (Il browser fa suonare solo dopo che hai cliccato almeno una volta nella pagina.)
3. Clicca sul tuo **nome** in alto a destra: si apre un menu con *Il mio profilo*,
   *Blocca lo schermo*, *Tema chiaro/scuro* ed *Esci*. Scegli **🔒 Blocca lo schermo**
   (oppure premi **Ctrl+Alt+L**, sul Mac Ctrl+⌥+L): lo schermo si copre.
   Prova una password sbagliata, poi quella giusta.
4. Nel **profilo** (menu sul nome → Il mio profilo) metti il blocco a **1 minuto**, poi non toccare niente:
   dopo un minuto lo schermo si blocca da solo.
5. **Ingressi** (lo vedono l'Admin e i titolari, cioè De Luca nei dati di prova): chi è entrato
   oggi e quando. Premi **Esci** e rientra: l'uscita compare nel registro.
6. Come **Admin**, in "Utenti e registro": assegna o togli la qualifica di **titolare**;
   in fondo c'è la coda delle **email in uscita**.

---

## 2. I file nuovi

```
src/
├── db/
│   ├── notifiche.js      ← crea, legge, segna come lette le notifiche
│   └── presenze.js       ← ingressi e uscite del giorno
├── servizi/              ← lavori che il server fa "da solo"
│   ├── promemoria.js     ← ★ quando avvisare, e chi
│   └── email.js          ← coda delle email e spedizione
├── routes/notifiche.js   ← le rotte della campanella
└── views/
    ├── blocco.js         ← la pagina "schermo bloccato"
    ├── ingressi.js       ← il registro degli ingressi
    └── profilo.js        ← il mio profilo
public/js/
├── campanella.js         ← la campanella, il menu e il suono
└── blocco.js             ← il conto alla rovescia e il velo del blocco
test/tappa3.test.js       ← 17 prove nuove
```

---

## 3. I concetti nuovi

### Lavori programmati
In `server.js`, `setInterval` fa partire `lavoriProgrammati` ogni 5 minuti: crea i promemoria
e spedisce le email. Il server non aspetta che qualcuno apra una pagina: lavora da solo.

### Niente doppioni: la "chiave"
Il controllo dei promemoria gira ogni 5 minuti, ma ogni promemoria nasce una volta sola.
Ognuno ha una chiave, per esempio `soglia-7@4@2026-11-02` (soglia 7 giorni, scadenza N. 4,
data 2 novembre). Nella tabella `notifiche` la coppia *persona + chiave* è **UNIQUE**:
il database rifiuta da solo il secondo inserimento. Se la data della scadenza cambia,
cambia la chiave, e i promemoria ripartono per la nuova data.

### La campanella chiede, il server risponde
Ogni 30 secondi `campanella.js` chiede `/api/notifiche`. È il metodo più semplice e robusto
per una rete interna (si chiama *polling*). La richiesta porta l'intestazione `X-Automatico`:
il server sa che non l'ha fatta la persona, quindi non la conta come attività.

### Il suono, una volta sola
Ogni notifica ha un campo `avvisata`. Dopo il suono il browser lo comunica al server, che
la segna: così non suona più, nemmeno in un'altra scheda o su un altro computer.

### Il blocco vale sul server
Il velo sullo schermo da solo non basterebbe: chi conosce un po' il browser potrebbe toglierlo.
Per questo la sessione nel database ha il campo `bloccata`: finché è 1, il portiere
(`auth/permessi.js`) risponde **423 Locked** a tutto, tranne a "sblocca" ed "esci".
Il server blocca da solo anche quando l'ultima attività è troppo vecchia.

### Rete di sicurezza notturna
Senza l'uscita automatica, un PC lasciato acceso resterebbe collegato per sempre. In
`auth/sessioni.js` la funzione `fineNotte` fa scadere ogni sessione alle 2:00.

---

## 4. Ingressi e uscite: cosa registra (e cosa no)

- **Entrata:** il primo accesso del giorno.
- **Uscita:** l'ultima volta che si è premuto «Esci». Se manca, compare l'ultima attività.
- **Il blocco dello schermo non è un'uscita.**
- **Nessun calcolo di ore.**

⚠️ Prima di usarlo con le persone vere, lo studio deve dare a tutti un'**informativa**
su quali dati si registrano, chi li vede e per quanto tempo si conservano
(GDPR e Statuto dei lavoratori). Va verificato con un professionista.

---

## 5. Prova tu

1. In `src/config.js` cambia `promemoriaPredefiniti` da `[7, 1]` a `[10, 3, 1]`.
   Lancia `npm test`: i test passano ancora? Perché?
2. In `public/js/campanella.js` cerca `[[880, 0], [1320, 0.16]]`: sono le due note del suono
   (frequenza in Hz e momento di partenza). Prova a cambiarle.
3. In `src/config.js` cambia `oraFineSessione` da `2` a un'altra ora.

### Perché Ctrl+Alt+L e non Ctrl+Q

Ctrl+Q (e ⌘Q sul Mac) in molti browser chiude tutto il programma: un dito scivolato e
si perde il lavoro. Ctrl+Alt+L non lo usa nessun browser. La scorciatoia è in
`public/js/blocco.js` (cerca `KeyL`). Su Windows c'è anche **Win+L**, che blocca
l'intero computer: va benissimo, ed è ancora più sicura.

## Aggiunta: "Torna allo scadenzario" e modifiche non salvate

**Da provare:**
1. Doppio clic su una riga: si apre la scheda. In alto c'è **← Torna allo scadenzario**:
   chiude la scheda e ti riporta a quella dello scadenzario (che intanto si è aggiornata
   da sola con quello che hai fatto).
2. Scrivi una nota senza salvarla e premi "Torna allo scadenzario", oppure chiudi il
   pannello (×, Esc, clic fuori), oppure fai un'altra azione (es. cambia stato):
   compare l'avviso **Ci sono modifiche non salvate** con *Salva e continua*,
   *Continua senza salvare*, *Resta qui*.
3. Con una nota non salvata chiudi la scheda dalla X del browser o premi "ricarica":
   qui l'avviso è quello **del browser**.

**Come funziona** (`public/js/modifiche.js`): ogni campo ricorda il valore con cui la
pagina l'ha mostrato (`defaultValue`). Se quello attuale è diverso, il modulo ha
modifiche non salvate. Si controllano solo i moduli che salvano (`method="post"`).

**Due limiti dei browser, non nostri:**
- Quando chiudi la scheda o ricarichi, il browser mostra il *suo* avviso: il testo non
  si può cambiare e non può esserci il pulsante "Salva" (è una protezione dei browser
  contro i siti che non ti lasciano andare via).
- Una scheda si può chiudere da programma solo se l'ha aperta l'app. Se hai aperto
  l'indirizzo a mano, "Torna allo scadenzario" porta allo scadenzario nella stessa scheda.
  Per questo, dopo ogni azione, la scheda si ricarica con `location.replace`: non allunga
  la cronologia e la chiusura resta possibile.

**Prossima tappa:** segnalazioni ai colleghi e movimenti dei fascicoli.
