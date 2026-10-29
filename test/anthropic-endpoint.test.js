// Plugin endpoint anthropic: richiesta identica a quella attesa, chiave, baseURL, retry.
// Usa l'SDK vero con il fetch finto della connessione (A6, CA1).
'use strict';
const assert = require('assert');
const path = require('path');
const { createEndpoint } = require('../src/main/plugins');
const fx = require('./fixtures/endpoint-responses/anthropic');

const base = path.join(__dirname, '..', 'plugin');
const REQ = {
  model: 'claude-sonnet-5-5', system: 'Sei un assistente', user: 'Oggi ho lavorato', toolName: 'save_tasks',
  description: 'Salva', schema: { type: 'object', properties: { a: { type: 'string' } } }, maxTokens: 4096,
};

function mkConn(handler, over) {
  const calls = [];
  return Object.assign({
    calls, kind: 'fake',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const r = handler(calls.length);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
    },
    baseURL: (d) => d, timeoutMs: 5000, maxRetries: 0, describe: () => ({ kind: 'fake', detail: '' }),
  }, over);
}
const header = (init, name) => new Headers(init.headers).get(name);
const mkEp = (conn, key) => createEndpoint('anthropic', {}, { connection: conn, secrets: { get: () => key }, secretName: 'anthropic' }, base);

async function main() {
  // Variabili d'ambiente lette dall'SDK: non devono influire.
  process.env.ANTHROPIC_BASE_URL = 'https://evil.test';
  process.env.ANTHROPIC_AUTH_TOKEN = 'token-ambiente';
  process.env.ANTHROPIC_LOG = 'debug';

  // 1. URL, chiave e corpo del nuovo plugin
  const conn = mkConn(() => fx.success('save_tasks'));
  let key = 'sk-uno';
  const ep = createEndpoint('anthropic', {}, { connection: conn, secrets: { get: () => key }, secretName: 'anthropic' }, base);
  await ep.runStructured(REQ);
  const c0 = conn.calls[0];
  assert.ok(c0.url.startsWith('https://api.anthropic.com/'), c0.url);
  assert.strictEqual(header(c0.init, 'authorization'), 'Bearer sk-uno', 'la chiave è quella dello store, non il token di ambiente');
  const body = JSON.parse(c0.init.body);

  // 2. corpo identico a quello atteso, fissato qui (era quello dell'adapter storico)
  assert.deepStrictEqual(body, {
    model: 'claude-sonnet-5-5',
    max_tokens: 4096,
    system: 'Sei un assistente',
    messages: [{ role: 'user', content: 'Oggi ho lavorato' }],
    tools: [{ name: 'save_tasks', description: 'Salva', input_schema: { type: 'object', properties: { a: { type: 'string' } } } }],
    tool_choice: { type: 'tool', name: 'save_tasks' },
  });
  assert.deepStrictEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'system', 'tool_choice', 'tools']);
  assert.strictEqual(body.max_tokens, 4096);
  assert.deepStrictEqual(body.tool_choice, { type: 'tool', name: 'save_tasks' });
  assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Oggi ho lavorato' }]);

  // 3. la chiave si rilegge a ogni chiamata
  key = 'sk-due';
  await ep.runStructured(REQ);
  assert.strictEqual(header(conn.calls[1].init, 'authorization'), 'Bearer sk-due');

  // 4. baseURL dalla connessione
  const conn3 = mkConn(() => fx.success('save_tasks'), { baseURL: () => 'https://proxy.intranet.test' });
  await mkEp(conn3, 'k').runStructured(REQ);
  assert.ok(conn3.calls[0].url.startsWith('https://proxy.intranet.test/'), conn3.calls[0].url);

  // 5. retry: con maxRetries 2 un 500 viene ritentato due volte (3 chiamate)
  const conn4 = mkConn(() => fx[500](), { maxRetries: 2 });
  await assert.rejects(() => mkEp(conn4, 'k').runStructured(REQ), (e) => e.code === 'unavailable');
  assert.strictEqual(conn4.calls.length, 3);
  const conn5 = mkConn(() => fx[500](), { maxRetries: 0 });
  await assert.rejects(() => mkEp(conn5, 'k').runStructured(REQ));
  assert.strictEqual(conn5.calls.length, 1);

  console.log('anthropic-endpoint.test.js ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
