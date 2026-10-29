// Aiuti comuni ai test di contratto.
'use strict';
const assert = require('assert');

// Verifica che obj abbia tutti i membri con il tipo atteso.
function checkMembers(obj, members, label) {
  assert.ok(obj && typeof obj === 'object', `${label}: non è un oggetto`);
  for (const [name, type] of Object.entries(members)) {
    assert.strictEqual(typeof obj[name], type, `${label}: manca "${name}" (${type})`);
  }
}

module.exports = { checkMembers };
