#!/usr/bin/env node
// Hook PreToolUse: il codice (src/, test/, package*.json) si modifica solo dalla fase 4
// di una feature con architettura accettata. Tutto il resto (docs, .claude, README) è libero.
// Bypass per correzioni urgenti: l'utente crea il file .claude/gate-off.
'use strict';
const fs = require('fs');
const path = require('path');

const PROTECTED = [/^src\//, /^test\//, /^package(-lock)?\.json$/];

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path || ti.path;
  if (!target) process.exit(0);

  const rel = path.relative(root, path.resolve(root, target)).split(path.sep).join('/');
  if (rel.startsWith('..') || !PROTECTED.some((re) => re.test(rel))) process.exit(0);
  if (fs.existsSync(path.join(root, '.claude', 'gate-off'))) process.exit(0);

  const activeFile = path.join(root, '.claude', 'feature-attiva');
  const id = fs.existsSync(activeFile) ? fs.readFileSync(activeFile, 'utf8').trim() : '';
  if (!id) deny('Nessuna feature attiva: il codice si modifica solo nella fase 4 del workflow /feature. Avvia o riprendi una feature con /feature. Per una correzione urgente l\'utente può creare .claude/gate-off.');

  const statoFile = path.join(root, 'docs', 'work', id, 'STATO.md');
  if (!fs.existsSync(statoFile)) deny('La feature attiva "' + id + '" non ha docs/work/' + id + '/STATO.md. Riprendila con /feature ' + id + '.');
  const stato = fs.readFileSync(statoFile, 'utf8');
  const get = (k) => { const m = stato.match(new RegExp('^\\s*-\\s*' + k + ':\\s*(.*)$', 'mi')); return m ? m[1].trim() : ''; };
  const fase = parseInt(get('fase'), 10) || 0;
  const arch = get('architettura').toLowerCase();

  if (fase < 4 || !arch.startsWith('accettata')) {
    deny('Feature ' + id + ' in fase ' + fase + ' (architettura: ' + (arch || 'da fare') + '). ' + rel + ' si può modificare solo dalla fase 4, dopo che Antonio ha accettato l\'architettura.');
  }
  process.exit(0);
});
