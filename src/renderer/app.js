(function () {
'use strict';
const U = window.Util;

/* ---------- utilità ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDay = (s, o) => U.parseYmd(s).toLocaleDateString('it-IT', o || { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (s) => U.parseYmd(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const opts = (list, val) => list.map((x) => '<option value="' + esc(x[0]) + '"' + (x[0] === val ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('');
const TREND = { up: ['▲', 'in miglioramento'], flat: ['●', 'stabile'], down: ['▼', 'in calo'] };
const OPEN_ST = ['draft', 'error', 'pick', 'uncertain', 'sending'];

async function call(ch, ...args) {
  const r = await window.api.invoke(ch, ...args);
  if (!r || !r.ok) throw new Error((r && r.error) || 'Errore');
  return r.data;
}
function toast(msg, ms) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms || 2800);
}

/* ---------- stato ---------- */
const S = {
  init: null, view: 'diary', entries: [], tasks: [], goals: [], prj: { options: [], source: '' },
  cur: null,              // { id, date, text } voce aperta
  detail: { tasks: [], updates: [] },
  save: '', saveTimer: null, analyzing: false,
  filt: { week: 'current', closed: false },
  modal: null, confirm: '',
};
const prjName = (gid) => { const o = S.prj.options.find((x) => x.gid === gid); return o ? o.name : ''; };
const isMine = (gid) => (S.init.myProjects || []).includes(gid);
const toReview = () => S.tasks.filter((t) => OPEN_ST.includes(t.status)).length;

/* ---------- caricamento ---------- */
async function boot() {
  try {
    S.init = await call('init');
    [S.entries, S.tasks, S.goals, S.prj] = await Promise.all([call('entries:list'), call('tasks:list'), call('goals:list'), call('prj:options')]);
  } catch (e) { document.getElementById('app').innerHTML = '<div class="loading">Errore all\'avvio: ' + esc(e.message) + '</div>'; return; }
  const t = U.today();
  const todays = S.entries.find((e) => e.date === t);
  if (todays) await openEntry(todays.id, true); else newEntry(true);
  render();
  const s = S.init.secrets;
  if (S.init.llm && S.init.llm.error) { openSettings(); toast(S.init.llm.error); return; }
  if (!s.anthropic.set || !s.asana.set) openSettings();
}
async function refreshLists() {
  [S.entries, S.tasks, S.goals] = await Promise.all([call('entries:list'), call('tasks:list'), call('goals:list')]);
  if (S.cur && S.cur.id) S.detail = await call('entries:detail', S.cur.id).then((d) => ({ tasks: d.tasks, updates: d.updates, entry: d.entry }));
}

/* ---------- diario: voci ---------- */
function newEntry(silent) {
  const t = U.today();
  const ex = S.entries.find((e) => e.date === t);
  if (ex && !silent) { openEntry(ex.id); return; }
  S.cur = { id: null, date: t, text: '' }; S.detail = { tasks: [], updates: [] }; S.save = '';
  if (!silent) { S.view = 'diary'; render(); focusEditor(); }
}
async function openEntry(id, silent) {
  await flushSave();
  const d = await call('entries:detail', id);
  if (!d.entry) return;
  S.cur = { id: d.entry.id, date: d.entry.date, text: d.entry.text };
  S.detail = { tasks: d.tasks, updates: d.updates, entry: d.entry }; S.save = '';
  if (!silent) { S.view = 'diary'; render(); }
}
function scheduleSave() {
  S.save = 'pending'; paintSave();
  clearTimeout(S.saveTimer); S.saveTimer = setTimeout(flushSave, 800);
}
async function flushSave() {
  clearTimeout(S.saveTimer);
  if (S.save !== 'pending' || !S.cur) return;
  if (!S.cur.id && !S.cur.text.trim()) { S.save = ''; paintSave(); return; }
  S.save = 'saving'; paintSave();
  try {
    const e = await call('entries:save', S.cur);
    const wasNew = !S.cur.id;
    S.cur.id = e.id; S.detail.entry = e;
    S.entries = await call('entries:list');
    S.save = 'saved'; paintSave();
    if (wasNew) paintEntryList();
    else paintEntryList();
  } catch (err) { S.save = 'error'; S.saveErr = err.message; paintSave(); }
}
async function analyze() {
  if (!S.cur || !S.cur.text.trim()) { toast('Scrivi qualcosa prima di analizzare'); return; }
  if (S.save === 'pending' || !S.cur.id) { S.save = 'pending'; await flushSave(); }
  if (!S.cur.id) return;
  S.analyzing = true; render();
  try {
    const r = await call('entries:analyze', S.cur.id);
    await refreshLists();
    toast(r.errors && r.errors.length ? 'Analisi parziale. ' + r.errors.join('; ') : 'Analisi completata', r.errors && r.errors.length ? 6000 : 2800);
  } catch (e) { toast('Analisi non riuscita: ' + e.message, 6000); }
  S.analyzing = false; render();
}
async function deleteEntry() {
  if (!S.cur || !S.cur.id) { newEntry(true); render(); return; }
  if (S.confirm !== 'del-entry') { S.confirm = 'del-entry'; render(); setTimeout(() => { if (S.confirm === 'del-entry') { S.confirm = ''; render(); } }, 3500); return; }
  S.confirm = '';
  await call('entries:delete', S.cur.id);
  await refreshLists(); newEntry(true); render(); toast('Voce eliminata. Le attività già inviate ad Asana restano');
}

/* ---------- attività ---------- */
async function updateTask(id, patch) {
  try {
    const t = await call('tasks:update', id, patch);
    S.tasks = S.tasks.map((x) => (x.id === id ? t : x));
    S.detail.tasks = S.detail.tasks.map((x) => (x.id === id ? t : x));
    render();
  } catch (e) { toast(e.message); render(); }
}
async function syncTask(id, parent) {
  const set = (t) => { S.tasks = S.tasks.map((x) => (x.id === t.id ? t : x)); S.detail.tasks = S.detail.tasks.map((x) => (x.id === t.id ? t : x)); };
  const cur = S.tasks.find((x) => x.id === id); if (cur) set(Object.assign({}, cur, { status: 'sending', error: '' }));
  render();
  try {
    const t = parent ? await call('tasks:pick', id, parent) : await call('tasks:sync', id);
    set(t);
    if (t.status === 'synced') toast('Inviata ad Asana');
  } catch (e) { toast(e.message); S.tasks = await call('tasks:list'); }
  render();
}
async function syncReady(ids) {
  if (!ids.length) { toast('Nessuna attività pronta: servono progetto e settimana'); return; }
  for (const id of ids) await syncTask(id);
  const ok = S.tasks.filter((t) => ids.includes(t.id) && t.status === 'synced').length;
  toast(ok + ' su ' + ids.length + ' inviate ad Asana');
}

/* ---------- obiettivi ---------- */
async function setGoal(id, status) {
  try { S.goals = await call('goals:setStatus', id, status); render(); }
  catch (e) { toast(e.message); }
}

/* ---------- render ---------- */
const root = document.getElementById('app');
function render() {
  const a = document.activeElement;
  const keep = a && a.id && root.contains(a) ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const scrolls = Array.from(root.querySelectorAll('[data-scroll]')).map((el) => [el.dataset.scroll, el.scrollTop]);
  root.innerHTML = topbar() + (S.view === 'diary' ? diaryView() : projectsView());
  scrolls.forEach(([k, v]) => { const el = root.querySelector('[data-scroll="' + k + '"]'); if (el) el.scrollTop = v; });
  if (keep) { const n = document.getElementById(keep.id); if (n) { n.focus({ preventScroll: true }); try { if (keep.s != null) n.setSelectionRange(keep.s, keep.e); } catch (e) { /* non testuale */ } } }
  paintSave();
  renderModal();
}
function topbar() {
  const n = toReview();
  return '<header class="top"><div class="brand"><span class="brand-mark"></span>Diario di lavoro</div>' +
    '<nav class="tabs"><button class="tab" data-act="view" data-v="diary"' + (S.view === 'diary' ? ' aria-current="page"' : '') + '>Diario</button>' +
    '<button class="tab" data-act="view" data-v="projects"' + (S.view === 'projects' ? ' aria-current="page"' : '') + '>Progetti' + (n ? '<span class="cnt" title="Attività da rivedere">' + n + '</span>' : '') + '</button></nav>' +
    '<span class="spacer"></span><span class="wk" title="Settimana ISO corrente">' + esc(S.init.week) + '</span>' +
    '<button class="btn sm quiet" data-act="settings">Impostazioni</button></header>';
}

/* --- vista Diario --- */
function diaryView() {
  return '<div class="diary">' + '<aside class="col-l" data-scroll="l" id="entry-list">' + entryList() + '</aside>' +
    '<main class="col-c" data-scroll="c">' + editor() + analysisBlock() + '</main>' +
    '<aside class="col-r" data-scroll="r">' + goalsPanel() + '</aside></div>';
}
function entryList() {
  const t = U.today();
  const hasToday = S.entries.some((e) => e.date === t) || (S.cur && !S.cur.id && S.cur.date === t);
  let h = '<button class="btn primary" style="width:100%" data-act="new-entry">' + (hasToday ? 'Nuova voce' : 'Scrivi la voce di oggi') + '</button>';
  h += '<div class="rail-h">Voci</div>';
  if (S.cur && !S.cur.id) h += '<button class="ent on"><span class="d">' + esc(cap(fmtShort(S.cur.date))) + '</span><span class="p">Nuova, non ancora salvata</span></button>';
  h += S.entries.map((e) => {
    const on = S.cur && S.cur.id === e.id;
    const first = (e.text || '').trim().split('\n')[0] || '(vuota)';
    return '<button class="ent' + (on ? ' on' : '') + '" data-act="open-entry" data-id="' + esc(e.id) + '"><span class="d">' + esc(cap(fmtShort(e.date))) + (e.analyzed_at ? '<span class="dot" title="Analizzata"></span>' : '') + '</span><span class="p">' + esc(first) + '</span></button>';
  }).join('');
  if (!S.entries.length && !(S.cur && !S.cur.id)) h += '<p class="hint" style="padding:6px 10px">Nessuna voce ancora.</p>';
  return h;
}
function paintEntryList() { const el = document.getElementById('entry-list'); if (el) el.innerHTML = entryList(); }
function editor() {
  const c = S.cur;
  const head = '<div class="ed-head"><label class="hint" for="e-date">Data</label><input class="in" type="date" id="e-date" data-bind="date" value="' + esc(c.date) + '">' +
    '<span class="hint">' + esc(cap(fmtDay(c.date))) + ' · ' + esc(U.weekOfYmd(c.date)) + '</span></div>';
  return '<h1 class="h1" style="margin-bottom:12px">Diario</h1><div class="editor">' + head +
    '<label class="sr" for="e-text" hidden>Testo del diario</label>' +
    '<textarea id="e-text" data-bind="text" placeholder="Cosa hai fatto oggi, su quali progetti e per quanto tempo? Cosa è andato bene? Cosa miglioreresti?\n\nScrivi liberamente: le attività, i progetti e le ore le ricava l\'analisi.">' + esc(c.text) + '</textarea>' +
    '<div class="ed-foot"><button class="btn primary" data-act="analyze"' + (S.analyzing ? ' disabled' : '') + '>' + (S.analyzing ? 'Analisi in corso…' : (S.detail.entry && S.detail.entry.analyzed_at ? 'Analizza di nuovo' : 'Analizza')) + '</button>' +
    '<span id="savestat" class="savestat"></span><span class="spacer"></span>' +
    (c.id ? '<button class="btn sm quiet danger" data-act="del-entry">' + (S.confirm === 'del-entry' ? 'Conferma eliminazione' : 'Elimina voce') + '</button>' : '') + '</div></div>';
}
function paintSave() {
  const el = document.getElementById('savestat'); if (!el) return;
  const m = { pending: 'Modifiche non salvate', saving: 'Salvataggio…', saved: 'Salvato sul tuo computer', error: 'Non salvato: ' + (S.saveErr || '') };
  el.textContent = m[S.save] || ''; el.className = 'savestat' + (S.save === 'error' ? ' err' : '');
}
function analysisBlock() {
  const e = S.detail.entry;
  if (!e || !e.analyzed_at) return '<p class="hint" style="margin-top:14px">Quando hai finito, premi Analizza: ricavo attività, progetti e ore, il bilancio della giornata e l\'avanzamento dei tuoi obiettivi. Niente va su Asana senza una tua conferma.</p>';
  const st = e.strengths || [], im = e.improvements || [];
  const changed = e.updated_at > e.analyzed_at;
  let h = '<div class="sec"><h2>Analisi</h2><span class="hint">alle ' + esc(fmtTime(e.analyzed_at)) + (changed ? ' · il testo è cambiato dopo l\'analisi' : '') + '</span></div>';
  h += '<div class="cols2"><div class="card"><strong>Punti di forza</strong>' + (st.length ? '<ul class="list">' + st.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="hint">Nessuno rilevato.</p>') + '</div>' +
    '<div class="card"><strong>Spunti di miglioramento</strong>' + (im.length ? '<ul class="list">' + im.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="hint">Nessuno rilevato.</p>') + '</div></div>';
  const ts = S.detail.tasks || [];
  const tot = ts.filter((t) => t.status !== 'discarded').reduce((a, t) => a + (t.minutes || 0), 0);
  h += '<div class="sec"><h2>Attività</h2><span class="hint">' + ts.length + ' ricavate' + (tot ? ' · ' + esc(U.fmtDur(tot)) + ' in totale' : '') + '</span>' +
    (ts.some((t) => OPEN_ST.includes(t.status)) ? '<button class="btn sm" data-act="view" data-v="projects">Rivedi e invia ad Asana</button>' : '') + '</div>';
  h += ts.length ? '<ul class="tasks">' + ts.map((t) => '<li class="task ro' + (t.status === 'discarded' ? ' disc' : '') + '"><div class="ttl-ro">' + esc(t.title) + '</div><div class="l2">' + taskChips(t) + '</div></li>').join('') + '</ul>' : '<div class="empty">Nessuna attività ricavata.</div>';
  const ups = S.detail.updates || [];
  if (ups.length) {
    h += '<div class="sec"><h2>Obiettivi</h2><span class="hint">come questa giornata li ha mossi</span></div>' +
      ups.map((u) => '<div class="card"><strong>' + esc(u.goal_title) + '</strong> <span class="trend-' + esc(u.trend) + '">' + TREND[u.trend][0] + ' ' + u.progress + '/100</span><div>' + esc(u.comment) + '</div>' + (u.evidence ? '<div class="quote">«' + esc(u.evidence) + '»</div>' : '') + '</div>').join('');
  }
  return h;
}
function taskChips(t) {
  let c = '';
  c += t.prj_gid ? '<span class="chip team">' + esc(prjName(t.prj_gid) || 'PRJ ' + t.prj_gid) + '</span>' : '<span class="chip warn">Senza progetto</span>';
  if (t.week) c += '<span class="chip">' + esc(t.week) + '</span>';
  if (t.minutes) c += '<span class="chip good">' + esc(U.fmtDur(t.minutes)) + '</span>';
  if (!t.done) c += '<span class="chip ext">Da fare</span>';
  c += statusChip(t);
  return c;
}
function statusChip(t) {
  switch (t.status) {
    case 'synced': return '<span class="chip good" title="' + esc(t.asana_parent_name || '') + '">Su Asana</span>' + (t.asana_url ? '<a class="chip" href="' + esc(t.asana_url) + '" target="_blank" rel="noopener">Apri in Asana</a>' : '');
    case 'sending': return '<span class="chip">Invio ad Asana…</span>';
    case 'discarded': return '<span class="chip">Scartata</span>';
    case 'error': return '<span class="chip bad">' + esc(t.error || 'Errore') + '</span>';
    case 'uncertain': return '<span class="chip warn">' + esc(t.error || 'Esito incerto') + '</span>';
    case 'pick': return '<span class="chip warn">Più task padre possibili, scegline uno</span>';
    default: return (t.confidence != null && t.confidence < 0.6) ? '<span class="chip warn" title="L\'analisi non è sicura: controlla">Da verificare</span>' : '';
  }
}
function goalsPanel() {
  const act = S.goals.filter((g) => g.status === 'active'), prop = S.goals.filter((g) => g.status === 'proposed'), closed = S.goals.filter((g) => g.status === 'achieved' || g.status === 'dropped');
  let h = '<h2 style="font-size:17px;font-weight:750">Obiettivi di miglioramento</h2><p class="hint" style="margin:2px 0 12px">Vengono rivalutati a ogni analisi del diario.</p>';
  if (prop.length) h += '<div class="rail-h" style="padding-left:0">Proposti dall\'analisi</div>' + prop.map((g) => '<div class="goal prop"><div class="t">' + esc(g.title) + '</div>' + (g.description ? '<div class="desc">' + esc(g.description) + '</div>' : '') +
    '<div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="goal" data-id="' + esc(g.id) + '" data-v="active"' + (act.length >= 5 ? ' disabled title="Hai già 5 obiettivi attivi"' : '') + '>Accetta</button><button class="btn sm quiet" data-act="goal" data-id="' + esc(g.id) + '" data-v="dropped">Scarta</button></div></div>').join('');
  h += '<div class="rail-h" style="padding-left:0">Attivi (' + act.length + '/5)</div>';
  h += act.length ? act.map((g) => {
    const last = (g.updates || [])[0];
    return '<div class="goal"><div class="t">' + esc(g.title) + '</div>' + (g.description ? '<div class="desc">' + esc(g.description) + '</div>' : '') +
      '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, g.progress)) + '%"></i></div>' +
      '<div class="hint"><span class="trend-' + esc(g.trend) + '">' + TREND[g.trend][0] + ' ' + TREND[g.trend][1] + '</span> · ' + g.progress + '/100</div>' +
      (last ? '<div style="font-size:13px;margin-top:4px">' + esc(last.comment) + '</div>' : '') +
      '<div class="row" style="margin-top:6px"><button class="btn sm quiet" data-act="goal" data-id="' + esc(g.id) + '" data-v="achieved">Raggiunto</button><button class="btn sm quiet" data-act="goal" data-id="' + esc(g.id) + '" data-v="dropped">Abbandona</button></div></div>';
  }).join('') : '<div class="empty">Nessun obiettivo attivo. L\'analisi ne propone quando emergono dal diario.</div>';
  if (closed.length) h += '<details style="margin-top:12px"><summary class="hint" style="cursor:pointer">Chiusi (' + closed.length + ')</summary>' + closed.map((g) => '<div class="goal"><div class="t">' + esc(g.title) + '</div><div class="hint">' + (g.status === 'achieved' ? 'Raggiunto' : 'Abbandonato') + '</div><button class="btn sm quiet" data-act="goal" data-id="' + esc(g.id) + '" data-v="active">Riattiva</button></div>').join('') + '</details>';
  return h;
}

/* --- vista Progetti --- */
function projectsView() {
  const wk = S.init.week, f = S.filt;
  const inWeek = (t) => f.week === 'all' || t.week === wk || (f.week === 'current' && OPEN_ST.includes(t.status));
  const open = S.tasks.filter((t) => OPEN_ST.includes(t.status));
  const sent = S.tasks.filter((t) => t.status === 'synced' && inWeek(t));
  const disc = S.tasks.filter((t) => t.status === 'discarded' && inWeek(t));
  const ready = open.filter((t) => t.prj_gid && /^W\d{1,2}$/i.test(t.week) && ['draft', 'error'].includes(t.status)).map((t) => t.id);
  const weekMin = S.tasks.filter((t) => t.week === wk && t.status !== 'discarded').reduce((a, t) => a + (t.minutes || 0), 0);
  let h = '<main class="proj scroll" data-scroll="p"><h1 class="h1">Progetti</h1>' +
    '<p class="hint" style="margin-top:4px">Rivedi le attività ricavate dal diario, correggi progetto, settimana e durata, poi inviale ad Asana come sottoattività del task padre della settimana.' + (weekMin ? ' In ' + esc(wk) + ' hai registrato ' + esc(U.fmtDur(weekMin)) + '.' : '') + '</p>' +
    '<div class="filters"><select class="in" data-filt="week">' + opts([['current', 'Settimana corrente (' + wk + ')'], ['all', 'Tutte le settimane']], f.week) + '</select>' +
    '<label class="chk"><input type="checkbox" data-filt="closed"' + (f.closed ? ' checked' : '') + '>Mostra inviate e scartate</label>' +
    '<span class="spacer"></span><button class="btn primary" data-act="sync-ready" data-ids="' + esc(ready.join(',')) + '"' + (ready.length ? '' : ' disabled') + '>Invia ad Asana le pronte (' + ready.length + ')</button></div>';
  h += '<div class="sec"><h2>Da rivedere</h2><span class="hint">' + open.length + ' attività</span></div>';
  h += open.length ? grouped(open, editRow) : '<div class="empty">Niente da rivedere. Scrivi nel diario e premi Analizza.</div>';
  if (f.closed) {
    h += '<div class="sec"><h2>Inviate ad Asana</h2><span class="hint">' + sent.length + '</span></div>' + (sent.length ? grouped(sent, roRow) : '<div class="empty">Nessuna in questo periodo.</div>');
    h += '<div class="sec"><h2>Scartate</h2><span class="hint">' + disc.length + '</span></div>' + (disc.length ? grouped(disc, roRow) : '<div class="empty">Nessuna in questo periodo.</div>');
  }
  return h + '</main>';
}
function grouped(list, rowFn) {
  const by = {};
  list.forEach((t) => { (by[t.prj_gid || ''] = by[t.prj_gid || ''] || []).push(t); });
  const keys = Object.keys(by).sort((a, b) => {
    if (!a) return -1; if (!b) return 1;
    if (isMine(a) !== isMine(b)) return isMine(a) ? -1 : 1;
    return (prjName(a) || a).localeCompare(prjName(b) || b, 'it');
  });
  return keys.map((k) => {
    const min = by[k].reduce((a, t) => a + (t.minutes || 0), 0);
    return '<div class="grp"><h3 class="grp-h">' + esc(k ? (prjName(k) || 'PRJ ' + k) : 'Senza progetto') + '<span class="n">' + by[k].length + (min ? ' · ' + esc(U.fmtDur(min)) : '') + '</span></h3><ul class="tasks">' + by[k].map(rowFn).join('') + '</ul></div>';
  }).join('');
}
function prjSelect(t) {
  const mine = S.prj.options.filter((o) => isMine(o.gid)), rest = S.prj.options.filter((o) => !isMine(o.gid));
  const sel = (o) => '<option value="' + esc(o.gid) + '"' + (o.gid === t.prj_gid ? ' selected' : '') + '>' + esc(o.name) + '</option>';
  return '<select class="in" data-task="' + esc(t.id) + '" data-f="prj_gid" aria-label="Progetto PRJ"><option value="">Progetto…</option>' +
    (mine.length ? '<optgroup label="I miei progetti">' + mine.map(sel).join('') + '</optgroup><optgroup label="Altri">' + rest.map(sel).join('') + '</optgroup>' : rest.map(sel).join('')) + '</select>';
}
function entryLink(t) {
  const e = S.entries.find((x) => x.id === t.entry_id);
  return e ? '<button class="linkbtn hint" data-act="open-entry" data-id="' + esc(e.id) + '">dal diario di ' + esc(fmtShort(e.date)) + '</button>' : '';
}
function editRow(t) {
  const busy = t.status === 'sending';
  const id = esc(t.id);
  let h = '<li class="task"><div class="l1"><input class="in ttl" id="tt-' + id + '" data-task="' + id + '" data-f="title" value="' + esc(t.title) + '" aria-label="Titolo"' + (busy ? ' disabled' : '') + '>' +
    '<div class="row"><button class="btn sm primary" data-act="sync" data-id="' + id + '"' + (busy ? ' disabled' : '') + '>' + (t.status === 'uncertain' ? 'Riprova' : 'Invia') + '</button>' +
    '<button class="btn sm quiet" data-act="discard" data-id="' + id + '"' + (busy ? ' disabled' : '') + '>Scarta</button></div></div>' +
    '<div class="l2">' + prjSelect(t) +
    '<input class="in w-wk" id="wk-' + id + '" data-task="' + id + '" data-f="week" value="' + esc(t.week) + '" placeholder="W44" aria-label="Settimana">' +
    '<input class="in w-dur" id="du-' + id + '" data-task="' + id + '" data-f="minutes" value="' + esc(U.fmtDur(t.minutes)) + '" placeholder="1h30" aria-label="Durata">' +
    '<label class="chk"><input type="checkbox" data-task="' + id + '" data-f="done"' + (t.done ? ' checked' : '') + '>Fatta</label>' +
    statusChip(t) + entryLink(t) + '</div>';
  if (t.status === 'pick') h += '<div class="l2">' + (t.candidates || []).map((c) => '<button class="chip btnchip" data-act="pick" data-id="' + id + '" data-g="' + esc(c.gid) + '" data-n="' + esc(c.name) + '" title="' + (c.planned ? 'Task pianificato' : 'Contenitore') + '">' + esc(c.name.length > 50 ? c.name.slice(0, 50) + '…' : c.name) + (c.assignee ? ' (' + esc(c.assignee) + ')' : '') + '</button>').join('') + '</div>';
  if (t.evidence) h += '<div class="quote">«' + esc(t.evidence) + '»</div>';
  return h + '</li>';
}
function roRow(t) {
  return '<li class="task ro' + (t.status === 'discarded' ? ' disc' : '') + '"><div class="l1"><div class="ttl-ro">' + esc(t.title) + '</div>' +
    (t.status === 'discarded' ? '<button class="btn sm quiet" data-act="restore" data-id="' + esc(t.id) + '">Ripristina</button>' : '<span></span>') + '</div>' +
    '<div class="l2">' + taskChips(t) + entryLink(t) + '</div></li>';
}

/* --- impostazioni --- */
// Nota sulla privacy: mostra l'endpoint effettivo letto da init.llm { label, endpoint, error, warnings }.
function llmNote(llm) {
  llm = llm || {};
  const resto = 'Tutto il resto (diario, attività, obiettivi) resta solo su questo computer. Su Asana arrivano soltanto titolo, durata e data delle attività che invii tu.';
  let h = '';
  if (llm.error) h += '<div class="note-box" style="color:var(--warn)">' + esc(llm.error) + ' Le funzioni di analisi non sono disponibili finché non la correggi.</div><div class="note-box">' + resto + '</div>';
  else h += '<div class="note-box">Il testo del diario viene inviato a: ' + esc(llm.label || 'servizio LLM') + (llm.endpoint ? ' (' + esc(llm.endpoint) + ')' : '') + ' per l\'analisi. ' + resto + '</div>';
  (llm.warnings || []).forEach((w) => { h += '<div class="hint" style="color:var(--warn)">Avviso: ' + esc(w) + '</div>'; });
  return h;
}
function openSettings() { S.modal = { kind: 'settings', msg: {} }; renderModal(); }
function renderModal() {
  const r = document.getElementById('modal-root');
  if (!S.modal) { r.innerHTML = ''; return; }
  const s = S.init.secrets, m = S.modal.msg || {};
  const sec = (name, label, help) => '<div class="field"><label for="sk-' + name + '">' + label + (s[name].set ? ' · impostata (' + esc(s[name].hint) + ')' + (s[name].fromEnv ? ' da variabile d\'ambiente' : '') : ' · non impostata') + '</label>' +
    '<div class="row"><input class="in" style="flex:1" type="password" id="sk-' + name + '" autocomplete="off" placeholder="' + (s[name].set ? 'Lascia vuoto per non cambiarla' : 'Incolla qui') + '">' +
    '<button class="btn" data-act="secret-save" data-n="' + name + '">Salva</button><button class="btn quiet" data-act="secret-test" data-n="' + name + '"' + (s[name].set ? '' : ' disabled') + '>Prova</button></div>' +
    '<div class="hint">' + help + '</div>' + (m[name] ? '<div class="hint" style="color:var(--ink)">' + esc(m[name]) + '</div>' : '') + '</div>';
  const mine = new Set(S.init.myProjects || []);
  r.innerHTML = '<div class="overlay" data-act="close-modal"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="m-t" data-stop="1">' +
    '<div class="row"><h2 id="m-t">Impostazioni</h2><span class="spacer"></span><button class="btn quiet" data-act="close-modal">Chiudi</button></div>' +
    (s.encryption ? '' : '<div class="note-box" style="color:var(--warn)">Il portachiavi del sistema non è disponibile: le chiavi vengono salvate senza cifratura nella cartella dati.</div>') +
    '<h3>Claude</h3>' + sec('anthropic', 'API key Anthropic', 'Una chiave dell\'organizzazione Console collegata al piano Team di Statwolf (Console → API keys).') +
    '<div class="field"><label for="mdl">Modello</label><div class="row"><input class="in" id="mdl" value="' + esc(S.init.model) + '"><button class="btn" data-act="model-save">Salva</button></div></div>' +
    llmNote(S.init.llm) +
    '<h3>Asana</h3>' + sec('asana', 'Personal Access Token Asana', 'Asana → Impostazioni → App → Gestisci app sviluppatore → Crea un nuovo token.') +
    '<h3>I miei progetti</h3><p class="hint">Vengono messi in cima agli elenchi e suggeriti per primi all\'analisi. Elenco PRJ: ' + (S.prj.source === 'asana' ? 'letto da Asana' : 'di riserva (collega Asana per aggiornarlo)') + '.</p>' +
    '<div class="grid-prj">' + S.prj.options.slice().sort((a, b) => a.name.localeCompare(b.name, 'it')).map((o) => '<label class="chk"><input type="checkbox" data-mine="' + esc(o.gid) + '"' + (mine.has(o.gid) ? ' checked' : '') + '>' + esc(o.name) + '</label>').join('') + '</div>' +
    '<button class="btn sm" data-act="prj-reload">Ricarica elenco da Asana</button>' +
    '<h3>Dati</h3><p class="hint">Cartella dati: ' + esc(S.init.dataDir) + '</p><div class="row" style="margin-top:8px"><button class="btn" data-act="export">Esporta tutto in JSON</button><button class="btn quiet" data-act="open-folder">Apri la cartella</button></div>' +
    '<p class="hint" style="margin-top:6px">L\'export è anche il backup: conservalo in un posto sicuro. Contiene il diario, le attività, gli obiettivi e le chiamate all\'LLM.</p>' +
    '</div></div>';
}
async function secretSave(name) {
  const el = document.getElementById('sk-' + name); const v = el ? el.value.trim() : '';
  if (!v) { S.modal.msg[name] = 'Incolla prima la chiave'; renderModal(); return; }
  try {
    S.init.secrets = await call('secrets:set', name, v);
    S.modal.msg[name] = 'Salvata.';
    if (name === 'asana') { S.prj = await call('prj:options', true); }
  } catch (e) { S.modal.msg[name] = e.message; }
  renderModal();
}
async function secretTest(name) {
  S.modal.msg[name] = 'Provo…'; renderModal();
  try { const r = await call(name === 'asana' ? 'asana:test' : 'llm:test'); S.modal.msg[name] = name === 'asana' ? 'Collegato come ' + r + '.' : 'Funziona.'; }
  catch (e) { S.modal.msg[name] = e.message; }
  renderModal();
}

/* ---------- eventi ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'close-modal' && e.target.closest('[data-stop]') && !e.target.closest('button')) return;
  switch (act) {
    case 'view': await flushSave(); S.view = el.dataset.v; if (S.view === 'projects') S.tasks = await call('tasks:list'); render(); break;
    case 'settings': openSettings(); break;
    case 'close-modal': S.modal = null; renderModal(); break;
    case 'new-entry': await flushSave(); newEntry(false); break;
    case 'open-entry': await openEntry(id); break;
    case 'analyze': analyze(); break;
    case 'del-entry': deleteEntry(); break;
    case 'goal': setGoal(id, el.dataset.v); break;
    case 'sync': syncTask(id); break;
    case 'pick': syncTask(id, { gid: el.dataset.g, name: el.dataset.n }); break;
    case 'sync-ready': syncReady((el.dataset.ids || '').split(',').filter(Boolean)); break;
    case 'discard': updateTask(id, { status: 'discarded' }); break;
    case 'restore': updateTask(id, { status: 'draft' }); break;
    case 'secret-save': secretSave(el.dataset.n); break;
    case 'secret-test': secretTest(el.dataset.n); break;
    case 'model-save': try { S.init.model = await call('settings:model', document.getElementById('mdl').value); toast('Modello salvato'); } catch (err) { toast(err.message); } break;
    case 'prj-reload': try { S.prj = await call('prj:options', true); renderModal(); toast(S.prj.source === 'asana' ? 'Elenco aggiornato da Asana' : 'Asana non raggiungibile: uso l\'elenco di riserva'); } catch (err) { toast(err.message); } break;
    case 'export': try { const p = await call('data:export'); if (p) toast('Esportato in ' + p, 5000); } catch (err) { toast(err.message); } break;
    case 'open-folder': call('data:openFolder'); break;
  }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.bind === 'text' && S.cur) { S.cur.text = el.value; scheduleSave(); }
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.bind === 'date' && S.cur) {
    if (!el.value) return;
    S.cur.date = el.value; S.save = 'pending'; await flushSave(); render(); return;
  }
  if (el.dataset.filt) { S.filt[el.dataset.filt] = el.type === 'checkbox' ? el.checked : el.value; render(); return; }
  if (el.dataset.mine !== undefined) {
    const list = Array.from(document.querySelectorAll('[data-mine]')).filter((x) => x.checked).map((x) => x.dataset.mine);
    try { await call('settings:myProjects', list); S.init.myProjects = list; } catch (err) { toast(err.message); }
    return;
  }
  if (el.dataset.task) {
    const f = el.dataset.f; let v;
    if (f === 'done') v = el.checked;
    else if (f === 'minutes') { v = U.parseDur(el.value); if (isNaN(v)) { toast('Durata non riconosciuta: usa per esempio 1h30, 45min o 90'); render(); return; } }
    else if (f === 'title') { v = el.value.trim(); if (!v) { toast('Il titolo non può essere vuoto'); render(); return; } }
    else v = el.value;
    updateTask(el.dataset.task, { [f]: v });
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; renderModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.id === 'e-text') { e.preventDefault(); analyze(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (S.cur) { S.save = 'pending'; flushSave(); } }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.task && e.target.tagName === 'INPUT') e.target.blur();
});
window.addEventListener('beforeunload', () => { if (S.save === 'pending') flushSave(); });

function focusEditor() { const t = document.getElementById('e-text'); if (t) t.focus(); }
boot();
})();
