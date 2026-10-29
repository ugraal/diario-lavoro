// Endpoint finto per i test: restituisce un output fisso (options.output) oppure fallisce
// (options.failCode). Non scrive nulla e non vede lo store. Registra le richieste in `calls`.
'use strict';
module.exports = function create(options, deps) {
  const calls = [];
  return {
    deps,
    calls,
    runStructured: async (req) => {
      calls.push(req);
      if (options && options.failCode) {
        const e = new Error('errore finto ' + options.failCode);
        e.code = options.failCode;
        throw e;
      }
      return { output: (options && options.output) || { ok: true }, usage: (options && options.usage) || null };
    },
    describe: () => ({ label: (options && options.label) || 'Finto', service: 'Finto', keyLabel: 'Chiave finta' }),
  };
};
