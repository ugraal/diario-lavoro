// Configurazione LLM non valida (A13): l'app resta utilizzabile, le funzioni LLM danno un messaggio chiaro.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');
const { createConnector } = require('../src/main/llm/connect');
const { Service } = require('../src/main/service');

const pluginDir = path.join(__dirname, 'fixtures', 'plugin');
const secrets = { get: () => 'k', names: () => ['anthropic', 'asana'] };

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svccfg-'));
  const store = await Store.open(path.join(dir, 'diario.sqlite'));
  const created = [];
  const asana = {
    hasToken: () => true,
    prjOptions: async () => ({ source: 'asana', options: [{ gid: 'P1', name: 'Prj' }] }),
    findParents: async () => [{ gid: 'PAR', name: 'Prj W44', planned: true }],
    createSubtask: async (parent, o) => { created.push(o); return { gid: 'S1', permalink_url: 'u' }; },
  };

  const cases = {
    'file mancante': null,
    'JSON non valido': '{ "version": 1, ',
    'voce sbagliata': JSON.stringify({ version: 2, connections: {}, endpoints: {}, routes: {} }),
  };
  for (const [nome, content] of Object.entries(cases)) {
    const cfg = path.join(dir, 'llm-' + nome.length + '.json');
    if (content !== null) fs.writeFileSync(cfg, content);
    const connector = createConnector({ configFile: cfg, pluginDir, secrets, logRun: (r) => store.logRun(r) });
    const svc = new Service({ store, connector, asana });

    // avvio: nessuna eccezione, errore con il nome del file
    const st = svc.llmStatus();
    assert.ok(st.error && st.error.includes('config/llm.json'), nome + ': errore cita il file');
    assert.strictEqual(st.model, '');
    assert.deepStrictEqual(st.warnings, []);
    assert.doesNotThrow(() => svc.llmInfo());

    // funzioni LLM: messaggio chiaro
    const e = store.saveEntry({ date: '2026-10-29', text: 'Lavoro su Prj' });
    await assert.rejects(svc.analyzeEntry(e.id), (err) => err.message.includes('Configurazione LLM non valida') && err.message.includes('config/llm.json'));
    await assert.rejects(svc.testLlm(), /Configurazione LLM non valida.*config\/llm\.json/);
    assert.throws(() => svc.setModel('x'), /Configurazione LLM non valida.*config\/llm\.json/);
    assert.strictEqual(store.getSetting('routes', null), null, 'settings non toccati');
  }

  // diario e attività restano utilizzabili, Asana pure
  const connector = createConnector({ configFile: path.join(dir, 'assente.json'), pluginDir, secrets, logRun: () => {} });
  const svc = new Service({ store, connector, asana });
  const e = store.saveEntry({ date: '2026-10-29', text: 'Testo' });
  assert.strictEqual(store.getEntry(e.id).text, 'Testo');
  store.applyAnalysis(e.id, { tasks: [{ title: 'Attività', minutes: 30, prj_gid: 'P1', done: true, confidence: 1, evidence: '', week: 'W44', original: {} }] });
  const [task] = store.tasksOfEntry(e.id);
  assert.ok(task, 'attività salvata');
  const sent = await svc.syncTask(task.id);
  assert.strictEqual(sent.status, 'synced', sent.error);
  assert.strictEqual(created.length, 1);
  assert.deepStrictEqual((await svc.prjOptions()).options.length, 1);
  // configurazione valida con voci di settings da ignorare: avvisi disponibili, nessun errore
  const okCfg = path.join(dir, 'ok.json');
  const route = { endpoint: 'anthropic', model: 'm' };
  fs.writeFileSync(okCfg, JSON.stringify({
    version: 1, connections: { c: { plugin: 'fake', options: {} } },
    endpoints: { anthropic: { plugin: 'scripted', connection: 'c', secret: 'anthropic', options: {} } },
    routes: { extractTasks: route, summarizeDay: route, reviewGoals: route },
  }));
  const c2 = createConnector({ configFile: okCfg, pluginDir, secrets, logRun: () => {}, getSettingsRoutes: () => ({ inesistente: { model: 'x' } }) });
  const st2 = new Service({ store, connector: c2, asana }).llmStatus();
  assert.strictEqual(st2.error, null);
  assert.strictEqual(st2.model, 'm');
  assert.ok(st2.warnings.some((w) => w.includes('inesistente')));
  console.log('OK: configurazione LLM non valida, resto dell\'app attivo');
}
main().catch((e) => { console.error(e); process.exit(1); });
