// Avvia l'app con dati di esempio e salva screenshot di Diario, Progetti e Impostazioni.
// Uso: npx electron test/e2e-shot.js (su Linux senza schermo: xvfb-run -a npx electron test/e2e-shot.js). Cartella: SHOT_DIR.
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const out = process.env.SHOT_DIR || os.tmpdir();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diario-e2e-'));
app.setPath('userData', dir);
process.env.ANTHROPIC_API_KEY = 'sk-test'; process.env.ASANA_TOKEN = 'test';
const { Store } = require('../src/main/store');
const U = require('../src/shared/util');
(async () => {
  const s = await Store.open(path.join(dir, 'diario.sqlite'));
  const t = U.today(), y = U.ymd(new Date(Date.now() - 864e5));
  const e1 = s.saveEntry({ date: y, text: 'Mattina su Diasorin PDM: revisione della pipeline di ingestion, sistemato il bug sui timestamp (3h).\nPomeriggio call con Stadler per il nuovo dashboard, un\'ora.\nCosa è andato bene: ho chiuso il bug senza interruzioni.\nDa migliorare: alla call sono arrivato senza agenda.' });
  s.saveEntry({ date: t, text: 'Oggi preparato l\'agenda prima della call con Roland, è filata molto meglio.\nPoi 2h di analisi esplorativa su Buildtrust.' });
  const wk = U.weekOfYmd(y);
  s.applyAnalysis(e1.id, {
    tasks: [
      { title: 'Fix bug timestamp pipeline ingestion', minutes: 180, prj_gid: '1213896228686081', week: wk, done: true, confidence: 0.92, evidence: 'sistemato il bug sui timestamp (3h)' },
      { title: 'Call con Stadler sul nuovo dashboard', minutes: 60, prj_gid: '1213872916151083', week: wk, done: true, confidence: 0.85, evidence: 'call con Stadler per il nuovo dashboard' },
      { title: 'Preparare proposta dashboard', minutes: 0, prj_gid: '', week: wk, done: false, confidence: 0.4, evidence: 'nuovo dashboard' },
    ],
    summary: { strengths: ['Hai chiuso un bug complesso lavorando senza interruzioni'], improvements: ['Preparare un\'agenda prima delle call con i clienti'] },
    goals: { updates: [], proposals: [{ title: 'Preparare un\'agenda per ogni call con clienti', description: 'Agenda condivisa prima di ogni call esterna.' }] },
  });
  const g = s.listGoals()[0]; s.setGoalStatus(g.id, 'active');
  s.applyAnalysis(s.listEntries()[0].id, { goals: { updates: [{ goal_id: g.id, progress: 35, trend: 'up', evidence: 'preparato l\'agenda prima della call', comment: 'Primo passo concreto: agenda preparata e call più efficace.' }], proposals: [] } });
  s.setSetting('myProjects', ['1213896228686081', '1213872916151083']);
  require('../src/main/main.js');
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('did-finish-load', async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(2500);
      fs.writeFileSync(path.join(out, 'diario.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('[data-act=open-entry]:not(.on)') && document.querySelectorAll('.ent')[1].click()");
      await wait(800);
      fs.writeFileSync(path.join(out, 'diario-analisi.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('[data-v=projects]').click()");
      await wait(800);
      fs.writeFileSync(path.join(out, 'progetti.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('[data-act=settings]').click()");
      await wait(500);
      fs.writeFileSync(path.join(out, 'impostazioni.png'), (await win.webContents.capturePage()).toPNG());
      const errs = await win.webContents.executeJavaScript('window.__errs||[]');
      console.log('shots ok', errs);
      app.quit();
    });
    win.webContents.on('console-message', (_e, lvl, msg) => console.log('[renderer]', msg));
  });
})();
