// Secrets come ISecretStore: contratto, precedenza env, vista in sola lettura. Senza Electron.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Secrets } = require('../src/main/secrets');
const { readOnlyView } = require('../src/main/contracts/secret-store');
const { checkSecretStore } = require('./contract/secret-store');

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ASANA_TOKEN;

// safeStorage finto: "cifra" invertendo il testo.
const fakeSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(String(s).split('').reverse().join('')),
  decryptString: (b) => b.toString().split('').reverse().join(''),
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-'));

// Contratto, con cifratura e senza.
checkSecretStore(new Secrets(tmp(), fakeSafe));
checkSecretStore(new Secrets(tmp(), null));

// Persistenza e formato del file invariato (cifrato).
{
  const dir = tmp();
  new Secrets(dir, fakeSafe).set('asana', 'tok-123');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8'));
  assert.strictEqual(raw.asana.enc, true);
  assert.ok(!JSON.stringify(raw).includes('tok-123'));
  assert.strictEqual(new Secrets(dir, fakeSafe).get('asana'), 'tok-123');
}

// L'ambiente prevale sul valore salvato.
{
  const s = new Secrets(tmp(), fakeSafe);
  s.set('anthropic', 'salvata');
  process.env.ANTHROPIC_API_KEY = 'da-env';
  assert.strictEqual(s.get('anthropic'), 'da-env');
  assert.strictEqual(s.status().anthropic.fromEnv, true);
  delete process.env.ANTHROPIC_API_KEY;
  assert.strictEqual(s.get('anthropic'), 'salvata');
  process.env.ASANA_TOKEN = 'asana-env';
  assert.strictEqual(s.get('asana'), 'asana-env');
  delete process.env.ASANA_TOKEN;
}

// Vista in sola lettura.
{
  const s = new Secrets(tmp(), fakeSafe);
  s.set('anthropic', 'k1');
  s.set('asana', 't1');
  const v = readOnlyView(s, ['anthropic']);
  assert.strictEqual(v.get('anthropic'), 'k1');
  assert.throws(() => v.get('asana'), (e) => e.code === 'secret_denied');
  assert.strictEqual(v.set, undefined);
  assert.ok(Object.isFrozen(v));
}

console.log('secrets.test.js ok');
