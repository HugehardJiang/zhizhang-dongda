# 代码地图（交接用）

给人和后续 AI 用的仓库导航。先读本文件，再按任务打开对应源码；不要凭目录名猜职责。

产品对外名：Chrome 插件「东北大学教务焕新」，Android 应用「执掌东大」。二者共用同一套查询台，不向原教务系统注入侧边栏。

| 端 | 当前版本写在哪 | 本稿核对值 |
| --- | --- | --- |
| Chrome MV3 插件 | `manifest.json` 的 `version` | `0.3.88` |
| Android 应用 | `android/app/build.gradle.kts` 的 `versionName` / `versionCode` | `0.1.70` / `70` |

`README.md`、`android/README.md` 里的版本说明可能滞后，以 `manifest.json` 和 `build.gradle.kts` 为准。

---

## 1. 30 秒定位

```text
用户点击插件图标 / 打开 Android 应用
        │
        ▼
dashboard.html  +  dashboard.css  +  dashboard.js     ← 几乎全部业务在这里
        │
        ├─ Chrome：fetch(credentials:include) 复用浏览器 Cookie
        │          培养方案额外走 background.js，在已打开的教务标签页里读
        │
        └─ Android：globalThis.AndroidApi（MainActivity.AndroidBridge）
                   原生带 Cookie 请求、缓存文件、登录、E 码通、导出
```

**默认改这里：**

| 想改什么 | 先打开 |
| --- | --- |
| 成绩 / 考试 / 课表 / GPA / 全校课表 / 培养方案 / 课程大纲 UI 与映射 | `dashboard.js` |
| 布局、颜色、桌面侧栏、底部导航、弹窗 | `dashboard.css`、`design.md` |
| 导航骨架、页面壳 | `dashboard.html` |
| 学校接口字段、WebVPN 规则 | `api.md`，再对 `dashboard.js` |
| 培养方案「打开原系统标签页再读取」和课程大纲主世界桥接 | `background.js` + `dashboard.js` |
| 登录、E 码通、Keystore、Android 缓存文件、返回键 | `android/app/src/main/java/cn/neu/zhizhangdongda/MainActivity.java` |
| 权限、包名、图标 | `android/app/src/main/AndroidManifest.xml`、`android/app/src/main/res/` |

没有 `package.json`、没有前端打包器。查询台是三份静态文件；Android 构建前把它们拷进 assets。

---

## 2. 仓库树（只列源码，不含 build）

```text
.
├── CODEMAP.md              ← 本文件
├── README.md               ← 功能说明、插件安装
├── design.md               ← UI/UX 规范（改界面前必读）
├── api.md                  ← 教务接口边界与隐私约束
├── AUDIT_REPORT.md         ← 历史审查记录（0.3.47），不是当前任务清单
├── LICENSE                 ← MIT
├── manifest.json           ← Chrome MV3：权限、service worker、版本
├── background.js           ← 打开查询页；培养方案跨标签页只读桥
├── dashboard.html          ← 查询台 DOM 壳
├── dashboard.css           ← 查询台样式（桌面 + Android 窄屏）
├── dashboard.js            ← 查询台全部逻辑（约 1.1 万行，单文件）
├── vendor/                 ← html2canvas、jsPDF（培养方案 PDF / 部分导出）
├── tests/
│   ├── audit_smoke.js      ← 映射、GPA、学期、本地课表、PDF 模型等
│   └── mobile_shell_smoke.js ← Android 校园码头 + 弹窗手势
└── android/                ← 独立 Gradle 工程
    ├── README.md
    └── app/src/main/
        ├── AndroidManifest.xml
        ├── java/.../MainActivity.java   ← 整个原生壳（单 Activity）
        └── res/                         ← 图标、主题、应用名
```

不要当源码的东西：`android/app/build/`、`android/.gradle/`、根目录 `归档.zip` / `归档 2.zip`（未纳入版本管理的本地压缩包）。

---

## 3. 双端差异（改功能前先对号）

| 能力 | Chrome 插件 | Android |
| --- | --- | --- |
| 查询台 UI | 根目录 `dashboard.*` | 构建时 `syncWebAssets` 拷贝同一套 |
| 登录 | 用户自己在学校网页登录；插件不存账密 | 内置登录 / 原网页账密 / 微信二维码；成功后 Keystore AES-GCM 存账密 |
| 网络 | 页面 `fetch` + Cookie | `AndroidApi.request` → `HttpURLConnection`，只允许 `https://webvpn.neu.edu.cn/` |
| 培养计划 / 课程大纲 | 有；需后台挂着原系统对应页面 | **无入口**：启动时删掉 `[data-view="curriculum"]` 和 `[data-view="course-outline"]` |
| 个人缓存 | 主要靠内存 + `localStorage` 设置 | 应用内部 `personal-cache/`，文件名 = 学号 SHA-256 |
| 本地课表 | `chrome.storage.local` | 独立目录 `local-schedule/`，同样按学号哈希 |
| E 码通 | 无 | 独立 WebView + 首页顶部卡片 |
| PDF 培养方案导出 | `vendor/jspdf` 数据驱动渲染 | 不走这条路径 |

环境开关：`dashboard.js` 顶部 `IS_ANDROID_APP = Boolean(globalThis.AndroidApi?.request)`。

---

## 4. 运行时数据流

### 4.1 Chrome

1. 点图标 → `background.js` 打开 `dashboard.html?v=<manifest.version>`（防旧页缓存）。
2. `dashboard.js` 用当前 Cookie 打 WebVPN 教务接口。
3. 培养方案：`dashboard.js` `sendMessage` → `background.js` 在已打开的 `webvpn.neu.edu.cn` 标签里 `executeScript` 只读请求。直接从 `chrome-extension://` fetch 培养方案接口会 403。

插件 runtime 消息：

| `type` | 方向 | 作用 |
| --- | --- | --- |
| `open-portal-login` | dashboard → worker | 打开原系统登录（账密或微信标签） |
| `open-curriculum-portal` | dashboard → worker | 打开培养方案原查询页 |
| `curriculum-bootstrap` | dashboard → worker | 自动找/打开培养方案页并准备读取 |
| `curriculum-plans-portal-read` | dashboard → worker | 从原页面读方案列表 |
| `curriculum-portal-read` | dashboard → worker | 从原页面读某个方案详情 |
| `curriculum-bootstrap-status` | worker → dashboard | 回推进度 / 需登录 / 失败 |

### 4.2 Android

`MainActivity` 叠三层 WebView：

| WebView | 作用 |
| --- | --- |
| `portalWebView` | 学校登录页（内置表单 / 账密 / 二维码） |
| `ecodeWebView` | 校园 E 码通原网页（不可见或缩略图） |
| `dashboardWebView` | 本地 `file:///android_asset/dashboard.html` |

注入名：

- `AndroidApi`：只给查询台（`createWebView(true)`）。
- `AndroidLoginBridge.onQrUrl`：只给登录页，收临时二维码地址。

查询台回调：

- 原生回包：`globalThis.__nativeApiResponse(requestId, status, body)`
- 后台登录状态：`globalThis.__androidLoginStatus(status, message)`
- 页面刷新入口：`globalThis.__refreshDashboard = refresh`

`AndroidApi` 方法（改桥必须两端一起改）：

```text
openPortal / openWebVpnUrl
setEcodePanelHidden
get/setLoginMethod
get/setToastNotificationsEnabled
get/setCurrentTermSettings
get/setCampusSetting
getLoginError / getLoginDiagnostics / copyLoginDiagnostics
request(requestId, method, url, body, headersJson)
load/save/clearPersonalCache
load/save/clearLocalSchedule（有带 profileKey 的重载）
saveImage / saveCsv
```

---

## 5. `dashboard.js` 分区（按行号，以当前文件为准）

文件约 **10986 行**，**单文件、无模块打包**。同名 `function` 后声明覆盖先声明；改渲染时搜**最后一次**定义。

| 行号约 | 块 | 改这里当… |
| --- | --- | --- |
| 1–81 | 环境开关、Portal 根地址、超时、校区节次 | 改 WebVPN 根、南湖/浑南上课时间 |
| 85–261 | 学期/校区/Toast 持久化、Android 登录诊断 | 设置项读写 |
| 263–275 | `__nativeApiResponse` | Android 网络桥回调 |
| **277–466** | **`const state`** | **全局 UI/数据源。新功能优先挂 state，不要另起全局** |
| 468–493 | `__androidLoginStatus`、请求代次号 | 竞态：刷新/全校课表/培养方案/体育项目 |
| 495–838 | 个人缓存 schema `zhizhang-personal-cache/v2`、新成绩提醒 | 缓存字段、成绩弹窗隔离（学号×学期） |
| 899–~1040 | 校园码头 `mobileShell`、下拉显示、弹窗锁 | 动 E 码通卡片，勿在 `render()` 里重置为可见 |
| 1040–1751 | 通用解析、`requestJson`、学期选择 | 接口重试 `/http/`→`/https/`、当前学期单一数据源 |
| **1752–3384** | **培养计划** | 方案树、进度、桌面 PDF 模型；Android 会短路 |
| 3385+ | `mapScore` / `mapExam` / `mapCourse` / GPA | 字段映射；别名兜底见 `api.md` |
| 4538+ | `calculateAverageGpa` | 25 级排除通识选修和二级分制；24 级及以前全计 |
| 4985+ | `loadTermData` | 一次刷新并行拉成绩/考试/课表/GPA；空成功响应不覆盖缓存 |
| 5127+ | 全校课表类型、分页、详情 | 独立 `allRetrying`，不要借用 `state.loading` |
| 5463–9258 | 各页 `render*`、导出 PNG/CSV、课程传输 | 中间有重复函数，以文件后部为准 |
| **9259–9308** | **`render()`** | 路由总入口：按 `state.view` 填 `#content` |
| 9384–9437 | `refresh()` | 先缓存/本地安排，再打网；代次号作废旧请求 |
| **9439–10427** | **本地课表 overlay** | schema `zhizhang-local-schedule/v1`；**禁止写入 `state.data.courses`** |
| 10428–文末 | DOM 事件、`data-action`、`__refreshDashboard` | 交互都从 `#content` 委托 |

`state.view` 取值：`overview` | `personal` | `exams` | `scores` | `all` | `curriculum` | `settings`。

桌面侧栏有培养计划；Android 底部导航把「全校课表」收进「更多」，并删除培养计划按钮。

### 5.1 必须守住的数据分层

```text
教务缓存层     state.data.*          学校接口映射结果；Android 可写入 personal-cache
本地覆盖层     state.localSchedule    用户自建课程/日程 + 被隐藏的教务排课键
展示层         mergedPersonalScheduleRows()  合并后才给课表/总览/导出用
```

「仅保留新安排」只把教务排课键放进 `hiddenSchoolEntries`，**不改学校数组**。清除教务缓存不得清本地课表，反之亦然。

### 5.2 持久化键（不要随意改名前缀，会丢掉用户设置）

| 键 / schema | 用途 |
| --- | --- |
| `zhizhang.currentTerm.v1` | 全局当前学期（自动/手动） |
| `zhizhang.campus.v1` | 南湖 `nanhu` / 浑南 `hunnan` |
| `zhizhang.toastNotifications` | 是否显示一般 Toast |
| `zhizhang.firstWeekStart` | 第一周周日 |
| `zhizhang.loginMethod` | 桌面默认登录标签 |
| `zhizhang.scoreReminder.v1.*` | 新成绩指纹基线 |
| `zhizhang-personal-cache/v2` | Android 个人查询缓存 |
| `zhizhang-local-schedule/v1` | 本地课表 |
| `zhizhang.curriculumBootstrap` | Chrome 培养方案引导进度（worker storage） |

查询页学期下拉是**临时查询范围**，用户手动改过之后不要写回全局当前学期。

---

## 6. Android `MainActivity.java` 分区

单文件约 **3852 行**，包名 `cn.neu.zhizhangdongda`。

构建同步：`android/app/build.gradle.kts` 里 `syncWebAssets` 在 `preBuild` 把根目录 `dashboard.html/css/js` 和 `vendor/` 拷到 `build/generated/web-assets`。改查询台后必须重新 `assemble*`，不要只改 `android/app/build/` 里的生成物。

改 Android 版本时三处一起动：

1. `android/app/build.gradle.kts` → `versionName`、`versionCode`
2. `MainActivity.java` → `DASHBOARD_URL = "...dashboard.html?v=<versionName>"`（否则 WebView 继续用旧 assets）
3. 如需文档同步：`android/README.md`、根 `README.md`

APK 文件名：`执掌东大-Android-<versionName>-<buildType>.apk`。

原生侧还负责：Cookie 持久化、后台不可见 WebView 重登、短信验证码出现时停自动登录、登录诊断脱敏、E 码通二维码截图、微信可见性、模态时隐藏校园码。细节以 `android/README.md` 为准。

---

## 7. `background.js` 职责边界

只做三件事：

1. 点图标打开带版本参数的查询页。
2. 打开原系统登录页（可切二维码标签）。
3. 在用户已登录的教务标签页里读培养方案（列表/详情/引导）。

**不要**在这里保存学号、方案 ID、专业、Cookie 或任何学生数据。方案身份以原系统当前页为准。

---

## 8. 文档怎么用

| 文件 | 用途 | 过期风险 |
| --- | --- | --- |
| `CODEMAP.md` | 找代码、守边界 | 大改结构后应更新行号段 |
| `README.md` | 人类功能说明、安装 | 版本号可能旧 |
| `design.md` | 信息架构、token、组件规则 | 改 CSS/导航前读 |
| `api.md` | 接口路径、表单 POST、字段别名 | 学校升级后字段会变；实现里要留别名 |
| `AUDIT_REPORT.md` | 旧审查已修项 | 不要当未完成 TODO |
| `android/README.md` | 原生功能与隐私 | 构建命令、缓存目录仍有效 |
| `vendor/README.md` | html2canvas / jsPDF 许可 |  |

---

## 9. 怎么跑、怎么验

无 npm 脚本。静态测试用本机 Node：

```sh
node tests/audit_smoke.js
node tests/mobile_shell_smoke.js
```

这两份测试会把 `dashboard.js` 放进 stub 的 `document`/`AndroidApi` 里跑，**不断网、不打真教务**。`audit_smoke.js` 末尾会剥掉自动 `refresh()`。加映射/学期/GPA/本地课表/PDF 模型时扩 `audit_smoke.js`；动校园码头、`render()` 是否重置 header、弹窗锁手势时扩 `mobile_shell_smoke.js`。

Android：

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
cd android && ./gradlew :app:assembleDebug
```

产物：`android/app/build/outputs/apk/debug/执掌东大-Android-<versionName>-debug.apk`。

Chrome：`chrome://extensions/` → 开发者模式 → 加载本仓库根目录。

没有浏览器自动化套件。UI 改完按 `design.md` 在桌面宽屏和窄屏（或真机）点一遍：总览、课表、成绩、考试、设置，以及相关弹窗。

---

## 10. 硬约束（写代码时默认遵守）

1. **禁止**把账号、密码、Cookie、SSO ticket、`Authorization`、验证码、完整查询参数写入仓库、日志、诊断原文或 PDF。
2. 诊断报告必须脱敏（见现有 `sanitizeDiagnosticUrl` / `cacheSafeValue`）。
3. 原生网络桥只允许 `https://webvpn.neu.edu.cn/`。
4. 接口 POST 是 `application/x-www-form-urlencoded`；`querySetting` 是表单里的 JSON 字符串，不是 JSON body。
5. 课表 XHR 需要 WebVPN 标记 `vpn-12-o1-jwxt.neu.edu.cn`，且不要加 `Fetch-Api: true`。
6. `/http/` 优先，`/https/` 兜底；课表上下文兼容 `kbapp` 与 `kbbpapp`。
7. 解析用 `firstArray` / `rowsOf` / `valueOf` 多字段别名，不要只认一个 JSON 路径。
8. 会写共享 `state` 的异步流程必须打代次号，await 之后核对，防止旧请求盖新选择。
9. 全校课表不要占用 `state.loading`。
10. 空数组的“成功”响应，有缓存时不要当成真实清空。
11. 培养方案 PDF 只导出白名单结构/完成状态，不要序列化原始接口对象。
12. 本地课表与教务缓存分 schema、分目录；冲突「隐藏」不是删除学校数据。
13. `render()` 不得把 `state.mobileShell.campusHeaderState` 默认改回可见。
14. 关闭弹窗后不要自动恢复校园码，必须用户在主页面重新下拉。

---

## 11. 常见任务走哪

| 任务 | 路径 |
| --- | --- |
| 成绩多一个展示字段 | `mapScore` → `renderScores` → 必要时 `api.md` |
| GPA 规则 | `gpaExclusionReason`、`calculateAverageGpa`、`audit_smoke.js` |
| 考试时间解析错 | `parseExamDate` / `parseExamTimeDescription` / `mapExam`（非法日期必须 `null`） |
| 个人课表格子重叠 | `mapCourse`、`expandMappedCourse`、`renderScheduleGrid` |
| 本地加课/冲突 | `9439` 之后 overlay；测试「不同时改 `state.data.courses`」 |
| 课表 PNG/CSV | `buildScheduleExportCanvas` / `buildScheduleCsv`；Android 走 `saveImage`/`saveCsv` |
| 全校课表 403 / 缺页 | `loadScheduleTypes`、`loadAllSchedulePages`、`queryAction` 优先于中文名猜测 |
| 培养方案读不到 / 读错专业 | `background.js` 引导 + `loadCurriculumPlans`；提示用户等原页加载完再刷新 |
| 当前学期错 | `chooseCurrentTerm` / `applyCurrentTermDefaults`；设置页与查询页学期分离 |
| Android 登录失败 | `MainActivity` 诊断链路；页面 `copy-login-diagnostics` |
| 校园码挡住弹窗 / 乱闪 | `syncNativeEcodeOverlayLock`、`mobile_shell_smoke.js` |
| WebVPN 小工具 | `state.webvpnTool` + 页面内 AES 编码；不上传 URL |
| 改颜色/间距 | `design.md` token，再改 `dashboard.css` 的 `:root` |

---

## 12. 给下一个 AI / 同事的开工顺序

1. 读本文件第 3、5.1、10 节。
2. 若动接口：读 `api.md` 对应章节，再在 `dashboard.js` 搜路径字符串。
3. 若动 UI：读 `design.md`，改 `dashboard.css` / `render*`，桌面与窄屏都看。
4. 若动 Android 壳：只改 `MainActivity.java` 和资源，不要手改 generated web-assets。
5. 跑 `node tests/audit_smoke.js` 和 `node tests/mobile_shell_smoke.js`。
6. 涉及版本：按第 6 节改齐，不要只改一个文件。
7. 更新本代码地图：若你移动了大段逻辑或新增文件，改第 2、5、6 节的行号和树。

历史审查里已经修过的坑（竞态代次号、全校课表分页失败不能静默丢课、`queryAction` 优先、非法考试日期、培养方案合并索引）写在 `AUDIT_REPORT.md`，不要回退。
