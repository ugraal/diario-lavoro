# Piano: Astrazione della connessione ai servizi LLM (001-astrazione-connessione-llm)

Riferimento: `01-analisi.md` rev 3 (accettata). Aggiornato il 2026-10-29 con le scelte di `03-architettura.md` rev 1 e rev 2: percorsi dei moduli, A12 dopo A9, runner `test/run.js`, test dell'endpoint con `fetch` finto, `ping` che eredita da `extractTasks`, `settings:model` che scrive solo `{ model }`, testo invariato per `unreachable`, gate esteso in A17 (note N1-N4 dell'architettura). Ogni attività sta in un commit e lascia `npm test` verde. Oggi `npm test` lancia solo `test/smoke.js`: A1 prepara un modo di eseguire più file di test, che le attività successive usano.

## Attività
| Id | Attività | Criteri coperti | Dipende da | Dimensione |
|---|---|---|---|---|
| A1 | Contratti JSDoc `IConnection`, `IEndpoint`, `ISecretStore` e base dei test di contratto (più esecuzione di più file con `npm test`) | CA6, CA7, CA8 (base) | - | M |
| A2 | `Secrets` come `ISecretStore`, vista in sola lettura, test di contratto | CA8 | A1 | S |
| A3 | Factory generica `loadPlugin`, `createConnection`, `createEndpoint` con fixture di test | CA10 | A1 | M |
| A4 | Compito `ping` in `tasks.js` | CA3 (parte) | - | S |
| A5 | Plugin di connessione `https` con test di contratto | CA6 | A1, A3 | S |
| A6 | Plugin endpoint `anthropic` (SDK iniettato, errori normalizzati) con test di contratto | CA1 (parte), CA4 (parte), CA7, CA5 (parte), CA14 (parte) | A1, A2, A3, A5 | L |
| A7 | Configurazione: `config/llm.json`, caricamento, validazione, merge con `settings.routes`, lettura compatibile | CA2, CA11, CA12 | A3, A4 | L |
| A8 | `connect` e involucro del nucleo che scrive `llm_runs`; endpoint finto di test | CA13, CA1 (parte), CA14 (parte) | A3, A4, A6, A7 | L |
| A9 | `service.js` e `main.js` passano a `connect`; messaggi di errore dai codici normalizzati; `smoke.js` riscritto | CA1, CA4, CA11 (parte) | A8 | L |
| A10 | Prova del modello e canale `settings:model` sul nuovo flusso | CA3, CA2 (parte) | A9 | M |
| A11 | Rimozione di `Router` e `AnthropicAdapter` e dei loro usi | CA5 | A9, A10 | S |
| A12 | Asana e controllo token in `service.js` tramite `ISecretStore` | CA9, CA14 | A2, A9 | M |
| A13 | Configurazione non valida: avvio e funzioni LLM con messaggio chiaro, resto dell'app attivo | CA11 | A9 | M |
| A14 | Nota sulla privacy con l'endpoint effettivo | CA15 | A9 | S |
| A15 | Documenti: `ARCHITECTURE.md` e nota in coda all'ADR 0002 | CA16 | A11 | M |
| A16 | `CLAUDE.md` principi 4 e 5 (commit dedicato) | CA16 | A15 | S |
| A17 | Gate esteso a `plugin/` e `config/`, nota sul pacchetto finale | (decisione accettazione 3, architettura N4) | - | S |
| A18 | Verifica finale: grep CA5/CA14, `npm test`, e2e-shot, prove manuali | CA1, CA3, CA5, CA11, CA14, CA15, CA17 | A1-A17 | M |

## Dettaglio

### A1 · Contratti e base dei test di contratto
- Cosa: file JSDoc (`@typedef`/`@interface`) per i tre contratti, con metodi, errori e configurazione (dettagli in fase 3). Funzioni di test riusabili (es. `test/contract/`) che verificano un'implementazione. Script `npm test` che esegue tutti i file di test.
- Dove: `src/main/contracts/connection.js`, `endpoint.js` (con `LLM_ERROR_CODES`), `secret-store.js` (con `readOnlyView`), ognuno con l'elenco dei membri obbligatori; `test/contract/`; `test/run.js` (esegue `smoke.js` e `test/*.test.js` in processi separati); `package.json` (`"test": "node test/run.js"`). Firme in `03-architettura.md`.
- Test: i test di contratto vengono esercitati da A2, A5, A6; qui un controllo che i file di contratto si carichino e che il runner trovi più file.
- Fatta quando: contratti documentati, `npm test` esegue smoke più i nuovi file ed è verde.

### A2 · `Secrets` come `ISecretStore`
- Cosa: `Secrets` rispetta il contratto (`get`, stringa vuota se assente, precedenza env) e aggiunge `names()`; `readOnlyView(store, allowed)` dà a plugin e client una vista in sola lettura limitata ai nomi autorizzati (errore `secret_denied` per gli altri). Nessun cambio al formato di `secrets.json`.
- Dove (stima): `src/main/secrets.js`, `test/secrets-contract.js`.
- Test: contratto `ISecretStore` su `Secrets` per `anthropic` e `asana`: valore salvato, assente, env prevale.
- Fatta quando: il test passa senza Electron (`safeStorage` finto) e `npm test` è verde.

### A3 · Factory dei plugin
- Cosa: `loadPlugin(tipo, nome, config, contratto)` con cartella base passabile, validazione `[a-z0-9-]`, percorso controllato, verifica dei membri obbligatori; `createConnection` e `createEndpoint`.
- Dove (stima): `src/main/plugins.js` (o simile), `test/fixtures/plugin/...`, `test/plugins.js`.
- Test: nomi non validi (`../x`, `Anthropic`, `a/b`, vuoto), plugin inesistente, membro mancante con nome plugin nell'errore, caricamento corretto da cartella di test.
- Fatta quando: tutti i casi d'errore danno messaggi chiari e `npm test` è verde.

### A4 · Compito `ping`
- Cosa: compito `ping` in `tasks.js` con schema `{ ok: boolean }`, `clean`, `maxTokens` basso, etichetta "Prova di collegamento". Prompt, schema e `clean` dei compiti esistenti invariati.
- Dove (stima): `src/main/llm/tasks.js`, `test/tasks.js`.
- Test: schema, `clean` su output valido e rotto, presenza di `maxTokens` basso.
- Fatta quando: il compito è definito e testato; `npm test` verde.

### A5 · Plugin connessione `https`
- Cosa: accesso diretto via HTTPS con timeout e retry di oggi, esposto come parametri (fetch, indirizzo base, timeout, retry) secondo `IConnection`.
- Dove (stima): `plugin/connection/https/`, `test/connection-contract.js`.
- Test: il test di contratto scorre ogni cartella di `plugin/connection/` con configurazione finta, senza rete.
- Fatta quando: il plugin passa il contratto e la factory lo carica.

### A6 · Plugin endpoint `anthropic`
- Cosa: sostituisce `AnthropicAdapter`: unico punto con `@anthropic-ai/sdk`, riceve dalla connessione i parametri di trasporto e la chiave da `ISecretStore`; tool use forzato; restituisce l'output grezzo; traduce gli errori in codici normalizzati (chiave mancante, non valida, permessi, modello non trovato, limite/crediti, non raggiungibile, output mancante). La vecchia classe resta finché A11, quindi nessuna rottura.
- Dove: `plugin/endpoint/anthropic/App.js`, `test/endpoints.test.js`, `test/anthropic-endpoint.test.js`, `test/fixtures/endpoint-responses/anthropic.js`. Niente SDK finto: il test usa l'SDK vero con il `fetch` finto della connessione, che risponde con le fixture. Il client si crea con `apiKey`, `authToken: null`, `baseURL` esplicito, `fetch`, `timeout`, `maxRetries`, `logLevel: 'warn'`; i nomi delle opzioni si verificano prima sulle definizioni di tipo dell'SDK 1.3.0 installato. `describe()` restituisce `EndpointInfo` (`label`, `service`, `keyLabel`).
- Test: contratto `IEndpoint` con connessione e store finti; richiesta identica a quella attuale (`model`, `max_tokens`, `system`, `messages`, `tools`, `tool_choice`); chiave presa dallo store; codici d'errore per 401, 403, 404, 429, 5xx, output mancante.
- Fatta quando: i test passano senza rete e l'SDK compare solo in questa cartella (oltre al vecchio adapter, che sparisce in A11).

### A7 · Configurazione e validazione
- Cosa: `config/llm.json` predefinito (connessione `diretta`/`https`, endpoint `anthropic`, `routes` per `extractTasks`, `summarizeDay`, `reviewGoals`, `ping` con `claude-sonnet-5-5`). Modulo che legge il file (mai lo scrive), lo valida, lo unisce a `settings.routes` campo per campo, ignora definizioni di connessioni/endpoint in `settings` e voci verso endpoint inesistenti (con avviso), legge `provider` come `endpoint` quando manca.
- Dove: `config/llm.json`, `src/main/llm/config.js` (`loadLlmConfig`, `resolveRoutes`), `test/llm-config.test.js`. `ping` senza voce prende la rotta risolta di `extractTasks` (deciso in `03-architettura.md` rev 2, nota N1); il `config/llm.json` predefinito non ha la voce `ping`. Connessioni ed endpoint si istanziano tutti all'avvio, così gli errori in `options` emergono subito.
- Test: JSON rotto, riferimenti inesistenti, plugin non valido, segreto sconosciuto, campo sconosciuto, compito sconosciuto; merge `a`/`b`; `routes` vecchio formato; `routes` su disco non riscritto.
- Fatta quando: i messaggi indicano file e voce e i test passano.

### A8 · `connect` e involucro
- Cosa: `connect(compito, ...)` risolve endpoint e modello dalla configurazione, crea connessione ed endpoint con le factory, restituisce l'oggetto dell'endpoint avvolto da un involucro che scrive una riga in `llm_runs` per ogni chiamata (riuscita o fallita) con gli stessi campi di oggi, `provider` = nome endpoint. Applicazione di prompt, schema, `clean` fuori dal plugin. Endpoint finto in `test/fixtures/plugin/endpoint/fake/`.
- Dove: `src/main/llm/connect.js` (`createConnector` restituisce `{ connect, routes, info }`; riceve `logRun`, non lo store), `test/connect.test.js`, `test/fixtures/plugin/{connection,endpoint}/fake/`, `test/fixtures/plugin/endpoint/broken/`.
- Test: compito assegnato all'endpoint finto, gli altri su Anthropic finto; riga in `llm_runs` per successo e fallimento con `provider` corretto, scritta dall'involucro; nessun file in `src/` toccato per collegare il fake; plugin senza accesso allo store.
- Fatta quando: i test passano e `Router` non è ancora toccato.

### A9 · `service.js` e `main.js` su `connect`
- Cosa: `service.js` chiama i compiti tramite `connect`, non importa nulla da moduli Anthropic né da `router.js`; i messaggi in italiano derivano dai codici normalizzati (testi identici a oggi). `main.js` costruisce configurazione, connessioni e `connect` al posto di `Router` e `AnthropicAdapter`. `smoke.js` riscritto sulla nuova via con la stessa copertura (tre compiti, `llm_original`, Asana finto).
- Dove: `src/main/service.js`, `src/main/main.js`, `src/main/llm/errors.js` (`describeLlmError` dai codici normalizzati e da `e.llm.info`), `test/smoke.js`, `test/errors.test.js`.
- Test: `smoke.js` e test degli errori (401, 403, 404, 429, 5xx, output mancante, servizio non raggiungibile con il testo invariato `Errore LLM: <message>`) con messaggi uguali a oggi; tre righe in `llm_runs` con `provider = 'anthropic'`.
- Fatta quando: l'analisi funziona come prima con SDK finto e `npm test` è verde.

### A10 · Prova del modello e `settings:model`
- Cosa: il canale `llm:test` esegue il compito `ping` tramite `connect` (riga `task = 'ping'`, `entry_id` vuoto, errore valorizzato nei casi d'errore), con i messaggi di oggi. `settings:model` scrive solo `{ model }` per ogni compito (`ping` compreso), senza `endpoint` né `provider` e senza forzare `anthropic` (precisa R9, vedi nota N2 dell'architettura); `init` legge il modello dalla configurazione risolta.
- Dove: `service.testLlm()`, `service.setModel()` (scrive solo `{ model }` per compito, deciso in `03-architettura.md` rev 2, nota N2), `service.llmInfo()`; `main.js` delega soltanto; `test/service-llm.test.js`.
- Test: ping con chiave valida, mancante, non valida: messaggi ("Funziona.", "API key Anthropic mancante: impostala nelle Impostazioni", "API key Anthropic non valida") e riga in `llm_runs`; dopo `setModel` ogni voce di `settings.routes` contiene solo `model`; con `settings` vecchio formato (modello `x`) e senza voce `ping`, la prova usa `x`.
- Fatta quando: test verdi; la logica testabile sta fuori da `main.js`.

### A11 · Rimozione `Router` e `AnthropicAdapter`
- Cosa: eliminare `src/main/llm/router.js` e `src/main/llm/anthropic.js`, spostando in modo definitivo ciò che serve (modello e rotte predefinite stanno nel file di configurazione).
- Dove (stima): `src/main/llm/`, riferimenti residui in `src/` e `test/`.
- Test: grep senza risultati per `Router` e `llm/router`, e per l'SDK fuori da `plugin/endpoint/anthropic/`.
- Fatta quando: i grep sono puliti e `npm test` è verde.

### A12 · Asana con `ISecretStore`
- Cosa: `new Asana({ secrets: readOnlyView(secrets, ['asana']), secretName: 'asana', fetch })` al posto di `getToken`; nuovo `hasToken()`, usato da `service.prjOptions`; `Service` non riceve più `secrets`. Si fa dopo A9 per non creare conflitti su `service.js` e `smoke.js`. La logica REST non cambia.
- Dove (stima): `src/main/asana.js`, `src/main/service.js`, `src/main/main.js`, `test/smoke.js` o `test/asana-secret.js`.
- Test: `ISecretStore` finto con fetch finto: invio attività e prova Asana; token letto solo dallo store; grep di `process.env`, `safeStorage`, `secrets.json` in `asana.js`.
- Fatta quando: i test esistenti di Asana passano invariati e quello nuovo è verde.

### A13 · Configurazione non valida
- Cosa: se il file manca o non è valido, all'avvio e a ogni analisi o prova l'utente riceve il messaggio chiaro (file e voce); diario, attività e Asana restano utilizzabili; avviso per voci di `settings` ignorate.
- Dove (stima): `src/main/main.js`, `src/main/service.js`, `test/llm-config.js`.
- Test: servizio con configurazione rotta: l'analisi risponde col messaggio, salvataggio del diario e invio Asana funzionano.
- Fatta quando: i test passano; verifica manuale rimandata ad A18.

### A14 · Nota sulla privacy
- Cosa: il canale `init` restituisce `llm: { label, endpoint, error, warnings }` (con configurazione predefinita `label` = "API Anthropic", da `EndpointInfo`); il renderer mostra l'etichetta nella nota, l'errore di configurazione all'avvio e gli avvisi nelle Impostazioni. Nessun canale nuovo, preload invariato.
- Dove (stima): `src/main/main.js`, `src/renderer/app.js`, eventualmente `src/preload.js`.
- Test: test della funzione che produce l'etichetta (endpoint di default, endpoint finto, configurazione rotta).
- Fatta quando: test verde; screenshot in A18.

### A15 · Documenti
- Cosa: `ARCHITECTURE.md` senza router "locale", con albero dei file aggiornato, sezione "Pipeline LLM e router" riscritta (connect, endpoint, connessioni, configurazione e precedenze), "Dove stanno i dati" e "Prossimi passi"; nota in coda all'ADR 0002 che rimanda all'ADR 0003 e a questa feature.
- Dove (stima): `ARCHITECTURE.md` (comprese le note su `plugin/**` e `config/**` nel pacchetto `electron-builder`), `docs/adr/0002-router-llm-per-compiti.md`, stato dell'ADR 0004 se accettato insieme all'architettura.
- Test: nessuno; rilettura e grep di "router locale" e `Router`.
- Fatta quando: nessuna frase presuppone un router locale o cita la classe `Router`.

### A16 · `CLAUDE.md`
- Cosa: principio 4 ("attraverso `connect` e un endpoint configurato") e principio 5 ("passa dal flusso comune di `connect`"), più ogni altro punto che cita il `Router`. Commit dedicato e riconoscibile.
- Dove (stima): `CLAUDE.md`.
- Test: nessuno; rilettura.
- Fatta quando: il commit tocca solo `CLAUDE.md`.

### A17 · Gate e pacchetto
- Cosa: estendere `.claude/hooks/gate.js` a `plugin/` e `config/`, con la stessa regola di `src/`, `test/` e `package*.json` (decisione di Antonio, architettura rev 2, nota N4); annotare che `plugin/` e `config/` vanno inclusi nel pacchetto finale. Può essere la prima attività della fase 4.
- Dove (stima): `.claude/hooks/gate.js`, `CLAUDE.md` (elenco delle cartelle protette, nel commit di A16 o in uno dedicato), `ARCHITECTURE.md` (sezione Distribuzione).
- Test: prova manuale dell'hook: una modifica a `plugin/` e a `config/` è bloccata quando la feature non è in fase 4 ed è permessa in fase 4.
- Fatta quando: il gate protegge le due cartelle e la regola è scritta.

### A18 · Verifica finale
- Cosa: `npm test`, `npx electron test/e2e-shot.js`, grep CA5 e CA14, prove manuali con chiave vera (analisi, prova, errori) e con `config/llm.json` rotto.
- Dove (stima): nessun file nuovo, salvo correzioni.
- Test: tutti i precedenti.
- Fatta quando: tutto passa e gli screenshot sono uguali a prima, salvo la nota sulla privacy.

## Copertura dei criteri
| CA | Attività |
|---|---|
| CA1 | A6, A8, A9, A18 |
| CA2 | A7, A10 |
| CA3 | A4, A10, A18 |
| CA4 | A6, A9 |
| CA5 | A6, A11, A18 |
| CA6 | A1, A5 |
| CA7 | A1, A6 |
| CA8 | A1, A2 |
| CA9 | A12 |
| CA10 | A3 |
| CA11 | A7, A9, A13, A18 |
| CA12 | A7 |
| CA13 | A8 |
| CA14 | A6, A8, A12, A18 |
| CA15 | A14, A18 |
| CA16 | A15, A16 |
| CA17 | A18 |

## Note per l'architettura
- Firme dei contratti: metodi di `IConnection` (come espone trasporto, indirizzo base, timeout, retry, autenticazione) e di `IEndpoint` (richiesta neutra rispetto ad Anthropic, restituzione dell'output grezzo, codici d'errore normalizzati); forma di `ISecretStore` e della vista in sola lettura.
- Nome del file d'ingresso dei plugin (`App.js` o `index.js`) e istanza nuova o riusata per la stessa configurazione (aperti nell'ADR 0003).
- Come l'SDK 1.3.0 accetta `fetch`, indirizzo base, timeout e retry iniettati, e se la richiesta resta identica a oggi.
- Dove vive `connect` e cosa restituisce l'involucro (firma, gestione di `entryId`, `clean` e `llm_runs` per chiamata fallita).
- Forma dei codici d'errore normalizzati e mappatura sui messaggi in italiano (dove stanno i testi).
- Posizione di `config/llm.json` rispetto all'app in sviluppo e pacchettizzata (asar), e moduli di caricamento della configurazione; quando si rilegge `settings.routes` (a ogni chiamata o all'avvio).
- Esecuzione di più file di test con `npm test` (script, runner o file indice) e organizzazione di `test/` e delle fixture.
- Prova (`ping`) con endpoint e modello di default uguali a `extractTasks`: voce propria in `routes` oppure derivata.
- Ordine di A9 e A12 se conviene unire le modifiche di `service.js` per evitare conflitti.
- Estensione del gate a `plugin/` e `config/` (A17). Risolto in `03-architettura.md` rev 2: si estende.

## Attività correttive (fase 5, ciclo 1)

- **F1** · `ping` come da architettura rev 2: `maxTokens: 256`, `toolName` e testo di `buildUser` come previsti in `03-architettura.md`; il test `test/tasks.test.js` deve accettare il valore accettato; correggere la riga CA3 della sezione Test di `05-verifica.md`. Bloccante della revisione.
- **F2** · Osservazioni non bloccanti della revisione da sistemare ora: prefisso "Configurazione LLM non valida" ripetuto (renderer), `instanceof` al posto di `constructor.name` per gli errori di rete (plugin anthropic), `secrets:set` con `secrets.names()`, controllo "chiave dallo store" nel test di contratto generico `IEndpoint`, albero dei file di `ARCHITECTURE.md`, nota "Nessuna correzione necessaria" in `04-implementazione.md`. Le altre (nota privacy solo per extractTasks, opzioni sconosciute della connessione `https`, D3 incompleta, testo `no_key` in `llm_runs.error`) restano annotate nella PR.
