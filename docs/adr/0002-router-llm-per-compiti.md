# ADR 0002: chiamate LLM per compiti, tramite un router

Stato: accettato · Data: 2026-10-29

## Contesto
In sviluppo si usa l'API Anthropic (crediti API inclusi nel piano Claude Team). In seguito un router locale dovrà scomporre il lavoro e mandare i compiti semplici a modelli piccoli locali e quelli complessi all'API.

## Decisione
Il codice chiama compiti con un nome (`extractTasks`, `summarizeDay`, `reviewGoals`), ciascuno con prompt, schema JSON di output e funzione `clean`. Il `Router` sceglie l'adapter e il modello da una tabella di configurazione e registra ogni chiamata in `llm_runs`. Oggi c'è solo `AnthropicAdapter` (tool use forzato per l'output strutturato).

## Conseguenze
- Aggiungere un modello locale significa scrivere un adapter e cambiare la tabella, senza toccare il resto.
- Più chiamate piccole invece di una grande: più latenza e qualche token in più, in cambio di compiti spostabili uno per uno.
- `llm_runs` e `tasks.llm_original` formano il dataset per misurare i modelli locali prima di attivarli.

## Nota successiva
Questo ADR resta valido per i compiti con nome, schema e `clean`, e per `llm_runs`. Il `Router` e `AnthropicAdapter` però sono stati sostituiti da `connect()` e da plugin di connessione ed endpoint: vedi ADR 0003 e ADR 0004. Da qui in poi "router" indica solo un eventuale servizio esterno raggiunto come endpoint; nell'app non esiste un router interno.
