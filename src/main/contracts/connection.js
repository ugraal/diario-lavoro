// Contratto IConnection: come si arriva a un servizio (in-process, servizio locale, intranet, esterno).
// Le implementazioni sono plugin in plugin/connection/<nome>/App.js.
'use strict';

/**
 * @interface IConnection
 * @property {string} kind  Nome del plugin (es. 'https').
 * @property {(url: string, init?: RequestInit) => Promise<Response>} fetch
 *   Trasporto con la firma WHATWG fetch. Non fa retry e non applica timeout: retry e timeout
 *   li applica il client che lo usa, con i valori qui sotto. Gli errori di rete si rifiutano
 *   come fa fetch (TypeError o AbortError).
 * @property {(defaultURL: string) => string} baseURL
 *   Indirizzo base da usare per un servizio il cui indirizzo predefinito è defaultURL.
 * @property {number} timeoutMs  Timeout per tentativo, in millisecondi, > 0.
 * @property {number} maxRetries Numero di nuovi tentativi, intero >= 0.
 * @property {() => { kind: string, detail: string }} describe  Per log e Impostazioni, mai segreti.
 */

/**
 * Firma del plugin: create(options: object, deps: { secrets: ISecretReader }) => IConnection.
 * Se options non è valido lancia un Error con code = 'plugin_options' e un messaggio in italiano.
 * @typedef {(options: object, deps: { secrets: object }) => IConnection} ConnectionFactory
 */

// Membri obbligatori: nome -> tipo (verificati dalla factory a runtime e dai test di contratto).
const CONNECTION_MEMBERS = Object.freeze({
  kind: 'string',
  fetch: 'function',
  baseURL: 'function',
  timeoutMs: 'number',
  maxRetries: 'number',
  describe: 'function',
});

module.exports = { CONNECTION_MEMBERS };
