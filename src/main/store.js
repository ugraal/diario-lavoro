// Storage locale su SQLite (sql.js, WebAssembly). Il DB vive in memoria e viene
// scritto su disco a ogni modifica, con scrittura atomica.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, analyzed_at TEXT,
  strengths TEXT, improvements TEXT
);
CREATE INDEX IF NOT EXISTS entries_date ON entries(date);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, entry_id TEXT, title TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0,
  prj_gid TEXT NOT NULL DEFAULT '', week TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft', confidence REAL, evidence TEXT, llm_original TEXT,
  asana_gid TEXT, asana_url TEXT, asana_parent_gid TEXT, asana_parent_name TEXT,
  candidates TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_entry ON tasks(entry_id);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed', progress INTEGER NOT NULL DEFAULT 0, trend TEXT NOT NULL DEFAULT 'flat',
  source_entry_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goal_updates (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, entry_id TEXT, progress INTEGER, trend TEXT,
  evidence TEXT, comment TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS goal_updates_goal ON goal_updates(goal_id);
CREATE TABLE IF NOT EXISTS llm_runs (
  id TEXT PRIMARY KEY, task TEXT, provider TEXT, model TEXT, entry_id TEXT,
  input TEXT, output TEXT, error TEXT, ms INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

const JSON_COLS = { entries: ['strengths', 'improvements'], tasks: ['llm_original', 'candidates'], llm_runs: ['input', 'output'] };
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const j = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const pj = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch { return null; } };

class Store {
  static async open(file) {
    const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
    const buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const s = new Store(new SQL.Database(buf), file);
    s.db.exec(SCHEMA);
    s.persist();
    return s;
  }
  constructor(db, file) { this.db = db; this.file = file; }

  persist() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }
  all(sql, params = {}, table) {
    const st = this.db.prepare(sql);
    st.bind(params);
    const out = [];
    while (st.step()) out.push(this.decode(st.getAsObject(), table));
    st.free();
    return out;
  }
  one(sql, params, table) { return this.all(sql, params, table)[0] || null; }
  run(sql, params = {}) { this.db.run(sql, params); }
  tx(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); this.persist(); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  decode(row, table) {
    (JSON_COLS[table] || []).forEach((c) => { if (c in row) row[c] = pj(row[c]); });
    if (table === 'tasks' && 'done' in row) row.done = !!row.done;
    return row;
  }

  /* ---------- impostazioni ---------- */
  getSetting(key, def = null) { const r = this.one('SELECT value FROM settings WHERE key=$k', { $k: key }); return r ? pj(r.value) : def; }
  setSetting(key, value) { this.tx(() => this.run('INSERT OR REPLACE INTO settings(key,value) VALUES($k,$v)', { $k: key, $v: j(value) })); }

  /* ---------- diario ---------- */
  listEntries() { return this.all('SELECT * FROM entries ORDER BY date DESC, created_at DESC', {}, 'entries'); }
  getEntry(id) { return this.one('SELECT * FROM entries WHERE id=$id', { $id: id }, 'entries'); }
  saveEntry({ id, date, text }) {
    const t = now();
    return this.tx(() => {
      if (id && this.getEntry(id)) {
        this.run('UPDATE entries SET date=$d, text=$x, updated_at=$t WHERE id=$id', { $d: date, $x: text, $t: t, $id: id });
      } else {
        id = id || uid();
        this.run('INSERT INTO entries(id,date,text,created_at,updated_at) VALUES($id,$d,$x,$t,$t)', { $id: id, $d: date, $x: text, $t: t });
      }
      return this.getEntry(id);
    });
  }
  deleteEntry(id) {
    this.tx(() => {
      this.run("DELETE FROM tasks WHERE entry_id=$id AND status IN ('draft','discarded','error','pick')", { $id: id });
      this.run('DELETE FROM goal_updates WHERE entry_id=$id', { $id: id });
      this.run("DELETE FROM goals WHERE source_entry_id=$id AND status='proposed'", { $id: id });
      this.run('DELETE FROM entries WHERE id=$id', { $id: id });
    });
  }

  /* ---------- attività ---------- */
  listTasks() { return this.all('SELECT * FROM tasks ORDER BY created_at DESC', {}, 'tasks'); }
  tasksOfEntry(id) { return this.all('SELECT * FROM tasks WHERE entry_id=$id ORDER BY created_at', { $id: id }, 'tasks'); }
  getTask(id) { return this.one('SELECT * FROM tasks WHERE id=$id', { $id: id }, 'tasks'); }
  updateTask(id, patch) {
    const allowed = ['title', 'minutes', 'prj_gid', 'week', 'done', 'status', 'asana_gid', 'asana_url', 'asana_parent_gid', 'asana_parent_name', 'candidates', 'error'];
    const sets = [], p = { $id: id, $t: now() };
    Object.keys(patch).forEach((k) => {
      if (!allowed.includes(k)) return;
      let v = patch[k];
      if (k === 'candidates') v = j(v);
      if (k === 'done') v = v ? 1 : 0;
      sets.push(k + '=$' + k); p['$' + k] = v === undefined ? null : v;
    });
    if (!sets.length) return this.getTask(id);
    this.tx(() => this.run('UPDATE tasks SET ' + sets.join(',') + ', updated_at=$t WHERE id=$id', p));
    return this.getTask(id);
  }

  /* ---------- obiettivi ---------- */
  listGoals() { return this.all("SELECT * FROM goals ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 WHEN 'achieved' THEN 2 ELSE 3 END, created_at", {}, 'goals'); }
  activeGoals() { return this.all("SELECT * FROM goals WHERE status='active' ORDER BY created_at", {}, 'goals'); }
  goalUpdates(goalId) { return this.all('SELECT * FROM goal_updates WHERE goal_id=$g ORDER BY created_at DESC', { $g: goalId }); }
  updatesOfEntry(entryId) { return this.all('SELECT u.*, g.title AS goal_title FROM goal_updates u JOIN goals g ON g.id=u.goal_id WHERE u.entry_id=$e', { $e: entryId }); }
  setGoalStatus(id, status) {
    if (!['proposed', 'active', 'achieved', 'dropped'].includes(status)) throw new Error('Stato obiettivo non valido');
    this.tx(() => this.run('UPDATE goals SET status=$s, updated_at=$t WHERE id=$id', { $s: status, $t: now(), $id: id }));
  }

  /* ---------- risultato di un'analisi ---------- */
  // Sostituisce tutto ciò che una precedente analisi della stessa voce aveva prodotto
  // (bozze, aggiornamenti, proposte non ancora accettate). Le attività già inviate o scartate restano.
  // Le parti non fornite (undefined) restano come sono: serve quando un compito fallisce e gli altri no.
  applyAnalysis(entryId, { tasks, summary, goals }) {
    const t = now();
    return this.tx(() => {
      if (tasks) {
        this.run("DELETE FROM tasks WHERE entry_id=$e AND status IN ('draft','error','pick')", { $e: entryId });
        tasks.forEach((x) => {
          this.run(`INSERT INTO tasks(id,entry_id,title,minutes,prj_gid,week,done,status,confidence,evidence,llm_original,created_at,updated_at)
            VALUES($id,$e,$ti,$m,$p,$w,$d,'draft',$c,$ev,$o,$t,$t)`,
            { $id: uid(), $e: entryId, $ti: x.title, $m: x.minutes || 0, $p: x.prj_gid || '', $w: x.week || '', $d: x.done ? 1 : 0,
              $c: x.confidence == null ? null : x.confidence, $ev: x.evidence || '', $o: j(x.original || null), $t: t });
        });
      }
      if (summary) {
        this.run('UPDATE entries SET strengths=$s, improvements=$i WHERE id=$e',
          { $s: j(summary.strengths || []), $i: j(summary.improvements || []), $e: entryId });
      }
      if (goals) {
        this.run('DELETE FROM goal_updates WHERE entry_id=$e', { $e: entryId });
        this.run("DELETE FROM goals WHERE source_entry_id=$e AND status='proposed'", { $e: entryId });
        (goals.updates || []).forEach((u) => {
          this.run('INSERT INTO goal_updates(id,goal_id,entry_id,progress,trend,evidence,comment,created_at) VALUES($id,$g,$e,$p,$tr,$ev,$c,$t)',
            { $id: uid(), $g: u.goal_id, $e: entryId, $p: u.progress, $tr: u.trend, $ev: u.evidence || '', $c: u.comment || '', $t: t });
          this.run('UPDATE goals SET progress=$p, trend=$tr, updated_at=$t WHERE id=$g', { $p: u.progress, $tr: u.trend, $t: t, $g: u.goal_id });
        });
        (goals.proposals || []).forEach((g) => {
          this.run("INSERT INTO goals(id,title,description,status,progress,trend,source_entry_id,created_at,updated_at) VALUES($id,$ti,$d,'proposed',0,'flat',$e,$t,$t)",
            { $id: uid(), $ti: g.title, $d: g.description || '', $e: entryId, $t: t });
        });
      }
      this.run('UPDATE entries SET analyzed_at=$t WHERE id=$e', { $t: t, $e: entryId });
      return this.getEntry(entryId);
    });
  }

  /* ---------- log LLM ---------- */
  logRun(r) {
    this.tx(() => this.run('INSERT INTO llm_runs(id,task,provider,model,entry_id,input,output,error,ms,created_at) VALUES($id,$ta,$p,$m,$e,$i,$o,$er,$ms,$t)',
      { $id: uid(), $ta: r.task, $p: r.provider, $m: r.model, $e: r.entryId || null, $i: j(r.input), $o: j(r.output), $er: r.error || null, $ms: r.ms || 0, $t: now() }));
  }

  /* ---------- export ---------- */
  exportAll() {
    return {
      app: 'diario-lavoro', version: 1, exported: now(),
      entries: this.all('SELECT * FROM entries ORDER BY date', {}, 'entries'),
      tasks: this.all('SELECT * FROM tasks ORDER BY created_at', {}, 'tasks'),
      goals: this.all('SELECT * FROM goals ORDER BY created_at', {}, 'goals'),
      goal_updates: this.all('SELECT * FROM goal_updates ORDER BY created_at'),
      llm_runs: this.all('SELECT * FROM llm_runs ORDER BY created_at', {}, 'llm_runs'),
    };
  }
}

module.exports = { Store };
