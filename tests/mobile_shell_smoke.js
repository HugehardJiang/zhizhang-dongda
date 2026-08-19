const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    },
    contains(name) { return values.has(name); }
  };
}

function createElementStub() {
  return {
    value: "", textContent: "", innerHTML: "", className: "", disabled: false, hidden: false, src: "",
    dataset: {}, selectedOptions: [], classList: createClassList(),
    addEventListener() {}, setAttribute() {}, remove() {}, focus() {}, setSelectionRange() {}, click() {}, insertAdjacentHTML() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, matches() { return false; }, closest() { return null; }
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    scrollTop: 0,
    __listeners: listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).forEach((listener) => listener({ type, ...event }));
    }
  };
}

const elements = new Map();
const pageWrap = createEventTarget();
const nativeCalls = [];
const androidCurriculumEntry = createElementStub();
androidCurriculumEntry.remove = () => { androidCurriculumEntry.removed = true; };
global.window = global;
global.AndroidApi = {
  request() {},
  setEcodePanelHidden(hidden) { nativeCalls.push(Boolean(hidden)); },
  getLoginMethod() { return "builtin"; },
  getLoginError() { return ""; },
  setLoginMethod(method) { nativeCalls.push(`login:${method}`); }
};
global.document = {
  documentElement: { classList: createClassList() },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElementStub());
    return elements.get(id);
  },
  querySelector(selector) {
    return selector === ".page-wrap" ? pageWrap : null;
  },
  querySelectorAll(selector) {
    return selector === '[data-view="curriculum"]' ? [androidCurriculumEntry] : [];
  },
  createElement() { return createElementStub(); }
};
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.location = { href: "file:///mobile-shell-test/dashboard.html" };
global.navigator = {};
global.open = () => null;
global.fetch = async () => { throw new Error("network disabled in mobile shell smoke test"); };

const dashboardPath = path.join(__dirname, "..", "dashboard.js");
let code = fs.readFileSync(dashboardPath, "utf8");
code = code.replace(/\nrefresh\(\);\s*$/, "\n");
code += `
globalThis.__mobileShellAudit = {
  state,
  render,
  androidLoginMethod,
  renderSettings,
  renderAndroidLoginEntry,
  prepare: globalThis.__prepareNativeEcode,
  card: androidEcodeElements.card
};
`;
vm.runInThisContext(code, { filename: dashboardPath });

const audit = global.__mobileShellAudit;
const card = audit.card;
const touch = (clientY) => ({ touches: [{ clientY }], changedTouches: [{ clientY }] });

assert.strictEqual(androidCurriculumEntry.removed, true);

// Android defaults to the native built-in login while preserving both school
// page fallbacks in settings.
const loginSettings = audit.renderSettings();
assert.strictEqual(audit.androidLoginMethod(), 'builtin');
assert.ok(loginSettings.includes('<option value="builtin"'));
assert.ok(loginSettings.includes('内置登录（默认）'));
assert.ok(loginSettings.includes('<option value="password"'));
assert.ok(loginSettings.includes('<option value="wechat"'));
assert.ok(loginSettings.includes('Android Keystore'));

// A background failure keeps the complete school error beside the manual
// fallback entry instead of collapsing it to a generic toast.
const completeLoginError = '学校统一身份认证返回：账号或密码错误（错误码 AUTH-401）';
global.__androidLoginStatus('failed', completeLoginError);
audit.state.personalCache.available = true;
audit.state.connected = false;
const loginEntry = audit.renderAndroidLoginEntry();
assert.ok(loginEntry.includes(completeLoginError));
assert.ok(loginEntry.includes('手动登录 / 其他方式'));

const mainActivitySource = fs.readFileSync(path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'cn', 'neu',
  'zhizhangdongda', 'MainActivity.java'
), 'utf8');
assert.ok(mainActivitySource.includes('KeyStore.getInstance("AndroidKeyStore")'));
assert.ok(mainActivitySource.includes('AES/GCM/NoPadding'));
assert.ok(mainActivitySource.includes('submitBuiltInCredentials(true)'));
assert.ok(mainActivitySource.includes('后台自动登录需要短信验证码'));
assert.ok(mainActivitySource.includes('LOGIN_METHOD_BUILT_IN'));
assert.ok(/handleAcademicSessionInvalid[\s\S]*if \(academicSsoRecoveryInProgress \|\| backgroundLoginInProgress\) return;[\s\S]*startAcademicSsoRecovery\(reason\)/.test(mainActivitySource));
assert.ok(/startAcademicSsoRecovery[\s\S]*portalWebView\.loadUrl\(ECODE_URL\)/.test(mainActivitySource));
assert.ok(/finishAcademicSsoRecoveryFailure[\s\S]*attemptBuiltInBackgroundLoginOrReport/.test(mainActivitySource));

const androidManifestSource = fs.readFileSync(path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'
), 'utf8');
const adaptiveIconSource = fs.readFileSync(path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable-v26', 'ic_app.xml'
), 'utf8');
const iconForegroundSource = fs.readFileSync(path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_app_foreground.xml'
), 'utf8');
assert.ok(androidManifestSource.includes('android:icon="@drawable/ic_app"'));
assert.ok(androidManifestSource.includes('android:roundIcon="@drawable/ic_app"'));
assert.ok(adaptiveIconSource.includes('<adaptive-icon'));
assert.ok(adaptiveIconSource.includes('@drawable/ic_app_foreground'));
assert.ok(iconForegroundSource.includes('#FFFFC857'));

audit.prepare();
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "VISIBLE");
assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), false);

// Scrolling down hides the shell header; ordinary upward scrolling never shows it.
pageWrap.scrollTop = 120;
pageWrap.dispatch("scroll");
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");
assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), true);
pageWrap.scrollTop = 70;
pageWrap.dispatch("scroll");
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");

// Route renders preserve the shell state and do not create a visible flash.
for (const view of ["personal", "scores", "exams", "settings"]) {
  audit.state.view = view;
  audit.render();
  assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");
  assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), true);
}

// Reaching the top arms the reveal but keeps the header hidden.
pageWrap.scrollTop = 0;
pageWrap.dispatch("scroll");
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN_AT_TOP");
assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), true);

// A light tap / 20px drag is ignored; a 64px downward pull reveals it once.
pageWrap.dispatch("touchstart", touch(100));
pageWrap.dispatch("touchmove", touch(120));
pageWrap.dispatch("touchend", touch(120));
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN_AT_TOP");
pageWrap.dispatch("touchstart", touch(100));
pageWrap.dispatch("touchmove", touch(164));
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "VISIBLE");
assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), false);
assert.deepStrictEqual(nativeCalls.slice(-2), [true, false]);

console.log("mobile shell smoke tests: PASS");
