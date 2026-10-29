# ADR 0001: app desktop local-first con Electron e SQLite

Stato: accettato · Data: 2026-10-29

## Contesto
Diario, attività e obiettivi sono dati personali del dipendente. L'unico dato che deve essere condiviso è il lavoro registrato su Asana. L'app deve girare su Windows, Mac e Linux ed essere sviluppata in Node.

## Decisione
App desktop Electron. Storage SQLite locale tramite `sql.js` (WebAssembly, nessun modulo nativo da ricompilare), con il database in memoria scritto su disco a ogni modifica in modo atomico. Segreti cifrati con `safeStorage`. Nessun server centrale.

## Conseguenze
- Nessuna infrastruttura da gestire; i dati non lasciano il PC, salvo il testo inviato all'LLM.
- Backup a carico del dipendente (export JSON dalle Impostazioni).
- Nessuna sincronizzazione tra più dispositivi della stessa persona.
- `sql.js` riscrive l'intero file a ogni modifica: va bene per volumi personali; se i dati crescessero molto si valuterà `better-sqlite3`.
