# ADR 0003: connessioni ai servizi come plugin caricati da una factory

Stato: accettato (decisione di Antonio) · Data: 2026-10-29

## Contesto
Il router e i servizi LLM potranno stare dentro l'app, sul PC come servizio locale, su una Web API intranet o all'esterno, e la scelta potrà cambiare nel tempo o tra colleghi (principio 7 di CLAUDE.md). Il "come ci arrivo" va quindi separato dal resto del codice e reso sostituibile senza modificarlo.

## Decisione
1. Ogni tipo di connessione è un plugin in `plugin/connection/<nomeProvider>/App.js`.
2. Il modulo `App.js` esporta una funzione che riceve la configurazione e restituisce un oggetto che rispetta il contratto JSDoc `IConnection`.
3. Una factory `createConnection(nomeProvider, config)` carica il plugin con `require` nello stesso processo (il processo principale di Electron) e restituisce l'oggetto. Il resto del codice conosce solo la factory e `IConnection`, mai i plugin.
4. Quale provider usare si decide da configurazione, con il nome come stringa.

## Vincoli di implementazione
- **Nome del provider validato** (solo `[a-z0-9-]`) e percorso risolto e controllato dentro `plugin/connection/`, per evitare path traversal (`../`).
- **Plugin solo dalla cartella dell'app.** Un plugin gira con tutti i permessi del processo principale, quindi non si caricano plugin da cartelle scrivibili dall'utente (es. `userData`). Nel pacchetto finale `plugin/` va incluso tra i file dell'app.
- **Contratto verificato a runtime.** Il JSDoc non è vincolante in JavaScript, quindi la factory controlla che l'oggetto restituito abbia i membri obbligatori di `IConnection` e altrimenti lancia un errore chiaro (nome del plugin e membro mancante).
- **Test di contratto** in `test/` che carica ogni plugin presente in `plugin/connection/` e ne verifica il contratto con una configurazione finta.
- Il contratto `IConnection` (metodi, errori, configurazione) lo definisce la fase 3 della feature che introduce la factory; lo si documenta in un file JSDoc unico (es. `src/main/contracts/IConnection.js`).

## Da decidere nella fase 3
- Se lo stesso schema vale anche per `IEndpoint` (`plugin/endpoint/<nome>/App.js`): è l'opzione consigliata, per simmetria.
- Nome del file d'ingresso: `App.js` come deciso, oppure `index.js` (convenzione Node, permette `require` della cartella).
- Se la factory restituisce una nuova istanza a ogni chiamata o la riusa per la stessa configurazione.

## Conseguenze
- Aggiungere un tipo di connessione significa aggiungere una cartella, senza toccare il resto del codice.
- Il caricamento dinamico è codice eseguito con pieni permessi: i plugin vanno revisionati come il resto del codice.
