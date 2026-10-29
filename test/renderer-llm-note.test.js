// Verifica (senza GUI) che il renderer usi init.llm per la nota sulla privacy.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
assert(!/inviato all'API Anthropic/.test(src), 'riferimento fisso ad Anthropic rimasto');
// Estrae llmNote ed esegue in un contesto minimo.
const m = src.match(/function llmNote[\s\S]*?\n}\n/);
assert(m, 'llmNote assente');
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const llmNote = new Function('esc', m[0] + '; return llmNote;')(esc);
const ok = llmNote({ label: 'API Anthropic', endpoint: 'api.anthropic.com', error: null, warnings: ['attenzione X'] });
assert(ok.includes('API Anthropic') && ok.includes('api.anthropic.com') && ok.includes('attenzione X'));
const alt = llmNote({ label: 'Modello locale', endpoint: 'http://localhost:1234', error: null, warnings: [] });
assert(alt.includes('Modello locale') && !alt.includes('Anthropic'));
const bad = llmNote({ label: '', endpoint: '', error: 'file rotto', warnings: [] });
assert(bad.includes('file rotto') && !bad.includes('viene inviato'));
assert(llmNote(undefined).length > 0);
assert(/S\.init\.llm\.error/.test(src), 'errore all\'avvio non gestito');
console.log('renderer-llm-note ok');
