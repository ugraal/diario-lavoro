// Messaggi d'errore LLM in italiano, ricavati dai codici normalizzati (LLM_ERROR_CODES) e dalle
// etichette di EndpointInfo (e.llm.info). Non dipende da nessun fornitore.
'use strict';

/**
 * @param {Error & { code?: string, llm?: { code: string, info?: { service?: string, keyLabel?: string } } }} e
 * @returns {string}
 */
function describeLlmError(e) {
  if (!e) return 'Errore sconosciuto';
  if (e.code === 'config' && !e.llm) return e.message;
  const llm = e.llm || {};
  const code = llm.code || e.code || 'unknown';
  const info = llm.info || {};
  const key = info.keyLabel || 'API key';
  const service = info.service || 'Il servizio';
  switch (code) {
    case 'no_key': return key + ' mancante: impostala nelle Impostazioni';
    case 'no_output': return 'Il modello non ha restituito un output strutturato';
    case 'bad_key': return key + ' non valida';
    case 'forbidden': return 'API key senza permessi per questo modello';
    case 'model_not_found': return 'Modello non trovato: controlla il nome nelle Impostazioni';
    case 'rate_limit': return 'Troppe richieste o crediti esauriti, riprova tra poco';
    case 'unavailable': return service + ' non risponde, riprova tra poco';
    case 'config': return e.message;
    default: return 'Errore LLM: ' + String(e.message || e).slice(0, 200);
  }
}

module.exports = { describeLlmError };
