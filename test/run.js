// Esegue smoke.js e ogni test/*.test.js, ciascuno in un processo separato.
// Fallisce (exit 1) se anche uno solo fallisce. Senza rete e senza Electron.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function listTests(dir) {
  const files = fs.readdirSync(dir).filter((f) => f === 'smoke.js' || f.endsWith('.test.js')).sort();
  return files.map((f) => path.join(dir, f));
}

if (require.main === module) {
  const files = listTests(__dirname);
  const failed = [];
  for (const f of files) {
    const name = path.basename(f);
    console.log(`\n== ${name}`);
    const r = spawnSync(process.execPath, [f], { stdio: 'inherit' });
    if (r.status !== 0) failed.push(name);
  }
  console.log(`\n${files.length - failed.length}/${files.length} file di test ok`);
  if (failed.length) { console.error('Falliti: ' + failed.join(', ')); process.exit(1); }
}

module.exports = { listTests };
