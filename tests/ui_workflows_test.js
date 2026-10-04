const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Exercise the real renderers and term-switch path without school networking.
const elements = new Map(), listeners = new Map(), stored = new Map();
function element(id) {
  return { id, value: '', innerHTML: '', textContent: '', hidden: false, dataset: {}, selectedOptions: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, listener) { if (!listeners.has(id)) listeners.set(id, new Map()); listeners.get(id).set(type, listener); },
    setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, replaceChildren() {},
    focus() {}, matches() { return false; } };
}
const context = { console, URL, URLSearchParams, Blob, TextEncoder, TextDecoder,
  navigator: {}, location: { href: 'chrome-extension://test/dashboard.html' },
  setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, addEventListener() {},
  localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
  document: { documentElement: element('root'), getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, createElement: () => element('') },
  fetch: async () => { throw Error('network disabled'); } };
context.window = context;
let code = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
code = code.slice(0, code.lastIndexOf('bootstrapAccessNetworkFromStore();'));
code += `\nglobalThis.t = { state, renderExams, renderScores, renderOverview, renderSettings, renderPersonal,
  renderCourseDetailModal, overviewCourseStatus, personalQueryTermContext, selectPersonalQueryTerm,
  initialToastNotificationsEnabled, setToastNotificationsEnabled,
  renderPersonalQueryContext, contentActionHandlers, cacheTermSnapshot, normalizeLocalScheduleItem,
  localScheduleItemToCourseRow, emptyPersonalData, prepareCourseColors, courseGlassToneStyle, courseGlassToneClass,
  installCounters() { const counters = { renders: 0, refreshes: 0 }; render = () => counters.renders++; refresh = async () => counters.refreshes++; return counters; }
};`;
vm.runInNewContext(code, context, { filename: 'dashboard.js' });
const t = context.t, s = t.state, counters = t.installCounters();
assert.equal(t.initialToastNotificationsEnabled(), false, '新安装默认关闭操作提示');
t.setToastNotificationsEnabled(true);
assert.equal(t.initialToastNotificationsEnabled(), true, '保留用户主动开启的偏好');
t.setToastNotificationsEnabled(false);
const exam = (name, day, status = '未开始') => ({ name, date: `2026-10-${day}`, dateDay: day,
  dateMonth: '10', weekday: '周五', time: '14:00–16:00', place: '测试楼 A201', seat: '24', status, countdown: '还有两天' });
s.data.exams = [exam('考试乙', '22'), exam('考试甲', '16'), exam('历史考试', '02', '已结束')];
s.view = 'exams';
let html = t.renderExams();
assert.equal((html.match(/<h4>考试甲<\/h4>/g) || []).length, 1, '下一场只能出现一次');
assert.ok(html.indexOf('考试甲') < html.indexOf('考试乙'), '下一场应按日期排序');
assert.ok(html.indexOf('测试楼 A201') < html.indexOf('后续考试'), '下一场要完整展示地点和座位');
assert.ok(html.indexOf('24号') < html.indexOf('后续考试'));
s.filters.exams = '考试乙';
html = t.renderExams();
assert.ok(html.includes('考试乙') && !html.includes('考试甲'), '搜索不应保留不匹配的下一场');
s.filters.exams = '不存在的课程';
assert.ok(!t.renderExams().includes('exam-card'), '无匹配结果不能残留下一场');
s.filters.exams = '历史';
assert.ok(t.renderExams().includes('<details class="ended-exams" open>'), '搜索到历史考试应直接展示结果');
assert.equal(s.examHistoryOpen, false, '搜索不能修改正常浏览的历史折叠状态');
s.filters.exams = '';
assert.ok(t.renderExams().includes('<details class="ended-exams">'));

// Time boundaries, all-day events and incomplete clocks must not be guessed.
s.campus.code = 'hunnan';
const timed = { startTime: '10:00', endTime: '11:00' };
assert.equal(t.overviewCourseStatus(timed, new Date(2026, 9, 3, 9, 59)).kind, 'pending');
assert.equal(t.overviewCourseStatus(timed, new Date(2026, 9, 3, 10, 0)).kind, 'active');
assert.equal(t.overviewCourseStatus(timed, new Date(2026, 9, 3, 11, 0)).kind, 'ended');
assert.equal(t.overviewCourseStatus({ startTime: '10:00' }, new Date(2026, 9, 3, 12)).kind, 'started');
assert.equal(t.overviewCourseStatus({ name: '无时间记录' }, new Date(2026, 9, 3, 12)).kind, 'unknown');
assert.equal(t.overviewCourseStatus({ localAllDay: true }, new Date(2026, 9, 3, 12)).kind, 'all-day');

// Course identity survives different meetings, teacher/class codes, filtering,
// sorting and refresh; the palette must not wrap after six subjects.
const coloredCourses = Array.from({ length: 24 }, (_, i) => ({ catalogCode: `C${i}`, code: `CLASS${i}`, name: `课程${i}` }));
s.data.courses = coloredCourses;
t.prepareCourseColors(coloredCourses);
const subjectColors = coloredCourses.map(course => t.courseGlassToneStyle(course));
assert.equal(new Set(subjectColors).size, 24, '不同课程不应循环使用六种颜色');
assert.equal(t.courseGlassToneStyle({ ...coloredCourses[0], code: 'OTHERCLASS', teacher: '另一位教师', weekday: '周五' }), subjectColors[0]);
assert.equal(t.courseGlassToneStyle({ name: coloredCourses[0].name, code: 'DETAILCLASS' }), subjectColors[0], '详情接口缺少课程号时仍应与同名课程同色');
t.prepareCourseColors(coloredCourses.slice().reverse());
assert.equal(t.courseGlassToneStyle(coloredCourses[0]), subjectColors[0]);
const extra = { catalogCode: 'NEW', name: '新课程' };
t.prepareCourseColors([...coloredCourses, extra]);
assert.deepEqual(coloredCourses.map(course => t.courseGlassToneStyle(course)), subjectColors, '新增课程不能改变已有课程颜色');
assert.equal(t.courseGlassToneClass({ source: 'local', localColorKey: 'rose' }), 'course-glass-color-rose');
assert.equal(t.courseGlassToneStyle({ source: 'local', localColorKey: 'rose' }), '', '保留用户的自定义选色');
s.data.courses = [];

s.terms = [{ code: '2026-2027-1', name: '2026-2027学年秋季学期' }, { code: '2025-2026-2', name: '2025-2026学年春季学期' }];
Object.assign(s.currentTerm, { mode: 'manual', overrideCode: '2026-2027-1' });
s.termCode = '2026-2027-1';
s.data.gpa = '3.87';
s.data.gpaMeta = { scope: '全部已查询学期累计', termCount: 3, successfulTermCount: 2, failedTermCount: 1,
  total: 12, populatedTermCount: 2, included: 12, excluded: 0, rule: '按学分加权', reported: '3.87' };
s.view = 'scores';
html = t.renderScores();
assert.ok(html.includes('累计平均绩点') && html.includes('2 / 3 个学期'));
assert.ok(html.includes('累计结果尚不完整'), '部分学期失败不能表现为完整累计');
assert.ok(html.includes('2026-2027学年秋季学期'), '列表查询范围应直接可见');

s.view = 'personal';
s.calendar.firstWeekStart = '2026-08-30';
s.data.courses = [{ name: '测试课程', code: 'TEST', weeks: '1-16周', weekday: '周一', section: '3-4节',
  location: '测试楼 A201', teacher: '测试教师', credit: '3', requirement: '必修', assessment: '考试', raw: { kept: '原始字段' } }];
s.scheduleDisplay.personal = 'week';
html = t.renderPersonal();
assert.ok(html.indexOf('课表视图') < html.indexOf('schedule-grid-scroll'));
assert.ok(html.includes('<details class="course-records-details">'), '课程记录默认收起');
s.filters.personal = '测试';
html = t.renderPersonal();
assert.ok(html.includes('<details class="personal-search" open>'), '有筛选时搜索框必须保持展开');
t.contentActionHandlers['clear-personal-filter']();
assert.equal(s.filters.personal, '');
assert.equal(s.personalUi.searchOpen, true);
s.selectedCourse = s.data.courses[0];
html = t.renderCourseDetailModal();
assert.ok(html.indexOf('10:30-12:10') < html.indexOf('课程号 / 教学班号'));
assert.ok(html.indexOf('测试楼 A201') < html.indexOf('课程号 / 教学班号'));
assert.ok(html.includes('原始字段'), '重排不能丢失原始字段');
s.selectedCourse = null;

s.view = 'settings';
html = t.renderSettings();
assert.equal((html.match(/class="settings-options-card"/g) || []).length, 1);
assert.ok(html.indexOf('settings-options-card') < html.indexOf('data-settings-group="schedule"'));
s.campus.code = ''; // Initial setup opens, but a deliberate collapse survives subsequent render.
s.settingsUi.schedule = null;
assert.ok(t.renderSettings().includes('data-settings-group="schedule" open'));
listeners.get('content').get('toggle')({ target: { dataset: { settingsGroup: 'schedule' }, open: false, matches() { return false; } } });
assert.ok(t.renderSettings().includes('data-settings-group="schedule"><summary>'));

(async () => {
  const settingBefore = JSON.stringify(s.currentTerm);
  s.termCode = '2026-2027-1';
  s.data = t.emptyPersonalData();
  s.data.courses = [{ name: '当前学期缓存' }];
  s.personalCache.termSnapshots[s.termCode] = t.cacheTermSnapshot();
  s.termCode = '2025-2026-2';
  s.data = t.emptyPersonalData();
  s.data.courses = [{ name: '历史学期缓存' }];
  s.personalCache.termSnapshots[s.termCode] = t.cacheTermSnapshot();
  s.termCode = '2026-2027-1';
  await t.selectPersonalQueryTerm('2025-2026-2');
  assert.equal(s.data.courses[0].name, '历史学期缓存', '切换学期应立即水合对应缓存');
  assert.equal(t.personalQueryTermContext().historical, true);
  assert.ok(t.renderPersonalQueryContext().includes('首页、课表、成绩和考试共用此查询学期'));
  assert.equal(JSON.stringify(s.currentTerm), settingBefore, '临时查询不能改变全局当前学期');
  assert.equal(s.termSelectionTouched, true);
  await t.contentActionHandlers['return-current-term']();
  assert.equal(s.termCode, '2026-2027-1');
  assert.equal(s.data.courses[0].name, '当前学期缓存');
  assert.equal(s.termSelectionTouched, false, '回到当前学期后继续跟随默认学期');
  assert.equal(t.renderPersonalQueryContext(), '');
  assert.equal(JSON.stringify(s.currentTerm), settingBefore);
  const refreshesBefore = counters.refreshes;
  await t.selectPersonalQueryTerm('invalid');
  assert.equal(counters.refreshes, refreshesBefore, '无效学期不能发起刷新');
  console.log('UI workflow tests: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
