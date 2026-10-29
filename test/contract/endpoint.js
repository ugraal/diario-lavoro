// Test di contratto IEndpoint: parte comune (membri, describe, errori normalizzati).
// I casi con risposte finte (successo, errori HTTP, no_key, trasporto) si aggiungono in A6
// con le fixture del plugin.
'use strict';
const assert = require('assert');
const { ENDPOINT_MEMBERS, LLM_ERROR_CODES } = require('../../src/main/contracts/endpoint');
const { checkMembers } = require('./helpers');

function checkEndpointShape(ep, { secretValue = 'sk-SEGRETO-TEST' } = {}) {
  checkMembers(ep, ENDPOINT_MEMBERS, 'IEndpoint');
  const i = ep.describe();
  for (const k of ['label', 'service', 'keyLabel']) {
    assert.ok(typeof i[k] === 'string' && i[k], `describe(): manca "${k}"`);
  }
  assert.ok(!JSON.stringify(i).includes(secretValue), 'describe() non deve contenere segreti');
}

// Un errore del plugin deve essere un Error con un code valido.
function assertNormalizedError(e) {
  assert.ok(e instanceof Error, 'errore non normalizzato: non è un Error');
  assert.ok(LLM_ERROR_CODES.includes(e.code), `code non valido: ${e.code}`);
  return true;
}

module.exports = { checkEndpointShape, assertNormalizedError };
