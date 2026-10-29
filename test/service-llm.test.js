// Prova del modello e settings:model (A10): logica in Service, LLM finto.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createConnector } = require('../src/main/llm/connect');
const { Service } = require('../src/main/service');

const info = { service: 'Anthropic', keyLabel: 'API key Anthropic' };
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svcllm-'));
  const cfg = path.join(dir, 'llm.json');
  const route = { endpoint: 'anthropic', model: 'file-model' };
  fs.writeFileSync(cfg, JSON.stringify({
    version: 1, connections: { c: { plugin: 'fake', options: {} } },
    endpoints: { anthropic: { plugin: 'scripted', connection: 'c', secret: 'anthropic', options: {} } },
    routes: { extractTasks: route, summarizeDay: route, reviewGoals: route },
  }));
  const settings = {};
  const rows = [];
  const store = { getSetting: (k, d) => (k in settings ? settings[k] : d), setSetting: (k, v) => { settings[k] = v; } };
  const connector = createConnector({
    configFile: cfg, pluginDir: path.join(__dirname, 'fixtures', 'plugin'),
    secrets: { get: () => 'k', names: () => ['anthropic'] }, logRun: (r) => rows.push(r),
    getSettingsRoutes: () => store.getSetting('routes', {}),
  });
  const svc = new Service({ store, connector, asana: { hasToken: () => true } });

  // Chiave valida
  const seen = [];
  globalThis.__scriptedEndpoint = async (req) => { seen.push(req.model); return { output: { ok: true } }; };
  assert.strictEqual(await svc.testLlm(), true);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].task, 'ping');
  assert.strictEqual(rows[0].provider, 'anthropic');
  assert.ok(!rows[0].entryId && !rows[0].error);
  assert.strictEqual(seen[0], 'file-model');

  // Chiave mancante e non valida: messaggi di oggi, riga con errore
  for (const [code, msg] of [['no_key', 'API key Anthropic mancante: impostala nelle Impostazioni'], ['bad_key', 'API key Anthropic non valida']]) {
    globalThis.__scriptedEndpoint = async () => { throw Object.assign(new Error('tecnico'), { code, llm: { code, info } }); };
    await assert.rejects(svc.testLlm(), { message: msg });
    const r = rows[rows.length - 1];
    assert.ok(r.task === 'ping' && !r.entryId && r.error);
  }

  // setModel: solo { model } per ogni compito, ping compreso
  globalThis.__scriptedEndpoint = async (req) => { seen.push(req.model); return { output: { ok: true } }; };
  assert.strictEqual(svc.setModel('  mio-modello '), 'mio-modello');
  const keys = Object.keys(settings.routes).sort();
  assert.deepStrictEqual(keys, ['extractTasks', 'ping', 'reviewGoals', 'summarizeDay']);
  for (const k of keys) assert.deepStrictEqual(settings.routes[k], { model: 'mio-modello' });
  assert.throws(() => svc.setModel('  '), /Indica un modello/);
  assert.strictEqual(svc.llmInfo().model, 'mio-modello');
  await svc.testLlm();
  assert.strictEqual(seen[seen.length - 1], 'mio-modello');

  // Vecchio formato { provider, model } senza voce ping: la prova usa il modello personale
  settings.routes = { extractTasks: { provider: 'anthropic', model: 'x' }, summarizeDay: { provider: 'anthropic', model: 'x' }, reviewGoals: { provider: 'anthropic', model: 'x' } };
  await svc.testLlm();
  assert.strictEqual(seen[seen.length - 1], 'x');
  assert.strictEqual(rows[rows.length - 1].model, 'x');
  console.log('OK: prova del modello e settings:model');
}
main().catch((e) => { console.error(e); process.exit(1); });
