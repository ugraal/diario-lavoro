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

## B2 · Accesso ad Asana con OAuth e identità dell'utente

Stato: analizzato, decisioni aperte · Registrata: 2026-10-29 · Analisi: 2026-10-29

### Obiettivo
Il collega non deve più creare e incollare un token Asana: si collega dal browser con il suo account (OAuth). L'app sa chi è l'utente (per ora con l'email inserita a mano, in seguito con l'account Microsoft 365 aziendale). Massima astrazione dai fornitori, secondo il principio 7 e l'ADR 0003.

### Cosa dice oggi la documentazione Asana
- OAuth con authorization code; PKCE (S256) obbligatorio per i redirect `localhost`/`127.0.0.1`/URN nativo. Access token di 1 ora, rinnovo con refresh token, revoca con `/-/oauth_revoke`.
- Scope granulari `risorsa:azione` (es. `tasks:read`, `tasks:write`, `projects:read`, `users:read`); `default` solo per app con permessi completi.
- **Punto critico:** lo scambio del codice e il rinnovo del token richiedono il `client_secret`, che secondo Asana non va mai messo in codice lato client. Un'app desktop non può custodirlo. La documentazione non descrive un'eccezione per le app native con PKCE: va verificato.
- I PAT non scadono, agiscono con tutti i permessi dell'utente e Asana li indica per uso individuale, non per app usate da più persone.
- Gli amministratori possono bloccare app OAuth e PAT per workspace: va gestito l'errore e va fatta approvare l'app nel workspace Statwolf.

### Astrazioni proposte (stesso schema plugin dell'ADR 0003)
- **`IIdentityProvider`** (`plugin/identity/<nome>/App.js`): chi è l'utente. Restituisce almeno `{ email, displayName, source }`. Implementazioni: `manual` (email inserita nelle Impostazioni, subito) e `m365` (Microsoft Entra ID con MSAL Node, in seguito: vedi B3).
- **`IAuthProvider`** (`plugin/auth/<nome>/App.js`): ottiene una credenziale valida per un servizio; metodi indicativi `getAccessToken()`, `signIn()`, `signOut()`, `status()`. Implementazioni: `static` (token o chiave conservati, cioè il PAT e la chiave Anthropic di oggi) e `oauth2-pkce` (generico: URL di autorizzazione e token, scope, client id e redirect da configurazione, rinnovo automatico). Asana diventa solo una configurazione di `oauth2-pkce`, non codice.
- Connessioni ed endpoint ricevono un `IAuthProvider` dal nucleo, mai token diretti (coerente con ADR 0003, punto 6). I token si conservano tramite `ISecretStore`.
- Controllo di coerenza: l'email dell'identità e quella dell'account Asana collegato devono coincidere; se no, avviso.

### Opzioni per il client secret di Asana
1. **PKCE senza secret**, se Asana lo accetta per le app native. Da verificare con una prova o con il supporto Asana. È la soluzione migliore: nessun server.
2. **Piccolo broker sull'intranet** (o funzione serverless) che custodisce il secret e fa solo scambio e rinnovo del token. Non conserva dati. È un'eccezione al principio 1 (nessun server centrale) da dichiarare in un ADR; si sposa con la Web API intranet prevista per il router.
3. **Secret dentro l'app.** Sconsigliato da Asana: chiunque abbia l'app può estrarlo. Da scartare salvo uso strettamente interno e consapevole.
4. **Restare sul PAT** con un collegamento guidato (link diretto alla console sviluppatori, incolla, verifica). Il più semplice, ma resta manuale, senza scadenza e senza revoca centrale.

Proposta: si costruiscono subito le astrazioni con `manual` e `static` (comportamento di oggi, nessun rischio), si fa la prova dell'opzione 1 e, se fallisce, si decide tra 2 e 4.

### Cosa serve da fuori
- Registrazione dell'app OAuth nella console sviluppatori Asana (chi la possiede: un account di servizio Statwolf, non personale) e approvazione nel workspace.
- Per B3: registrazione dell'app in Microsoft Entra da parte dell'amministratore del tenant.

### Domande aperte
- Chi registra e possiede l'app Asana?
- Se serve il broker (opzione 2), dove gira: intranet Statwolf o servizio cloud?
- La chiave Anthropic resta per dipendente (con `static`) o passa anch'essa da un servizio intranet autenticato con l'identità M365?

## B3 · Identità aziendale Microsoft 365

Stato: prossimo passo dopo B2 · Registrata: 2026-10-29

Implementazione `m365` di `IIdentityProvider` con MSAL Node: app pubblica a tenant singolo registrata in Microsoft Entra (client id e tenant id forniti dall'amministratore, "Allow public client flows" attivo, redirect `http://localhost` per il browser di sistema), nessun client secret, permesso `User.Read` per email e nome. Sostituisce l'email inserita a mano.

Valore oltre all'identità: lo stesso accesso Microsoft potrà autenticare i servizi intranet (router LLM, eventuale broker OAuth di B2) tramite un `IAuthProvider` dedicato, senza chiavi da distribuire.

## B4 · Distribuzione dell'app con Intune

Stato: in attesa · **Priorità: bassa, non prioritaria al momento** · Registrata: 2026-10-30

Statwolf ha Intune e sta per avviare i lavori di configurazione. Questa voce raccoglie cosa chiedere all'IT perché l'app si possa distribuire senza intoppi; il lavoro sul repo (pacchetto, firma, pipeline di rilascio) parte solo quando la voce diventa prioritaria. Le indicazioni su Intune e Defender sono generali: vanno verificate con chi configura le policy di Statwolf.

### Lavoro sul repo (feature future, un branch ciascuna)
- Configurazione di `electron-builder` con target NSIS (l'unico che `electron-updater` aggiorna in automatico su Windows), includendo `plugin/` e `config/` (ADR 0003), più aggiornamento automatico.
- Pipeline su GitHub Actions (runner Windows): a ogni tag `v*` build, firma e pubblicazione.
- Canale di pubblicazione degli aggiornamenti: web server intranet o Azure Blob. Sconsigliate le release di un repo GitHub privato (richiedono un token su ogni PC).

### Checklist per l'IT
1. **Chi gestisce gli aggiornamenti.** Consigliato per partire: Intune installa una volta l'installer NSIS come app Win32 (`.intunewin`, installazione silenziosa `/S`, comportamento "User", installazione per utente) e poi l'app si aggiorna da sola; la regola di rilevamento controlla solo l'esistenza dell'app, non la versione (altrimenti reinstallazioni in loop). Alternativa: installazione per macchina, un pacchetto Intune per ogni rilascio, aggiornamento automatico disattivato.
2. **Policy di sicurezza.** AppLocker/WDAC: le regole predefinite bloccano gli eseguibili fuori da `Program Files` e `Windows`, quindi serve una regola sull'editore della firma. Regole ASR di Defender (eseguibili poco diffusi o recenti): eccezione basata sulla firma. SmartScreen: da provare sul PC pilota.
3. **Rete e proxy.** Raggiungibili `api.anthropic.com`, `app.asana.com`, il server degli aggiornamenti e, in futuro, i servizi intranet del router.
4. **Entra/Azure, nella stessa finestra di lavoro.** App registration per il login M365 (B3): pubblica, tenant singolo, accesso da client pubblico abilitato, redirect `http://localhost`, permesso `User.Read`; servono client id e tenant id. Account Azure Trusted Signing per la firma del codice, con l'identità usata dalla pipeline.
5. **Pilota.** 2-3 PC in un gruppo Intune dedicato: installazione, primo avvio, aggiornamento automatico, comportamento sotto le policy reali.

### Prerequisiti
- Firma del codice: Azure Trusted Signing (supportato da `electron-builder`) oppure certificato OV/EV. Se servisse anche macOS: Apple Developer Program e notarizzazione.

Riferimenti: [electron-builder, aggiornamento automatico](https://www.electron.build/docs/features/auto-update), [electron-builder, firma su Windows](https://electron.build/code-signing-win).

## B5 · Inserimento manuale delle attività

Stato: in attesa · Priorità: da decidere · Registrata: 2026-10-30

Alcuni colleghi preferiscono inserire le attività a mano, come nel vecchio Monitor progetti (artefatto su claude.ai), invece di scrivere il diario e farle ricavare all'LLM. Richiesta candidata al percorso leggero.

Richiesta da passare a `/feature`:

```
Aggiungere nella vista Progetti un inserimento manuale rapido delle attività, alternativo al diario: titolo (anche più righe incollate, una attività per riga), progetto PRJ, settimana (predefinita quella corrente), durata, fatta o da fare. Le attività manuali entrano nello stesso flusso di revisione e invio ad Asana di quelle ricavate dal diario, ma vanno distinte come manuali (origine registrata, llm_original vuoto) per non sporcare il dataset delle proposte LLM. Nessuna chiamata LLM.
```

### Funzioni da tracker presenti nell'artefatto, da sottoporre al team
Da valutare una per una (ciascuna sarebbe una feature a sé), chiedendosi prima se l'app debba diventare anche un tracker o restare un registro di lavoro:

- Vista "Oggi": scadute, in scadenza oggi, attività con la stella, in attesa di colleghi o esterni.
- Scadenze e priorità (campo Priorità di Asana) sulle attività da fare; flag di emergenza.
- Assegnazione a colleghi (elenco del team su Asana) e attività "con" colleghi o esterni.
- Riallineamento con Asana dopo l'invio: completamento, scadenza e testo modificati nell'app arrivano su Asana.
- Importazione da Asana delle proprie sottoattività della settimana e chiusura automatica di quelle completate lì.
- Riporto delle attività aperte al task padre della settimana corrente.
- Creazione di incidenti sulla board Incidenti di Asana.
- Stato dei progetti (nei tempi, da tenere d'occhio, bloccato), archiviazione ed eliminazione.
- Report per progetto e periodo: copia come testo, HTML, Markdown, CSV.
- Bacheca dei feedback del team.
- Ripristino da backup (oggi c'è solo l'export), notifiche, scelta del tema.

Vantaggi strutturali dell'artefatto da tenere presenti: nessuna installazione (vedi B4 e discussione sulla PWA) e accesso ad Asana tramite connettore senza token (vedi B2).

## B6 · `/diario` da Claude Code e dalla chat di Claude

Stato: analizzato, da decidere · Priorità: da decidere · Registrata: 2026-10-30

Obiettivo: da una sessione di Claude Code (terminale) o da una chat di Claude nell'app desktop, scrivere `/diario …` e interagire con il diario senza aprire l'app: aggiungere una nota alla voce di oggi, chiedere cosa c'è da inviare ad Asana, rileggere la settimana.

### Come si realizza
- **Un server MCP del diario** (Node, locale, stdio). MCP è uno standard aperto: lo stesso server funziona con Claude Code, con l'app desktop di Claude e con altri client compatibili (principio 7: nessun legame con un solo fornitore). Strumenti indicativi: `diario_aggiungi` (testo alla voce di un giorno, predefinito oggi), `diario_leggi` (voci di un periodo), `attivita_da_rivedere`, `obiettivi`.
- **Un comando `/diario`** come skill che usa quegli strumenti.
- **Un plugin** che impacchetta server MCP e skill, installabile sia in Claude Code sia nell'app desktop (Cowork), così il collega non configura nulla a mano.
- Limite: dalla chat web di claude.ai il PC del dipendente non è raggiungibile (i dati sono locali). Funziona dall'app desktop e da Claude Code.

### Il punto critico: due programmi sullo stesso database
Lo storage è `sql.js`: l'app tiene il database in memoria e riscrive l'intero file a ogni modifica. Se anche il server MCP scrivesse il file, l'ultimo a salvare cancellerebbe le modifiche dell'altro. Opzioni:
1. **Casella di arrivo (consigliata per partire).** Il server MCP non tocca il database: scrive le note in una cartella `inbox/` (un file JSON per nota). L'app le importa all'avvio e mentre è aperta. Funziona anche ad app chiusa, nessun conflitto. Le letture usano l'ultima copia salvata del database (coerente grazie alla scrittura atomica, al più un po' indietro).
2. **API locale dell'app.** L'app aperta espone un'interfaccia su `localhost` protetta da un token, e il server MCP passa da lì: un solo programma scrive, letture sempre aggiornate. Richiede l'app aperta.
3. **Database multiprocesso** (`better-sqlite3` con WAL): modulo nativo da ricompilare per sistema, contro l'ADR 0001. Sconsigliata.

### Caso d'uso di maggior valore
In Claude Code, `/diario` a fine sessione: Claude conosce già cosa è stato fatto (commit, file toccati, discussione) e scrive una bozza di voce del diario, che il dipendente rilegge prima di salvarla.

### Privacy
Quello che passa da `/diario` entra nella conversazione con Claude e resta nella sua cronologia. Gli strumenti di lettura devono restituire solo quanto richiesto (es. un giorno o una settimana), non l'intero diario.

Richiesta da passare a `/feature` (prima iterazione, opzione 1):

```
Aggiungere un server MCP locale del diario e un comando /diario utilizzabili da Claude Code e dall'app desktop di Claude, impacchettati come plugin. Prima iterazione: aggiungere testo alla voce di un giorno (predefinito oggi) tramite una casella di arrivo (cartella inbox/ con un file JSON per nota) che l'app importa all'avvio e mentre è aperta, senza che il server MCP scriva mai sul database; lettura in sola lettura delle voci di un periodo e delle attività da rivedere. In Claude Code, /diario senza argomenti propone una bozza di voce a partire da quanto fatto nella sessione, da confermare prima del salvataggio.
```
