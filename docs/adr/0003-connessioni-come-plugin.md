# ADR 0003: connessioni ed endpoint come plugin caricati da una factory

Stato: accettato (decisione di Antonio) · Data: 2026-10-29

## Contesto
Il router e i servizi LLM potranno stare dentro l'app, sul PC come servizio locale, su una Web API intranet o all'esterno, e la scelta potrà cambiare nel tempo o tra colleghi (principio 7 di CLAUDE.md). Il "come ci arrivo" va quindi separato dal resto del codice e reso sostituibile senza modificarlo.

## Decisione
1. Ogni tipo di connessione è un plugin in `plugin/connection/<nomeProvider>/App.js`.
2. Il modulo `App.js` esporta una funzione che riceve la configurazione e restituisce un oggetto che rispetta il contratto JSDoc `IConnection`.
3. Una factory `createConnection(nomeProvider, config)` carica il plugin con `require` nello stesso processo (il processo principale di Electron) e restituisce l'oggetto. Il resto del codice conosce solo la factory e `IConnection`, mai i plugin.
4. Quale provider usare si decide da configurazione, con il nome come stringa.
5. Lo stesso schema vale per gli endpoint: `plugin/endpoint/<nome>/App.js`, factory `createEndpoint(nome, config)`, contratto JSDoc `IEndpoint`. Un endpoint riceve la sua `IConnection` dalla configurazione e non sa come è fatto il trasporto.
6. **Segreti fuori dai plugin.** Né connessioni né endpoint leggono segreti da soli (file, variabili d'ambiente, portachiavi). Ricevono dal nucleo dell'app un accesso ai segreti tramite un'interfaccia (es. `ISecretStore`, con `get(nome)`), oggi implementata da `src/main/secrets.js`. Così la futura feature sulla crittografia dei segreti cambierà solo l'implementazione di quell'interfaccia, senza toccare i plugin.

## Vincoli di implementazione
- **Nome del provider validato** (solo `[a-z0-9-]`) e percorso risolto e controllato dentro `plugin/connection/`, per evitare path traversal (`../`).
- **Plugin solo dalla cartella dell'app.** Un plugin gira con tutti i permessi del processo principale, quindi non si caricano plugin da cartelle scrivibili dall'utente (es. `userData`). Nel pacchetto finale `plugin/` va incluso tra i file dell'app.
- **Contratto verificato a runtime.** Il JSDoc non è vincolante in JavaScript, quindi la factory controlla che l'oggetto restituito abbia i membri obbligatori di `IConnection` e altrimenti lancia un errore chiaro (nome del plugin e membro mancante).
- **Test di contratto** in `test/` che carica ogni plugin presente in `plugin/connection/` e ne verifica il contratto con una configurazione finta.
- I contratti `IConnection`, `IEndpoint` e `ISecretStore` (metodi, errori, configurazione) li definisce la fase 3 della feature che introduce le factory; si documentano in file JSDoc in `src/main/contracts/`.
- Una sola factory generica (es. `loadPlugin(tipo, nome, config, contratto)`) per connessioni ed endpoint, così validazione del nome, controllo del percorso e verifica del contratto sono scritti una volta sola.

## Da decidere nella fase 3
- Nome del file d'ingresso: `App.js` come deciso, oppure `index.js` (convenzione Node, permette `require` della cartella).
- Se la factory restituisce una nuova istanza a ogni chiamata o la riusa per la stessa configurazione.

## Conseguenze
- Aggiungere un tipo di connessione o un endpoint significa aggiungere una cartella, senza toccare il resto del codice.
- La crittografia dei segreti sarà una feature successiva, che lavora solo dietro `ISecretStore`.
- Il caricamento dinamico è codice eseguito con pieni permessi: i plugin vanno revisionati come il resto del codice.
