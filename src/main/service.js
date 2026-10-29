// Orchestrazione: analisi del diario e invio ad Asana. Non dipende da Electron,
// così si può provare da Node senza interfaccia.
'use strict';
const { weekOfYmd } = require('../shared/util');
const { pickParent } = require('./asana');
const { describeLlmError } = require('./llm/errors');

class Service {
  // connector: risultato di createConnector (connect, routes, info)
  constructor({ store, connector, asana, secrets }) {
    this.store = store; this.connector = connector; this.asana = asana; this.secrets = secrets;
    this.analyzing = new Set(); this.sending = new Set();
  }

  async prjOptions(opts) {
    if (!this.secrets.get('asana')) return { source: 'fallback', options: require('./asana-config').prjFallback };
    return this.asana.prjOptions(opts);
  }

  // Avanzamento di ogni obiettivo "prima" di questa voce, così rianalizzare la stessa voce non conta due volte.
  goalsBefore(entryId) {
    return this.store.activeGoals().map((g) => {
      const ups = this.store.goalUpdates(g.id);
      if (!ups.some((u) => u.entry_id === entryId)) return g;
      const prev = ups.find((u) => u.entry_id !== entryId);
      return Object.assign({}, g, { progress: prev ? prev.progress : 0 });
    });
  }

  async analyzeEntry(id) {
    const entry = this.store.getEntry(id);
    if (!entry) throw new Error('Voce di diario non trovata');
    if (!entry.text.trim()) throw new Error('La voce è vuota');
    if (this.analyzing.has(id)) throw new Error('Analisi già in corso');
    this.analyzing.add(id);
    try {
      const prj = await this.prjOptions();
      const goals = this.goalsBefore(id);
      const base = { date: entry.date, text: entry.text };
      const ctx = { entryId: id };
      const [rt, rs, rg] = await Promise.allSettled([
        this.runTask('extractTasks', Object.assign({ prjOptions: prj.options, myProjects: this.store.getSetting('myProjects', []) }, base), ctx),
        this.runTask('summarizeDay', base, ctx),
        this.runTask('reviewGoals', Object.assign({ goals }, base), ctx),
      ]);
      const week = weekOfYmd(entry.date);
      const parts = {};
      if (rt.status === 'fulfilled') parts.tasks = rt.value.map((t) => Object.assign({}, t, { week, original: Object.assign({ week }, t) }));
      if (rs.status === 'fulfilled') parts.summary = rs.value;
      if (rg.status === 'fulfilled') parts.goals = rg.value;
      const errors = [['attività', rt], ['bilancio', rs], ['obiettivi', rg]].filter(([, r]) => r.status === 'rejected').map(([n, r]) => n + ': ' + describeLlmError(r.reason));
      if (errors.length === 3) throw new Error(errors[0].replace(/^attività: /, ''));
      this.store.applyAnalysis(id, parts);
      return { entry: this.store.getEntry(id), errors };
    } finally { this.analyzing.delete(id); }
  }

  async syncTask(id, forced) {
    let t = this.store.getTask(id);
    if (!t) throw new Error('Attività non trovata');
    if (t.status === 'synced') return t;
    if (this.sending.has(id)) return t;
    const fail = (msg) => this.store.updateTask(id, { status: 'error', error: msg });
    if (!t.title.trim()) return fail('Il titolo è vuoto');
    if (!t.prj_gid) return fail('Scegli il progetto PRJ');
    if (!/^W\d{1,2}$/i.test(t.week)) return fail('Settimana non valida: usa il formato W44');
    const wasUncertain = t.status === 'uncertain';
    let parent = forced || (wasUncertain && t.asana_parent_gid ? { gid: t.asana_parent_gid, name: t.asana_parent_name || '' } : null);
    let stage = 'read';
    this.sending.add(id);
    this.store.updateTask(id, { status: 'sending', error: '' });
    try {
      if (!parent) {
        const cands = await this.asana.findParents(t.prj_gid, t.week.toUpperCase());
        if (!cands.length) {
          const prj = (await this.prjOptions()).options.find((o) => o.gid === t.prj_gid);
          return fail('Nessun task padre ' + t.week.toUpperCase() + ' trovato in PRIORITÀ 2026 per ' + (prj ? prj.name : 'questo progetto'));
        }
        parent = pickParent(cands);
        if (!parent) return this.store.updateTask(id, { status: 'pick', error: '', candidates: cands });
      }
      if (wasUncertain) {
        const hit = (await this.asana.subtasks(parent.gid)).find((s) => s.name === t.title);
        if (hit) return this.store.updateTask(id, { status: 'synced', asana_gid: hit.gid, asana_url: hit.permalink_url || '', asana_parent_gid: parent.gid, asana_parent_name: parent.name, candidates: null, error: '' });
      }
      const entry = t.entry_id ? this.store.getEntry(t.entry_id) : null;
      stage = 'write';
      const c = await this.asana.createSubtask(parent.gid, {
        name: t.title,
        notes: 'Creata da Diario di lavoro' + (entry ? ' (voce del ' + entry.date + ')' : ''),
        dueOn: entry ? entry.date : '',
        minutes: t.minutes,
        completed: t.done,
      });
      if (!c || !c.gid) throw Object.assign(new Error('Sottoattività non creata'), { code: 'server' });
      return this.store.updateTask(id, { status: 'synced', asana_gid: c.gid, asana_url: c.permalink_url || '', asana_parent_gid: parent.gid, asana_parent_name: parent.name, candidates: null, error: '' });
    } catch (e) {
      const uncertain = stage === 'write' && ['network', 'server'].includes(e.code);
      if (uncertain) return this.store.updateTask(id, { status: 'uncertain', error: 'Esito incerto: riprova, prima controllo su Asana', asana_parent_gid: parent.gid, asana_parent_name: parent.name });
      return fail(e.message || String(e));
    } finally { this.sending.delete(id); }
  }

  // connect può lanciare subito (configurazione non valida): l'errore diventa un rifiuto come gli altri.
  async runTask(name, input, ctx) { return this.connector.connect(name).run(input, ctx); }

  // Prova del modello: compito ping tramite connect (scrive una riga in llm_runs con task 'ping' e senza voce di diario).
  // Messaggi d'errore in italiano dai codici normalizzati. Risponde true se il modello ha risposto.
  async testLlm() {
    try { await this.runTask('ping', {}, {}); return true; } catch (e) { throw new Error(describeLlmError(e)); }
  }

  // Cambia il modello personale: in settings.routes si scrive solo { model } per ogni compito (ping compreso),
  // senza endpoint né provider: l'endpoint resta quello del file di configurazione.
  setModel(model) {
    model = String(model || '').trim();
    if (!model) throw new Error('Indica un modello');
    const routes = {};
    Object.keys(this.routes()).forEach((k) => { routes[k] = { model }; });
    this.store.setSetting('routes', routes);
    return model;
  }

  // Modello e endpoint effettivi, letti dalla configurazione risolta.
  llmInfo() {
    const r = this.routes();
    return Object.assign({ model: (r.extractTasks || {}).model || '' }, this.connector.info());
  }

  routes() { return this.connector.routes(); }
}

module.exports = { Service };
