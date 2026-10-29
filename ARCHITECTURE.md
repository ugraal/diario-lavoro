# Diario di lavoro: architettura

Versione 0.1, prima versione semplice. Lo scopo è farla funzionare e raccogliere diari veri, che poi useremo per tarare i modelli e l'eventuale router esterno.

## Idea

Il dipendente scrive nel diario, in testo libero, cosa ha fatto, cosa è andato bene e cosa migliorare. Un LLM ne ricava tre cose: una lista di attività con progetto (PRJ), settimana e durata proposti; i punti di forza e gli spunti di miglioramento della giornata; l'aggiornamento degli obiettivi di miglioramento. Il dipendente rivede le attività e le manda su Asana, dove diventano sottoattività del task padre della settimana, con la stessa logica del vecchio Monitor progetti.

Principio fermo: l'LLM propone, la persona conferma. Niente arriva su Asana senza un click.

## Dove stanno i dati

L'architettura è local-first. Diario, attività, obiettivi e log delle chiamate LLM stanno in un file SQLite sulla macchina del dipendente (`diario.sqlite` nella cartella dati dell'app). L'unico dato condiviso è Asana. Non c'è nessun server centrale.

Il testo del diario però va all'LLM, quindi esce dalla macchina. Con l'API Anthropic i dati non vengono usati per l'addestramento, ma l'app lo dichiara comunque nelle impostazioni. Dove va il testo dipende dall'endpoint scelto in `config/llm.json`: oggi l'API Anthropic, in futuro anche un servizio più vicino (modello locale, Web API su intranet). Le Impostazioni mostrano l'endpoint effettivo. Un eventuale router di modelli sarà un servizio esterno all'app, raggiunto come un endpoint qualsiasi; nell'app non esiste un router interno.

Il backup è responsabilità del dipendente: l'app esporta tutto in un file JSON.

## Stack

Electron 45 con JavaScript semplice e nessun passo di build, per partire in fretta (il passaggio a TypeScript si può fare dopo). Lo storage è `sql.js`, cioè SQLite compilato in WebAssembly: niente moduli nativi da ricompilare per ogni sistema operativo. Il database vive in memoria e viene scritto su disco a ogni modifica, con scrittura atomica (file temporaneo poi rinomina). L'API key Anthropic e il token Asana sono cifrati con `safeStorage` di Electron, che usa il portachiavi del sistema operativo. Per lo sviluppo si possono passare anche come variabili d'ambiente `ANTHROPIC_API_KEY` e `ASANA_TOKEN`.

Il renderer è HTML e JavaScript senza framework, isolato (`contextIsolation`, niente `nodeIntegration`, CSP stretta). Parla con il processo principale solo attraverso `window.api.invoke(canale, ...)`, esposto dal preload.

```
src/
  main/
    main.js          finestra, IPC, orchestrazione (analisi, invio ad Asana)
    store.js         SQLite: diario, attività, obiettivi, log LLM, impostazioni
    secrets.js       segreti cifrati con safeStorage
    asana.js         client REST Asana e logica del task padre settimanale
    asana-config.js  GID di progetto e campi custom
    service.js       logica di dominio (analisi, invio) senza Electron
    plugins.js       factory dei plugin: carica plugin/<tipo>/<nome>/App.js e ne verifica il contratto
    contracts/       interfacce documentate in JSDoc: connection.js (IConnection),
                     endpoint.js (IEndpoint),
                     secret-store.js (ISecretStore e ISecretReader)
    llm/
      tasks.js       definizione dei compiti: prompt e schema JSON
      config.js      legge e valida config/llm.json, unisce le scelte delle impostazioni
      connect.js     connect(compito): risolve endpoint e modello, chiama l'endpoint, applica clean,
                     scrive sempre llm_runs
      errors.js      errori LLM con codici (no_key, unreachable, ...) e messaggi in italiano
  shared/util.js     settimana ISO, durate (usato da main e renderer)
  preload.js
  renderer/          index.html, app.js, styles.css
plugin/
  connection/https/App.js      IConnection: HTTPS diretto con timeout e retry
  endpoint/anthropic/App.js    IEndpoint: API Anthropic (tool use forzato)
config/llm.json    connessioni, endpoint e tabella compito -> { endpoint, modello }
test/                test senza interfaccia: store, analisi con LLM finto, Asana finto, contratti dei plugin
```

## Viste

**Diario.** A sinistra le voci per data, al centro l'editor (data e testo) con i pulsanti Salva e Analizza, sotto il risultato dell'analisi. A destra gli obiettivi di miglioramento con progresso e tendenza. Gli obiettivi nuovi arrivano come proposte da accettare o scartare.

**Progetti.** Le attività estratte, divise tra "Da rivedere" e per progetto. Su ognuna si correggono testo, PRJ, settimana, durata e stato (fatta o da fare), poi si invia ad Asana o si scarta. "I miei progetti" si sceglie nelle impostazioni dall'elenco PRJ letto da Asana.

## Schema dati

```
entries       id, date, text, created_at, updated_at, analyzed_at, strengths(JSON), improvements(JSON)
tasks         id, entry_id, title, minutes, prj_gid, week, done, status, confidence, evidence,
              llm_original(JSON), asana_gid, asana_url, asana_parent_gid, asana_parent_name,
              candidates(JSON), error, created_at, updated_at
goals         id, title, description, status[proposed|active|achieved|dropped], progress(0-100),
              trend[up|flat|down], source_entry_id, created_at, updated_at
goal_updates  id, goal_id, entry_id, progress, trend, evidence, comment, created_at
llm_runs      id, task, provider, model, entry_id, input(JSON), output(JSON), error, ms, created_at
settings      key, value(JSON)
```

Stati di un'attività: `draft` (proposta dall'LLM), `sending`, `synced`, `error`, `pick` (più task padre possibili, si sceglie a mano), `uncertain` (esito dell'invio incerto: prima di ritentare si controlla su Asana), `discarded`.

Due campi esistono apposta per il dataset: `tasks.llm_original` conserva la proposta originale dell'LLM, per misurare quanto la persona la corregge; `llm_runs` conserva input e output di ogni chiamata. Le attività scartate non vengono cancellate, perché anche lo scarto è un'informazione.

## Pipeline LLM: compiti, endpoint e connessioni

Il resto dell'app non chiama mai un provider. Chiama compiti con un nome, ciascuno con input e schema di output:

| Compito | Cosa fa | Oggi | Domani (ipotesi) |
|---|---|---|---|
| `extractTasks` | attività, PRJ, durata, fatta/da fare | Anthropic | locale piccolo, escalation se confidenza bassa |
| `summarizeDay` | punti di forza e di miglioramento | Anthropic | locale |
| `reviewGoals` | aggiorna gli obiettivi attivi, propone i nuovi | Anthropic | API |
| settimana ISO | calcolata dalla data | codice | codice |

I tre compiti partono in parallelo. Il codice chiama `connect(compito)` (`src/main/llm/connect.js`), che legge la tabella `compito -> { endpoint, modello }` da `config/llm.json` (il modello può essere scelto dalle Impostazioni), costruisce la richiesta da `tasks.js`, chiama l'endpoint, applica `clean` e registra ogni chiamata in `llm_runs`, anche in caso di errore.

Raggiungere un servizio si separa in due interfacce, entrambe caricate come plugin (ADR 0003 e 0004):

- `IConnection` è il come ci si arriva: fornisce `fetch` con autenticazione, timeout e retry. Una connessione sta in una di quattro posizioni: modulo in-process, servizio locale sul PC, Web API su intranet, servizio esterno. Oggi c'è solo `https` (HTTPS diretto).
- `IEndpoint` è con quale servizio si parla: `runStructured({ system, user, schema, toolName, model, maxTokens })` restituisce un oggetto conforme allo schema. Oggi c'è solo `anthropic`, che usa il tool use forzato (`tool_choice`). Il segreto (la chiave API) gli arriva da una vista di sola lettura, `ISecretReader`, e il plugin non vede mai lo store.

Il router di modelli, se arriverà, è un servizio esterno all'app: si aggiunge come nuovo endpoint, raggiunto tramite una connessione in una delle quattro posizioni. Nell'app non c'è un router interno. Se la configurazione non è valida l'app lo segnala all'avvio e nelle Impostazioni e le analisi sono rifiutate con un messaggio chiaro. Aggiungere un endpoint o una connessione significa aggiungere una cartella in `plugin/`, una voce in `config/llm.json` e il relativo test di contratto, senza toccare il resto.

Gli obiettivi attivi vengono rimandati all'LLM a ogni analisi. Contro la deriva valgono tre regole: al massimo 2 proposte per analisi, al massimo 5 obiettivi attivi, ogni aggiornamento con una citazione dal diario come prova. Rianalizzando la stessa voce si sostituiscono le bozze e gli aggiornamenti che venivano da quella voce, senza duplicarli.

## Asana

Il client è REST, con il Personal Access Token di ogni dipendente, così ognuno scrive con la propria identità. La logica è portata dal Monitor progetti:

1. Il PRJ dell'attività è un'opzione del campo enum PRJ del progetto PRIORITÀ 2026. L'elenco si legge da Asana, con un elenco di riserva nel codice.
2. Il task padre si cerca nel progetto con quel PRJ, non completato e non sottoattività, il cui campo Settimana contiene la settimana dell'attività (per esempio `W44`). Prima tra i task assegnati a me, poi tra tutti.
3. Un candidato: si usa quello. Più candidati: se uno solo non è "pianificato" si usa quello, altrimenti la persona sceglie.
4. Si crea la sottoattività assegnata a me, con scadenza alla data della voce di diario, il tempo nel campo Tempo, lo stato completato se l'attività è fatta e una nota di provenienza.
5. Idempotenza: il gid creato si salva in locale. Se l'invio ha un esito incerto (errore di rete dopo la scrittura), prima di ritentare si cercano tra le sottoattività del padre quelle con lo stesso nome.

## Distribuzione

Per ora si avvia da sorgente con `npm install` e `npm start`. In seguito `electron-builder` per gli installer Windows, Mac e Linux, aggiornamenti da un repo interno e firma del codice (account Apple Developer e certificato Windows).

Nel pacchetto finale vanno incluse anche le cartelle `plugin/` e `config/` (fuori da `src/`): contengono i plugin di connessione ed endpoint LLM e la configurazione aziendale (ADR 0003 e 0004). Sono codice e configurazione eseguiti con tutti i permessi, quindi il gate del workflow le protegge come `src/`.

## Prossimi passi

1. Usare l'app per qualche settimana e raccogliere diari, correzioni e scarti.
2. Costruire il banco di prova dai dati raccolti: voci di diario e risultati attesi per compito.
3. Aggiungere un endpoint locale (Ollama o `node-llama-cpp`) come plugin, misurarlo compito per compito, poi cambiare la tabella dei compiti in `config/llm.json`. L'escalation tra modelli, o un router esterno, si valuta dopo.
4. Passare a TypeScript e a un pacchetto installabile.
