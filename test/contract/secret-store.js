// Test di contratto ISecretStore: si esegue su ogni implementazione, partendo da un archivio vuoto
// e senza variabili d'ambiente per i nomi noti.
'use strict';
const assert = require('assert');
const { SECRET_STORE_MEMBERS } = require('../../src/main/contracts/secret-store');
const { checkMembers } = require('./helpers');

function checkSecretStore(store) {
  checkMembers(store, SECRET_STORE_MEMBERS, 'ISecretStore');
  const names = store.names();
  assert.ok(Array.isArray(names) && names.includes('anthropic') && names.includes('asana'));
  for (const n of ['anthropic', 'asana']) {
    assert.strictEqual(store.get(n), '', 'assente: stringa vuota');
    store.set(n, 'valore-segreto-1');
    assert.strictEqual(store.get(n), 'valore-segreto-1');
    assert.ok(!JSON.stringify(store.status()).includes('valore-segreto-1'), 'status() non deve contenere il valore');
    store.set(n, '');
    assert.strictEqual(store.get(n), '', 'set vuoto cancella');
  }
}

module.exports = { checkSecretStore };
