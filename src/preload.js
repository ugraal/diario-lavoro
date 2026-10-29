'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set([
  'init', 'entries:list', 'entries:detail', 'entries:save', 'entries:delete', 'entries:analyze',
  'tasks:list', 'tasks:update', 'tasks:sync', 'tasks:pick', 'goals:list', 'goals:setStatus',
  'prj:options', 'settings:myProjects', 'settings:model', 'secrets:set', 'asana:test', 'llm:test',
  'data:export', 'data:openFolder',
]);

contextBridge.exposeInMainWorld('api', {
  invoke(channel, ...args) {
    if (!CHANNELS.has(channel)) return Promise.resolve({ ok: false, error: 'Canale non consentito: ' + channel });
    return ipcRenderer.invoke(channel, ...args);
  },
});
