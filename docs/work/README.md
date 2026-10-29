# Documenti di lavoro delle feature

Ogni feature sviluppata con `/feature` ha una cartella `docs/work/<NNN>-<slug>/`, versionata sul branch della feature e inclusa nella PR.

| File | Fase | Chi lo scrive | Accettazione |
|---|---|---|---|
| `STATO.md` | tutte | agente principale | |
| `00-richiesta.md` | avvio | agente principale (testo della richiesta, alla lettera) | |
| `01-analisi.md` | 1 | subagent `analista` | sì, iterativa |
| `02-piano.md` | 2 | subagent `pianificatore` | |
| `03-architettura.md` | 3 | subagent `architetto` (più eventuali ADR in `docs/adr/`) | sì, iterativa |
| `04-implementazione.md` | 4 | agente principale (registro attività e commit) | |
| `05-verifica.md` | 5 | subagent `tester` e `revisore` | |

Il modello di `STATO.md` è in `_template/`. La feature attiva sulla macchina di chi sviluppa è scritta in `.claude/feature-attiva` (non versionato): l'hook `.claude/hooks/gate.js` la usa per decidere se il codice si può modificare.
