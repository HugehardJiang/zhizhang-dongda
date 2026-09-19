const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const copy = value => JSON.parse(JSON.stringify(value));
function harness() {
  const el = () => ({ value: '', textContent: '', innerHTML: '', dataset: {}, selectedOptions: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, replaceChildren() {}, querySelector() { return null; }, querySelectorAll() { return []; }, remove() {} });
  const elements = new Map();
  const profiles = new Map();
  let upload, read, active = '', sequence = 0;
  const api = {
    fail: '', loadPersonalCache() { return ''; }, request() {},
    cacheBeginWrite(id, student, length) { upload = { id, student, length, text: '' }; return '{"ok":true}'; },
    cacheWriteChunk(id, offset, chunk) {
      if (api.fail === 'chunk') return '{"ok":false,"error":"分块失败"}';
      assert.equal(id, upload.id); assert.equal(offset, upload.text.length); assert.ok(chunk.length <= 32768);
      upload.text += chunk; return '{"ok":true}';
    },
    cacheCommitWrite(id) {
      if (api.fail === 'commit') return '{"ok":false,"error":"磁盘已满"}';
      if (api.fail === 'receipt') return '{"ok":true,"requestId":"old"}';
      assert.equal(id, upload.id); assert.equal(upload.text.length, upload.length);
      const payload = JSON.parse(upload.text);
      const previous = profiles.get(upload.student);
      profiles.set(upload.student, { ...payload, termSnapshots: { ...previous?.termSnapshots, ...payload.termSnapshots } });
      active = upload.student;
      return JSON.stringify({ ok: true, requestId: id });
    },
    cacheAbortWrite() { upload = null; },
    cacheBeginRead(student) {
      const value = profiles.get(student || active);
      read = { id: String(++sequence), text: value ? JSON.stringify(value) : '' };
      return JSON.stringify({ ok: true, readId: read.id, length: read.text.length });
    },
    cacheReadChunk(id, offset) { assert.equal(id, read.id); return api.fail === 'read' ? '' : read.text.slice(offset, offset + 32768); },
    cacheEndRead() { read = null; },
    cacheClearProfile(student) {
      if (api.fail === 'clear') return '{"ok":false,"error":"清除失败"}';
      profiles.delete(student); return '{"ok":true}';
    }
  };
  const context = {
    console, Blob, URL, URLSearchParams, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval() {}, clearInterval() {},
    AndroidApi: api, navigator: {}, location: { href: 'file:///android_asset/dashboard.html' },
    document: { documentElement: el(), getElementById(id) { if (!elements.has(id)) elements.set(id, el()); return elements.get(id); },
      querySelector() { return null; }, querySelectorAll() { return []; }, createElement: el },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: async () => { throw new Error('offline'); }, addEventListener() {}, open() {}
  };
  context.window = context;
  let code = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
  code = code.replace(/\n\/\/ 桌面扩展保持原有的自动刷新[\s\S]*$/, '\n');
  code += `\nglobalThis.t = { state, emptyPersonalData, reconcileScheduleSources, inspectScheduleResponse,
    cacheSafeValue, cacheTermSnapshot, applyCachedTermSnapshot, persistPersonalCache, hydratePersonalCache,
    readPersonalCacheEnvelope, personalCacheStatusText, schoolPersonalScheduleRows, courseArrangementRows,
    courseIndexForScope, renderCourseRowsTable, schoolScheduleOccurrenceKey, clearPersonalCache,
    loadTermData, setRequests(home, grid) { getHome=home; postNativeScheduleDetail=grid;
      loadFullScores=async()=>[]; loadAllScoreRows=async()=>({rows:[]}); getScore=async()=>({}); },
    setSequence(n) { refreshRequestSequence=n; }, scheduleExportRows };`;
  vm.runInNewContext(code, context, { filename: 'dashboard.js' });
  return { t: context.t, api, profiles, elements };
}

const { t, api, profiles } = harness();
const ok = value => ({ status: 'fulfilled', value });
const failed = { status: 'rejected' };
const raw = { courseName: 'MATLAB实验', courseCode: 'MAT2', teachClassId: 'CLASS-MAT2',
  weeks: '6周', dayOfWeek: 4, teacherName: '测试教师', campusName: '南湖校区', placeName: '信息学馆250' };
const morning = { ...raw, beginSection: 1, endSection: 2 };
const afternoon = { ...raw, beginSection: 5, endSection: 6 };
const now1 = '2026-09-19T10:00:00.000Z';
const now2 = '2026-09-20T10:00:00.000Z';
function setData(value) { t.state.data = { ...t.emptyPersonalData(), ...value }; }
function meetings() { return copy(t.schoolPersonalScheduleRows()).map(row => [row.courseId, row.weekday, row.section, row.weeks, row.teacher, row.location, row.campus]); }

const initial = t.reconcileScheduleSources(null, ok([morning]), ok([morning, afternoon]), now1);
assert.equal(initial.scheduleDetail.length, 2);
setData(initial);
const expected = meetings();
for (const [list, grid] of [[ok([morning]), failed], [failed, ok([morning, afternoon])], [failed, failed], [ok([morning]), ok([])]]) {
  const partial = t.reconcileScheduleSources(initial, list, grid, now2);
  setData(partial);
  assert.deepEqual(meetings(), expected, 'partial refresh must preserve both meetings');
  assert.equal(partial.scheduleSync.complete, false);
}
const partial = t.reconcileScheduleSources(initial, ok([morning]), failed, now2);
assert.equal(partial.scheduleSources.grid.updatedAt, now1);
assert.equal(partial.scheduleSources.list.updatedAt, now2);
const emptyOnce = t.reconcileScheduleSources(initial, ok([]), ok([]), now2);
assert.equal(emptyOnce.scheduleDetail.length, 2);
const emptyTwice = t.reconcileScheduleSources(emptyOnce, ok([]), ok([]), '2026-09-21T10:00:00.000Z');
assert.equal(emptyTwice.scheduleDetail.length, 0, 'confirmed cancellations remove old meetings');
const explicitEmpty = t.reconcileScheduleSources(initial, ok({ rows: [], total: 0 }), ok({ rows: [], total: 0 }), now2);
assert.equal(explicitEmpty.scheduleDetail.length, 0);
for (const value of [{}, null, { error: true }, { code: 500, data: [] }, { authenticated: false }, { rows: [morning], total: 3 }]) {
  assert.equal(t.inspectScheduleResponse(ok(value), 'list').ok, false);
}

setData(initial);
t.state.studentId = '20250001'; t.state.termCode = 'TERM-A'; t.state.view = 'personal'; t.state.connected = true;
t.state.terms = [{ code: 'TERM-A', name: '学期 A' }, { code: 'TERM-B', name: '学期 B' }];
assert.equal(t.persistPersonalCache(), true);
const diskInitial = copy(profiles.get('20250001'));
const savedAt = t.state.personalCache.savedAt;
assert.ok(!JSON.stringify(diskInitial).includes('sourceCourseIndex'));
assert.ok(!JSON.stringify(diskInitial).includes('"raw"'));
for (let cycle = 0; cycle < 4; cycle++) {
  const snapshot = copy(profiles.get('20250001'));
  t.state.personalCache.termSnapshots = snapshot.termSnapshots;
  t.applyCachedTermSnapshot('TERM-A');
  assert.deepEqual(meetings(), expected);
  assert.ok(t.renderCourseRowsTable(t.state.data.courses, false, 'personal').includes('2 条安排'));
  assert.equal(t.scheduleExportRows().length, 2);
  assert.equal(t.persistPersonalCache(), true);
}
// Stable references are independent of array order, including same-name classes.
const other = { ...morning, teachClassId: 'CLASS-OTHER' };
const distinct = t.reconcileScheduleSources(null, ok([morning, other]), ok([morning, afternoon, other]), now2);
setData(distinct);
assert.equal(t.state.data.courses.length, 2);
const owned = t.state.data.courses[0];
t.state.data.courses.reverse();
t.state.data.scheduleDetail.reverse();
assert.equal(t.courseArrangementRows(owned).length, 2);
assert.equal(t.courseIndexForScope(owned), 1);
const key = t.schoolScheduleOccurrenceKey(t.state.data.scheduleDetail[0]);
assert.equal(t.schoolScheduleOccurrenceKey(copy(t.state.data.scheduleDetail[0])), key);

// Failure must not change committed time/content or report success.
const beforeFailure = JSON.stringify(profiles.get('20250001'));
const beforeTime = t.state.personalCache.savedAt;
for (const fail of ['chunk', 'commit', 'receipt']) {
  api.fail = fail;
  assert.equal(t.persistPersonalCache(), false);
  assert.equal(t.state.personalCache.savedAt, beforeTime);
  assert.equal(JSON.stringify(profiles.get('20250001')), beforeFailure);
  assert.match(t.personalCacheStatusText(), /未保存/);
}
api.fail = '';

// Other terms/accounts survive a save; no 2,000-row truncation or 900 KiB trim.
setData(initial); t.state.termCode = 'TERM-B';
assert.equal(t.persistPersonalCache(), true);
assert.ok(profiles.get('20250001').termSnapshots['TERM-A']);
const huge = Array.from({ length: 2501 }, (_, i) => ({ name: `课程${i}`, description: '字'.repeat(180) }));
assert.equal(t.cacheSafeValue(huge).length, 2501);
t.state.data.scores = huge;
assert.equal(t.persistPersonalCache(), true);
assert.equal(profiles.get('20250001').termSnapshots['TERM-B'].scores.length, 2501);
assert.ok(Buffer.byteLength(JSON.stringify(profiles.get('20250001'))) > 900 * 1024);
assert.equal(JSON.parse(t.readPersonalCacheEnvelope('20250001')).termSnapshots['TERM-B'].scores.length, 2501);
api.fail = 'read'; assert.throws(() => t.readPersonalCacheEnvelope('20250001'), /不完整/); api.fail = '';
assert.equal(t.readPersonalCacheEnvelope('20250002'), '');
t.state.studentId = '20250002';
t.state.personalCache = { ...t.state.personalCache, termSnapshots: {}, allScores: [], scoreDetails: {} };
setData(initial); assert.equal(t.persistPersonalCache(), true);
assert.ok(profiles.get('20250001').termSnapshots['TERM-B']);
api.fail = 'clear'; assert.equal(t.clearPersonalCache(), false); assert.ok(profiles.has('20250002'));
api.fail = ''; t.clearPersonalCache(); assert.ok(!profiles.has('20250002')); assert.ok(profiles.has('20250001'));

// Legacy data survives until both sources have succeeded; migration is lossless.
t.state.studentId = '20250001'; t.state.termCode = 'TERM-A';
const legacy = copy(diskInitial.termSnapshots['TERM-A']); delete legacy.scheduleSources;
for (const row of [...legacy.courses, ...legacy.scheduleDetail]) delete row.courseRecordVersion;
const retained = t.reconcileScheduleSources(legacy, ok([morning]), failed, now2);
assert.equal(retained.scheduleDetail.length, 2);
assert.ok(retained.scheduleSources.legacy);
const baseline = t.reconcileScheduleSources(retained, failed, ok([morning, afternoon]), now2);
assert.ok(!baseline.scheduleSources.legacy);
assert.equal(baseline.scheduleDetail.length, 2);
setData(baseline);
t.state.personalCache.termSnapshots = { 'TERM-A': legacy, 'TERM-B': legacy };
t.state.personalCache.needsMigration = true;
assert.equal(t.persistPersonalCache(), true);
assert.equal(profiles.get('20250001').termSnapshots['TERM-B'].scheduleDetail.length, 2);

(async () => {
  // Exercise loadTermData integration: a real partial refresh must use sources,
  // not the old OR-of-endpoint-success branch. Then switch terms mid-request.
  t.setSequence(7);
  t.state.personalCache.termSnapshots = { 'TERM-A': t.cacheTermSnapshot() };
  t.state.personalCache.studentId = '20250001';
  t.setRequests(async endpoint => endpoint === 'student/courses.do' ? [morning] : [], async () => { throw new Error('offline grid'); });
  assert.equal(await t.loadTermData(7), true);
  assert.equal(t.state.data.scheduleDetail.length, 2);
  assert.equal(t.state.data.scheduleSources.grid.status, 'stale');
  assert.match(t.personalCacheStatusText(), /更新失败/);
  let resolveGrid;
  t.setRequests(async () => [], () => new Promise(resolve => { resolveGrid = resolve; }));
  const inFlight = t.loadTermData(7);
  t.state.termCode = 'TERM-B';
  const currentData = t.state.data;
  resolveGrid([other]);
  assert.equal(await inFlight, false);
  assert.equal(t.state.data, currentData);
  console.log('cache reliability tests: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
