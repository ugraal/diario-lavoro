// Asana legge il token solo da un ISecretStore (vista in sola lettura), mai da env, safeStorage o file.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Asana } = require('../src/main/asana');
const { readOnlyView } = require('../src/main/contracts/secret-store');

(async () => {
  const letti = [];
  let valore = 'TOK1';
  const store = { get: (n) => { letti.push(n); return n === 'asana' ? valore : 'altro'; }, set() {}, names: () => ['asana', 'anthropic'] };
  const auth = [];
  const fetchMock = async (url, o) => { auth.push(o.headers.Authorization); return { ok: true, status: 200, json: async () => ({ data: { gid: '1', name: 'Io', workspaces: [{ gid: 'w' }] } }) }; };
  const asana = new Asana({ secrets: readOnlyView(store, ['asana']), secretName: 'asana', fetch: fetchMock });

  assert.strictEqual(asana.hasToken(), true);
  await asana.req('GET', '/users/me');
  assert.strictEqual(auth[0], 'Bearer TOK1');
  assert.ok(letti.every((n) => n === 'asana'), 'legge solo il segreto asana');

  valore = '';
  assert.strictEqual(asana.hasToken(), false);
  await assert.rejects(() => asana.req('GET', '/users/me'), (e) => e.code === 'no_token');
  assert.strictEqual(auth.length, 1, 'senza token nessuna chiamata di rete');

  // la vista non dà accesso ad altri nomi
  assert.throws(() => asana.secrets.get('anthropic'), (e) => e.code === 'secret_denied');

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'asana.js'), 'utf8');
  for (const w of ['process.env', 'safeStorage', 'secrets.json']) assert.ok(!src.includes(w), 'asana.js non usa ' + w);
  console.log('asana-secret.test.js ok');
})().catch((e) => { console.error(e); process.exit(1); });
