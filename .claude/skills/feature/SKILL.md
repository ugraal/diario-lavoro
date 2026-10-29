---
name: feature
description: Sviluppa una nuova funzionalità con il workflow a 6 fasi (analisi con accettazione, piano, architettura con accettazione, implementazione, test, PR). Con un id esistente riprende una feature interrotta.
argument-hint: "<descrizione della richiesta> | <id feature da riprendere>"
disable-model-invocation: true
---

# Workflow /feature

Argomento: $ARGUMENTS

Sei l'agente principale e orchestri sei fasi. Il lavoro pesante lo fanno i subagent (`analista`, `pianificatore`, `architetto`, `sviluppatore`, `tester`, `revisore`); tu tieni il filo, aggiorni `STATO.md`, parli con l'utente e gestisci git. I subagent non possono fare domande all'utente: quando riportano domande aperte, le fai tu con AskUserQuestion.

Regole sempre valide:

- Le fasi 1 e 3 finiscono **solo** con un'accettazione esplicita data con AskUserQuestion. Mai dedurla.
- Dopo ogni passo aggiorna `STATO.md` (campi e riga nel Registro) e fai un commit dei documenti.
- All'utente mostra sintesi brevi; il dettaglio sta nei documenti. Indica sempre il percorso del documento.
- Se un passo fallisce in modo che non sai risolvere, fermati, spiega e chiedi.
- **Punto di ripartenza.** Alla fine delle fasi 1, 3 e 5, dopo il commit dei documenti, chiedi con AskUserQuestion: "Fase <n> chiusa e salvata. Ripartiamo da una conversazione pulita per la fase successiva?" con le opzioni "Riparto pulito (consigliato)" e "Continuo qui". Se l'utente sceglie di ripartire, scrivigli i due comandi da lanciare, `/clear` e poi `/feature <id>`, e fermati: non proseguire. Il motivo: ogni passo rimanda al modello tutta la conversazione, e la discussione delle fasi chiuse è già nei documenti e in `STATO.md`, quindi non serve più nel contesto.

## Fase 0: avvio o ripresa

Se l'argomento corrisponde a una cartella esistente `docs/work/<id>/` (anche solo il numero, es. `003`):
1. Fai `git switch feature/<id>` (se non ci sei già) e scrivi `<id>` in `.claude/feature-attiva`.
2. Leggi `STATO.md` e solo i documenti che servono alla fase da riprendere: per le fasi 2 e 3 `01-analisi.md` (e `02-piano.md` per la 3); per la 4 `02-piano.md` e `04-implementazione.md`; per la 5 `04-implementazione.md`; per la 6 `05-verifica.md`. Gli altri li leggono i subagent quando servono. Riassumi all'utente in poche righe dove eravate e riprendi dalla fase indicata.

Altrimenti è una nuova richiesta:
1. Se l'argomento è vuoto, chiedi all'utente di descrivere la richiesta.
2. Controlla `git status`: se ci sono modifiche non committate, fermati e chiedi come procedere. Porta `main` aggiornato (`git switch main`, `git pull --ff-only` se esiste un remoto).
3. Calcola l'id: numero a tre cifre successivo al più alto in `docs/work/` + slug breve in kebab-case dal titolo (es. `004-export-settimanale`).
4. `git switch -c feature/<id>`.
5. Crea `docs/work/<id>/` con `00-richiesta.md` (la richiesta alla lettera, con data) e `STATO.md` copiato da `docs/work/_template/STATO.md` e compilato (fase 1, analisi `in-corso`).
6. Scrivi `<id>` in `.claude/feature-attiva`. Commit: `docs(<NNN>): avvio feature`.

## Fase 1: analisi della richiesta (iterativa, con accettazione)

1. Lancia il subagent `analista` passandogli: id, percorso della cartella, richiesta, ed eventuale feedback della revisione precedente. Scrive `01-analisi.md`.
2. Leggi il documento. Se ha **domande aperte**, falle all'utente con AskUserQuestion (al massimo 4 per volta, con opzioni concrete), poi rilancia `analista` con le risposte. Ripeti finché non restano domande bloccanti.
3. Mostra all'utente una sintesi: obiettivo, cosa rientra, cosa resta fuori, criteri di accettazione (elenco breve), rischi.
4. Chiedi con AskUserQuestion: "Accetti l'analisi della feature <id> (revisione N)?" con le opzioni "Accetto" e "Servono modifiche" (con "Other" l'utente scrive cosa cambiare). Se servono modifiche, rilancia `analista` con il feedback alla lettera e torna al punto 2.
5. All'accettazione: aggiungi in fondo a `01-analisi.md` la sezione `## Accettazione` (accettata da Antonio, data, revisione); in `STATO.md` metti `analisi: accettata (rev N, data)`, `fase: 2`. Commit `docs(<NNN>): analisi accettata`. Poi applica il punto di ripartenza.

### Percorso leggero
L'analista propone la dimensione. Se propone `piccola`, chiedi conferma all'utente nella stessa domanda di accettazione (opzioni: "Accetto, percorso leggero", "Accetto, percorso completo", "Servono modifiche"). Con il percorso leggero l'accettazione copre anche le sezioni Piano e Architettura del documento: in `STATO.md` metti `percorso: leggero`, `analisi` e `architettura` entrambe `accettata (rev N, data)`, `piano: incluso`, `fase: 4`, applica il punto di ripartenza e passa alla fase 4. Se durante l'implementazione il lavoro si rivela più grande (tocca schema, contratti, IPC o dipendenze), fermati e proponi all'utente di passare al percorso completo.

## Fase 2: piano e scomposizione

1. Lancia il subagent `pianificatore` (id, cartella). Scrive `02-piano.md`: da 2 a 5 pacchetti di lavoro `P1..Pn`, ciascuno con le sue attività, i criteri coperti e il contesto minimo da leggere.
2. Mostra all'utente l'elenco dei pacchetti in una riga ciascuno. Non serve accettazione formale, ma se l'utente commenta, rilancia `pianificatore` con il commento.
3. `STATO.md`: `piano: fatto`, `fase: 3`, architettura `in-corso`. Commit `docs(<NNN>): piano`.

## Fase 3: piano architetturale (iterativo, con accettazione)

1. Lancia il subagent `architetto` (id, cartella, eventuale feedback). Scrive `03-architettura.md`, eventuali ADR in `docs/adr/` e, se serve, aggiorna `02-piano.md` segnando le modifiche.
2. Se riporta domande aperte o scelte tra alternative, falle con AskUserQuestion e rilancia `architetto` con le risposte.
3. Mostra la sintesi: moduli toccati, modifiche a dati/IPC/compiti LLM, nuove dipendenze, rischi, strategia di test. Evidenzia ogni deroga ai principi di `CLAUDE.md`.
4. Chiedi con AskUserQuestion: "Accetti l'architettura della feature <id> (revisione N)?" con le opzioni "Accetto" e "Servono modifiche". Ripeti finché non accetta.
5. All'accettazione: sezione `## Accettazione` in `03-architettura.md`; `STATO.md`: `architettura: accettata (rev N, data)`, `fase: 4`, `implementazione: in-corso`. Commit `docs(<NNN>): architettura accettata`. Poi applica il punto di ripartenza. Solo da qui l'hook permette di modificare `src/`, `test/` e `package*.json`.

## Fase 4: implementazione

1. Crea `04-implementazione.md` con una tabella `Pacchetto | Attività | Stato | Commit | Note`.
2. Per ogni pacchetto, in ordine, lancia **un** subagent `sviluppatore` con: id, cartella, codice del pacchetto. Lo sviluppatore svolge tutte le attività del pacchetto, con test e un commit `feat(<NNN>): A<k> ...` per ciascuna. Non lanciare un subagent per singola attività.
3. Dopo ogni pacchetto aggiorna la tabella. Se lo sviluppatore segnala che serve **deviare dall'architettura accettata** (nuova dipendenza, cambio di schema non previsto, nuovo canale IPC non previsto), fermati: spiega la deviazione all'utente e chiedi con AskUserQuestion se accettarla. Se la accetta, annota la deviazione in `03-architettura.md` (sezione `## Deviazioni accettate`); se no, chiedi allo sviluppatore un'alternativa.
4. Finite le attività: `STATO.md` `implementazione: fatto`, `fase: 5`, `verifica: in-corso`. Commit dei documenti.

## Fase 5: test e revisione

1. Lancia in parallelo `tester` e `revisore` (id, cartella). Il primo scrive la sezione `## Test` di `05-verifica.md`, il secondo la sezione `## Revisione`.
2. Se ci sono test che falliscono, criteri di accettazione non coperti o problemi bloccanti della revisione: torna alla fase 4 con un'attività correttiva `F<k>` (aggiungila a `02-piano.md` e alla tabella; raggruppa in un solo `F<k>` le correzioni sugli stessi file) e poi ripeti la fase 5. Dopo 3 cicli senza esito, fermati e chiedi all'utente.
3. Mostra all'utente l'esito: criteri di accettazione coperti, test eseguiti, osservazioni non bloccanti.
4. `STATO.md`: `verifica: fatto`, `fase: 6`. Commit `docs(<NNN>): verifica`. Poi applica il punto di ripartenza.

## Fase 6: apertura della PR

1. Controlla `gh auth status` e che esista il remoto `origin`. Se manca qualcosa, spiega all'utente come sistemarlo (`gh auth login`, `git remote add origin ...`) e fermati.
2. `git push -u origin feature/<id>`.
3. Prepara il corpo della PR seguendo `.github/pull_request_template.md`: riassunto, link ai documenti in `docs/work/<id>/`, criteri di accettazione con esito, attività e commit, test eseguiti, rischi e osservazioni della revisione, deviazioni accettate.
4. Ricava il repository con `git remote get-url origin` (es. `ugraal/diario-lavoro`) e apri la PR in modo non interattivo, indicando sempre repository e branch: `gh pr create --repo <owner>/<repo> --base main --head feature/<id> --title "feat(<NNN>): <titolo>" --body-file <file temporaneo>`. Senza `--repo` e `--head`, `gh` può fermarsi a chiedere dove pushare il branch: in Claude Code non c'è nessuno a rispondere e il comando fallisce. Il titolo segue Conventional Commits.
5. In `STATO.md` scrivi `pr: <url>` e una riga di Registro; commit e push. Svuota `.claude/feature-attiva`.
6. Comunica all'utente il link della PR.
