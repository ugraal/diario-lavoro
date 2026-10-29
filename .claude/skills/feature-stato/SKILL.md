---
name: feature-stato
description: Mostra lo stato delle feature del workflow /feature (fase, accettazioni, PR) senza modificare nulla.
argument-hint: "[id]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash(git status*) Bash(git branch*) Bash(git log*)
---

Mostra lo stato delle feature. Non modificare nessun file.

Argomento: $ARGUMENTS

- Se c'è un id, leggi `docs/work/<id>/STATO.md` e riassumi: fase in corso, stato di analisi e architettura (con revisione e data di accettazione), attività completate su totali (da `04-implementazione.md` se esiste), PR. Indica il prossimo passo e il comando per riprendere (`/feature <id>`).
- Senza id, elenca tutte le cartelle in `docs/work/` (esclusa `_template`) con id, titolo, fase e PR, in una tabella. Segnala quale è la feature attiva (`.claude/feature-attiva`) e il branch git corrente.
