// Endpoint finto per i test della factory: restituisce un output fisso.
'use strict';
module.exports = function create(options, deps) {
  return {
    deps,
    runStructured: async () => ({ output: { ok: true }, usage: null }),
    describe: () => ({ label: 'Finto', service: 'Finto', keyLabel: 'Chiave finta' }),
  };
};
