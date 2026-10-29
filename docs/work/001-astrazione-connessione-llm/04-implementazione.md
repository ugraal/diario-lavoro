# Implementazione (001-astrazione-connessione-llm)

Ordine di esecuzione: A17, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A18.

| Attività | Stato | Commit | Note |
|---|---|---|---|
| A17 | fatto | 8992933 | gate esteso |
| A1 | fatto | 8fef36c | contratti e runner test/run.js |
| A2 | da-fare | | |
| A3 | da-fare | | |
| A4 | da-fare | | |
| A5 | da-fare | | |
| A6 | da-fare | | |
| A7 | da-fare | | |
| A8 | da-fare | | |
| A9 | da-fare | | |
| A10 | da-fare | | |
| A11 | da-fare | | |
| A12 | da-fare | | |
| A13 | da-fare | | |
| A14 | da-fare | | |
| A15 | da-fare | | |
| A16 | da-fare | | |
| A18 | fatto | | verifica finale, vedi sezione sotto |

## Verifica finale A18

- **CA5**: `@anthropic-ai/sdk` è importato solo in `plugin/endpoint/anthropic/App.js` (grep su `src`, `test`, `plugin`, `config`, escluso `node_modules`). Nessun `AnthropicAdapter` né classe/uso di `Router`. Restano solo due occorrenze innocue della parola: un commento in `src/main/contracts/endpoint.js` ("router" come esempio di servizio) e il nome `router` come endpoint inesistente nei dati di `test/llm-config.test.js`.
- **CA14**: nessun `process.env`, `safeStorage` o `secrets.json` in `plugin/`, `src/main/asana.js` e `src/main/plugins.js`.
- **`npm test`**: 15/15 file di test ok.
- **`npx electron test/e2e-shot.js`** (SHOT_DIR fuori dal repo): l'app parte, 4 screenshot generati (diario, diario-analisi, impostazioni, progetti). Controllati `impostazioni.png` e `diario-analisi.png`: la nota sulla privacy dice "Il testo del diario viene inviato a: API Anthropic (anthropic) per l'analisi...", cioè mostra l'endpoint effettivo. Il resto delle schermate appare regolare. Non ho a disposizione gli screenshot "di prima" per un confronto pixel per pixel, quindi "uguali a prima" è stato valutato solo a occhio su due immagini; `diario.png` e `progetti.png` non guardati.
- **Config rotta**: non provata a mano in app, perché `main.js` legge sempre `config/llm.json` dal repo e senza modificare il file reale non c'è modo di sostituirlo. Coperta da `test/service-config.test.js` (verde) e `test/llm-config.test.js`.
- **Non verificato**: prove con chiave vera (analisi, prova, errori), per scelta: nessuna chiamata reale ad Anthropic.
- Nessuna correzione necessaria.
