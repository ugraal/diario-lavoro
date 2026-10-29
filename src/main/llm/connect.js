// connect(compito): risolve endpoint e modello dalla configurazione (file + settings), costruisce la
// richiesta da tasks.js, chiama il plugin endpoint, applica clean e scrive SEMPRE una riga in llm_runs
// tramite logRun, anche in caso di errore. Il plugin non vede mai logRun né lo store.
// Non dipende da Electron.
'use strict';
const { TASKS } = require('./tasks');
const { loadLlmConfig, resolveRoutes } = require('./config');
const { LLM_ERROR_CODES } = require('../contracts/endpoint');

const DEFAULT_MAX_TOKENS = 4096;

/**
 * @param {{ configFile: string, pluginDir: string, secrets: object, logRun: (row: object) => void,
 *           getSettingsRoutes?: () => object, tasks?: object }} o
 * @returns {{ connect: (task: string) => object, routes: () => object, info: () => object }}
 */
function createConnector({ configFile, pluginDir, secrets, logRun, getSettingsRoutes, tasks = TASKS }) {
  const taskNames = Object.keys(tasks);
  const getSettings = getSettingsRoutes || (() => ({}));
  const log = (row) => logRun(row);

  // La configurazione si legge una volta sola; se non è valida l'errore si conserva.
  let loaded = null;
  let loadError = null;
  try {
    loaded = loadLlmConfig(configFile, {
      taskNames, pluginDir, secrets,
      secretNames: typeof secrets.names === 'function' ? secrets.names() : [],
    });
  } catch (e) { loadError = e; }

  const resolve = () => resolveRoutes(loaded.config, getSettings(), taskNames);

  function routes() {
    return loadError ? {} : resolve().routes;
  }

  function info() {
    if (loadError) return { label: '', endpoint: '', error: loadError.message, warnings: [] };
    const { routes: r, warnings } = resolve();
    const first = r.extractTasks || Object.values(r)[0];
    const ep = first ? loaded.endpoints[first.endpoint] : null;
    return { label: ep ? ep.describe().label : '', endpoint: first ? first.endpoint : '', error: null, warnings };
  }

  function connect(task) {
    if (loadError) throw loadError;
    const def = tasks[task];
    if (!def) throw new Error('Compito sconosciuto: ' + task);
    const route = resolve().routes[task];
    if (!route) {
      const e = new Error(`Configurazione LLM non valida: nessuna rotta per il compito "${task}"`);
      e.code = 'config';
      throw e;
    }
    const endpointName = route.endpoint;
    const model = route.model;
    const endpoint = loaded.endpoints[endpointName];
    const epInfo = endpoint.describe();

    async function run(input, ctx = {}) {
      const req = {
        system: def.system, user: def.buildUser(input), schema: def.schema, toolName: def.toolName,
        description: def.description, model, maxTokens: def.maxTokens || DEFAULT_MAX_TOKENS,
      };
      const base = { task, provider: endpointName, model, entryId: ctx.entryId, input: { system: req.system, user: req.user } };
      const t0 = Date.now();
      let res = null;
      try {
        res = await endpoint.runStructured(req);
        const output = res && res.output;
        const cleaned = def.clean(output || {}, input);
        log({ ...base, output: { raw: output, usage: (res && res.usage) || null }, ms: Date.now() - t0 });
        return cleaned;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        // Se l'output era già arrivato (errore di clean) si conserva in llm_runs.
        const out = res ? { raw: res.output, usage: res.usage || null } : null;
        try { log({ ...base, output: out, error: String(e.message || e), ms: Date.now() - t0 }); } catch (_) { /* non nascondo l'errore originale */ }
        const code = LLM_ERROR_CODES.includes(e.code) ? e.code : 'unknown';
        e.llm = { task, endpoint: endpointName, model, info: epInfo, code };
        throw e;
      }
    }
    return { task, endpoint: endpointName, model, info: epInfo, run };
  }

  return { connect, routes, info };
}

module.exports = { createConnector };
