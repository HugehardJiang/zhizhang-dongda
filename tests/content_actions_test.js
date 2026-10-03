const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

// 内容区只有一个 click 分发器：data-action 先查 contentActionHandlers，
// 未登记的动作走 handleContentNavigation。这里通过真实注册的监听器验证分发。
const elements = new Map(), storage = new Map();
const listeners = new Map();
const el = (id) => ({ id, value: '', dataset: {}, selectedOptions: [],
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener(type, fn) {
    if (id !== 'content') return;
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
const context = { console, Blob, URL, URLSearchParams, TextEncoder, TextDecoder,
  setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  navigator: {}, location: { href: 'chrome-extension://test/dashboard.html' },
  localStorage: { getItem(key) { return storage.get(key) || null; }, setItem(key, value) { storage.set(key, value); } },
  document: { documentElement: el(), getElementById(id) { if (!elements.has(id)) elements.set(id, el(id)); return elements.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, createElement: () => el() },
  addEventListener() {}, fetch: async () => { throw Error('offline'); } };
context.window = context;
let code = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
code = code.replace(/\n\/\/ 桌面扩展保持原有的自动刷新[\s\S]*$/, '\n');
code += `\nglobalThis.t = { state, contentActionHandlers, localScheduleActionHandlers,
  countRenders() { const counter = { count: 0 }; render = () => { counter.count += 1; }; return counter; } };`;
vm.runInNewContext(code, context);
const t = context.t, s = t.state;
const renders = t.countRenders();

const bubbleClickListeners = (listeners.get('click') || []);
// 一个冒泡阶段的分发器 + 一个捕获阶段的滑动防误触（不带 data-action 逻辑）。
assert.equal(bubbleClickListeners.length, 2, 'content 区应只保留分发器和滑动防误触两个 click 监听');
assert.equal((listeners.get('change') || []).length, 1, 'content 区应只有一个 change 监听');

const button = (action, dataset = {}) => {
  const node = { dataset: { action, ...dataset }, classList: { contains() { return false; } } };
  node.closest = (selector) => (selector.includes('data-action') ? node : null);
  return node;
};
const click = async (node) => {
  for (const listener of bubbleClickListeners) await listener({ target: node, preventDefault() {}, stopImmediatePropagation() {} });
};

(async () => {
  // 本地课表动作经由同一个分发器处理。
  s.localSchedule.managerOpen = false;
  s.localSchedule.editorOpen = true;
  let before = renders.count;
  await click(button('open-local-manager'));
  assert.equal(s.localSchedule.managerOpen, true);
  assert.equal(s.localSchedule.editorOpen, false);
  assert.equal(renders.count, before + 1, '本地课表动作只重绘一次，不再落入页面切换分支');

  // 普通登记动作。
  s.campus.promptOpen = true;
  before = renders.count;
  await click(button('dismiss-campus-prompt'));
  assert.equal(s.campus.promptOpen, false);
  assert.equal(renders.count, before + 1);

  // 多个动作名共用一个处理函数时，处理函数能拿到实际动作名。
  let received = '';
  const originalDayMove = t.contentActionHandlers['save-day-move'];
  t.contentActionHandlers['save-day-move'] = (node, event, action) => { received = action; };
  await click(button('save-day-move'));
  assert.equal(received, 'save-day-move');
  t.contentActionHandlers['save-day-move'] = originalDayMove;

  // 勾选框点击不重绘。
  before = renders.count;
  await click(button('toggle-course-selection'));
  assert.equal(renders.count, before);

  // 页面切换走导航分支，并清除已选课程。
  s.selectedCourse = { name: 'x' };
  s.view = 'overview';
  await click(button('view-exams'));
  assert.equal(s.view, 'exams');
  assert.equal(s.selectedCourse, null);

  // 未登记的动作和原型链上的属性名都只做默认重绘，不会被当成处理函数调用。
  for (const action of ['unknown-action', 'toString', 'constructor']) {
    before = renders.count;
    await click(button(action));
    assert.equal(renders.count, before + 1, `${action} 应走默认重绘`);
  }

  // 本地管理筛选并入唯一的 change 监听。
  await listeners.get('change')[0]({ target: { id: 'localManagerFilter', value: 'event', matches() { return false; } } });
  assert.equal(s.localSchedule.filter, 'event');

  // 本地动作表必须全部进入总分发表。
  for (const action of Object.keys(t.localScheduleActionHandlers)) {
    assert.equal(t.contentActionHandlers[action], t.localScheduleActionHandlers[action], action);
  }

  console.log('content action dispatch tests: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
