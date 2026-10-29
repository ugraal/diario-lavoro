// Base dei test di contratto (A1): i contratti si caricano, le funzioni di test funzionano
// su implementazioni finte e il runner trova più file.
'use strict';
const assert = require('assert');
const path = require('path');
const { CONNECTION_MEMBERS } = require('../src/main/contracts/connection');
const { ENDPOINT_MEMBERS, LLM_ERROR_CODES } = require('../src/main/contracts/endpoint');
const { SECRET_STORE_MEMBERS, readOnlyView } = require('../src/main/contracts/secret-store');
const { checkConnection } = require('./contract/connection');
const { checkEndpointShape, assertNormalizedError } = require('./contract/endpoint');
const { checkSecretStore } = require('./contract/secret-store');
const { listTests } = require('./run');

// Elenchi dei membri congelati e completi.
assert.ok(Object.isFrozen(CONNECTION_MEMBERS) && Object.isFrozen(ENDPOINT_MEMBERS) && Object.isFrozen(SECRET_STORE_MEMBERS));
assert.deepStrictEqual(Object.keys(ENDPOINT_MEMBERS), ['runStructured', 'describe']);
assert.ok(Object.isFrozen(LLM_ERROR_CODES) && LLM_ERROR_CODES.includes('no_key') && LLM_ERROR_CODES.includes('config'));

// IConnection finta valida.
const fakeConn = (o) => {
  if (o.timeoutMs !== undefined && !(o.timeoutMs > 0)) { const e = new Error('timeoutMs non valido'); e.code = 'plugin_options'; throw e; }
  return { kind: 'fake', fetch: async () => ({}), baseURL: (d) => d, timeoutMs: o.timeoutMs || 1000, maxRetries: 0, describe: () => ({ kind: 'fake', detail: 'prova' }) };
};
checkConnection(fakeConn);
// Una connessione che espone il segreto o manca di un membro viene respinta.
assert.throws(() => checkConnection((o, d) => ({ ...fakeConn(o), describe: () => ({ kind: 'x', detail: d.secrets.get('x') }) })));
assert.throws(() => checkConnection((o) => { const c = fakeConn(o); delete c.fetch; return c; }));

// IEndpoint finto.
checkEndpointShape({ runStructured: async () => ({}), describe: () => ({ label: 'L', service: 'S', keyLabel: 'K' }) });
assert.throws(() => checkEndpointShape({ describe: () => ({}) }));
assertNormalizedError(Object.assign(new Error('x'), { code: 'unreachable' }));
assert.throws(() => assertNormalizedError(Object.assign(new Error('x'), { code: 'boh' })));

// ISecretStore finto in memoria e vista in sola lettura.
const mem = {};
const store = {
  get: (n) => mem[n] || '',
  set: (n, v) => { if (v) mem[n] = v; else delete mem[n]; },
  status: () => ({ encryption: false, anthropic: { set: !!mem.anthropic } }),
  names: () => ['anthropic', 'asana'],
};
checkSecretStore(store);
store.set('anthropic', 'k1'); store.set('asana', 't1');
const view = readOnlyView(store, ['asana']);
assert.strictEqual(view.get('asana'), 't1');
assert.throws(() => view.get('anthropic'), (e) => e.code === 'secret_denied');
assert.strictEqual(view.set, undefined);
assert.strictEqual(view.status, undefined);
assert.ok(Object.isFrozen(view));
assert.throws(() => readOnlyView(store, []).get('asana'), (e) => e.code === 'secret_denied');

// Il runner trova smoke.js e più file *.test.js.
const found = listTests(__dirname).map((f) => path.basename(f));
assert.ok(found.includes('smoke.js') && found.includes('contracts.test.js') && !found.includes('run.js'));

console.log('contracts.test.js ok');
