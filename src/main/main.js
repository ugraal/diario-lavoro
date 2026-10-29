'use strict';
const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { Secrets } = require('./secrets');
const { readOnlyView } = require('./contracts/secret-store');
const { Asana } = require('./asana');
const { createConnector } = require('./llm/connect');
const { Service } = require('./service');
const { weekLabel } = require('../shared/util');

let win, store, secrets, asana, service;

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 500,
    title: 'Diario di lavoro',
    backgroundColor: '#EDF0F3',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // I link esterni (Asana) si aprono nel browser di sistema.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
}

// Ogni handler restituisce { ok, data } oppure { ok:false, error }, così il renderer mostra messaggi puliti.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  });
}

function goalsWithUpdates() {
  return store.listGoals().map((g) => Object.assign(g, { updates: store.goalUpdates(g.id).slice(0, 5) }));
}

function registerIpc() {
  // Con configurazione LLM non valida init risponde lo stesso: llm.error porta il messaggio per il renderer.
  handle('init', () => {
    const llm = service.llmStatus();
    return {
      dataDir: app.getPath('userData'), version: app.getVersion(), week: weekLabel(new Date()),
      myProjects: store.getSetting('myProjects', []), model: llm.model, secrets: secrets.status(),
      llm: { label: llm.label, endpoint: llm.endpoint, error: llm.error, warnings: llm.warnings },
    };
  });

  handle('entries:list', () => store.listEntries());
  handle('entries:detail', (id) => ({ entry: store.getEntry(id), tasks: store.tasksOfEntry(id), updates: store.updatesOfEntry(id) }));
  handle('entries:save', (e) => {
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) throw new Error('Data non valida');
    return store.saveEntry({ id: e.id, date: e.date, text: String(e.text || '') });
  });
  handle('entries:delete', (id) => { store.deleteEntry(id); return true; });
  handle('entries:analyze', (id) => service.analyzeEntry(id));

  handle('tasks:list', () => store.listTasks());
  handle('tasks:update', (id, patch) => {
    const t = store.getTask(id);
    if (!t) throw new Error('Attività non trovata');
    if (t.status === 'synced' || t.status === 'sending') throw new Error('Attività già inviata ad Asana: modificala lì');
    // Con esito incerto la sottoattività potrebbe già esistere: prima si ritenta (che controlla su Asana), poi si modifica.
    if (t.status === 'uncertain' && !(patch && patch.status === 'discarded')) throw new Error('Prima premi Riprova: controllo su Asana se l\'attività è già arrivata');
    const p = Object.assign({}, patch);
    // Una modifica riporta l'attività in bozza, salvo scarto o ripristino esplicito.
    if (!('status' in p)) { p.status = 'draft'; p.error = ''; p.candidates = null; }
    if ('status' in p && !['draft', 'discarded'].includes(p.status)) delete p.status;
    if ('minutes' in p) p.minutes = Math.max(0, Math.min(1440, Math.round(Number(p.minutes) || 0)));
    if ('week' in p) p.week = String(p.week || '').trim().toUpperCase();
    return store.updateTask(id, p);
  });
  handle('tasks:sync', (id) => service.syncTask(id));
  handle('tasks:pick', (id, parent) => service.syncTask(id, { gid: String(parent.gid), name: String(parent.name || '') }));

  handle('goals:list', () => goalsWithUpdates());
  handle('goals:setStatus', (id, status) => { store.setGoalStatus(id, status); return goalsWithUpdates(); });

  handle('prj:options', (force) => service.prjOptions({ force: !!force }));
  handle('settings:myProjects', (list) => { store.setSetting('myProjects', (list || []).map(String)); return true; });
  handle('settings:model', (model) => service.setModel(model));
  handle('secrets:set', (name, value) => {
    if (!['anthropic', 'asana'].includes(name)) throw new Error('Segreto sconosciuto');
    secrets.set(name, value); if (name === 'asana') asana.reset();
    return secrets.status();
  });
  handle('asana:test', async () => { asana.reset(); const me = await asana.me(); return me.name || me.email || me.gid; });
  handle('llm:test', () => service.testLlm());
  handle('data:export', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Esporta i dati', defaultPath: 'diario-lavoro-' + new Date().toISOString().slice(0, 10) + '.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(store.exportAll(), null, 1));
    return r.filePath;
  });
  handle('data:openFolder', () => shell.openPath(app.getPath('userData')));
}

app.whenReady().then(async () => {
  const dir = app.getPath('userData');
  store = await Store.open(path.join(dir, 'diario.sqlite'));
  secrets = new Secrets(dir, safeStorage);
  asana = new Asana({ secrets: readOnlyView(secrets, ['asana']), secretName: 'asana' });
  const root = path.join(__dirname, '..', '..');
  const connector = createConnector({
    configFile: path.join(root, 'config', 'llm.json'), pluginDir: path.join(root, 'plugin'), secrets,
    logRun: (r) => store.logRun(r), getSettingsRoutes: () => store.getSetting('routes', {}),
  });
  service = new Service({ store, connector, asana });
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
