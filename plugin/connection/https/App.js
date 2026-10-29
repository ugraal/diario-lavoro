// Connessione diretta via HTTPS (IConnection): usa il fetch globale, indirizzo base invariato.
// Non fa retry né timeout: li applica il client, con i valori esposti qui sotto.
'use strict';

const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_MAX_RETRIES = 2;

function optionsError(msg) {
  const e = new Error(msg);
  e.code = 'plugin_options';
  return e;
}

module.exports = function create(options /* , deps */) {
  const o = options || {};
  const timeoutMs = o.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : o.timeoutMs;
  const maxRetries = o.maxRetries === undefined ? DEFAULT_MAX_RETRIES : o.maxRetries;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw optionsError('Connessione https: "timeoutMs" deve essere un numero maggiore di zero');
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw optionsError('Connessione https: "maxRetries" deve essere un intero maggiore o uguale a zero');
  }
  return {
    kind: 'https',
    // Si legge globalThis.fetch a ogni chiamata, così resta sostituibile nei test.
    fetch: (url, init) => globalThis.fetch(url, init),
    baseURL: (defaultURL) => defaultURL,
    timeoutMs,
    maxRetries,
    describe: () => ({ kind: 'https', detail: `diretta, timeout ${timeoutMs} ms, ${maxRetries} nuovi tentativi` }),
  };
};
