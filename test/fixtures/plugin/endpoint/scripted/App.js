// Endpoint finto "a copione" per i test: la risposta la decide la funzione globale
// globalThis.__scriptedEndpoint(req), così uno stesso test può dare risposte diverse per compito.
'use strict';
module.exports = function create() {
  return {
    runStructured: async (req) => globalThis.__scriptedEndpoint(req),
    describe: () => ({ label: 'API Anthropic', service: 'Anthropic', keyLabel: 'API key Anthropic' }),
  };
};
