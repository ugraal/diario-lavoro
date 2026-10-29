// Risposte HTTP finte nel formato Messages API, per i test di contratto senza rete.
'use strict';

function json(status, body) {
  // retry-after-ms basso: i test con retry non aspettano.
  return { status, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' }, body };
}
function err(status, type, message) {
  return json(status, { type: 'error', error: { type, message } });
}

const OUTPUT = { tasks: [{ title: 'Prova', minutes: 30 }] };
const USAGE = { input_tokens: 11, output_tokens: 7 };

module.exports = {
  OUTPUT,
  USAGE,
  // toolName: nome dello strumento richiesto.
  success: (toolName) => json(200, {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test', stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu_1', name: toolName, input: OUTPUT }], usage: USAGE,
  }),
  noOutput: () => json(200, {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test', stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'ciao' }], usage: USAGE,
  }),
  400: () => err(400, 'invalid_request_error', 'bad'),
  401: () => err(401, 'authentication_error', 'invalid x-api-key'),
  403: () => err(403, 'permission_error', 'not allowed'),
  404: () => err(404, 'not_found_error', 'model: xyz'),
  429: () => err(429, 'rate_limit_error', 'rate limited'),
  500: () => err(500, 'api_error', 'internal'),
  529: () => err(529, 'overloaded_error', 'overloaded'),
};
