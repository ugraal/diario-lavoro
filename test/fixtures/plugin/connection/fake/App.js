// Connessione finta per i test della factory e del contratto: nessuna rete.
'use strict';
module.exports = function create(options) {
  if (options.timeoutMs !== undefined && !(options.timeoutMs > 0)) {
    const e = new Error('Connessione fake: "timeoutMs" non valido');
    e.code = 'plugin_options';
    throw e;
  }
  return {
    kind: 'fake',
    fetch: async () => ({ ok: true }),
    baseURL: (d) => d,
    timeoutMs: options.timeoutMs || 1000,
    maxRetries: 0,
    describe: () => ({ kind: 'fake', detail: 'prova' }),
  };
};
