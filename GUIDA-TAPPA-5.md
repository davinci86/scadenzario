# Guida alla Tappa 5 · Parte A: backup e ripristino

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
