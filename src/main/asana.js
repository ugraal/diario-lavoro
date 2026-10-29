// Client REST Asana e logica del task padre settimanale (portata dal Monitor progetti).
'use strict';
const CFG = require('./asana-config');

const BASE = 'https://app.asana.com/api/1.0';

class AsanaError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

class Asana {
  // secrets: ISecretReader (vista in sola lettura); il token si legge solo da lì.
  constructor({ secrets, secretName = 'asana', fetch: fetchImpl } = {}) {
    this.secrets = secrets; this.secretName = secretName;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.cache = { me: null, ws: null, prj: null, parents: new Map() };
  }
  getToken() { return this.secrets.get(this.secretName); }
  hasToken() { return !!this.getToken(); }
  reset() { this.cache = { me: null, ws: null, prj: null, parents: new Map() }; }

  async req(method, path, { query, body } = {}) {
    const token = this.getToken();
    if (!token) throw new AsanaError('Token Asana mancante: impostalo nelle Impostazioni', 'no_token');
    const url = new URL(BASE + path);
    Object.entries(query || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
    let res;
    try {
      res = await this.fetch(url.toString(), {
        method,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify({ data: body }) : undefined,
      });
    } catch (e) {
      throw new AsanaError('Asana non raggiungibile: ' + String(e && e.message || e).slice(0, 120), 'network');
    }
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const msg = json && json.errors && json.errors[0] && json.errors[0].message;
      const map = { 401: 'Token Asana non valido o scaduto', 402: 'Funzione disponibile solo con Asana a pagamento', 403: 'Permessi Asana insufficienti', 404: 'Elemento non trovato su Asana', 429: 'Troppe richieste ad Asana, riprova tra poco' };
      const code = res.status === 404 ? 'not_found' : res.status >= 500 ? 'server' : 'http_' + res.status;
      throw new AsanaError((map[res.status] || 'Errore Asana ' + res.status) + (msg ? ': ' + String(msg).slice(0, 160) : ''), code, res.status);
    }
    return json ? json.data : null;
  }

  async me() {
    if (!this.cache.me) this.cache.me = await this.req('GET', '/users/me', { query: { opt_fields: 'gid,name,email' } });
    return this.cache.me;
  }
  async workspace() {
    if (!this.cache.ws) {
      const p = await this.req('GET', '/projects/' + CFG.project, { query: { opt_fields: 'workspace.gid' } });
      this.cache.ws = p && p.workspace && p.workspace.gid;
      if (!this.cache.ws) throw new AsanaError('Workspace del progetto PRIORITÀ non trovato', 'no_ws');
    }
    return this.cache.ws;
  }

  // Opzioni del campo PRJ. Ritorna sempre un elenco: in caso di errore usa quello di riserva.
  async prjOptions({ force } = {}) {
    if (this.cache.prj && !force) return this.cache.prj;
    try {
      const p = await this.req('GET', '/projects/' + CFG.project, {
        query: { opt_fields: 'custom_field_settings.custom_field.gid,custom_field_settings.custom_field.enum_options.gid,custom_field_settings.custom_field.enum_options.name,custom_field_settings.custom_field.enum_options.enabled' },
      });
      const cf = ((p && p.custom_field_settings) || []).map((s) => s.custom_field).find((c) => c && c.gid === CFG.prjField);
      const opts = ((cf && cf.enum_options) || []).filter((o) => o.enabled !== false).map((o) => ({ gid: o.gid, name: o.name }));
      if (opts.length) { this.cache.prj = { source: 'asana', options: opts }; return this.cache.prj; }
    } catch (e) {
      return { source: 'fallback', options: CFG.prjFallback, error: e.message };
    }
    return { source: 'fallback', options: CFG.prjFallback };
  }

  // Task padre della settimana per un PRJ: prima tra i miei, poi tra tutti.
  async findParents(prjGid, week) {
    const key = prjGid + '|' + week;
    if (this.cache.parents.has(key)) return this.cache.parents.get(key);
    const ws = await this.workspace();
    const me = await this.me();
    const look = async (mine) => {
      const query = {
        'projects.any': CFG.project,
        ['custom_fields.' + CFG.prjField + '.value']: prjGid,
        is_subtask: false, completed: false, limit: 100,
        opt_fields: 'name,assignee.name,custom_fields.gid,custom_fields.display_value',
      };
      if (mine) query['assignee.any'] = me.gid;
      const rows = (await this.req('GET', '/workspaces/' + ws + '/tasks/search', { query })) || [];
      return rows.filter((r) => weekHas(cfOf(r, CFG.weekField), week)).map((r) => ({
        gid: r.gid, name: String(r.name || '').slice(0, 120), planned: !!cfOf(r, CFG.plannedField), assignee: (r.assignee && r.assignee.name) || '',
      }));
    };
    let c = await look(true);
    if (!c.length) c = await look(false);
    if (c.length) this.cache.parents.set(key, c);
    return c;
  }

  async subtasks(parentGid) {
    return (await this.req('GET', '/tasks/' + parentGid + '/subtasks', { query: { opt_fields: 'name,permalink_url' } })) || [];
  }

  async createSubtask(parentGid, { name, notes, dueOn, minutes, completed }) {
    const data = { name, notes, assignee: 'me' };
    if (dueOn) data.due_on = dueOn;
    if (minutes) data.custom_fields = { [CFG.timeField]: Math.round(minutes) };
    if (completed) data.completed = true;
    return this.req('POST', '/tasks/' + parentGid + '/subtasks', { body: data, query: { opt_fields: 'gid,permalink_url,name' } });
  }
}

function cfOf(row, gid) { const f = (row.custom_fields || []).find((c) => c.gid === gid); return f ? f.display_value : null; }
function weekHas(v, week) { return typeof v === 'string' && v.split(/[\s,;]+/).map((s) => s.toUpperCase()).indexOf(String(week).toUpperCase()) >= 0; }
// Un candidato: quello. Più candidati: l'unico non pianificato, se c'è. Altrimenti decide la persona.
function pickParent(c) {
  if (c.length === 1) return c[0];
  const un = c.filter((x) => !x.planned);
  return un.length === 1 ? un[0] : null;
}

module.exports = { Asana, AsanaError, pickParent, weekHas };
