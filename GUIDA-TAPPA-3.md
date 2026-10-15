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
3. Premi **🔒 Blocca**: lo schermo si copre. Prova una password sbagliata, poi quella giusta.
4. Nel **profilo** (clic sul tuo nome) metti il blocco a **1 minuto**, poi non toccare niente:
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

**Prossima tappa:** segnalazioni ai colleghi e movimenti dei fascicoli.
