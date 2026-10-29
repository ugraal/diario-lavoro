// Connessione finta per i test della factory: nessuna rete.
'use strict';
module.exports = function create(options) {
  return {
    kind: 'fake',
    fetch: async () => ({ ok: true }),
    baseURL: (d) => d,
    timeoutMs: options.timeoutMs || 1000,
    maxRetries: 0,
    describe: () => ({ kind: 'fake', detail: 'prova' }),
  };
};
