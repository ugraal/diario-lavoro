// Contratto ISecretStore (archivio dei segreti) e ISecretReader (vista in sola lettura).
'use strict';

/**
 * @interface ISecretStore   Archivio dei segreti, usato solo dal nucleo (Impostazioni).
 * @property {(name: string) => string} get     Valore, oppure '' se assente o non decifrabile. Non lancia.
 * @property {(name: string, value: string) => void} set  Valore vuoto = cancella. Lancia se la scrittura fallisce.
 * @property {() => object} status              { encryption, <nome>: { set, fromEnv, hint } }, mai il valore.
 * @property {() => string[]} names             Nomi dei segreti noti (oggi 'anthropic', 'asana').
 *
 * @interface ISecretReader  Vista in sola lettura data a plugin e client.
 * @property {(name: string) => string} get     Come ISecretStore.get, ma lancia un Error
 *                                              (code 'secret_denied') per un nome non autorizzato.
 */

const SECRET_STORE_MEMBERS = Object.freeze({
  get: 'function',
  set: 'function',
  status: 'function',
  names: 'function',
});

/**
 * Vista in sola lettura, congelata, limitata ai nomi autorizzati (minimo dei permessi).
 * @param {ISecretStore} store
 * @param {string[]} allowed
 * @returns {ISecretReader}
 */
function readOnlyView(store, allowed) {
  const ok = new Set(allowed || []);
  return Object.freeze({
    get(name) {
      if (!ok.has(name)) {
        const e = new Error(`Segreto non autorizzato: "${name}"`);
        e.code = 'secret_denied';
        throw e;
      }
      return store.get(name);
    },
  });
}

module.exports = { SECRET_STORE_MEMBERS, readOnlyView };
