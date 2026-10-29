# Backlog

Richieste in attesa di diventare una feature. Quando una parte con `/feature`, si copia il testo della richiesta e si segna qui l'id della feature.

## B1 · Output strutturato con claude-sonnet-5-5

Stato: in attesa · Registrata: 2026-10-29

Problema osservato: con `claude-sonnet-5-5` ogni analisi fallisce con `400 invalid_request_error: tool_choice: type "tool" and "any" are not supported for this model.` Il plugin endpoint `anthropic` usa la scelta forzata dello strumento per l'output strutturato; Sonnet 5.5 non la accetta più. Rimedio temporaneo: un modello precedente (es. `claude-sonnet-5`).

Riferimenti: [guida di migrazione Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Richiesta da passare a `/feature`, così com'è:

```
Correzione: con claude-sonnet-5-5 l'analisi fallisce con "tool_choice: type tool and any are not supported for this model" (400). Il plugin endpoint anthropic usa la scelta forzata dello strumento per l'output strutturato. Passare a structured outputs (output_config.format, json_schema) mantenendo la vecchia modalità come alternativa scelta da configurazione per modello; adeguare gli schemi dei compiti ai vincoli (additionalProperties false, niente vincoli numerici o di lunghezza); tradurre questo tipo di errore in un messaggio chiaro; aggiungere un test live opzionale con chiave vera, escluso da npm test.
```

## B2 · Come si ottiene e si gestisce la chiave Asana

Stato: da analizzare · Registrata: 2026-10-29

Oggi ogni dipendente crea a mano un Personal Access Token su Asana e lo incolla nelle Impostazioni. Da analizzare prima di farne una feature:

- **Modalità di accesso:** token personale incollato a mano, oppure un'app OAuth registrata da Statwolf con login dal browser (niente token da copiare, rinnovo automatico, revoca centralizzata), oppure un'altra soluzione. Vincolo da mantenere: ognuno scrive su Asana con la propria identità.
- **Primo avvio:** quanto deve essere guidato il collegamento per un collega non tecnico.
- **Ciclo di vita:** scadenza, revoca, cambio di PC, uscita di un dipendente.
- **Permessi:** cosa può fare il token rispetto a quello che serve all'app (leggere i progetti, cercare i task padre, creare sottoattività).
- **Conservazione:** sempre tramite `ISecretStore` (ADR 0003); da coordinare con la futura feature sulla crittografia dei segreti.
- **Stessa domanda per la chiave Anthropic:** oggi è una chiave per dipendente dell'organizzazione Console; valutare se gestirle allo stesso modo.
