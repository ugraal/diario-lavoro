// Configurazione LLM aziendale (config/llm.json): lettura, validazione stretta e unione con
// settings.routes. Il file si legge soltanto, non si scrive mai. Non dipende da Electron.
'use strict';
const fs = require('fs');
const { NAME_RE, createConnection, createEndpoint } = require('../plugins');
const { readOnlyView } = require('../contracts/secret-store');

const LABEL = 'config/llm.json';
const TOP_KEYS = ['version', 'connections', 'endpoints', 'routes'];
const CONN_KEYS = ['plugin', 'options'];
const ENDP_KEYS = ['plugin', 'connection', 'secret', 'options'];
const ROUTE_KEYS = ['endpoint', 'model'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function configError(label, where, msg) {
  const e = new Error(`Configurazione LLM non valida (${label}): ${where ? where + ': ' : ''}${msg}`);
  e.code = 'config';
  return e;
}

// Riga dell'errore di JSON.parse, se il messaggio indica una posizione.
function jsonLine(text, err) {
  const m = /line (\d+)/.exec(err.message);
  if (m) return Number(m[1]);
  const p = /position (\d+)/.exec(err.message);
  if (p) return text.slice(0, Number(p[1])).split('\n').length;
  return null;
}

function checkKeys(o, allowed, where, label) {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) throw configError(label, `${where}.${k}`, `campo sconosciuto (ammessi: ${allowed.join(', ')})`);
  }
}

function checkName(v, where, label) {
  if (typeof v !== 'string' || !NAME_RE.test(v)) {
    throw configError(label, where, 'nome non valido (ammessi solo a-z, 0-9 e -, da 1 a 64 caratteri)');
  }
}

/**
 * Legge e valida il file. Con pluginDir crea anche, subito e senza rete, tutte le connessioni e
 * tutti gli endpoint tramite la factory, così gli errori in "options" emergono all'avvio.
 * @param {string} file
 * @param {{ taskNames: string[], secretNames?: string[], secrets?: object, pluginDir?: string, label?: string }} opts
 * @returns {{ config: object, connections: object, endpoints: object }}  Lancia Error con code 'config'.
 */
function loadLlmConfig(file, opts = {}) {
  const label = opts.label || LABEL;
  const taskNames = opts.taskNames || [];
  const secretNames = opts.secretNames || [];

  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    throw configError(label, '', e && e.code === 'ENOENT' ? 'file non trovato' : 'file non leggibile');
  }
  let cfg;
  try { cfg = JSON.parse(text.replace(/^﻿/, '')); } catch (e) {
    const line = jsonLine(text, e);
    throw configError(label, '', line ? `JSON non leggibile alla riga ${line}` : 'JSON non leggibile');
  }
  if (!isObj(cfg)) throw configError(label, '', 'il contenuto deve essere un oggetto');

  // 2. Solo le voci di primo livello previste.
  for (const k of Object.keys(cfg)) {
    if (!TOP_KEYS.includes(k)) throw configError(label, k, `voce sconosciuta (ammesse: ${TOP_KEYS.join(', ')})`);
  }
  if (cfg.version !== 1) throw configError(label, 'version', 'deve essere 1');
  for (const k of ['connections', 'endpoints', 'routes']) {
    if (!isObj(cfg[k])) throw configError(label, k, 'deve essere un oggetto');
  }

  // 3-4. Connessioni.
  for (const [name, c] of Object.entries(cfg.connections)) {
    const w = `connections.${name}`;
    checkName(name, w, label);
    if (!isObj(c)) throw configError(label, w, 'deve essere un oggetto');
    checkKeys(c, CONN_KEYS, w, label);
    checkName(c.plugin, `${w}.plugin`, label);
    if (has(c, 'options') && !isObj(c.options)) throw configError(label, `${w}.options`, 'deve essere un oggetto');
  }
  // 3, 5. Endpoint.
  for (const [name, e] of Object.entries(cfg.endpoints)) {
    const w = `endpoints.${name}`;
    checkName(name, w, label);
    if (!isObj(e)) throw configError(label, w, 'deve essere un oggetto');
    checkKeys(e, ENDP_KEYS, w, label);
    checkName(e.plugin, `${w}.plugin`, label);
    if (typeof e.connection !== 'string' || !has(cfg.connections, e.connection)) {
      throw configError(label, `${w}.connection`, `la connessione "${String(e.connection)}" non è definita in "connections"`);
    }
    if (has(e, 'secret') && !secretNames.includes(e.secret)) {
      throw configError(label, `${w}.secret`, `il segreto "${String(e.secret)}" non è tra quelli noti (${secretNames.join(', ') || 'nessuno'})`);
    }
    if (has(e, 'options') && !isObj(e.options)) throw configError(label, `${w}.options`, 'deve essere un oggetto');
  }
  // 6-7. Rotte.
  for (const [task, r] of Object.entries(cfg.routes)) {
    const w = `routes.${task}`;
    if (!taskNames.includes(task)) throw configError(label, w, `compito sconosciuto (noti: ${taskNames.join(', ')})`);
    if (!isObj(r)) throw configError(label, w, 'deve essere un oggetto');
    checkKeys(r, ROUTE_KEYS, w, label);
    if (typeof r.endpoint !== 'string' || !has(cfg.endpoints, r.endpoint)) {
      throw configError(label, `${w}.endpoint`, `l'endpoint "${String(r.endpoint)}" non è definito in "endpoints"`);
    }
    if (typeof r.model !== 'string' || !r.model.trim()) throw configError(label, `${w}.model`, 'deve essere una stringa non vuota');
  }
  for (const t of taskNames) {
    if (t !== 'ping' && !has(cfg.routes, t)) throw configError(label, `routes.${t}`, 'voce mancante');
  }

  // 8. Istanze di tutti i plugin, tramite factory.
  const connections = {};
  const endpoints = {};
  if (opts.pluginDir) {
    const store = opts.secrets || { get: () => '', names: () => [] };
    for (const [name, c] of Object.entries(cfg.connections)) {
      try {
        connections[name] = createConnection(c.plugin, c.options || {}, { secrets: readOnlyView(store, []) }, opts.pluginDir);
      } catch (e) { throw configError(label, `connections.${name}`, e.message); }
    }
    for (const [name, e] of Object.entries(cfg.endpoints)) {
      const secretName = has(e, 'secret') ? e.secret : null;
      try {
        endpoints[name] = createEndpoint(e.plugin, e.options || {}, {
          connection: connections[e.connection],
          secrets: readOnlyView(store, secretName ? [secretName] : []),
          secretName,
        }, opts.pluginDir);
      } catch (err) { throw configError(label, `endpoints.${name}`, err.message); }
    }
  }
  return { config: cfg, connections, endpoints };
}

/**
 * Unisce le rotte del file con settings.routes, compito per compito e campo per campo.
 * Da settings si leggono solo "model" e la scelta di un endpoint già definito nel file
 * ("endpoint", oppure il vecchio "provider" se "endpoint" manca). Non scrive nulla.
 * "ping" senza voce propria (file o settings) eredita la rotta risolta di extractTasks.
 * @returns {{ routes: Object<string,{endpoint:string,model:string}>, warnings: string[] }}
 */
function resolveRoutes(fileCfg, settingsRoutes, taskNames) {
  const warnings = [];
  const fileRoutes = (fileCfg && fileCfg.routes) || {};
  const endpoints = (fileCfg && fileCfg.endpoints) || {};
  const sr = isObj(settingsRoutes) ? settingsRoutes : {};
  for (const t of Object.keys(sr)) {
    if (!taskNames.includes(t)) warnings.push(`Impostazioni: il compito "${t}" non esiste, lo ignoro`);
  }
  const routes = {};
  // extractTasks per primo, perché ping può ereditarne la rotta.
  const order = ['extractTasks', ...taskNames.filter((t) => t !== 'extractTasks')];
  for (const t of order) {
    if (!taskNames.includes(t)) continue;
    let base = fileRoutes[t];
    if (!base && t === 'ping') base = routes.extractTasks;
    if (!base) continue;
    const r = { endpoint: base.endpoint, model: base.model };
    const s = isObj(sr[t]) ? sr[t] : null;
    if (s) {
      for (const k of Object.keys(s)) {
        if (!['endpoint', 'provider', 'model'].includes(k)) warnings.push(`Impostazioni: il compito ${t} ha il campo "${k}", che non si usa`);
      }
      const ep = has(s, 'endpoint') ? s.endpoint : s.provider;
      if (ep !== undefined) {
        if (typeof ep === 'string' && has(endpoints, ep)) r.endpoint = ep;
        else warnings.push(`Impostazioni: il compito ${t} indica l'endpoint "${String(ep)}", che non esiste. Uso "${r.endpoint}"`);
      }
      if (has(s, 'model')) {
        if (typeof s.model === 'string' && s.model.trim()) r.model = s.model.trim();
        else warnings.push(`Impostazioni: il compito ${t} ha un modello non valido. Uso "${r.model}"`);
      }
    }
    routes[t] = r;
  }
  return { routes, warnings };
}

module.exports = { loadLlmConfig, resolveRoutes, LABEL };
