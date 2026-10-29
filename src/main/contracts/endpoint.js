// Contratto IEndpoint: con quale servizio si parla (API Anthropic, router, modello locale...).
// Le implementazioni sono plugin in plugin/endpoint/<nome>/App.js.
'use strict';

/**
 * Richiesta neutra rispetto al fornitore.
 * @typedef {Object} StructuredRequest
 * @property {string} model
 * @property {string} system
 * @property {string} user
 * @property {object} schema       JSON Schema dell'output.
 * @property {string} toolName     Nome dell'output strutturato (identificatore [a-z_]).
 * @property {string} description
 * @property {number} maxTokens
 *
 * @typedef {Object} StructuredResult
 * @property {object} output       Oggetto strutturato COSÌ COME restituito dal servizio
 *                                 (non ripulito: finisce in llm_runs.output.raw).
 * @property {object|null} usage   Consumo riportato dal servizio, se c'è.
 *
 * @typedef {Object} EndpointInfo
 * @property {string} label        Per la nota sulla privacy, es. 'API Anthropic'.
 * @property {string} service      Nome breve del servizio, es. 'Anthropic'.
 * @property {string} keyLabel     Nome del segreto per l'utente, es. 'API key Anthropic'.
 *
 * @interface IEndpoint
 * @property {(req: StructuredRequest) => Promise<StructuredResult>} runStructured
 *   Rifiuta solo con un Error che ha: code (da LLM_ERROR_CODES), status (HTTP, se esiste),
 *   message (testo tecnico originale, mai con segreti).
 * @property {() => EndpointInfo} describe
 */

/**
 * Firma del plugin: create(options, deps: { connection: IConnection, secrets: ISecretReader,
 * secretName: string|null }) => IEndpoint. Il segreto si legge a ogni chiamata.
 * Opzioni non valide: Error con code = 'plugin_options'.
 */

const ENDPOINT_MEMBERS = Object.freeze({
  runStructured: 'function',
  describe: 'function',
});

// Codici d'errore normalizzati. 'config' lo produce solo il nucleo (configurazione non valida).
const LLM_ERROR_CODES = Object.freeze([
  'no_key', 'bad_key', 'forbidden', 'model_not_found', 'rate_limit', 'unavailable',
  'unreachable', 'no_output', 'bad_request', 'unknown', 'config',
]);

module.exports = { ENDPOINT_MEMBERS, LLM_ERROR_CODES };
