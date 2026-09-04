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

// Trust-device remains enabled by default and is synchronized into the
// official challenge checkbox before the user submits the SMS challenge.
assert.match(source, /builtInTrustDeviceCheck\.setChecked\(true\)/);
assert.match(source, /interactiveTrustDeviceCheck\.setChecked\(true\)/);
assert.match(source, /interactiveTrustDevicePanel\.setVisibility\(View\.VISIBLE\)/);
assert.match(source, /LOGIN_METHOD_MOBILE\.equals\(loginMethodForCurrentPortal\)/);
assert.match(source, /信任此设备（默认已勾选）/);
assert.match(source, /save\.checked=/);
assert.match(source, /信任此设备/);

// Credentials and challenge values must not be added to diagnostic output.
assert.match(source, /不保存密码、验证码、Cookie/);
assert.match(source, /sanitizeDiagnosticText/);
assert.doesNotMatch(source, /recordLoginDiagnostic\([^;]*(pendingBuiltInPassword|builtInCodeInput)/s);

console.log("android login smoke tests: PASS");
