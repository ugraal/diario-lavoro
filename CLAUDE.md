# Diario di lavoro

App desktop (Electron) per Statwolf. Il dipendente scrive il diario della giornata in testo libero. Un LLM ne ricava le attività (con progetto PRJ, settimana e durata), i punti di forza e di miglioramento, e aggiorna gli obiettivi di miglioramento. La persona rivede le attività e le invia ad Asana come sottoattività del task padre della settimana.

Leggi `ARCHITECTURE.md` prima di toccare il codice. Le decisioni architetturali sono in `docs/adr/`.

## Comandi

```
npm install        # dipendenze (scarica anche Electron)
npm start          # avvia l'app
npm test           # test senza interfaccia: store, analisi con LLM finto, Asana finto
npx electron test/e2e-shot.js   # avvia l'app con dati di esempio e salva screenshot (SHOT_DIR per la cartella)
```

Sviluppo su Windows: i comandi vanno bene da Git Bash. In sviluppo le chiavi si passano con `ANTHROPIC_API_KEY` e `ASANA_TOKEN`.

## Principi non negoziabili

1. **Local-first.** Diario, attività, obiettivi e log LLM restano sulla macchina del dipendente (SQLite in `userData`). L'unico dato condiviso è Asana. Niente server centrali, niente telemetria.
2. **L'LLM propone, la persona conferma.** Niente arriva su Asana senza un'azione esplicita dell'utente.
3. **Il testo del diario non va mai su Asana.** Su Asana vanno solo titolo, durata, data e stato dell'attività.
4. **Indipendenza dal provider LLM.** Il codice chiama compiti con un nome (`src/main/llm/tasks.js`) attraverso il `Router`, mai un SDK direttamente. I nuovi compiti hanno uno schema JSON e una funzione `clean`.
5. **Dataset.** Ogni chiamata LLM passa dal router e finisce in `llm_runs`; la proposta originale dell'LLM si conserva in `tasks.llm_original`. Non rompere queste due cose.
6. **Sicurezza Electron.** `contextIsolation` attivo, niente `nodeIntegration`, il renderer parla solo con `window.api.invoke` e canali elencati in `src/preload.js`. Segreti solo tramite `src/main/secrets.js`.
7. **Astrazione delle dipendenze critiche.** Ciò che dipende da un fornitore o da una scelta che può cambiare (provider e modelli LLM, router, posizione e trasporto dei servizi, Asana, storage, segreti, funzioni del sistema operativo) si usa solo attraverso un'interfaccia del progetto, mai direttamente. Un'interfaccia è un contratto documentato in JSDoc (`@typedef`/`@interface`) più un test di contratto che ogni implementazione deve passare; l'implementazione si sceglie da configurazione. Esempio guida: raggiungere un servizio si separa in `IConnection` (come ci si arriva: in-process, servizio locale sul PC, Web API su intranet, servizio esterno; con autenticazione, timeout, retry) e `IEndpoint` (con quale servizio si parla: API Anthropic, router, modello locale). Gli SDK dei fornitori si importano solo dentro la loro implementazione. Non si astrae ciò che non è critico: utility interne, interfaccia grafica, logica di dominio stabile.

## Convenzioni di codice

- JavaScript CommonJS nel processo principale, JavaScript semplice nel renderer, nessun passo di build.
- Interfaccia e messaggi all'utente in italiano, tono semplice. Commenti in italiano.
- La logica sta in moduli che non dipendono da Electron (`store`, `service`, `asana`, `llm/*`), così si prova con `npm test`. `main.js` fa solo da collante IPC.
- Nuove dipendenze npm solo se previste e accettate nel documento di architettura della feature.
- Ogni modifica di comportamento ha un test in `test/`.

## Workflow di sviluppo

Le funzionalità nuove si sviluppano con il comando `/feature`, che segue sei fasi:

1. **Analisi della richiesta**: iterativa, finché Antonio non accetta.
2. **Piano e scomposizione in attività.**
3. **Piano architetturale**: iterativo, finché Antonio non accetta.
4. **Implementazione**, un commit per attività.
5. **Test e revisione.**
6. **Apertura della PR** su GitHub.

I documenti di ogni feature stanno in `docs/work/<id>/` e il loro stato in `docs/work/<id>/STATO.md`. `/feature <id>` riprende una feature interrotta, `/feature-stato` mostra a che punto è.

Regole per l'agente principale:

- Le accettazioni delle fasi 1 e 3 le dà solo l'utente, sempre con una domanda esplicita (AskUserQuestion). Non dedurre un'accettazione da un messaggio ambiguo.
- I subagent non possono fare domande all'utente: le domande aperte che riportano le poni tu.
- Prima della fase 4 non si modificano `src/`, `test/`, `plugin/`, `config/` e `package*.json`. Un hook (`.claude/hooks/gate.js`) lo impone. Per una correzione urgente fuori dal workflow l'utente può creare il file `.claude/gate-off`, mai tu.
- Mai fare push su `main`, mai `push --force`. Si lavora su `feature/<id>`.

## Git

- Branch: `feature/<NNN>-<slug>`, creato all'inizio della fase 1.
- Commit in italiano, stile conventional: `docs(001): analisi accettata`, `feat(001): A2 estrazione durate`, `test(001): ...`, `fix(001): ...`.
- La PR usa `.github/pull_request_template.md` e rimanda ai documenti in `docs/work/<id>/`.
