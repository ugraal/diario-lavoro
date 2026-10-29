// Test senza interfaccia: store, analisi con LLM finto, invio ad Asana con fetch finto.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');
const { createConnector } = require('../src/main/llm/connect');
const { Asana, pickParent, weekHas } = require('../src/main/asana');
const { Service } = require('../src/main/service');
const U = require('../src/shared/util');
const CFG = require('../src/main/asana-config');

(async () => {
  // util
  assert.strictEqual(U.parseDur('1h30'), 90); assert.strictEqual(U.parseDur('1.5h'), 90); assert.strictEqual(U.parseDur('45min'), 45);
  assert.ok(isNaN(U.parseDur('boh'))); assert.strictEqual(U.fmtDur(90), '1h30'); assert.strictEqual(U.weekOfYmd('2026-10-29'), 'W44');
  assert.ok(weekHas('W43, W44', 'W44')); assert.ok(!weekHas('W4', 'W44'));
  assert.strictEqual(pickParent([{ gid: 'a', planned: true }, { gid: 'b', planned: false }]).gid, 'b');
  assert.strictEqual(pickParent([{ gid: 'a', planned: false }, { gid: 'b', planned: false }]), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diario-'));
  const file = path.join(dir, 'diario.sqlite');
  let store = await Store.open(file);

  // LLM finto
  const calls = [];
  const fake = {
    async runStructured(req) {
      calls.push(req);
      if (req.toolName === 'registra_attivita') return { output: { tasks: [
        { title: 'Revisione pipeline Diasorin', minutes: 240, prj_gid: '1213896228686081', done: true, confidence: 0.9, evidence: 'mattina su Diasorin' },
        { title: 'Call con Stadler', minutes: 60, prj_gid: 'inventato', done: true, confidence: 0.4, evidence: 'call Stadler' },
      ] } };
      if (req.toolName === 'registra_bilancio') return { output: { strengths: ['Buona concentrazione'], improvements: ['Preparare le call'] } };
      if (req.toolName === 'aggiorna_obiettivi') {
        const m = req.user.match(/id ([0-9a-f-]{36})/);
        return { output: { updates: m ? [{ goal_id: m[1], progress: 30, trend: 'up', evidence: 'x', comment: 'bene' }, { goal_id: 'non-esiste', progress: 99, trend: 'up', evidence: '', comment: '' }] : [],
          proposals: [{ title: 'Preparare un\'agenda per ogni call', description: 'd', evidence: 'e' }, { title: 'Due', description: '', evidence: '' }, { title: 'Tre', description: '', evidence: '' }] } };
      }
      throw new Error('tool inatteso');
    },
  };
  // L'endpoint finto "a copione" si chiama anthropic come in produzione: llm_runs.provider = 'anthropic'.
  globalThis.__scriptedEndpoint = (req) => fake.runStructured(req);
  const route = { endpoint: 'anthropic', model: 'm' };
  const cfgFile = path.join(dir, 'llm.json');
  fs.writeFileSync(cfgFile, JSON.stringify({
    version: 1,
    connections: { c: { plugin: 'fake', options: {} } },
    endpoints: { anthropic: { plugin: 'scripted', connection: 'c', secret: 'anthropic', options: {} } },
    routes: { extractTasks: route, summarizeDay: route, reviewGoals: route },
  }));
  const connector = createConnector({
    configFile: cfgFile, pluginDir: path.join(__dirname, 'fixtures', 'plugin'),
    secrets: { get: () => 'key', names: () => ['anthropic', 'asana'] }, logRun: (r) => store.logRun(r),
  });

  // Asana finto
  const created = [];
  let failWrite = false;
  const fetchMock = async (url, init) => {
    const u = new URL(url), p = u.pathname.replace('/api/1.0', '');
    const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
    if (p === '/users/me') return ok({ gid: 'ME', name: 'Antonio' });
    if (p === '/projects/' + CFG.project && u.searchParams.get('opt_fields') === 'workspace.gid') return ok({ workspace: { gid: 'WS' } });
    if (p === '/projects/' + CFG.project) return ok({ custom_field_settings: [{ custom_field: { gid: CFG.prjField, enum_options: [{ gid: '1213896228686081', name: 'Diasorin PDM', enabled: true }, { gid: '1213872916151083', name: 'Stadler', enabled: true }] } }] });
    if (p === '/workspaces/WS/tasks/search') {
      assert.strictEqual(u.searchParams.get('custom_fields.' + CFG.prjField + '.value'), '1213896228686081');
      return ok([{ gid: 'PARENT', name: 'Diasorin W44', custom_fields: [{ gid: CFG.weekField, display_value: 'W44' }, { gid: CFG.plannedField, display_value: null }] },
        { gid: 'OTHER', name: 'Diasorin W43', custom_fields: [{ gid: CFG.weekField, display_value: 'W43' }] }]);
    }
    if (p === '/tasks/PARENT/subtasks' && init.method === 'POST') {
      const body = JSON.parse(init.body).data;
      created.push(body);
      if (failWrite) throw new Error('ECONNRESET');
      return ok({ gid: 'SUB' + created.length, permalink_url: 'https://app.asana.com/0/0/SUB' + created.length, name: body.name });
    }
    if (p === '/tasks/PARENT/subtasks') return ok(created.map((c, i) => ({ gid: 'SUB' + (i + 1), name: c.name })));
    return { ok: false, status: 404, json: async () => ({ errors: [{ message: 'not found ' + p }] }) };
  };
  const secrets = { get: (n) => (n === 'asana' ? 'tok' : 'key') };
  const asana = new Asana(() => 'tok', fetchMock);
  const svc = new Service({ store, connector, asana, secrets });

  // voce + analisi
  const e = store.saveEntry({ date: '2026-10-29', text: 'Tutta la mattina su Diasorin, poi call Stadler. Devo preparare meglio le call.' });
  let r = await svc.analyzeEntry(e.id);
  assert.deepStrictEqual(r.errors, []);
  let tasks = store.tasksOfEntry(e.id);
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].week, 'W44');
  assert.strictEqual(tasks[1].prj_gid, '', 'PRJ inventato scartato');
  assert.deepStrictEqual(r.entry.strengths, ['Buona concentrazione']);
  let goals = store.listGoals();
  assert.strictEqual(goals.length, 2, 'max 2 proposte');
  assert.ok(goals.every((g) => g.status === 'proposed'));
  assert.ok(calls[0].user.includes('Diasorin PDM'), 'elenco PRJ letto da Asana passato al modello');

  // rianalisi: niente duplicati
  r = await svc.analyzeEntry(e.id);
  assert.strictEqual(store.tasksOfEntry(e.id).length, 2);
  assert.strictEqual(store.listGoals().length, 2);

  // accetto un obiettivo, una nuova analisi lo aggiorna (e ignora id inesistenti)
  goals = store.listGoals();
  store.setGoalStatus(goals[0].id, 'active');
  store.setGoalStatus(goals[1].id, 'dropped');
  const e2 = store.saveEntry({ date: '2026-10-30', text: 'Ho preparato l\'agenda per la call.' });
  await svc.analyzeEntry(e2.id);
  const g = store.listGoals().find((x) => x.id === goals[0].id);
  assert.strictEqual(g.progress, 30); assert.strictEqual(g.trend, 'up');
  assert.strictEqual(store.goalUpdates(g.id).length, 1);
  // rianalisi di e2: il modello vede l'avanzamento "prima" di e2 (0), non 30
  calls.length = 0;
  await svc.analyzeEntry(e2.id);
  assert.ok(calls.find((c) => c.toolName === 'aggiorna_obiettivi').user.includes('avanzamento 0/100'));
  assert.strictEqual(store.goalUpdates(g.id).length, 1);

  // invio ad Asana
  tasks = store.tasksOfEntry(e.id);
  let t = await svc.syncTask(tasks[0].id);
  assert.strictEqual(t.status, 'synced', t.error);
  assert.strictEqual(t.asana_parent_gid, 'PARENT');
  assert.strictEqual(created[0].due_on, '2026-10-29');
  assert.strictEqual(created[0].custom_fields[CFG.timeField], 240);
  assert.strictEqual(created[0].completed, true);
  assert.ok(!created[0].notes.includes('Diasorin'), 'il testo del diario non va su Asana');
  t = await svc.syncTask(tasks[1].id);
  assert.strictEqual(t.status, 'error'); assert.ok(/progetto/i.test(t.error));

  // esito incerto -> riprova: trova la sottoattività già creata, nessun duplicato
  store.updateTask(tasks[1].id, { prj_gid: '1213896228686081', status: 'draft' });
  failWrite = true;
  t = await svc.syncTask(tasks[1].id);
  assert.strictEqual(t.status, 'uncertain');
  failWrite = false;
  const before = created.length;
  t = await svc.syncTask(tasks[1].id);
  assert.strictEqual(t.status, 'synced'); assert.strictEqual(created.length, before, 'nessun duplicato');

  // persistenza su disco
  store = await Store.open(file);
  assert.strictEqual(store.listEntries().length, 2);
  assert.strictEqual(store.listTasks().filter((x) => x.status === 'synced').length, 2);
  const ex = store.exportAll();
  assert.ok(ex.llm_runs.length >= 12 && ex.llm_runs[0].input.user, 'chiamate LLM registrate');
  assert.ok(ex.tasks[0].llm_original, 'proposta originale conservata');
  assert.ok(ex.llm_runs.every((x) => x.provider === 'anthropic'), 'provider = nome endpoint');
  assert.strictEqual(ex.llm_runs.filter((x) => x.entry_id === e.id).length >= 3, true);

  console.log('OK: tutti i controlli superati');
})().catch((e) => { console.error(e); process.exit(1); });
