# Guida alla Tappa 1 · Le fondamenta

In questa tappa l'app impara a **riconoscere chi entra** e a **decidere cosa può vedere**.
Non c'è ancora lo scadenzario: ci sono il server, il database, l'accesso con password,
i ruoli e il registro degli accessi. Tutto il resto poggerà su queste fondamenta.

---

## 1. Provala

1. Apri il **Terminale**.
2. Entra nella cartella: `cd ~/Documents/Scadenzario`
3. Avvia l'app: `npm start`
4. Apri il browser su **http://localhost:3000**
5. Entra come `a.ferrara`, password `demo`.

Prove da fare:

- Entra con una password sbagliata: compare l'errore.
- Entra come **Admin** (a.ferrara): nel menu c'è "Utenti e registro", con i tuoi accessi registrati.
- Esci ed entra come **Collaboratore** (m.deluca): la voce non c'è. Prova a scrivere a mano
  l'indirizzo `http://localhost:3000/admin/utenti`: l'app risponde "Accesso non consentito".
- Sbaglia la password 5 volte con `g.esposito`: l'utente si blocca per 15 minuti
  (lo vedi anche da Admin, nella tabella utenti).

Per fermare l'app: nel Terminale premi **Ctrl + C**.

---

## 2. La mappa dei file

Aprila in Visual Studio Code: **File › Apri cartella… › Documenti › Scadenzario**.

```
Scadenzario/
├── package.json          ← la "carta d'identità" del progetto: nome, librerie, comandi
├── src/                  ← il codice dell'app
│   ├── server.js         ← il punto di partenza: apre il database e accende il server
│   ├── app.js            ← monta i pezzi nell'ordine giusto
│   ├── config.js         ← tutte le impostazioni regolabili, in un posto solo
│   ├── db/
│   │   ├── database.js   ← apre il database e crea le tabelle
│   │   ├── registro.js   ← scrive nel registro attività
│   │   └── seed.js       ← crea gli utenti di prova
│   ├── auth/             ← "auth" = autenticazione: chi sei e cosa puoi fare
│   │   ├── password.js   ← cifra e verifica le password
│   │   ├── sessioni.js   ← ricorda chi è collegato
│   │   └── permessi.js   ← il "portiere" che controlla i ruoli
│   ├── routes/           ← "rotte": quale indirizzo fa cosa
│   │   ├── accesso.js    ← login e uscita
│   │   └── pagine.js     ← dashboard e pagina utenti
│   └── views/            ← "viste": l'HTML delle pagine
├── public/stile.css      ← l'aspetto grafico
├── test/                 ← i test automatici
└── dati/                 ← il database (si crea al primo avvio, NON va su GitHub)
```

Ordine consigliato per leggerlo: `server.js` → `app.js` → `routes/accesso.js` → `auth/permessi.js`.

---

## 3. I concetti nuovi

### Il server
È un programma che **resta acceso e aspetta**. Quando apri `localhost:3000`, il browser gli
manda una *richiesta*; il server risponde con una pagina. "localhost" vuol dire "questo computer":
per ora server e browser stanno entrambi sul tuo Mac. Allo studio il server sarà il loro
server Windows, e i PC lo raggiungeranno attraverso la rete interna.

### Le rotte
Collegano un **indirizzo** a una **funzione**. In `routes/accesso.js`:

```js
router.post("/login", (req, res) => { … })
```

si legge: "quando arriva un invio di dati all'indirizzo /login, esegui questa funzione".
`req` è la richiesta (cosa ha mandato il browser), `res` è la risposta (cosa gli rimandiamo).
**GET** = "dammi una pagina", **POST** = "ti mando dei dati".

### Il middleware (il portiere)
Funzioni che Express esegue **prima** della pagina. In `routes/pagine.js`:

```js
router.get("/admin/utenti", richiediRuolo("admin"), (req, res) => { … })
```

Prima passa `richiediRuolo("admin")`: se non sei Admin, la richiesta si ferma lì.
Il controllo sta **sul server**: nascondere il pulsante non basterebbe, perché chiunque
potrebbe scrivere l'indirizzo a mano (è la prova che hai fatto con m.deluca).

### Il database
SQLite tiene tutto in **un unico file**, `dati/scadenzario.db`. Dentro ci sono **tabelle**,
come fogli Excel: `utenti`, `sessioni`, `registro`. Le trovi descritte in `db/database.js`.
Per leggere e scrivere si usa il linguaggio **SQL**, che è quasi inglese:

```sql
SELECT * FROM utenti WHERE nome_utente = ?
```

"prendi tutte le colonne dalla tabella utenti, dove il nome utente è…". Il `?` viene
riempito dopo con il valore vero, mai incollato nel testo: così nessuno può "iniettare"
comandi scrivendo cose strane nel campo del nome utente.

### Password e impronte (hash)
In `auth/password.js`: la password **non viene mai salvata**. Salviamo un'impronta
da cui non si torna indietro. Se qualcuno rubasse il file del database, non troverebbe
nessuna password.

### Sessioni e cookie
Dopo il login il browser riceve un **cookie**: un biglietto con un codice casuale
lunghissimo. A ogni pagina lo ripresenta e il server sa chi sei. Dopo 30 minuti
di inattività il biglietto scade (`minutiInattivita` in `config.js`).

### I test
In `test/` ci sono **16 esempi con il risultato atteso**: "con la password sbagliata non
si entra", "un collaboratore non apre la pagina utenti", "dopo 5 errori l'utente si blocca"…
Lanciali con:

```
npm test
```

Se in futuro una modifica rompe qualcosa, un test diventa rosso e ce ne accorgiamo subito.
Quando arriverà il calcolo dei termini, i test saranno gli esempi che farai controllare a Daniela.

---

## 4. Prova tu

Tre piccole modifiche, per prendere confidenza. Dopo ogni modifica: ferma l'app (Ctrl + C)
e riavviala (`npm start`).

1. **Cambia il saluto.** In `src/views/dashboard.js` cerca `"Buongiorno"` e prova a scrivere
   altro. Ricarica la dashboard.
2. **Cambia il tempo di inattività.** In `src/config.js` porta `minutiInattivita` da `30` a `1`.
   Entra, aspetta un minuto senza toccare niente, ricarica: ti chiede di accedere di nuovo.
   Poi rimetti `30`.
3. **Rompi un test (apposta).** In `src/config.js` porta `tentativiMassimi` da `5` a `10` e
   lancia `npm test`: il test sul blocco dopo 5 tentativi fallisce e ti dice perché.
   Poi rimetti `5`.

Se qualcosa non torna, nessun problema: dimmelo e lo sistemiamo insieme.

---

## 5. Cosa abbiamo rimandato (di proposito)

- **Creare utenti e cambiare password dall'app**: arriva con le Impostazioni (Tappa 5).
  Per ora ci sono solo gli utenti di prova.
- **Collegamento cifrato (HTTPS)**: si configura all'installazione sul server dello studio.
- Il **cookie** è già protetto (`HttpOnly`, `SameSite=Strict`); con l'HTTPS aggiungeremo `Secure`.

**Prossima tappa:** lo scadenzario vero (tabella, stati, squadra, catalogo degli atti e
calcolo dei termini).
