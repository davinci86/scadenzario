# Guida alla Tappa 5

# Parte A: backup e ripristino

## Da provare

1. Avvia con `npm run dev`. All'avvio il server fa subito un backup **automatico**,
   uno **giornaliero** e uno **mensile** (non ce n'erano ancora). Li trovi in
   `dati/backup/`: sono file `.db.gz`, cioè il database compresso.
2. Entra come **a.ferrara** → menu **Backup**: elenco, stato, "per quanto tenerli".
3. **Fai un backup adesso**.
4. Cambia lo stato di una scadenza. Entro 10 minuti compare un nuovo backup automatico.
   Se non cambi niente, non ne compaiono altri: un backup uguale al precedente non serve.
5. **Ripristina…** su un backup: la pagina di conferma mostra cosa cambierebbe
   (scadenze, utenti, segnalazioni, fascicoli: oggi e nel backup). Spunta e ripristina.
   Nell'elenco compare la copia **«Prima di un ripristino»**: se hai sbagliato,
   ripristini quella e torni esattamente a prima.
6. Apri il **Registro**: c'è il ripristino. Il Registro non torna mai indietro.

**Provare il NAS sul Mac**: crea una cartella, es. `~/Desktop/nas-finto`, e avvia con
`BACKUP_NAS=~/Desktop/nas-finto npm run dev`. Ogni backup compare anche lì.
Cancella la cartella mentre l'app gira: alla pagina Backup vedi «Non riuscita» con il
motivo, e nel Registro una riga (una sola, non una ogni 10 minuti).

## Come funziona (`src/servizi/backup.js`)

**La copia.** Non si copia il file del database mentre l'app lavora: si rischierebbe una
copia a metà. Si usa `VACUUM INTO`, un comando di SQLite che scrive una copia completa
e coerente. Poi:
1. `PRAGMA integrity_check` sulla copia: se non è perfetta, il backup fallisce e lo si vede;
2. compressione gzip (già inclusa in Node), circa il 90% in meno;
3. il file prende il suo nome definitivo solo alla fine (prima si chiama `.parziale`):
   nella cartella non resta mai un backup scritto a metà, nemmeno se manca la corrente.

**Quando.** Il "contatore delle modifiche" (`src/db/database.js`, `contaModifiche`):
SQLite stesso, con dei *trigger*, aumenta un numero a ogni modifica dei dati veri.
Ogni 10 minuti il server confronta il numero con quello dell'ultimo backup.

**Quanto spazio.** Un anno di lavoro (circa 3.000 scadenze con storico) è circa 2,5 MB, che
compressi diventano 0,2 MB. Con le durate iniziali (automatici 3 giorni, giornalieri 90,
mensili per sempre) i file restano qualche centinaio al massimo, e i vecchi si
cancellano da soli, anche sul NAS. Le durate le decide l'Admin dalla pagina Backup.

**Il ripristino.** Non si sostituisce il file del database (l'app lo sta usando): si
apre il backup accanto (`ATTACH`) e si ricopiano i dati tabella per tabella, in
un'**unica transazione**: o va tutto bene, o non cambia niente. Restano come sono:
Registro, presenze, email in coda, e le impostazioni dei backup stessi.

## Perché non backup "incrementali"

Un incrementale salva solo le differenze dal precedente: occupa meno, ma per
ripristinare servono **tutti** i pezzi della catena, e se uno si rovina sono persi tutti
quelli dopo. Con un database di pochi MB il risparmio sarebbe di pochi KB: non vale il
rischio. Ogni nostro backup è completo e si ripristina da solo.

## Esercizi

1. In `src/config.js`, `backup.minutiControllo`: portalo a 1 e guarda i backup automatici
   comparire dopo ogni modifica (poi rimettilo a 10).
2. Apri un `.db.gz` con 7-Zip o con Archive Utility del Mac: dentro c'è il database.


# Parte B: Impostazioni

Menu **Impostazioni** (solo Admin), con tre sezioni.

## Da provare

**Catalogo degli atti**
1. **+ Nuovo atto**: mentre compili, sotto "Come si calcola il termine" compare la regola
   a parole e un esempio di calcolo con la data di oggi. Crealo: è subito disponibile in
   «+ Nuova scadenza».
2. Apri **Ricorso al TAR** → cambia solo i promemoria → Salva: si salva subito, senza
   domande (le scadenze non cambiano). Nello «Storico» dell'atto c'è la riga.
3. Ora cambia i **giorni** da 60 a 90 → Salva: si apre **Modifica dei termini**.
   - *1 · Perché cambia*: normativa (serve il riferimento alla norma), errore, decisione interna;
     più una spiegazione.
   - *2 · Da quando vale*: retroattiva, dal giorno X, oppure una per una. L'anteprima sotto
     si aggiorna mentre scegli: quali scadenze, di quanto si spostano, se qualcuna
     risulterebbe già scaduta.
   - *3 · Applica*: prima viene fatto un backup («Prima di una modifica dei termini»), poi
     le scadenze scelte vengono ricalcolate; ognuna ha la riga nello storico e chi se ne
     occupa riceve una notifica. Le scadenze corrette a mano non vengono toccate.

**Festività e chiusure**: aggiungi una chiusura (es. un ponte). Se una scadenza aperta cade
proprio in quel giorno, in cima compare «Da controllare» con il link per aprirla.
Le chiusure valgono per i calcoli fatti da quel momento: le scadenze già calcolate non si
spostano da sole (decide l'avvocato, dal dettaglio: Ricalcola o Correggi).

**Valori predefiniti**: promemoria per le scadenze senza atto, per le udienze, termini
proposti per gli atti fuori catalogo, giorni dei fascicoli. Prima erano in `src/config.js`:
lì restano solo come valori iniziali.

## Cosa c'è nel codice

```
src/db/catalogo.js          creare/modificare atti, anteprima e applicazione dei cambi, chiusure
src/servizi/impostazioni.js valori predefiniti (tabella "impostazioni")
src/routes/impostazioni.js
src/views/impostazioni.js
public/js/impostazioni.js   anteprima della regola e del ricalcolo, nel browser
test/impostazioni.test.js
```

**Dati e regola, separati.** Nome, materia, promemoria si salvano subito. La *regola*
(decorrenza, giorni, direzione, sospensione feriale, giorno utile) no: `regolaCambia`
se ne accorge e la rotta porta alla pagina del cambio, con la nuova regola nell'indirizzo.
Finché non premi «Applica», l'atto non cambia.

**L'anteprima e l'applicazione usano lo stesso calcolo** (`scadenzeInteressate`): quello
che vedi è esattamente quello che succede. Il JavaScript della pagina serve solo a
mostrarlo prima; quando premi Applica, decide il server, in un'unica transazione.

**Lo storico dell'atto** (tabella `atti_versioni`): ogni creazione e modifica, con chi,
quando, perché, la norma, la regola prima e dopo, e quante scadenze ha ricalcolato.

# Aggiunta: assegnazione automatica per categoria

Ogni scadenza appartiene a una **categoria**, che è la materia del catalogo (Immigrazione,
Civile, Penale…). Per ogni categoria l'Admin sceglie una **squadra predefinita** con il suo
referente ★: quando si inserisce una scadenza di quella categoria, la squadra si propone da sola.

## Da provare

1. **Impostazioni → Categorie e squadre**: per ogni categoria spunta le persone e il referente,
   poi **Salva**. Nei dati di prova Immigrazione, Civile, Penale e Infortunistica hanno già una squadra.
2. **+ Nuova scadenza** → scegli un atto di Immigrazione: la categoria si compila da sola e le
   caselle di «Chi se ne occupa» si spuntano con la squadra. Sopra c'è scritto
   «Proposta dalla categoria…».
3. Cambia una casella: la nota diventa «Scelta a mano» e da lì l'app non tocca più la tua
   scelta, nemmeno se cambi atto. Con «Usa la squadra della categoria» torni alla proposta.
4. Per un'**udienza** o un atto **fuori catalogo** la categoria la scegli tu dal menu.
5. Inserisci e apri lo storico: «Assegnata in automatico (categoria …)» oppure
   «Assegnata a mano».
6. Dopo l'inserimento si cambia tutto a mano come sempre (Coinvolgi, Togli, Rendi referente).

**Cosa vale per cosa**
- Una modifica alla squadra di una categoria vale per le scadenze **nuove**.
- Se ci sono scadenze aperte di quella categoria rimaste da assegnare, nella scheda compare
  «Assegnale a questa squadra».
- Chi è disattivato viene saltato; chi viene eliminato esce anche dalle squadre delle categorie.

**Creare, rinominare, eliminare le categorie** (sempre da Categorie e squadre)
- **+ Nuova categoria**: esiste subito, anche senza atti (es. per le udienze); puoi darle una squadra.
- **Rinomina o elimina → Rinomina**: il nome cambia ovunque (atti, scadenze, squadra).
  Non si può usare il nome di un'altra categoria già esistente.
- **Rinomina o elimina → Elimina la categoria…**: una pagina dice quanti atti e scadenze ne fanno
  parte e chiede **in quale categoria spostarli**. La sua squadra predefinita viene tolta (per le
  nuove varrà quella di destinazione); le squadre già assegnate alle scadenze non cambiano; ogni
  scadenza spostata ha una riga nello storico. Una categoria vuota si elimina con la sola conferma.
- Nel modulo di un atto la categoria si sceglie da un menu: niente categorie nate da un errore
  di battitura.

## Nel codice

```
src/db/categorie.js         categorie (crea, rinomina, elimina), squadra, assegnazione delle aperte
src/routes/scadenze.js      leggiNuovaScadenza: categoria e squadra al momento dell'inserimento
public/js/nuova-scadenza.js proponiSquadra / aggiornaNotaSquadra: la proposta nel modulo
test/categorie.test.js
```

Il campo nascosto `squadra_da_categoria` dice al server se chi inserisce ha toccato la squadra
(0) oppure no (1). Così, se la squadra arriva vuota perché JavaScript è spento, il server usa
quella della categoria; se invece l'hai svuotata tu apposta, resta da assegnare.

# Aggiunta: le "i" con la spiegazione

In **Nuova scadenza** e nella **scheda di una scadenza**, accanto ai campi e ai titoli c'è una
piccola **i** nel cerchietto. Passandoci sopra con il mouse compare una breve spiegazione;
cliccandoci resta aperta finché non clicchi altrove o premi Esc (che chiude solo la
spiegazione, non la finestra o il pannello). Funziona anche su tablet, al tocco.

**I testi stanno tutti in `src/views/aiuti.js`**, uno per riga: per correggerne uno basta
cambiare la frase lì. Gli avvisi importanti (es. «da verificare», «non ancora assegnata»)
restano invece sempre a schermo.

# Aggiunta: la Guida e il tutorial

## La Guida (menu laterale → Guida)

Sempre consultabile da qualunque pagina. Ha due parti:

- **Come funziona lo Scadenzario**: il manuale, scritto da noi. Ogni pagina è un file in
  `guida/` (es. `guida/05-nuova-scadenza.md`). In testa al file c'è per chi è:
  `ruoli: tutti`, `ruoli: editor, admin` oppure `ruoli: admin`. Chi non ha il ruolo non vede
  la pagina (né nell'indice, né nella ricerca, né aprendo il link a mano). Il numero nel nome
  del file decide l'ordine. Si aggiorna con il codice: cambiare un testo = cambiare il file.
- **Procedure dello studio**: pagine scritte dall'**Admin** dall'app stessa (+ Nuova pagina,
  Modifica, Elimina). Servono per le istruzioni operative dello studio, anche non tecniche
  (a chi rivolgersi, come si archivia, le abitudini di casa). Stanno nel database (tabella
  `guida_pagine`), quindi finiscono nei backup. Ogni modifica va nel Registro.

C'è una **ricerca** su entrambe le parti. La formattazione è semplice: `#` titoli, `-` elenchi,
`**grassetto**`, `*corsivo*`, `[testo](/indirizzo)` per i link, `>` per un riquadro di avviso.
Il testo viene sempre ripulito prima di mostrarlo: nessuno può inserire codice nella pagina.

## Il tutorial guidato

Al **primo accesso** (anche dopo il cambio della password provvisoria) parte un tour sulla
dashboard: oscura lo schermo, illumina una zona alla volta e la spiega in un fumetto
(Avanti / Indietro / Salta; frecce e Esc da tastiera). È **diverso per ruolo**: il
Collaboratore vede 12 passi, l'Editor anche Nuova scadenza, l'Admin anche Utenti, Registro,
Backup e Impostazioni (18 passi). Finito o saltato, non riparte più da solo; si rivede da
**menu sul nome → Rivedi il tutorial** oppure dal pulsante nella Guida.

## Da fare prima della messa in servizio

I testi del manuale e del tutorial sono una **prima stesura**: vanno riletti e completati
alla fine, quando l'app è definitiva (come deciso: struttura ora, testi alla fine).

## Nel codice

```
guida/*.md                 le pagine del manuale
src/servizi/testo.js       la formattazione sicura (testoInHtml)
src/servizi/guida.js       manuale, procedure dello studio, ricerca
src/views/guida.js         indice, lettura, modifica
src/routes/guida.js        /guida, /guida/studio/…, /tutorial/visto
src/views/tutorial.js      i passi del tutorial per ruolo (testi qui)
public/js/tutorial.js      il tour sullo schermo
test/guida.test.js
```
