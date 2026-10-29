// Compiti LLM: il compito ping e la forma di tutti i compiti. Senza rete.
'use strict';
const assert = require('assert');
const { TASKS } = require('../src/main/llm/tasks');

const p = TASKS.ping;
assert.ok(p, 'compito ping presente');
assert.strictEqual(p.name, 'ping');
assert.strictEqual(p.label, 'Prova di collegamento');

// Schema: un solo campo ok booleano, obbligatorio.
assert.strictEqual(p.schema.type, 'object');
assert.strictEqual(p.schema.properties.ok.type, 'boolean');
assert.deepStrictEqual(p.schema.required, ['ok']);

// maxTokens basso.
assert.ok(Number.isInteger(p.maxTokens) && p.maxTokens > 0 && p.maxTokens <= 100);

// clean: output valido e output rotto.
assert.deepStrictEqual(p.clean({ ok: true }), { ok: true });
assert.deepStrictEqual(p.clean({ ok: false }), { ok: false });
for (const bad of [{}, null, undefined, { ok: 'true' }, { ok: 1 }, 'x']) {
  assert.deepStrictEqual(p.clean(bad), { ok: false });
}

// Il prompt non contiene dati del diario.
assert.strictEqual(typeof p.buildUser({}), 'string');

// I compiti esistenti restano al loro posto, senza maxTokens proprio.
for (const n of ['extractTasks', 'summarizeDay', 'reviewGoals']) {
  const t = TASKS[n];
  assert.ok(t && t.schema && typeof t.clean === 'function' && t.toolName, n);
  assert.strictEqual(t.maxTokens, undefined, n);
}

console.log('tasks ok');
