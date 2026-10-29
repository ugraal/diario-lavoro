// Messaggi d'errore LLM (A9): dai codici normalizzati e da EndpointInfo, uguali a quelli di prima.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describeLlmError } = require('../src/main/llm/errors');
const { createConnector } = require('../src/main/llm/connect');
const { Service } = require('../src/main/service');

const info = { service: 'Anthropic', keyLabel: 'API key Anthropic' };
const mk = (code, message = 'm') => Object.assign(new Error(message), { llm: { code, info } });

const CASI = [
  ['no_key', 'API key Anthropic mancante: impostala nelle Impostazioni'],
  ['bad_key', 'API key Anthropic non valida'],
  ['forbidden', 'API key senza permessi per questo modello'],
  ['model_not_found', 'Modello non trovato: controlla il nome nelle Impostazioni'],
  ['rate_limit', 'Troppe richieste o crediti esauriti, riprova tra poco'],
  ['unavailable', 'Anthropic non risponde, riprova tra poco'],
  ['no_output', 'Il modello non ha restituito un output strutturato'],
];
for (const [code, msg] of CASI) assert.strictEqual(describeLlmError(mk(code)), msg, code);
assert.strictEqual(describeLlmError(mk('unreachable', 'Connection error.')), 'Errore LLM: Connection error.');
assert.strictEqual(describeLlmError(mk('unknown', 'x'.repeat(300))), 'Errore LLM: ' + 'x'.repeat(200));
assert.strictEqual(describeLlmError(mk('bad_request', 'richiesta errata')), 'Errore LLM: richiesta errata');
// Etichette dell'endpoint effettivo
assert.strictEqual(describeLlmError(Object.assign(new Error('x'), { llm: { code: 'bad_key', info: { keyLabel: 'Chiave locale' } } })), 'Chiave locale non valida');
assert.strictEqual(describeLlmError(Object.assign(new Error('x'), { llm: { code: 'unavailable', info: { service: 'Servizio interno' } } })), 'Servizio interno non risponde, riprova tra poco');
// Configurazione non valida e senza dettagli
assert.strictEqual(describeLlmError(Object.assign(new Error('Configurazione LLM non valida (f): x'), { code: 'config' })), 'Configurazione LLM non valida (f): x');
assert.strictEqual(describeLlmError(null), 'Errore sconosciuto');

// Dal servizio: il codice dell'endpoint arriva al messaggio e la riga in llm_runs porta l'errore.
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
  const cfg = path.join(dir, 'llm.json');
  const route = { endpoint: 'anthropic', model: 'm' };
  fs.writeFileSync(cfg, JSON.stringify({
    version: 1, connections: { c: { plugin: 'fake', options: {} } },
    endpoints: { anthropic: { plugin: 'scripted', connection: 'c', secret: 'anthropic', options: {} } },
    routes: { extractTasks: route, summarizeDay: route, reviewGoals: route },
  }));
  const rows = [];
  const connector = createConnector({ configFile: cfg, pluginDir: path.join(__dirname, 'fixtures', 'plugin'), secrets: { get: () => 'k', names: () => ['anthropic'] }, logRun: (r) => rows.push(r) });
  const entry = { id: 'e1', date: '2026-10-29', text: 'ho lavorato' };
  const store = { getEntry: () => entry, activeGoals: () => [], goalUpdates: () => [], getSetting: (k, d) => d, applyAnalysis() {} };
  const asana = { prjOptions: async () => ({ options: [] }) };
  const svc = new Service({ store, connector, asana, secrets: { get: () => 'x' } });
  for (const [code, msg] of CASI.filter(([c]) => c !== 'no_output' || true)) {
    globalThis.__scriptedEndpoint = async () => { throw Object.assign(new Error('tecnico'), { code }); };
    await assert.rejects(svc.analyzeEntry('e1'), { message: msg });
  }
  globalThis.__scriptedEndpoint = async () => { throw Object.assign(new Error('Connection error.'), { code: 'unreachable' }); };
  await assert.rejects(svc.analyzeEntry('e1'), { message: 'Errore LLM: Connection error.' });
  assert.ok(rows.length >= 3 && rows.every((r) => r.provider === 'anthropic' && r.error));

  // Prova del modello: errore italiano, e configurazione rotta rilanciata come 'config'
  globalThis.__scriptedEndpoint = async () => ({ output: { ok: true } });
  assert.strictEqual(await svc.testLlm(), true);
  const rotto = createConnector({ configFile: path.join(dir, 'manca.json'), pluginDir: path.join(__dirname, 'fixtures', 'plugin'), secrets: { get: () => '', names: () => [] }, logRun() {} });
  assert.throws(() => rotto.connect('extractTasks'), (e) => e.code === 'config');
  const svc2 = new Service({ store, connector: rotto, asana, secrets: { get: () => 'x' } });
  await assert.rejects(svc2.analyzeEntry('e1'), /Configurazione LLM non valida/);
  console.log('OK: errori LLM');
}
main().catch((e) => { console.error(e); process.exit(1); });
