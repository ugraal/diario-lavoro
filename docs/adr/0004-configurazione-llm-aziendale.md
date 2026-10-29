# ADR 0004: configurazione LLM aziendale in `config/llm.json`, compiti per nome con `connect`

Stato: accettato (Antonio, 2026-10-29) · Data: 2026-10-29 · Feature: 001-astrazione-connessione-llm

## Contesto
L'ADR 0003 decide che connessioni ed endpoint sono plugin caricati da una factory, ma non dice dove sta la configurazione che li collega ai compiti, chi la può cambiare, come si chiama un compito né come si gestiscono gli errori. La configurazione decide dove va il testo del diario (principio 1), quindi non può stare in un posto scrivibile dall'utente o dall'app. I colleghi però devono poter scegliere il modello, come fanno già oggi.

## Decisione
1. La configurazione LLM aziendale è `config/llm.json`, nella cartella dell'app, accanto a `plugin/`. L'app la legge una volta all'avvio e non la scrive mai. Contiene `connections`, `endpoints` (plugin, connessione, nome del segreto, opzioni) e `routes` (compito -> endpoint e modello).
2. Le preferenze personali stanno in `settings.routes` (SQLite, `userData`) e possono cambiare, per ogni compito e campo per campo, solo `model` e la scelta tra gli endpoint già definiti nel file. Connessioni, endpoint, plugin, indirizzi e segreti si definiscono solo nel file. Una voce personale che punta a un endpoint inesistente si ignora con un avviso. Quando l'utente salva il modello dalle Impostazioni, l'app scrive solo `{ model }` per ogni compito: l'endpoint resta quello del file, così un cambio di endpoint deciso dall'azienda vale per tutti.
3. La validazione è stretta: nessun campo sconosciuto, riferimenti esistenti, nomi conformi a `[a-z0-9-]` e plugin istanziati all'avvio. In caso di errore le funzioni LLM rispondono con un messaggio che indica il file e la voce, e il resto dell'app continua a funzionare.
4. Il codice chiama i compiti con `connect(compito)`, che restituisce un client di compito. Il client costruisce la richiesta da `tasks.js`, chiama l'endpoint, applica `clean` e scrive una riga in `llm_runs` per ogni chiamata, riuscita o fallita. I plugin non vedono mai lo store. La prova di collegamento è un compito come gli altri (`ping`): se non ha una rotta propria, eredita quella già risolta di `extractTasks`.
5. Gli endpoint segnalano gli errori con codici normalizzati (`no_key`, `bad_key`, `forbidden`, `model_not_found`, `rate_limit`, `unavailable`, `unreachable`, `no_output`, `bad_request`, `unknown`). I testi in italiano li produce il nucleo e restano quelli di oggi, compreso `Errore LLM: <messaggio>` per un servizio non raggiungibile.
6. Il nome dell'endpoint è l'etichetta del dataset (`llm_runs.provider`). Per lo stesso servizio non si rinomina.
7. Punti lasciati aperti dall'ADR 0003: il file d'ingresso resta `App.js`. La factory crea un'istanza nuova a ogni chiamata, e il nucleo crea un'istanza per ogni connessione e per ogni endpoint all'avvio e le riusa.

8. `plugin/` e `config/` sono codice e configurazione eseguiti con tutti i permessi: il gate del workflow (`.claude/hooks/gate.js`) li protegge come `src/`.

## Conseguenze
- Per cambiare fornitore o collegare il router dei modelli esterno bastano un plugin e una modifica di `config/llm.json`, senza toccare `src/`.
- Con l'app pacchettizzata (asar) il file viaggia con la build: una configurazione diversa per collega o per sede richiede una build o una posizione di sistema in sola lettura. Da rivedere con la distribuzione.
- I database esistenti funzionano senza migrazione: in `settings.routes` il vecchio campo `provider` vale come nome dell'endpoint.
- Supera la parte dell'ADR 0002 che riguarda la classe `Router`. Resta valida la scelta dei compiti per nome con schema e `clean`.
