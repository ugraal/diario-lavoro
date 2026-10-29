# Diario di lavoro

Scrivi il diario della giornata; un LLM ne ricava attività (con progetto PRJ, settimana e durata), punti di forza e di miglioramento, e aggiorna i tuoi obiettivi. Rivedi le attività e le invii ad Asana come sottoattività del task padre della settimana. Tutti i dati restano sul tuo computer; l'unico dato condiviso è Asana.

L'architettura è in [ARCHITECTURE.md](ARCHITECTURE.md), le decisioni in [docs/adr/](docs/adr/).

## Avvio

Serve Node.js 20 o superiore.

```
npm install
npm start
```

Al primo avvio si aprono le Impostazioni: incolla l'API key Anthropic (dall'organizzazione Console collegata al piano Team) e il Personal Access Token di Asana, poi scegli i tuoi progetti. In sviluppo puoi passare le chiavi come variabili d'ambiente `ANTHROPIC_API_KEY` e `ASANA_TOKEN`.

## Test

```
npm test                          # store, analisi con LLM finto, Asana finto
npx electron test/e2e-shot.js     # avvia l'app con dati di esempio e salva screenshot in SHOT_DIR
```

## Sviluppo con Claude Code

Il progetto è configurato per un workflow a fasi. Apri la cartella con Claude Code e lancia:

```
/feature <descrizione della richiesta>    # nuova funzionalità
/feature <id>                             # riprende una feature interrotta
/feature-stato [id]                       # a che punto sono le feature
```

Le fasi sono sei:

1. Analisi della richiesta, iterativa fino alla tua accettazione.
2. Piano e scomposizione in attività.
3. Piano architetturale, iterativo fino alla tua accettazione.
4. Implementazione, un commit per attività.
5. Test e revisione.
6. Apertura della PR su GitHub.

I documenti di ogni feature finiscono in `docs/work/<id>/` e nella PR. Un hook impedisce di modificare `src/`, `test/`, `plugin/`, `config/` e `package*.json` prima che l'architettura sia accettata. Per una correzione urgente fuori dal workflow crea il file `.claude/gate-off` e cancellalo dopo.

La configurazione sta in `CLAUDE.md` (regole del progetto), `.claude/skills/` (comandi), `.claude/agents/` (un subagent per fase) e `.claude/settings.json` (permessi e hook).

## Dove stanno i dati

Nella cartella dati dell'app (Impostazioni → Dati): `diario.sqlite` e `secrets.json` (chiavi cifrate con il portachiavi del sistema). Da Impostazioni → Esporta si ottiene un JSON con tutto, utile come backup e come dataset per tarare il router dei modelli.
