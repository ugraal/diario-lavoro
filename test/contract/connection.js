// Test di contratto IConnection: si esegue su ogni implementazione (senza rete).
'use strict';
const assert = require('assert');
const { CONNECTION_MEMBERS } = require('../../src/main/contracts/connection');
const { checkMembers } = require('./helpers');

// create: (options, deps) => IConnection. secretValue: segreto finto da non trovare in describe().
function checkConnection(create, { secretValue = 'sk-SEGRETO-TEST' } = {}) {
  const secrets = { get() { return secretValue; } };
  const c = create({}, { secrets });
  checkMembers(c, CONNECTION_MEMBERS, 'IConnection');
  assert.ok(c.timeoutMs > 0, 'timeoutMs deve essere > 0');
  assert.ok(Number.isInteger(c.maxRetries) && c.maxRetries >= 0, 'maxRetries deve essere un intero >= 0');
  const u = c.baseURL('https://x.test');
  assert.strictEqual(typeof u, 'string');
  assert.ok(u.startsWith('https://'), 'baseURL deve restituire https://');
  const d = c.describe();
  assert.strictEqual(typeof d.kind, 'string');
  assert.strictEqual(typeof d.detail, 'string');
  assert.ok(!JSON.stringify(d).includes(secretValue), 'describe() non deve contenere segreti');
  assert.throws(() => create({ timeoutMs: -1 }, { secrets }), (e) => e.code === 'plugin_options');
}

module.exports = { checkConnection };
