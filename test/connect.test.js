// connect (A8, CA13): rotte da file + settings, una riga in llm_runs per ogni chiamata (riuscita o fallita)
// scritta dall'involucro con provider = nome endpoint, endpoint finto assegnato senza toccare src/.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createConnector } = require('../src/main/llm/connect');
const { loadLlmConfig } = require('../src/main/llm/config');
const { TASKS } = require('../src/main/llm/tasks');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-'));
const pluginDir = path.join(__dirname, 'fixtures', 'plugin');
const SECRET = 'sk-SEGRETO-TEST';
const secrets = { get: () => SECRET, names: () => ['anthropic', 'asana'] };

function cfg() {
  return {
    version: 1,
    connections: { c: { plugin: 'fake', options: {} } },
    endpoints: {
      principale: { plugin: 'fake', connection: 'c', secret: 'anthropic', options: { output: { ok: true, tasks: [{ title: ' Prova ', minutes: 30 }] }, usage: { input_tokens: 5 } } },
      locale: { plugin: 'fake', connection: 'c', options: { output: { strengths: ['a'], improvements: ['b'] }, label: 'Modello locale' } },
      guasto: { plugin: 'fake', connection: 'c', options: { failCode: 'rate_limit' } },
      senzacodice: { plugin: 'fake', connection: 'c', options: { failCode: 'inventato' } },
    },
    routes: {
      extractTasks: { endpoint: 'principale', model: 'm1' },
      summarizeDay: { endpoint: 'locale', model: 'm2' },
      reviewGoals: { endpoint: 'guasto', model: 'm3' },
    },
  };
}
function writeCfg(obj) {
  const f = path.join(tmp, 'c' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
}
function make(obj, settings = {}, extra = {}) {
  const rows = [];
  const conn = createConnector({ configFile: writeCfg(obj), pluginDir, secrets, logRun: (r) => rows.push(r), getSettingsRoutes: () => settings, ...extra });
  return { conn, rows };
}

async function main() {
  const { conn, rows } = make(cfg());

  // Successo su endpoint "principale": clean applicato, riga con provider = nome endpoint.
  const c1 = conn.connect('extractTasks');
  assert.strictEqual(c1.endpoint, 'principale');
  assert.strictEqual(c1.model, 'm1');
  assert.strictEqual(c1.info.label, 'Finto');
  const out = await c1.run({ date: '2025-01-01', text: 'diario segreto', prjOptions: [] }, { entryId: 'e1' });
  assert.strictEqual(out[0].title, 'Prova');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].task, 'extractTasks');
  assert.strictEqual(rows[0].provider, 'principale');
  assert.strictEqual(rows[0].model, 'm1');
  assert.strictEqual(rows[0].entryId, 'e1');
  assert.strictEqual(rows[0].error, undefined);
  assert.deepStrictEqual(rows[0].output, { raw: { ok: true, tasks: [{ title: ' Prova ', minutes: 30 }] }, usage: { input_tokens: 5 } });
  assert.ok(rows[0].input.system && rows[0].input.user.includes('diario segreto'));
  assert.ok(typeof rows[0].ms === 'number');

  // Compito assegnato all'endpoint finto (nessuna modifica a src/): riga con il suo nome.
  const s = await conn.connect('summarizeDay').run({ date: '2025-01-01', text: 'x' });
  assert.deepStrictEqual(s.strengths, ['a']);
  assert.strictEqual(rows[1].provider, 'locale');
  assert.strictEqual(rows[1].output.raw.strengths[0], 'a');
  assert.strictEqual(conn.connect('summarizeDay').info.label, 'Modello locale');

  // ping eredita la rotta di extractTasks.
  const ping = conn.connect('ping');
  assert.strictEqual(ping.endpoint, 'principale');
  assert.strictEqual(ping.model, 'm1');
  assert.deepStrictEqual(await ping.run({}), { ok: true });
  assert.strictEqual(rows[2].task, 'ping');
  assert.strictEqual(rows[2].provider, 'principale');
  assert.strictEqual(rows[2].entryId, undefined);

  // Fallimento del plugin: riga con errore e output null, e.llm aggiunto, errore rilanciato.
  await assert.rejects(conn.connect('reviewGoals').run({ goals: [], text: 'x', date: 'd' }, { entryId: 'e2' }), (e) => {
    assert.strictEqual(e.code, 'rate_limit');
    assert.strictEqual(e.llm.task, 'reviewGoals');
    assert.strictEqual(e.llm.endpoint, 'guasto');
    assert.strictEqual(e.llm.model, 'm3');
    assert.strictEqual(e.llm.code, 'rate_limit');
    assert.strictEqual(e.llm.info.service, 'Finto');
    return true;
  });
  const fail = rows[rows.length - 1];
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(fail.provider, 'guasto');
  assert.strictEqual(fail.output, null);
  assert.strictEqual(fail.error, 'errore finto rate_limit');
  assert.strictEqual(fail.entryId, 'e2');

  // Codice non valido: trattato come unknown.
  const { conn: c2, rows: r2 } = make(cfg(), { reviewGoals: { endpoint: 'senzacodice' } });
  await assert.rejects(c2.connect('reviewGoals').run({}), (e) => e.llm.code === 'unknown' && e.code === 'inventato');
  assert.strictEqual(r2.length, 1);

  // Errore di clean: riga d'errore con raw conservato.
  const tasks = {
    boom: { name: 'boom', toolName: 'x', description: 'd', schema: {}, system: 's', buildUser: () => 'u', clean: () => { throw new Error('clean rotto'); } },
  };
  const fb = writeCfg({ version: 1, connections: { c: { plugin: 'fake' } }, endpoints: { e: { plugin: 'fake', connection: 'c', options: { output: { v: 1 } } } }, routes: { boom: { endpoint: 'e', model: 'mm' } } });
  const rb = [];
  const cb = createConnector({ configFile: fb, pluginDir, secrets, logRun: (r) => rb.push(r), tasks });
  await assert.rejects(cb.connect('boom').run({}), (e) => e.message === 'clean rotto' && e.llm.endpoint === 'e');
  assert.strictEqual(rb.length, 1);
  assert.strictEqual(rb[0].error, 'clean rotto');
  assert.deepStrictEqual(rb[0].output, { raw: { v: 1 }, usage: null });

  // Il segreto non finisce in llm_runs.
  assert.ok(!JSON.stringify([rows, r2, rb]).includes(SECRET));

  // Merge con settings: modello ed endpoint personali; rotte e info.
  const { conn: c4 } = make(cfg(), { extractTasks: { model: 'x' }, summarizeDay: { endpoint: 'principale' } });
  assert.strictEqual(c4.connect('extractTasks').model, 'x');
  assert.strictEqual(c4.connect('ping').model, 'x');
  assert.strictEqual(c4.connect('summarizeDay').endpoint, 'principale');
  assert.strictEqual(c4.routes().extractTasks.model, 'x');
  const inf = c4.info();
  assert.strictEqual(inf.error, null);
  assert.strictEqual(inf.endpoint, 'principale');
  assert.strictEqual(inf.label, 'Finto');
  assert.deepStrictEqual(inf.warnings, []);

  // Compito sconosciuto.
  assert.throws(() => conn.connect('nonesiste'), /Compito sconosciuto/);

  // Configurazione non valida: connect lancia code 'config', info ha l'errore, routes vuote, nessuna riga.
  const { conn: bad, rows: rbad } = make('{ rotto');
  assert.throws(() => bad.connect('extractTasks'), (e) => e.code === 'config' && /JSON non leggibile/.test(e.message));
  assert.ok(bad.info().error.startsWith('Configurazione LLM non valida'));
  assert.deepStrictEqual(bad.routes(), {});
  assert.strictEqual(rbad.length, 0);

  // Il plugin riceve solo connection, secrets (vista) e secretName: mai logRun né lo store.
  const lc = loadLlmConfig(writeCfg(cfg()), { taskNames: Object.keys(TASKS), secretNames: ['anthropic', 'asana'], secrets, pluginDir });
  assert.deepStrictEqual(Object.keys(lc.endpoints.principale.deps).sort(), ['connection', 'secretName', 'secrets']);

  // Nessun file di src/ conosce l'endpoint finto.
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)]));
  for (const file of walk(path.join(__dirname, '..', 'src'))) {
    if (file.endsWith('.js')) assert.ok(!/fixtures[\\/]plugin|endpoint[\\/]fake/.test(fs.readFileSync(file, 'utf8')), file);
  }

  console.log('connect.test.js ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
