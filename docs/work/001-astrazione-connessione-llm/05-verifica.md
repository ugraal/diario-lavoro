# Verifica: Astrazione della connessione ai servizi LLM (001-astrazione-connessione-llm)

## Test
Data: 2026-10-29 · Esito npm test: verde (15/15 file di test ok, exit 0) · Ciclo 2, dopo le correzioni F1 e F2

Eseguiti nel ciclo 2: `npm test` (nessuna rete, nessuna chiamata reale ad Anthropic) e `npx electron test/e2e-shot.js` con `SHOT_DIR` in una cartella temporanea fuori dal repo (esito `shots ok []`, quattro screenshot: diario, diario-analisi, progetti, impostazioni; riguardato `impostazioni.png`). Ricontrollato nel codice il compito `ping` dopo F1: `src/main/llm/tasks.js` ha `maxTokens: 256` (riga 139) e `toolName: 'conferma_collegamento'` (riga 137), testo "Prova di collegamento: chiama lo strumento con ok = true."; `test/tasks.test.js` righe 17-18 impone `maxTokens === 256` e il `toolName`, quindi test e architettura sono allineati. Controlli con grep eseguiti dal repository. Note di 03-architettura.md rev 2 (N1-N4) applicate: `ping` eredita la rotta di `extractTasks`, `settings:model` scrive solo `{ model }`, `unreachable` mostra `Errore LLM: <message>`, gate esteso a `plugin/` e `config/`.

| Criterio | Come è verificato | Esito |
|---|---|---|
| CA1 | `test/anthropic-endpoint.test.js`: corpo JSON della richiesta (`model`, `max_tokens` 4096, `system`, `messages`, `tools`, `tool_choice`, solo queste 6 chiavi), chiave dallo store, retry. `test/connect.test.js` e `test/smoke.js`: una riga in `llm_runs` per chiamata con `provider` = nome endpoint. Chiave vera: verifica manuale | ok (automatico). Con chiave vera: da fare a mano |
| CA2 | `test/llm-config.test.js`: formato `provider` letto come `endpoint`, nessuna modifica dell'oggetto in memoria; `test/service-llm.test.js`: con `routes` nel vecchio formato `{ provider, model: 'x' }` la prova usa `x` e la riga ha `model = 'x'`; `test/service-config.test.js`: `settings` non toccati | ok (con store finto in memoria) |
| CA3 | `test/service-llm.test.js`: chiave valida, mancante e non valida, messaggi di oggi, riga `ping` con `entry_id` nullo ed `error` valorizzato; `test/tasks.test.js`: schema `{ ok }`, `clean`, `maxTokens === 256` e `toolName` 'conferma_collegamento' (come da architettura, dopo F1). Pulsante "Prova" nell'app con chiave vera: manuale | ok (automatico). Con UI e chiave vera: da fare a mano |
| CA4 | `test/errors.test.js` (ogni codice, testi uguali a oggi, `unreachable` come N3); `test/endpoints.test.js` (401, 403, 404, 429, 500, 529, senza output). grep: `src/main/service.js` importa solo `./llm/errors`, nessuna occorrenza di "anthropic" | ok |
| CA5 | grep: `@anthropic-ai/sdk` solo in `plugin/endpoint/anthropic/App.js` (nessuna occorrenza in `src/` e `test/`); `Router` e `llm/router` assenti in `src/` e `test/` (restano solo la parola "router" come nome di endpoint di esempio in `test/llm-config.test.js` e un commento in `src/main/contracts/endpoint.js` che cita l'SDK, senza import) | ok |
| CA6 | `test/connections.test.js` + `test/contract/connection.js` su ogni cartella di `plugin/connection/` e sulla fixture `fake`, senza rete (delega di `https` a `globalThis.fetch` sostituito) | ok |
| CA7 | `test/endpoints.test.js` + `test/contract/endpoint.js` su ogni cartella di `plugin/endpoint/` con connessione e segreti finti, fixture `test/fixtures/endpoint-responses/anthropic.js`; la chiave usata è quella dello store (`Authorization: Bearer`, N-A6) | ok |
| CA8 | `test/secrets.test.js` + `test/contract/secret-store.js` su `Secrets` (valore salvato, `''` se assente, precedenza env per `anthropic` e `asana`, `set('')`, `status` senza valore, `readOnlyView`) | ok |
| CA9 | `test/asana-secret.test.js` (`ISecretReader` finto e fetch finto: invio, `me()`, token assente, vista che rifiuta `anthropic`); `test/smoke.js` (invio Asana, testo del diario non inviato) | ok |
| CA10 | `test/plugins.test.js`: `../x`, `Anthropic`, `a/b`, vuoto, inesistente, non funzione, membro mancante (fixture `broken`), con nome del plugin nel messaggio | ok |
| CA11 | `test/llm-config.test.js` (JSON rotto, file assente, campi sconosciuti, plugin non valido, endpoint e connessione inesistenti, segreto e compito sconosciuti, messaggi con file e voce); `test/service-config.test.js` (analisi con messaggio chiaro, salvataggio diario e invio ad Asana funzionanti). App reale con file rinominato o rotto: manuale | ok (automatico). Con app avviata: da fare a mano |
| CA12 | `test/llm-config.test.js` e `test/connect.test.js`: merge campo per campo (`summarizeDay` con `b`, altri dal file), endpoint inesistente in `settings` con avviso, definizioni di connessioni o endpoint in `settings` ignorate | ok |
| CA13 | `test/connect.test.js`: endpoint finto da `test/fixtures/plugin/endpoint/fake/` assegnato a un compito, gli altri su `anthropic` con `fetch` finto; una riga in `llm_runs` per successo e per fallimento con il `provider` corretto, scritta dall'involucro; plugin senza accesso a `logRun` o store; nessun file di `src/` conosce l'endpoint finto | ok |
| CA14 | grep di `process.env`, `safeStorage`, `secrets.json` in `plugin/` e `src/main/asana.js`: nessuna occorrenza. `test/endpoints.test.js` verifica anche che il segreto non compaia in errori e `describe()` | ok |
| CA15 | `test/renderer-llm-note.test.js` (nota con l'endpoint effettivo, avviso di configurazione). Screenshot `impostazioni.png`: "Il testo del diario viene inviato a: API Anthropic (anthropic) per l'analisi..." | ok (screenshot guardato). Con configurazione modificata in app: da fare a mano |
| CA16 | Riletti con grep `ARCHITECTURE.md`, `docs/adr/0002-router-llm-per-compiti.md` e `CLAUDE.md`: nessun "router locale" né classe `Router` nel testo corrente; il router è descritto come servizio esterno raggiunto come endpoint; nota in coda all'ADR 0002 presente; principi 4 e 5 parlano di `connect` e flusso comune. Resta nel corpo storico dell'ADR 0002 la frase originale "un router locale" (righe 6 e 9), coperta dalla nota in coda | ok (rilettura per parole chiave; il revisore rilegge tutto) |
| CA17 | `npm test` verde; `npx electron test/e2e-shot.js` termina con `shots ok []` e produce gli screenshot. Impostazioni uguali a prima salvo la nota sulla privacy ("API Anthropic (anthropic)"). Confronto pixel con gli screenshot di prima non fatto | ok |

Criteri coperti: 17/17 con prova automatica o controllo con grep. Tre criteri (CA1, CA3, CA11) hanno in più una verifica manuale ancora da fare a mano, e CA15 una prova con configurazione diversa.

### Non verificato
- Nessuna chiamata reale ad Anthropic: la richiesta e la chiave (header `Authorization: Bearer` dell'SDK 1.3.0) sono provate solo con `fetch` finto. Da fare a mano con chiave vera: analisi di una voce e confronto con le righe di `llm_runs` (CA1); prova con chiave valida, cancellata e sbagliata (CA3); modello inesistente nelle Impostazioni (atteso "Modello non trovato", CA4).
- `ping` con `max_tokens` 256 contro il servizio reale: non provato (rischio `no_output` annotato in 03-architettura.md). Il valore è ora quello dell'architettura, ma solo la prova con chiave vera può confermare che il modello risponda con `tool_use` completo.
- Confronto con la riga del revisore sul bloccante precedente: il difetto su `ping` (64 token, nome e testo diversi) è chiuso nel codice e nel test; l'esito finale spetta al revisore.
- Configurazione rotta nell'app avviata: provata solo a livello di `Service` e `createConnector`, non in Electron. Passi manuali: rinominare `config/llm.json`, `npm start`, controllare l'avviso all'avvio e nelle Impostazioni, salvare una voce di diario, inviare un'attività ad Asana, poi ripristinare il file.
- CA2: il test usa uno store finto in memoria, non il vero SQLite; che `routes` su disco non venga riscritto si deduce dal codice (nessuna scrittura in lettura) e da `service-config.test.js`.
- Prova di Asana e invio reale con token vero: non fatti.
- Screenshot non confrontati pixel per pixel con quelli di prima.
- Estensione del gate (`.claude/hooks/gate.js` copre `plugin/` e `config/`): vista nel codice, non provata con un'esecuzione.

### Problemi trovati
Nessuno nel ciclo 2. Nessun test fallito. Nessun criterio senza copertura automatica o controllo con grep. Il punto di CA3 che nel ciclo 1 non corrispondeva al codice (`maxTokens`) ora coincide.

## Revisione
Data: 2026-10-29 · Commit revisionati: 8fef36c..19584a5 (ciclo 1: diff `8992933..83211fe`; ciclo 2: diff `83211fe..19584a5`, correzioni F1 `0e19c56` e F2 `f745f6e`)

Riferimenti: `03-architettura.md` rev 2 (accettata, deroghe D1-D5), ADR 0004, principi di `CLAUDE.md`.

### Esito del ciclo 2
- **Bloccante `ping`: risolto.** `src/main/llm/tasks.js:134-148` ha ora `toolName: 'conferma_collegamento'`, `maxTokens: 256` e `buildUser` = `'Prova di collegamento: chiama lo strumento con ok = true.'`, come in `03-architettura.md` (righe 114-118). `test/tasks.test.js:17-18` impone `maxTokens === 256` e il `toolName`. La riga CA3 della sezione Test riporta 256 e ora corrisponde al codice.
- **Osservazione 1 (prefisso ripetuto): risolta.** `src/renderer/app.js:50` e `:334` mostrano solo `llm.error`; tutti gli errori di caricamento passano da `configError` (`src/main/llm/config.js:18`, `:123`, `:133`) e hanno quindi già il prefisso. `test/renderer-llm-note.test.js:17-19` controlla che compaia una volta sola.
- **Osservazione 5 (`constructor.name`): risolta.** `plugin/endpoint/anthropic/App.js:20` usa `e instanceof Anthropic.APIConnectionError`; nell'SDK 1.3.0 `APIConnectionTimeoutError` estende `APIConnectionError` (`core/error.js:89`), quindi il timeout resta `unreachable`. Il caso `fetch failed` del contratto passa.
- **Osservazione 7 (`secrets:set`): risolta.** `src/main/main.js:86` usa `secrets.names()` (`src/main/secrets.js:35`, stesso elenco `anthropic`, `asana`).
- **Osservazione 8 (chiave nel contratto `IEndpoint`): risolta.** `test/endpoints.test.js:62-63` richiede `fx.keyOf(init)` a ogni fixture e confronta la chiave inviata con quella dello store; `:94` verifica che il segreto non compaia nel messaggio di `unreachable`. `keyOf` è in `test/fixtures/endpoint-responses/anthropic.js:18-22`.
- **Osservazione 9 (albero di `ARCHITECTURE.md`): risolta.** `shared/util.js`, `preload.js` e `renderer/` sono tornati sotto `src/` (righe 44-46) e `secret-store.js` è descritto come `ISecretStore e ISecretReader` (riga 37).
- **Osservazione 10 (`04-implementazione.md`): risolta nel contenuto** (riga 34), con un difetto di forma annotato sotto.
- **Osservazioni 2, 3, 4, 6: restano non bloccanti** e sono annotate in `02-piano.md` (attività correttive, voce F2) come da riportare nella PR. Sono ripetute sotto con i riferimenti aggiornati.
- **Regressioni:** nessuna. Il diff `83211fe..HEAD` tocca solo i punti sopra; `npm test` verde (15/15). Nessun nuovo canale IPC, nessuna nuova dipendenza, nessun uso dell'SDK fuori dal plugin.

### Bloccanti
Nessuno.

Storico del ciclo 1 (risolto con F1):
- [src/main/llm/tasks.js:134-147, test/tasks.test.js:17] **Il compito `ping` si discosta dall'architettura accettata senza che la deviazione sia dichiarata.** L'architettura (sezione Interfacce, "Nuovo compito LLM `ping`", e tabella Rischi) fissa `maxTokens: 256` "come margine, perché una chiamata `tool_use` tagliata da `max_tokens` darebbe `no_output`", `toolName: 'conferma_collegamento'` e `buildUser` = `'Prova di collegamento: chiama lo strumento con ok = true.'`. Il codice ha `maxTokens: 64`, `toolName: 'rispondi_ok'` e un altro testo, e il test impone `maxTokens <= 100`, quindi rifiuterebbe proprio il valore accettato. `04-implementazione.md` non registra la deviazione e A18 non ha provato il `ping` con il servizio reale. Scenario: un modello che antepone qualche token o serializza l'input in modo più lungo esaurisce 64 token, l'SDK restituisce `stop_reason: max_tokens` senza blocco `tool_use` completo e la prova nelle Impostazioni mostra "Il modello non ha restituito un output strutturato" con una chiave valida (CA3 non soddisfatto). Inoltre la sezione Test qui sopra riporta "`maxTokens` 256", che non corrisponde al codice. Correzione: riportare `ping` ai valori dell'architettura (256, `conferma_collegamento`, testo indicato) e correggere il limite in `test/tasks.test.js` (per esempio `=== 256` oppure `<= 256`). In alternativa, dichiarare la deviazione in `04-implementazione.md` e farla accettare da Antonio. In entrambi i casi va allineata la riga CA3 della sezione Test.

### Da migliorare (non bloccanti)
Aperte dopo il ciclo 2 (da riportare nella PR):
- [src/main/llm/connect.js:41-43] (osservazione 2) La nota sulla privacy nomina solo l'endpoint di `extractTasks`; se `summarizeDay` o `reviewGoals` vanno a un altro endpoint, la nota non lo dice. Oggi c'è un solo endpoint e CA15 è rispettato.
- [plugin/connection/https/App.js:14-17] (osservazione 3) Le opzioni sconosciute della connessione `https` si ignorano senza errore (per esempio un refuso `timeoutMS`), a differenza dell'endpoint `anthropic` che le rifiuta con `plugin_options`.
- [plugin/endpoint/anthropic/App.js:48-56] (osservazione 4) Deroga D3 incompleta: l'SDK legge anche `ANTHROPIC_OPEN_TELEMETRY*` e `ANTHROPIC_WEBHOOK_SIGNING_KEY` dall'ambiente. Nessun rischio concreto oggi; conviene `openTelemetry: false` e aggiornare D3 in `03-architettura.md`.
- [plugin/endpoint/anthropic/App.js:46] (osservazione 6) Con chiave mancante `llm_runs.error` vale `'Chiave mancante'` invece del testo di prima; il messaggio all'utente (`src/main/llm/errors.js:18`) è invariato.
- [docs/work/001-astrazione-connessione-llm/04-implementazione.md:35-36] (nuova, di forma) Le righe `| F1 | ...` e `| F2 | ...` sono state aggiunte in coda alla sezione "Verifica finale A18", subito dopo un punto elenco e senza intestazione, quindi non fanno parte della tabella delle attività e non si vedono come tabella. Vanno spostate nella tabella in alto (dopo la riga di A18).

Elenco del ciclo 1 (1, 5, 7, 8, 9, 10 risolte con F2; 2, 3, 4, 6 aperte, vedi sopra):
- [src/renderer/app.js:50 e funzione `llmNote` (circa riga 334)] Il prefisso si ripete. `llm.error` comincia già con "Configurazione LLM non valida (config/llm.json): ...", quindi il toast mostra "Configurazione LLM non valida: Configurazione LLM non valida (config/llm.json): ..." e la nota "La configurazione dell'LLM non è valida: Configurazione LLM non valida ...". Meglio mostrare solo `llm.error`.
- [src/main/llm/connect.js:41-43] La nota sulla privacy nomina solo l'endpoint di `extractTasks`. Se il file aziendale assegna `summarizeDay` o `reviewGoals` a un altro endpoint (scelta consentita anche da `settings.routes` fra gli endpoint del file), il diario va anche lì, ma la nota non lo dice. Oggi CA15 è rispettato perché c'è un solo endpoint. Conviene elencare gli endpoint distinti delle rotte che ricevono il testo del diario (tutte tranne `ping`).
- [plugin/connection/https/App.js:14-17] Le opzioni sconosciute si ignorano senza errore. Per esempio un refuso `timeoutMS` lascia il valore predefinito senza avviso, mentre l'endpoint `anthropic` le rifiuta con `plugin_options`. Per coerenza con la "validazione stretta" dell'ADR 0004 (punto 3) conviene rifiutarle, aggiungendo il caso al test di contratto delle connessioni.
- [plugin/endpoint/anthropic/App.js:49-57] La deroga D3 è incompleta. L'SDK 1.3.0 (`client.d.ts`) legge dall'ambiente anche `ANTHROPIC_OPEN_TELEMETRY*` (span con contenuto opzionale, `TRACES_CONTENT_MODE`) e `ANTHROPIC_WEBHOOK_SIGNING_KEY`. Oggi non c'è rischio concreto, perché l'app non registra nessun tracer provider e i webhook non si usano. Conviene comunque passare `openTelemetry: false` e aggiornare l'elenco di D3 in `03-architettura.md`.
- [plugin/endpoint/anthropic/App.js:20-21] Gli errori di rete si riconoscono da `e.constructor.name`, che è fragile se il codice viene minificato o se una versione futura dell'SDK cambia le classi. Meglio `e instanceof Anthropic.APIConnectionError`, che comprende anche il timeout. Oggi il ripiego `unknown` dà comunque lo stesso testo ("Errore LLM: ..."), quindi l'utente non vede differenze.
- [plugin/endpoint/anthropic/App.js:47] Con chiave mancante, la riga di `llm_runs` ha `error = 'Chiave mancante'` invece del testo di prima ("API key Anthropic mancante: impostala nelle Impostazioni"). Il messaggio all'utente è identico; cambia solo il dataset. Basta saperlo per chi analizza `llm_runs`.
- [src/main/main.js:86] `secrets:set` usa ancora l'elenco fisso `['anthropic', 'asana']` invece di `secrets.names()`, come prevede l'architettura (tabella canali IPC). Il comportamento è lo stesso, ma è una piccola deviazione non dichiarata.
- [test/endpoints.test.js, test/contract/endpoint.js] Il test di contratto generico non verifica che la chiave inviata sia quella dello store, cosa che CA7 chiede al contratto. La verifica sta solo nel test specifico `test/anthropic-endpoint.test.js:43`, quindi un endpoint futuro non verrebbe controllato. Conviene spostare il controllo nel contratto, per esempio con una funzione `fx.keyOf(init)` nella fixture di ogni endpoint. Lo stesso vale per il controllo che il segreto non compaia nel messaggio di `unreachable`.
- [ARCHITECTURE.md:43-47] Nell'albero dei file, `plugin/` e `config/llm.json` sono finiti in mezzo a `src/`: `shared/util.js`, `preload.js` e `renderer/` ora sembrano sotto `config/`. Alla riga 36, `secret-store.js` è descritto solo come `ISecretReader`, ma contiene anche `ISecretStore`.
- [docs/work/001-astrazione-connessione-llm/04-implementazione.md:34] "Nessuna correzione necessaria" va rivisto alla luce del bloccante su `ping` e di `main.js:86`.

Verifiche richieste, con esito negativo (nessun problema):
- **Segreti fuori dai plugin**: le connessioni ricevono `readOnlyView(store, [])`, gli endpoint la vista sul solo segreto dichiarato e `Asana` la vista su `['asana']`. Nessun plugin vede `set`, `status` o lo store, e `describe()` e i messaggi non contengono la chiave (lo verifica il test).
- **Path traversal nella factory** (`src/main/plugins.js:29-47`): `kind` è controllato su un elenco chiuso con `hasOwnProperty`, il nome deve rispettare `^[a-z0-9-]{1,64}$`, il percorso relativo è controllato e `baseDir` viene solo da `main.js` (`appRoot/plugin`), mai da `settings` o da `userData`.
- **Redirezione del diario da settings** (`src/main/llm/config.js:146-181`): `settings.routes` può cambiare solo `model` e scegliere un endpoint già definito nel file. Le chiavi `__proto__` e `constructor` non passano, perché i controlli usano `hasOwnProperty` e i nomi devono rispettare `NAME_RE`. Le altre chiavi di `settings` non si leggono.
- **Messaggi d'errore** (`src/main/llm/errors.js`): testi identici a quelli di prima per ogni codice, compreso il taglio a 200 caratteri.
- **Righe di `llm_runs`**: l'involucro scrive una riga per ogni successo e per ogni errore, del plugin o di `clean`. Non scrive righe solo quando la chiamata non parte (configurazione non valida, compito sconosciuto), come faceva il `Router`.
- **Residui di `Router`**: nessuno in `src/` e `test/`, salvo la parola "router" in un commento e in un dato di test.
- **Deroghe**: D1-D5 sono dichiarate e rispettate. D4 è chiusa (`gate.js` e `CLAUDE.md:53` comprendono `plugin/` e `config/`).

### Conformità ai principi
1. Local-first: ok. Nessun nuovo dato esce dalla macchina. Configurazione e plugin si caricano solo dalla cartella dell'app.
2. L'LLM propone, la persona conferma: ok, parte non toccata.
3. Il testo del diario non va su Asana: ok. `asana.js` cambia solo nella provenienza del token, e il controllo in `smoke.js` resta.
4. Indipendenza dal provider: ok. L'SDK si importa solo in `plugin/endpoint/anthropic/App.js` e i compiti si eseguono con `connect`.
5. Dataset (`llm_runs`, `tasks.llm_original`): ok. L'involucro scrive sempre la riga, `raw` si conserva anche quando `clean` fallisce e `llm_original` non cambia. Unica differenza: il testo di `error` per `no_key` (non bloccante).
6. Sicurezza Electron: ok. `preload.js` è invariato, non ci sono canali nuovi e i segreti passano solo da `secrets.js` tramite `ISecretStore`/`ISecretReader`.
7. Astrazione delle dipendenze critiche: ok, con le deroghe D1-D3 dichiarate. D3 va completata (non bloccante). Ci sono test di contratto per `IConnection`, `IEndpoint` e `ISecretStore`; dal ciclo 2 il contratto `IEndpoint` verifica anche la chiave inviata e l'assenza del segreto nei messaggi di `unreachable`.
- Test per ogni modifica di comportamento: ok. Dal ciclo 2 il test di `ping` fissa i valori accettati (256, `conferma_collegamento`) e c'è un test per il prefisso non ripetuto.
- Logica fuori da `main.js`: ok. `testLlm`, `setModel` e `llmStatus` stanno in `service.js`.
