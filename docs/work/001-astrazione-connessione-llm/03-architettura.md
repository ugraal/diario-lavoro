# Architettura: Astrazione della connessione ai servizi LLM (001-astrazione-connessione-llm)
Revisione: 2 · Data: 2026-10-29

Riferimenti: `01-analisi.md` rev 3 (accettata), `02-piano.md`, ADR 0002, ADR 0003, ADR 0004 (proposto con questo documento).

## Sintesi
Le chiamate LLM passano da `connect(compito)` (`src/main/llm/connect.js`). La funzione risolve endpoint e modello unendo `config/llm.json`, il file aziendale in sola lettura, con `settings.routes`, e restituisce un "client di compito". Questo client costruisce la richiesta da `tasks.js`, chiama il plugin endpoint, applica `clean` e scrive sempre una riga in `llm_runs`. Connessioni ed endpoint sono plugin in `plugin/connection/<nome>/App.js` e `plugin/endpoint/<nome>/App.js`, caricati da un'unica factory (`src/main/plugins.js`) che valida il nome, controlla il percorso e verifica il contratto a runtime. Il plugin `anthropic` è l'unico punto in cui si importa `@anthropic-ai/sdk`: passa all'SDK `fetch`, indirizzo base, timeout e retry della connessione e traduce gli errori in codici normalizzati. I testi in italiano li produce il nucleo (`src/main/llm/errors.js`). I segreti, compreso il token Asana, arrivano a plugin e client solo tramite una vista in sola lettura di `ISecretStore`, limitata ai nomi autorizzati. `Router` e `AnthropicAdapter` si eliminano. Lo schema del database e i canali IPC non cambiano.

## Modifiche per modulo

**Nuovi file**

| File | Contenuto | Perché |
|---|---|---|
| `src/main/contracts/connection.js` | JSDoc `IConnection` più `CONNECTION_MEMBERS` (nome e tipo dei membri obbligatori) | contratto (R1); i membri si usano nella verifica a runtime e nei test |
| `src/main/contracts/endpoint.js` | JSDoc `IEndpoint`, `StructuredRequest`, `StructuredResult`, `EndpointInfo`, più `ENDPOINT_MEMBERS` e `LLM_ERROR_CODES` (elenco congelato) | contratto (R1, R12) |
| `src/main/contracts/secret-store.js` | JSDoc `ISecretStore` e `ISecretReader`, `SECRET_STORE_MEMBERS` e la funzione `readOnlyView(store, allowed)` | contratto (R10) e vista in sola lettura con il minimo dei permessi |
| `src/main/plugins.js` | `loadPlugin(kind, name, options, deps, { baseDir, members })`, `createConnection(...)`, `createEndpoint(...)` | factory unica (ADR 0003, R2) |
| `src/main/llm/config.js` | `loadLlmConfig(file, { taskNames, secretNames })` e `resolveRoutes(fileCfg, settingsRoutes, taskNames)` | lettura, validazione, merge e compatibilità con il vecchio formato (R7, R8, R9) |
| `src/main/llm/connect.js` | `createConnector({ configFile, pluginDir, secrets, logRun, getSettingsRoutes })` restituisce `{ connect, info, routes }` | `connect` e involucro che scrive `llm_runs` (R3, R14) |
| `src/main/llm/errors.js` | `describeLlmError(e)`: dal codice normalizzato al testo in italiano di oggi | `service.js` non importa più nulla da Anthropic (R12, CA4) |
| `plugin/connection/https/App.js` | connessione diretta: `globalThis.fetch`, timeout 600000 ms, 2 retry | R5 |
| `plugin/endpoint/anthropic/App.js` | sostituisce `AnthropicAdapter` | R6 |
| `config/llm.json` | configurazione aziendale predefinita | R7, R8 |
| `test/run.js` | esegue `smoke.js` e tutti i `test/*.test.js`, ciascuno in un processo separato | più file con `npm test` (A1) |
| `test/contract/*.js` | funzioni riusabili `checkConnection`, `checkEndpoint`, `checkSecretStore` | test di contratto (R15) |
| `test/fixtures/plugin/endpoint/fake/App.js`, `test/fixtures/plugin/connection/fake/App.js`, `test/fixtures/plugin/endpoint/broken/App.js` | plugin di prova: finto, finto, senza `runStructured` | CA10, CA13 |
| `test/fixtures/endpoint-responses/anthropic.js` | risposte HTTP finte nel formato Messages API (successo, 401, 403, 404, 429, 500, 529, senza `tool_use`) | contratto `IEndpoint` senza rete |

**File modificati**

- **`src/main/llm/tasks.js`**: si aggiunge il compito `ping` (vedi Interfacce). Si aggiunge il campo facoltativo `maxTokens` per compito. I tre compiti esistenti non lo hanno e quindi restano a 4096, il valore fisso di oggi nel `Router`. Prompt, schemi e `clean` esistenti non cambiano.
- **`src/main/secrets.js`**: `Secrets` implementa `ISecretStore`. Si aggiunge `names()`, che restituisce `['anthropic', 'asana']` cioè le chiavi di `ENV`. `get`, `set` e `status` restano come sono, così come il formato di `secrets.json` e la precedenza delle variabili d'ambiente.
- **`src/main/asana.js`**: il costruttore diventa `new Asana({ secrets, secretName = 'asana', fetch })`. `secrets` è un `ISecretReader` e il token si legge a ogni richiesta con `secrets.get(secretName)`. Si aggiunge `hasToken()`. La logica REST non cambia.
- **`src/main/service.js`**:
  - riceve `llm` (il connector) al posto di `router` e `secrets`;
  - chiama `this.llm.connect('extractTasks').run(input, { entryId })`;
  - `prjOptions` usa `this.asana.hasToken()`;
  - importa `describeLlmError` da `./llm/errors`;
  - nuovi metodi `testLlm()` (compito `ping`), `setModel(model)` e `llmInfo()`, che tolgono logica da `main.js`;
  - `routes()` delega a `llm.routes()`;
  - non importa più `./llm/anthropic` né `./llm/router`.
- **`src/main/main.js`**: fa solo il collegamento tra i moduli. Calcola `appRoot = path.resolve(__dirname, '..', '..')`, crea `Secrets`, `Asana` (con `readOnlyView(secrets, ['asana'])`), il connector (`configFile = appRoot/config/llm.json`, `pluginDir = appRoot/plugin`, `logRun = (r) => store.logRun(r)`) e `Service`. I canali `llm:test`, `settings:model` e `init` delegano a `service`. `secrets:set` valida il nome con `secrets.names()`.
- **`src/renderer/app.js`**:
  - la nota sulla privacy usa `S.init.llm.label`;
  - se `S.init.llm.error` è valorizzato, compare un avviso all'avvio e nelle Impostazioni;
  - gli avvisi su `settings` (`S.init.llm.warnings`) compaiono nelle Impostazioni.
- **`src/preload.js`**: nessuna modifica, perché i canali sono gli stessi.
- **`test/smoke.js`**: si riscrive su `createConnector` con l'endpoint finto preso dalle fixture al posto dell'adapter finto. La copertura resta la stessa.
- **`package.json`**: solo lo script `"test": "node test/run.js"`. Nessuna dipendenza nuova.
- **Si eliminano** (A11): `src/main/llm/router.js` e `src/main/llm/anthropic.js`.
- **Documenti** (A15, A16): `ARCHITECTURE.md`, nota in coda all'ADR 0002, principi 4 e 5 di `CLAUDE.md`, nuovo ADR 0004.

## Dati

- **Schema SQLite: nessuna modifica.** Nessuna migrazione.
- **`llm_runs`**: stessi campi. `provider` contiene il nome dell'endpoint (`anthropic` con la configurazione predefinita, quindi i dati esistenti restano confrontabili). `output` resta `{ raw, usage }`, dove `raw` è l'oggetto strutturato restituito dal servizio, come oggi. Le righe del compito `ping` hanno `task = 'ping'` ed `entry_id = NULL`. Piccolo miglioramento: se `clean` fallisce, la riga d'errore conserva comunque `output.raw`. Oggi invece l'output va perso.
- **`tasks.llm_original`**: invariato, lo scrive ancora `service.js` tramite `store.applyAnalysis`.
- **`settings.routes`**: lettura compatibile, senza riscrittura su disco (CA2).
  - Per ogni compito si leggono solo i campi `endpoint`, `model` e `provider`. `provider` vale come `endpoint` quando manca `endpoint`.
  - Qualunque altro campo si ignora con un avviso.
  - Le chiavi di `settings` diverse da `routes` (per esempio `endpoints` o `connections`) non si leggono mai.
  - `settings.routes` si rilegge a ogni `connect` (`getSetting` è in memoria e costa poco), così una modifica del modello vale subito.
  - `settings:model` scrive `{ <compito>: { model } }` per tutti i compiti, `ping` compreso. Si scrive solo il modello e l'endpoint resta quello del file (decisione di Antonio, rev 2; vedi "Note sull'analisi accettata", N2).
- **Nuova configurazione `config/llm.json`** (nella cartella dell'app, l'app non la scrive mai, si legge una volta all'avvio):

```json
{
  "version": 1,
  "connections": {
    "diretta": { "plugin": "https", "options": { "timeoutMs": 600000, "maxRetries": 2 } }
  },
  "endpoints": {
    "anthropic": { "plugin": "anthropic", "connection": "diretta", "secret": "anthropic", "options": {} }
  },
  "routes": {
    "extractTasks": { "endpoint": "anthropic", "model": "claude-sonnet-5-5" },
    "summarizeDay": { "endpoint": "anthropic", "model": "claude-sonnet-5-5" },
    "reviewGoals":  { "endpoint": "anthropic", "model": "claude-sonnet-5-5" }
  }
}
```

**Regole di validazione** (`loadLlmConfig`), ognuna con un messaggio che indica il file e la voce:

1. Il file esiste e il JSON è valido. Messaggio: `Configurazione LLM non valida (config/llm.json): JSON non leggibile alla riga N`.
2. In cima ci sono solo `version` (uguale a 1), `connections`, `endpoints` e `routes`.
3. I nomi di connessioni ed endpoint e i valori di `plugin` rispettano `^[a-z0-9-]{1,64}$`.
4. Ogni connessione ha solo i campi `plugin` e `options` (oggetto facoltativo).
5. Ogni endpoint ha solo `plugin`, `connection` (che deve esistere), `secret` (facoltativo, tra i nomi di `secrets.names()`) e `options`.
6. `routes` contiene solo compiti di `tasks.js`. Ognuno ha solo `endpoint` (che deve esistere) e `model` (stringa non vuota).
7. Tutti i compiti tranne `ping` devono avere una voce.
8. Il contenuto di `options` lo valida il plugin quando viene creato. Il connector crea tutte le connessioni e tutti gli endpoint all'avvio, senza rete, così gli errori emergono subito anche per questi campi.

Esempio di messaggio: `Configurazione LLM non valida (config/llm.json): routes.summarizeDay.endpoint: l'endpoint "router" non è definito in "endpoints"`.

**Merge** (`resolveRoutes`):
- Per ogni compito parte dalla voce del file e sovrascrive campo per campo con `settings.routes[compito]` (`endpoint` o, se manca, `provider`; poi `model`).
- Se l'endpoint indicato in `settings` non esiste nel file, si ignora la voce di `settings` per quel campo e si aggiunge un avviso, per esempio `Impostazioni: il compito extractTasks indica l'endpoint "ollama", che non esiste. Uso "anthropic"`.
- Il compito `ping`, se non ha una voce propria né nel file né in `settings`, prende la rotta già risolta di `extractTasks`. Così un database con il modello `x` salvato dalla versione attuale prova proprio `x`, come oggi (decisione di Antonio, rev 2; vedi N1).

## Interfacce

**Canali IPC**: nessun canale nuovo, `src/preload.js` invariato.

| Canale | Cambia | Input | Output | Errori |
|---|---|---|---|---|
| `init` | aggiunge `llm` | - | come oggi più `llm: { label: string, endpoint: string, error: string\|null, warnings: string[] }`; `model` = modello risolto di `extractTasks` (stringa vuota se la configurazione non è valida) | nessuno: un errore di configurazione va in `llm.error` |
| `llm:test` | passa da `service.testLlm()` | - | `true` | testi di oggi tramite `describeLlmError`, più l'errore di configurazione |
| `settings:model` | passa da `service.setModel(model)` | `model: string` | il modello salvato | `Indica un modello` |
| `secrets:set` | il nome si valida con `secrets.names()` | come oggi | come oggi | come oggi |

**Nuovo compito LLM `ping`** (in `tasks.js`):
- nome `ping`, etichetta `Prova di collegamento`, `toolName: 'conferma_collegamento'`, `description: 'Conferma che il collegamento funziona.'`;
- input `{}`; `buildUser: () => 'Prova di collegamento: chiama lo strumento con ok = true.'`; `system`: una riga sola, senza `BASE`;
- schema `{ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }`;
- `clean: (out) => ({ ok: out.ok === true })`;
- `maxTokens: 256`: è un margine, perché una chiamata `tool_use` tagliata da `max_tokens` darebbe `no_output`;
- endpoint e modello predefiniti: la rotta risolta di `extractTasks`, se `ping` non ha una voce propria nel file o in `settings` (decisione rev 2, N1).

**Chiamate Asana**: nessuna nuova. Cambia solo da dove arriva il token.

## Astrazioni

Tutti i contratti stanno in `src/main/contracts/`, in JSDoc. Ogni file esporta anche l'elenco dei membri obbligatori, che la factory verifica a runtime.

### Plugin: forma comune (risolve i punti aperti dell'ADR 0003)
- File d'ingresso: `App.js`, come deciso nell'ADR 0003. La factory risolve sempre il percorso completo del file e non usa mai `require` sulla cartella, quindi la convenzione `index.js` non porta vantaggi.
- `module.exports = function create(options, deps) { return {...} }`. `options` è il campo `options` della configurazione, `deps` contiene le dipendenze iniettate dal nucleo.
- Istanze: la factory crea una nuova istanza a ogni chiamata. Il connector crea un'istanza per ogni connessione e per ogni endpoint definiti, all'avvio, e le riusa per tutta la vita del processo. È sicuro perché il file non cambia mentre l'app è aperta e i segreti si leggono a ogni chiamata.

### `IConnection`: come ci si arriva
```js
/**
 * @interface IConnection
 * @property {string} kind  Nome del plugin (es. 'https').
 * @property {(url: string, init?: RequestInit) => Promise<Response>} fetch
 *   Trasporto con la firma WHATWG fetch. Non fa retry e non applica timeout: retry e timeout
 *   li applica il client che lo usa, con i valori qui sotto. Gli errori di rete si rifiutano
 *   come fa fetch (TypeError o AbortError).
 * @property {(defaultURL: string) => string} baseURL
 *   Indirizzo base da usare per un servizio il cui indirizzo predefinito è defaultURL.
 *   Una connessione diretta restituisce defaultURL; un gateway o un proxy intranet il proprio.
 * @property {number} timeoutMs  Timeout per tentativo, in millisecondi, > 0.
 * @property {number} maxRetries Numero di nuovi tentativi, intero >= 0.
 * @property {() => { kind: string, detail: string }} describe  Descrizione per log e Impostazioni, mai segreti.
 */
/** Firma del plugin: create(options: object, deps: { secrets: ISecretReader }) => IConnection.
 *  Se options non è valido lancia un Error con code = 'plugin_options' e un messaggio in italiano. */
```
- **Oggi**: `https`. `fetch` chiama `globalThis.fetch` al momento della chiamata, cioè lo stesso `fetch` (undici) che l'SDK usa oggi. `baseURL(d)` restituisce `d`. Le opzioni sono `timeoutMs` (predefinito 600000) e `maxRetries` (predefinito 2), gli stessi valori predefiniti dell'SDK. Non serve nessun segreto, ma `deps.secrets` arriva comunque, vuoto (vista su `[]`).
- **Domani**: per un proxy o una intranet con autenticazione si aggiunge `plugin/connection/<nome>/App.js`, per esempio un `fetch` con header di autenticazione letti da `deps.secrets` o con un `dispatcher`, e una voce in `connections`.
- **Test di contratto** (`test/contract/connection.js`, eseguito su ogni cartella di `plugin/connection/` e sulla fixture `fake`) verifica:
  - membri e tipi;
  - `timeoutMs > 0` e `maxRetries` intero >= 0;
  - `baseURL('https://x.test')` restituisce una stringa `https://`;
  - `describe()` senza il valore del segreto finto;
  - opzioni non valide (`timeoutMs: -1`) producono `plugin_options`.

  Il tutto senza rete. Un test specifico di `https` sostituisce per un momento `globalThis.fetch` e verifica che la chiamata gli venga delegata.

### `IEndpoint`: con quale servizio si parla
```js
/**
 * @typedef {Object} StructuredRequest   Neutra rispetto al fornitore.
 * @property {string} model
 * @property {string} system
 * @property {string} user
 * @property {object} schema       JSON Schema dell'output.
 * @property {string} toolName     Nome dell'output strutturato (identificatore [a-z_]).
 * @property {string} description
 * @property {number} maxTokens
 *
 * @typedef {Object} StructuredResult
 * @property {object} output       L'oggetto strutturato COSÌ COME restituito dal servizio:
 *                                 non ripulito, non riassunto (finisce in llm_runs.output.raw).
 * @property {object|null} usage   Consumo riportato dal servizio, se c'è.
 *
 * @typedef {Object} EndpointInfo
 * @property {string} label        Per la nota sulla privacy, es. 'API Anthropic'.
 * @property {string} service      Nome breve del servizio, es. 'Anthropic'.
 * @property {string} keyLabel     Nome del segreto per l'utente, es. 'API key Anthropic'.
 *
 * @interface IEndpoint
 * @property {(req: StructuredRequest) => Promise<StructuredResult>} runStructured
 * @property {() => EndpointInfo} describe
 */
/** Firma del plugin: create(options, deps: { connection: IConnection, secrets: ISecretReader,
 *  secretName: string|null }) => IEndpoint. Il segreto si legge a ogni chiamata. */
```
**Errori normalizzati.** `runStructured` rifiuta solo con un `Error` che ha:
- `code` preso da `LLM_ERROR_CODES`;
- `status` (numero HTTP, se esiste);
- `message`: il testo tecnico originale. Finisce in `llm_runs.error` come oggi e non deve mai contenere segreti.

| `code` | Quando | Testo all'utente (`describeLlmError`), uguale a oggi |
|---|---|---|
| `no_key` | segreto vuoto, controllato prima di qualunque chiamata di rete | `<keyLabel> mancante: impostala nelle Impostazioni` |
| `bad_key` | 401 | `<keyLabel> non valida` |
| `forbidden` | 403 | `API key senza permessi per questo modello` |
| `model_not_found` | 404 | `Modello non trovato: controlla il nome nelle Impostazioni` |
| `rate_limit` | 429 | `Troppe richieste o crediti esauriti, riprova tra poco` |
| `unavailable` | 5xx, 529 | `<service> non risponde, riprova tra poco` |
| `unreachable` | errore di rete o timeout, senza status | `Errore LLM: <message>` (come oggi, decisione rev 2) |
| `no_output` | manca l'output strutturato | `Il modello non ha restituito un output strutturato` |
| `bad_request` | altri 4xx | `Errore LLM: <message>` |
| `unknown` | tutto il resto | `Errore LLM: <message>` |
| `config` (solo nucleo) | `config/llm.json` assente o non valido | il messaggio di validazione |

Con `keyLabel = 'API key Anthropic'` e `service = 'Anthropic'` i testi sono identici a quelli di oggi (CA3, CA4). Per costruirli il messaggio ha bisogno di `EndpointInfo`: l'involucro la aggiunge all'errore (`e.llm = { task, endpoint, model, info }`) prima di rilanciarlo, e `describeLlmError(e)` la legge da lì. Se un plugin lancia un errore senza `code` valido, l'involucro lo tratta come `unknown`.

**Il plugin `anthropic` e l'SDK.** Il client si crea, e si ricrea quando cambia la chiave, così:
```js
new Anthropic({
  apiKey: key,                                   // da deps.secrets.get(deps.secretName); se vuota -> no_key
  authToken: null,                               // l'SDK non legge ANTHROPIC_AUTH_TOKEN dall'ambiente
  baseURL: connection.baseURL('https://api.anthropic.com'), // sempre esplicito: l'SDK non legge ANTHROPIC_BASE_URL
  fetch: connection.fetch,
  timeout: connection.timeoutMs,                 // 600000 = valore attuale (con max_tokens 4096 il calcolo dinamico dell'SDK dà comunque 10 minuti)
  maxRetries: connection.maxRetries,             // 2 = valore attuale (stessi codici ritentati: connessione, 408, 409, 429, >=500)
  logLevel: 'warn',                              // valore predefinito, ma esplicito: ANTHROPIC_LOG=debug non stampa più il diario in console
});
```
- La richiesta `messages.create({ model, max_tokens, system, messages: [{ role: 'user', content: user }], tools: [{ name: toolName, description, input_schema: schema }], tool_choice: { type: 'tool', name: toolName } })` è identica a quella di oggi.
- L'output è il blocco `tool_use` con `name === toolName`: si restituisce `{ output: block.input, usage: res.usage || null }`.
- Gli errori si mappano su `e.status`. Gli errori `APIConnectionError` e `APIConnectionTimeoutError` (senza status) diventano `unreachable`.
- Le opzioni `options` dell'endpoint sono oggi vuote: ogni campo non previsto produce `plugin_options`.
- In A6 i nomi delle opzioni (`authToken`, `baseURL`, `fetch`, `timeout`, `maxRetries`, `logLevel`) vanno controllati sulle definizioni di tipo dell'SDK 1.3.0 in `node_modules`.

**Test di contratto** (`test/contract/endpoint.js`, eseguito su ogni cartella di `plugin/endpoint/`). Il test usa una `IConnection` finta, il cui `fetch` registra le richieste e risponde con le fixture di `test/fixtures/endpoint-responses/<nome>.js`, e un `ISecretReader` finto con la chiave `sk-SEGRETO-TEST`. Se manca la fixture per un plugin presente, il test fallisce: chi aggiunge un endpoint deve aggiungere anche le risposte finte. Il test verifica:
- membri e tipi, e `describe()` completo;
- il successo, che restituisce `output` uguale a quello della fixture e `usage`;
- `no_key` con segreto vuoto e nessuna chiamata a `fetch`;
- i codici per 401, 403, 404, 429, 500, 529 e per la risposta senza output;
- `unreachable` quando `fetch` rifiuta;
- che il trasporto passi solo da `connection.fetch`: `globalThis.fetch` viene sostituito con una funzione che fallisce il test;
- che la chiave della richiesta sia quella fornita dallo store (header `x-api-key` per Anthropic, controllato nella fixture);
- che il segreto non compaia in nessun `message` né in `describe()`.

Tutto con `maxRetries: 0` nella connessione finta, per non aspettare i tempi di attesa tra i tentativi. Un test specifico di `anthropic` confronta il corpo JSON inviato con quello che oggi produce `AnthropicAdapter` (CA1) e controlla che con `maxRetries: 2` un 500 venga ritentato due volte.

**Domani**: per il router dei modelli si scrive `plugin/endpoint/router/App.js`, che usa `connection.fetch` e il suo protocollo, si aggiunge la fixture delle risposte e si aggiungono le voci in `endpoints` e `routes`. Nessun file in `src/` cambia (CA13).

### `ISecretStore` e `ISecretReader`
```js
/**
 * @interface ISecretStore   Archivio dei segreti, usato solo dal nucleo (Impostazioni).
 * @property {(name: string) => string} get     Valore, oppure '' se assente o non decifrabile. Non lancia.
 * @property {(name: string, value: string) => void} set  Valore vuoto = cancella. Lancia se la scrittura fallisce.
 * @property {() => object} status              { encryption, <nome>: { set, fromEnv, hint } }, mai il valore.
 * @property {() => string[]} names             Nomi dei segreti noti (oggi 'anthropic', 'asana').
 *
 * @interface ISecretReader  Vista in sola lettura data a plugin e client.
 * @property {(name: string) => string} get     Come ISecretStore.get, ma lancia un Error
 *                                              (code 'secret_denied') per un nome non autorizzato.
 */
// readOnlyView(store: ISecretStore, allowed: string[]) => ISecretReader  (congelato, senza set/status)
```
- **Oggi**: `Secrets` (`secrets.json` cifrato con `safeStorage`, variabili d'ambiente con precedenza). Ogni endpoint riceve `readOnlyView(secrets, [secret])`, `Asana` riceve `readOnlyView(secrets, ['asana'])` e le connessioni `readOnlyView(secrets, [])`.
- **Domani**: la feature sulla crittografia aggiunge un'altra classe che rispetta il contratto e la sceglie in `main.js`.
- **Scelta da configurazione: non oggi** (deroga D1).
- **Test di contratto** (`test/contract/secret-store.js`): su `Secrets`, con `safeStorage` finto e una cartella temporanea, verifica per `anthropic` e `asana`:
  - `get` restituisce il valore salvato, `''` se assente;
  - la variabile d'ambiente ha la precedenza;
  - `set('')` cancella;
  - `status()` non contiene il valore;
  - `names()` contiene i due nomi.

  In più `readOnlyView` rifiuta i nomi non autorizzati e non espone `set`.

### Factory `loadPlugin`
`loadPlugin(kind, name, options, deps, { baseDir, members })`, dove `kind` è `'connection'` o `'endpoint'`:
1. Controlla `kind` su un elenco chiuso e `name` con `^[a-z0-9-]{1,64}$`. Errore: `Nome di plugin non valido: "../x" (ammessi solo a-z, 0-9 e -)`.
2. Calcola `dir = path.resolve(baseDir, kind)` e `file = path.resolve(dir, name, 'App.js')`, poi controlla che `path.relative(dir, file)` non inizi con `..` e non sia assoluto.
3. Se `fs.existsSync(file)` è falso: `Plugin di connessione "x" non trovato in plugin/connection/`.
4. Esegue `require(file)` e controlla che esporti una funzione: `Il plugin endpoint "x" non esporta una funzione`.
5. Chiama `create(options || {}, deps)`.
6. Controlla membri e tipi sull'oggetto restituito: `Il plugin endpoint "broken" non rispetta IEndpoint: manca "runStructured" (funzione)`.

`baseDir` è obbligatorio: in produzione è `appRoot/plugin`, nei test `test/fixtures/plugin`. Non si accetta nessun percorso che venga da `settings` o da `userData`. `createConnection(name, options, deps, baseDir)` e `createEndpoint(...)` sono due chiamate brevi a `loadPlugin` con i rispettivi elenchi di membri.

### `connect` e involucro
```js
/**
 * createConnector({ configFile, pluginDir, secrets: ISecretStore, logRun: (row) => void,
 *                   getSettingsRoutes: () => object, tasks = TASKS }) => Connector
 * Connector.connect(task: string) => TaskClient    lancia code 'config' se la configurazione non è valida
 * Connector.routes() => { [task]: { endpoint, model } }   rotte risolte (file + settings)
 * Connector.info() => { label, endpoint, error, warnings }   per init e per la nota sulla privacy
 *
 * TaskClient = { task, endpoint, model, info: EndpointInfo,
 *                run(input: object, ctx?: { entryId?: string }) => Promise<cleaned> }
 */
```
`run` costruisce `req` da `tasks[task]` (`maxTokens = def.maxTokens || 4096`), misura il tempo e chiama `endpoint.runStructured(req)`. Poi:
- in caso di successo, applica `def.clean(output || {}, input)` e chiama `logRun({ task, provider: endpoint, model, entryId, input: { system, user }, output: { raw: output, usage }, ms })`;
- in caso di errore (del plugin o di `clean`), chiama `logRun` con `error: e.message`, e con `output: { raw, usage }` se l'output era già arrivato, altrimenti `null`. Poi aggiunge `e.llm` e rilancia.

La riga si scrive in ogni caso, per qualunque plugin. Il plugin non vede mai `logRun` né lo store. Il connector riceve `logRun` e non lo store intero, così nemmeno lui può fare altro.

## Alternative considerate

| Scelta | Alternativa | Perché scartata |
|---|---|---|
| Retry e timeout applicati dall'SDK con i valori della connessione | Retry e timeout dentro `connection.fetch`, con `maxRetries: 0` nell'SDK | Cambierebbe il comportamento di oggi (backoff, codici ritentati, header `retry-after`) e duplicherebbe logica che l'SDK già gestisce bene. Un endpoint futuro senza SDK potrà usare un piccolo aiuto comune per i retry quando servirà. |
| Trasporto `globalThis.fetch` | `net.fetch` di Electron (usa il proxy di sistema) | Porterebbe Electron dentro un plugin e romperebbe `npm test` senza Electron. È fuori perimetro: diventerà un plugin `electron-net` se un collega ne avrà bisogno. |
| Test dell'endpoint con `fetch` finto passato dalla connessione | Sostituire l'SDK nella cache di `require` | Con il `fetch` finto il test esercita la vera serializzazione dell'SDK (CA1) e dimostra che il trasporto passa davvero dalla connessione. Sostituire l'SDK non proverebbe nessuna delle due cose. |
| Errori come `Error` con `code` | Classe `LlmError` in `src/main/contracts/` importata dai plugin | I plugin dovrebbero importare da `src/` con percorsi relativi fragili (`../../../src/...`). Una stringa di codice basta e il test di contratto la verifica. |
| Testi in italiano nel nucleo, con `EndpointInfo` dal plugin | Testi tradotti dal plugin | Ogni plugin dovrebbe ripetere gli stessi testi. In questo modo i testi stanno in un solo posto e restano identici. |
| Modello passato a ogni richiesta | Modello fissato quando si crea l'endpoint | Un endpoint serve più modelli (un modello per compito). Il client di compito ha comunque il modello già risolto (R3). |
| Validazione scritta a mano | Libreria JSON Schema (`ajv`) | Sarebbe una dipendenza nuova (N6) per una struttura di quattro chiavi: bastano circa 80 righe. |
| `test/run.js` | `node --test` | Su Windows, con `npm` lanciato da `cmd`, i glob non si espandono e serve una versione recente di Node. `run.js` sono 15 righe e funziona con `smoke.js` com'è. |
| `App.js` | `index.js` | La factory usa sempre il percorso completo, quindi `index.js` non porta vantaggi. `App.js` è già deciso nell'ADR 0003. |
| Vista dei segreti limitata ai nomi autorizzati | Passare `ISecretStore` intero (solo `get`) | Con l'archivio intero un endpoint potrebbe leggere il token Asana. La vista applica il minimo dei permessi con poche righe. |
| `ping` ricavato da `extractTasks` | Voce propria di `ping` in `config/llm.json` | Con un database che ha il modello `x` salvato dalla versione attuale, la prova userebbe il modello del file invece di `x`, diversamente da oggi. |
| `settings:model` scrive solo `{ model }` | Scrivere `{ endpoint, model }` | L'endpoint resterebbe fissato nelle impostazioni personali e un cambio di endpoint nel file aziendale non arriverebbe a chi ha personalizzato il modello. |
| Testo invariato per `unreachable` | Testo nuovo "`<service>` non raggiungibile: controlla la connessione" | Cambierebbe un messaggio di oggi, contro "messaggi uguali a oggi". |
| Configurazione letta una volta all'avvio | Rilettura a ogni chiamata | Il file non cambia mentre l'app è aperta (sta nella cartella dell'app). Rileggerlo aggiungerebbe I/O e stati intermedi senza nessun vantaggio. |

## Conformità ai principi

1. **Local-first**: conforme. Nessun nuovo dato esce dalla macchina. `llm_runs` resta locale. Il testo del diario va solo all'endpoint configurato nel file aziendale, che l'utente non può modificare dall'app. La nota sulla privacy mostra l'endpoint effettivo.
2. **L'LLM propone, la persona conferma**: non toccato.
3. **Il testo del diario non va su Asana**: non toccato. Il test esistente in `smoke.js` resta.
4. **Indipendenza dal provider**: conforme e rafforzato. L'SDK si importa solo in `plugin/endpoint/anthropic/`. Il testo del principio cambia ("attraverso `connect` e un endpoint configurato"), come accettato nell'analisi, con un commit dedicato (A16).
5. **Dataset**: conforme. `llm_runs` lo scrive l'involucro per ogni chiamata, compresi i fallimenti e la prova, con `provider = 'anthropic'` come oggi. `llm_original` è invariato. Il testo del principio cambia ("passa dal flusso comune di `connect`").
6. **Sicurezza Electron**: conforme. Nessun canale nuovo, preload invariato. I segreti si leggono solo tramite `ISecretStore`/`ISecretReader`, implementati da `secrets.js`. Plugin e configurazione si caricano solo da `appRoot`, mai da `userData`.
7. **Astrazione delle dipendenze critiche**: conforme per provider LLM, trasporto, endpoint e segreti, con eccezioni dichiarate qui sotto.

> **DEROGHE (in evidenza)**
>
> - **D1. `ISecretStore` non si sceglie da configurazione.** C'è una sola implementazione e `main.js` la istanzia direttamente. La scelta da configurazione arriverà con la feature sulla crittografia, quando ci sarà una seconda implementazione. Contratto e test di contratto ci sono già.
> - **D2. Client Asana REST e storage SQLite restano senza interfaccia.** Questa deroga esiste già ed è fuori perimetro per decisione dell'analisi. Per Asana cambia solo la provenienza del token.
> - **D3. L'SDK Anthropic legge da solo alcune variabili d'ambiente** (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_LOG`). Il nostro codice non legge `process.env` (CA14), e le opzioni esplicite `baseURL`, `authToken: null` e `logLevel` le neutralizzano. Resta un rischio se una versione futura dell'SDK ne aggiunge altre: il test di contratto lo intercetta in parte, perché verifica che il trasporto passi da `connection.fetch`.
> - **D4. `plugin/` e `config/` sono fuori dal gate** (`.claude/hooks/gate.js`) fino ad A17. Antonio ha deciso di estendere il gate a queste due cartelle (rev 2): la deroga è temporanea e si chiude con A17.
> - **D5. Cambia il comportamento della prova del modello.** La richiesta diventa strutturata e lascia una riga in `llm_runs`. È già accettato nell'analisi (CA3) e lo si ricorda qui.

## Dipendenze
Nessuna. Si usano `@anthropic-ai/sdk` 1.3.0, già presente e ora importato solo in `plugin/endpoint/anthropic/`, `globalThis.fetch` e i moduli `fs` e `path` di Node.

## Strategia di test

`npm test` esegue `node test/run.js`, che lancia `test/smoke.js` e ogni `test/*.test.js` in un processo separato e fallisce se uno fallisce. Niente rete e niente Electron (N7).

| File | Copre |
|---|---|
| `test/secrets.test.js` | contratto `ISecretStore` su `Secrets`, `readOnlyView` (CA8) |
| `test/plugins.test.js` | factory: `../x`, `Anthropic`, `a/b`, vuoto, inesistente, non funzione, membro mancante (fixture `broken`), caricamento da `test/fixtures/plugin` (CA10) |
| `test/connections.test.js` | contratto `IConnection` su ogni cartella di `plugin/connection/` e sulla fixture; delega di `https` a `globalThis.fetch` (CA6) |
| `test/endpoints.test.js` | contratto `IEndpoint` su ogni cartella di `plugin/endpoint/`, con connessione e segreti finti e fixture delle risposte (CA7, parte di CA4, CA14) |
| `test/anthropic-endpoint.test.js` | corpo della richiesta identico a quello di oggi (`model`, `max_tokens` 4096, `system`, `messages`, `tools`, `tool_choice`); `x-api-key` dallo store; `baseURL` dalla connessione; retry con `maxRetries` (CA1) |
| `test/tasks.test.js` | compito `ping`: schema, `clean` su output valido e rotto, `maxTokens`; gli altri compiti non hanno `maxTokens` |
| `test/llm-config.test.js` | JSON rotto, file assente, campo sconosciuto, nome di plugin non valido, endpoint e connessione inesistenti, segreto sconosciuto, compito sconosciuto e mancante; merge `a`/`b`; formato vecchio `provider`; endpoint inesistente in `settings` con avviso; campi `plugin`/`baseURL` in `settings` ignorati; `ping` ricavato; `routes` su disco non riscritto (CA2, CA11, CA12) |
| `test/connect.test.js` | configurazione di test con `summarizeDay` sull'endpoint finto e il resto su `anthropic`, con il `fetch` finto della connessione fixture. Verifica una riga in `llm_runs` per ogni successo e fallimento, con `provider` corretto; errore di `clean` con `raw` conservato; `e.llm` presente; il segreto assente da `llm_runs` (CA13, CA1) |
| `test/errors.test.js` | `describeLlmError` per ogni codice: testi identici a quelli di oggi con `EndpointInfo` di Anthropic (CA4) |
| `test/service-llm.test.js` | `testLlm()` con chiave valida, mancante e non valida: messaggi e riga `ping` con `entry_id` nullo (CA3); `setModel` scrive solo `model`; configurazione rotta: l'analisi dà il messaggio, mentre salvataggio del diario e invio ad Asana funzionano (CA11) |
| `test/asana-secret.test.js` | `Asana` con `ISecretReader` finto e `fetch` finto: invio e `me()`; token assente; vista che rifiuta `anthropic` (CA9) |
| `test/smoke.js` | stesso percorso di oggi (analisi, rianalisi, obiettivi, Asana, esito incerto, persistenza, `llm_original`, `llm_runs` >= 12) con `createConnector` e l'endpoint finto |

**Controlli con grep (A18)**:
- `@anthropic-ai/sdk` deve comparire solo in `plugin/endpoint/anthropic/` (CA5);
- `Router` e `llm/router` non devono comparire in `src/` e `test/` (CA5);
- `process.env`, `safeStorage` e `secrets.json` non devono comparire in `plugin/` né in `src/main/asana.js` (CA14);
- `anthropic` non deve comparire in `src/main/service.js` (CA4).

**Verifiche manuali (A18)**, con la chiave vera:
- analisi di una voce e confronto con le righe di `llm_runs` (CA1);
- prova del modello con chiave valida, cancellata e sbagliata (CA3);
- modello inesistente nelle Impostazioni, che deve dare "Modello non trovato" (CA4);
- `config/llm.json` rinominato o rotto: avviso all'avvio, diario e invio ad Asana funzionanti (CA11);
- nota sulla privacy e screenshot `e2e-shot` (CA15, CA17).

## Rischi

| Rischio | Mitigazione |
|---|---|
| I nomi delle opzioni dell'SDK 1.3.0 non coincidono con la documentazione (`authToken`, `logLevel`) | In A6 si leggono le definizioni di tipo in `node_modules`. Il test sul corpo e sugli header della richiesta lo rileva. Se un'opzione non c'è, si toglie e si annota. |
| La richiesta inviata cambia senza che ce ne accorgiamo (costo, comportamento) | Il test confronta il corpo JSON con quello prodotto oggi (CA1). Timeout e retry hanno valori espliciti uguali a quelli predefiniti. |
| `ping` con `max_tokens` basso dà `no_output` | 256 token come margine. Prova manuale in A18. |
| Il file aziendale rinomina l'endpoint `anthropic` e i dati di `llm_runs` non si confrontano più | Lo scrive l'ADR 0004: il nome dell'endpoint è l'etichetta del dataset e non si cambia per lo stesso servizio. |
| Configurazione rotta con l'app pacchettizzata (asar): non si corregge senza una nuova build | Il messaggio indica file e voce, e il resto dell'app funziona. La distribuzione è fuori perimetro. È annotato in `ARCHITECTURE.md`, sezione Distribuzione. |
| Il pacchetto non include `plugin/` o `config/` | Nota in `ARCHITECTURE.md`: in `electron-builder` vanno messi in `files` (`plugin/**`, `config/**`). `require` e `fs.readFileSync` funzionano dentro `asar` e l'SDK si risolve da `node_modules` alla radice. I percorsi si calcolano da `__dirname`, non da `process.cwd()`. |
| Un plugin è codice con tutti i permessi | Si carica solo da `appRoot/plugin`, con nomi validati e percorso controllato. Va revisionato come il resto del codice (ADR 0003). Con A17 il gate protegge anche `plugin/` e `config/`. |
| Sostituire `Router` fa perdere una delle sue quattro funzioni | Sono riassegnate così: rotta al connector, richiesta e `clean` all'involucro, `llm_runs` all'involucro, adapter al plugin. `smoke.js` mantiene la stessa copertura. A11 si fa solo dopo A9 e A10. |
| Conflitti su `service.js` e `smoke.js` tra A9 e A12 | A12 dopo A9 (piano aggiornato). |
| Uno `status` tecnico finisce nei messaggi | `describeLlmError` usa solo i testi fissi, più `message` per `unknown`, `bad_request` e `unreachable`, come oggi. Il test di contratto verifica che il segreto non compaia. |

## Aggiornamenti al piano
`02-piano.md` è aggiornato. In sintesi:
- **A1**: il runner è `test/run.js`. I contratti sono `src/main/contracts/{connection,endpoint,secret-store}.js` e gli aiuti per i test stanno in `test/contract/`.
- **A2**: si aggiungono `names()` e `readOnlyView`.
- **A6**: si testa con il `fetch` finto della connessione e le fixture `test/fixtures/endpoint-responses/anthropic.js`, senza sostituire l'SDK. Si aggiungono `describe()` (`EndpointInfo`) e la verifica dei nomi delle opzioni sull'SDK installato.
- **A7**: il modulo è `src/main/llm/config.js`. `ping` si ricava da `extractTasks` se manca la voce, e la creazione di tutti i plugin all'avvio fa parte della validazione.
- **A8**: il modulo è `src/main/llm/connect.js`, che riceve `logRun` e non lo store.
- **A9**: si aggiunge `src/main/llm/errors.js`.
- **A10**: la logica va in `service.testLlm()` e `service.setModel()`. `setModel` scrive solo `{ model }` per ogni compito.
- **A12**: dipende anche da A9. Si aggiunge `Asana.hasToken()`, e `Service` non riceve più `secrets`.
- **A13 e A14**: payload `init.llm`.
- **A15**: comprende l'ADR 0004.
- **A17**: si estende `.claude/hooks/gate.js` a `plugin/` e `config/` (deciso in rev 2). Non dipende più da A5 e può essere la prima attività della fase 4. Va aggiornato anche l'elenco delle cartelle protette in `CLAUDE.md`.
- **A9 e A10**: test aggiuntivi per il testo di `unreachable` e per `setModel` che scrive solo `{ model }`. Con il vecchio formato senza voce `ping`, la prova usa il modello personale.

## Note sull'analisi accettata
L'analisi (`01-analisi.md` rev 3) è accettata e non si riscrive. Le decisioni di Antonio sulla revisione 1 di questo documento la precisano così; in fase 4 e 5 valgono queste note.

- **N1. R13 (rotta di `ping`).** R13 parla di "una propria voce in `routes`". Decisione: `ping` può avere una voce propria nel file o in `settings`, ma se manca eredita la rotta già risolta (file più `settings`) di `extractTasks`. Il `config/llm.json` predefinito non ha la voce `ping`. Il comportamento di CA3 non cambia; in CA2 un database con il modello `x` prova `x`, come oggi.
- **N2. R9 e CA12 (`settings:model`).** R9 dice che `settings:model` scrive "il nuovo formato (`endpoint` + `model`)". Decisione: scrive solo `{ model }` per ogni compito, quindi l'endpoint resta quello del file. La lettura compatibile di R9 (`provider` vale come `endpoint`) e il merge campo per campo di R8 e CA12 non cambiano: una voce `endpoint` scritta a mano o ereditata dal vecchio `provider` vale ancora. Il test di A10 verifica che dopo `setModel` `settings.routes` non contenga `endpoint` né `provider`.
- **N3. R12 e CA4 (servizio non raggiungibile).** Il codice `unreachable` mostra lo stesso testo di oggi, `Errore LLM: <message>`. CA4 resta com'è e il test di `errors.test.js` copre anche questo caso.
- **N4. Accettazione 3 (gate).** "Estensione del gate da valutare in fase 4" diventa una decisione: in A17 il gate si estende a `plugin/` e `config/`.

## Domande aperte
Nessuna. Resta da accettare l'ADR 0004 (stato: proposto) insieme a questa architettura.

## Revisioni
| Rev | Data | Cosa è cambiato |
|---|---|---|
| 1 | 2026-10-29 | Prima stesura |
| 2 | 2026-10-29 | Applicate le risposte di Antonio alle domande della rev 1. Domanda 1, opzione A: `ping` eredita la rotta risolta di `extractTasks` se non ha una voce propria. Domanda 2, opzione A: `settings:model` scrive solo `{ model }`. Domanda 3, opzione A: testo invariato per `unreachable`. Domanda 4, opzione A: gate esteso a `plugin/` e `config/` in A17 (la deroga D4 diventa temporanea). Domande aperte eliminate; aggiunte le note N1-N4 sull'analisi accettata; allineati ADR 0004 e `02-piano.md`. |

## Accettazione

Accettata da Antonio il 2026-10-29 (revisione 2), insieme all'ADR 0004. Deroghe D1-D5 accettate; nessuna nuova dipendenza npm.
