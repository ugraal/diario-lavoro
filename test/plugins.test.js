// Factory dei plugin (A3, CA10): nomi, percorso, plugin inesistente, contratto, caricamento.
'use strict';
const assert = require('assert');
const path = require('path');
const { loadPlugin, createConnection, createEndpoint } = require('../src/main/plugins');
const { CONNECTION_MEMBERS } = require('../src/main/contracts/connection');
const { ENDPOINT_MEMBERS } = require('../src/main/contracts/endpoint');

const base = path.join(__dirname, 'fixtures', 'plugin');
const deps = { secrets: {} };

// Caricamento corretto.
const c = createConnection('fake', { timeoutMs: 5 }, deps, base);
assert.strictEqual(c.kind, 'fake');
assert.strictEqual(c.timeoutMs, 5);
const e = createEndpoint('fake', undefined, { connection: c, secrets: {}, secretName: null }, base);
assert.strictEqual(e.deps.connection, c);
assert.strictEqual(typeof e.runStructured, 'function');
// Istanza nuova a ogni chiamata.
assert.notStrictEqual(createConnection('fake', {}, deps, base), createConnection('fake', {}, deps, base));

// Nomi non validi.
for (const bad of ['../x', 'Anthropic', 'a/b', '', 'a\\b', '..', 'x'.repeat(65), null, undefined, 5]) {
  assert.throws(() => createEndpoint(bad, {}, deps, base),
    (err) => /^Nome di plugin non valido: ".*" \(ammessi solo a-z, 0-9 e -\)$/.test(err.message), `nome ${String(bad)}`);
}
assert.throws(() => createEndpoint('../x', {}, deps, base), /Nome di plugin non valido: "\.\.\/x"/);

// Tipo non valido.
assert.throws(() => loadPlugin('../endpoint', 'fake', {}, deps, { baseDir: base, members: ENDPOINT_MEMBERS }), /Tipo di plugin non valido/);
assert.throws(() => loadPlugin('toString', 'fake', {}, deps, { baseDir: base, members: ENDPOINT_MEMBERS }), /Tipo di plugin non valido/);

// Cartella base mancante.
assert.throws(() => loadPlugin('endpoint', 'fake', {}, deps, { members: ENDPOINT_MEMBERS }), /Cartella dei plugin/);

// Plugin inesistente.
assert.throws(() => createConnection('nonesiste', {}, deps, base), /Plugin di connessione "nonesiste" non trovato in plugin\/connection\//);
assert.throws(() => createEndpoint('nonesiste', {}, deps, base), /Plugin endpoint "nonesiste" non trovato in plugin\/endpoint\//);

// Non esporta una funzione.
assert.throws(() => createEndpoint('notfn', {}, deps, base), /Il plugin endpoint "notfn" non esporta una funzione/);

// Membro mancante, con il nome del plugin nell'errore.
assert.throws(() => createEndpoint('broken', {}, deps, base),
  /Il plugin endpoint "broken" non rispetta IEndpoint: manca "runStructured" \(funzione\)/);
assert.throws(() => loadPlugin('connection', 'fake', {}, deps, { baseDir: base, members: { ...CONNECTION_MEMBERS, extra: 'number' } }),
  /Il plugin connessione "fake" non rispetta IConnection: manca "extra" \(numero\)/);

console.log('plugins.test.js ok');
