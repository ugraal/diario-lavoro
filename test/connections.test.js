// Contratto IConnection su ogni cartella di plugin/connection/ e sulla fixture (A5, CA6). Senza rete.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { checkConnection } = require('./contract/connection');
const { createConnection } = require('../src/main/plugins');

const roots = [path.join(__dirname, '..', 'plugin'), path.join(__dirname, 'fixtures', 'plugin')];
let n = 0;
for (const base of roots) {
  const dir = path.join(base, 'connection');
  for (const name of fs.readdirSync(dir)) {
    if (!fs.existsSync(path.join(dir, name, 'App.js'))) continue;
    checkConnection((opts, deps) => createConnection(name, opts, deps, base));
    n++;
  }
}
assert.ok(n >= 2, 'attesi almeno https e fake');

// https: valori predefiniti, opzioni, delega a globalThis.fetch.
const base = roots[0];
const c = createConnection('https', undefined, { secrets: {} }, base);
assert.strictEqual(c.kind, 'https');
assert.strictEqual(c.timeoutMs, 600000);
assert.strictEqual(c.maxRetries, 2);
assert.strictEqual(c.baseURL('https://api.anthropic.com'), 'https://api.anthropic.com');
const c2 = createConnection('https', { timeoutMs: 5000, maxRetries: 0 }, { secrets: {} }, base);
assert.strictEqual(c2.timeoutMs, 5000);
assert.strictEqual(c2.maxRetries, 0);
for (const bad of [{ timeoutMs: 0 }, { timeoutMs: '5' }, { maxRetries: -1 }, { maxRetries: 1.5 }]) {
  assert.throws(() => createConnection('https', bad, { secrets: {} }, base), (e) => e.code === 'plugin_options', JSON.stringify(bad));
}

const orig = globalThis.fetch;
(async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return { ok: true, tag: 'finto' }; };
  try {
    const init = { method: 'POST' };
    const r = await c.fetch('https://x.test/a', init);
    assert.strictEqual(r.tag, 'finto');
    assert.deepStrictEqual(calls, [['https://x.test/a', init]]);
  } finally {
    globalThis.fetch = orig;
  }
  console.log('connections.test.js ok');
})().catch((e) => { globalThis.fetch = orig; console.error(e); process.exit(1); });
