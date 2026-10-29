// Factory unica dei plugin (ADR 0003): carica plugin/<tipo>/<nome>/App.js da una cartella base
// passata dal chiamante, valida il nome, controlla il percorso e verifica il contratto a runtime.
// Non dipende da Electron.
'use strict';
const fs = require('fs');
const path = require('path');
const { CONNECTION_MEMBERS } = require('./contracts/connection');
const { ENDPOINT_MEMBERS } = require('./contracts/endpoint');

const NAME_RE = /^[a-z0-9-]{1,64}$/;

// Tipi ammessi (elenco chiuso): etichetta in italiano e nome dell'interfaccia.
const KINDS = Object.freeze({
  connection: { label: 'di connessione', short: 'connessione', iface: 'IConnection' },
  endpoint: { label: 'endpoint', short: 'endpoint', iface: 'IEndpoint' },
});

const TYPE_IT = { function: 'funzione', number: 'numero', string: 'stringa' };

/**
 * @param {'connection'|'endpoint'} kind
 * @param {string} name  Solo [a-z0-9-], 1-64 caratteri.
 * @param {object} [options]  Campo options della configurazione.
 * @param {object} deps  Dipendenze iniettate dal nucleo.
 * @param {{ baseDir: string, members: Object<string,string> }} cfg
 *   baseDir: cartella dei plugin (obbligatoria); members: membri obbligatori nome -> tipo.
 */
function loadPlugin(kind, name, options, deps, { baseDir, members } = {}) {
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) {
    throw new Error(`Tipo di plugin non valido: "${String(kind)}" (ammessi: connection, endpoint)`);
  }
  const k = KINDS[kind];
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new Error(`Nome di plugin non valido: "${String(name)}" (ammessi solo a-z, 0-9 e -)`);
  }
  if (typeof baseDir !== 'string' || !baseDir) throw new Error('Cartella dei plugin non indicata');
  if (!members || typeof members !== 'object') throw new Error('Elenco dei membri obbligatori non indicato');

  const dir = path.resolve(baseDir, kind);
  const file = path.resolve(dir, name, 'App.js');
  const rel = path.relative(dir, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Percorso del plugin non consentito: "${name}"`);
  }
  if (!fs.existsSync(file)) {
    throw new Error(`Plugin ${k.label} "${name}" non trovato in plugin/${kind}/`);
  }
  const create = require(file);
  if (typeof create !== 'function') {
    throw new Error(`Il plugin ${k.short} "${name}" non esporta una funzione`);
  }
  const instance = create(options || {}, deps);
  if (!instance || typeof instance !== 'object') {
    throw new Error(`Il plugin ${k.short} "${name}" non rispetta ${k.iface}: non restituisce un oggetto`);
  }
  for (const [member, type] of Object.entries(members)) {
    if (typeof instance[member] !== type) {
      throw new Error(`Il plugin ${k.short} "${name}" non rispetta ${k.iface}: manca "${member}" (${TYPE_IT[type] || type})`);
    }
  }
  return instance;
}

/** Crea una connessione. deps: { secrets }. */
function createConnection(name, options, deps, baseDir) {
  return loadPlugin('connection', name, options, deps, { baseDir, members: CONNECTION_MEMBERS });
}

/** Crea un endpoint. deps: { connection, secrets, secretName }. */
function createEndpoint(name, options, deps, baseDir) {
  return loadPlugin('endpoint', name, options, deps, { baseDir, members: ENDPOINT_MEMBERS });
}

module.exports = { loadPlugin, createConnection, createEndpoint, NAME_RE };
