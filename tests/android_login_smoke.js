const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(
  require.resolve("../android/app/src/main/java/cn/neu/zhizhangdongda/MainActivity.java"),
  "utf8"
);

// The app must use the school's own mobile-template handlers so the captcha,
// SMS challenge, session cookies and redirects stay in one authenticated WebView.
assert.match(source, /LOGIN_METHOD_MOBILE = "mobile"/);
assert.match(source, /activatePortalMobileLogin/);
const methodBar = source.match(/private LinearLayout createLoginMethodBar\(\)[\s\S]*?private FrameLayout\.LayoutParams loginMethodBarParams/);
assert.ok(methodBar, "login method bar source should be present");
assert.doesNotMatch(methodBar[0], /LOGIN_METHOD_MOBILE/);
assert.match(source, /builtInMobileLoginButton\.setText\("使用手机验证码登录"\)/);
assert.match(source, /startBuiltInMobileLogin\(\)/);
assert.match(source, /builtInMobileLoginMode/);
assert.match(source, /mobile_template/);
assert.match(source, /window\.initPassWordEvent\(\)/);
assert.match(source, /mobileTab\.click\(\)/);
assert.match(source, /loginByMobile\(\)/);
assert.match(source, /getMobileVerifyCode/);
assert.match(source, /codeImage/);

// Password login must recognize both the legacy device challenge and a newly
// inserted captcha/mobile challenge without logging or replaying its values.
assert.match(source, /interactiveChallenge/);
assert.match(source, /graphInput/);
assert.match(source, /graphImage/);
assert.match(source, /showBuiltInInteractiveChallenge/);
assert.match(source, /completeBuiltInInteractiveChallenge/);
assert.match(source, /后台自动登录需要人工完成图形验证码和短信验证/);
assert.match(source, /portalWebView\.postDelayed\(\(\) -> inspectBuiltInLoginPage/);
assert.match(source, /credentialInputs/);
assert.match(source, /当前页面已进入人工图形\/手机验证流程/);
assert.match(source, /waitForPage/);
assert.match(source, /verifyAcademicSessionAfterInteractiveChallenge/);
assert.match(source, /首次安装时 Dashboard 尚未加载/);

// Trust-device remains enabled by default and is synchronized into the
// official challenge checkbox before the user submits the SMS challenge.
assert.match(source, /builtInTrustDeviceCheck\.setChecked\(true\)/);
assert.match(source, /interactiveTrustDeviceCheck\.setChecked\(true\)/);
assert.match(source, /interactiveTrustDevicePanel\.setVisibility\(View\.VISIBLE\)/);
assert.match(source, /LOGIN_METHOD_MOBILE\.equals\(loginMethodForCurrentPortal\)/);
assert.match(source, /信任此设备（默认已勾选）/);
assert.match(source, /save\.checked=/);
assert.match(source, /信任此设备/);
assert.match(source, /syncPortalTrustDeviceSelection/);

// Background login temporarily brings the WebView to the front. Returning to
// the human challenge must restore the native overlays above it, otherwise
// the trust-device checkbox and confirmation button are visually unreachable.
assert.match(source, /private void restorePortalOverlayOrder\(\)/);
assert.match(source, /interactiveTrustDevicePanel\.bringToFront\(\)/);
assert.match(source, /showPortal\(\)[\s\S]*restorePortalOverlayOrder\(\)/);
assert.match(source, /showBuiltInInteractiveChallenge\([\s\S]*restorePortalOverlayOrder\(\)/);

// Credentials and challenge values must not be added to diagnostic output.
assert.match(source, /不保存密码、验证码、Cookie/);
assert.match(source, /sanitizeDiagnosticText/);
assert.doesNotMatch(source, /recordLoginDiagnostic\([^;]*(pendingBuiltInPassword|builtInCodeInput)/s);

console.log("android login smoke tests: PASS");
