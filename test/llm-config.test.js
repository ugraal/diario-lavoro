// Configurazione LLM (A7, CA2): file predefinito, validazione con messaggi chiari, merge con settings.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadLlmConfig, resolveRoutes } = require('../src/main/llm/config');
const { TASKS } = require('../src/main/llm/tasks');

const taskNames = Object.keys(TASKS);
const secretNames = ['anthropic', 'asana'];
const appRoot = path.resolve(__dirname, '..');
const pluginDir = path.join(appRoot, 'plugin');
const fixtures = path.join(__dirname, 'fixtures', 'plugin');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llmcfg-'));
const PRE = 'Configurazione LLM non valida (config/llm.json): ';

const base = () => ({
  version: 1,
  connections: { diretta: { plugin: 'https', options: { timeoutMs: 1000, maxRetries: 1 } } },
  endpoints: { anthropic: { plugin: 'anthropic', connection: 'diretta', secret: 'anthropic', options: {} } },
  routes: {
    extractTasks: { endpoint: 'anthropic', model: 'm1' },
    summarizeDay: { endpoint: 'anthropic', model: 'm2' },
    reviewGoals: { endpoint: 'anthropic', model: 'm3' },
  },
});
function write(obj) {
  const f = path.join(tmp, 'c' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1));
  return f;
}
const load = (obj, extra = {}) => loadLlmConfig(write(obj), { taskNames, secretNames, ...extra });
function bad(obj, msg, extra) {
  assert.throws(() => load(obj, extra), (e) => e.code === 'config' && e.message === PRE + msg, `atteso: ${msg}`);
}

// File predefinito: valido, senza "ping", con tutti i plugin reali istanziati.
const def = loadLlmConfig(path.join(appRoot, 'config', 'llm.json'), { taskNames, secretNames, pluginDir });
assert.strictEqual(def.config.routes.ping, undefined);
assert.strictEqual(def.config.connections.diretta.plugin, 'https');
assert.strictEqual(def.config.endpoints.anthropic.plugin, 'anthropic');
assert.strictEqual(typeof def.endpoints.anthropic.runStructured, 'function');
assert.strictEqual(def.connections.diretta.kind, 'https');
for (const t of ['extractTasks', 'summarizeDay', 'reviewGoals']) assert.strictEqual(def.config.routes[t].model, 'claude-sonnet-5-5');

// Errori.
assert.throws(() => loadLlmConfig(path.join(tmp, 'manca.json'), { taskNames, secretNames }),
  (e) => e.code === 'config' && e.message === PRE + 'file non trovato');
assert.throws(() => load('{\n "version": 1,\n "x": \n}'), (e) => e.code === 'config' && e.message.startsWith(PRE + 'JSON non leggibile'));
bad([], 'il contenuto deve essere un oggetto');
bad({ ...base(), extra: 1 }, 'extra: voce sconosciuta (ammesse: version, connections, endpoints, routes)');
bad({ ...base(), version: 2 }, 'version: deve essere 1');
let c = base(); c.endpoints.anthropic.connection = 'nessuna';
bad(c, 'endpoints.anthropic.connection: la connessione "nessuna" non è definita in "connections"');
c = base(); c.routes.summarizeDay.endpoint = 'router';
bad(c, 'routes.summarizeDay.endpoint: l\'endpoint "router" non è definito in "endpoints"');
c = base(); c.endpoints.anthropic.secret = 'boh';
bad(c, 'endpoints.anthropic.secret: il segreto "boh" non è tra quelli noti (anthropic, asana)');
c = base(); c.routes.pong = { endpoint: 'anthropic', model: 'x' };
bad(c, 'routes.pong: compito sconosciuto (noti: extractTasks, summarizeDay, reviewGoals, ping)');
c = base(); c.routes.extractTasks.temperature = 1;
bad(c, 'routes.extractTasks.temperature: campo sconosciuto (ammessi: endpoint, model)');
c = base(); c.endpoints.anthropic.url = 'x';
bad(c, 'endpoints.anthropic.url: campo sconosciuto (ammessi: plugin, connection, secret, options)');
c = base(); c.routes.extractTasks.model = '';
bad(c, 'routes.extractTasks.model: deve essere una stringa non vuota');
c = base(); delete c.routes.reviewGoals;
bad(c, 'routes.reviewGoals: voce mancante');
c = base(); c.connections['../x'] = { plugin: 'https' };
bad(c, 'connections.../x: nome non valido (ammessi solo a-z, 0-9 e -, da 1 a 64 caratteri)');

// Plugin non valido o inesistente e options errate: errore all'avvio, con la voce.
c = base(); c.connections.diretta.plugin = 'nonesiste';
bad(c, 'connections.diretta: Plugin di connessione "nonesiste" non trovato in plugin/connection/', { pluginDir });
c = base(); c.connections.diretta.options = { timeoutMs: -1 };
bad(c, 'connections.diretta: Connessione https: "timeoutMs" deve essere un numero maggiore di zero', { pluginDir });
c = base(); c.endpoints.anthropic.options = { foo: 1 };
bad(c, 'endpoints.anthropic: Endpoint anthropic: opzioni non previste (foo)', { pluginDir });
c = base(); c.endpoints.anthropic.plugin = 'nonesiste';
bad(c, 'endpoints.anthropic: Plugin endpoint "nonesiste" non trovato in plugin/endpoint/', { pluginDir });
// Plugin di fixture: tutti creati all'avvio; uno che non rispetta il contratto emerge subito.
c = base();
c.connections = { diretta: { plugin: 'fake' } };
c.endpoints = { anthropic: { plugin: 'fake', connection: 'diretta', secret: 'anthropic' }, secondo: { plugin: 'fake', connection: 'diretta' } };
const fx = load(c, { pluginDir: fixtures });
assert.deepStrictEqual(Object.keys(fx.endpoints), ['anthropic', 'secondo']);
assert.strictEqual(fx.endpoints.anthropic.deps.secretName, 'anthropic');
assert.strictEqual(fx.endpoints.anthropic.deps.connection, fx.connections.diretta);
// Il segreto non dichiarato non è leggibile dall'endpoint (vista limitata ai nomi autorizzati).
assert.throws(() => fx.endpoints.secondo.deps.secrets.get('anthropic'), (e) => e.code === 'secret_denied');
c.endpoints.secondo.plugin = 'broken';
bad(c, 'endpoints.secondo: Il plugin endpoint "broken" non rispetta IEndpoint: manca "runStructured" (funzione)', { pluginDir: fixtures });

// Merge: file + settings.
const fileCfg = base();
fileCfg.endpoints.altro = { plugin: 'anthropic', connection: 'diretta', secret: 'anthropic' };
let r = resolveRoutes(fileCfg, undefined, taskNames);
assert.deepStrictEqual(r.warnings, []);
assert.deepStrictEqual(r.routes.extractTasks, { endpoint: 'anthropic', model: 'm1' });
assert.deepStrictEqual(r.routes.ping, { endpoint: 'anthropic', model: 'm1' }); // eredita extractTasks
// Campo per campo: a solo model, b solo endpoint.
r = resolveRoutes(fileCfg, { extractTasks: { model: 'x' }, summarizeDay: { endpoint: 'altro' } }, taskNames);
assert.deepStrictEqual(r.routes.extractTasks, { endpoint: 'anthropic', model: 'x' });
assert.deepStrictEqual(r.routes.summarizeDay, { endpoint: 'altro', model: 'm2' });
assert.deepStrictEqual(r.routes.reviewGoals, { endpoint: 'anthropic', model: 'm3' });
assert.deepStrictEqual(r.routes.ping, { endpoint: 'anthropic', model: 'x' }); // ping segue extractTasks
// Ping con voce propria in settings: solo il modello, endpoint ereditato.
r = resolveRoutes(fileCfg, { extractTasks: { model: 'x' }, ping: { model: 'p' } }, taskNames);
assert.deepStrictEqual(r.routes.ping, { endpoint: 'anthropic', model: 'p' });
// Vecchio formato: provider vale come endpoint, anche con endpoint inesistente (avviso).
const old = { extractTasks: { provider: 'anthropic', model: 'x' }, reviewGoals: { provider: 'ollama', model: 'y' } };
const oldCopy = JSON.stringify(old);
r = resolveRoutes(fileCfg, old, taskNames);
assert.deepStrictEqual(r.routes.extractTasks, { endpoint: 'anthropic', model: 'x' });
assert.deepStrictEqual(r.routes.reviewGoals, { endpoint: 'anthropic', model: 'y' });
assert.deepStrictEqual(r.warnings, ['Impostazioni: il compito reviewGoals indica l\'endpoint "ollama", che non esiste. Uso "anthropic"']);
assert.strictEqual(JSON.stringify(old), oldCopy); // nessuna modifica in memoria
// Provider valido nel file, usato come nome endpoint.
r = resolveRoutes(fileCfg, { summarizeDay: { provider: 'altro', model: 'k' } }, taskNames);
assert.deepStrictEqual(r.routes.summarizeDay, { endpoint: 'altro', model: 'k' });
// Campi sconosciuti, compiti sconosciuti e definizioni in settings si ignorano con avviso.
r = resolveRoutes(fileCfg, { extractTasks: { model: 'x', url: 'http://evil' }, nuovo: { model: 'z' } }, taskNames);
assert.strictEqual(r.routes.extractTasks.model, 'x');
assert.strictEqual(r.warnings.length, 2);
assert.strictEqual(r.routes.nuovo, undefined);
// settings.routes non oggetto: ignorato.
assert.deepStrictEqual(resolveRoutes(fileCfg, 'boh', taskNames).routes.extractTasks, { endpoint: 'anthropic', model: 'm1' });
// Con ping nel file, quello vince su extractTasks.
const withPing = base(); withPing.routes.ping = { endpoint: 'anthropic', model: 'pp' };
assert.strictEqual(resolveRoutes(withPing, { extractTasks: { model: 'x' } }, taskNames).routes.ping.model, 'pp');

// Il file su disco non cambia (mai riscritto).
const f = write(base());
const before = fs.readFileSync(f, 'utf8');
loadLlmConfig(f, { taskNames, secretNames, pluginDir });
resolveRoutes(JSON.parse(before), old, taskNames);
assert.strictEqual(fs.readFileSync(f, 'utf8'), before);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('llm-config ok');
