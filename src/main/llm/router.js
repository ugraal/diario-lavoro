// Router: per ogni compito sceglie adapter e modello in base alla configurazione,
// esegue la chiamata e la registra in llm_runs (servirà come dataset per il banco di prova).
// Oggi tutto va ad Anthropic; domani qui si aggiungono gli adapter locali e l'escalation.
'use strict';
const { TASKS } = require('./tasks');

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEFAULT_ROUTES = {
  extractTasks: { provider: 'anthropic', model: DEFAULT_MODEL },
  summarizeDay: { provider: 'anthropic', model: DEFAULT_MODEL },
  reviewGoals: { provider: 'anthropic', model: DEFAULT_MODEL },
};

class Router {
  constructor({ adapters, store, getRoutes }) {
    this.adapters = adapters;
    this.store = store;
    this.getRoutes = getRoutes || (() => DEFAULT_ROUTES);
  }
  route(name) {
    const r = Object.assign({}, DEFAULT_ROUTES[name], (this.getRoutes() || {})[name]);
    const adapter = this.adapters[r.provider];
    if (!adapter) throw new Error('Nessun adapter per il provider "' + r.provider + '"');
    return { adapter, model: r.model };
  }
  async run(name, input, ctx = {}) {
    const task = TASKS[name];
    if (!task) throw new Error('Compito sconosciuto: ' + name);
    const { adapter, model } = this.route(name);
    const req = { system: task.system, user: task.buildUser(input), schema: task.schema, toolName: task.toolName, description: task.description, model, maxTokens: 4096 };
    const t0 = Date.now();
    try {
      const { output, usage } = await adapter.runStructured(req);
      const cleaned = task.clean(output || {}, input);
      this.store && this.store.logRun({ task: name, provider: adapter.name, model, entryId: ctx.entryId, input: { system: req.system, user: req.user }, output: { raw: output, usage }, ms: Date.now() - t0 });
      return cleaned;
    } catch (e) {
      this.store && this.store.logRun({ task: name, provider: adapter.name, model, entryId: ctx.entryId, input: { system: req.system, user: req.user }, output: null, error: String(e && e.message || e), ms: Date.now() - t0 });
      throw e;
    }
  }
}

module.exports = { Router, DEFAULT_ROUTES, DEFAULT_MODEL };
