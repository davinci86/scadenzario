# Scadenzario di Studio

Scadenze, udienze, segnalazioni e movimenti dei fascicoli per studi legali.
App web che gira nella rete interna dello studio.

## Avviarlo sul Mac

Dal Terminale, dentro questa cartella:

```
npm install   # la prima volta, e quando una tappa aggiunge librerie
npm start     # avvia l'app
```

Poi apri il browser su **http://localhost:3000**.
Per fermarla, nel Terminale premi **Ctrl + C**.

Utenti di prova (password per tutti: `demo`):

| Nome utente | Persona | Ruolo |
| --- | --- | --- |
| a.ferrara | Anna Ferrara | Admin |
| p.russo | Avv. Paolo Russo | Editor |
| m.deluca | Avv. Marco De Luca | Collaboratore |
| g.esposito | Avv. Giulia Esposito | Collaboratore |
| l.romano | Dott. Luca Romano | Collaboratore |

## Test

```
npm test
```

## Guide

Ogni tappa ha la sua guida: `GUIDA-TAPPA-1.md`, `GUIDA-TAPPA-2.md`, `GUIDA-TAPPA-3.md`, …

## Email (sul server dello studio)

I promemoria via email partono solo se è configurato un server di posta, con le
variabili d'ambiente `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
Finché non c'è, le email restano in coda (visibili all'Admin in "Registro").
