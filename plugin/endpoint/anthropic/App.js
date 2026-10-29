// Endpoint Anthropic (IEndpoint): unico punto del progetto che importa @anthropic-ai/sdk.
// Il trasporto (fetch, indirizzo base, timeout, retry) arriva dalla connessione; la chiave dallo store.
'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

function codeError(code, message, status) {
  const e = new Error(message);
  e.code = code;
  if (status !== undefined) e.status = status;
  return e;
}

// Traduce un errore dell'SDK in un Error con codice normalizzato.
function normalize(e) {
  const msg = String((e && e.message) || e || 'Errore sconosciuto');
  const s = e && e.status;
  if (typeof s !== 'number') {
    if (e instanceof Anthropic.APIConnectionError) return codeError('unreachable', msg);
    return codeError('unknown', msg);
  }
  if (s === 401) return codeError('bad_key', msg, s);
  if (s === 403) return codeError('forbidden', msg, s);
  if (s === 404) return codeError('model_not_found', msg, s);
  if (s === 429) return codeError('rate_limit', msg, s);
  if (s >= 500) return codeError('unavailable', msg, s);
  if (s >= 400) return codeError('bad_request', msg, s);
  return codeError('unknown', msg, s);
}

module.exports = function create(options, deps) {
  const o = options || {};
  if (Object.keys(o).length) {
    const e = new Error('Endpoint anthropic: opzioni non previste (' + Object.keys(o).join(', ') + ')');
    e.code = 'plugin_options';
    throw e;
  }
  const { connection, secrets, secretName } = deps || {};
  let client = null;
  let clientKey = '';

  // Il segreto si legge a ogni chiamata; il client si ricrea se cambia la chiave.
  function ensure() {
    const key = secretName && secrets ? secrets.get(secretName) : '';
    if (!key) throw codeError('no_key', 'Chiave mancante');
    if (!client || clientKey !== key) {
      client = new Anthropic({
        apiKey: key,
        authToken: null, // niente lettura di ANTHROPIC_AUTH_TOKEN dall'ambiente
        baseURL: connection.baseURL(DEFAULT_BASE_URL), // niente lettura di ANTHROPIC_BASE_URL
        fetch: connection.fetch,
        timeout: connection.timeoutMs,
        maxRetries: connection.maxRetries,
        logLevel: 'warn', // niente ANTHROPIC_LOG=debug: il diario non va in console
      });
      clientKey = key;
    }
    return client;
  }

  return {
    async runStructured({ system, user, schema, toolName, description, model, maxTokens }) {
      const c = ensure();
      let res;
      try {
        res = await c.messages.create({
          model,
          max_tokens: maxTokens || 2048,
          system,
          messages: [{ role: 'user', content: user }],
          tools: [{ name: toolName, description: description || toolName, input_schema: schema }],
          tool_choice: { type: 'tool', name: toolName },
        });
      } catch (e) {
        throw normalize(e);
      }
      const block = (res.content || []).find((b) => b.type === 'tool_use' && b.name === toolName);
      if (!block) throw codeError('no_output', 'Il modello non ha restituito un output strutturato');
      return { output: block.input, usage: res.usage || null };
    },
    describe: () => ({ label: 'API Anthropic', service: 'Anthropic', keyLabel: 'API key Anthropic' }),
  };
};
