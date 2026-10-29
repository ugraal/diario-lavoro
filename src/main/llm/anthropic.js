// Adapter Anthropic: output strutturato tramite tool use forzato.
'use strict';
const Anthropic = require('@anthropic-ai/sdk');

class AnthropicAdapter {
  constructor(getKey) { this.getKey = getKey; this.client = null; this.clientKey = ''; }
  get name() { return 'anthropic'; }
  ensure() {
    const key = this.getKey();
    if (!key) { const e = new Error('API key Anthropic mancante: impostala nelle Impostazioni'); e.code = 'no_key'; throw e; }
    if (!this.client || this.clientKey !== key) { this.client = new Anthropic({ apiKey: key }); this.clientKey = key; }
    return this.client;
  }
  async runStructured({ system, user, schema, toolName, description, model, maxTokens }) {
    const res = await this.ensure().messages.create({
      model,
      max_tokens: maxTokens || 2048,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [{ name: toolName, description: description || toolName, input_schema: schema }],
      tool_choice: { type: 'tool', name: toolName },
    });
    const block = (res.content || []).find((b) => b.type === 'tool_use' && b.name === toolName);
    if (!block) { const e = new Error('Il modello non ha restituito un output strutturato'); e.code = 'no_output'; throw e; }
    return { output: block.input, usage: res.usage || null };
  }
  async ping(model) {
    const res = await this.ensure().messages.create({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Rispondi solo: ok' }] });
    return !!res.id;
  }
}

function describeLlmError(e) {
  if (!e) return 'Errore sconosciuto';
  if (e.code === 'no_key' || e.code === 'no_output') return e.message;
  const s = e.status;
  if (s === 401) return 'API key Anthropic non valida';
  if (s === 403) return 'API key senza permessi per questo modello';
  if (s === 404) return 'Modello non trovato: controlla il nome nelle Impostazioni';
  if (s === 429) return 'Troppe richieste o crediti esauriti, riprova tra poco';
  if (s === 529 || s >= 500) return 'Anthropic non risponde, riprova tra poco';
  return 'Errore LLM: ' + String(e.message || e).slice(0, 200);
}

module.exports = { AnthropicAdapter, describeLlmError };
