// Compiti LLM: prompt, schema di output e pulizia del risultato.
// Il resto dell'app conosce solo questi nomi, mai il provider.
'use strict';

const BASE = 'Lavori per Statwolf, una società di data science. Analizzi il diario di lavoro di un dipendente, scritto in italiano e in testo libero. Rispondi sempre in italiano. Non inventare nulla che non sia scritto o chiaramente implicato nel testo.';

const extractTasks = {
  name: 'extractTasks',
  toolName: 'registra_attivita',
  description: 'Registra le attività lavorative ricavate dal diario.',
  schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Titolo breve e concreto, con un verbo, max 90 caratteri. Es. "Revisione pipeline dati Diasorin".' },
            minutes: { type: 'integer', description: 'Minuti dedicati, se ricavabili dal testo (es. "tutta la mattina" ≈ 240). 0 se non si può stimare.' },
            prj_gid: { type: 'string', description: 'GID del progetto PRJ dall\'elenco fornito. Stringa vuota se non è chiaro.' },
            done: { type: 'boolean', description: 'true se l\'attività è stata svolta, false se è una cosa ancora da fare.' },
            confidence: { type: 'number', description: 'Confidenza 0-1 sulla correttezza complessiva (titolo, progetto, durata).' },
            evidence: { type: 'string', description: 'Citazione breve e letterale dal diario che giustifica l\'attività.' },
          },
          required: ['title', 'minutes', 'prj_gid', 'done', 'confidence', 'evidence'],
        },
      },
    },
    required: ['tasks'],
  },
  system: BASE + '\n\nCompito: ricava dal diario la lista delle attività lavorative. Una voce per attività distinta: non spezzare troppo (riunioni brevi sullo stesso tema vanno insieme) e non fondere lavori su progetti diversi. Ignora le riflessioni personali che non sono attività. Associa ogni attività a un progetto PRJ solo se il testo lo rende ragionevolmente chiaro; preferisci i "miei progetti" in caso di dubbio. Se il diario indica orari o durate, usali; altrimenti stima solo quando il testo lo permette.',
  buildUser(inp) {
    const mine = new Set(inp.myProjects || []);
    const list = (inp.prjOptions || []).map((o) => '- ' + o.gid + ': ' + o.name + (mine.has(o.gid) ? ' (miei progetti)' : '')).join('\n');
    return 'Data della voce: ' + inp.date + '\n\nProgetti PRJ disponibili (gid: nome):\n' + list + '\n\n<diario>\n' + inp.text + '\n</diario>';
  },
  clean(out, inp) {
    const gids = new Set((inp.prjOptions || []).map((o) => o.gid));
    return (out.tasks || [])
      .filter((t) => t && typeof t.title === 'string' && t.title.trim())
      .map((t) => ({
        title: t.title.trim().slice(0, 200),
        minutes: Math.max(0, Math.min(24 * 60, Math.round(Number(t.minutes) || 0))),
        prj_gid: gids.has(String(t.prj_gid)) ? String(t.prj_gid) : '',
        done: t.done !== false,
        confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0)),
        evidence: String(t.evidence || '').slice(0, 500),
      }));
  },
};

const summarizeDay = {
  name: 'summarizeDay',
  toolName: 'registra_bilancio',
  description: 'Registra il bilancio della giornata.',
  schema: {
    type: 'object',
    properties: {
      strengths: { type: 'array', items: { type: 'string' }, description: 'Punti di forza della giornata, frasi brevi.' },
      improvements: { type: 'array', items: { type: 'string' }, description: 'Spunti di miglioramento concreti, frasi brevi.' },
    },
    required: ['strengths', 'improvements'],
  },
  system: BASE + '\n\nCompito: ricava dal diario i punti di forza e gli spunti di miglioramento della giornata. Al massimo 4 per tipo. Usa ciò che la persona scrive esplicitamente; se il diario non contiene riflessioni, puoi dedurne con prudenza dai fatti, altrimenti lascia le liste vuote. Tono rispettoso e concreto, in seconda persona.',
  buildUser(inp) { return 'Data della voce: ' + inp.date + '\n\n<diario>\n' + inp.text + '\n</diario>'; },
  clean(out) {
    const lst = (a) => (Array.isArray(a) ? a : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 4);
    return { strengths: lst(out.strengths), improvements: lst(out.improvements) };
  },
};

const reviewGoals = {
  name: 'reviewGoals',
  toolName: 'aggiorna_obiettivi',
  description: 'Aggiorna gli obiettivi di miglioramento e propone eventuali nuovi obiettivi.',
  schema: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        description: 'Solo per gli obiettivi su cui il diario dice qualcosa.',
        items: {
          type: 'object',
          properties: {
            goal_id: { type: 'string' },
            progress: { type: 'integer', description: 'Avanzamento stimato 0-100 dopo questa giornata.' },
            trend: { type: 'string', enum: ['up', 'flat', 'down'] },
            evidence: { type: 'string', description: 'Citazione letterale dal diario.' },
            comment: { type: 'string', description: 'Una frase che spiega la valutazione.' },
          },
          required: ['goal_id', 'progress', 'trend', 'evidence', 'comment'],
        },
      },
      proposals: {
        type: 'array',
        description: 'Nuovi obiettivi, solo se emerge un tema ricorrente o importante non coperto da quelli esistenti. Al massimo 2.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Obiettivo breve e verificabile.' },
            description: { type: 'string', description: 'Perché e come misurarlo, 1-2 frasi.' },
            evidence: { type: 'string' },
          },
          required: ['title', 'description', 'evidence'],
        },
      },
    },
    required: ['updates', 'proposals'],
  },
  system: BASE + '\n\nCompito: valuta come la giornata descritta incide sugli obiettivi di miglioramento della persona. Aggiorna solo gli obiettivi su cui il diario porta evidenze; non aggiornare gli altri. L\'avanzamento cambia gradualmente: una singola giornata sposta di pochi punti, salvo evidenze forti. Proponi nuovi obiettivi con parsimonia: niente proposte se gli obiettivi attivi coprono già il tema, e nessuna se gli obiettivi attivi sono già 5 o più.',
  buildUser(inp) {
    const goals = (inp.goals || []).map((g) => '- id ' + g.id + ': "' + g.title + '" (avanzamento ' + g.progress + '/100)' + (g.description ? ' - ' + g.description : '')).join('\n') || '(nessun obiettivo attivo)';
    return 'Data della voce: ' + inp.date + '\n\nObiettivi attivi:\n' + goals + '\n\n<diario>\n' + inp.text + '\n</diario>';
  },
  clean(out, inp) {
    const ids = new Set((inp.goals || []).map((g) => g.id));
    const updates = (out.updates || []).filter((u) => u && ids.has(u.goal_id)).map((u) => ({
      goal_id: u.goal_id,
      progress: Math.max(0, Math.min(100, Math.round(Number(u.progress) || 0))),
      trend: ['up', 'flat', 'down'].includes(u.trend) ? u.trend : 'flat',
      evidence: String(u.evidence || '').slice(0, 500),
      comment: String(u.comment || '').slice(0, 500),
    }));
    const room = Math.max(0, 5 - (inp.goals || []).length);
    const proposals = (out.proposals || []).filter((p) => p && String(p.title || '').trim()).slice(0, Math.min(2, room)).map((p) => ({
      title: String(p.title).trim().slice(0, 160), description: String(p.description || '').trim().slice(0, 500), evidence: String(p.evidence || '').slice(0, 500),
    }));
    return { updates, proposals };
  },
};

// Prova di collegamento: serve a verificare che il modello risponda, senza dati del diario.
const ping = {
  name: 'ping',
  label: 'Prova di collegamento',
  toolName: 'conferma_collegamento',
  description: 'Conferma che il collegamento funziona.',
  maxTokens: 256,
  schema: {
    type: 'object',
    properties: { ok: { type: 'boolean', description: 'Sempre true.' } },
    required: ['ok'],
  },
  system: 'Rispondi sempre in italiano. Compito: conferma che il collegamento funziona chiamando lo strumento con ok = true.',
  buildUser() { return 'Prova di collegamento: chiama lo strumento con ok = true.'; },
  clean(out) { return { ok: !!(out && out.ok === true) }; },
};

const TASKS = { extractTasks, summarizeDay, reviewGoals, ping };
module.exports = { TASKS };
