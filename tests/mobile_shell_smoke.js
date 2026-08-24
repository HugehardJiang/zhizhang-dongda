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
  const element = {
    value: "", textContent: "", innerHTML: "", className: "", disabled: false, hidden: false, src: "",
    dataset: {}, selectedOptions: [], classList: createClassList(), children: [], parentElement: null,
    addEventListener() {}, setAttribute() {}, remove() {}, focus() {}, setSelectionRange() {}, click() {}, insertAdjacentHTML() {},
    replaceChildren(...children) {
      this.children.forEach((child) => { child.parentElement = null; });
      this.children = children;
      children.forEach((child) => { child.parentElement = this; });
    },
    querySelector() { return null; }, querySelectorAll() { return []; }, matches() { return false; }, closest() { return null; }
  };
  return element;
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
const storedSettings = new Map();
const pageWrap = createEventTarget();
let activeModal = null;
let nativeToastNotificationsEnabled = true;
let nativeCurrentTermSettings = "";
let nativeCampusSetting = "";
const nativeCalls = [];
const androidCurriculumEntry = createElementStub();
androidCurriculumEntry.remove = () => { androidCurriculumEntry.removed = true; };
global.window = global;
global.AndroidApi = {
  request() {},
  setEcodePanelHidden(hidden) { nativeCalls.push(Boolean(hidden)); },
  getLoginMethod() { return "builtin"; },
  getLoginError() { return ""; },
  getLoginDiagnostics() { return "执掌东大 Android 登录诊断报告\n测试报告"; },
  copyLoginDiagnostics() { nativeCalls.push("copy-login-diagnostics"); return true; },
  setLoginMethod(method) { nativeCalls.push(`login:${method}`); },
  getToastNotificationsEnabled() { return nativeToastNotificationsEnabled; },
  setToastNotificationsEnabled(enabled) {
    nativeToastNotificationsEnabled = Boolean(enabled);
    nativeCalls.push(`toast:${Boolean(enabled)}`);
  },
  getCurrentTermSettings() { return nativeCurrentTermSettings; },
  setCurrentTermSettings(payload) {
    nativeCurrentTermSettings = String(payload || "");
    nativeCalls.push("current-term");
  },
  getCampusSetting() { return nativeCampusSetting; },
  setCampusSetting(value) {
    nativeCampusSetting = String(value || "");
    nativeCalls.push(`campus:${nativeCampusSetting}`);
  }
};
global.document = {
  documentElement: { classList: createClassList() },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElementStub());
    return elements.get(id);
  },
  querySelector(selector) {
    if (selector === ".page-wrap") return pageWrap;
    if (selector === ".modal-backdrop") return activeModal;
    return null;
  },
  querySelectorAll(selector) {
    return selector === '[data-view="curriculum"]' ? [androidCurriculumEntry] : [];
  },
  createElement() { return createElementStub(); }
};
global.localStorage = {
  getItem(key) { return storedSettings.has(key) ? storedSettings.get(key) : null; },
  setItem(key, value) { storedSettings.set(key, String(value)); },
  removeItem(key) { storedSettings.delete(key); }
};
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
  copyAndroidLoginDiagnostics,
  webVpnUrlFromInput,
  webVpnEncryptHostname,
  renderWebVpnToolModal,
  setNotice,
  setToastNotificationsEnabled,
  saveCurrentTermPreference,
  currentTermCodeFor,
  persistCampusCode,
  syncModal: syncNativeEcodeOverlayLock,
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
assert.ok(loginSettings.indexOf('更多工具') < loginSettings.indexOf('第一周周日'));
assert.ok(loginSettings.includes('WebVPN 地址生成器'));
assert.ok(loginSettings.includes('id="toastNotificationsEnabled"'));
assert.ok(loginSettings.includes('class="settings-switch-track"'));
assert.ok(loginSettings.includes('隐藏所有底部 Toast，包括登录状态、缓存和数据刷新提示'));
assert.ok(loginSettings.includes('id="currentTermSelect"'));
assert.ok(loginSettings.includes('从教务系统同步'));
assert.ok(loginSettings.indexOf('当前学期') < loginSettings.indexOf('第一周周日'));
assert.ok(loginSettings.includes('id="campusSettingSelect"'));
assert.ok(loginSettings.indexOf('默认校区与上课时间') < loginSettings.indexOf('第一周周日'));

// Campus preference is mirrored to the native settings bridge so it survives
// WebView storage cleanup and can drive section-only time calculations.
assert.strictEqual(audit.persistCampusCode('hunnan'), 'hunnan');
assert.strictEqual(nativeCampusSetting, 'hunnan');
assert.ok(nativeCalls.includes('campus:hunnan'));

// Local-schedule controls opened from Settings must render on Settings itself,
// and Android Back must dismiss their state before changing the current page.
audit.state.view = 'settings';
audit.state.localSchedule.managerOpen = true;
assert.ok(audit.renderSettings().includes('aria-label="管理自定义安排"'));
assert.strictEqual(global.__handleAndroidBack(), true);
assert.strictEqual(audit.state.localSchedule.managerOpen, false);
assert.strictEqual(audit.state.view, 'settings');

// Android mirrors the central current-term preference into SharedPreferences,
// so a WebView storage cleanup does not make every page choose a different term.
audit.state.terms = [
  { code: '2025-2026-2', name: '2025-2026学年春季学期' },
  { code: '2026-2027-1', name: '2026-2027学年秋季学期' }
];
Object.assign(audit.state.currentTerm, {
  mode: 'manual', overrideCode: '2026-2027-1', detectedCode: '2025-2026-2',
  detectedSource: '教务系统', syncedAt: '2026-08-20T00:00:00.000Z'
});
audit.saveCurrentTermPreference();
assert.strictEqual(audit.currentTermCodeFor(audit.state.terms), '2026-2027-1');
assert.deepStrictEqual(JSON.parse(nativeCurrentTermSettings), {
  mode: 'manual', overrideCode: '2026-2027-1', detectedCode: '2025-2026-2',
  detectedSource: '教务系统', syncedAt: '2026-08-20T00:00:00.000Z'
});

// The generator reproduces NEU WebVPN's AES-128-CFB hostname encoding while
// preserving the original path, query, and hash entirely on-device.
assert.strictEqual(audit.webVpnEncryptHostname('jwxt.neu.edu.cn'), 'baf6bc2bc4cb43c8bc1d6f66c806db');
assert.strictEqual(audit.webVpnEncryptHostname('xn--xhq44jb2fzpc.com'), 'a8efe97292cd5789a6126921801fc5842a556a38');
assert.strictEqual(
  audit.webVpnUrlFromInput('http://jwxt.neu.edu.cn/jwapp/sys/homeapp?from=test#top'),
  'https://webvpn.neu.edu.cn/http/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db/jwapp/sys/homeapp?from=test#top'
);
assert.strictEqual(
  audit.webVpnUrlFromInput('https://www.baidu.com/path'),
  'https://webvpn.neu.edu.cn/https/62304135386136393339346365373340a7f6b37188c44fd9e756687c8b/path'
);
assert.throws(() => audit.webVpnUrlFromInput('ftp://example.com/file'), /仅支持/);
assert.throws(() => audit.webVpnUrlFromInput('http://example.com:8080/'), /自定义端口/);
audit.state.webvpnTool.open = true;
audit.state.webvpnTool.output = audit.webVpnUrlFromInput('http://jwxt.neu.edu.cn');
const webVpnModal = audit.renderWebVpnToolModal();
assert.ok(webVpnModal.includes('完全本地处理'));
assert.ok(webVpnModal.includes('data-action="copy-webvpn-url"'));
audit.state.webvpnTool.open = false;

// A background failure keeps the complete school error beside the manual
// fallback entry instead of collapsing it to a generic toast.
const completeLoginError = '学校统一身份认证返回：账号或密码错误（错误码 AUTH-401）';
global.__androidLoginStatus('failed', completeLoginError);
audit.state.personalCache.available = true;
audit.state.connected = false;
const loginEntry = audit.renderAndroidLoginEntry();
assert.ok(loginEntry.includes(completeLoginError));
assert.ok(loginEntry.includes('手动登录 / 其他方式'));
assert.ok(loginEntry.includes('data-action="copy-login-diagnostics"'));
assert.ok(loginEntry.includes('复制详细报错'));
audit.copyAndroidLoginDiagnostics();
assert.ok(nativeCalls.includes('copy-login-diagnostics'));

// Transient loading, success, and error feedback stays outside page flow in
// one bottom snackbar. It must never repopulate the legacy top notice.
const notice = elements.get('notice');
const toastRegion = elements.get('toastRegion');
audit.setNotice('正在后台重新登录…');
assert.strictEqual(notice.textContent, '');
assert.strictEqual(toastRegion.children.length, 1);
assert.strictEqual(toastRegion.children[0].className, 'toast toast-info');
audit.setNotice('数据已更新。', 'success');
assert.strictEqual(toastRegion.children[0].className, 'toast toast-success');
audit.setNotice('登录失败。', 'error');
assert.strictEqual(toastRegion.children[0].className, 'toast toast-error');

// Disabling Toast feedback suppresses every bottom Toast, including messages
// explicitly marked essential for cache-use and completed-refresh states.
audit.setToastNotificationsEnabled(false);
assert.strictEqual(nativeToastNotificationsEnabled, false);
assert.strictEqual(localStorage.getItem('zhizhang.toastNotifications'), 'off');
assert.strictEqual(toastRegion.children.length, 0);
audit.setNotice('此前提示。', 'success');
assert.strictEqual(toastRegion.children.length, 0);
audit.setNotice('正在后台重新登录…');
assert.strictEqual(toastRegion.children.length, 0);
audit.setNotice('数据已更新，个人结果已缓存到本机。', 'success', 'essential');
assert.strictEqual(toastRegion.children.length, 0);
audit.setNotice('');
audit.setNotice('普通操作已完成。', 'success');
assert.strictEqual(toastRegion.children.length, 0);
audit.setToastNotificationsEnabled(true);
assert.strictEqual(nativeToastNotificationsEnabled, true);
assert.strictEqual(localStorage.getItem('zhizhang.toastNotifications'), 'on');

const dashboardCss = fs.readFileSync(path.join(__dirname, '..', 'dashboard.css'), 'utf8');
assert.ok(dashboardCss.includes('.notice { display: none; }'));
assert.ok(dashboardCss.includes('bottom: calc(64px + env(safe-area-inset-bottom) + 10px)'));
assert.ok(!dashboardCss.includes('.toast-region { top: calc(var(--toolbar-height) + 10px)'));
assert.ok(dashboardCss.includes('.android-shell.has-modal .page-wrap { overflow: hidden; overscroll-behavior: none; }'));
assert.ok(dashboardCss.includes('overscroll-behavior: contain; touch-action: pan-y;'));
assert.ok(dashboardCss.includes('.settings-switch-track::after'));
assert.ok(dashboardCss.includes(':checked + .settings-switch-track::after'));
assert.ok(!dashboardCss.includes('input[role="switch"]::before'));
audit.setNotice('');

const mainActivitySource = fs.readFileSync(path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'cn', 'neu',
  'zhizhangdongda', 'MainActivity.java'
), 'utf8');
assert.ok(mainActivitySource.includes('KeyStore.getInstance("AndroidKeyStore")'));
assert.ok(mainActivitySource.includes('AES/GCM/NoPadding'));
assert.ok(mainActivitySource.includes('submitBuiltInCredentials(true)'));
assert.ok(mainActivitySource.includes('后台自动登录需要短信验证码'));
assert.ok(mainActivitySource.includes('LOGIN_METHOD_BUILT_IN'));
assert.ok(mainActivitySource.includes('public void openWebVpnUrl(String url)'));
assert.ok(mainActivitySource.includes('"webvpn.neu.edu.cn".equalsIgnoreCase(parsed.getHost())'));
assert.ok(/handleAcademicSessionInvalid[\s\S]*pendingAcademicFailureReason = reason;[\s\S]*attemptBuiltInBackgroundLoginOrReport\(reason\)/.test(mainActivitySource));
assert.ok(/attemptBuiltInBackgroundLoginOrReport[\s\S]*saved\.isComplete\(\)[\s\S]*submitBuiltInCredentials\(true\)/.test(mainActivitySource));
assert.ok(!mainActivitySource.includes('startAcademicSsoRecovery'));
assert.ok(!mainActivitySource.includes('复用 E 码通\/统一认证长会话'));
assert.ok(/handleEcodeSessionInvalid[\s\S]*backgroundLoginForEcode = true;[\s\S]*submitBuiltInCredentials\(true\)/.test(mainActivitySource));
assert.ok(/onPageFinished[\s\S]*isPortalLoginPage\(url\)[\s\S]*handleEcodeSessionInvalid/.test(mainActivitySource));
assert.ok(/finishBuiltInLoginSuccess[\s\S]*wasForEcode[\s\S]*reloadEcodeAfterBackgroundLogin/.test(mainActivitySource));
assert.ok(/refreshEcodePage[\s\S]*ecodeWebView\.loadUrl\(ECODE_URL\)/.test(mainActivitySource));
assert.ok(mainActivitySource.includes('submitBuiltInCredentialsToSchoolPage'));
assert.ok(mainActivitySource.includes("window.login();submitter='window.login'"));
assert.ok(mainActivitySource.includes("button.click();submitter='index_login_btn'"));
assert.ok(mainActivitySource.includes('portalWebView = createPortalWebView()'));
assert.ok(/class BackgroundLoginWebView extends WebView[\s\S]*private boolean backgroundInputBlocked[\s\S]*dispatchTouchEvent\(MotionEvent event\)[\s\S]*if \(backgroundInputBlocked\) return false;[\s\S]*return super\.dispatchTouchEvent\(event\);/.test(mainActivitySource));
assert.ok(/private void enterBackgroundLoginMode\(\)[\s\S]*setBackgroundInputBlocked\(true\)[\s\S]*clearFocus\(\)[\s\S]*setFocusable\(false\)[\s\S]*setFocusableInTouchMode\(false\)[\s\S]*setAlpha\(0\.01f\)[\s\S]*setVisibility\(View\.VISIBLE\)[\s\S]*bringToFront\(\)/.test(mainActivitySource));
assert.ok(/private void exitBackgroundLoginMode\(\)[\s\S]*setBackgroundInputBlocked\(false\)[\s\S]*setFocusable\(true\)[\s\S]*setFocusableInTouchMode\(true\)[\s\S]*setClickable\(true\)[\s\S]*setAlpha\(1f\)/.test(mainActivitySource));
const submitCredentialsStart = mainActivitySource.indexOf('private void submitBuiltInCredentials(boolean background)');
const backgroundLoginStart = mainActivitySource.indexOf('        if (background) {', submitCredentialsStart);
const currentUrlStart = mainActivitySource.indexOf('        String currentUrl = portalWebView.getUrl();', backgroundLoginStart);
const submitCredentialsEnd = mainActivitySource.indexOf('    private String builtInLoginPageDescription', submitCredentialsStart);
assert.ok(submitCredentialsStart >= 0);
assert.ok(backgroundLoginStart > submitCredentialsStart);
assert.ok(currentUrlStart > backgroundLoginStart);
assert.ok(submitCredentialsEnd > currentUrlStart);
const backgroundLoginUiBlock = mainActivitySource.slice(backgroundLoginStart, currentUrlStart);
const submitCredentialsBlock = mainActivitySource.slice(submitCredentialsStart, submitCredentialsEnd);
// Background authentication must keep the WebView VISIBLE for JS/redirects,
// while the specialized dispatch path makes it non-interactive and lets the
// dashboard below receive the gesture.
assert.ok(backgroundLoginUiBlock.includes('enterBackgroundLoginMode()'));
assert.ok(submitCredentialsBlock.includes('portalWebView.loadUrl'));
assert.ok(mainActivitySource.includes('portalWebView.setVisibility(View.VISIBLE)'));
assert.ok(mainActivitySource.includes('portalWebView.setAlpha(0.01f)'));
assert.ok(mainActivitySource.includes('portalWebView.bringToFront()'));
assert.ok(!mainActivitySource.includes('portalWebView.setVisibility(View.INVISIBLE)'));
assert.ok(!mainActivitySource.includes('portalWebView.requestFocus'));
assert.ok(/cancelAutomaticBackgroundLogin[\s\S]*exitBackgroundLoginMode\(\)/.test(mainActivitySource));
assert.ok(/showDashboard[\s\S]*exitBackgroundLoginMode\(\)/.test(mainActivitySource));
assert.ok(/showPortal[\s\S]*exitBackgroundLoginMode\(\)/.test(mainActivitySource));
assert.ok(/finishBuiltInLoginSuccess[\s\S]*exitBackgroundLoginMode\(\)/.test(mainActivitySource));
assert.ok(/finishBuiltInLoginFailure[\s\S]*exitBackgroundLoginMode\(\)/.test(mainActivitySource));
assert.ok(mainActivitySource.includes('重新获取 WebVPN 认证页并只重试一次'));
assert.ok(mainActivitySource.includes('formActionBefore'));
assert.ok(!mainActivitySource.includes('postWebVpnLogin'));
assert.ok(mainActivitySource.includes('setAcceptThirdPartyCookies'));
assert.ok(/onPageFinished[\s\S]*scheduleBuiltInPortalProbe\(url\)/.test(mainActivitySource));
assert.ok(/inspectBuiltInLoginPage[\s\S]*!isPortalLoginPage\(currentUrl\)[\s\S]*scheduleBuiltInPortalProbe\(currentUrl\)/.test(mainActivitySource));
assert.ok(mainActivitySource.includes('PORTAL_FALLBACK_URL'));
assert.ok(mainActivitySource.includes('学校认证后连续返回非教务中转页'));
assert.ok(mainActivitySource.includes('TOAST_NOTIFICATIONS_ENABLED'));
assert.ok(mainActivitySource.includes('public boolean getToastNotificationsEnabled()'));
assert.ok(mainActivitySource.includes('public void setToastNotificationsEnabled(boolean enabled)'));
assert.ok(mainActivitySource.includes('CURRENT_TERM_SETTINGS'));
assert.ok(mainActivitySource.includes('public String getCurrentTermSettings()'));
assert.ok(mainActivitySource.includes('public void setCurrentTermSettings(String payload)'));
assert.ok(mainActivitySource.includes('LAST_LOGIN_DIAGNOSTICS'));
assert.ok(mainActivitySource.includes('public String getLoginDiagnostics()'));
assert.ok(mainActivitySource.includes('public boolean copyLoginDiagnostics()'));
assert.ok(mainActivitySource.includes('sanitizeDiagnosticUrl'));
assert.ok(mainActivitySource.includes('LOGIN_DIAGNOSTIC_EVENT_MAX'));

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

// Android WebView can emit many small scroll events for one gesture. The
// header must hide after the cumulative threshold, not only after one large
// event delta.
pageWrap.scrollTop = 40;
pageWrap.dispatch("scroll");
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "VISIBLE");
pageWrap.scrollTop = 48;
pageWrap.dispatch("scroll");
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "VISIBLE");
pageWrap.scrollTop = 56;
pageWrap.dispatch("scroll");
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");

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

// A modal owns its scroll gesture. Even a long downward drag while the page
// itself sits at scrollTop 0 must never reveal the native campus-code header.
activeModal = createElementStub();
audit.syncModal();
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");
assert.strictEqual(document.documentElement.classList.contains("has-modal"), true);
pageWrap.dispatch("touchstart", touch(100));
pageWrap.dispatch("touchmove", touch(190));
pageWrap.dispatch("touchend", touch(190));
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");
assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), true);
activeModal = null;
audit.syncModal();
assert.strictEqual(document.documentElement.classList.contains("has-modal"), false);
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");

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

// Opening a modal while the campus code is visible hides it immediately and
// closing the modal never restores it without a fresh main-page pull.
activeModal = createElementStub();
audit.syncModal();
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");
assert.strictEqual(card.classList.contains("android-ecode-placeholder-hidden"), true);
activeModal = null;
audit.syncModal();
assert.strictEqual(audit.state.mobileShell.campusHeaderState, "HIDDEN");

console.log("mobile shell smoke tests: PASS");
