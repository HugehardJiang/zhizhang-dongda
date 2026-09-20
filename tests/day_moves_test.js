const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const elements = new Map(), storage = new Map();
const el = () => ({ value: '', dataset: {}, selectedOptions: [], classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
let failWrite = false;
const context = { console, Blob, URL, URLSearchParams, TextEncoder, TextDecoder,
  setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  navigator: {}, location: { href: 'chrome-extension://test/dashboard.html' },
  localStorage: { getItem(key) { return storage.get(key) || null; }, setItem(key, value) {
    if (failWrite) throw Error('disk full'); storage.set(key, value);
  } },
  document: { documentElement: el(), getElementById(id) { if (!elements.has(id)) elements.set(id, el()); return elements.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, createElement: el },
  addEventListener() {}, fetch: async () => { throw Error('offline'); } };
context.window = context;
let code = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
code = code.replace(/\n\/\/ 桌面扩展保持原有的自动刷新[\s\S]*$/, '\n');
code += `\nglobalThis.t = { state, applyDayMoves, filterCoursesForDate, normalizeDayMoves, dayMovesForTerm,
  localSchedulePayload, saveLocalSchedule, hydrateLocalSchedule, localScheduleItemToCourseRow,
  mergedPersonalScheduleRows, scheduleExportRows, scheduleExportFilteredRows, filterScheduleWeekRows,
  localScheduleCsvEntries, renderDayMovesModal, handleDayMoveAction, normalizeLocalScheduleItem,
  noRender() { render = () => {}; } };`;
vm.runInNewContext(code, context);
const t = context.t, s = t.state;
t.noRender();
s.termCode = '2026-2027-1';
s.studentId = 'test-A'; s.localSchedule.profileKey = 'test-A';
s.calendar.firstWeekStart = '2026-08-30';
const rule = (from, to, id = from) => ({ id, termCode: s.termCode, from, to });
const monday = { name: '周一课程', code: 'MON', courseRecordVersion: 1, occurrenceRecord: true,
  weekday: '周一', weeks: '1-8周', section: '第1-2节', time: '08:00-09:40', teacher: '教师', location: '教201' };
const saturday = { ...monday, name: '周六课程', code: 'SAT', weekday: '周六' };
const original = [monday, saturday];
const originalJSON = JSON.stringify(original);
const move = rule('2026-09-07', '2026-09-19'); // week 2 Monday to week 3 Saturday
const names = (rows, date) => Array.from(t.filterCoursesForDate(rows, date), row => row.name);
let moved = t.applyDayMoves(original, [move]);
assert.deepEqual(names(moved, move.from), []);
assert.deepEqual(names(moved, move.to).sort(), ['周一课程', '周六课程']);
assert.deepEqual(names(moved, '2026-09-14'), ['周一课程']);
assert.deepEqual(names(moved, '2026-08-31'), ['周一课程']);
assert.equal(JSON.stringify(original), originalJSON, 'no mutation of source data');
const shifted = moved.find(row => row.dayMoveDate);
assert.equal(shifted.weeks, '3周'); assert.equal(shifted.location, monday.location);
assert.equal(shifted.teacher, monday.teacher); assert.equal(shifted.time, monday.time);

const swap = [move, rule(move.to, move.from)];
moved = t.applyDayMoves(original, swap);
assert.deepEqual(names(moved, move.from), ['周六课程']);
assert.deepEqual(names(moved, move.to), ['周一课程']);
const chain = [move, rule(move.to, '2026-09-20')];
moved = t.applyDayMoves(original, chain);
assert.deepEqual(names(moved, move.to), ['周一课程'], 'no cascading');
assert.deepEqual(names(moved, '2026-09-20'), ['周六课程']);
moved = t.applyDayMoves(original, [move, rule('2026-09-14', move.to)]);
assert.equal(names(moved, move.to).filter(name => name === '周一课程').length, 2);
assert.deepEqual(names(moved, '2026-09-14'), []);
assert.deepEqual(names(t.applyDayMoves(original, []), move.from), ['周一课程']);

const unknownWeeks = { ...monday, weeks: '' };
const exceptional = t.applyDayMoves([unknownWeeks], [move]);
assert.equal(names(exceptional, move.from).length, 0);
assert.equal(names(exceptional, '2026-09-14').length, 1);
s.scheduleWeek.personal = '2';
assert.equal(t.filterScheduleWeekRows(exceptional).length, 0);
assert.equal(t.scheduleExportFilteredRows(exceptional, '2').length, 0);
assert.equal(t.scheduleExportFilteredRows(exceptional, '3').length, 2);
s.calendar.firstWeekStart = '';
assert.equal(t.applyDayMoves(original, [move]), original, 'do not guess calendar');
s.calendar.firstWeekStart = '2026-08-30';
assert.equal(t.normalizeDayMoves([move, move, {}, rule('2026-02-30', move.to), rule(move.to, move.to)]).length, 1);

const local = t.normalizeLocalScheduleItem({ id: 'local-course', title: '自定义课', type: 'course', enabled: true,
  termCode: s.termCode, course: { weekdayIndex: 1, weekNumbers: [2, 3], startSection: 3, endSection: 4 } });
const event = t.normalizeLocalScheduleItem({ id: 'event', title: '约会', type: 'event', enabled: true,
  termCode: s.termCode, event: { date: move.from, startTime: '18:00', endTime: '19:00' } });
s.localSchedule.items = [local, event];
s.localSchedule.dayMoves = [move];
s.data.courses = [monday, saturday]; s.data.scheduleDetail = [];
moved = t.mergedPersonalScheduleRows();
assert.deepEqual(names(moved, move.from), ['约会']);
assert.ok(names(moved, move.to).includes('自定义课'));
assert.equal(t.scheduleExportRows().filter(row => row.dayMoveDate).length, 2);
const csv = t.localScheduleCsvEntries();
assert.ok(csv.some(row => row.courseName === '周一课程' && row.weekday === '6' && row.weekText === '3周'));
assert.ok(csv.some(row => row.courseName === '自定义课' && row.weekday === '6'));
local.excludedDates = [move.from];
assert.ok(!names(t.mergedPersonalScheduleRows(), move.to).includes('自定义课'), 'respect original exceptions');
local.excludedDates = [move.to];
assert.ok(names(t.mergedPersonalScheduleRows(), move.to).includes('自定义课'), 'target exceptions do not cancel moved class');
s.localSchedule.dayMovesOpen = true;
assert.match(t.renderDayMovesModal(), /删除并恢复/);

(async () => {
  const dataBefore = JSON.stringify(s.data);
  await t.saveLocalSchedule(t.localSchedulePayload());
  await t.hydrateLocalSchedule('test-A', true);
  assert.equal(t.dayMovesForTerm().length, 1, 'offline reload');
  assert.equal(names(t.mergedPersonalScheduleRows(), move.from).filter(name => name === '周一课程').length, 0);
  s.termCode = 'other-term'; assert.equal(t.dayMovesForTerm().length, 0);
  s.termCode = move.termCode;
  await t.hydrateLocalSchedule('test-B', true); assert.equal(t.dayMovesForTerm().length, 0);
  await t.hydrateLocalSchedule('test-A', true);
  elements.get('dayMoveFrom') || context.document.getElementById('dayMoveFrom');
  context.document.getElementById('dayMoveFrom').value = move.from;
  context.document.getElementById('dayMoveTo').value = '2026-09-20';
  await t.handleDayMoveAction('save-day-move', {});
  assert.match(s.localSchedule.dayMoveError, /已经调课/);
  context.document.getElementById('dayMoveFrom').value = '2026-09-14';
  failWrite = true;
  await t.handleDayMoveAction('save-day-move', {});
  assert.equal(t.dayMovesForTerm().length, 1); assert.match(s.localSchedule.dayMoveError, /保存失败/);
  await t.handleDayMoveAction('delete-day-move', { dataset: { moveId: move.id } });
  assert.equal(t.dayMovesForTerm().length, 1, 'failed deletion leaves original rules');
  failWrite = false;
  await t.handleDayMoveAction('save-day-move', {});
  assert.equal(t.dayMovesForTerm().length, 2);
  await t.handleDayMoveAction('delete-day-move', { dataset: { moveId: move.id } });
  assert.equal(t.dayMovesForTerm().length, 1);
  assert.equal(JSON.stringify(s.data), dataBefore, 'school data never modified');
  console.log('day moves tests: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
