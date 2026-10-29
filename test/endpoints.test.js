// Contratto IEndpoint su ogni cartella di plugin/endpoint/ (A6). Senza rete: il fetch della
// connessione è finto e risponde con le fixture di test/fixtures/endpoint-responses/<nome>.js.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { checkEndpointShape, assertNormalizedError } = require('./contract/endpoint');
const { createEndpoint } = require('../src/main/plugins');

const SECRET = 'sk-SEGRETO-TEST';
const base = path.join(__dirname, '..', 'plugin');
const REQ = {
  model: 'claude-test', system: 'sistema', user: 'utente', schema: { type: 'object', properties: {} },
  toolName: 'out', description: 'd', maxTokens: 100,
};

function fakeConnection(handler) {
  const calls = [];
  return {
    calls,
    kind: 'fake',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const r = handler();
      return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
    },
    baseURL: (d) => d,
    timeoutMs: 5000,
    maxRetries: 0,
    describe: () => ({ kind: 'fake', detail: 'prova' }),
  };
}

async function main() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('il trasporto deve passare da connection.fetch'); };
  let n = 0;
  try {
    const dir = path.join(base, 'endpoint');
    for (const name of fs.readdirSync(dir)) {
      if (!fs.existsSync(path.join(dir, name, 'App.js'))) continue;
      const fixFile = path.join(__dirname, 'fixtures', 'endpoint-responses', name + '.js');
      assert.ok(fs.existsSync(fixFile), 'manca la fixture delle risposte per l\'endpoint "' + name + '"');
      const fx = require(fixFile);
      const mk = (handler, secret) => {
        const connection = fakeConnection(handler);
        const secrets = { get: () => (secret === undefined ? SECRET : secret) };
        return { connection, ep: createEndpoint(name, {}, { connection, secrets, secretName: 'anthropic' }, base) };
      };

      checkEndpointShape(mk(() => fx.success('out')).ep, { secretValue: SECRET });
      assert.throws(
        () => createEndpoint(name, { x: 1 }, { connection: fakeConnection(() => fx.success('out')), secrets: { get: () => SECRET }, secretName: 'anthropic' }, base),
        (e) => e.code === 'plugin_options');

      // successo
      {
        const { ep, connection } = mk(() => fx.success('out'));
        const r = await ep.runStructured(REQ);
        assert.deepStrictEqual(r.output, fx.OUTPUT);
        assert.deepStrictEqual(r.usage, fx.USAGE);
        assert.strictEqual(typeof fx.keyOf, 'function', 'la fixture deve avere keyOf(init)');
        assert.strictEqual(fx.keyOf(connection.calls[0].init), SECRET, 'la chiave inviata deve essere quella dello store');
      }

      // chiave mancante: nessuna chiamata
      {
        const { ep, connection } = mk(() => fx.success('out'), '');
        await assert.rejects(() => ep.runStructured(REQ), (e) => assertNormalizedError(e) && e.code === 'no_key');
        assert.strictEqual(connection.calls.length, 0);
      }

      // codici d'errore
      const cases = [[401, 'bad_key'], [403, 'forbidden'], [404, 'model_not_found'], [429, 'rate_limit'],
        [500, 'unavailable'], [529, 'unavailable'], [400, 'bad_request']];
      for (const [status, code] of cases) {
        const { ep } = mk(() => fx[status]());
        await assert.rejects(() => ep.runStructured(REQ), (e) => {
          assertNormalizedError(e);
          assert.strictEqual(e.code, code, 'status ' + status);
          assert.strictEqual(e.status, status);
          assert.ok(!e.message.includes(SECRET));
          return true;
        });
      }
      {
        const { ep } = mk(() => fx.noOutput());
        await assert.rejects(() => ep.runStructured(REQ), (e) => assertNormalizedError(e) && e.code === 'no_output');
      }

      // fetch che rifiuta: non raggiungibile
      {
        const { ep } = mk(() => { throw new TypeError('fetch failed'); });
        await assert.rejects(() => ep.runStructured(REQ), (e) => assertNormalizedError(e) && e.code === 'unreachable' && !e.message.includes(SECRET));
      }

      n++;
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(n >= 1, 'atteso almeno un endpoint reale');
  console.log('endpoints.test.js ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
