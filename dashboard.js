"use strict";

const IS_ANDROID_APP = Boolean(globalThis.AndroidApi?.request);
if (IS_ANDROID_APP) {
  document.documentElement.classList.add("android-shell");
  // 培养计划需要桌面浏览器后台挂着原系统页面，手机端不展示这个入口，
  // 避免用户误以为 Android 端也能直接读取浏览器标签页会话。
  document.querySelectorAll('[data-view="curriculum"]').forEach((node) => node.remove());
  // 课程大纲只在桌面插件提供；Android 不显示、不请求、不缓存课程大纲，
  // 误入旧链接时 render() 也会回到总览。桌面端通过扩展请求复用登录会话，
  // 不要求用户常驻原系统课程大纲页面。
  document.querySelectorAll('[data-view="course-outline"]').forEach((node) => node.remove());
}

// 登录后教务系统会把入口从 /https/ 重定向到 /http/；原系统的课表 iframe、
// 静态脚本和数据请求都使用重定向后的根地址。保留 /https/ 作为失效入口兜底。
const PORTAL_URL = "https://webvpn.neu.edu.cn/http/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";
const PORTAL_FALLBACK_URL = "https://webvpn.neu.edu.cn/https/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";
const HOME_API_ROOT = `${PORTAL_URL}/jwapp/sys/homeapp/api/home`;
const KB_API_ROOT = `${PORTAL_URL}/jwapp/sys/kbapp`;
const KB_CONTEXT_ROOT = `${PORTAL_URL}/jwapp/sys/kbapp/*default`;
const KBBP_API_ROOT = `${PORTAL_URL}/jwapp/sys/kbbpapp`;
const KBBP_CONTEXT_ROOT = `${PORTAL_URL}/jwapp/sys/kbbpapp/*default`;
// WebVPN 注入到原系统 XHR URL 上的目标主机标记；缺少它时课表模块会返回 403。
const WEBVPN_TARGET_MARKER = "vpn-12-o1-jwxt.neu.edu.cn";
const JWPUB_API_ROOT = `${PORTAL_URL}/jwapp/sys/jwpubapp`;
const SCORE_API_ROOT = `${PORTAL_URL}/jwapp/sys/cjzhcxapp`;
const SCORE_CONTEXT_ROOT = `${PORTAL_URL}/jwapp/sys/cjzhcxapp/*default`;
const PYFA_API_ROOT = `${PORTAL_URL}/jwapp/sys/pyfagl`;
const PYFA_CONTEXT_ROOT = `${PORTAL_URL}/jwapp/sys/pyfagl/*default`;
// 培养方案模块和课表模块使用不同的 WebVPN 目标标记。
const PYFA_TARGET_MARKER = "vpn-12-o1-jwxt.neu.edu.cn";
// 课程大纲走独立的 WebVPN 目标路由；不要复用课表/培养方案的 o1 标记。
const COURSE_OUTLINE_TARGET_MARKER = "o2";
const COURSE_OUTLINE_WEBVPN_MARKER = `vpn-12-${COURSE_OUTLINE_TARGET_MARKER}-jwxt.neu.edu.cn`;
const COURSE_OUTLINE_API_ROOT = `${PORTAL_URL}/jwapp/sys/kccx`;
const COURSE_OUTLINE_LIST_PATH = "modules/dgcx/cxlb.do";
const COURSE_OUTLINE_METADATA_PATH = "modules/kcdgwhgl.do";
const COURSE_OUTLINE_DETAIL_ENDPOINTS = Object.freeze([
  "cxkcxxx.do",
  "cxkcdgxx.do",
  "cxkcjcxx.do",
  "cxkcmbxx.do",
  "kcmbybyzccx.do",
  "cxkcmbhnrdgx.do",
  "cxkccjpdff.do",
  "cxkhxs.do",
  "cxkhxscjzb.do",
  "cxkhhjsz.do",
  "cxkcmbdcbz.do",
  "cxkczlpjhgjjz.do",
  "cxzbrxgxx.do",
  "cxkcdgfj.do"
]);
const COURSE_OUTLINE_ENDPOINT_LABELS = Object.freeze({
  "cxkcxxx.do": "基本信息",
  "cxkcdgxx.do": "教材参考 / 先修",
  "cxkcjcxx.do": "课程简介",
  "cxkcmbxx.do": "课程目标",
  "kcmbybyzccx.do": "毕业要求支撑",
  "cxkcmbhnrdgx.do": "教学安排",
  "cxkccjpdff.do": "课程成绩评定方法",
  "cxkhxs.do": "考核形式",
  "cxkhxscjzb.do": "目标考核关系",
  "cxkhhjsz.do": "成绩评定",
  "cxkcmbdcbz.do": "达成标准",
  "cxkczlpjhgjjz.do": "质量改进",
  "cxzbrxgxx.do": "编制信息",
  "cxkcdgfj.do": "附件"
});
const ALL_SCHEDULE_RETRY_LIMIT = 8;
const ALL_SCHEDULE_RETRY_DELAY = 1500;
const API_REQUEST_TIMEOUT = 12000;
const ALL_SCHEDULE_REQUEST_TIMEOUT = 8000;
const COURSE_OUTLINE_REQUEST_TIMEOUT = 12000;
const COURSE_OUTLINE_DETAIL_CONCURRENCY = 5;
const CAMPUS_HEADER_VISIBLE = "VISIBLE";
const CAMPUS_HEADER_HIDDEN = "HIDDEN";
const CAMPUS_HEADER_HIDDEN_AT_TOP = "HIDDEN_AT_TOP";
const CAMPUS_HEADER_HIDE_SCROLL_TOP = 56;
const CAMPUS_HEADER_REVEAL_PULL_DISTANCE = 64;
const TOAST_SETTING_KEY = "zhizhang.toastNotifications";
const CURRENT_TERM_SETTING_KEY = "zhizhang.currentTerm.v1";
const CAMPUS_SETTING_KEY = "zhizhang.campus.v1";
const SCORE_REMINDER_STORAGE_PREFIX = "zhizhang.scoreReminder.v1";
const TOAST_CATEGORY_ESSENTIAL = "essential";
const WEBVPN_COMPAT_KEY = "b0A58a69394ce73@";
const WEBVPN_AES_SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
]);
const CAMPUS_CODES = Object.freeze({ NANHU: "nanhu", HUNNAN: "hunnan" });
const SHARED_AFTERNOON_PERIODS = Object.freeze({
  5: ["14:00", "14:45"], 6: ["14:55", "15:40"],
  7: ["16:00", "16:45"], 8: ["16:55", "17:40"],
  9: ["18:30", "19:15"], 10: ["19:25", "20:10"],
  11: ["20:20", "21:05"], 12: ["21:15", "22:00"]
});
const CAMPUS_PERIOD_TIMES = Object.freeze({
  [CAMPUS_CODES.NANHU]: Object.freeze({
    1: ["08:00", "08:45"], 2: ["08:55", "09:40"],
    3: ["10:00", "10:45"], 4: ["10:55", "11:40"],
    ...SHARED_AFTERNOON_PERIODS
  }),
  [CAMPUS_CODES.HUNNAN]: Object.freeze({
    1: ["08:30", "09:15"], 2: ["09:25", "10:10"],
    3: ["10:30", "11:15"], 4: ["11:25", "12:10"],
    ...SHARED_AFTERNOON_PERIODS
  })
});

let nativeRequestSequence = 0;
const nativeRequests = new Map();

function readStoredSetting(key, fallback = "") {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredSetting(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // file:// 页面或隐私模式可能禁用 localStorage；不影响当前会话使用。
  }
}

function normalizeCurrentTermPreference(raw = {}) {
  let source = raw;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) source = {};
  const mode = source.mode === "manual" ? "manual" : "auto";
  return {
    mode,
    overrideCode: mode === "manual" ? String(source.overrideCode || "").trim() : "",
    detectedCode: String(source.detectedCode || "").trim(),
    detectedSource: String(source.detectedSource || "").trim(),
    syncedAt: String(source.syncedAt || "").trim()
  };
}

function initialCurrentTermPreference() {
  if (IS_ANDROID_APP) {
    try {
      const nativeValue = globalThis.AndroidApi?.getCurrentTermSettings?.();
      if (nativeValue) {
        const normalized = normalizeCurrentTermPreference(nativeValue);
        writeStoredSetting(CURRENT_TERM_SETTING_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch {
      // 旧版 Android 原生桥没有该方法时继续读取 WebView 本地存储。
    }
  }
  return normalizeCurrentTermPreference(readStoredSetting(CURRENT_TERM_SETTING_KEY, ""));
}

function persistCurrentTermPreference(preference) {
  const normalized = normalizeCurrentTermPreference(preference);
  const payload = JSON.stringify(normalized);
  writeStoredSetting(CURRENT_TERM_SETTING_KEY, payload);
  if (IS_ANDROID_APP) {
    try { globalThis.AndroidApi?.setCurrentTermSettings?.(payload); } catch { /* 当前会话仍可使用 */ }
  }
  return normalized;
}

const storedCurrentTermPreference = initialCurrentTermPreference();

function normalizeCampusCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return code === CAMPUS_CODES.NANHU || code === CAMPUS_CODES.HUNNAN ? code : "";
}

function initialCampusCode() {
  if (IS_ANDROID_APP) {
    try {
      const nativeValue = normalizeCampusCode(globalThis.AndroidApi?.getCampusSetting?.());
      if (nativeValue) {
        writeStoredSetting(CAMPUS_SETTING_KEY, nativeValue);
        return nativeValue;
      }
    } catch {
      // 旧版 Android 原生桥没有该方法时继续读取 WebView 本地存储。
    }
  }
  return normalizeCampusCode(readStoredSetting(CAMPUS_SETTING_KEY, ""));
}

function persistCampusCode(value) {
  const code = normalizeCampusCode(value);
  writeStoredSetting(CAMPUS_SETTING_KEY, code);
  if (IS_ANDROID_APP) {
    try { globalThis.AndroidApi?.setCampusSetting?.(code); } catch { /* 当前会话仍可使用 */ }
  }
  return code;
}

const storedCampusCode = initialCampusCode();

function initialToastNotificationsEnabled() {
  const stored = readStoredSetting(TOAST_SETTING_KEY, "");
  if (stored === "on" || stored === "off") {
    const enabled = stored !== "off";
    if (IS_ANDROID_APP) {
      try { globalThis.AndroidApi?.setToastNotificationsEnabled?.(enabled); } catch { /* use page setting */ }
    }
    return enabled;
  }
  if (IS_ANDROID_APP) {
    try {
      const nativeValue = globalThis.AndroidApi?.getToastNotificationsEnabled?.();
      if (typeof nativeValue === "boolean") return nativeValue;
    } catch {
      // 旧版原生桥没有该方法时保持默认开启。
    }
  }
  return true;
}

let toastNotificationsPreference = initialToastNotificationsEnabled();

function toastNotificationsEnabled() {
  return toastNotificationsPreference;
}

function setToastNotificationsEnabled(enabled) {
  toastNotificationsPreference = Boolean(enabled);
  writeStoredSetting(TOAST_SETTING_KEY, toastNotificationsPreference ? "on" : "off");
  if (IS_ANDROID_APP) {
    try { globalThis.AndroidApi?.setToastNotificationsEnabled?.(toastNotificationsPreference); } catch { /* current session still works */ }
  }
  // 关闭开关时立即清掉已经显示的 Toast，避免用户还看到旧提示。
  if (!toastNotificationsPreference) showToast("");
}

function androidLoginMethod() {
  if (!IS_ANDROID_APP) return "password";
  try {
    const method = globalThis.AndroidApi?.getLoginMethod?.();
    return ["builtin", "password", "wechat"].includes(method) ? method : "builtin";
  } catch {
    return "builtin";
  }
}

function androidLoginError() {
  if (!IS_ANDROID_APP) return "";
  try {
    return String(globalThis.AndroidApi?.getLoginError?.() || "");
  } catch {
    return "";
  }
}

async function copyAndroidLoginDiagnostics() {
  if (!IS_ANDROID_APP) return;
  try {
    if (typeof globalThis.AndroidApi?.copyLoginDiagnostics === "function") {
      const copied = globalThis.AndroidApi.copyLoginDiagnostics();
      if (copied !== false) {
        setNotice("详细登录诊断信息已复制，请粘贴给开发者。", "success");
        return;
      }
    }
    const report = String(globalThis.AndroidApi?.getLoginDiagnostics?.() || "");
    if (!report) throw new Error("当前没有可复制的登录诊断报告");
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(report);
    else {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("系统拒绝复制");
      textarea.remove();
    }
    setNotice("详细登录诊断信息已复制，请粘贴给开发者。", "success");
  } catch (error) {
    setNotice(`复制详细报错失败：${error.message || "请重试"}`, "error");
  }
}

// Android WebView 的原生网络桥会通过这个回调把带 Cookie 的响应交还给页面。
// 浏览器扩展环境没有 AndroidApi，因此仍然走下方的 fetch 分支。
globalThis.__nativeApiResponse = (requestId, status, body) => {
  const pending = nativeRequests.get(String(requestId));
  if (!pending) return;
  nativeRequests.delete(String(requestId));
  clearTimeout(pending.timer);
  if (Number(status) < 0) {
    pending.reject(new ApiError("无法连接教务系统", body || "原生网络请求失败"));
    return;
  }
  pending.resolve({ status: Number(status), body: String(body ?? "") });
};

const state = {
  // Android 顶部校园码属于 Mobile Shell，不属于某个具体页面；只在
  // WebView 真正重新创建时回到 VISIBLE，SPA 页面 render 不得重置它。
  mobileShell: {
    campusHeaderState: CAMPUS_HEADER_VISIBLE
  },
  androidLogin: {
    status: androidLoginError() ? "failed" : "",
    message: androidLoginError()
  },
  view: "overview",
  terms: [],
  termCode: "",
  termSelectionTouched: false,
  currentTerm: {
    ...storedCurrentTermPreference,
    syncing: false,
    error: ""
  },
  campus: {
    code: storedCampusCode,
    promptOpen: false
  },
  // 教务系统返回的当前学期。它只用于初始化各个学期选择器；用户手动
  // 切换后的 state.termCode 不会反过来覆盖这个检测结果。
  detectedTermCode: storedCurrentTermPreference.detectedCode,
  detectedTermSource: storedCurrentTermPreference.detectedSource,
  studentId: "",
  connected: false,
  loading: false,
  fatalError: "",
  data: {
    scores: [],
    // 当前学期用于成绩页展示；allScores 汇总所有已查询学期，供培养方案判定完成情况。
    allScores: [],
    exams: [],
    courses: [],
    scheduleDetail: [],
    scheduleSource: "",
    gpa: "—",
    gpaMeta: {
      source: "",
      reported: "—",
      included: 0,
      excluded: 0,
      total: 0,
      credit: 0,
      rule: "",
      scope: "",
      termCount: 0,
      successfulTermCount: 0,
      populatedTermCount: 0,
      failedTermCount: 0
    }
  },
  curriculum: {
    plans: [],
    selectedPlanId: "",
    selectedPlan: null,
    groups: [],
    courses: [],
    loading: false,
    error: "",
    source: "",
    loaded: false,
    filter: "",
    mode: "all",
    semester: "all",
    pendingOnly: false,
    // 只保存当前会话中的展开状态；刷新同一方案时保留，切换方案时清空。
    expanded: {},
    exporting: false,
    courseDetail: null,
    bootstrap: {
      status: "idle",
      message: "",
      error: "",
      tabId: null,
      reading: false
    }
  },
  // 课程大纲是课程目录查询，和培养计划、顶部当前学期及个人业务缓存
  // 完全隔离。原始响应只存在当前页面会话中，关闭页面即释放。
  courseOutline: {
    list: {
      filters: { code: "", name: "", unit: "", level: "", grade: "" },
      rows: [],
      pageNumber: 1,
      pageSize: 10,
      totalSize: 0,
      rawResponse: null,
      loading: false,
      loaded: false,
      error: "",
      requestSequence: 0,
      scrollTop: 0
    },
    detail: null,
    bootstrap: {
      status: "idle",
      message: "",
      error: ""
    },
    metadata: {
      loaded: false,
      loading: false,
      error: "",
      rawResponse: null,
      endpoints: {},
      codePaths: []
    }
  },
  scheduleTypes: [],
  scheduleTypesLoaded: false,
  scheduleTypeError: "",
  allScheduleHiddenTypes: [],
  allTerms: [],
  allTermsLoaded: false,
  allTermCode: "",
  allTermSelectionTouched: false,
  allTermError: "",
  allTypeCode: "",
  allRows: [],
  allTotal: "",
  allPage: 1,
  allPageSize: 10,
  allError: "",
  allPendingMessage: "",
  allAttempt: 0,
  allRetrying: false,
  allDetail: null,
  // 全校课表课程传输工具：只保留当前页面会话中的勾选和弹窗状态，
  // 不把课程文本、原始接口字段或任何账号信息写入本地存储。
  courseTransfer: {
    selectionScope: "",
    selectionMode: false,
    selectedKeys: new Set(),
    mode: "",
    text: "",
    exportText: "",
    error: "",
    notice: "",
    result: null,
    sortMode: {
      all: "source",
      "all-detail": "source"
    }
  },
  // WebVPN 地址只在当前页面内生成和展示，不上传输入，也不写入本地存储。
  webvpnTool: {
    open: false,
    input: "https://jwxt.neu.edu.cn",
    output: "",
    error: ""
  },
  // 点击体育课程名称后，原系统会额外请求“列表”弹窗中的体育项目明细。
  // 只在内存中缓存当前会话的结果，不保存账号、密码或接口响应到磁盘。
  sportProjectCache: new Map(),
  selectedCourse: null,
  selectedCourseScope: "personal",
  scheduleWeek: {
    personal: "",
    "all-detail": "all"
  },
  scheduleDisplay: {
    personal: "days",
    "all-detail": "week"
  },
  scheduleExport: null,
  calendar: {
    // 东大按周日作为一周第一天；设置页保存的是“第一周周日”的日期。
    firstWeekStart: readStoredSetting("zhizhang.firstWeekStart")
  },
  personalCache: {
    hydrated: false,
    available: false,
    source: "",
    savedAt: "",
    studentId: "",
    networkTermsAttempted: false,
    lastLiveEndpointCount: 0,
    termSnapshots: {},
    allScores: [],
    scoreDetails: {}
  },
  // 用户手动创建的课程/日程是独立的本地 Overlay，永远不写入 data.courses
  // 或 data.scheduleDetail。它和个人教务缓存使用不同的 schema、不同的
  // Android 文件目录，并按当前 studentId 分开保存。
  localSchedule: {
    hydrated: false,
    loading: false,
    items: [],
    hiddenSchoolEntries: [],
    profileKey: "",
    editorOpen: false,
    managerOpen: false,
    editingId: "",
    draft: null,
    editorError: "",
    conflict: null,
    filter: "all",
    corrupted: false,
    lastCsvSkipped: 0
  },
  scoreDetail: null,
  // 只在内存里保存尚未确认的成绩明细；本地持久化仅保存不可逆指纹，
  // 并按学号与学期双重隔离，避免切换历史学期时交叉提醒。
  scoreReminder: {
    pendingByScope: {}
  },
  filters: {
    scores: "",
    exams: "",
    personal: "",
    allKeyword: "",
    allCode: "",
    allName: ""
  },
  errors: [],
  updatedAt: ""
};

globalThis.__androidLoginStatus = (status, message) => {
  if (!IS_ANDROID_APP) return;
  state.androidLogin.status = String(status || "");
  state.androidLogin.message = String(message || "");
  if (state.androidLogin.status === "success") {
    state.fatalError = "";
    setNotice(state.androidLogin.message || "后台登录成功，正在刷新数据…", "success");
  } else if (state.androidLogin.status === "retrying") {
    setNotice(state.androidLogin.message || "正在后台重新登录…", "");
  } else if (state.androidLogin.status === "failed") {
    setNotice(state.androidLogin.message || "后台自动登录失败，请手动登录。", "error");
  }
  render();
};

let filterRenderTimer = 0;
let toastTimer = 0;
// 所有会修改共享 UI state 的异步任务都使用代次号，避免用户快速切换学期、
// 重复查询或切换培养方案时，较早返回的旧请求覆盖较新的选择。
let refreshRequestSequence = 0;
let refreshInFlight = null;
let refreshFlightTermCode = "";
let refreshQueued = false;
let refreshQueuedForceTerms = false;
// Android 启动时先恢复本地展示数据，再由原生安排远程会话探测。这个 Promise
// 是 single-flight 门闩：首屏、手动刷新和页面切换不会重复读取同一份本地缓存。
let localBootstrapPromise = null;
let allScheduleRequestSequence = 0;
let allScheduleDetailRequestSequence = 0;
let curriculumListRequestSequence = 0;
let curriculumPlanRequestSequence = 0;
let courseOutlineDetailRequestSequence = 0;
let sportProjectRequestSequence = 0;

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  connection: document.getElementById("connectionStatus"),
  updatedAt: document.getElementById("updatedAt"),
  termSelect: document.getElementById("termSelect"),
  refresh: document.getElementById("refreshButton"),
  notice: document.getElementById("notice"),
  toastRegion: document.getElementById("toastRegion"),
  content: document.getElementById("content")
};

// Android 端的教务系统会话可能很快失效，因此把已成功读取的个人结果
// 放进应用内部文件。这里只缓存已经映射好的展示数据，不缓存原始请求凭据。
const PERSONAL_CACHE_SCHEMA = "zhizhang-personal-cache/v2";
// JavascriptInterface 走 Binder 传输时不适合传几 MB 的大字符串；映射后的
// 个人结果通常远小于这个上限，超限时会自动只保留当前学期。
const PERSONAL_CACHE_MAX_BYTES = 900 * 1024;
const PERSONAL_CACHE_SECRET_KEY = /(?:password|passwd|pwd|captcha|token|cookie|authorization|secret|session(?:id)?|ticket|^raw$)/i;

function cacheSafeValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 10) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 2000).map((item) => cacheSafeValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const result = {};
  Object.entries(value).slice(0, 500).forEach(([key, child]) => {
    if (PERSONAL_CACHE_SECRET_KEY.test(key)) return;
    const safe = cacheSafeValue(child, depth + 1);
    if (safe !== undefined) result[key] = safe;
  });
  return result;
}

function emptyPersonalData() {
  return {
    scores: [],
    allScores: [],
    exams: [],
    courses: [],
    scheduleDetail: [],
    scheduleSource: "",
    gpa: "—",
    gpaMeta: {
      source: "",
      reported: "—",
      included: 0,
      excluded: 0,
      total: 0,
      credit: 0,
      rule: "",
      scope: "",
      termCount: 0,
      successfulTermCount: 0,
      populatedTermCount: 0,
      failedTermCount: 0
    }
  };
}

function cacheTermSnapshot(data = state.data) {
  return cacheSafeValue({
    scores: data.scores,
    exams: data.exams,
    courses: data.courses,
    scheduleDetail: data.scheduleDetail,
    scheduleSource: data.scheduleSource,
    gpa: data.gpa,
    gpaMeta: data.gpaMeta
  }) || {};
}

function cacheDateText(value) {
  const text = displayValue(value, "");
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : text;
}

function scoreReminderHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function scoreReminderProfile() {
  return String(state.studentId || state.personalCache.studentId || "").trim();
}

function scoreReminderScope(termCode, profile = scoreReminderProfile()) {
  const term = String(termCode || "").trim();
  const owner = String(profile || "").trim();
  return owner && term ? `${scoreReminderHash(owner)}.${scoreReminderHash(term)}` : "";
}

function scoreReminderStorageKey(termCode, profile = scoreReminderProfile()) {
  const scope = scoreReminderScope(termCode, profile);
  return scope ? `${SCORE_REMINDER_STORAGE_PREFIX}.${scope}` : "";
}

function scoreReminderText(value) {
  return String(value ?? "").toLowerCase().replace(/[\s_\-—–·•:：,，.。/\\]+/g, "").trim();
}

function scoreReminderFingerprint(row = {}, termCode = state.termCode) {
  const identity = scoreReminderText(row.detailId)
    || [row.code, row.name, row.credit].map(scoreReminderText).join("|");
  const result = [row.score, row.gpa, row.status, row.retake].map(scoreReminderText).join("|");
  return identity && result ? scoreReminderHash(`${scoreReminderText(termCode)}|${identity}|${result}`) : "";
}

function scoreReminderHasPublishedResult(row = {}) {
  const score = String(row.score ?? "").trim();
  return Boolean(score && score !== "—" && !/待发布|修读中|进行中/.test(score));
}

function scoreReminderFingerprints(rows, termCode) {
  return [...new Set((rows || [])
    .filter(scoreReminderHasPublishedResult)
    .map((row) => scoreReminderFingerprint(row, termCode))
    .filter(Boolean))];
}

function readScoreReminderBaseline(termCode, profile = scoreReminderProfile()) {
  const key = scoreReminderStorageKey(termCode, profile);
  if (!key) return null;
  const raw = readStoredSetting(key, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String).filter(Boolean)) : null;
  } catch {
    return null;
  }
}

function writeScoreReminderBaseline(termCode, fingerprints, profile = scoreReminderProfile()) {
  const key = scoreReminderStorageKey(termCode, profile);
  if (!key) return false;
  writeStoredSetting(key, JSON.stringify([...new Set(fingerprints || [])].slice(-3000)));
  return true;
}

function queueNewScoreReminder(termCode, liveScores, cachedScores = null) {
  const profile = scoreReminderProfile();
  const scope = scoreReminderScope(termCode, profile);
  if (!scope || !Array.isArray(liveScores)) return [];
  let baseline = readScoreReminderBaseline(termCode, profile);
  if (baseline === null) {
    // 升级后的第一次比较优先用该学期已有缓存建基线；如果连该学期缓存
    // 都没有，则把本次结果视为初始快照，不能把整个历史学期误报为新成绩。
    const cachedFingerprints = Array.isArray(cachedScores)
      ? scoreReminderFingerprints(cachedScores, termCode)
      : [];
    const canCompareWithCache = cachedFingerprints.length > 0;
    baseline = new Set(canCompareWithCache
      ? cachedFingerprints
      : scoreReminderFingerprints(liveScores, termCode));
    writeScoreReminderBaseline(termCode, baseline, profile);
    if (!canCompareWithCache) return [];
  }
  const newRows = liveScores.filter((row) => {
    if (!scoreReminderHasPublishedResult(row)) return false;
    const fingerprint = scoreReminderFingerprint(row, termCode);
    return fingerprint && !baseline.has(fingerprint);
  });
  if (!newRows.length) return [];
  const existing = state.scoreReminder.pendingByScope[scope];
  const merged = new Map();
  [...(existing?.rows || []), ...newRows].forEach((row) => {
    const fingerprint = scoreReminderFingerprint(row, termCode);
    if (fingerprint) merged.set(fingerprint, row);
  });
  state.scoreReminder.pendingByScope[scope] = {
    scope,
    profile,
    termCode: String(termCode || ""),
    rows: [...merged.values()]
  };
  return newRows;
}

function currentScoreReminder() {
  if (state.view !== "scores" || state.loading) return null;
  const scope = scoreReminderScope(state.termCode);
  const pending = scope ? state.scoreReminder.pendingByScope[scope] : null;
  return pending?.termCode === state.termCode && pending.rows?.length ? pending : null;
}

function acknowledgeCurrentScoreReminder() {
  const pending = currentScoreReminder();
  if (!pending) return;
  const baseline = readScoreReminderBaseline(pending.termCode, pending.profile) || new Set();
  scoreReminderFingerprints([...(state.data.scores || []), ...(pending.rows || [])], pending.termCode)
    .forEach((fingerprint) => baseline.add(fingerprint));
  writeScoreReminderBaseline(pending.termCode, baseline, pending.profile);
  delete state.scoreReminder.pendingByScope[pending.scope];
  render();
}

function personalCacheStatusText() {
  if (!IS_ANDROID_APP || !state.personalCache.available) return "";
  const time = cacheDateText(state.personalCache.savedAt);
  return state.personalCache.source === "network"
    ? `已自动缓存${time ? ` · ${time}` : ""}`
    : `当前使用本机缓存${time ? ` · ${time}` : ""}`;
}

function applyCachedTermSnapshot(termCode, fallback = null) {
  const snapshot = state.personalCache.termSnapshots?.[termCode] || fallback;
  if (!snapshot || typeof snapshot !== "object") return false;
  const base = emptyPersonalData();
  state.data = {
    ...base,
    ...snapshot,
    scores: Array.isArray(snapshot.scores) ? snapshot.scores : [],
    exams: Array.isArray(snapshot.exams) ? snapshot.exams : [],
    courses: Array.isArray(snapshot.courses) ? snapshot.courses : [],
    scheduleDetail: Array.isArray(snapshot.scheduleDetail) ? snapshot.scheduleDetail : [],
    allScores: Array.isArray(state.personalCache.allScores)
      ? state.personalCache.allScores
      : Array.isArray(snapshot.allScores) ? snapshot.allScores : [],
    gpaMeta: { ...base.gpaMeta, ...(snapshot.gpaMeta || {}) }
  };
  state.data.gpa = displayValue(snapshot.gpa, state.data.gpa || "—");
  state.personalCache.source = "cache";
  state.personalCache.available = true;
  state.personalCache.studentId = state.personalCache.studentId || state.studentId;
  return true;
}

function updatePersonalTermSelect() {
  if (!elements.termSelect) return;
  if (!state.terms.length) {
    elements.termSelect.innerHTML = `<option value="">暂无缓存学期</option>`;
    elements.termSelect.disabled = true;
    return;
  }
  elements.termSelect.innerHTML = state.terms
    .map((term) => `<option value="${escapeHtml(term.code)}">${escapeHtml(term.name)}</option>`)
    .join("");
  elements.termSelect.value = state.termCode;
  elements.termSelect.disabled = false;
}

function hydratePersonalCache() {
  if (state.personalCache.hydrated) return state.personalCache.available;
  state.personalCache.hydrated = true;
  if (!IS_ANDROID_APP || typeof globalThis.AndroidApi?.loadPersonalCache !== "function") return false;
  let raw = "";
  try {
    raw = globalThis.AndroidApi.loadPersonalCache() || "";
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const snapshot = JSON.parse(raw);
    if (snapshot?.schema !== PERSONAL_CACHE_SCHEMA) return false;
    const terms = Array.isArray(snapshot.terms)
      ? snapshot.terms.map((term) => ({ code: String(term?.code || ""), name: String(term?.name || term?.code || "") })).filter((term) => term.code)
      : [];
    const termSnapshots = snapshot.termSnapshots && typeof snapshot.termSnapshots === "object"
      ? snapshot.termSnapshots
      : snapshot.termCode && snapshot.data ? { [snapshot.termCode]: snapshot.data } : {};
    state.personalCache.available = Object.keys(termSnapshots).length > 0;
    state.personalCache.savedAt = String(snapshot.savedAt || "");
    state.personalCache.studentId = String(snapshot.studentId || "");
    state.personalCache.termSnapshots = termSnapshots;
    state.personalCache.allScores = Array.isArray(snapshot.allScores) ? snapshot.allScores : [];
    state.personalCache.scoreDetails = snapshot.scoreDetails && typeof snapshot.scoreDetails === "object" ? snapshot.scoreDetails : {};
    state.studentId = state.personalCache.studentId || state.studentId;
    if (terms.length) state.terms = terms;
    if (!state.termCode || !state.terms.some((term) => term.code === state.termCode)) {
      state.termSelectionTouched = false;
      state.termCode = currentTermCodeFor(state.terms)
        || String(snapshot.termCode || "");
    }
    applyCachedTermSnapshot(state.termCode);
    updatePersonalTermSelect();
    if (state.personalCache.available) {
      state.updatedAt = state.personalCache.savedAt;
      elements.updatedAt.textContent = `缓存于 ${cacheDateText(state.personalCache.savedAt) || "此前"}`;
      setConnection("已加载本地缓存", "ready");
    }
  } catch {
    state.personalCache.available = false;
  }
  return state.personalCache.available;
}

function persistPersonalCache() {
  if (!IS_ANDROID_APP || typeof globalThis.AndroidApi?.savePersonalCache !== "function" || !state.studentId || !state.termCode) return;
  const nextTerms = state.terms.map((term) => ({ code: term.code, name: term.name }));
  const nextSnapshots = { ...state.personalCache.termSnapshots, [state.termCode]: cacheTermSnapshot() };
  let payload = {
    schema: PERSONAL_CACHE_SCHEMA,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    studentId: String(state.studentId),
    termCode: state.termCode,
    terms: nextTerms,
    allScores: cacheSafeValue(state.data.allScores) || [],
    termSnapshots: nextSnapshots,
    scoreDetails: cacheSafeValue(state.personalCache.scoreDetails) || {}
  };
  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
    if (new Blob([serialized]).size > PERSONAL_CACHE_MAX_BYTES) {
      payload = {
        ...payload,
        allScores: (payload.allScores || []).slice(0, 1500),
        termSnapshots: { [state.termCode]: nextSnapshots[state.termCode] },
        scoreDetails: {}
      };
      serialized = JSON.stringify(payload);
    }
    if (new Blob([serialized]).size > PERSONAL_CACHE_MAX_BYTES) return;
    globalThis.AndroidApi.savePersonalCache(serialized);
    state.personalCache.termSnapshots = payload.termSnapshots;
    state.personalCache.allScores = payload.allScores;
    state.personalCache.savedAt = payload.savedAt;
    state.personalCache.studentId = payload.studentId;
    state.personalCache.available = true;
    state.personalCache.source = "network";
  } catch {
    // 缓存失败不能影响当前登录会话和页面查询。
  }
}

function clearPersonalCache() {
  try {
    globalThis.AndroidApi?.clearPersonalCache?.();
  } catch {
    // 原生文件清理失败时仍清掉当前页面内存，避免继续显示旧数据。
  }
  const currentTerm = state.termCode;
  state.personalCache = {
    hydrated: true,
    available: false,
    source: "",
    savedAt: "",
    studentId: "",
    networkTermsAttempted: state.personalCache.networkTermsAttempted,
    lastLiveEndpointCount: 0,
    termSnapshots: {},
    allScores: [],
    scoreDetails: {}
  };
  state.data = emptyPersonalData();
  state.studentId = "";
  state.termCode = currentTerm;
  state.updatedAt = "";
  elements.updatedAt.textContent = "";
  setNotice("已清除本机个人教务缓存。", "success");
  render();
}

const androidEcodeElements = {
  card: document.getElementById("androidEcodeCard"),
  qr: document.getElementById("androidEcodeQr"),
  time: document.getElementById("androidEcodeTime"),
  unavailable: document.getElementById("androidEcodeUnavailable")
};

globalThis.__setEcodeSnapshot = (snapshot) => {
  document.documentElement.classList.add("android-shell");
  if (!androidEcodeElements.card) return;
  const qr = typeof snapshot?.qr === "string" ? snapshot.qr : "";
  const time = typeof snapshot?.time === "string" ? snapshot.time : "";
  const ready = Boolean(snapshot?.ok && qr && time);
  androidEcodeElements.card.hidden = false;
  androidEcodeElements.qr.hidden = !ready;
  androidEcodeElements.time.hidden = !ready;
  androidEcodeElements.unavailable.hidden = ready;
  if (ready) {
    if (androidEcodeElements.qr.src !== qr) androidEcodeElements.qr.src = qr;
    androidEcodeElements.time.textContent = time;
  }
};

globalThis.__prepareNativeEcode = () => {
  document.documentElement.classList.add("android-shell");
  if (!androidEcodeElements.card) return;
  // Android 顶部直接显示官方 E 码通 WebView；这里仅保留同等高度的
  // 占位，让官方页面可以随主页面一起上滑，不再重复渲染二维码。
  androidEcodeElements.card.classList.add("android-ecode-placeholder");
  // 先应用 Mobile Shell 的现有状态，再解除 hidden 属性，避免页面重新
  // 初始化或路由切换时短暂闪出一个默认可见的校园码 Header。
  applyNativeEcodePlaceholderState();
  androidEcodeElements.card.hidden = false;
  androidEcodeElements.card.setAttribute("aria-hidden", "true");
  bindNativeEcodeScroll();
};

function applyNativeEcodePlaceholderState() {
  if (!androidEcodeElements.card) return;
  const hidden = state.mobileShell.campusHeaderState !== CAMPUS_HEADER_VISIBLE;
  androidEcodeElements.card.classList.toggle("android-ecode-placeholder-hidden", hidden);
}

function setNativeEcodePlaceholderHidden(hidden) {
  if (!androidEcodeElements.card) return;
  const nextHidden = Boolean(hidden);
  applyNativeEcodePlaceholderState();
  try {
    globalThis.AndroidApi?.setEcodePanelHidden?.(nextHidden);
  } catch {
    // 原生壳升级过程中可能暂时没有这个方法；网页占位仍可以自行收起。
  }
}

function setCampusHeaderState(nextState) {
  if (![CAMPUS_HEADER_VISIBLE, CAMPUS_HEADER_HIDDEN, CAMPUS_HEADER_HIDDEN_AT_TOP].includes(nextState)) return;
  if (state.mobileShell.campusHeaderState === nextState) return;
  state.mobileShell.campusHeaderState = nextState;
  setNativeEcodePlaceholderHidden(nextState !== CAMPUS_HEADER_VISIBLE);
}

function resetCampusHeaderPullGesture() {
  state.mobileShell.topPullActive = false;
  state.mobileShell.topPullStartY = null;
}

function nativeEcodeModalOpen() {
  return Boolean(elements.content?.querySelector?.(".modal-backdrop") || document.querySelector?.(".modal-backdrop"));
}

function syncNativeEcodeOverlayLock() {
  const modalOpen = nativeEcodeModalOpen();
  document.documentElement.classList.toggle("has-modal", modalOpen);
  if (!IS_ANDROID_APP || !modalOpen) return;
  // 模态层拥有自己的滚动容器。打开期间，外层 Mobile Shell 不得把
  // 任何拖动解释为页面顶部下拉；同时隐藏原生校园码，避免它盖住弹窗。
  resetCampusHeaderPullGesture();
  setCampusHeaderState(CAMPUS_HEADER_HIDDEN);
}

function bindNativeEcodeScroll() {
  if (!IS_ANDROID_APP) return;
  const pageWrap = document.querySelector(".page-wrap");
  if (!pageWrap || pageWrap.__nativeEcodeScrollBound) return;
  pageWrap.__nativeEcodeScrollBound = true;
  const shell = state.mobileShell;
  shell.topPullStartY = null;
  shell.topPullActive = false;

  const update = () => {
    const currentTop = Math.max(0, pageWrap.scrollTop || 0);
    const currentState = state.mobileShell.campusHeaderState;
    if (currentState === CAMPUS_HEADER_VISIBLE) {
      // 不要用单次 scroll 事件的 delta 判断：Android WebView 的触摸滚动
      // 会把一次手势拆成许多小于 8px 的事件，累计滚过阈值也不能触发隐藏。
      if (currentTop >= CAMPUS_HEADER_HIDE_SCROLL_TOP) {
        setCampusHeaderState(CAMPUS_HEADER_HIDDEN);
      }
    } else if (currentState === CAMPUS_HEADER_HIDDEN) {
      // 到达顶部只“武装”下一次下拉，不直接显示校园码。
      if (currentTop <= 1) setCampusHeaderState(CAMPUS_HEADER_HIDDEN_AT_TOP);
    } else if (currentState === CAMPUS_HEADER_HIDDEN_AT_TOP && currentTop > 8) {
      // 用户从顶部重新向下滚内容，仍然保持隐藏；只有额外的顶部下拉
      // 手势才允许回到 VISIBLE。
      setCampusHeaderState(CAMPUS_HEADER_HIDDEN);
      shell.topPullActive = false;
      shell.topPullStartY = null;
    }
  };

  const readTouchY = (event) => {
    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    return touch && Number.isFinite(touch.clientY) ? touch.clientY : null;
  };

  const onTouchStart = (event) => {
    if (nativeEcodeModalOpen()) {
      resetCampusHeaderPullGesture();
      return;
    }
    if (![CAMPUS_HEADER_HIDDEN, CAMPUS_HEADER_HIDDEN_AT_TOP].includes(state.mobileShell.campusHeaderState)) return;
    const currentTop = Math.max(0, pageWrap.scrollTop || 0);
    if (currentTop > 1) return;
    if (state.mobileShell.campusHeaderState === CAMPUS_HEADER_HIDDEN) {
      setCampusHeaderState(CAMPUS_HEADER_HIDDEN_AT_TOP);
    }
    shell.topPullStartY = readTouchY(event);
    shell.topPullActive = shell.topPullStartY !== null;
  };

  const onTouchMove = (event) => {
    if (nativeEcodeModalOpen()) {
      resetCampusHeaderPullGesture();
      return;
    }
    if (!shell.topPullActive || state.mobileShell.campusHeaderState !== CAMPUS_HEADER_HIDDEN_AT_TOP) return;
    const currentTop = Math.max(0, pageWrap.scrollTop || 0);
    if (currentTop > 1) {
      setCampusHeaderState(CAMPUS_HEADER_HIDDEN);
      shell.topPullActive = false;
      shell.topPullStartY = null;
      return;
    }
    const currentY = readTouchY(event);
    const deltaY = currentY === null || shell.topPullStartY === null ? 0 : currentY - shell.topPullStartY;
    if (deltaY < 0) {
      shell.topPullActive = false;
      shell.topPullStartY = null;
      return;
    }
    if (deltaY >= CAMPUS_HEADER_REVEAL_PULL_DISTANCE) {
      // 同一根手指只消费一次顶部下拉，避免 show/hide 在 overscroll 中振荡。
      setCampusHeaderState(CAMPUS_HEADER_VISIBLE);
      shell.topPullActive = false;
      shell.topPullStartY = null;
    }
  };

  const clearTouch = resetCampusHeaderPullGesture;

  pageWrap.addEventListener("scroll", update, { passive: true });
  pageWrap.addEventListener("touchstart", onTouchStart, { passive: true });
  pageWrap.addEventListener("touchmove", onTouchMove, { passive: true });
  pageWrap.addEventListener("touchend", clearTouch, { passive: true });
  pageWrap.addEventListener("touchcancel", clearTouch, { passive: true });
  applyNativeEcodePlaceholderState();
  setNativeEcodePlaceholderHidden(state.mobileShell.campusHeaderState !== CAMPUS_HEADER_VISIBLE);
}

class ApiError extends Error {
  constructor(message, details = "", status = 0, options = {}) {
    super(message);
    this.name = "ApiError";
    this.details = details;
    this.status = Number(status) || 0;
    this.authFailure = Boolean(options.authFailure);
    this.retryable = Boolean(options.retryable);
  }
}

function valueOf(object, keys, fallback = "") {
  if (!object || typeof object !== "object") return fallback;
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function displayValue(value, fallback = "—") {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => displayValue(item, "")).filter(Boolean).join("、") || fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const text = displayValue(value, "");
  if (!text) return "—";
  return text
    .replace(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})T/, "$1-$2-$3 ")
    .replace(/\.0+$/, "");
}

function normalizeExamTime(value) {
  const text = displayValue(value, "");
  const match = text.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function parseExamDate(value) {
  const text = displayValue(value, "");
  const match = text.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day) return null;
  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    timestamp: date.getTime()
  };
}

function parseExamTimeDescription(value) {
  const text = displayValue(value, "");
  if (!text) return {};
  const date = parseExamDate(text);
  const timeMatch = text.match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
  const weekdayMatch = text.match(/星期(日|天|一|二|三|四|五|六|七)/);
  const sessionMatch = text.match(/第\s*(\d+)\s*场/);
  return {
    date,
    start: timeMatch ? normalizeExamTime(timeMatch[1]) : "",
    end: timeMatch ? normalizeExamTime(timeMatch[2]) : "",
    weekday: weekdayMatch ? `星期${weekdayMatch[1] === "天" || weekdayMatch[1] === "七" ? "日" : weekdayMatch[1]}` : "",
    session: sessionMatch ? `第${sessionMatch[1]}场` : ""
  };
}

function weekdayForExamDate(dateInfo) {
  if (!dateInfo) return "";
  return `星期${["日", "一", "二", "三", "四", "五", "六"][new Date(dateInfo.timestamp).getDay()]}`;
}

function formatExamDate(dateInfo, weekday = "") {
  if (!dateInfo) return "日期待发布";
  return `${dateInfo.year}年${dateInfo.month}月${dateInfo.day}日 ${weekday || weekdayForExamDate(dateInfo)}`;
}

function examDayDelta(dateKey) {
  if (!dateKey) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const examDate = parseExamDate(dateKey);
  return examDate ? Math.round((examDate.timestamp - todayStart) / 86400000) : null;
}

function examStatusLabel(raw, dateKey) {
  const explicit = displayValue(valueOf(raw, ["examStatusName", "examStatusText", "KSZTMC", "statusText"]), "");
  if (explicit && !/^\d+$/.test(explicit)) return explicit;
  const delta = examDayDelta(dateKey);
  if (delta === null) return "待发布";
  if (delta < 0) return "已结束";
  if (delta === 0) return "今日考试";
  return "待考试";
}

function examCountdown(row) {
  const delta = examDayDelta(row.dateKey);
  if (delta === null) return "日期待发布";
  if (delta < 0) return `已结束 ${Math.abs(delta)} 天`;
  if (delta === 0) return "今天考试";
  return `距考试 ${delta} 天`;
}

function examStatusClass(status) {
  if (/已结束/.test(status)) return "exam-ended";
  if (/今日/.test(status)) return "exam-today";
  return "exam-upcoming";
}

function sortExamRows(rows) {
  return [...rows].sort((left, right) => {
    const leftKey = left.sortKey || Number.MAX_SAFE_INTEGER;
    const rightKey = right.sortKey || Number.MAX_SAFE_INTEGER;
    return leftKey - rightKey || String(left.name).localeCompare(String(right.name), "zh-CN");
  });
}

function isTruthyFlag(value) {
  return ["1", "true", "yes", "y", "是", "当前"].includes(String(value ?? "").trim().toLowerCase());
}

function firstArray(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") return [];
  const preferredKeys = ["datas", "rows", "items", "list", "records", "data", "result", "content"];
  for (const key of preferredKeys) {
    if (value[key] !== undefined) {
      const found = firstArray(value[key], depth + 1);
      if (found.length) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = firstArray(child, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function rowsOf(payload) {
  return firstArray(payload).filter((item) => item && typeof item === "object");
}

// 课程大纲接口的返回包装在不同版本的教务系统中并不一致：既可能直接
// 返回对象/数组，也可能是 datas.model.rows，甚至是只带业务字段的未知
// 包装。这里统一做“只读索引”，绝不改写 raw，也不把未知字段压扁掉。
function courseOutlineCollection(payload) {
  const visited = new Set();
  const preferredKeys = ["rows", "model", "datas", "data", "result", "content", "response", "payload", "records", "items", "list", "value"];
  const envelopeKeys = new Set(["datas", "data", "result", "content", "response", "payload", "model", "records", "items", "list", "value"]);
  const paginationKeys = ["totalSize", "total", "totalCount", "pageNumber", "pageSize", "page", "recordsTotal", "count"];
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const looksLikeRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return ["KCH", "KCM", "WID", "BBWID", "XNXQDM", "courseCode", "courseName"].some((key) => hasOwn(value, key));
  };
  const isWrapperChild = (path) => {
    const parent = path.length > 1 ? String(path[path.length - 2]) : "";
    return envelopeKeys.has(parent) || parent === "datas";
  };
  const walk = (value, path = [], depth = 0) => {
    if (depth > 10) return null;
    if (value === null || value === undefined) {
      // A null model is a valid response for an empty optional section. It
      // must not promote the outer {code, datas} envelope to a fake record.
      return path.length > 0 && envelopeKeys.has(String(path[path.length - 1]))
        ? { rows: [], shape: "empty", path, container: null, record: null }
        : null;
    }
    if (Array.isArray(value)) {
      return { rows: value, shape: path[path.length - 1] === "rows" ? "rows" : "array", path, container: value };
    }
    if (typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value.rows)) {
      const paged = paginationKeys.some((key) => hasOwn(value, key));
      return { rows: value.rows, shape: paged ? "paged" : "rows", path: [...path, "rows"], container: value };
    }

    let emptyCandidate = null;
    for (const key of preferredKeys) {
      if (!hasOwn(value, key)) continue;
      const found = walk(value[key], [...path, key], depth + 1);
      if (!found) continue;
      if (found.shape === "empty") {
        emptyCandidate ||= found;
        continue;
      }
      return found;
    }
    for (const [key, child] of Object.entries(value)) {
      if (preferredKeys.includes(key)) continue;
      const found = walk(child, [...path, key], depth + 1);
      if (!found) continue;
      if (found.shape === "empty") {
        emptyCandidate ||= found;
        continue;
      }
      return found;
    }

    // Detail responses have appeared as both datas.model and
    // datas.<endpointName>. The latter is not literally named “model”, so
    // identify it by its wrapper position and course identity fields.
    if (isWrapperChild(path) || path[path.length - 1] === "model" || looksLikeRecord(value)) {
      return { rows: [value], shape: "object", path, container: value, record: value };
    }
    if (emptyCandidate) return emptyCandidate;
    return null;
  };
  const found = walk(payload);
  if (found) return found;
  if (payload === null || payload === undefined) return { rows: [], shape: "empty", path: [], container: null };
  if (Array.isArray(payload)) return { rows: payload, shape: "array", path: [], container: payload };
  if (typeof payload === "object" && !Object.keys(payload).some((key) => envelopeKeys.has(key))) {
    return { rows: [payload], shape: "object", path: [], container: payload, record: payload };
  }
  return { rows: [], shape: "unknown", path: [], container: payload, record: null };
}

function courseOutlineFirstValue(payload, keys) {
  if (!payload || typeof payload !== "object") return undefined;
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && String(payload[key]).trim() !== "") return payload[key];
  }
  return undefined;
}

function courseOutlinePageMeta(payload, collection = courseOutlineCollection(payload)) {
  const candidates = [collection?.container, payload].filter((value) => value && typeof value === "object" && !Array.isArray(value));
  const read = (keys, fallback = 0) => {
    for (const candidate of candidates) {
      const value = courseOutlineFirstValue(candidate, keys);
      if (value !== undefined) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
    }
    return fallback;
  };
  return {
    pageNumber: read(["pageNumber", "page", "currentPage"], 1) || 1,
    pageSize: read(["pageSize", "limit", "size"], 0),
    totalSize: read(["totalSize", "total", "totalCount", "recordsTotal", "count"], collection?.rows?.length || 0)
  };
}

function normalizeCourseOutlineEndpointPayload(payload, endpoint = "") {
  const collection = courseOutlineCollection(payload);
  const records = collection.shape === "object"
    ? (collection.record && typeof collection.record === "object" && !Array.isArray(collection.record)
      ? [collection.record]
      : payload && typeof payload === "object" && !Array.isArray(payload) ? [payload] : [])
    : collection.rows.filter((item) => item !== undefined);
  const meta = courseOutlinePageMeta(payload, collection);
  return {
    endpoint: String(endpoint || ""),
    shape: collection.shape,
    containerPath: collection.path,
    records,
    totalSize: meta.totalSize,
    pageNumber: meta.pageNumber,
    pageSize: meta.pageSize
  };
}

function courseOutlineEndpointPath(endpoint) {
  const name = String(endpoint || "").trim();
  if (!name) return "";
  if (name === COURSE_OUTLINE_LIST_PATH || name === COURSE_OUTLINE_METADATA_PATH) return name;
  if (!COURSE_OUTLINE_DETAIL_ENDPOINTS.includes(name)) return "";
  return `modules/kcdgwhgl/${name}`;
}

function courseOutlineEndpointResult(endpoint, payload, options = {}) {
  const normalized = normalizeCourseOutlineEndpointPayload(payload, endpoint);
  const startedAt = options.startedAt || new Date().toISOString();
  const finishedAt = options.finishedAt || new Date().toISOString();
  return {
    endpoint: String(endpoint || ""),
    path: options.path || courseOutlineEndpointPath(endpoint),
    status: options.status || "success",
    httpStatus: Number(options.httpStatus) || 0,
    businessStatus: options.businessStatus ?? null,
    shape: normalized.shape,
    raw: Object.prototype.hasOwnProperty.call(options, "raw") ? options.raw : payload,
    records: normalized.records,
    totalSize: normalized.totalSize,
    pageNumber: normalized.pageNumber,
    pageSize: normalized.pageSize,
    error: String(options.error || ""),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
  };
}

function courseOutlineQuerySettings(filters = {}) {
  // 课程大纲页使用的是 EMAP 查询组件的标准字符串条件。旧实现把所有
  // 字段都发成 builder=like，教务系统会把它当成另一种查询表达式，结果
  // 可能退化成只有课程号的“未命名课程”。这里复现原系统实际请求：
  // caption/builderList/builder 三个字段必须同时存在，文本匹配使用 include。
  const fields = [
    ["KCH", "课程代码", filters.code],
    ["KCM", "课程名称", filters.name],
    ["KKDWDM", "开课单位", filters.unit],
    ["KCCCDM", "课程层次", filters.level],
    ["KCJBDM", "课程级别", filters.grade]
  ];
  return fields
    .map(([name, caption, value]) => ({
      name,
      caption,
      linkOpt: "AND",
      builderList: "cbl_String",
      builder: "include",
      value: String(value || "").trim()
    }))
    .filter((item) => item.value)
    .concat([{ name: "*order", value: "+KCH", linkOpt: "AND", builder: "equal" }]);
}

function courseOutlineListBody(filters = {}, pageNumber = 1, pageSize = 10) {
  const safePage = Math.max(1, Number(pageNumber) || 1);
  const safeSize = Math.max(1, Math.min(100, Number(pageSize) || 10));
  return {
    "*order": "+KCH",
    querySetting: JSON.stringify(courseOutlineQuerySettings(filters)),
    pageSize: safeSize,
    pageNumber: safePage
  };
}

function courseOutlineDetailBody(row = {}) {
  const body = {};
  ["KCH", "BBWID", "XNXQDM", "WID"].forEach((key) => {
    if (row[key] !== undefined && row[key] !== null && String(row[key]) !== "") body[key] = row[key];
  });
  if (!body.KCH) {
    const code = courseOutlineFirstValue(row, ["courseCode", "courseNo", "code"]);
    if (code !== undefined) body.KCH = code;
  }
  return body;
}

function courseOutlineKey(row = {}, fallbackIndex = 0) {
  const kch = String(courseOutlineFirstValue(row, ["KCH", "courseCode", "courseNo", "code"]) ?? "").trim();
  const bbwId = String(courseOutlineFirstValue(row, ["BBWID", "bbwid", "versionId"]) ?? "").trim();
  const termCode = String(courseOutlineFirstValue(row, ["XNXQDM", "termCode", "xnxqdm"]) ?? "").trim();
  const wid = String(courseOutlineFirstValue(row, ["WID", "wid", "id"]) ?? "").trim();
  if (kch && bbwId && termCode) return `${kch}|${bbwId}|${termCode}`;
  if (kch && wid) return `${kch}|${wid}`;
  return `${kch || "course"}|${wid || bbwId || termCode || fallbackIndex}`;
}

function courseOutlineListRows(payload) {
  return normalizeCourseOutlineEndpointPayload(payload, COURSE_OUTLINE_LIST_PATH).records;
}

function courseOutlineRequestIsCurrent(requestId, currentRequestId) {
  return Number(requestId) === Number(currentRequestId);
}

function courseOutlineExportDocument(detail = {}) {
  const endpoints = {};
  Object.entries(detail.endpoints || {}).forEach(([endpoint, result]) => {
    endpoints[endpoint] = result;
  });
  return {
    schema: "zhizhang-course-outline/v1",
    exportedAt: new Date().toISOString(),
    key: String(detail.key || ""),
    course: detail.row ?? null,
    endpoints
  };
}

function apiUrl(root, path) {
  return `${root}/${String(path).replace(/^\/+/, "")}`;
}

function courseOutlineCodePathFromMetadata(value) {
  const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const canonicalPath = (pathname) => {
    const match = String(pathname || "").match(new RegExp(`^/jwapp/code/(${uuidPattern})\\.do$`, "i"));
    return match ? `/jwapp/code/${match[1]}.do` : "";
  };
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("//")) return "";

  // Metadata commonly returns a relative path. Query parameters are ignored
  // after validating the pathname, and are rebuilt by the safe URL helper.
  if (/^\/?jwapp\/code\//i.test(raw)) {
    try { return canonicalPath(new URL(raw.replace(/^\/?/, "/"), "https://webvpn.neu.edu.cn/").pathname); } catch { return ""; }
  }

  // Absolute metadata links must stay on the WebVPN origin and under the
  // current application route. Never accept a look-alike hostname or an
  // arbitrary same-origin path.
  try {
    const target = new URL(raw);
    const portal = new URL(PORTAL_URL);
    if (target.protocol !== "https:" || target.origin !== portal.origin) return "";
    const portalPath = portal.pathname.replace(/\/+$/, "");
    const relativePath = target.pathname === "/jwapp/code/"
      ? target.pathname
      : target.pathname.startsWith(`${portalPath}/`) ? target.pathname.slice(portalPath.length) : target.pathname;
    return canonicalPath(relativePath);
  } catch {
    return "";
  }
}

function courseOutlineCodePathsFromMetadata(metadata) {
  const paths = [];
  const seenObjects = new Set();
  const seenPaths = new Set();
  const walk = (value, depth = 0) => {
    if (depth > 12 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const path = courseOutlineCodePathFromMetadata(value);
      if (path && !seenPaths.has(path)) {
        seenPaths.add(path);
        paths.push(path);
      }
      return;
    }
    if (typeof value !== "object" || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) value.forEach((child) => walk(child, depth + 1));
    else Object.values(value).forEach((child) => walk(child, depth + 1));
  };
  walk(metadata);
  return paths;
}

function appendCourseOutlineWebVpnMarker(url) {
  const target = new URL(url);
  if (!target.searchParams.has(COURSE_OUTLINE_WEBVPN_MARKER)) {
    // Keep the marker as a valueless query key, while preserving any existing
    // query such as json=1. This avoids producing the invalid json=1?vpn form.
    target.search = target.search
      ? `${target.search}&${COURSE_OUTLINE_WEBVPN_MARKER}`
      : `?${COURSE_OUTLINE_WEBVPN_MARKER}`;
  }
  return target.toString();
}

function courseOutlineApiUrl(path, query = {}) {
  const raw = String(path || "").trim();
  const codePath = courseOutlineCodePathFromMetadata(raw);
  const relativePath = codePath || courseOutlineEndpointPath(raw);
  if (!relativePath) throw new ApiError("课程大纲接口不在允许范围内");
  const base = codePath ? `${PORTAL_URL}${codePath}` : apiUrl(COURSE_OUTLINE_API_ROOT, relativePath);
  const target = new URL(base);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  });
  return appendCourseOutlineWebVpnMarker(target.toString());
}

function webVpnApiUrl(root, path) {
  return `${apiUrl(root, path)}?${WEBVPN_TARGET_MARKER}`;
}

function pyfaUrl(root, path) {
  return `${apiUrl(root, path)}?${PYFA_TARGET_MARKER}`;
}

function portalUrlVariants(url) {
  const marker = "/jwapp/";
  const suffixIndex = String(url).indexOf(marker);
  if (suffixIndex < 0) return [url];
  const suffix = String(url).slice(suffixIndex);
  return [...new Set([`${PORTAL_URL}${suffix}`, `${PORTAL_FALLBACK_URL}${suffix}`])];
}

function isAuthenticationUrl(url = "") {
  return /(?:\/tpass\/login|\/cas\/login|\/login(?:[/?#]|$)|统一身份认证)/i.test(String(url || ""));
}

function isAuthenticationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const codes = [payload.code, payload.status, payload.errCode, payload.errorCode]
    .map((value) => String(value ?? "").trim().toLowerCase());
  if (codes.some((value) => value === "401" || value === "403")) return true;
  if (payload.loginRequired === true || payload.authenticated === false || payload.loggedIn === false || payload.sessionValid === false) return true;
  const message = [payload.message, payload.msg, payload.errorMessage, payload.error, payload.statusText]
    .filter((value) => typeof value === "string")
    .join(" ");
  return /登录失效|请先登录|未登录|登录过期|会话(?:已)?(?:失效|过期)|统一身份认证|unauthori[sz]ed|forbidden|authentication required|session expired|login required/i.test(message);
}

function authenticationFailure(details = "", status = 0) {
  return new ApiError("教务系统登录已失效", details, status, { authFailure: true, retryable: false });
}

function isRetryableRequestError(error) {
  return Boolean(error?.retryable) && !error?.authFailure;
}

async function requestJsonOnce(url, options = {}) {
  const method = options.method || "GET";
  const query = options.query || {};
  const bodyData = options.body || null;
  const target = new URL(url);
  if (method === "GET") {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
    });
  }

  const headers = {
    Accept: "application/json, text/plain, */*",
    ...(options.headers || {})
  };
  if (options.includeFetchApi !== false) headers["Fetch-Api"] = "true";
  let body;
  if (method !== "GET" && bodyData) {
    const form = new URLSearchParams();
    Object.entries(bodyData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.set(key, String(value));
    });
    body = form;
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    for (const [requestId, pending] of nativeRequests.entries()) {
      if (pending.timer !== timeout) continue;
      nativeRequests.delete(requestId);
      pending.reject(new ApiError("教务接口请求超时", `超过 ${options.timeoutMs || API_REQUEST_TIMEOUT} 毫秒未返回`, 0, { retryable: true }));
    }
  }, options.timeoutMs || API_REQUEST_TIMEOUT);
  try {
    if (globalThis.AndroidApi?.request) {
      const requestId = `android-${Date.now()}-${++nativeRequestSequence}`;
      const nativeResult = await new Promise((resolve, reject) => {
        nativeRequests.set(requestId, { resolve, reject, timer: timeout });
        try {
          globalThis.AndroidApi.request(
            requestId,
            method,
            target.toString(),
            body ? body.toString() : "",
            JSON.stringify(headers)
          );
        } catch (error) {
          nativeRequests.delete(requestId);
          clearTimeout(timeout);
          reject(new ApiError("无法调用 Android 网络层", error?.message || "桥接调用失败"));
        }
      });
      response = {
        ok: nativeResult.status >= 200 && nativeResult.status < 300,
        status: nativeResult.status,
        url: target.toString(),
        redirected: false,
        text: async () => nativeResult.body
      };
    } else {
      response = await fetch(target.toString(), {
        method,
        headers,
        body,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") {
      throw new ApiError("教务接口请求超时", `超过 ${options.timeoutMs || API_REQUEST_TIMEOUT} 毫秒未返回`, 0, { retryable: true });
    }
    throw new ApiError("无法连接教务系统", error?.message || "网络请求被浏览器拦截", 0, { retryable: true });
  } finally {
    clearTimeout(timeout);
  }

  const responseStatus = Number(response.status) || 0;
  if (responseStatus === 401 || responseStatus === 403) {
    throw authenticationFailure(`HTTP ${responseStatus}`, responseStatus);
  }
  const raw = await response.text();
  const responseUrl = String(response.url || target.toString());
  const looksLikeHtml = /<\s*!doctype\s+html|<\s*html\b|<\s*(?:head|body|form)\b/i.test(raw)
    || /text\/html/i.test(String(response.headers?.get?.("content-type") || ""));
  if (isAuthenticationUrl(responseUrl) || (response.redirected && looksLikeHtml)) {
    throw authenticationFailure("认证页面重定向", responseStatus);
  }
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    if (looksLikeHtml || /登录|统一身份认证|login|cas/i.test(raw)) {
      throw authenticationFailure(`HTTP ${responseStatus}`, responseStatus);
    }
    throw new ApiError(
      "教务接口返回了无法识别的数据",
      `HTTP ${responseStatus}`,
      responseStatus,
      { retryable: false }
    );
  }

  if (isAuthenticationPayload(payload)) throw authenticationFailure("业务层返回登录失效", responseStatus);
  if (!response.ok) {
    throw new ApiError(
      `教务接口请求失败（${responseStatus}）`,
      `HTTP ${responseStatus}`,
      responseStatus,
      { retryable: responseStatus >= 500 && responseStatus <= 599 }
    );
  }
  return payload;
}

async function requestJson(url, options = {}) {
  let lastError;
  const targets = portalUrlVariants(url);
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    try {
      return await requestJsonOnce(target, options);
    } catch (error) {
      lastError = error;
      const canRetryVariant = options.variantRetryPolicy === "retryable-only"
        ? isRetryableRequestError(error)
        : true;
      if (index >= targets.length - 1 || !canRetryVariant) break;
    }
  }
  throw lastError || new ApiError("无法连接教务系统");
}

function courseOutlineHeaders(headers = {}) {
  return { ...headers, "X-Requested-With": "XMLHttpRequest" };
}

function getCourseOutline(path, query = {}, options = {}) {
  return requestJson(courseOutlineApiUrl(path, query), {
    ...options,
    variantRetryPolicy: "retryable-only",
    headers: courseOutlineHeaders(options.headers),
    includeFetchApi: false,
    timeoutMs: options.timeoutMs || COURSE_OUTLINE_REQUEST_TIMEOUT
  });
}

function postCourseOutline(path, body = {}, options = {}) {
  return requestJson(courseOutlineApiUrl(path), {
    ...options,
    variantRetryPolicy: "retryable-only",
    method: "POST",
    body,
    headers: courseOutlineHeaders(options.headers),
    includeFetchApi: false,
    timeoutMs: options.timeoutMs || COURSE_OUTLINE_REQUEST_TIMEOUT
  });
}

function getHome(path, query = {}) {
  return requestJson(apiUrl(HOME_API_ROOT, path), { query });
}

function postHome(path, body = {}) {
  return requestJson(apiUrl(HOME_API_ROOT, path), { method: "POST", body });
}

function getKb(path, query = {}, options = {}) {
  return requestJson(apiUrl(KB_API_ROOT, path), { query, ...options });
}

function postKb(path, body = {}, options = {}) {
  return requestJson(apiUrl(KB_API_ROOT, path), { method: "POST", body, ...options });
}

async function postNativeScheduleDetail(termCode) {
  const body = { XNXQDM: termCode, XQDM: "00" };
  let lastError = null;
  for (const root of [KB_API_ROOT, KB_CONTEXT_ROOT, KBBP_API_ROOT, KBBP_CONTEXT_ROOT]) {
    try {
      return await requestJson(webVpnApiUrl(root, "api/wdkbcx/getMyScheduleDetail.do"), {
        method: "POST",
        body,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new ApiError("个人课表网格接口请求失败");
}

async function postAllScheduleDetail(body) {
  let lastError = null;
  let emptyPayload = null;
  for (const root of [KB_API_ROOT, KB_CONTEXT_ROOT, KBBP_API_ROOT, KBBP_CONTEXT_ROOT]) {
    try {
      const payload = await requestJson(webVpnApiUrl(root, "api/qxkbcx/getScheduleDetail.do"), {
        method: "POST",
        body,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false,
        timeoutMs: ALL_SCHEDULE_REQUEST_TIMEOUT
      });
      if (extractCourseRows(payload).some(isCourseDetailRow)) return payload;
      if (!emptyPayload) emptyPayload = payload;
    } catch (error) {
      lastError = error;
    }
  }
  if (emptyPayload) return emptyPayload;
  throw lastError || new ApiError("全校课表详情接口请求失败");
}

async function postAllScheduleList(body) {
  let lastError = null;
  let emptyPayload = null;
  for (const root of [KB_API_ROOT, KB_CONTEXT_ROOT, KBBP_API_ROOT, KBBP_CONTEXT_ROOT]) {
    try {
      const payload = await requestJson(webVpnApiUrl(root, "modules/dzymmx/cxkblbms.do"), {
        method: "POST",
        body,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false,
        timeoutMs: ALL_SCHEDULE_REQUEST_TIMEOUT
      });
      const pagedRows = findPagedCourseCollection(payload)?.rows || [];
      if (pagedRows.length || extractCourseRows(payload).some(isCourseDetailRow)) return payload;
      if (!emptyPayload) emptyPayload = payload;
    } catch (error) {
      lastError = error;
    }
  }
  if (emptyPayload) return emptyPayload;
  throw lastError || new ApiError("全校课表课程列表接口请求失败");
}

async function postSportProjectList(body) {
  let lastError = null;
  let emptyPayload = null;
  for (const root of [KB_API_ROOT, KB_CONTEXT_ROOT, KBBP_API_ROOT, KBBP_CONTEXT_ROOT]) {
    try {
      const payload = await requestJson(webVpnApiUrl(root, "modules/qxkbcx/cxpxbxx.do"), {
        method: "POST",
        body,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false,
        timeoutMs: ALL_SCHEDULE_REQUEST_TIMEOUT
      });
      const rows = findPagedCourseCollection(payload)?.rows
        || rowsOf(payload).filter((row) => hasDisplayValue(row?.TYXMDM_DISPLAY) || hasDisplayValue(row?.JXBID));
      if (rows.length) return payload;
      if (!emptyPayload) emptyPayload = payload;
    } catch (error) {
      lastError = error;
    }
  }
  if (emptyPayload) return emptyPayload;
  throw lastError || new ApiError("体育课程项目列表接口请求失败");
}

function getKbContext(path, query = {}, options = {}) {
  return requestJson(apiUrl(KB_CONTEXT_ROOT, path), { query, ...options });
}

function postKbContext(path, body = {}, options = {}) {
  return requestJson(apiUrl(KB_CONTEXT_ROOT, path), { method: "POST", body, ...options });
}

function getJwPub(path, query = {}) {
  return requestJson(apiUrl(JWPUB_API_ROOT, path), { query });
}

function postJwPub(path, body = {}) {
  return requestJson(apiUrl(JWPUB_API_ROOT, path), { method: "POST", body });
}

function getScore(path, query = {}) {
  return requestJson(apiUrl(SCORE_API_ROOT, path), { query });
}

function postScore(path, body = {}) {
  return requestJson(apiUrl(SCORE_API_ROOT, path), { method: "POST", body });
}

function postScoreContext(path, body = {}) {
  return requestJson(apiUrl(SCORE_CONTEXT_ROOT, path), { method: "POST", body });
}

function termCodeFromName(name) {
  const match = String(name ?? "").match(/(\d{4})-(\d{4})学年(秋季|春季)学期/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3] === "秋季" ? "1" : "2"}`;
}

function mapTerm(raw) {
  const name = displayValue(valueOf(raw, ["itemName", "XNXQMC", "termName", "MC", "name", "text"]), "");
  const code = displayValue(valueOf(raw, ["itemCode", "XNXQDM", "termCode", "DM", "code", "value"]), termCodeFromName(name));
  return { code, name: name || code, raw };
}

function matchingTermCode(value, terms) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return terms.find((term) => term.code === text || term.name === text)?.code
    || terms.find((term) => termCodeFromName(text) === term.code)?.code
    || "";
}

function findExplicitTermCode(payload, terms, depth = 0) {
  if (depth > 6 || payload === null || payload === undefined) return "";
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findExplicitTermCode(item, terms, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload !== "object") return "";

  const directKeys = [
    "selectedXNXQCode", "selectedTermCode", "currentTermCode", "currentXNXQDM",
    "defaultTermCode", "defaultXNXQDM", "DQXNXQDM", "dqxnxqdm",
    "selectedXNXQ", "currentXNXQ", "currentTerm", "defaultTerm", "selectedTerm"
  ];
  for (const key of directKeys) {
    const found = matchingTermCode(payload[key], terms);
    if (found) return found;
  }

  const marker = valueOf(payload, ["isCurrent", "current", "selected", "SFDQ", "SFDQXNXQ", "DQXNXQ"], "");
  const markerCode = matchingTermCode(marker, terms);
  if (markerCode) return markerCode;
  if (marker !== "" && isTruthyFlag(marker)) {
    const rowCode = matchingTermCode(valueOf(payload, ["itemCode", "XNXQDM", "termCode", "DM", "code", "value"]), terms);
    if (rowCode) return rowCode;
  }

  for (const child of Object.values(payload)) {
    const found = findExplicitTermCode(child, terms, depth + 1);
    if (found) return found;
  }
  return "";
}

function findFirstExplicitTermCode(terms, payloads = []) {
  for (const payload of payloads) {
    const code = findExplicitTermCode(payload, terms);
    if (code) return code;
  }
  return "";
}

function officialCurrentTermCode(payload, terms) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const direct = matchingTermCode(valueOf(payload, [
      "selectedXNXQCode", "selectedTermCode", "currentTermCode", "currentXNXQDM",
      "defaultTermCode", "defaultXNXQDM", "DQXNXQDM", "dqxnxqdm",
      "XNXQDM", "xnxqdm", "termCode", "itemCode", "DM", "code",
      "selectedXNXQ", "currentXNXQ", "currentTerm", "defaultTerm", "selectedTerm"
    ], ""), terms);
    if (direct) return direct;
  }
  return findExplicitTermCode(payload, terms);
}

function termStartDate(code) {
  const match = String(code ?? "").match(/^(\d{4})-(\d{4})-([12])$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  return Number(match[3]) === 1 ? new Date(startYear, 8, 1) : new Date(startYear + 1, 1, 1);
}

function chooseCalendarTerm(terms) {
  const now = new Date();
  const available = terms
    .map((term) => ({ term, start: termStartDate(term.code) }))
    .filter((item) => item.start && item.start <= now)
    .sort((a, b) => b.start - a.start);
  return available[0]?.term || null;
}

function chooseCurrentTerm(terms, payloads = []) {
  const explicitCode = findFirstExplicitTermCode(terms, payloads);
  if (explicitCode) return terms.find((term) => term.code === explicitCode) || terms[0];
  return chooseCalendarTerm(terms) || terms[0];
}

function currentTermCandidates() {
  const byCode = new Map();
  const add = (term) => {
    const code = String(term?.code || "").trim();
    if (!code) return;
    const name = String(term?.name || code).trim() || code;
    if (!byCode.has(code) || byCode.get(code).name === code) byCode.set(code, { code, name });
  };
  [state.terms, state.allTerms, state.localSchedule?.termOptions].forEach((terms) => (terms || []).forEach(add));
  (state.localSchedule?.items || []).forEach((item) => add({ code: item?.termCode, name: item?.termName }));
  const configuredCode = state.currentTerm.mode === "manual"
    ? state.currentTerm.overrideCode
    : state.currentTerm.detectedCode;
  if (configuredCode) add({ code: configuredCode, name: configuredCode });
  return [...byCode.values()];
}

function configuredCurrentTermCode() {
  return String(state.currentTerm.mode === "manual"
    ? state.currentTerm.overrideCode
    : state.currentTerm.detectedCode || "").trim();
}

function currentTermCodeFor(terms = currentTermCandidates()) {
  const available = (terms || []).filter((term) => term?.code);
  const configured = configuredCurrentTermCode();
  return matchingTermCode(configured, available)
    || chooseCalendarTerm(available)?.code
    || available[0]?.code
    || configured
    || "";
}

function currentTermName(code = configuredCurrentTermCode()) {
  const value = String(code || "").trim();
  return currentTermCandidates().find((term) => term.code === value)?.name || value || "尚未检测";
}

function allQueryTermCode() {
  return state.allTermCode
    || currentTermCodeFor(state.allTerms.length ? state.allTerms : state.terms);
}

function saveCurrentTermPreference() {
  const persisted = persistCurrentTermPreference(state.currentTerm);
  Object.assign(state.currentTerm, persisted);
}

function recordDetectedCurrentTerm(code, source, syncedAt = new Date().toISOString()) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return false;
  state.currentTerm.detectedCode = normalizedCode;
  state.currentTerm.detectedSource = String(source || "教务系统").trim() || "教务系统";
  state.currentTerm.syncedAt = String(syncedAt || new Date().toISOString());
  state.detectedTermCode = normalizedCode;
  state.detectedTermSource = state.currentTerm.detectedSource;
  saveCurrentTermPreference();
  return true;
}

function applyCurrentTermDefaults() {
  if (!state.termSelectionTouched) {
    const personalCode = currentTermCodeFor(state.terms.length ? state.terms : currentTermCandidates());
    if (personalCode) state.termCode = personalCode;
  }
  if (!state.allTermSelectionTouched && state.allTerms.length) {
    const allCode = currentTermCodeFor(state.allTerms);
    if (allCode) state.allTermCode = allCode;
  }
  updatePersonalTermSelect();
}

async function loadOfficialCurrentTermPayload() {
  // 这是原系统课表模块使用的当前学期接口。不同登录会话可能只允许其中
  // 一个上下文；两种调用都失败时由调用方继续使用已经读取到的学期列表。
  const requests = [
    () => getKbContext("modules/qxkbcx/cxdqxnxq.do"),
    () => getKb("modules/qxkbcx/cxdqxnxq.do")
  ];
  for (const request of requests) {
    try {
      const payload = await request();
      if (payload !== null && payload !== undefined) return payload;
    } catch {
      // 当前学期探测失败不应阻断主学期列表和缓存数据。
    }
  }
  return null;
}

function findStudentId(payload, depth = 0) {
  if (depth > 8 || payload === null || payload === undefined) return "";
  const keyPattern = /^(?:xh|xsh|student(?:id|no|number|code)|student[_-](?:id|no|number|code)|学号|学籍号|yhm|userid|userno|loginid)$/i;
  const normalize = (value) => {
    const text = String(value ?? "").trim();
    return /^\d{6,12}$/.test(text) ? text : "";
  };
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findStudentId(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload !== "object") return "";
  for (const [key, value] of Object.entries(payload)) {
    if (keyPattern.test(String(key).replace(/[\s_]/g, ""))) {
      const direct = normalize(value);
      if (direct) return direct;
    }
  }
  for (const value of Object.values(payload)) {
    const found = findStudentId(value, depth + 1);
    if (found) return found;
  }
  return "";
}

async function loadTerms(options = {}) {
  state.personalCache.networkTermsAttempted = true;
  const payload = await getHome("kb/xnxq.do");
  let configPayload = null;
  let currentUserPayload = null;
  try {
    configPayload = await getHome("student/config.do");
  } catch {
    // 学生配置不是必需数据；学期接口或日历规则足以选择当前学期。
  }
  try {
    currentUserPayload = await getHome("currentUser.do");
  } catch {
    // 当前用户接口只用于读取学号，不影响其他成绩、考试和课表查询。
  }
  const listDetectedCode = findExplicitTermCode(payload, rowsOf(payload).map(mapTerm).filter((term) => term.code));
  const currentPayload = listDetectedCode ? null : await loadOfficialCurrentTermPayload();
  const terms = rowsOf(payload).map(mapTerm).filter((term) => term.code);
  if (!terms.length) throw new ApiError("没有读取到可查询的学期", "xnxq.do 返回为空");
  state.terms = terms;
  const discoveredStudentId = findStudentId(currentUserPayload) || findStudentId(configPayload) || findStudentId(payload);
  if (discoveredStudentId && state.personalCache.studentId && discoveredStudentId !== state.personalCache.studentId) {
    // Cookie 已切换账号时，不能把上一个账号的学期快照合并进新账号缓存。
    state.personalCache.available = false;
    state.personalCache.termSnapshots = {};
    state.personalCache.allScores = [];
    state.personalCache.scoreDetails = {};
    state.data = emptyPersonalData();
  }
  state.studentId = discoveredStudentId || state.studentId;
  const explicitCode = officialCurrentTermCode(currentPayload, terms)
    || findFirstExplicitTermCode(terms, [payload, configPayload, currentUserPayload]);
  const selected = terms.find((term) => term.code === explicitCode)
    || chooseCurrentTerm(terms, [payload, configPayload, currentUserPayload]);
  recordDetectedCurrentTerm(explicitCode || selected.code, explicitCode ? "教务系统" : "按日期兼容");
  if (options.useSchoolAsCurrent) {
    state.currentTerm.mode = "auto";
    state.currentTerm.overrideCode = "";
    saveCurrentTermPreference();
  }
  if (state.termCode && !terms.some((term) => term.code === state.termCode)) state.termSelectionTouched = false;
  applyCurrentTermDefaults();
}

function termRowsFromPayload(payload) {
  const rows = rowsOf(payload);
  if (rows.length) return rows.map(mapTerm).filter((term) => term.code);
  const single = mapTerm(payload || {});
  return single.code ? [single] : [];
}

async function loadAllTerms() {
  state.allTermsLoaded = true;
  state.allTermError = "";
  try {
    let listPayload;
    try {
      listPayload = await getJwPub("modules/zdgl/xnxqcx.do", { "*order": "+DM" });
    } catch {
      listPayload = await postJwPub("modules/zdgl/xnxqcx.do", { "*order": "+DM" });
    }
    let terms = termRowsFromPayload(listPayload);
    if (!terms.length) terms = state.terms.slice();

    // 全校课表只拥有独立的“查询学期”，它的初始值仍来自统一当前学期。
    // 自动模式下允许该模块补充教务当前学期检测；手动模式绝不覆盖用户设置。
    if (state.currentTerm.mode !== "manual") {
      const currentPayload = await loadOfficialCurrentTermPayload();
      const officialCode = officialCurrentTermCode(currentPayload, terms);
      if (officialCode) recordDetectedCurrentTerm(officialCode, "教务系统");
    }
    state.allTerms = terms;
    if (state.allTermCode && !terms.some((term) => term.code === state.allTermCode)) state.allTermSelectionTouched = false;
    if (!state.allTermSelectionTouched) state.allTermCode = currentTermCodeFor(terms);
  } catch (error) {
    state.allTermError = error.message || "课表学期列表读取失败";
    state.allTerms = state.terms.slice();
    if (state.allTermCode && !state.allTerms.some((term) => term.code === state.allTermCode)) state.allTermSelectionTouched = false;
    if (!state.allTermSelectionTouched) state.allTermCode = currentTermCodeFor(state.allTerms);
  }
  render();
}

/* --------------------------- 培养计划 ---------------------------
 * 培养方案页的树节点只展示课组标题，课程字段在课组课程维护接口里返回。
 * 这里把两个来源合并：树接口负责课组层级和学分要求，教学进程接口负责课程
 * 明细；接口字段存在多个版本，所以所有字段都通过别名读取，并保留原始对象。
 */
function pyfaPayloadRows(payload) {
  const rows = rowsOf(payload);
  if (rows.length) return rows;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const id = valueOf(payload, ["PYFADM", "PYFAID", "PYFACDM", "WID", "ID", "DM", "id"], "");
    const name = valueOf(payload, ["PYFAMC", "PYFAM", "FAMC", "MC", "name", "text"], "");
    if (id || name) return [payload];
  }
  return [];
}

function curriculumPlanId(raw) {
  return displayValue(valueOf(raw, ["PYFADM", "PYFAID", "PYFACDM", "WID", "ID", "DM", "CODE", "code", "id"]), "");
}

function normalizeCurriculumPlan(raw) {
  return {
    id: curriculumPlanId(raw),
    name: displayValue(valueOf(raw, ["PYFAMC", "PYFAM", "FAMC", "PYFANAME", "MC", "name", "text"]), "未命名培养方案"),
    grade: displayValue(valueOf(raw, ["NJMC", "NJM", "NJ", "grade", "XZNJ"]), ""),
    college: displayValue(valueOf(raw, ["YXMC", "YX", "college", "院系"]), ""),
    major: displayValue(valueOf(raw, ["ZYMC", "ZY", "major", "年度专业"]), ""),
    type: displayValue(valueOf(raw, ["PYFALXMC", "PYFALX", "type", "方案类型"]), ""),
    studyType: displayValue(valueOf(raw, ["XDLXMC", "XDLX", "修读类型", "studyType"]), ""),
    level: displayValue(valueOf(raw, ["PYCCMC", "PYCC", "培养层次", "level"]), ""),
    credit: displayValue(valueOf(raw, ["ZSXDXF", "ZXS", "MINXF", "ZXF", "leastCredit", "credit", "总学分"]), ""),
    raw
  };
}

function curriculumNodeName(raw) {
  return displayValue(valueOf(raw, ["KZMC", "KZMC_DISPLAY", "KZM", "KZH_DISPLAY", "GROUP_NAME", "NODE_NAME", "NODEMC", "MC", "name", "label", "text", "title"]), "");
}

function curriculumNodeId(raw) {
  return displayValue(valueOf(raw, ["KZDM", "KZID", "KZH", "GROUPID", "NODEID", "id", "ID", "WID", "DM"]), "");
}

function curriculumMinimumCredits(raw) {
  const direct = valueOf(raw, ["ZSXDXF", "MINXF", "ZXF", "YQXF", "leastCredit", "minCredit", "credit", "ZXS", "KCZXF"], "");
  if (direct !== "") return displayValue(direct, "");
  const text = [curriculumNodeName(raw), displayValue(valueOf(raw, ["remark", "BZ", "note", "备注"]), "")].join(" ");
  const match = text.match(/至少达到学分\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/);
  return match ? match[1] : "";
}

function curriculumSelectionRule(raw) {
  const direct = displayValue(valueOf(raw, ["XZTS", "SELECT_RULE", "RULE", "selectionRule", "选课规则"]), "");
  if (direct) return direct;
  const match = curriculumNodeName(raw).match(/(\d+\s*选\s*\d+)/);
  return match ? match[1].replace(/\s+/g, "") : "";
}

function curriculumChildValues(raw) {
  if (!raw || typeof raw !== "object") return [];
  const preferred = ["children", "child", "nodes", "subNodes", "subItems", "items", "list", "courseList", "kcList", "courses", "datas", "pyfakzcx", "pyfakzkccx", "rows", "data", "result", "content"];
  const values = [];
  for (const key of preferred) {
    const value = raw[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value && typeof value === "object") values.push(value);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (preferred.includes(key)) continue;
    if (Array.isArray(value)) values.push(...value);
    else if (value && typeof value === "object") values.push(value);
  }
  return values.filter((item) => item && typeof item === "object");
}

function isCurriculumCourseRow(raw) {
  if (!raw || typeof raw !== "object") return false;
  const code = valueOf(raw, ["KCH", "KCHM", "KCDM", "KCH_DISPLAY", "KCDM_DISPLAY", "courseCode", "courseNo", "COURSE_CODE", "COURSE_CODE_DISPLAY", "code"], "");
  const name = valueOf(raw, ["KCMC", "KCM", "KCMC_DISPLAY", "KCM_DISPLAY", "courseName", "course", "COURSE_NAME", "COURSE_NAME_DISPLAY"], "");
  const credit = valueOf(raw, ["XF", "XKXF", "KCBKXF", "COURSE_CREDIT", "COURSE_CREDIT_DISPLAY", "credit", "credits", "CREDIT", "学分"], "");
  const category = valueOf(raw, ["KCLBDM_DISPLAY", "KCLBMC", "KCLB", "KCLB_DISPLAY", "courseCategory", "category"], "");
  const nature = valueOf(raw, ["KCXZDM_DISPLAY", "KCXZMC", "KCXZ", "KCXZ_DISPLAY", "courseNature", "nature"], "");
  return Boolean(code && (name || credit)) || Boolean(name && credit && (category || nature));
}

function normalizeCurriculumCourse(raw, index = 0, group = null) {
  const source = raw || {};
  const assessment = normalizeCourseAssessment(valueOf(source, ["KSLXDM_DISPLAY", "KSLXMC", "KSLXDM", "KSLX", "KSFS_DISPLAY", "KSFSMC", "KSFS", "KHFSDM_DISPLAY", "KHFSMC", "KHFS", "KHLXMC", "KHLX", "assessmentType", "assessment", "examType", "exam"], ""))
    || normalizeCourseAssessment(courseAssessmentTextFromRaw(source))
    || curriculumLinkedAssessment(source);
  return {
    index,
    name: displayValue(valueOf(source, ["KCMC", "KCM", "KCMC_DISPLAY", "KCM_DISPLAY", "courseName", "course", "COURSE_NAME", "COURSE_NAME_DISPLAY", "MC", "name", "text"]), "未命名课程"),
    code: displayValue(valueOf(source, ["KCH", "KCHM", "KCDM", "KCH_DISPLAY", "KCDM_DISPLAY", "courseCode", "courseNo", "COURSE_CODE", "COURSE_CODE_DISPLAY", "code"]), ""),
    credit: displayValue(valueOf(source, ["XF", "XKXF", "KCBKXF", "COURSE_CREDIT", "COURSE_CREDIT_DISPLAY", "credit", "credits", "CREDIT", "学分"]), ""),
    category: displayValue(valueOf(source, ["KCLBDM_DISPLAY", "KCLBMC", "KCLB", "KCLB_DISPLAY", "courseCategory", "category"]), ""),
    nature: displayValue(valueOf(source, ["KCXZDM_DISPLAY", "KCXZMC", "KCXZ", "KCXZ_DISPLAY", "courseNature", "nature"]), ""),
    assessment,
    examType: assessment,
    semester: displayValue(valueOf(source, ["XNXQ_DISPLAY", "XNXQMC_DISPLAY", "XQMC", "XQ", "XNXQMC", "XNXQDM_DISPLAY", "semester", "term", "KCSM"]), ""),
    required: displayValue(valueOf(source, ["KCXZDM_DISPLAY", "XXKC", "XXKMC", "XXK", "XKXZMC", "XKXZ", "required", "courseRequirement", "type"]), ""),
    direction: displayValue(valueOf(source, ["ZYFXMC", "ZYFX", "direction", "majorDirection"]), ""),
    hours: displayValue(valueOf(source, ["XS", "ZXS", "hours", "学时"]), ""),
    groupId: displayValue(valueOf(source, ["KZDM", "KZID", "KZH", "GROUPID", "parentId", "parentNodeId", "PYFAKZDM"]), group?.id || ""),
    groupName: group?.name || displayValue(valueOf(source, ["KZMC", "KZM", "KZH_DISPLAY", "GROUP_NAME", "groupName"]), "未分组"),
    raw: source
  };
}

function curriculumCourseKey(course) {
  return `${course.code || "name"}:${course.name}:${course.credit}:${course.semester}`.replace(/\s+/g, "").toLowerCase();
}

function flattenCurriculumTree(payload) {
  const groups = [];
  const courses = [];
  const groupByKey = new Map();
  const visited = new WeakSet();
  const ensureGroup = (raw, path = [], fallback = "未分组") => {
    const id = curriculumNodeId(raw);
    const name = curriculumNodeName(raw) || fallback;
    const cleanName = name.replace(/\s*【[^】]*】/g, "").trim() || fallback;
    const key = id || `${path.join(" / ")}::${cleanName}`;
    if (groupByKey.has(key)) return groupByKey.get(key);
    const group = {
      id,
      name: cleanName,
      path: path.filter(Boolean).join(" / "),
      parentId: displayValue(valueOf(raw, ["FKZH", "parentId", "parentNodeId", "GGKZH"]), ""),
      minCredits: curriculumMinimumCredits(raw),
      totalCredits: displayValue(valueOf(raw, ["KCZXF", "totalCredit", "totalCredits", "courseCredit"]), ""),
      requiredCredits: displayValue(valueOf(raw, ["BXXF", "BXXXF", "BXXKXF", "requiredCredit", "requiredCredits"]), ""),
      electiveCredits: displayValue(valueOf(raw, ["XXXF", "XXXKXF", "XKXF", "electiveCredit", "electiveCredits"]), ""),
      category: displayValue(valueOf(raw, ["KCLBDM_DISPLAY", "KCLBMC", "KCLB", "category"]), ""),
      kind: displayValue(valueOf(raw, ["KZLXDM_DISPLAY", "KZLXDM", "kind"]), ""),
      rule: curriculumSelectionRule(raw),
      courses: [],
      raw
    };
    groupByKey.set(key, group);
    groups.push(group);
    return group;
  };
  const walk = (value, path = [], parentGroup = null, depth = 0) => {
    if (depth > 12 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, path, parentGroup, depth + 1));
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    const children = curriculumChildValues(value);
    const isCourse = isCurriculumCourseRow(value);
    let currentGroup = parentGroup;
    if (isCourse) {
      const course = normalizeCurriculumCourse(value, courses.length, currentGroup);
      courses.push(course);
      if (currentGroup) currentGroup.courses.push(course);
      return;
    }
    const nodeName = curriculumNodeName(value);
    const isGroup = Boolean(nodeName && (
      children.length
      || curriculumMinimumCredits(value)
      || curriculumSelectionRule(value)
      || value.KZLXDM_DISPLAY === "课组"
      || value.KZLXDM === "01"
    ));
    if (isGroup) {
      currentGroup = ensureGroup(value, path, "未命名课组");
      if (!currentGroup.path && path.length) currentGroup.path = path.join(" / ");
    }
    const nextPath = isGroup && nodeName ? [...path, nodeName.replace(/\s*【[^】]*】/g, "").trim()] : path;
    children.forEach((child) => walk(child, nextPath, currentGroup, depth + 1));
  };
  walk(payload);
  const groupMap = new Map(groups.filter((group) => group.id).map((group) => [group.id, group]));
  const pathFor = (group, seen = new Set()) => {
    if (!group.parentId || group.parentId === "-1" || seen.has(group.id)) return "";
    const parent = groupMap.get(group.parentId);
    if (!parent) return "";
    const next = new Set(seen);
    next.add(group.id);
    const parentPath = pathFor(parent, next);
    return [parentPath, parent.name].filter(Boolean).join(" / ");
  };
  groups.forEach((group) => {
    if (!group.path) group.path = pathFor(group);
  });
  return { groups, courses };
}

function curriculumRawCourseRows(payload) {
  const rows = pyfaPayloadRows(payload);
  return rows.filter(isCurriculumCourseRow);
}

async function postPyfa(path, body = {}, options = {}) {
  let lastError = null;
  const roots = [PYFA_API_ROOT, PYFA_CONTEXT_ROOT];
  for (const root of roots) {
    try {
      return await requestJson(pyfaUrl(root, path), {
        method: "POST",
        body,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false,
        timeoutMs: options.timeoutMs || 8000
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new ApiError("培养方案接口请求失败");
}

async function getPyfa(path, query = {}, options = {}) {
  let lastError = null;
  for (const root of [PYFA_API_ROOT, PYFA_CONTEXT_ROOT]) {
    try {
      return await requestJson(pyfaUrl(root, path), {
        query,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false,
        timeoutMs: options.timeoutMs || 8000
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new ApiError("培养方案接口请求失败");
}

async function tryPyfaCandidates(candidates, timeoutMs = 8000) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const payload = candidate.method === "GET"
        ? await getPyfa(candidate.path, candidate.body || {}, { timeoutMs })
        : await postPyfa(candidate.path, candidate.body || {}, { timeoutMs });
      if (candidate.accept ? candidate.accept(payload) : true) return { payload, candidate };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new ApiError("培养方案接口没有返回可识别数据");
}

function runtimeMessageWithTimeout(message, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new ApiError(timeoutMessage));
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (result) => {
        // 即使已经超时，也先读取 lastError，避免 Chrome 产生未处理的 runtime.lastError 警告。
        const runtimeError = chrome.runtime.lastError;
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (runtimeError) reject(new ApiError(runtimeError.message || "原系统页面读取失败"));
        else resolve(result);
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new ApiError(error?.message || "原系统页面读取失败"));
    }
  });
}

async function readCurriculumFromPortalTab(planId, planName = "", tabId = null) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new ApiError("当前环境不能调用原系统页面");
  const preferredTabId = tabId || state.curriculum.bootstrap.tabId || null;
  const response = await runtimeMessageWithTimeout(
    {
      type: "curriculum-portal-read",
      planId: String(planId || ""),
      planName: String(planName || ""),
      tabId: Number.isFinite(Number(preferredTabId)) && Number(preferredTabId) > 0 ? Number(preferredTabId) : null
    },
    15000,
    "原系统培养方案读取超时，请保持原系统培养方案详情页打开后重试"
  );
  if (!response?.ok) throw new ApiError(response?.error || "原系统页面没有返回培养方案数据");
  return response.data;
}

async function readCurriculumPlansFromPortalTab(tabId = null) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new ApiError("当前环境不能调用原系统页面");
  const preferredTabId = tabId || state.curriculum.bootstrap.tabId || null;
  const response = await runtimeMessageWithTimeout(
    {
      type: "curriculum-plans-portal-read",
      tabId: Number.isFinite(Number(preferredTabId)) && Number(preferredTabId) > 0 ? Number(preferredTabId) : null
    },
    30000,
    "原系统培养方案列表读取超时，请保持原系统培养方案详情页打开后重试"
  );
  if (!response?.ok) throw new ApiError(response?.error || "原系统页面没有返回培养方案列表");
  return response.data;
}

const CURRICULUM_BOOTSTRAP_ACTIVE_STATUSES = new Set(["preparing", "checking", "opening", "reading", "organizing"]);

function curriculumBootstrapIsActive() {
  return Boolean(state.curriculum.bootstrap?.reading)
    || CURRICULUM_BOOTSTRAP_ACTIVE_STATUSES.has(state.curriculum.bootstrap?.status);
}

function setCurriculumBootstrapState(status, message = "", error = "", tabId = null, shouldRender = true) {
  const previous = state.curriculum.bootstrap || {};
  const reading = ["reading", "organizing"].includes(status)
    ? true
    : ["preparing", "checking", "opening", "login-required", "failed", "done", "idle"].includes(status)
      ? false
      : Boolean(previous.reading);
  state.curriculum.bootstrap = {
    ...previous,
    status,
    message,
    error,
    tabId: tabId || previous.tabId || null,
    reading
  };
  if (error) state.curriculum.error = error;
  if (shouldRender) render();
}

async function runCurriculumBootstrapRead(tabId = null) {
  if (IS_ANDROID_APP) return loadCurriculumPlans();
  if (state.curriculum.bootstrap.reading) return;
  const preferredTabId = tabId || state.curriculum.bootstrap.tabId || null;
  invalidateCurriculum();
  state.curriculum.bootstrap = {
    ...state.curriculum.bootstrap,
    status: "reading",
    message: "正在读取培养计划…",
    error: "",
    tabId: preferredTabId,
    reading: true
  };
  state.curriculum.error = "";
  render();
  try {
    await loadCurriculumPlans();
    if (state.curriculum.plans.length && (state.curriculum.groups.length || state.curriculum.courses.length)) {
      setCurriculumBootstrapState("done", "读取完成", "", preferredTabId, false);
      setNotice("读取完成，培养计划已更新。", "success");
      render();
      return true;
    }
    const error = state.curriculum.error || "原系统暂未返回培养方案课程明细";
    setCurriculumBootstrapState("failed", "自动读取培养计划失败", error, preferredTabId);
    return false;
  } catch (error) {
    setCurriculumBootstrapState("failed", "自动读取培养计划失败", error?.message || "原系统页面暂时不可用", preferredTabId);
    return false;
  }
}

async function startCurriculumBootstrap() {
  if (IS_ANDROID_APP) return loadCurriculumPlans();
  if (curriculumBootstrapIsActive()) return;
  invalidateCurriculum();
  state.curriculum.bootstrap = {
    status: "preparing",
    message: "正在准备培养计划…",
    error: "",
    tabId: null,
    reading: false
  };
  state.curriculum.error = "";
  render();
  try {
    const result = await runtimeMessageWithTimeout(
      { type: "curriculum-bootstrap" },
      35000,
      "自动打开培养计划超时，请重试或手动进入培养 → 培养方案"
    );
    const tabId = result?.tabId || null;
    if (result?.status === "login-required") {
      setCurriculumBootstrapState("login-required", result.message || "请完成教务系统登录，登录成功后会自动继续读取培养计划。", "", tabId);
      return;
    }
    if (!result?.ok || result?.status === "failed") {
      setCurriculumBootstrapState("failed", "自动进入培养方案失败", result?.error || "请重试，或在原系统进入“培养 → 培养方案”后重试。", tabId);
      return;
    }
    setCurriculumBootstrapState("opening", "正在进入培养方案…", "", tabId);
    await runCurriculumBootstrapRead(tabId);
  } catch (error) {
    setCurriculumBootstrapState("failed", "自动打开培养计划失败", error?.message || "请重试，或手动进入“培养 → 培养方案”。");
  }
}

function handleCurriculumBootstrapStatus(message = {}) {
  if (!message?.status) return;
  const currentTabId = state.curriculum.bootstrap?.tabId;
  if (currentTabId && message.tabId && Number(currentTabId) !== Number(message.tabId)) return;
  const tabId = message.tabId || currentTabId || null;
  if (message.status === "ready") {
    if (state.curriculum.bootstrap.reading) return;
    state.curriculum.bootstrap = {
      ...state.curriculum.bootstrap,
      status: "reading",
      message: "正在读取培养计划…",
      error: "",
      tabId,
      reading: false
    };
    render();
    runCurriculumBootstrapRead(tabId).catch(() => undefined);
    return;
  }
  if (message.status === "failed") {
    setCurriculumBootstrapState("failed", message.message || "自动进入培养方案失败", message.error || "请重试，或手动进入“培养 → 培养方案”。", tabId);
    return;
  }
  if (message.status === "login-required") {
    setCurriculumBootstrapState("login-required", message.message || "请完成教务系统登录，登录成功后会自动继续读取培养计划。", "", tabId);
    return;
  }
  const stage = message.status === "checking" ? "checking" : message.status === "opening" ? "opening" : "preparing";
  const fallback = stage === "checking" ? "正在检查教务系统登录状态…" : stage === "opening" ? "正在进入培养方案…" : "正在准备培养计划…";
  setCurriculumBootstrapState(stage, message.message || fallback, "", tabId);
}

if (globalThis.chrome?.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "curriculum-bootstrap-status") handleCurriculumBootstrapStatus(message);
  });
}

function mergeCurriculumPlans(...sources) {
  const merged = [];
  const byId = new Map();
  const byName = new Map();
  sources.flat().forEach((candidate) => {
    if (!candidate) return;
    const plan = candidate.id !== undefined && candidate.name !== undefined
      ? candidate
      : normalizeCurriculumPlan(candidate);
    if (!plan.id && plan.name === "未命名培养方案") return;
    const existing = (plan.id && byId.get(plan.id)) || byName.get(plan.name);
    if (existing) {
      // 当前页面提取出的名称、年级和最低学分优先于列表接口的空字段，
      // 其他字段再用列表接口补全；始终保留同一账号的原始行。
      const previousId = existing.id;
      const previousName = existing.name;
      Object.assign(existing, Object.fromEntries(Object.entries(plan).filter(([key, value]) => (
        value !== "" && value !== "—" && value !== undefined && value !== null
          && !(key === "name" && value === "未命名培养方案" && existing.name && existing.name !== "未命名培养方案")
      ))));
      if (plan.raw) existing.raw = { ...(existing.raw || {}), ...plan.raw };
      // 合并过程中 fallback 的 portal-name:* 可能会被真实 PYFADM 替换。
      // 同步更新索引，否则后续同 ID、名称略有差异的记录会被错误追加成重复方案。
      if (previousId && previousId !== existing.id && byId.get(previousId) === existing) byId.delete(previousId);
      if (previousName && previousName !== existing.name && byName.get(previousName) === existing) byName.delete(previousName);
      if (existing.id) byId.set(existing.id, existing);
      if (existing.name) byName.set(existing.name, existing);
      return;
    }
    const copy = { ...plan };
    merged.push(copy);
    if (copy.id) byId.set(copy.id, copy);
    if (copy.name) byName.set(copy.name, copy);
  });
  return merged;
}

function currentPortalPlanInfo(data) {
  const current = data?.currentPlan || {};
  if (!current.id && !current.name) return null;
  return normalizeCurriculumPlan({
    PYFADM: current.id,
    PYFAMC: current.name,
    NJMC: current.grade,
    ZSXDXF: current.credit,
    ...current
  });
}

function invalidateCurriculum() {
  curriculumListRequestSequence += 1;
  curriculumPlanRequestSequence += 1;
  state.curriculum.loaded = false;
  state.curriculum.loading = false;
  state.curriculum.error = "";
  state.curriculum.plans = [];
  state.curriculum.selectedPlanId = "";
  state.curriculum.selectedPlan = null;
  state.curriculum.groups = [];
  state.curriculum.courses = [];
  state.curriculum.source = "";
  state.curriculum.courseDetail = null;
}

function portalVisiblePlanRows(data) {
  return Array.isArray(data?.visibleRows)
    ? data.visibleRows.filter((row) => /20\d{2}\s+\S+.*20\d{2}级/.test(String(row)))
    : [];
}

function planMatchesVisiblePortalRow(plan, rows) {
  const name = String(plan?.name || "").trim();
  return Boolean(name && rows.some((row) => String(row).includes(name)));
}

async function loadCurriculumPlans() {
  if (state.curriculum.loading) return;
  const requestId = ++curriculumListRequestSequence;
  state.curriculum.loading = true;
  state.curriculum.error = "";
  render();
  const candidates = [
    { path: "pyfaglepg/pyfacx.do", body: { pageSize: 100, pageNumber: 1, needCount: true } },
    { path: "modules/pyfaglepg/pyfacx.do", body: { pageSize: 100, pageNumber: 1, needCount: true } },
    { path: "modules/pyfaglepg.do", body: { pageSize: 100, pageNumber: 1, needCount: true } }
  ];
  let portalData = null;
  let portalError = null;
  let listResult = null;
  let listError = null;
  try {
    portalData = await readCurriculumPlansFromPortalTab();
  } catch (error) {
    portalError = error;
  }
  // 浏览器扩展必须以原系统页面的 MAIN 世界为唯一方案来源。
  // Android 没有 chrome.tabs，只能在同一 WebView Cookie 下走接口作为兜底；
  // 这条分支不会影响浏览器，也不会让浏览器再产生一串 403 试探请求。
  if (!globalThis.chrome?.runtime?.sendMessage) {
    try {
      listResult = await tryPyfaCandidates(candidates, 7000);
    } catch (error) {
      listError = error;
    }
  }

  if (requestId !== curriculumListRequestSequence) return;

  const currentPlan = currentPortalPlanInfo(portalData);
  const pagePlans = Array.isArray(portalData?.visiblePlans)
    ? portalData.visiblePlans.map(normalizeCurriculumPlan).filter((plan) => plan.id && plan.name)
    : [];
  const portalPlans = portalData?.payload ? pyfaPayloadRows(portalData.payload).map(normalizeCurriculumPlan) : [];
  const directPlans = listResult ? pyfaPayloadRows(listResult.payload).map(normalizeCurriculumPlan) : [];
  const visiblePlanRows = portalVisiblePlanRows(portalData);
  // 原系统当前页面是账号边界：列表页只采用页面实际列出的方案，详情页只采用当前方案。
  // 接口返回的方案只允许按名称/ID给这些页面方案补字段，绝不能成为新的候选方案；
  // 这样切换学院或账号时，不会把 WebVPN 旧会话、共享接口缓存中的方案混进来。
  // 原系统页面内执行的列表接口同样带着当前账号的 WebVPN 会话。
  // 如果用户停在某个方案详情页，DOM 没有方案列表，此时可以使用同一页面
  // 上下文返回的方案列表作为边界；绝不再把 extension:// 页面直连接口的
  // 结果当成候选方案，避免换账号后出现旧账号/共享缓存方案。
  const portalBoundary = pagePlans.length
    ? pagePlans
    : portalPlans.length
    ? portalPlans
    : currentPlan?.name
    ? [currentPlan]
    : [];
  const matchesBoundary = (candidate) => portalBoundary.some((boundary) => (
    (candidate?.id && boundary.id && candidate.id === boundary.id)
      || (candidate?.name && boundary.name && candidate.name === boundary.name)
      || (candidate?.name && boundary.name && (candidate.name.includes(boundary.name) || boundary.name.includes(candidate.name)))
  ));
  // directPlans 仅用于诊断，不参与方案候选或字段合并；它可能受到 WebVPN
  // 路径、缓存或旧标签页影响，不能证明属于当前登录账号。
  const scopedSources = [currentPlan, ...portalPlans].filter((candidate) => candidate && matchesBoundary(candidate));
  const plans = portalBoundary.length ? mergeCurriculumPlans(portalBoundary, ...scopedSources) : [];
  if (!plans.length) {
    state.curriculum.plans = [];
    state.curriculum.selectedPlanId = "";
    state.curriculum.selectedPlan = null;
    state.curriculum.groups = [];
    state.curriculum.courses = [];
    state.curriculum.source = "";
    state.curriculum.loaded = true;
    state.curriculum.loading = false;
    state.curriculum.error = visiblePlanRows.length || pagePlans.length
      ? "已检测到当前账号的原系统方案列表，但方案字段尚未完成同步，请保持原系统方案列表页打开后点击“刷新方案”"
      : portalError?.message || listError?.message || "没有检测到当前账号的培养方案列表，请先打开原系统的培养方案管理页面后点击“刷新方案”";
    render();
    return;
  }

  if (requestId !== curriculumListRequestSequence) return;
  state.curriculum.plans = plans;
  const currentMatch = currentPlan && (
    plans.find((plan) => currentPlan.id && plan.id === currentPlan.id)
      || plans.find((plan) => currentPlan.name && plan.name === currentPlan.name)
  );
  state.curriculum.selectedPlanId = currentMatch?.id
    || plans.find((plan) => plan.id === state.curriculum.selectedPlanId)?.id
    || plans[0].id;
  state.curriculum.source = pagePlans.length || portalPlans.length > 1
    ? "当前账号原系统方案列表"
    : "当前账号原系统方案详情";
  state.curriculum.loaded = true;
  if (state.curriculum.bootstrap.reading) {
    state.curriculum.bootstrap.status = "organizing";
    state.curriculum.bootstrap.message = "正在整理课程与学分要求…";
    render();
  }
  const planLoaded = await loadCurriculumPlan(state.curriculum.selectedPlanId, false);
  if (!planLoaded || requestId !== curriculumListRequestSequence) return;
  if (!state.curriculum.groups.length && !state.curriculum.courses.length && (portalError || listError)) {
    state.curriculum.error = portalError?.message || listError?.message || "培养方案读取失败";
    render();
  }
}

async function loadCurriculumPlan(planId, showLoading = true) {
  const requestId = ++curriculumPlanRequestSequence;
  let plan = state.curriculum.plans.find((item) => item.id === String(planId)) || state.curriculum.plans[0];
  if (!plan) return false;
  const directPlanApiAllowed = Boolean(plan.id) && !String(plan.id).startsWith("portal-name:");
  state.curriculum.selectedPlanId = plan.id;
  state.curriculum.selectedPlan = plan;
  state.curriculum.loading = true;
  state.curriculum.error = "";
  if (showLoading) render();
  const treeCandidates = [
    { method: "GET", path: "pyfaglepg/pyfacx.do", body: { PYFADM: plan.id }, accept: (payload) => Boolean(pyfaPayloadRows(payload).length || curriculumChildValues(payload).length) },
    { method: "GET", path: "modules/pyfaglepg/pyfacx.do", body: { PYFADM: plan.id }, accept: (payload) => Boolean(pyfaPayloadRows(payload).length || curriculumChildValues(payload).length) },
    { method: "POST", path: "pyfaglepg/pyfacx.do", body: { PYFADM: plan.id }, accept: (payload) => Boolean(pyfaPayloadRows(payload).length || curriculumChildValues(payload).length) },
    { method: "POST", path: "modules/pyfaglepg/pyfacx.do", body: { PYFADM: plan.id }, accept: (payload) => Boolean(pyfaPayloadRows(payload).length || curriculumChildValues(payload).length) },
    { method: "GET", path: "pyfaglepg/pyfacxcd.do", body: { PYFADM: plan.id }, accept: (payload) => Boolean(pyfaPayloadRows(payload).length || curriculumChildValues(payload).length) }
  ];
  let treeResult = null;
  let courseRows = [];
  let courseSource = "";
  let lastError = null;
  let portalResult = null;
  let portalDataReady = false;
  const consumePortalCurriculum = (result) => {
    const actualPlanId = String(result?.planId || "");
    if (actualPlanId && actualPlanId !== String(plan.id)) {
      const portalCurrent = result.currentPlan || {};
      const actualPlanName = portalCurrent.name || plan.name || `培养方案 ${actualPlanId}`;
      let actualPlan = state.curriculum.plans.find((item) => item.id === actualPlanId)
        || state.curriculum.plans.find((item) => item.name === actualPlanName);
      if (!actualPlan) {
        actualPlan = normalizeCurriculumPlan({
          PYFADM: actualPlanId,
          PYFAMC: actualPlanName,
          NJMC: portalCurrent.grade || "",
          ZSXDXF: portalCurrent.credit || "",
          ...portalCurrent
        });
        state.curriculum.plans.push(actualPlan);
      } else {
        actualPlan.id = actualPlanId;
        Object.assign(actualPlan, Object.fromEntries(Object.entries(normalizeCurriculumPlan({
          PYFADM: actualPlanId,
          PYFAMC: actualPlanName,
          NJMC: portalCurrent.grade || actualPlan.grade,
          ZSXDXF: portalCurrent.credit || actualPlan.credit,
          ...portalCurrent
        })).filter(([, value]) => value !== "" && value !== "—")));
      }
      // 如果请求的方案 ID 已经失效，原系统会回到当前登录账号的方案。
      // 以实际返回的 ID 为准，避免把 A 账号的课程套到 B 账号的方案名称上。
      plan = actualPlan;
      state.curriculum.selectedPlanId = actualPlan.id;
      state.curriculum.selectedPlan = actualPlan;
    }
    const portalTree = result?.payloads?.find((item) => item.kind === "tree" && item.payload)?.payload;
    const portalCourses = result?.payloads?.find((item) => item.kind === "courses" && item.payload)?.payload;
    const portalTreeRows = portalTree ? pyfaPayloadRows(portalTree) : [];
    if (portalTree && (portalTreeRows.length || flattenCurriculumTree(portalTree).groups.length)) {
      treeResult = { payload: portalTree, candidate: { path: "原系统页面·培养方案树" } };
      portalDataReady = true;
    }
    if (portalCourses) {
      const portalRows = curriculumRawCourseRows(portalCourses);
      if (portalRows.length) {
        courseRows = portalRows;
        courseSource = "原系统页面·课程维护";
        portalDataReady = true;
      }
    }
    const failedPortal = result?.payloads?.find((item) => item.error);
    if (!treeResult && failedPortal) lastError = new ApiError(failedPortal.error);
  };
  // 原系统页面已经带着 WebVPN 会话，优先在它的 MAIN 世界中读取，避免先让
  // extension:// 页面连续试探多个会被 WebVPN 拒绝的 403 接口。
  if (globalThis.chrome?.runtime?.sendMessage) {
    try {
      portalResult = await readCurriculumFromPortalTab(plan.id, plan.name);
      if (requestId !== curriculumPlanRequestSequence) return false;
      consumePortalCurriculum(portalResult);
    } catch (error) {
      lastError = error;
    }
  }
  if (!treeResult && directPlanApiAllowed) {
    try {
      treeResult = await tryPyfaCandidates(treeCandidates, 7000);
      if (requestId !== curriculumPlanRequestSequence) return false;
    } catch (error) {
      lastError = lastError || error;
    }
  }
  let tree = treeResult ? flattenCurriculumTree(treeResult.payload) : { groups: [], courses: [] };
  const courseCandidates = [
    { path: "api/jxjcwh/getValidProcessApplication.do", body: { PYFADM: plan.id, XNXQDM1: plan.id, XNXQDM: plan.id, pageSize: 1000, pageNumber: 1, needCount: true }, accept: (payload) => curriculumRawCourseRows(payload).length > 0 },
    { path: "api/jxjcwh/getValidProcessApplication.do", body: { PYFAID: plan.id, pageSize: 1000, pageNumber: 1, needCount: true }, accept: (payload) => curriculumRawCourseRows(payload).length > 0 },
    { path: "modules/dzepg/cxjxjclbfh.do", body: { PYFADM: plan.id, pageSize: 1000, pageNumber: 1, needCount: true }, accept: (payload) => curriculumRawCourseRows(payload).length > 0 }
  ];
  if (!courseRows.length && directPlanApiAllowed) {
    try {
      const courseResult = await tryPyfaCandidates(courseCandidates, 7000);
      if (requestId !== curriculumPlanRequestSequence) return false;
      courseRows = curriculumRawCourseRows(courseResult.payload);
      courseSource = courseResult.candidate.path;
    } catch (error) {
      lastError = lastError || error;
    }
  }
  // 直接从 extension:// 页面请求时，WebVPN 可能拒绝培养方案专用标记。
  // 回退到已打开的原系统标签页，在原页面上下文中用其 jwAjax 读取一次。
  if ((!portalDataReady || !treeResult || !courseRows.length) && globalThis.chrome?.runtime?.sendMessage) {
    try {
      portalResult = await readCurriculumFromPortalTab(plan.id, plan.name);
      if (requestId !== curriculumPlanRequestSequence) return false;
      consumePortalCurriculum(portalResult);
      tree = treeResult ? flattenCurriculumTree(treeResult.payload) : tree;
    } catch (error) {
      lastError = lastError || error;
    }
  }
  if (requestId !== curriculumPlanRequestSequence) return false;
  const treeCourses = tree.courses;
  const allRawCourses = courseRows.length ? courseRows : treeCourses.map((course) => course.raw);
  const deduped = [];
  const seen = new Set();
  allRawCourses.forEach((raw, index) => {
    const course = raw?.raw && raw.name ? raw : normalizeCurriculumCourse(raw, index);
    const key = curriculumCourseKey(course);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(course);
    }
  });
  if (!deduped.length && !tree.groups.length) {
    state.curriculum.error = findPayloadMessage(treeResult?.payload) || lastError?.message || "原系统返回了方案，但没有读取到课组或课程明细";
  }
  const groups = tree.groups.length ? tree.groups : [{ id: "ungrouped", name: "全部课程", path: "", minCredits: plan.credit, rule: "", courses: [], raw: {} }];
  const byGroup = new Map(groups.map((group) => [group.id || group.name, group]));
  deduped.forEach((course) => {
    let group = byGroup.get(course.groupId) || groups.find((item) => item.name === course.groupName);
    if (!group) group = groups.find((item) => /专业|通识|必修|选修/.test(item.name)) || groups[groups.length - 1];
    if (!course.category && group?.category) course.category = group.category;
    if (!course.required && group && /必修|选修/.test(group.name)) course.required = group.name;
    if (!group.courses.some((item) => curriculumCourseKey(item) === curriculumCourseKey(course))) group.courses.push(course);
  });
  groups.sort((left, right) => {
    const leftKey = [left.path || "", left.name || ""].join(" / ");
    const rightKey = [right.path || "", right.name || ""].join(" / ");
    return leftKey.localeCompare(rightKey, "zh-CN");
  });
  state.curriculum.groups = groups.filter((group) => group.courses.length || group.minCredits || group.name === "全部课程");
  state.curriculum.courses = deduped;
  state.curriculum.source = [treeResult?.candidate?.path, courseSource].filter(Boolean).join(" + ") || state.curriculum.source;
  state.curriculum.loading = false;
  state.curriculum.loaded = true;
  if (!deduped.length && !groups.some((group) => group.courses.length)) {
    const readableError = [findPayloadMessage(treeResult?.payload), lastError?.message]
      .map((value) => String(value || "").trim())
      .find((value) => value && !/^(0|null|undefined|true|false)$/i.test(value));
    state.curriculum.error = readableError || "原系统暂未返回课程明细，请保持培养方案详情页打开后点击“刷新方案”重试";
  }
  render();
  return true;
}

function curriculumFilteredGroups() {
  const query = state.curriculum.filter.trim().toLowerCase();
  const mode = state.curriculum.mode;
  const semester = state.curriculum.semester;
  const pendingOnly = Boolean(state.curriculum.pendingOnly);
  const plan = state.curriculum.selectedPlan || {};
  const filtered = state.curriculum.groups.map((group) => ({
    ...group,
    courses: group.courses.filter((course) => {
      const modeMatch = mode === "all" || /必修/.test(course.required || course.nature) === (mode === "required");
      const semesterLabel = curriculumSemesterLabel(course.semester, plan);
      const semesterMatch = semester === "all" || semesterLabel === semester;
      const categoryScore = course.raw?.__curriculumCategoryFallbackScore;
      const completion = categoryScore ? { earned: true } : curriculumCourseCompletion(course);
      const pendingMatch = !pendingOnly || !completion.earned;
      const text = [course.name, course.code, course.category, course.nature, course.assessment, course.semester, semesterLabel, course.required, group.name].join(" ").toLowerCase();
      return modeMatch && semesterMatch && pendingMatch && (!query || text.includes(query));
    })
  }));
  const hasCourseFilter = Boolean(query) || mode !== "all" || semester !== "all" || pendingOnly;
  if (!hasCourseFilter) {
    return filtered.filter((group) => group.courses.length || ([group.minCredits, group.totalCredits, group.requiredCredits, group.electiveCredits, group.category, group.kind].some(Boolean) || group.name === "全部课程"));
  }
  // 筛选命中子课组时，把所有祖先也保留在树中，避免结果失去上下文。
  const byId = new Map(filtered.map((group) => [group.id || `${group.path}/${group.name}`, group]));
  const kept = new Set(filtered.filter((group) => group.courses.length).map((group) => group.id || `${group.path}/${group.name}`));
  [...kept].forEach((id) => {
    let group = byId.get(id);
    const seen = new Set();
    while (group?.parentId && byId.has(group.parentId) && !seen.has(group.parentId)) {
      seen.add(group.parentId);
      kept.add(group.parentId);
      group = byId.get(group.parentId);
    }
  });
  return filtered.filter((group) => kept.has(group.id || `${group.path}/${group.name}`));
}

function curriculumSemesterOptions(plan) {
  const values = new Set();
  state.curriculum.courses.forEach((course) => {
    const label = curriculumSemesterLabel(course.semester, plan);
    if (label) values.add(label);
  });
  const order = (value) => {
    const match = value.match(/^大([一二三四五六七八九十]+)(上|下)$/);
    if (!match) return 999;
    const levels = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    return (levels[match[1]] || 99) * 2 + (match[2] === "下" ? 1 : 0);
  };
  return [...values].sort((left, right) => order(left) - order(right) || left.localeCompare(right, "zh-CN"));
}

function curriculumGroupIdentity(group = {}) {
  return group.id || `${group.path || ""}/${group.name || "未命名课组"}`;
}

function curriculumProgressMap(groups = state.curriculum.groups) {
  const list = Array.isArray(groups) ? groups : [];
  const categoryFallbackMap = curriculumCategoryFallbackRecords(list, state.curriculum.courses || []);
  const aliases = new Map();
  list.forEach((group) => {
    aliases.set(curriculumGroupIdentity(group), group);
    if (group.id) aliases.set(String(group.id), group);
  });
  const childrenMap = new Map();
  list.forEach((group) => {
    const key = curriculumGroupIdentity(group);
    const parent = group.parentId ? aliases.get(String(group.parentId)) : null;
    const parentKey = parent ? curriculumGroupIdentity(parent) : "__root__";
    if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
    childrenMap.get(parentKey).push(group);
  });

  const memo = new Map();
  const build = (group, stack = new Set()) => {
    const key = curriculumGroupIdentity(group);
    if (memo.has(key)) return memo.get(key);
    if (stack.has(key)) return { courseCount: 0, earnedCourseCount: 0, earnedCredits: 0, targetCredits: null, remainingCredits: null, targetRequiredCredits: null, targetElectiveCredits: null, remainingRequiredCredits: null, remainingElectiveCredits: null, earnedRequiredCredits: 0, earnedElectiveCredits: 0, categoryFallbackCount: 0, categoryFallbackCredits: 0, directCategoryFallbackRecords: [], records: [] };
    const nextStack = new Set(stack);
    nextStack.add(key);
    const courseMap = new Map();
    (group.courses || []).forEach((course) => courseMap.set(curriculumCourseKey(course), { course }));
    (childrenMap.get(key) || []).forEach((child) => {
      const childProgress = build(child, nextStack);
      (childProgress.records || []).forEach((record) => courseMap.set(curriculumCourseKey(record.course), record));
    });
    const directCategoryFallbackRecords = categoryFallbackMap.get(key) || [];
    directCategoryFallbackRecords.forEach((record, index) => {
      courseMap.set(`__category-fallback__${key}__${index}`, record);
    });
    const records = [...courseMap.values()].map((record) => record.completion
      ? record
      : { course: record.course, completion: curriculumCourseCompletion(record.course) });
    const earnedRecords = records.filter((record) => record.completion.earned);
    const rawEarnedCredits = earnedRecords.reduce((total, record) => total + curriculumCreditNumber(record.course.credit), 0);
    const rawEarnedRequiredCredits = earnedRecords.reduce((total, record) => total + (curriculumCourseType(record.course) === "required" ? curriculumCreditNumber(record.course.credit) : 0), 0);
    const rawEarnedElectiveCredits = earnedRecords.reduce((total, record) => total + (curriculumCourseType(record.course) === "elective" ? curriculumCreditNumber(record.course.credit) : 0), 0);
    const categoryFallbackRecords = earnedRecords.filter((record) => record.categoryFallback);
    const rawCategoryFallbackCredits = categoryFallbackRecords.reduce((total, record) => total + curriculumCreditNumber(record.course.credit), 0);
    const minimum = curriculumRequirementCredit(group.minCredits);
    const total = curriculumRequirementCredit(group.totalCredits);
    const required = curriculumRequirementCredit(group.requiredCredits);
    const elective = curriculumRequirementCredit(group.electiveCredits);
    const targetCredits = minimum !== null
      ? minimum
      : total !== null
        ? total
        : required !== null || elective !== null
          ? (required || 0) + (elective || 0)
          : null;
    // 成绩中的已通过课程可以超过某个课组/类别的要求，但培养方案进度只
    // 计算到该课组实际需要的上限，避免出现“8 / 6 学分”或负数剩余。
    const earnedCredits = curriculumCappedCredit(rawEarnedCredits, targetCredits);
    const earnedRequiredCredits = curriculumCappedCredit(rawEarnedRequiredCredits, required);
    const earnedElectiveCredits = curriculumCappedCredit(rawEarnedElectiveCredits, elective);
    const categoryFallbackCredits = curriculumCappedCredit(rawCategoryFallbackCredits, elective !== null ? elective : targetCredits);
    const progress = {
      courseCount: records.length,
      earnedCourseCount: earnedRecords.length,
      earnedCredits,
      targetCredits,
      remainingCredits: targetCredits === null ? null : curriculumRemainingCredit(targetCredits, earnedCredits),
      targetRequiredCredits: required,
      targetElectiveCredits: elective,
      remainingRequiredCredits: required === null ? null : curriculumRemainingCredit(required, earnedRequiredCredits),
      remainingElectiveCredits: elective === null ? null : curriculumRemainingCredit(elective, earnedElectiveCredits),
      earnedRequiredCredits,
      earnedElectiveCredits,
      categoryFallbackCount: categoryFallbackRecords.length,
      categoryFallbackCredits,
      directCategoryFallbackRecords,
      records
    };
    memo.set(key, progress);
    return progress;
  };
  list.forEach((group) => build(group));
  return memo;
}

function curriculumCourseProgressMarkup(course, options = {}) {
  if (options.export) return "";
  const categoryScore = course.raw?.__curriculumCategoryFallbackScore;
  const completion = categoryScore
    ? { earned: true, score: categoryScore, matchType: "通识选修类别" }
    : curriculumCourseCompletion(course);
  if (!completion.earned) return `<span class="curriculum-course-status curriculum-course-status-pending">未完成</span>`;
  const score = completion.score || {};
  const details = [score.score ? `成绩 ${score.score}` : "已通过", score.term, completion.matchType].filter(Boolean).join(" · ");
  return `<span class="curriculum-course-status curriculum-course-status-earned">✓ 已完成</span><small class="curriculum-course-status-detail">${escapeHtml([formatCurriculumCredit(course.credit) + " 学分", details].filter(Boolean).join(" · "))}</small>`;
}

function curriculumGroupStatus(progress = {}) {
  const target = numericValue(progress.targetCredits);
  const earned = Number(progress.earnedCredits || 0);
  if (target !== null && target > 0 && earned >= target - 0.005) return { key: "complete", label: "✓ 已满足" };
  if (earned > 0) return { key: "progress", label: "进行中" };
  return { key: "neutral", label: "未开始" };
}

function curriculumGroupPercent(progress = {}) {
  const target = numericValue(progress.targetCredits);
  if (target === null || target <= 0) return 0;
  return Math.min(100, Math.max(0, Number(progress.earnedCredits || 0) / target * 100));
}

function curriculumGroupMetricMarkup(progress = {}) {
  const target = progress.targetCredits === null || progress.targetCredits === undefined
    ? "—"
    : `${formatCurriculumCredit(progress.targetCredits)} 学分`;
  const earned = `${formatCurriculumCredit(progress.earnedCredits)} 学分`;
  const remaining = progress.remainingCredits === null || progress.remainingCredits === undefined
    ? "—"
    : `${formatCurriculumCredit(progress.remainingCredits)} 学分`;
  return `<div class="curriculum-group-metrics"><span class="curriculum-group-metric"><small>已获得 / 要求</small><strong>${escapeHtml(`${earned} / ${target}`)}</strong></span><span class="curriculum-group-metric curriculum-group-metric-remaining"><small>还差</small><strong>${escapeHtml(remaining)}</strong></span><span class="curriculum-group-metric"><small>完成课程</small><strong>${escapeHtml(`${progress.earnedCourseCount || 0} / ${progress.courseCount || 0} 门`)}</strong></span></div>`;
}

function curriculumGroupMetaMarkup(group = {}, progress = {}) {
  const items = [
    group.category ? `类别：${group.category}` : "",
    group.rule ? `选择规则：${group.rule}` : "",
    progress.categoryFallbackCount ? `通识选修类别计入 ${progress.categoryFallbackCount} 门` : ""
  ].filter(Boolean);
  return items.length ? `<div class="curriculum-group-meta">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : "";
}

function curriculumTreeModel(groups = [], progressMap = curriculumProgressMap(), options = {}) {
  const visibleGroups = groups.filter((group) => (
    options.export
      ? true
      : curriculumGroupRequirementItems(group, { ...options, progressMap }).length || group.courses.length
  ));
  const groupMap = new Map(visibleGroups.map((group) => [curriculumGroupIdentity(group), group]));
  visibleGroups.forEach((group) => {
    if (group.id) groupMap.set(String(group.id), group);
  });
  const childrenMap = new Map();
  visibleGroups.forEach((group) => {
    const parent = group.parentId && groupMap.get(String(group.parentId));
    const parentId = parent ? curriculumGroupIdentity(parent) : "__root__";
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId).push(group);
  });
  return {
    groups: visibleGroups,
    childrenMap,
    roots: childrenMap.get("__root__") || visibleGroups
  };
}

function curriculumTreeWalk(groups, visitor, options = {}) {
  const model = curriculumTreeModel(groups, options.progressMap || curriculumProgressMap(), options);
  const walk = (group, depth = 0, seen = new Set()) => {
    const key = curriculumGroupIdentity(group);
    if (seen.has(key)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    visitor(group, depth, key);
    (model.childrenMap.get(key) || []).forEach((child) => walk(child, depth + 1, nextSeen));
  };
  model.roots.forEach((group) => walk(group));
  return model;
}

function curriculumTreeKeys(groups = state.curriculum.groups) {
  const keys = [];
  curriculumTreeWalk(groups, (_group, _depth, key) => keys.push(key));
  return keys;
}

function curriculumTreeIsFullyExpanded(groups = state.curriculum.groups) {
  let allExpanded = true;
  curriculumTreeWalk(groups, (_group, depth, key) => {
    if (!curriculumTreeOpenState(key, depth)) allExpanded = false;
  });
  return allExpanded;
}

function curriculumTreeBulkActionMarkup(groups = state.curriculum.groups) {
  const expanded = curriculumTreeIsFullyExpanded(groups);
  return `<button class="button button-ghost button-small curriculum-tree-bulk-action" type="button" data-curriculum-bulk data-action="curriculum-${expanded ? "collapse" : "expand"}-all">${expanded ? "收起全部" : "展开全部"}</button>`;
}

function syncCurriculumTreeBulkAction() {
  const button = elements.content?.querySelector?.("[data-curriculum-bulk]");
  if (!button) return;
  const expanded = curriculumTreeIsFullyExpanded(state.curriculum.groups);
  button.dataset.action = `curriculum-${expanded ? "collapse" : "expand"}-all`;
  button.textContent = expanded ? "收起全部" : "展开全部";
  button.setAttribute("aria-label", expanded ? "收起全部培养方案层级" : "展开全部培养方案层级");
}

function curriculumTreeOpenState(key, depth, exportMode = false) {
  if (exportMode) return true;
  if (Object.prototype.hasOwnProperty.call(state.curriculum.expanded || {}, key)) return Boolean(state.curriculum.expanded[key]);
  // 首屏只打开一级模块，避免课程量大时把真正的毕业进度推到很下面。
  return depth === 0;
}

function curriculumGroupRequirementItems(group, options = {}) {
  const items = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") items.push([label, value]);
  };
  const addCredit = (label, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") add(label, `${formatCurriculumCredit(value)} 学分`);
  };
  addCredit("最低要求", group.minCredits);
  addCredit("课程合计", group.totalCredits);
  addCredit("必修", group.requiredCredits);
  addCredit("选修", group.electiveCredits);
  add("课程分类", group.category);
  add("层级", group.kind);
  add("选择规则", group.rule);
  if (!options.export) {
    const progress = options.progressMap?.get(curriculumGroupIdentity(group));
    if (progress) {
      add("已获得", `${formatCurriculumCredit(progress.earnedCredits)} 学分`);
      if (progress.remainingCredits !== null) add("剩余所需", `${formatCurriculumCredit(progress.remainingCredits)} 学分`);
      add("完成课程", `${progress.earnedCourseCount} / ${progress.courseCount} 门`);
      if (progress.earnedRequiredCredits > 0 || progress.targetRequiredCredits !== null) add("必修已获", `${formatCurriculumCredit(progress.earnedRequiredCredits)} 学分`);
      if (progress.remainingRequiredCredits !== null) add("必修剩余", `${formatCurriculumCredit(progress.remainingRequiredCredits)} 学分`);
      if (progress.earnedElectiveCredits > 0 || progress.targetElectiveCredits !== null) add("选修已获", `${formatCurriculumCredit(progress.earnedElectiveCredits)} 学分`);
      if (progress.remainingElectiveCredits !== null) add("选修剩余", `${formatCurriculumCredit(progress.remainingElectiveCredits)} 学分`);
      if (progress.categoryFallbackCount > 0) add("通识选修类别计入", `${progress.categoryFallbackCount} 门 / ${formatCurriculumCredit(progress.categoryFallbackCredits)} 学分`);
    }
  }
  return items;
}

function curriculumGroupRequirementMarkup(group) {
  const items = curriculumGroupRequirementItems(group, { progressMap: curriculumProgressMap() });
  if (!items.length) return "";
  return `<div class="curriculum-requirement-strip">${items.map(([label, value]) => `<span class="curriculum-requirement-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>`).join("")}</div>`;
}

function curriculumSemesterLabel(value, plan = {}) {
  const text = displayValue(value, "");
  if (!text) return "";
  const normalized = text.replace(/[－—]/g, "-");
  const yearMatch = normalized.match(/(20\d{2})\s*-\s*(20\d{2})/);
  const gradeText = [plan.grade, plan.name, plan.raw?.NJMC, plan.raw?.NJM].filter(Boolean).join(" ");
  const gradeMatch = gradeText.match(/20\d{2}/);
  const season = /秋/.test(normalized) || /-\s*1(?:\D|$)/.test(normalized) ? "上" : /春/.test(normalized) || /-\s*2(?:\D|$)/.test(normalized) ? "下" : "";
  if (!yearMatch || !gradeMatch || !season) return text;
  const level = Number(yearMatch[1]) - Number(gradeMatch[0]) + 1;
  if (level < 1 || level > 10) return text;
  const chinese = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][level] || String(level);
  return `大${chinese}${season}`;
}

function curriculumCourseTableMarkup(group, plan, options = {}) {
  const exportMode = Boolean(options.export);
  const directFallbackCourses = exportMode
    ? []
    : (options.progressMap?.get(curriculumGroupIdentity(group))?.directCategoryFallbackRecords || []).map((record) => record.course);
  const courses = [...group.courses, ...directFallbackCourses];
  if (!courses.length) return "";
  const progressHead = exportMode ? "" : "<th>完成情况</th>";
  return `<div class="table-wrap curriculum-table-wrap"><table><thead><tr><th>课程</th><th>课程号</th><th>学分</th><th>类别</th><th>性质 / 要求</th><th>考核方式</th><th>修读学期</th>${progressHead}</tr></thead><tbody>${courses.map((course) => {
    const categoryFallback = Boolean(course.raw?.__curriculumCategoryFallback);
    const completion = categoryFallback
      ? { earned: true }
      : curriculumCourseCompletion(course);
    const rowAction = exportMode || categoryFallback
      ? ` class="curriculum-course-row${completion.earned ? " is-complete" : ""}"`
      : ` class="clickable-row curriculum-course-row${completion.earned ? " is-complete" : ""}" data-action="show-curriculum-course" data-course-key="${escapeHtml(curriculumCourseKey(course))}" title="点击查看课程全部字段"`;
    const categoryNote = categoryFallback ? " · 已选通识选修" : "";
    return `<tr${rowAction}><td class="primary-cell">${escapeHtml(`${course.name}${categoryNote}`)}</td><td>${escapeHtml(course.code || "—")}</td><td>${escapeHtml(course.credit || "—")}</td><td>${escapeHtml(course.category || "—")}</td><td>${escapeHtml([course.nature, course.required].filter(Boolean).join(" / ") || "—")}</td><td>${escapeHtml(courseAssessmentLabel(course))}</td><td>${escapeHtml(curriculumSemesterLabel(course.semester, plan) || "—")}</td>${exportMode ? "" : `<td class="curriculum-progress-cell">${curriculumCourseProgressMarkup(course, options)}</td>`}</tr>`;
  }).join("")}</tbody></table></div>`;
}

function curriculumRequirementOverviewMarkup(groups, plan, options = {}) {
  const progressMap = options.progressMap || curriculumProgressMap();
  const treeModel = curriculumTreeModel(groups, progressMap, options);
  const visibleGroups = treeModel.groups;
  if (!visibleGroups.length) return "";
  const renderNode = (group, depth = 0, seen = new Set()) => {
    const key = curriculumGroupIdentity(group);
    if (seen.has(key)) return "";
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    const children = treeModel.childrenMap.get(key) || [];
    const progress = progressMap.get(key);
    const status = curriculumGroupStatus(progress || {});
    const percent = curriculumGroupPercent(progress || {});
    const legacyItems = curriculumGroupRequirementItems(group, { ...options, progressMap });
    const metrics = options.export
      ? legacyItems.map(([name, value]) => `<span class="curriculum-requirement-item"><small>${escapeHtml(name)}</small><strong>${escapeHtml(value)}</strong></span>`).join("")
      : `${curriculumGroupMetricMarkup(progress || {})}${percent > 0 && depth <= 1 ? `<span class="curriculum-group-progress" aria-label="已完成 ${Math.round(percent)}%"><span style="width:${percent.toFixed(1)}%"></span></span>` : ""}`;
    const count = progress?.courseCount ? `${progress.courseCount} 门课程` : group.courses.length ? `${group.courses.length} 门课程` : "";
    const open = curriculumTreeOpenState(key, depth, Boolean(options.export));
    const level = depth + 1;
    const meta = options.export ? "" : curriculumGroupMetaMarkup(group, progress || {});
    const pathMarkup = group.path && depth === 0 ? `<small>${escapeHtml(group.path)}</small>` : "";
    return `<details class="curriculum-tree-node curriculum-tree-level-${level} curriculum-status-${status.key}" data-curriculum-key="${escapeHtml(key)}" data-tree-depth="${depth}" ${open ? "open" : ""}><summary class="curriculum-tree-summary"><div class="curriculum-requirement-title"><div class="curriculum-group-heading"><span class="curriculum-group-kind">${escapeHtml(group.kind || "课组")}</span><strong>${escapeHtml(group.name)}</strong><span class="curriculum-group-status curriculum-group-status-${status.key}">${escapeHtml(status.label)}</span></div>${pathMarkup}${meta}</div><div class="curriculum-requirement-values">${metrics}${count ? `<span class="curriculum-requirement-count">${escapeHtml(count)}</span>` : ""}</div></summary><div class="curriculum-tree-content">${children.map((child) => renderNode(child, depth + 1, nextSeen)).join("")}${curriculumCourseTableMarkup(group, plan, options)}</div></details>`;
  };
  const tree = treeModel.roots.map((group) => renderNode(group, 0)).join("");
  const copy = options.export
    ? "按原系统层级完整展开课组、学分要求、课程字段和修读学期。"
    : "已获得 / 要求、还差和完成课程按层级展示；点击箭头可折叠或展开子树。";
  const controls = options.export ? "" : options.controlsMarkup || "";
  const headingActions = options.export ? "" : `<div class="curriculum-tree-heading-actions">${curriculumTreeBulkActionMarkup(state.curriculum.groups)}<span class="curriculum-requirement-count">${visibleGroups.length} 个层级</span></div>`;
  return `<section class="panel curriculum-requirement-overview${options.export ? " curriculum-export-requirement-overview" : ""}"><div class="curriculum-requirement-overview-head"><div><h3>培养方案结构</h3><p class="muted">${copy}</p></div>${headingActions}</div>${controls}<div class="curriculum-tree">${tree}</div></section>`;
}

function curriculumExportSafePlan(plan = {}) {
  // 导出只取方案本身的公共字段，不读取 raw，也不把学生姓名、学号、账号等字段带入 PDF。
  return [
    ["培养方案", plan.name],
    ["院系", plan.college],
    ["专业", plan.major],
    ["年级", plan.grade],
    ["培养层次", plan.level],
    ["方案类型", plan.type],
    ["修读类型", plan.studyType],
    ["方案最低学分", plan.credit]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() && String(value) !== "—");
}

function curriculumExportFileName(plan = {}) {
  const grade = String(plan.grade || String(plan.name || "").match(/20\d{2}/)?.[0] || "").trim();
  const normalizedGrade = grade && !/级$/.test(grade) ? `${grade}级` : grade;
  const major = String(plan.major || String(plan.name || "").replace(/^20\d{2}\s*/, "").replace(/专业培养方案.*$/, "").trim() || "培养方案").trim();
  return ["培养计划", normalizedGrade, major]
    .filter(Boolean)
    .join("_")
    .replace(/[\\/:*?"<>|]/g, "_");
}

const CURRICULUM_PDF_LAYOUT = Object.freeze({
  width: 1123,
  height: 794,
  paddingTop: 42,
  paddingRight: 45,
  paddingBottom: 34,
  paddingLeft: 45,
  runningHeader: 26,
  footer: 18,
  scale: 2,
  tableGap: 9
});

function curriculumExportPlan() {
  const curriculum = state.curriculum;
  return curriculum.selectedPlan || curriculum.plans.find((item) => item.id === curriculum.selectedPlanId) || {};
}

function curriculumExportGrade(plan = {}) {
  const value = String(plan.grade || String(plan.name || "").match(/20\d{2}/)?.[0] || "").trim();
  return value && !/级$/.test(value) ? `${value}级` : value;
}

function curriculumExportMajor(plan = {}) {
  return String(plan.major || String(plan.name || "").replace(/^20\d{2}\s*/, "").replace(/专业培养方案.*$/, "").trim() || "培养方案").trim();
}

function curriculumPdfUniqueText(values = []) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].join(" / ");
}

function curriculumPdfTermLabel(value, plan = {}) {
  const text = displayValue(value, "").replace(/学年/g, "").replace(/学期/g, "").replace(/季节/g, "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const match = text.match(/(20\d{2})\s*[-－—]\s*(20\d{2}).*?(秋|春|上|下|1|2)/);
  if (match) return `${match[1]}-${match[2]} ${/秋|上|1/.test(match[3]) ? "秋" : "春"}`;
  return curriculumSemesterLabel(value, plan);
}

function curriculumPdfCompletion(course, plan = {}) {
  const categoryScore = course?.raw?.__curriculumCategoryFallbackScore;
  const completion = categoryScore
    ? { earned: true, score: categoryScore, matchType: "通识选修类别" }
    : curriculumCourseCompletion(course);
  if (!completion.earned) return `<span class="curriculum-pdf-status curriculum-pdf-status-neutral">未完成</span>`;
  const score = completion.score || {};
  const details = [score.score ? `成绩 ${score.score}` : "已通过", curriculumPdfTermLabel(score.term, plan)].filter(Boolean).join(" · ");
  return `<span class="curriculum-pdf-status curriculum-pdf-status-complete">✓ 已完成</span><small>${escapeHtml(details || "已通过")}</small>`;
}

function curriculumPdfColumnMarkup() {
  return `<colgroup><col class="curriculum-pdf-col-course" /><col class="curriculum-pdf-col-code" /><col class="curriculum-pdf-col-credit" /><col class="curriculum-pdf-col-category" /><col class="curriculum-pdf-col-requirement" /><col class="curriculum-pdf-col-assessment" /><col class="curriculum-pdf-col-semester" /><col class="curriculum-pdf-col-completion" /></colgroup>`;
}

function curriculumPdfTableHeaderMarkup() {
  return `<thead><tr><th>课程</th><th>课程号</th><th>学分</th><th>类别</th><th>性质 / 要求</th><th>考核方式</th><th>修读学期</th><th>完成情况</th></tr></thead>`;
}

function curriculumPdfCourseRowMarkup(course = {}, plan = {}) {
  const requirement = curriculumPdfUniqueText([course.nature, course.required, course.requirement]);
  const category = course.category || "—";
  const semester = curriculumSemesterLabel(course.semester, plan) || "—";
  const categoryFallback = Boolean(course.raw?.__curriculumCategoryFallback);
  const name = `${course.name || "未命名课程"}${categoryFallback ? " · 已选通识选修" : ""}`;
  return `<tr class="curriculum-pdf-course-row"><td class="curriculum-pdf-course-name">${escapeHtml(name)}</td><td class="curriculum-pdf-nowrap">${escapeHtml(course.code || "—")}</td><td class="curriculum-pdf-nowrap curriculum-pdf-credit">${escapeHtml(course.credit || "—")}</td><td>${escapeHtml(category)}</td><td>${escapeHtml(requirement || "—")}</td><td class="curriculum-pdf-nowrap">${escapeHtml(courseAssessmentLabel(course))}</td><td class="curriculum-pdf-nowrap">${escapeHtml(semester)}</td><td class="curriculum-pdf-completion">${curriculumPdfCompletion(course, plan)}</td></tr>`;
}

function curriculumPdfTreeEntries(groups = [], progressMap = new Map()) {
  const model = curriculumTreeModel(groups, progressMap, { export: true });
  const entries = [];
  const visited = new Set();
  const walkNumbered = (group, depth, numberParts, seen = new Set()) => {
    const key = curriculumGroupIdentity(group);
    if (visited.has(key) || seen.has(key)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    visited.add(key);
    const progress = progressMap.get(key) || {};
    const entry = { group, key, depth, number: numberParts.join("."), progress, children: model.childrenMap.get(key) || [] };
    entries.push(entry);
    entry.children.forEach((child, index) => walkNumbered(child, depth + 1, [...numberParts, index + 1], nextSeen));
  };
  model.roots.forEach((group, index) => walkNumbered(group, 0, [index + 1]));
  model.groups.forEach((group, index) => {
    if (!visited.has(curriculumGroupIdentity(group))) walkNumbered(group, 0, [entries.length + index + 1]);
  });
  return entries;
}

function curriculumPdfGroupRequirement(group = {}, progress = {}) {
  const target = progress.targetCredits ?? group.minCredits ?? group.totalCredits ?? group.requiredCredits ?? group.electiveCredits;
  const count = progress.courseCount || group.courses?.length || 0;
  return [
    target !== undefined && target !== null && String(target).trim() ? `最低要求 ${formatCurriculumCredit(target)} 学分` : "",
    `${count} 门课程`
  ].filter(Boolean).join(" · ");
}

function curriculumPdfGroupHeadingMarkup(entry, model, continuation = false) {
  const group = entry.group || {};
  const progress = entry.progress || {};
  const status = curriculumGroupStatus(progress);
  const kind = group.kind || (group.courses?.length ? "课组" : "模块");
  const label = continuation ? `${entry.number} ${group.name}（续）` : `${entry.number} ${group.name}`;
  const requirement = curriculumPdfGroupRequirement(group, progress);
  const path = !continuation && entry.depth === 0 && group.path ? `<small class="curriculum-pdf-group-path">${escapeHtml(group.path)}</small>` : "";
  return `<section class="curriculum-pdf-group-heading curriculum-pdf-depth-${entry.depth}${continuation ? " is-continuation" : ""}"><div class="curriculum-pdf-group-main"><span class="curriculum-pdf-group-number">${escapeHtml(entry.number)}</span><div><h3>${escapeHtml(label.replace(`${entry.number} `, ""))}</h3><p>${escapeHtml(kind)}${path ? "" : ""}</p>${path}</div></div><div class="curriculum-pdf-group-facts"><span>${escapeHtml(requirement)}</span><strong class="curriculum-pdf-status curriculum-pdf-status-${status.key}">${escapeHtml(status.label)}</strong></div></section>`;
}

function curriculumPdfTableMarkup(entry, rows, plan) {
  const name = `${entry.number} ${entry.group?.name || "课程"}`;
  return `<table class="curriculum-pdf-table" aria-label="${escapeHtml(name)}">${curriculumPdfColumnMarkup()}${curriculumPdfTableHeaderMarkup()}<tbody>${rows.map((course) => curriculumPdfCourseRowMarkup(course, plan)).join("")}</tbody></table>`;
}

function curriculumPdfTitleMarkup(model) {
  const plan = model.plan || {};
  const major = curriculumExportMajor(plan);
  const grade = curriculumExportGrade(plan);
  const meta = curriculumExportSafePlan(plan)
    .filter(([label]) => ["院系", "培养层次", "方案类型", "修读类型"].includes(label))
    .map(([label, value]) => `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>`)
    .join("");
  return `<header class="curriculum-pdf-title-block"><div class="curriculum-pdf-accent"></div><p>东北大学本科培养方案</p><h1>${escapeHtml(major)} · ${escapeHtml(grade || "年级待定")}</h1><div class="curriculum-pdf-meta-line">${meta}</div></header>`;
}

function curriculumPdfSummaryMarkup(model) {
  const plan = model.plan || {};
  return `<div class="curriculum-pdf-summary-line"><span><small>方案最低学分</small><strong>${escapeHtml(plan.credit || "—")}</strong></span><span><small>课组</small><strong>${escapeHtml(model.groupCount)}</strong></span><span><small>课程</small><strong>${escapeHtml(model.courseCount)}</strong></span></div>`;
}

function curriculumPdfStructureHeadingMarkup(model) {
  return `<div class="curriculum-pdf-structure-heading"><h2>培养方案结构</h2><span>${escapeHtml(`${model.groupCount} 个课组 · ${model.courseCount} 门课程`)}</span></div>`;
}

function curriculumPdfDocumentModel() {
  const curriculum = state.curriculum;
  const plan = curriculumExportPlan();
  const progressMap = curriculumProgressMap(curriculum.groups);
  const groups = curriculumPdfTreeEntries(curriculum.groups, progressMap);
  const groupCourses = groups.flatMap((entry) => Array.isArray(entry.group?.courses) ? entry.group.courses : []);
  const courses = Array.isArray(curriculum.courses) && curriculum.courses.length ? curriculum.courses : groupCourses;
  return {
    plan,
    progressMap,
    groups,
    groupCount: groups.length,
    courses,
    courseCount: courses.length,
    fileName: curriculumExportFileName(plan)
  };
}

function curriculumExportMarkup() {
  // 兼容审计和外部调用的纯数据预览：它只使用 PDF Renderer 的专用节点，
  // 不再调用屏幕树 renderer，也不包含 details、sidebar 或交互状态。
  const model = curriculumPdfDocumentModel();
  return `<section class="curriculum-pdf-document-preview" data-curriculum-export="full">${curriculumPdfTitleMarkup(model)}${curriculumPdfSummaryMarkup(model)}${curriculumPdfStructureHeadingMarkup(model)}${model.groups.map((entry) => `${curriculumPdfGroupHeadingMarkup(entry, model)}${entry.group.courses?.length ? curriculumPdfTableMarkup(entry, entry.group.courses, model.plan) : ""}`).join("")}</section>`;
}

function curriculumExportDocument() {
  const model = curriculumPdfDocumentModel();
  return {
    html: curriculumExportMarkup(),
    title: model.fileName,
    fileName: model.fileName,
    planTitle: String(model.plan.name || "培养方案"),
    model,
    format: "A4 landscape",
    scale: CURRICULUM_PDF_LAYOUT.scale
  };
}

function curriculumPdfNextFrame(count = 1, target = window) {
  return new Promise((resolve) => {
    const raf = target?.requestAnimationFrame || ((callback) => target?.setTimeout?.(callback, 16) || setTimeout(callback, 16));
    let remaining = Math.max(1, Number(count) || 1);
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else raf(step);
    };
    raf(step);
  });
}

async function curriculumPdfWaitForFonts() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    // 系统字体回退不应阻断导出。
  }
}

function curriculumPdfBodyHeight(pageNumber = 1) {
  const innerHeight = CURRICULUM_PDF_LAYOUT.height - CURRICULUM_PDF_LAYOUT.paddingTop - CURRICULUM_PDF_LAYOUT.paddingBottom - CURRICULUM_PDF_LAYOUT.footer;
  return innerHeight - (pageNumber > 1 ? CURRICULUM_PDF_LAYOUT.runningHeader : 0);
}

function curriculumPdfCreateMeasurementHost() {
  const host = document.createElement("div");
  host.className = "curriculum-pdf-host curriculum-pdf-measure-host";
  host.innerHTML = `<article class="curriculum-pdf-page"><div class="curriculum-pdf-page-inner"><div class="curriculum-pdf-page-running-head is-first"></div><div class="curriculum-pdf-page-body"></div><footer class="curriculum-pdf-page-footer"></footer></div></article>`;
  document.body.appendChild(host);
  return { host, body: host.querySelector(".curriculum-pdf-page-body") };
}

function curriculumPdfMeasureElement(body, markup) {
  const wrapper = document.createElement("div");
  wrapper.className = "curriculum-pdf-measure-block";
  wrapper.innerHTML = markup;
  body.appendChild(wrapper);
  const element = wrapper.firstElementChild || wrapper;
  const rect = element.getBoundingClientRect();
  const styles = document.defaultView?.getComputedStyle?.(element);
  const marginTop = Number.parseFloat(styles?.marginTop || "0") || 0;
  const marginBottom = Number.parseFloat(styles?.marginBottom || "0") || 0;
  const height = Math.ceil(rect.height + marginTop + marginBottom);
  wrapper.remove();
  return Math.max(1, height);
}

function curriculumPdfMeasureTablePart(body, markup) {
  const wrapper = document.createElement("div");
  wrapper.className = "curriculum-pdf-measure-block";
  wrapper.innerHTML = `<table class="curriculum-pdf-table">${curriculumPdfColumnMarkup()}${markup}</table>`;
  body.appendChild(wrapper);
  const table = wrapper.firstElementChild;
  const height = Math.ceil(table.getBoundingClientRect().height);
  wrapper.remove();
  return Math.max(1, height);
}

function curriculumPdfMeasureModel(model) {
  const measurement = curriculumPdfCreateMeasurementHost();
  const { host, body } = measurement;
  const metrics = {
    title: curriculumPdfMeasureElement(body, curriculumPdfTitleMarkup(model)),
    summary: curriculumPdfMeasureElement(body, curriculumPdfSummaryMarkup(model)),
    structure: curriculumPdfMeasureElement(body, curriculumPdfStructureHeadingMarkup(model)),
    groupHeadings: new Map(),
    continuationHeadings: new Map(),
    rows: new Map(),
    tableHeader: curriculumPdfMeasureTablePart(body, curriculumPdfTableHeaderMarkup()),
    tableGap: CURRICULUM_PDF_LAYOUT.tableGap
  };
  model.groups.forEach((entry) => {
    metrics.groupHeadings.set(entry.key, curriculumPdfMeasureElement(body, curriculumPdfGroupHeadingMarkup(entry, model)));
    metrics.continuationHeadings.set(entry.key, curriculumPdfMeasureElement(body, curriculumPdfGroupHeadingMarkup(entry, model, true)));
    (entry.group.courses || []).forEach((course, index) => {
      metrics.rows.set(`${entry.key}:${index}`, curriculumPdfMeasureTablePart(body, `<tbody>${curriculumPdfCourseRowMarkup(course, model.plan)}</tbody>`));
    });
  });
  host.remove();
  return metrics;
}

function curriculumPdfEntryFirstContentHeight(entry, entryMap, metrics, seen = new Set()) {
  if (!entry || seen.has(entry.key)) return 0;
  const nextSeen = new Set(seen);
  nextSeen.add(entry.key);
  const heading = metrics.groupHeadings.get(entry.key) || 1;
  const courses = entry.group?.courses || [];
  if (courses.length) {
    const row = metrics.rows.get(`${entry.key}:0`) || 1;
    return heading + metrics.tableHeader + row + metrics.tableGap;
  }
  const firstChild = (entry.children || []).map((child) => entryMap.get(curriculumGroupIdentity(child))).find(Boolean);
  return heading + (firstChild ? curriculumPdfEntryFirstContentHeight(firstChild, entryMap, metrics, nextSeen) : 0);
}

function curriculumPdfPaginateBlocks(model, metrics) {
  const pages = [];
  const createPage = () => ({ number: pages.length + 1, capacity: curriculumPdfBodyHeight(pages.length + 1), used: 0, entries: [] });
  let page = createPage();
  pages.push(page);
  const newPage = () => {
    page = createPage();
    pages.push(page);
  };
  const addSimple = (entry, height) => {
    if (page.entries.length && page.used + height > page.capacity) newPage();
    page.entries.push({ type: "html", html: entry, height });
    page.used += height;
  };
  addSimple(curriculumPdfTitleMarkup(model), metrics.title);
  addSimple(curriculumPdfSummaryMarkup(model), metrics.summary);
  addSimple(curriculumPdfStructureHeadingMarkup(model), metrics.structure);

  const entryMap = new Map(model.groups.map((entry) => [entry.key, entry]));
  model.groups.forEach((entry) => {
    const group = entry.group || {};
    const courses = Array.isArray(group.courses) ? group.courses : [];
    const headingHeight = metrics.groupHeadings.get(entry.key) || 1;
    const minimumHeight = curriculumPdfEntryFirstContentHeight(entry, entryMap, metrics);
    if (page.entries.length && page.used + minimumHeight > page.capacity) newPage();
    page.entries.push({ type: "html", html: curriculumPdfGroupHeadingMarkup(entry, model), height: headingHeight });
    page.used += headingHeight;
    if (!courses.length) return;

    const addSegment = (courseIndex, continuation = false) => {
      const rowHeight = metrics.rows.get(`${entry.key}:${courseIndex}`) || 1;
      const segment = {
        type: "table",
        entry,
        rows: [courses[courseIndex]],
        height: metrics.tableHeader + rowHeight + metrics.tableGap
      };
      if (continuation) {
        const continuationHeight = metrics.continuationHeadings.get(entry.key) || headingHeight;
        page.entries.push({ type: "html", html: curriculumPdfGroupHeadingMarkup(entry, model, true), height: continuationHeight });
        page.used += continuationHeight;
      }
      page.entries.push(segment);
      page.used += segment.height;
      return segment;
    };

    let segment = addSegment(0);
    for (let index = 1; index < courses.length; index += 1) {
      const rowHeight = metrics.rows.get(`${entry.key}:${index}`) || 1;
      if (page.used + rowHeight <= page.capacity) {
        segment.rows.push(courses[index]);
        segment.height += rowHeight;
        page.used += rowHeight;
      } else {
        newPage();
        segment = addSegment(index, true);
      }
    }
  });
  return pages;
}

async function curriculumPdfPaginate(model) {
  await curriculumPdfWaitForFonts();
  await curriculumPdfNextFrame(2);
  const metrics = curriculumPdfMeasureModel(model);
  return { pages: curriculumPdfPaginateBlocks(model, metrics), metrics };
}

function curriculumPdfPageMarkup(page, totalPages, model) {
  const major = curriculumExportMajor(model.plan);
  const grade = curriculumExportGrade(model.plan);
  const runningHead = page.number === 1
    ? `<div class="curriculum-pdf-page-running-head is-first"></div>`
    : `<div class="curriculum-pdf-page-running-head"><span>东北大学本科培养方案 · ${escapeHtml(major)}（${escapeHtml(grade || "年级待定")}）</span><span>培养计划</span></div>`;
  const body = page.entries.map((entry) => entry.type === "table"
    ? curriculumPdfTableMarkup(entry.entry, entry.rows, model.plan)
    : entry.html).join("");
  return `<article class="curriculum-pdf-page" data-page-number="${page.number}"><div class="curriculum-pdf-page-inner">${runningHead}<div class="curriculum-pdf-page-body" style="height:${curriculumPdfBodyHeight(page.number)}px">${body}</div><footer class="curriculum-pdf-page-footer"><span>执掌东大 · 培养计划</span><strong>第 ${page.number} / ${totalPages} 页</strong></footer></div></article>`;
}

function curriculumPdfCreateHost(model, pages) {
  const host = document.createElement("div");
  host.className = "curriculum-pdf-host";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = pages.map((page) => curriculumPdfPageMarkup(page, pages.length, model)).join("");
  document.body.appendChild(host);
  return host;
}

function curriculumPdfDownload(pdf, fileName) {
  if (typeof pdf?.save === "function") {
    pdf.save(fileName);
    return;
  }
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setCurriculumExportButtonState(exporting) {
  const button = elements.content?.querySelector?.('[data-action="export-curriculum-pdf"]');
  if (!button) return;
  button.disabled = Boolean(exporting);
  button.textContent = exporting ? "正在生成…" : "导出 PDF";
}

function finishCurriculumExportNotice(text = "") {
  state.curriculum.exporting = false;
  setCurriculumExportButtonState(false);
  if (text) setNotice(text, "success");
}

async function exportCurriculumPdf() {
  const curriculum = state.curriculum;
  if (curriculum.exporting) return;
  if (!curriculum.selectedPlan || (!curriculum.groups.length && !curriculum.courses.length)) {
    setNotice("当前没有可导出的培养方案，请先刷新方案。", "error");
    return;
  }
  state.curriculum.exporting = true;
  setCurriculumExportButtonState(true);
  setNotice("正在整理培养方案…");
  let host = null;
  try {
    const documentData = curriculumExportDocument();
    const pagination = await curriculumPdfPaginate(documentData.model);
    host = curriculumPdfCreateHost(documentData.model, pagination.pages);
    await curriculumPdfWaitForFonts();
    await curriculumPdfNextFrame(2);
    const pdfApi = globalThis.jspdf?.jsPDF || globalThis.jsPDF;
    if (typeof globalThis.html2canvas !== "function" || typeof pdfApi !== "function") {
      throw new Error("PDF 渲染组件未加载，请刷新扩展页面后重试");
    }
    const pdf = new pdfApi({ orientation: "landscape", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
    pdf.setProperties({
      title: `东北大学本科培养方案 - ${documentData.planTitle}`,
      subject: "课程与学分要求",
      author: "执掌东大",
      creator: "执掌东大"
    });
    const pageNodes = [...host.querySelectorAll(".curriculum-pdf-page")];
    for (let index = 0; index < pageNodes.length; index += 1) {
      setNotice(`正在生成 PDF（${index + 1} / ${pageNodes.length}）…`);
      await curriculumPdfNextFrame(1);
      const canvas = await globalThis.html2canvas(pageNodes[index], {
        backgroundColor: "#ffffff",
        scale: CURRICULUM_PDF_LAYOUT.scale,
        width: CURRICULUM_PDF_LAYOUT.width,
        height: CURRICULUM_PDF_LAYOUT.height,
        windowWidth: CURRICULUM_PDF_LAYOUT.width,
        windowHeight: CURRICULUM_PDF_LAYOUT.height,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        logging: false
      });
      if (index > 0) pdf.addPage("a4", "landscape");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 297, 210, undefined, "FAST");
      canvas.width = 1;
      canvas.height = 1;
    }
    curriculumPdfDownload(pdf, `${documentData.fileName}.pdf`);
    finishCurriculumExportNotice(`培养计划已导出，共 ${pageNodes.length} 页。`);
  } catch (error) {
    state.curriculum.exporting = false;
    setCurriculumExportButtonState(false);
    setNotice(`培养计划 PDF 生成失败：${error.message || "未知错误"}`, "error");
  } finally {
    host?.remove();
  }
}

function curriculumCourseDetailMarkup(detail) {
  if (!detail) return "";
  const row = detail?.row || {};
  const fields = [
    ["课程名称", row.name], ["课程号", row.code], ["学分", row.credit], ["课程类别", row.category],
    ["课程性质", row.nature], ["考核方式", courseAssessmentLabel(row)], ["开课学期", curriculumSemesterLabel(row.semester, state.curriculum.selectedPlan || {})], ["修读要求", row.required], ["专业方向", row.direction], ["学时", row.hours], ["所属课组", row.groupName]
  ].filter(([, value]) => value);
  const rawText = row.raw && typeof row.raw === "object" ? JSON.stringify(row.raw, null, 2) : "";
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal curriculum-course-modal" role="dialog" aria-modal="true" aria-label="培养计划课程详情"><div class="detail-modal-head"><div><p class="eyebrow">CURRICULUM COURSE</p><h3>${escapeHtml(row.name || "课程详情")}</h3><p class="muted">${escapeHtml(row.code || "")}</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-curriculum-course">关闭</button></div>${detail?.loading ? loadingCard("正在读取课程详情…") : ""}${detail?.error ? `<div class="error-card"><h3>课程详情接口未返回</h3><p>${escapeHtml(detail.error)}</p><p class="muted">已显示培养方案接口返回的全部可识别字段。</p></div>` : ""}<div class="detail-grid curriculum-detail-grid">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("") || `<div class="schedule-note">没有可识别的课程字段。</div>`}</div>${rawText ? `<details class="raw-details" open><summary>查看原系统全部字段</summary><pre>${escapeHtml(rawText)}</pre></details>` : ""}</section></div>`;
}

function renderCurriculum() {
  const curriculum = state.curriculum;
  if (!curriculum.plans.length && (curriculum.loading || curriculumBootstrapIsActive())) {
    return `<div class="curriculum-page">${sectionHeading("培养计划", "")}${renderCurriculumBootstrapState()}</div>`;
  }
  const planOptions = curriculum.plans.map((plan) => `<option value="${escapeHtml(plan.id)}" ${plan.id === curriculum.selectedPlanId ? "selected" : ""}>${escapeHtml(plan.name)}${plan.grade ? ` · ${escapeHtml(plan.grade)}` : ""}</option>`).join("");
  if (curriculum.error && !curriculum.groups.length && !curriculum.courses.length) return `<div class="curriculum-page">${sectionHeading("培养计划", "")}${renderCurriculumBootstrapState()}</div>`;
  if (!curriculum.plans.length) return `<div class="curriculum-page">${sectionHeading("培养计划", "")}${renderCurriculumBootstrapState()}</div>`;
  const groups = curriculumFilteredGroups();
  const plan = curriculum.selectedPlan || curriculum.plans.find((item) => item.id === curriculum.selectedPlanId) || {};
  const progressMap = curriculumProgressMap();
  const categorySelectedCount = groups.reduce((count, group) => count + (progressMap.get(curriculumGroupIdentity(group))?.directCategoryFallbackRecords?.length || 0), 0);
  const courseCount = groups.reduce((count, group) => count + group.courses.length, 0);
  const semesterOptions = curriculumSemesterOptions(plan).map((value) => `<option value="${escapeHtml(value)}" ${curriculum.semester === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  const planMeta = [plan.college, plan.major, plan.grade, plan.type, plan.studyType].filter(Boolean).join(" · ") || "方案元数据待原系统返回";
  const hasSuspiciousPlan = /智能车辆工程/.test(String(plan.name || ""));
  const refreshHint = hasSuspiciousPlan
    ? "当前读取到“智能车辆工程”等与本人专业不符的方案，通常说明教务系统培养方案页面尚未完全加载。请先等待原系统页面完全加载，再点击“刷新方案”。"
    : "如果刷新后出现“智能车辆工程”等明显不属于本人专业的培养方案，通常说明教务系统培养方案页面尚未完全加载；请先等待原系统培养方案页面完全加载，再点击“刷新方案”。";
  const filterMarkup = `<div class="curriculum-tree-toolbar"><div class="toolbar curriculum-filter-toolbar"><input data-filter="curriculum" value="${escapeHtml(curriculum.filter)}" placeholder="搜索课程名、课程号、类别、性质或课组" /><label class="curriculum-mode-label">性质<select id="curriculumMode"><option value="all" ${curriculum.mode === "all" ? "selected" : ""}>全部课程</option><option value="required" ${curriculum.mode === "required" ? "selected" : ""}>必修</option><option value="elective" ${curriculum.mode === "elective" ? "selected" : ""}>选修</option></select></label><label class="curriculum-mode-label">学期<select id="curriculumSemesterSelect"><option value="all" ${curriculum.semester === "all" ? "selected" : ""}>全部学期</option>${semesterOptions}</select></label><label class="curriculum-pending-label"><input id="curriculumPendingOnly" type="checkbox" ${curriculum.pendingOnly ? "checked" : ""} />只看待完成</label><span class="curriculum-tree-filter-count">${escapeHtml(`${courseCount} 门课程${categorySelectedCount ? ` · ${categorySelectedCount} 门通识选修` : ""}`)}</span></div></div>`;
  const exportLabel = curriculum.exporting ? "正在生成…" : "导出 PDF";
  return `<div class="curriculum-page">${sectionHeading("培养计划", "", `<div class="button-row"><button class="button button-primary" type="button" data-action="export-curriculum-pdf" ${curriculum.exporting ? "disabled" : ""}>${exportLabel}</button></div>`)}<section class="curriculum-plan-control" aria-labelledby="curriculum-plan-title"><div class="curriculum-plan-control-head"><div><span class="curriculum-plan-kicker">当前培养方案</span><h3 id="curriculum-plan-title">${escapeHtml(plan.name || "未命名培养方案")}</h3></div><button class="button button-primary" type="button" data-action="refresh-curriculum">刷新方案</button></div><label class="curriculum-plan-select-label" for="curriculumPlanSelect">选择方案<select id="curriculumPlanSelect">${planOptions || `<option value="">未读取到方案</option>`}</select></label><p class="curriculum-plan-meta">${escapeHtml(planMeta)}</p><p class="curriculum-refresh-hint ${hasSuspiciousPlan ? "is-warning" : ""}" role="note"><strong>刷新提示</strong>${escapeHtml(refreshHint)}</p></section>${curriculumProgressOverviewMarkup(plan, progressMap)}${curriculumRequirementOverviewMarkup(groups, plan, { progressMap, controlsMarkup: filterMarkup })}${curriculum.error ? `<p class="schedule-note curriculum-inline-error">${escapeHtml(curriculum.error)}；下面仍展示已读取到的课程和课组字段。</p>` : ""}${curriculumCourseDetailMarkup(curriculum.courseDetail)}</div>`;
}

function normalizeScoreStatus(raw) {
  const value = displayValue(valueOf(raw, ["SFJG_DISPLAY", "SFJG", "passStatus", "pass", "status"]), "");
  if (!value) return "";
  if (["1", "true", "yes", "y", "是", "通过", "合格", "及格", "pass"].includes(value.toLowerCase())) return "已通过";
  if (["0", "false", "no", "n", "否", "不通过", "不及格", "fail"].includes(value.toLowerCase())) return "未通过";
  return value;
}

function mapScore(raw) {
  return {
    name: displayValue(valueOf(raw, ["KCM", "KCMC", "KCMC_DISPLAY", "KCM_DISPLAY", "courseName", "course", "COURSE_NAME", "COURSE_NAME_DISPLAY", "name"])),
    code: displayValue(valueOf(raw, ["KCH", "KCHM", "KCDM", "KCH_DISPLAY", "KCDM_DISPLAY", "courseNo", "courseCode", "COURSE_CODE", "COURSE_CODE_DISPLAY", "code"])),
    credit: displayValue(valueOf(raw, ["XF", "XKXF", "KCBKXF", "COURSE_CREDIT", "COURSE_CREDIT_DISPLAY", "credit", "credits", "CREDIT", "学分"])),
    score: displayValue(valueOf(raw, ["XSZCJ", "ZCJ", "score", "totalScore", "CJSZ"])),
    gpa: displayValue(valueOf(raw, ["JD", "gpa", "gradePoint", "XFJD", "绩点"])),
    term: displayValue(valueOf(raw, ["XNXQDM_DISPLAY", "XNXQMC", "term", "HXXXQ", "earnedTerm", "XNXQDM"])),
    category: displayValue(valueOf(raw, ["KCLBDM_DISPLAY", "KCLBMC", "KCLB", "KCLB_DISPLAY", "courseType", "category"])),
    nature: displayValue(valueOf(raw, ["KCXZDM_DISPLAY", "KCXZMC", "KCXZDM", "KCXZ", "KCXZ_DISPLAY", "courseNature", "nature"])),
    generalCategory: displayValue(valueOf(raw, ["XGXKLBDM_DISPLAY", "XGXKLBDM", "XGXKLBDM_MC", "XGXKLBDM_NAME", "generalElectiveCategory", "generalCategory"])),
    examType: displayValue(valueOf(raw, ["KSLXDM_DISPLAY", "KSLXMC", "KSLXDM", "KSLX", "examType", "exam"])),
    retake: displayValue(valueOf(raw, ["CXCKDM_DISPLAY", "CXCKDM", "retakeStatus", "retake"])),
    status: normalizeScoreStatus(raw),
    detailId: displayValue(valueOf(raw, ["WID", "wid", "scoreId", "id"]), ""),
    raw
  };
}

function scoreRowDeduplicationKey(raw = {}, index = 0) {
  // 通用 id 可能只是课程行、分页或接口包装对象的 ID，不代表唯一成绩尝试。
  // 只有明确的成绩明细标识才可以直接作为唯一键。
  const explicit = displayValue(valueOf(raw, ["WID", "wid", "scoreId", "detailId"], ""), "");
  if (explicit) return `id:${curriculumComparableText(explicit)}`;
  const parts = [
    valueOf(raw, ["KCH", "KCHM", "KCDM", "courseNo", "courseCode", "code"], ""),
    valueOf(raw, ["XNXQDM", "XNXQMC", "termCode", "term"], ""),
    valueOf(raw, ["KCM", "KCMC", "courseName", "course", "name"], ""),
    valueOf(raw, ["XF", "XKXF", "KCBKXF", "credit", "credits"], ""),
    valueOf(raw, ["XSZCJ", "ZCJ", "score", "totalScore", "CJSZ"], ""),
    valueOf(raw, ["JD", "gpa", "gradePoint", "XFJD"], ""),
    valueOf(raw, ["SFJG_DISPLAY", "SFJG", "passStatus", "pass", "status"], ""),
    valueOf(raw, ["CXCKDM_DISPLAY", "CXCKDM", "retakeStatus", "retake"], "")
  ].map((value) => curriculumComparableText(value));
  return parts.some(Boolean) ? `attempt:${parts.join("|")}` : `row:${index}`;
}

// GPA 计算保持历史语义：同一 WID，或同一课程号 + 学期 + 课程名，只算一行。
// 这和培养方案的成绩尝试归并刻意分开，避免补考/重修影响培养方案判断的同时，
// 又把同一门课重复计入 GPA。
function dedupeGpaRows(rows = []) {
  const unique = new Map();
  (Array.isArray(rows) ? rows : []).forEach((raw, index) => {
    const explicit = displayValue(valueOf(raw, ["WID", "wid"]), "");
    const fallback = [
      valueOf(raw, ["KCH", "courseNo"], ""),
      valueOf(raw, ["XNXQDM", "termCode"], ""),
      valueOf(raw, ["KCM", "courseName"], "")
    ].join("|");
    const key = explicit || fallback || `row:${index}`;
    if (!unique.has(key)) unique.set(key, raw);
  });
  return [...unique.values()];
}

function mergeScoreRows(rows = []) {
  const merged = new Map();
  (Array.isArray(rows) ? rows : []).forEach((raw, index) => {
    const mapped = mapScore(raw);
    const key = scoreRowDeduplicationKey(raw, index);
    if (key && !merged.has(key)) merged.set(key, mapped);
  });
  return [...merged.values()];
}

function curriculumComparableText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[（）()【】\[\]{}<>《》\s_\-—–·•:：,，.。/\\]/g, "")
    .trim();
}

function curriculumCourseType(course = {}) {
  const text = [course.required, course.nature, course.category, course.groupName]
    .filter(Boolean)
    .join(" ");
  if (/必修/.test(text)) return "required";
  if (/选修/.test(text)) return "elective";
  return "";
}

function curriculumScorePassedForCredit(score = {}) {
  const rawPass = String(valueOf(score.raw, ["SFJG_DISPLAY", "SFJG", "passStatus", "pass", "status"], "") ?? "").trim().toLowerCase();
  const scoreText = String(score.score ?? "").trim();
  const statusText = String(score.status ?? "").trim();
  const negativeText = [rawPass, scoreText, statusText].join(" ").toLowerCase();
  if (/不及格|不通过|不合格|未通过|挂科|缺考|缓考|未考|fail|absent/.test(negativeText)) return false;
  if (["1", "true", "yes", "y", "是", "通过", "合格", "及格", "pass", "优秀", "优", "良好", "良", "中等", "中"].includes(rawPass)) return true;
  if (["已通过", "通过", "合格", "及格", "优秀", "优", "良好", "良", "中等", "中"].includes(statusText)) return true;
  if (["通过", "合格", "及格", "优秀", "优", "良好", "良", "中等", "中"].includes(scoreText) || /^(优秀|优|良好|良|中等|中|合格|及格|通过)[（(]/.test(scoreText)) return true;
  const numericScore = numericValue(scoreText);
  return numericScore !== null && numericScore >= 60;
}

function curriculumScoreMatchType(course = {}, score = {}) {
  const courseCode = curriculumComparableText(course.code);
  const scoreCode = curriculumComparableText(score.code);
  if (courseCode && scoreCode && courseCode === scoreCode) return "课程号";

  const courseName = curriculumComparableText(course.name);
  const scoreName = curriculumComparableText(score.name);
  if (!courseName || !scoreName) return "";
  const exactName = courseName === scoreName;
  const closeName = courseName.length >= 4 && scoreName.length >= 4 && (courseName.includes(scoreName) || scoreName.includes(courseName));
  if (!exactName && !closeName) return "";

  const courseType = curriculumCourseType(course);
  const scoreText = [score.category, score.nature, score.generalCategory].filter(Boolean).join(" ");
  const scoreType = /必修/.test(scoreText) ? "required" : /选修/.test(scoreText) ? "elective" : "";
  if (courseType && scoreType && courseType !== scoreType) return "";
  return exactName ? "课程名" : "课程名近似";
}

function curriculumScoreKey(score = {}, index = 0) {
  const explicit = curriculumComparableText(score.detailId || valueOf(score.raw, ["WID", "wid", "scoreId", "id"], ""));
  if (explicit) return `id:${explicit}`;
  const parts = [score.code, score.term, score.name, score.credit, score.score]
    .map((value) => curriculumComparableText(value))
    .filter(Boolean);
  return parts.length ? `row:${parts.join("|")}` : `row:${index}`;
}

// 培养方案只关心“一门逻辑课程”的完成情况，而成绩接口会把初修、补考、
// 重修分别返回。课程号是最可靠的身份；只有成绩没有课程号时才用课程名兜底。
// 这套身份归并只用于培养方案，不改变成绩页对原始成绩记录的展示。
function curriculumScoreLogicalKey(score = {}) {
  const code = curriculumComparableText(score.code);
  if (code) return `code:${code}`;
  const name = curriculumComparableText(score.name);
  return name ? `name:${name}` : "";
}

function curriculumScoreComparableValue(score = {}) {
  const text = String(score.score ?? "").trim();
  const direct = numericValue(text);
  if (direct !== null) return { value: direct, comparable: true };
  const embedded = text.match(/(^|[^0-9])([0-9]+(?:\.[0-9]+)?)(?=\s*(?:分|（|\(|$))/);
  if (embedded) return { value: Number(embedded[2]), comparable: true };
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const labels = [
    ["优秀", 100], ["优", 95], ["良好", 85], ["良", 80],
    ["中等", 75], ["中", 75], ["及格", 60], ["合格", 60], ["通过", 60], ["pass", 60]
  ];
  const label = labels.find(([name]) => normalized === name || normalized.startsWith(`${name}（`) || normalized.startsWith(`${name}(`));
  if (label) return { value: label[1], comparable: true };
  const gpa = numericValue(score.gpa);
  return gpa === null ? { value: null, comparable: false } : { value: gpa, comparable: false };
}

function curriculumScoreRank(score = {}) {
  const comparable = curriculumScoreComparableValue(score);
  const gpa = numericValue(score.gpa);
  return [
    curriculumScorePassedForCredit(score) ? 1 : 0,
    comparable.comparable ? 1 : 0,
    comparable.value === null ? -1 : comparable.value,
    gpa === null ? -1 : gpa,
    curriculumScoreCredit(score)
  ];
}

function curriculumCompareScores(left = {}, right = {}) {
  const leftRank = curriculumScoreRank(left);
  const rightRank = curriculumScoreRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] - rightRank[index];
  }
  return 0;
}

function curriculumBestScore(scores = []) {
  const list = Array.isArray(scores) ? scores.filter(Boolean) : [];
  if (!list.length) return null;
  const passed = list.filter((score) => curriculumScorePassedForCredit(score));
  const candidates = passed.length ? passed : list;
  return candidates.reduce((best, score) => (!best || curriculumCompareScores(score, best) > 0 ? score : best), null);
}

function curriculumScoreGroups(scores = []) {
  const codedGroups = new Map();
  const nameOnlyGroups = new Map();
  const groups = [];
  const createGroup = (key, score) => {
    const group = { key, scores: [], names: new Set() };
    groups.push(group);
    if (score.name) group.names.add(curriculumComparableText(score.name));
    return group;
  };

  (Array.isArray(scores) ? scores : []).forEach((score, index) => {
    const code = curriculumComparableText(score?.code);
    const name = curriculumComparableText(score?.name);
    let group = code ? codedGroups.get(code) : name ? nameOnlyGroups.get(name) : null;
    if (!group) group = createGroup(code ? `code:${code}` : name ? `name:${name}` : `row:${curriculumScoreKey(score, index)}`, score || {});
    group.scores.push(score);
    if (name) group.names.add(name);
    if (code) codedGroups.set(code, group);
    else if (name) nameOnlyGroups.set(name, group);
  });

  // 无课程号的成绩可以并入唯一同名课程号组；如果同名但存在多个不同课程号，
  // 继续保留名称组，避免错误地把两门同名课程合成一门。
  for (const [name, nameGroup] of nameOnlyGroups) {
    const matches = [...codedGroups.values()].filter((group, index, list) => (
      group.names.has(name) && list.indexOf(group) === index
    ));
    if (matches.length !== 1) continue;
    const target = matches[0];
    target.scores.push(...nameGroup.scores);
    const index = groups.indexOf(nameGroup);
    if (index >= 0) groups.splice(index, 1);
  }
  return groups;
}

function curriculumScoreText(score = {}) {
  return [
    score.name,
    score.category,
    score.nature,
    score.generalCategory,
    ...Object.values(score.raw || {})
  ].filter((value) => value !== undefined && value !== null).join(" ");
}

function curriculumScoreIsGeneralElective(score = {}) {
  const text = curriculumScoreText(score).replace(/\s+/g, "");
  return /通识/.test(text) && /选修/.test(text);
}

function curriculumGroupGeneralElectivePriority(group = {}) {
  const text = [
    group.name,
    group.category,
    group.path,
    group.kind,
    ...Object.values(group.raw || {})
  ].filter((value) => value !== undefined && value !== null).join(" ").replace(/\s+/g, "");
  if (/通识选修/.test(text)) return 3;
  if (/通识(?:教育)?(?:课程)?模块/.test(text) && (numericValue(group.electiveCredits) !== null || /选修/.test(text))) return 2;
  if (/通识/.test(text) && /选修/.test(text)) return 2;
  return 0;
}

function curriculumScoreCredit(score = {}) {
  return curriculumCreditNumber(score.credit);
}

function curriculumGeneralElectiveLabels(values = []) {
  const labels = new Set();
  values.flatMap((value) => Array.isArray(value) ? value : [value]).forEach((value) => {
    const raw = curriculumComparableText(value);
    if (!raw) return;
    labels.add(raw);
    const reduced = raw
      .replace(/通识教育|通识|课程模块|课程|选修课|选修|模块|类别|类/g, "")
      .trim();
    if (reduced.length >= 2) labels.add(reduced);
  });
  return [...labels];
}

function curriculumGeneralElectiveScoreLabels(score = {}) {
  return curriculumGeneralElectiveLabels([
    score.generalCategory,
    valueOf(score.raw, ["XGXKLBDM_DISPLAY", "XGXKLBDM", "XGXKLBDM_MC", "XGXKLBDM_NAME", "generalElectiveCategory", "generalCategory"], ""),
    score.category,
    score.nature
  ]);
}

function curriculumGeneralElectiveGroupLabels(group = {}) {
  return curriculumGeneralElectiveLabels([
    group.name,
    group.category,
    group.path,
    group.kind,
    valueOf(group.raw, ["XGXKLBDM_DISPLAY", "XGXKLBDM", "XGXKLBDM_MC", "XGXKLBDM_NAME", "generalElectiveCategory", "generalCategory"], "")
  ]);
}

function curriculumGeneralElectiveLabelsMatch(group = {}, score = {}) {
  const canonicalLabel = (label) => label.replace(/通识教育|通识|课程模块|课程|选修课|选修|模块|类别|类/g, "").trim();
  const isSpecificLabel = (label) => label.length >= 2 || /^[0-9一二三四五六七八九十A-Za-z]+$/.test(label);
  const groupLabels = curriculumGeneralElectiveGroupLabels(group).map(canonicalLabel).filter(isSpecificLabel);
  const scoreLabels = curriculumGeneralElectiveScoreLabels(score).map(canonicalLabel).filter(isSpecificLabel);
  if (!groupLabels.length || !scoreLabels.length) return false;
  const sharedChineseCount = (left, right) => {
    const rightChars = new Set([...right].filter((char) => /[\u4e00-\u9fff]/.test(char)));
    return [...new Set([...left].filter((char) => /[\u4e00-\u9fff]/.test(char)))].filter((char) => rightChars.has(char)).length;
  };
  return groupLabels.some((groupLabel) => scoreLabels.some((scoreLabel) => {
    if (groupLabel.includes(scoreLabel) || scoreLabel.includes(groupLabel)) return true;
    const shorter = groupLabel.length <= scoreLabel.length ? groupLabel : scoreLabel;
    const overlap = sharedChineseCount(groupLabel, scoreLabel);
    return shorter.length >= 3 && overlap >= Math.max(2, Math.ceil(shorter.length * 0.5));
  }));
}

function curriculumCategoryFallbackRecords(groups = [], concreteCourses = []) {
  const scoreGroups = curriculumScoreGroups(state.data.allScores || [])
    .map((group, index) => {
      const isGeneralElective = group.scores.some((score) => curriculumScoreIsGeneralElective(score));
      const eligible = isGeneralElective
        ? group.scores.filter((score) => curriculumScorePassedForCredit(score) && curriculumScoreCredit(score) > 0)
        : [];
      return { ...group, index, eligible, score: curriculumBestScore(eligible) };
    })
    .filter((group) => group.score);
  if (!scoreGroups.length) return new Map();

  // 如果培养方案本身列出了具体的通识选修课程，优先按课程号/课程名匹配，
  // 这里只接管原系统只返回“通识选修课/通识教育模块”学分要求、没有课程行的情况。
  const concreteMatches = new Set();
  scoreGroups.forEach((group) => {
    if (concreteCourses.some((course) => curriculumCourseCompletion(course, group.scores).earned)) {
      concreteMatches.add(group.key);
    }
  });

  const candidates = groups
    .map((group, index) => ({ group, index, priority: curriculumGroupGeneralElectivePriority(group) }))
    .filter((item) => item.priority > 0)
    .sort((left, right) => right.priority - left.priority || String(right.group.path || "").length - String(left.group.path || "").length || left.index - right.index);
  if (!candidates.length) return new Map();
  const recordsByGroup = new Map();
  scoreGroups
    .filter((group) => !concreteMatches.has(group.key))
    .forEach(({ score }) => {
      const matchingCandidates = candidates.filter((candidate) => curriculumGeneralElectiveLabelsMatch(candidate.group, score));
      const target = matchingCandidates[0] || candidates[0];
      const categoryLabel = score.generalCategory || valueOf(score.raw, ["XGXKLBDM_DISPLAY", "XGXKLBDM", "generalElectiveCategory", "generalCategory"], "");
      const course = {
        name: score.name || "通识选修课程",
        code: score.code || "",
        credit: score.credit,
        category: [score.category || "通识选修课", categoryLabel].filter(Boolean).join(" · "),
        nature: score.nature || "选修",
        required: "选修",
        semester: score.term || "",
        groupId: target.group.id || "",
        groupName: target.group.name || "通识选修课",
        raw: { ...(score.raw || {}), __curriculumCategoryFallback: true, __curriculumCategoryFallbackScore: score }
      };
      const key = curriculumGroupIdentity(target.group);
      if (!recordsByGroup.has(key)) recordsByGroup.set(key, []);
      recordsByGroup.get(key).push({
        course,
        completion: { earned: true, score, matchType: "通识选修类别" },
        categoryFallback: true
      });
    });
  return recordsByGroup;
}

function curriculumCourseCompletion(course = {}, scores = state.data.allScores) {
  const matches = curriculumScoreGroups(scores).map((group) => {
    const matchedScores = group.scores.filter((score) => curriculumScoreMatchType(course, score));
    if (!matchedScores.length) return null;
    const bestScore = curriculumBestScore(matchedScores);
    const matchType = matchedScores
      .map((score) => curriculumScoreMatchType(course, score))
      .sort((left, right) => {
        const rank = (value) => value === "课程号" ? 3 : value === "课程名" ? 2 : 1;
        return rank(right) - rank(left);
      })[0] || "";
    return { earned: matchedScores.some((score) => curriculumScorePassedForCredit(score)), score: bestScore, matchType };
  }).filter(Boolean);
  matches.sort((left, right) => {
    const rank = (value) => value === "课程号" ? 3 : value === "课程名" ? 2 : 1;
    return rank(right.matchType) - rank(left.matchType) || curriculumCompareScores(right.score, left.score);
  });
  const match = matches[0] || null;
  return {
    earned: Boolean(match?.earned),
    score: match?.score || null,
    matchType: match?.matchType || ""
  };
}

function curriculumCreditNumber(value) {
  const number = numericValue(value);
  return number !== null && number > 0 ? number : 0;
}

function curriculumRequirementCredit(value) {
  const number = numericValue(value);
  return number === null ? null : Math.max(number, 0);
}

function curriculumCappedCredit(value, target = null) {
  const amount = curriculumCreditNumber(value);
  const limit = curriculumRequirementCredit(target);
  return limit === null ? amount : Math.min(amount, limit);
}

function curriculumRemainingCredit(target, earned) {
  const required = curriculumRequirementCredit(target);
  if (required === null) return null;
  return Math.max(required - curriculumCappedCredit(earned), 0);
}

function formatCurriculumCredit(value) {
  const number = numericValue(value);
  if (number === null) return displayValue(value, "—");
  return String(Number(number.toFixed(2)));
}

function mapExam(raw) {
  const description = displayValue(valueOf(raw, ["examTimeDescription", "examTimeDesc", "KSSJMS", "timeDescription"]), "");
  const descriptionInfo = parseExamTimeDescription(description);
  const dateInfo = parseExamDate(valueOf(raw, ["examDate", "KSRQ", "examTime", "date"])) || descriptionInfo.date;
  const start = normalizeExamTime(valueOf(raw, ["startTime", "KSSJ", "beginTime", "start"])) || descriptionInfo.start;
  const end = normalizeExamTime(valueOf(raw, ["endTime", "JSSJ", "finishTime", "end"])) || descriptionInfo.end;
  const weekday = descriptionInfo.weekday || weekdayForExamDate(dateInfo);
  const session = descriptionInfo.session;
  const rawStatus = displayValue(valueOf(raw, ["examStatus", "KSZT", "status"]), "");
  const status = examStatusLabel(raw, dateInfo?.dateKey || "");
  const sortTime = start ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) : 0;
  return {
    name: displayValue(valueOf(raw, ["courseName", "KCM", "KCMC", "course", "name"])),
    code: displayValue(valueOf(raw, ["courseNo", "KCH", "KCHM", "courseCode", "code"])),
    date: formatExamDate(dateInfo, weekday),
    dateKey: dateInfo?.dateKey || "",
    dateDay: dateInfo?.day || "",
    dateMonth: dateInfo?.month || "",
    weekday,
    start: start || "时间待发布",
    end: end || "",
    time: start && end ? `${start}–${end}` : description || "时间待发布",
    session,
    place: displayValue(valueOf(raw, ["examPlace", "KCDMC", "JASMC", "place", "room", "location", "classDateAndPlace"])),
    seat: displayValue(valueOf(raw, ["examSeatNo", "seatNo", "seatNumber", "seat"]), ""),
    teacher: displayValue(valueOf(raw, ["teachers", "teacherName", "teacher", "SKJS"]), ""),
    type: displayValue(valueOf(raw, ["examTypeName", "examType", "KSLXDM_DISPLAY", "KSLXMC", "KSLX", "type"])),
    status,
    statusCode: rawStatus,
    countdown: examCountdown({ dateKey: dateInfo?.dateKey || "" }),
    sortKey: dateInfo ? dateInfo.timestamp + sortTime * 60000 : 0,
    raw
  };
}

function parseCourseText(value) {
  const text = displayValue(value, "");
  if (!text) return { weeks: "", weekday: "", section: "", time: "", location: "", teacher: "" };
  const normalized = text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const dayMatch = normalized.match(/(?:星期|周)(日|天|一|二|三|四|五|六|七|[0-7])/);
  const sectionMatches = [...normalized.matchAll(/第?\s*([0-9一二三四五六七八九十]+)(?:\s*[-~至]\s*([0-9一二三四五六七八九十]+))?\s*节/g)];
  const weekMatches = [...normalized.matchAll(/(?:第\s*)?([0-9一二三四五六七八九十]+(?:\s*[-~至]\s*[0-9一二三四五六七八九十]+)?)\s*周/g)];
  const locationMatch = normalized.match(/((?:[\u4e00-\u9fffA-Za-z0-9（）()\-]+校区)(?:\s+[^\n；;|]+)?|(?:线上|网络平台|网络教学平台)(?:\s+[^\n；;|]+)?)/);
  const locationPart = locationMatch?.[1]?.trim() || normalized
    .split(/[\n；;|]/)
    .map((part) => part.trim())
    .find((part) => /校区|教室|楼|室|房间|实验室|机\d+|大成\d+|逸\d+|线上|网络平台/.test(part)) || "";
  const weeks = [...new Set(weekMatches.map((match) => `${match[1].replace(/\s+/g, "")}周`))].join("、");
  const weekday = dayMatch ? dayMatch[1] : "";
  const section = [...new Set(sectionMatches.map((match) => `第${match[1]}${match[2] ? `-${match[2]}` : ""}节`))].join("、");
  const teacherMatch = normalized.match(/周\s*([^\n；;|]*?)\s+(?=(?:[^\s,，;；|]+校区|线上|网络平台))/);
  const teacher = teacherMatch?.[1]?.trim() || "";
  return { weeks, weekday, section, time: [weeks, weekday ? `星期${weekday}` : "", section].filter(Boolean).join(" "), location: locationPart, teacher };
}

function formatWeeksValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/周/.test(text) && !/[,，、;；]/.test(text)) return text;
  const parts = text.replace(/[，、;；]/g, ",").split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^\d+$/.test(part))) return text;
  const weeks = [...new Set(parts.map(Number).filter((week) => week > 0))].sort((left, right) => left - right);
  if (!weeks.length) return text;
  const ranges = [];
  let start = weeks[0];
  let end = weeks[0];
  weeks.slice(1).forEach((week) => {
    if (week === end + 1) {
      end = week;
      return;
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = week;
    end = week;
  });
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return `${ranges.join("、")}周`;
}

function normalizeWeekday(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const named = text.match(/(?:星期|周)(日|天|一|二|三|四|五|六|七|[0-7])/);
  if (named) {
    const day = named[1];
    return `星期${/[0-7]/.test(day) ? ({ 0: "日", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日" }[day] || day) : ({ 日: "日", 天: "日", 一: "一", 二: "二", 三: "三", 四: "四", 五: "五", 六: "六", 七: "日" }[day] || day)}`;
  }
  if (/^[0-7]$/.test(text)) return `星期${({ 0: "日", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日" }[text])}`;
  if (/^[日天一二三四五六七]$/.test(text)) {
    return `星期${({ 日: "日", 天: "日", 一: "一", 二: "二", 三: "三", 四: "四", 五: "五", 六: "六", 七: "日" }[text])}`;
  }
  return text;
}

function normalizeSection(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/节/.test(text)) return text;
  const match = text.match(/([0-9一二三四五六七八九十]+)\s*[-~至]\s*([0-9一二三四五六七八九十]+)/);
  if (match) return `第${match[1]}-${match[2]}节`;
  if (/^[0-9一二三四五六七八九十]+$/.test(text)) return `第${text}节`;
  return text;
}

function hasDisplayValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim() !== "—";
}

function cleanTeacherText(value) {
  const text = String(value ?? "").replace(/\[[^\]]*\]/g, "").trim();
  if (!text || /^[-—]$/.test(text)) return "";
  // 实验课网格在没有教师时会把“实验班 / 节次”写在教师占位字段：[]/ 1 3-4。
  // 这不是教师姓名，不能让它出现在课表卡片和课程详情里。
  if (/\d+\s*周[^\n；;|]*\/\s*\d+/.test(text)) return "";
  if (/\/\s*\d+\s+\d+(?:\s*[-~至]\s*\d+)?(?:\s*[·.]\s*)?$/.test(text)) return "";
  if (/^\s*\/\s*\d+(?:\s+\d+(?:\s*[-~至]\s*\d+)?)?\s*$/.test(text)) return "";
  if (/^\s*\d+(?:\s+\d+(?:\s*[-~至]\s*\d+)?)?\s*$/.test(text)) return "";
  return text;
}

function rawTextValue(raw, keys) {
  if (!raw || typeof raw !== "object") return "";
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      const texts = value.map((item) => {
        if (item && typeof item === "object") return valueOf(item, ["text", "value", "label", "name"], "");
        return item;
      }).map((item) => String(item ?? "").trim()).filter(Boolean);
      const scheduleTexts = texts.filter((item) => /(?:第\s*)?[0-9一二三四五六七八九十]+(?:\s*[-~至]\s*[0-9一二三四五六七八九十]+)?\s*周/.test(item));
      if (scheduleTexts.length) return scheduleTexts.join("、");
      if (texts.length) return texts.join("、");
      continue;
    }
    if (value && typeof value === "object") {
      const text = valueOf(value, ["text", "value", "label", "name"], "");
      if (hasDisplayValue(text)) return text;
      continue;
    }
    if (hasDisplayValue(value)) return String(value);
  }
  return "";
}

function rawScheduleText(raw) {
  return scheduleDetailCandidates(raw).join("、");
}

const SCHEDULE_DETAIL_KEYS = [
  "YPSJDD", "KCSJDD", "SKSJDD", "classDateAndPlace", "classInfo", "scheduleInfo", "timePlace", "schedule",
  "cellDetail", "titleWeekTeacherClassroomDetail", "titleDetail", "cellWeekTeacherClassroomDetail", "cellDetailText"
];

const SCHEDULE_LOCATION_ALIASES = ["JASMC", "SKDD", "JAS", "roomName", "classroomName", "room", "place", "placeName", "location", "locationName", "address"];

function isCompoundScheduleSource(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const hasWeek = /(?:第\s*)?[0-9一二两三四五六七八九十百]+(?:\s*[-~至—–－]\s*[0-9一二两三四五六七八九十百]+)?\s*周/.test(text);
  const hasWeekday = /(?:星期|周)(?:日|天|一|二|三|四|五|六|七|[0-7])/.test(text);
  const hasSection = /第?\s*[0-9一二三四五六七八九十]+\s*(?:[-~至]\s*第?\s*[0-9一二三四五六七八九十]+\s*)?节/.test(text);
  // 地点字段中的普通“南湖校区 教307”不能变成排课源；原系统复合串
  // 至少要带周次并出现斜杠结构，或同时带星期和节次。
  return hasWeek && (text.includes("/") || (hasWeekday && hasSection));
}

function scheduleDetailValueTexts(value, depth = 0) {
  if (depth > 5 || value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => scheduleDetailValueTexts(item, depth + 1));
  if (typeof value === "object") {
    const direct = valueOf(value, ["text", "value", "label", "name", "detail", "description"], "");
    if (hasDisplayValue(direct)) return [String(direct).trim()];
    return Object.values(value).flatMap((child) => scheduleDetailValueTexts(child, depth + 1));
  }
  const text = String(value).replace(/\r/g, "").trim();
  return text ? [text] : [];
}

function scheduleDetailTexts(raw) {
  if (!raw || typeof raw !== "object") return [];
  const values = [];
  SCHEDULE_DETAIL_KEYS.forEach((key) => {
    scheduleDetailValueTexts(raw[key]).forEach((text) => {
      if (!values.includes(text)) values.push(text);
    });
  });
  // 部分个人课表接口把完整“周次/星期/节次/教师/地点”串放在 JASMC、
  // SKDD 或 location 中。只有明确看起来像复合排课串时才提升为 source，
  // 避免普通教室字段污染 rawScheduleText。
  SCHEDULE_LOCATION_ALIASES.forEach((key) => {
    scheduleDetailValueTexts(raw[key]).filter(isCompoundScheduleSource).forEach((text) => {
      if (!values.includes(text)) values.push(text);
    });
  });
  return values;
}

function courseAssessmentTextFromRaw(raw) {
  if (!raw || typeof raw !== "object") return "";
  const keys = [
    "YPSJDD", "KCSJDD", "SKSJDD", "classDateAndPlace", "classInfo", "scheduleInfo", "timePlace", "schedule",
    "cellDetail", "titleWeekTeacherClassroomDetail", "titleDetail", "cellWeekTeacherClassroomDetail", "cellDetailText"
  ];
  const texts = [];
  keys.forEach((key) => {
    const value = raw[key];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const text = item && typeof item === "object"
          ? valueOf(item, ["text", "value", "label", "name"], "")
          : item;
        if (hasDisplayValue(text)) texts.push(String(text));
      });
    } else if (value && typeof value === "object") {
      const text = valueOf(value, ["text", "value", "label", "name"], "");
      if (hasDisplayValue(text)) texts.push(String(text));
    } else if (hasDisplayValue(value)) {
      texts.push(String(value));
    }
  });
  const match = texts.join(" ").match(/考查|考察|考试|闭卷|开卷|机考|笔试/);
  return match ? match[0] : "";
}

function normalizeCourseAssessment(value) {
  const text = displayValue(value, "").trim();
  if (!text || /^[-—]$/.test(text)) return "";
  if (/考查|考察/.test(text)) return "考察课";
  if (/考试|闭卷|开卷|机考|笔试/.test(text)) return "考试课";
  return text;
}

function normalizeCourseRequirement(value) {
  const text = displayValue(value, "").trim();
  if (!text || /^[-—]$/.test(text)) return "";
  if (/选修/.test(text)) return "选修";
  if (/必修/.test(text)) return "必修";
  return text;
}

function courseAssessmentValue(course) {
  return normalizeCourseAssessment(course?.assessment || course?.examType);
}

function courseRequirementValue(course) {
  return normalizeCourseRequirement(course?.requirement || course?.nature);
}

function courseCategoryValue(course) {
  const value = displayValue(course?.category, "").trim();
  return value && !/^[-—]$/.test(value) ? value : "";
}

function courseCatalogCodeValue(course) {
  const catalogCode = displayValue(course?.catalogCode, "").trim();
  const teachingCode = displayValue(course?.code, "").trim();
  return catalogCode && catalogCode !== teachingCode ? catalogCode : "";
}

function courseIncludedEntries(course) {
  const sportEntries = Array.isArray(course?.sportProjects) ? course.sportProjects.filter(Boolean) : [];
  if (sportEntries.length) return sportEntries;
  const entries = Array.isArray(course?.includedCourses) ? course.includedCourses.filter(Boolean) : [];
  if (entries.length) return entries;
  if (!courseIsSport(course)) return [];

  // 原系统有些体育网格卡片只返回当前教学班，没有 multiCourseTitleDetail；
  // 仍把当前体育课程整理成一条明细，确保课程代码和授课教师不会丢失。
  return [{
    name: displayValue(course?.name, "体育课程"),
    catalogCode: courseCatalogCodeValue(course),
    teachingCode: displayValue(course?.code, ""),
    teacher: displayValue(course?.teacher, ""),
    location: displayValue(course?.location, ""),
    weeks: displayValue(course?.weeks, ""),
    weekday: displayValue(course?.weekday, ""),
    section: courseSectionLabel(course),
    text: ""
  }];
}

function normalizedScheduleCourses(rows) {
  return (rows || []).map((row) => row?.raw ? row : mapCourse(row));
}

function personalScheduleRows(rows = state.data.courses) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const detailRows = Array.isArray(state.data.scheduleDetail) ? state.data.scheduleDetail : [];
  // 没有独立明细时，列表仍可能包含未排课记录；只把能识别星期的
  // 列表行作为临时网格来源，课程记录本身仍由 state.data.courses 展示。
  if (!detailRows.length) return sourceRows.filter(hasSchedulePlacement);
  const allowedIndexes = new Set(sourceRows
    .map((course) => state.data.courses.indexOf(course))
    .filter((index) => index >= 0));
  return detailRows.filter((course) => {
    // 个人课程列表会包含“未安排上课次”的记录；它们没有星期，不能
    // 被当成一条网格排课，也不应计入“网格 N 条排课”的统计。
    if (courseDayIndex(course) < 0) return false;
    if (Number.isInteger(course?.sourceCourseIndex)) return allowedIndexes.has(course.sourceCourseIndex);
    return sourceRows.some((source) => courseIdentityMatches(source, course));
  });
}

function courseFieldAvailability(rows, scope = "personal") {
  const courses = normalizedScheduleCourses(rows);
  const allScheduleScope = String(scope).startsWith("all");
  return {
    assessment: courses.some((course) => Boolean(courseAssessmentValue(course))),
    requirement: courses.some((course) => Boolean(courseRequirementValue(course))),
    category: allScheduleScope && courses.some((course) => Boolean(courseCategoryValue(course)))
  };
}

function curriculumLinkedAssessment(raw) {
  const code = displayValue(valueOf(raw, ["KCH", "KCHM", "KCDM", "courseCode", "courseNo", "code"]), "");
  const name = displayValue(valueOf(raw, ["KCMC", "KCM", "courseName", "course", "name"]), "");
  const rows = [...(state.data.allScores || []), ...(state.data.scores || [])];
  const match = rows.find((row) => {
    if (code && row.code && curriculumComparableText(row.code) === curriculumComparableText(code)) return true;
    return !code && name && row.name && curriculumComparableText(row.name) === curriculumComparableText(name);
  });
  return normalizeCourseAssessment(match?.examType || match?.raw?.KSLXMC || match?.raw?.KSLXDM_DISPLAY || "");
}

function courseAssessmentLabel(course) {
  return courseAssessmentValue(course) || "考核方式待发布";
}

function courseRequirementLabel(course) {
  return courseRequirementValue(course)
    || (/选修/.test(String(course?.category || "")) ? "选修" : "课程性质待发布");
}

function courseIsSport(course) {
  const raw = course?.raw && typeof course.raw === "object" ? course.raw : {};
  const source = [
    course?.name,
    course?.category,
    course?.nature,
    course?.assessment,
    course?.detail,
    raw.courseName,
    raw.KCM,
    raw.KCMC
  ].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ");
  return /体育|体测|体育素养/.test(source);
}

function normalizeIncludedCourseEntry(value, depth = 0) {
  if (depth > 4 || value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeIncludedCourseEntry(item, depth + 1));
  if (typeof value !== "object") {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text ? [{ text }] : [];
  }

  const name = displayValue(valueOf(value, ["courseName", "KCM", "KCMC", "name", "title"], ""), "");
  const catalogCode = displayValue(valueOf(value, ["courseCode", "courseCatalogCode", "KCH", "KCHM", "KCDM"], ""), "");
  const teachingCode = displayValue(valueOf(value, ["teachClassId", "teachClassCode", "classCode", "courseNo", "code"], ""), "");
  const weeksRaw = valueOf(value, ["weeks", "week", "SKZC", "ZC", "classWeek", "weekRange"], "");
  const weekdayRaw = valueOf(value, ["weekday", "weekDay", "SKXQ_DISPLAY", "SKXQMC", "SKXQ", "XQJ", "dayOfWeek"], "");
  const sectionRaw = valueOf(value, ["section", "sectionName", "JC", "JCDM", "JCS", "period", "lesson"], "");
  const detailText = displayValue(valueOf(value, ["text", "detail", "titleDetail", "description", "label"], ""), "");
  const teacher = cleanTeacherText(valueOf(value, ["teacherName", "SKJS", "teacher", "teacherNames", "授课教师"], ""));
  const location = displayValue(valueOf(value, ["classroom", "JASMC", "SKDD", "roomName", "place", "location", "locationName"], ""), "");
  const weeks = canonicalWeeksText(weeksRaw) || displayValue(weeksRaw, "");
  const weekday = normalizeWeekday(displayValue(weekdayRaw, ""));
  const section = normalizeSection(displayValue(sectionRaw, ""));
  const hasStructuredFields = [name, catalogCode, teachingCode, teacher, location, weeks, weekday, section].some(Boolean);
  if (hasStructuredFields || detailText) {
    return [{ name, catalogCode, teachingCode, teacher, location, weeks, weekday, section, text: detailText }];
  }

  return Object.values(value).flatMap((child) => normalizeIncludedCourseEntry(child, depth + 1));
}

function rawIncludedCourseDetails(raw) {
  if (!raw || typeof raw !== "object") return [];
  const keys = [
    "multiCourseTitleDetail",
    "multiCourseDetails",
    "multiCourseList",
    "includedCourses",
    "subCourses",
    "courseDetails"
  ];
  const entries = keys.flatMap((key) => normalizeIncludedCourseEntry(raw[key]));
  const seen = new Set();
  return entries.filter((entry) => {
    const signature = [
      entry.name,
      entry.catalogCode,
      entry.teachingCode,
      entry.teacher,
      entry.location,
      entry.weeks,
      entry.weekday,
      entry.section,
      entry.text
    ].map((value) => String(value ?? "").trim()).join("|");
    if (!signature || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).slice(0, 32);
}

function sportProjectRows(payload) {
  const collection = findPagedCourseCollection(payload);
  if (collection?.rows?.length) return collection.rows;
  return rowsOf(payload).filter((row) => hasDisplayValue(row?.TYXMDM_DISPLAY) || hasDisplayValue(row?.JXBID));
}

function sportTeacherText(raw) {
  const scheduleText = [
    valueOf(raw, ["SKJSSJ", "weekTeacher", "teacherSchedule"], ""),
    valueOf(raw, ["YPSJDD", "scheduleResult", "排课结果"], "")
  ].filter(hasDisplayValue).map((value) => displayValue(value, "")).join(" ");
  const labeledTeachers = [...scheduleText.matchAll(/([^/；;|,，\s]+)\s*\[(?:主讲|辅导|任课|教师)\]/g)]
    .map((match) => cleanTeacherText(match[1]))
    .filter(Boolean);
  const fallback = cleanTeacherText(valueOf(raw, ["SKJS", "teacherName", "teacher", "teacherNames"], ""));
  return [...new Set([...labeledTeachers, fallback].filter(Boolean))].join("、");
}

function mapSportProject(raw) {
  const scheduleResult = displayValue(valueOf(raw, ["YPSJDD", "scheduleResult", "排课结果"], ""), "");
  const teacherSchedule = displayValue(valueOf(raw, ["SKJSSJ", "weekTeacher", "teacherSchedule"], ""), "");
  const scheduleText = [scheduleResult, teacherSchedule].filter(Boolean).join(" ");
  const parsed = parseCourseText(scheduleText);
  const weeksRaw = valueOf(raw, ["SKZC", "ZC", "weeks", "week", "classWeek", "weekRange"], "");
  const weekdayRaw = valueOf(raw, ["SKXQ_DISPLAY", "SKXQMC", "SKXQ", "XQJ", "weekday", "weekDay"], "");
  const sectionRaw = valueOf(raw, ["JC", "JCDM", "JCS", "section", "period", "lesson"], "");
  const location = displayValue(valueOf(raw, ["SKDD", "JASMC", "JASMC_DISPLAY", "room", "classroom", "place", "location"], ""), "") || parsed.location;
  const campus = displayValue(valueOf(raw, ["XXXQDM_DISPLAY", "XXXQDM", "campusName", "campus"], ""), "");
  // 体育“列表”里的周次/教师串比单独的周次字段更完整；优先使用它，
  // 同时由 parseCourseText 去重，避免同一条排课在两个字段中出现两次。
  const weeks = canonicalWeeksText(parsed.weeks) || canonicalWeeksText(displayValue(weeksRaw, ""));
  const parsedWeekday = parsed.weekday && /^[日天一二三四五六七]$/.test(parsed.weekday)
    ? normalizeWeekday(`星期${parsed.weekday}`)
    : normalizeWeekday(parsed.weekday);
  const sectionRange = scheduleText.match(/第?\s*([0-9一二三四五六七八九十]+)\s*节\s*[-~至]\s*第?\s*([0-9一二三四五六七八九十]+)\s*节/);
  const parsedSection = sectionRange
    ? canonicalSectionText(`${sectionRange[1]}-${sectionRange[2]}`)
    : canonicalSectionText(parsed.section);
  const weekday = normalizeWeekday(displayValue(weekdayRaw, "")) || parsedWeekday;
  const section = canonicalSectionText(displayValue(sectionRaw, "")) || parsedSection;
  const name = displayValue(valueOf(raw, ["KCM", "KCMC", "courseName", "course", "name"], "体育课程"), "体育课程");
  const project = displayValue(valueOf(raw, ["TYXMDM_DISPLAY", "projectName", "project", "项目名称"], ""), "");
  const catalogCode = displayValue(valueOf(raw, ["KCH", "courseCode", "courseCatalogCode"], ""), "");
  const teachingCode = displayValue(valueOf(raw, ["JXBID", "teachClassId", "teachClassCode", "classCode", "KXH"], ""), "");
  const assessment = normalizeCourseAssessment(valueOf(raw, ["KSLXDM_DISPLAY", "KSLXMC", "KSLXDM", "KSLX", "assessment"], ""));
  const requirement = normalizeCourseRequirement(valueOf(raw, ["KCXZDM_DISPLAY", "KCXZMC", "KCXZDM", "KCXZ", "requirement"], ""));
  const category = displayValue(valueOf(raw, ["KCLBDM_DISPLAY", "KCLBMC", "KCLB", "category"], ""), "");
  const teacher = sportTeacherText(raw) || parsed.teacher;
  const place = [location, campus].filter((value, index, values) => value && values.indexOf(value) === index).join(" ");
  return {
    name,
    project,
    projectCode: displayValue(valueOf(raw, ["TYXMDM", "projectCode"], ""), ""),
    catalogCode,
    teachingCode,
    sequence: displayValue(valueOf(raw, ["KXH", "sequence"], ""), ""),
    teacher,
    teacherSchedule,
    scheduleResult,
    location: place,
    campus,
    weeks,
    weekday,
    section,
    time: [weeks, weekday, section].filter(Boolean).join(" "),
    text: [scheduleResult, teacherSchedule, place].filter(Boolean).join(" · "),
    category,
    requirement,
    assessment,
    credit: displayValue(valueOf(raw, ["XF", "credit"], ""), ""),
    capacity: displayValue(valueOf(raw, ["KRL", "capacity"], ""), ""),
    enrolled: displayValue(valueOf(raw, ["XKRS", "enrolled"], ""), ""),
    targets: displayValue(valueOf(raw, ["SKBJ", "classTarget", "targets"], ""), ""),
    raw
  };
}

function sportProjectIdsFromValue(value) {
  return [...new Set(String(value ?? "").match(/[A-Z]\d{5,}/g) || [])];
}

function sportProjectIdsFromRaw(raw) {
  const ids = new Set();
  const visit = (value, key = "", depth = 0) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey, depth + 1));
      return;
    }
    if (/(?:JXBID|JXBIDS|teachClassId|teachClassCode|classCode|teachingClass)/i.test(key)) {
      sportProjectIdsFromValue(value).forEach((id) => ids.add(id));
    }
  };
  visit(raw);
  return [...ids];
}

function sportProjectTeachingIds(course, scope = "personal") {
  const rows = scope === "all-detail"
    ? (state.allDetail?.courses || []).filter(courseIsSport)
    : [course];
  const ids = new Set();
  [...rows, course].forEach((row) => {
    sportProjectIdsFromRaw(row?.raw).forEach((id) => ids.add(id));
  });
  if (!ids.size) {
    sportProjectIdsFromValue(course?.code).forEach((id) => ids.add(id));
  }
  return [...ids];
}

function sportProjectTargetHints(course, scope = "personal") {
  const raw = course?.raw && typeof course.raw === "object" ? course.raw : {};
  const detail = scope === "all-detail" ? state.allDetail : null;
  const personalSportRows = scope === "personal"
    ? (state.data.courses || []).filter(courseIsSport)
    : [];
  const personalTargets = personalSportRows.flatMap((row) => {
    const rowRaw = row?.raw && typeof row.raw === "object" ? row.raw : {};
    return [
      valueOf(rowRaw, ["SKBJ", "BJMC", "className", "classTarget", "targetClass", "上课对象"], ""),
      valueOf(rowRaw, ["BJDM", "classCode", "classId", "上课班级代码"], "")
    ];
  });
  const values = [
    detail?.name,
    detail?.code,
    valueOf(raw, ["SKBJ", "BJMC", "className", "classTarget", "targetClass", "上课对象"], ""),
    valueOf(raw, ["BJDM", "classCode", "classId", "上课班级代码"], ""),
    ...personalTargets
  ];
  return [...new Set(values
    .map((value) => displayValue(value, "").replace(/\s+/g, "").trim())
    .filter((value) => value.length >= 2))];
}

function sportProjectTargetText(raw) {
  return displayValue(valueOf(raw, [
    "SKBJ", "classTarget", "targetClass", "targets", "上课对象", "上课班级", "BJMC", "className"
  ], ""), "").replace(/\s+/g, "").trim();
}

function filterSportProjectRowsForScope(rawRows, course, scope = "personal") {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const hints = sportProjectTargetHints(course, scope);
  if (!hints.length) return rows;

  const targetedRows = rows.filter((raw) => {
    const targetText = sportProjectTargetText(raw);
    return targetText && hints.some((hint) => targetText.includes(hint) || hint.includes(targetText));
  });
  if (targetedRows.length) return targetedRows;

  // 某些返回行没有班级名称，但仍带有当前网格中的教学班号；这是比回退到
  // 全课程号 1365 条记录更可靠的兜底。若两者都没有，再保留原始响应，避免
  // 把“暂无项目”误报成空结果。
  const teachingIds = new Set(sportProjectTeachingIds(course, scope));
  if (teachingIds.size) {
    const teachingRows = rows.filter((raw) => sportProjectIdsFromRaw(raw).some((id) => teachingIds.has(id)));
    if (teachingRows.length) return teachingRows;
  }
  return rows;
}

function applySportProjectMetadata(course, entries) {
  if (!course) return;
  course.sportProjects = entries;
  const first = entries.find(Boolean);
  const firstAssessment = entries.map((entry) => entry.assessment).find(Boolean);
  const firstRequirement = entries.map((entry) => entry.requirement).find(Boolean);
  const firstCategory = entries.map((entry) => entry.category).find(Boolean);
  const firstTeacher = entries.length === 1 ? entries[0].teacher : "";
  const firstPlace = entries.length === 1 ? entries[0].location : "";
  if (!course.assessment && firstAssessment) course.assessment = course.examType = firstAssessment;
  if (!course.requirement && firstRequirement) course.requirement = course.nature = firstRequirement;
  if (!course.category && firstCategory) course.category = firstCategory;
  if (!course.catalogCode && first?.catalogCode) course.catalogCode = first.catalogCode;
  if (!course.teacher && firstTeacher) course.teacher = firstTeacher;
  if (!course.location && firstPlace) course.location = firstPlace;
}

async function loadSportProjectsForCourse(course, scope = "personal") {
  if (!course || !courseIsSport(course)) return;
  const catalogCode = courseCatalogCodeValue(course)
    || displayValue(valueOf(course?.raw, ["KCH", "KCHM", "courseCode", "courseCatalogCode"], ""), "");
  const teachingIds = sportProjectTeachingIds(course, scope);
  const targetHints = sportProjectTargetHints(course, scope);
  // 个人课表卡片已经对应一个具体教学班，直接按 JXBID 读取；全校班级详情
  // 的“体育”卡片则要复现原系统的“列表”弹窗，先按 KCH 取项目，再按 SKBJ
  // 筛到当前班级，否则会把整门体育课的全校项目都展示出来。
  const useTeachingClassFilter = scope === "personal" && teachingIds.length;
  const filterName = useTeachingClassFilter ? "JXBID" : catalogCode ? "KCH" : "JXBID";
  const filterValues = useTeachingClassFilter ? teachingIds : catalogCode ? [catalogCode] : teachingIds;
  if (!filterValues.length) {
    course.sportProjectLoading = false;
    course.sportProjectError = "原系统没有返回体育教学班号，暂时无法读取项目列表。";
    if (state.selectedCourse === course) render();
    return;
  }
  const term = scope === "all-detail" ? allQueryTermCode() : state.termCode;
  const cacheKey = `${term}|${filterName}|${filterValues.slice().sort().join(",")}|${targetHints.slice().sort().join(",")}`;
  const cached = state.sportProjectCache.get(cacheKey);
  if (cached) {
    course.sportProjectLoading = false;
    course.sportProjectError = "";
    applySportProjectMetadata(course, cached);
    if (state.selectedCourse === course) render();
    return;
  }

  const requestToken = ++sportProjectRequestSequence;
  course.sportProjectLoading = true;
  course.sportProjectError = "";
  if (state.selectedCourse === course) render();
  try {
    const querySetting = JSON.stringify([{
      name: filterName,
      value: `,${filterValues.join(",")},`,
      linkOpt: "and",
      builder: "m_value_equal"
    }]);
    const payload = await postSportProjectList({ querySetting });
    const scopedRows = filterSportProjectRowsForScope(sportProjectRows(payload), course, scope);
    const entries = scopedRows
      .map(mapSportProject)
      .filter((entry) => entry.project || entry.teachingCode || entry.teacher || entry.scheduleResult);
    if (!entries.length) throw new ApiError("原系统体育课程列表没有返回可识别的项目");
    state.sportProjectCache.set(cacheKey, entries);
    if (requestToken !== sportProjectRequestSequence) return;
    course.sportProjectError = "";
    applySportProjectMetadata(course, entries);
  } catch (error) {
    if (requestToken !== sportProjectRequestSequence) return;
    course.sportProjectError = error?.message || "体育课程项目列表读取失败";
  } finally {
    if (requestToken !== sportProjectRequestSequence) return;
    course.sportProjectLoading = false;
    if (state.selectedCourse === course) render();
  }
}

function courseTagsMarkup(course, availability = { assessment: true, requirement: true }) {
  const tags = [];
  const assessment = courseAssessmentValue(course);
  const requirement = courseRequirementValue(course);
  if (availability.assessment && assessment) {
    const assessmentClass = /考察/.test(assessment) ? "course-tag-check" : "course-tag-exam";
    tags.push(`<span class="course-info-tag ${assessmentClass}">${escapeHtml(assessment)}</span>`);
  }
  if (availability.requirement && requirement) {
    const requirementClass = /选修/.test(requirement) ? "course-tag-elective" : "course-tag-required";
    tags.push(`<span class="course-info-tag ${requirementClass}">${escapeHtml(requirement)}</span>`);
  }
  const category = courseCategoryValue(course);
  if (availability.category && category) {
    tags.push(`<span class="course-info-tag course-tag-category">类别：${escapeHtml(category)}</span>`);
  }
  return tags.length ? `<span class="course-chip-tags">${tags.join("")}</span>` : "";
}

function mapCourse(raw) {
  const detail = rawScheduleText(raw) || valueOf(raw, ["detail"]);
  const rawWeeks = valueOf(raw, ["weeks", "week", "SKZC", "ZC", "classWeek", "weekRange", "weekNo", "weeksAndTeachers"]);
  const rawWeekday = valueOf(raw, ["weekday", "weekDay", "SKXQ_DISPLAY", "SKXQMC", "SKXQ", "XQJ", "dayOfWeek", "dayIndex", "colIndex", "columnIndex", "day", "weekdayName"]);
  const rawSectionStart = valueOf(raw, ["beginSection", "startSection", "sectionIndex", "rowIndex", "startJc"], "");
  const rawSectionEnd = valueOf(raw, ["endSection", "finishSection", "endJc"], "");
  const rawSectionValue = valueOf(raw, ["section", "sectionName", "JC", "JCDM", "JCS", "JCSJ", "period", "lesson"], "");
  const rawSection = rawSectionStart && rawSectionEnd
    ? `${rawSectionStart}-${rawSectionEnd}`
    : rawSectionValue || rawSectionStart;
  const rawLocation = valueOf(raw, ["classroom", "JASMC", "SKDD", "JAS", "roomName", "classroomName", "room", "place", "placeName", "location", "locationName", "address", "campusName"]);
  const rawTimeStart = valueOf(raw, ["beginTime", "startTime"], "");
  const rawTimeEnd = valueOf(raw, ["endTime", "finishTime"], "");
  const rawTime = valueOf(raw, ["classTime", "SKSJ", "SJ", "time", "scheduleTime"], "")
    || (rawTimeStart && rawTimeEnd ? `${rawTimeStart}-${rawTimeEnd}` : rawTimeStart);
  const rawCategory = valueOf(raw, ["KCLBDM_DISPLAY", "KCLBMC", "KCLB", "KCLB_DISPLAY", "courseCategory", "courseType", "category"]);
  const rawNature = valueOf(raw, ["KCXZDM_DISPLAY", "KCXZMC", "KCXZDM", "KCXZ", "KCXZ_DISPLAY", "XKXZDM", "XKXZMC", "XKXZ", "XXKC", "courseRequirement", "required", "courseNature", "nature", "KCLXMC", "KCLX"]);
  const rawAssessment = valueOf(raw, ["KSLXDM_DISPLAY", "KSLXMC", "KSLXDM", "KSLX", "KSFS_DISPLAY", "KSFSMC", "KSFS", "KHFSDM_DISPLAY", "KHFSMC", "KHFS", "KHLXMC", "KHLX", "assessmentType", "assessment", "examType", "exam"]);
  const scheduleAssessment = courseAssessmentTextFromRaw(raw);
  const detailAssessment = String(detail).match(/考查|考察|考试|闭卷|开卷|机考|笔试/)?.[0] || "";
  const detailRequirement = String(detail).match(/必修|选修/)?.[0] || "";
  // 个人课表常常没有可靠的课程性质字段；课程类别（如“专业基础课”）不能
  // 冒充“必修/选修”，否则导出时会被误判成“专业必修课”。全校课表的
  // KCLB 等类别字段单独保留，由全校课表页面按“课程类别”展示。
  const normalizedNature = normalizeCourseRequirement(rawNature) || detailRequirement;
  const normalizedAssessment = normalizeCourseAssessment(rawAssessment) || normalizeCourseAssessment(scheduleAssessment) || normalizeCourseAssessment(detailAssessment);
  const parsed = parseCourseText([detail, rawWeeks, rawWeekday, rawSection, rawLocation].filter(Boolean).join(" "));
  const rawWeeksText = displayValue(rawWeeks, "");
  const weeksFromRaw = canonicalWeeksText(rawWeeksText) || formatWeeksValue(rawWeeks);
  const weeks = weeksFromRaw || parsed.weeks || rawWeeksText;
  const weekday = normalizeWeekday(displayValue(rawWeekday, parsed.weekday || ""));
  // 部分网格接口把 JC/JCDM 只返回为“起始节次”，完整的“第5-8节”则放在
  // 已排时间地点或 cellDetail 文本里。优先选择能解析出范围的候选，避免把
  // 长课错误地压到第5节这一行。
  const sectionCandidates = [rawSection, parsed.section, detail, rawScheduleText(raw), ...scheduleDetailCandidates(raw)]
    .filter((value) => hasDisplayValue(value));
  const parsedSectionCandidates = sectionCandidates
    .map((value) => ({ value, range: parseSectionRange(value) }))
    .filter((item) => item.range);
  const sectionRange = parsedSectionCandidates.find((item) => item.range.end > item.range.start)?.range
    || parsedSectionCandidates[0]?.range
    || null;
  const sectionCandidate = parsedSectionCandidates.find((item) => item.range.end > item.range.start)?.value
    || parsedSectionCandidates[0]?.value
    || sectionCandidates[0]
    || "";
  const section = sectionRange
    ? sectionRange.start === sectionRange.end
      ? `第${sectionRange.start}节`
      : `第${sectionRange.start}-${sectionRange.end}节`
    : normalizeSection(displayValue(sectionCandidate, ""));
  const rawLocationText = displayValue(rawLocation, "");
  const compoundLocationSource = isCompoundScheduleSource(rawLocationText);
  const firstCompoundSegment = compoundLocationSource
    ? splitScheduleSegments(rawLocationText)[0]
    : "";
  const firstCompoundParsed = firstCompoundSegment
    ? parseScheduleSegment(firstCompoundSegment, { ...parsed, teacher: parsed.teacher || "", location: "" })
    : null;
  // JASMC/SKDD/location 在部分接口中不是教室字段，而是完整复合排课串。
  // 不能把整串写进课程地点；先取首段作为基础值，expandMappedCourse 会
  // 再为每个独立 scheduleDetail 覆盖成各自教室。
  const location = compoundLocationSource
    ? displayValue(firstCompoundParsed?.location, "")
    : displayValue(rawLocation, parsed.location || "");
  const time = displayValue(rawTime, [weeks, weekday, section].filter(Boolean).join(" ") || parsed.time || "");
  const fullDetail = displayValue(detail, [weeks, weekday, section, location].filter(Boolean).join(" "));
  const rawName = displayValue(valueOf(raw, ["courseName", "KCM", "KCMC", "course", "name"]), "");
  const rawCode = displayValue(valueOf(raw, ["teachClassId", "courseSerialNo", "teachClassCode", "classCode", "courseNo", "KCH", "KCHM", "courseCode", "code"]), "");
  const gridTeacher = rawWeeksText.includes("/")
    ? rawWeeksText.split("/").slice(1).join("/").replace(/\[主讲\]/g, "").trim()
    : "";
  const embeddedCode = rawCode || rawName.match(/\b[A-Z]\d{5,}\b/)?.[0] || "";
  const cleanName = embeddedCode && !rawCode ? rawName.replace(new RegExp(`\\s*${embeddedCode}\\s*$`), "").trim() : rawName;
  const explicitTeacher = cleanTeacherText(valueOf(raw, ["teacherName", "SKJS", "teacher", "teacherNames"], ""));
  const inferredTeacher = cleanTeacherText(gridTeacher || parsed.teacher || "");
  const rawCatalogCode = valueOf(raw, ["courseCode", "courseCatalogCode", "KCH", "KCHM", "KCDM"], "");
  const includedCourses = rawIncludedCourseDetails(raw);
  return {
    name: displayValue(cleanName),
    code: displayValue(embeddedCode),
    catalogCode: displayValue(rawCatalogCode, ""),
    teacher: explicitTeacher || inferredTeacher,
    location,
    time,
    weeks,
    weekday,
    section,
    detail: fullDetail,
    category: displayValue(rawCategory, ""),
    nature: normalizedNature,
    requirement: normalizedNature,
    assessment: normalizedAssessment,
    examType: normalizedAssessment,
    credit: displayValue(valueOf(raw, ["credit", "XF", "credits"])),
    includedCourses,
    raw
  };
}

function scheduleDetailCandidates(raw) {
  return scheduleDetailTexts(raw);
}

function splitScheduleSegments(value) {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[，]/g, ",")
    .replace(/[；]/g, ";")
    .replace(/[／]/g, "/")
    .trim();
  if (!text) return [];
  // 分隔符后的“周次开头”表示一个新排课段，但“3-8周、10-13周”
  // 仍是同一段中的不连续周次。后一种写法的分隔符前通常紧挨“周”或
  // “周[理论]”，因此只有前文已经出现斜杠字段，或前文不是一个完整周次
  // 词时才切分。这样可以同时兼容中文逗号、英文逗号、分号和数组拼接结果。
  const isWeekStart = (index) => /^(?:第\s*)?[0-9一二三四五六七八九十百]+(?:\s*[-~至—–－]\s*(?:第\s*)?[0-9一二三四五六七八九十百]+)?\s*周/.test(text.slice(index).trimStart());
  const isWeekdayWithSectionStart = (index) => /^(?:\/?\s*)(?:星期|周)(?:日|天|一|二|三|四|五|六|七|[0-7])\s*\/\s*(?:第?\s*[0-9一二三四五六七八九十百]+\s*(?:[-~至—–－]\s*第?\s*[0-9一二三四五六七八九十百]+\s*)?节)/.test(text.slice(index).trimStart());
  const isSectionStart = (index) => {
    const right = text.slice(index).trimStart().replace(/^\/\s*/, "");
    const firstField = right.split("/")[0].trim();
    return Boolean(firstField && parseSectionRange(firstField));
  };
  const isWeekTokenEnd = (before) => /(?:周\s*(?:[（(]\s*[单双]\s*[）)]|\[[^\]]+\])?)$/.test(before.trim());
  const pieces = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (![",", ";", "、", "|", "\n"].includes(text[index])) continue;
    const weekStart = isWeekStart(index + 1);
    const continuationStart = weekStart || isWeekdayWithSectionStart(index + 1) || isSectionStart(index + 1);
    if (!continuationStart) continue;
    const before = text.slice(start, index).trimEnd();
    const hasSlashFields = before.includes("/");
    if (text[index] === "、" && isWeekTokenEnd(before)) continue;
    // “3-8周、10-13周”是同一段的不连续周次；只有周次开头才需要
    // 这个保护，省略周次的“星期三/第三节”仍应作为新的排课段。
    if (weekStart && isWeekTokenEnd(before) && !hasSlashFields) continue;
    if (before) pieces.push(before);
    start = index + 1;
  }
  pieces.push(text.slice(start).trim());
  return pieces.filter(Boolean);
}

function scheduleSegmentCount(value) {
  return splitScheduleSegments(value).length;
}

function scheduleNumberToArabic(value) {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!text || [...text].some((char) => digits[char] === undefined && char !== "十" && char !== "百")) return 0;
  if (text === "十") return 10;
  const hundred = text.indexOf("百");
  if (hundred >= 0) return (digits[text.slice(0, hundred)] || 1) * 100 + (text.slice(hundred + 1) ? scheduleNumberToArabic(text.slice(hundred + 1)) : 0);
  const ten = text.indexOf("十");
  if (ten >= 0) return (ten ? (digits[text[0]] || 0) * 10 : 10) + (text.slice(ten + 1) ? (digits[text.slice(ten + 1)] || 0) : 0);
  return digits[text] ?? 0;
}

function canonicalWeeksText(value) {
  let normalized = String(value ?? "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[－–—−]/g, "-")
    .replace(/(第?\s*[0-9一二两三四五六七八九十百]+\s*周)\s*(?:至|到)\s*(第?\s*[0-9一二两三四五六七八九十百]+\s*周)/g, (full, left, right) => `${left.replace(/\s+/g, "").replace(/周$/, "")}-${right.replace(/\s+/g, "").replace(/^第/, "").replace(/周$/, "")}周`);
  const matches = [...normalized.matchAll(/(?:第\s*)?([0-9一二两三四五六七八九十百]+(?:\s*[-~至]\s*[0-9一二两三四五六七八九十百]+)?)\s*周\s*(?:[（(]\s*(单|双)\s*[）)])?/g)];
  const output = [];
  matches.forEach((match) => {
    const range = match[1].replace(/\s+/g, "").split(/[-~至]/).map(scheduleNumberToArabic).filter((number) => number > 0);
    if (!range.length) return;
    const text = range.length > 1 ? `${range[0]}-${range[1]}周` : `${range[0]}周`;
    output.push(`${text}${match[2] ? `（${match[2]}）` : ""}`);
  });
  return [...new Set(output)].join("、");
}

function canonicalSectionText(value) {
  const range = parseSectionRange(value);
  if (range) return range.start === range.end ? `第${range.start}节` : `第${range.start}-${range.end}节`;
  return normalizeSection(value);
}

function parseScheduleSegment(segment, baseCourse) {
  const text = String(segment ?? "").replace(/[／]/g, "/").replace(/[，]/g, ",").trim();
  const weeks = canonicalWeeksText(text) || canonicalWeeksText(baseCourse?.weeks) || displayValue(baseCourse?.weeks, "");
  if (!weeks) return null;

  const parts = text.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  const weekdayPart = parts.find((part) => /(?:星期|周)(?:日|天|一|二|三|四|五|六|七|[0-7])/.test(part)) || "";
  const sectionPart = parts.find((part) => parseSectionRange(part)) || "";
  const weekday = normalizeWeekday(weekdayPart);
  const section = canonicalSectionText(sectionPart);
  let teacher = "";
  let location = "";

  // 后续片段可能省略周次或星期，只剩“节次/教师/地点”；只要有明确
  // 的星期或节次锚点，也应按斜杠字段读取教师和教室。
  const structuredSegment = parts.length >= 2 && (weekday || section);
  if (structuredSegment) {
    const sectionIndex = parts.findIndex((part) => part === sectionPart);
    const tail = sectionIndex >= 0 ? parts.slice(sectionIndex + 1) : [];
    if (tail.length) teacher = cleanTeacherText(tail[0]);
    if (tail.length > 1) location = tail.slice(1).join(" / ").replace(/\[[^\]]*\]/g, "").trim();
  }

  const compact = parseCourseText(text);
  // 紧凑格式“4周,12周 李硕 南湖校区 线上”会被通用正则误把“ ,12周”
  // 当成教师前缀；只要基础行已有教师，优先使用结构化教师字段。
  teacher = cleanTeacherText(teacher || baseCourse.teacher || (structuredSegment ? compact.teacher : ""));
  location = location || compact.location || baseCourse.location || "";
  return {
    weeks,
    weekday: weekday || baseCourse.weekday || "",
    section: section || baseCourse.section || "",
    teacher,
    location
  };
}

function expandMappedCourse(course) {
  const candidates = scheduleDetailCandidates(course.raw);
  // 不再只取“段数最多”的一个字段。个人课表常把安排分散在 YPSJDD、
  // cellDetail 数组和旧版 titleDetail 中；候选字段必须全部参与，再按完整
  // 片段签名去重，否则某个接口字段覆盖另一个字段时会静默丢课。
  const segments = [];
  candidates
    .slice()
    .sort((left, right) => scheduleSegmentCount(right) - scheduleSegmentCount(left) || String(right).length - String(left).length)
    .flatMap((candidate) => splitScheduleSegments(candidate))
    .forEach((segment) => {
      if (!segments.includes(segment)) segments.push(segment);
    });
  if (!segments.length) return [course];

  const expanded = segments
    .map((segment) => {
      const parsed = parseScheduleSegment(segment, course);
      if (!parsed) return null;
      return {
        ...course,
        weeks: parsed.weeks || course.weeks,
        weekday: parsed.weekday || course.weekday,
        section: parsed.section || course.section,
        teacher: parsed.teacher || course.teacher,
        location: parsed.location || course.location,
        time: [parsed.weeks, parsed.weekday, parsed.section, extractClockText(course.time)].filter(Boolean).join(" "),
        detail: segment,
        scheduleSegment: segment
      };
    })
    .filter(Boolean);
  if (!expanded.length) return [course];

  const unique = [];
  expanded.forEach((item) => {
    if (!unique.some((existing) => sameCourse(existing, item))) unique.push(item);
  });
  return unique.length ? unique : [course];
}

function expandCourseRows(rows) {
  return rows.flatMap((raw) => expandMappedCourse(mapCourse(raw)));
}

function findGpa(payload, depth = 0) {
  if (depth > 8 || payload === null || payload === undefined) return "—";
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findGpa(item, depth + 1);
      if (found !== "—") return found;
    }
    return "—";
  }
  if (typeof payload !== "object") return "—";
  const value = valueOf(payload, ["ZPJXFJD", "gpa", "GPA", "averageGpa", "pjxfjd"]);
  if (value !== "") return displayValue(value, "—");
  for (const child of Object.values(payload)) {
    const found = findGpa(child, depth + 1);
    if (found !== "—") return found;
  }
  return "—";
}

function numericValue(value) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function studentCohort(studentId) {
  const text = String(studentId ?? "").trim();
  const yearMatch = text.match(/^20(\d{2})/);
  if (yearMatch) return Number(yearMatch[1]);
  const shortMatch = text.match(/^(\d{2})/);
  return shortMatch ? Number(shortMatch[1]) : null;
}

function gpaExclusionReason(row, studentId) {
  const cohort = studentCohort(studentId);
  if (cohort === null || cohort < 25) return "";
  const rawText = Object.values(row?.raw || {}).map((value) => String(value ?? "")).join(" ");
  const text = [row?.name, row?.category, row?.nature, row?.generalCategory, rawText].join(" ");
  if (/通识选修/.test(text)) return "通识选修课";
  if (/二级分制/.test(text)) return "二级分制课程";
  const passFailScore = ["合格", "不合格", "及格", "不及格", "通过", "不通过"].includes(String(row?.score ?? "").trim());
  if (passFailScore) return "二级分制课程";
  return "";
}

function calculateAverageGpa(rawRows, reportedGpa = "—", studentId = "") {
  const mappedRows = rawRows.map(mapScore);
  const cohort = studentCohort(studentId);
  let weightedPoints = 0;
  let totalCredit = 0;
  let included = 0;
  let excluded = 0;
  const excludedRows = [];
  mappedRows.forEach((row) => {
    const exclusionReason = gpaExclusionReason(row, studentId);
    if (exclusionReason) {
      excluded += 1;
      excludedRows.push({ name: row.name, reason: exclusionReason, score: row.score, credit: row.credit, term: row.term });
      return;
    }
    const gpa = numericValue(row.gpa);
    const credit = numericValue(row.credit);
    if (gpa === null || credit === null || credit <= 0) return;
    weightedPoints += gpa * credit;
    totalCredit += credit;
    included += 1;
  });

  const reported = displayValue(reportedGpa, "—");
  const rule = cohort === null
    ? "未读到学号，按接口返回的有绩点课程计算"
    : cohort >= 25
      ? "25级及以后：已排除通识选修和二级分制课程"
      : "24级及以前：全部有绩点课程计入平均绩点";
  const calculated = totalCredit > 0 ? (weightedPoints / totalCredit).toFixed(4) : reported;
  const useNativeTotal = reported !== "—" && (cohort === null || cohort < 25);
  return {
    value: useNativeTotal ? reported : calculated,
    source: useNativeTotal ? "教务系统总平均绩点" : totalCredit > 0 ? "插件按成绩明细计算" : reported !== "—" ? "教务系统接口" : "",
    reported,
    included,
    excluded,
    total: mappedRows.length,
    credit: totalCredit,
    excludedRows,
    rule
  };
}

function mapScoreDetail(payload, row) {
  const candidates = [payload, payload?.data, payload?.result, payload?.data?.data]
    .filter((value) => value && typeof value === "object" && !Array.isArray(value));
  const findSource = (value, depth = 0) => {
    if (depth > 5 || !value || typeof value !== "object" || Array.isArray(value)) return null;
    if (Array.isArray(value.itemScores) || ["score", "pass", "gradePoint"].some((key) => Object.prototype.hasOwnProperty.call(value, key))) return value;
    for (const child of Object.values(value)) {
      const found = findSource(child, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const source = candidates.map((candidate) => findSource(candidate)).find(Boolean) || candidates[0] || {};
  let items = Array.isArray(source.itemScores) ? source.itemScores : rowsOf(source).filter((item) => valueOf(item, ["name", "itemName", "value", "score"], "") !== "");
  if (!items.length && row?.raw) {
    items = [
      { name: "平时成绩", value: valueOf(row.raw, ["PSCJ", "平时成绩"], "") },
      { name: "期中成绩", value: valueOf(row.raw, ["QZCJ", "期中成绩"], "") },
      { name: "期末成绩", value: valueOf(row.raw, ["QMCJ", "期末成绩"], "") }
    ].filter((item) => hasDisplayValue(item.value));
  }
  return {
    score: displayValue(valueOf(source, ["score", "XSZCJ", "ZCJ"]), row?.score || "—"),
    gpa: displayValue(valueOf(source, ["gradePoint", "JD", "gpa"]), row?.gpa || "—"),
    passed: source.pass === true || isTruthyFlag(source.pass) || /通过|合格|及格/i.test(displayValue(valueOf(source, ["pass", "SFJG_DISPLAY"]), "")),
    items: items.map((item) => ({
      name: displayValue(valueOf(item, ["name", "itemName", "title", "label"]), "分项成绩"),
      value: displayValue(valueOf(item, ["value", "score", "itemScore", "result"])),
      code: displayValue(valueOf(item, ["code", "itemCode"]), "")
    }))
  };
}

async function loadFullScores(termCode) {
  const querySetting = JSON.stringify([{
    name: "XNXQDM",
    value: termCode,
    builder: "m_value_equal",
    linkOpt: "AND"
  }]);
  const body = {
    action: "cxwdcj",
    querySetting,
    pageIndex: "1",
    pageSize: "1000"
  };
  let payload;
  try {
    // 原系统成绩表实际请求的是 cxwdcj.do；wdcj.do 只是页面模型地址，直接请求会 404。
    payload = await postScore("modules/wdcj/cxwdcj.do", body);
  } catch {
    payload = await postScoreContext("modules/wdcj/cxwdcj.do", body);
  }
  const rows = rowsOf(payload);
  return rows.length ? rows : null;
}

async function loadAllScoreRows(termCodes) {
  const codes = [...new Set(termCodes.filter(Boolean))];
  const results = await Promise.allSettled(codes.map((code) => loadFullScores(code)));
  const unique = new Map();
  const successfulCodes = [];
  const populatedCodes = [];
  const failedCodes = [];
  results.forEach((result, index) => {
    const code = codes[index];
    if (result.status !== "fulfilled") {
      if (code) failedCodes.push(code);
      return;
    }
    successfulCodes.push(code);
    if (Array.isArray(result.value) && result.value.length) populatedCodes.push(code);
    if (!Array.isArray(result.value)) return;
    result.value.forEach((row) => {
      // 没有 WID 时也必须保留同一课程同一学期的不同成绩尝试；只对
      // 课程、分数、状态等全部一致的重复响应去重，避免补考/重修被吞掉。
      const key = scoreRowDeduplicationKey(row, unique.size);
      if (key && !unique.has(key)) unique.set(key, row);
    });
  });
  return {
    rows: [...unique.values()],
    queriedCodes: codes,
    successfulCodes,
    populatedCodes,
    failedCodes
  };
}

async function loadScoreDetail(wid) {
  const body = { WID: wid };
  try {
    return await postScoreContext("api/wdcj/details.do", body);
  } catch {
    return await postScore("api/wdcj/details.do", body);
  }
}

function extractCourseRows(payload) {
  const candidates = [];
  const seen = new Set();
  const identityKeys = ["courseName", "KCM", "KCMC", "course", "name", "courseNo", "KCH", "KCHM", "courseCode", "code"];
  const scheduleKeys = ["SKZC", "ZC", "SKXQ", "SKXQMC", "XQJ", "JC", "JCDM", "JCS", "SKJS", "JASMC", "SKDD", "YPSJDD", "KCSJDD", "classDateAndPlace", "weekday", "section", "dayIndex", "rowIndex"];
  const scoreRows = (rows) => rows.reduce((total, row) => total + identityKeys.reduce((score, key) => score + (hasDisplayValue(row[key]) ? 1 : 0), 0) + scheduleKeys.reduce((score, key) => score + (hasDisplayValue(row[key]) ? 1.5 : 0), 0), 0) / Math.max(rows.length, 1);
  const visit = (value, depth = 0) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      const rows = value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
      if (rows.length) candidates.push({ rows, score: scoreRows(rows) });
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach((child) => visit(child, depth + 1));
  };
  visit(payload);
  candidates.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return candidates[0]?.rows || rowsOf(payload);
}

function findPagedCourseCollection(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined || typeof value !== "object") return null;
  if (!Array.isArray(value) && Array.isArray(value.rows)) {
    const hasPageInfo = ["totalSize", "total", "totalRows", "totalCount", "pageSize", "pageNumber"].some((key) => hasDisplayValue(value[key]));
    if (hasPageInfo) return value;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findPagedCourseCollection(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const child of Object.values(value)) {
    const found = findPagedCourseCollection(child, depth + 1);
    if (found) return found;
  }
  return null;
}

async function loadAllScheduleList(code, kblx, termCode) {
  const pageSize = 10;
  const baseBody = {
    CODE: code,
    XNXQDM: termCode,
    KBLX: kblx,
    "*order": "+KKDWDM, +KCH, +JXBMC",
    pageSize: String(pageSize)
  };
  const firstPayload = await postAllScheduleList({ ...baseBody, pageNumber: "1" });
  const firstCollection = findPagedCourseCollection(firstPayload);
  const firstRows = firstCollection?.rows || extractCourseRows(firstPayload);
  const totalSize = Number(firstCollection?.totalSize || firstCollection?.total || firstCollection?.totalRows || firstCollection?.totalCount || firstRows.length || 0);
  const actualPageSize = Number(firstCollection?.pageSize) || pageSize;
  const totalPages = Math.max(1, Math.ceil(totalSize / actualPageSize));
  if (totalPages === 1) return { payload: firstPayload, rawRows: firstRows, totalSize };

  const rawRows = [...firstRows];
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const failedPages = [];
  const batchSize = 5;
  for (let start = 0; start < pageNumbers.length; start += batchSize) {
    const batch = pageNumbers.slice(start, start + batchSize);
    const pageResults = await Promise.allSettled(batch.map((pageNumber) => (
      postAllScheduleList({ ...baseBody, pageNumber: String(pageNumber) })
        .then((payload) => ({ payload, collection: findPagedCourseCollection(payload) }))
    )));
    pageResults.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        failedPages.push(batch[index]);
        return;
      }
      const pageRows = result.value.collection?.rows || extractCourseRows(result.value.payload);
      rawRows.push(...pageRows);
    });
  }
  // 原实现会静默忽略失败页，导致详情缺课却仍显示“全部分页”。失败页单独重试一次，
  // 仍失败则明确报错，让外层按其他 KBLX/代码兜底，而不是返回不完整数据。
  const finalFailedPages = [];
  for (const pageNumber of failedPages) {
    try {
      const payload = await postAllScheduleList({ ...baseBody, pageNumber: String(pageNumber) });
      const collection = findPagedCourseCollection(payload);
      rawRows.push(...(collection?.rows || extractCourseRows(payload)));
    } catch {
      finalFailedPages.push(pageNumber);
    }
  }
  if (finalFailedPages.length) throw new ApiError(`课表详情还有第 ${finalFailedPages.join("、")} 页未读取，请重试`);
  return { payload: firstPayload, rawRows, totalSize };
}

async function loadAllSchedulePages(body, typeName, typeAction) {
  const firstPayload = await requestAllSchedulePayload(body, typeName, typeAction);
  const firstCollection = findPagedCourseCollection(firstPayload);
  const firstRows = rowsOf(firstPayload);
  const totalSize = Number(firstCollection?.totalSize || firstCollection?.total || firstCollection?.totalRows || firstCollection?.totalCount || valueOf(firstPayload, ["totalSize", "total", "totalRows", "totalCount"], "") || firstRows.length || 0);
  const pageSize = Number(firstCollection?.pageSize || body.pageSize) || firstRows.length || 10;
  const totalPages = Number(firstCollection?.totalPage || firstCollection?.pageCount || firstCollection?.pages) || Math.max(1, Math.ceil(totalSize / pageSize));
  if (totalPages <= 1) return { payload: firstPayload, rows: firstRows, totalSize, totalPages };

  const rows = [...firstRows];
  const failedPages = [];
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const batchSize = 5;
  for (let start = 0; start < pageNumbers.length; start += batchSize) {
    const batch = pageNumbers.slice(start, start + batchSize);
    const results = await Promise.allSettled(batch.map((pageNumber) => requestAllSchedulePayload({ ...body, pageNumber: String(pageNumber) }, typeName, typeAction)));
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        failedPages.push(batch[index]);
        return;
      }
      rows.push(...rowsOf(result.value));
    });
  }
  if (failedPages.length) throw new ApiError(`全校课表还有第 ${failedPages.join("、")} 页未读取，请重试`);
  return { payload: firstPayload, rows, totalSize, totalPages };
}

function hasGridScheduleData(row) {
  const keys = [
    "SKXQ", "SKXQMC", "XQJ", "JC", "JCDM", "JCS", "SKDD", "JASMC", "YPSJDD", "KCSJDD",
    "classDateAndPlace", "dayIndex", "colIndex", "columnIndex", "rowIndex", "sectionIndex", "startSection",
    "dayOfWeek", "beginSection", "endSection", "beginTime", "endTime", "placeName", "weeksAndTeachers",
    "titleDetail", "titleWeekTeacherClassroomDetail", "cellWeekTeacherClassroomDetail"
  ];
  return keys.some((key) => hasDisplayValue(row?.[key]));
}

function comparableCourseIdentity(value) {
  return String(value ?? "")
    .replace(/[\s,，、;；|/]+/g, "")
    .toLowerCase();
}

function courseIdentityMatches(left, right) {
  const leftName = hasDisplayValue(left?.name) ? comparableCourseIdentity(left.name) : "";
  const rightName = hasDisplayValue(right?.name) ? comparableCourseIdentity(right.name) : "";
  const leftCode = hasDisplayValue(left?.code) ? comparableCourseIdentity(left.code) : "";
  const rightCode = hasDisplayValue(right?.code) ? comparableCourseIdentity(right.code) : "";

  // 课表接口同时存在课程目录号和教学班号；名称一致时，不能因为两种编号不同
  // 就把列表记录和网格记录拆成两条。
  if (leftName && rightName) return leftName === rightName;
  return Boolean(leftCode && rightCode && leftCode === rightCode);
}

function courseScheduleSignature(course) {
  const day = courseDayIndex(course);
  const range = courseSectionRange(course);
  const weeks = [...courseWeekNumbers(course)].sort((left, right) => left - right).join(",");
  return {
    day: day >= 0 ? String(day) : "",
    section: range ? `${range.start}-${range.end}` : "",
    weeks
  };
}

function hasCourseScheduleConflict(left, right) {
  const leftSchedule = courseScheduleSignature(left);
  const rightSchedule = courseScheduleSignature(right);
  if (["day", "section", "weeks"].some((key) => (
    leftSchedule[key] && rightSchedule[key] && leftSchedule[key] !== rightSchedule[key]
  ))) return true;
  const comparableField = (value) => comparableCourseIdentity(value).replace(/校区/g, "");
  const fieldsConflict = (key) => {
    const leftValue = comparableField(left?.[key]);
    const rightValue = comparableField(right?.[key]);
    if (!leftValue || !rightValue || leftValue === rightValue) return false;
    // 一个来源常带“南湖校区 教307”，另一个来源只带“教307”；
    // 只要一方完整包含另一方，仍视为同一排课的补充字段。
    return !leftValue.includes(rightValue) && !rightValue.includes(leftValue);
  };
  return fieldsConflict("location") || fieldsConflict("teacher");
}

// 课程名相同不代表是同一条排课记录。一个课程可能在不同星期、节次或周次重复出现，
// 这些记录必须分别保留，才能正确显示“周二第 1-2 节电路原理”等安排。
function sameCourse(left, right) {
  return courseIdentityMatches(left, right) && !hasCourseScheduleConflict(left, right);
}

function mergeCourseFields(target, source) {
  ["name", "code", "catalogCode", "teacher", "location", "time", "weeks", "weekday", "section", "detail", "credit", "category", "nature", "requirement", "assessment", "examType"].forEach((key) => {
    if (!hasDisplayValue(target[key]) && hasDisplayValue(source[key])) target[key] = source[key];
  });
  const included = [...(Array.isArray(target.includedCourses) ? target.includedCourses : []), ...(Array.isArray(source.includedCourses) ? source.includedCourses : [])];
  const seen = new Set();
  target.includedCourses = included.filter((entry) => {
    const signature = [
      entry?.name,
      entry?.catalogCode,
      entry?.teachingCode,
      entry?.teacher,
      entry?.location,
      entry?.weeks,
      entry?.weekday,
      entry?.section,
      entry?.text
    ].map((value) => String(value ?? "").trim()).join("|");
    if (!signature || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).slice(0, 32);
}

function courseScheduleText(course) {
  const raw = course?.raw;
  return [
    course?.detail,
    ...scheduleDetailCandidates(raw)
  ].filter(Boolean).join(" ");
}

function hasSchedulePlacement(course) {
  return courseDayIndex(course) >= 0;
}

function isAggregateCourseRecord(course) {
  const text = courseScheduleText(course);
  const weekdayCount = (text.match(/(?:星期|周)(?:日|天|一|二|三|四|五|六|七|[0-7])/g) || []).length;
  const sectionCount = (text.match(/第?\s*[0-9一二三四五六七八九十]+(?:\s*[-~至]\s*[0-9一二三四五六七八九十]+)?\s*节/g) || []).length;
  return weekdayCount > 1 || sectionCount > 1;
}

function mergeCourseSources(listRows, gridRows) {
  const listCourses = expandCourseRows(listRows);
  // 网格行自身也可能带有“18周……、1-17周……”这类复合时间地点串；
  // 不能只拆列表接口，否则网格优先时仍会漏掉复合串中的早期周次。
  const gridCourses = expandCourseRows(gridRows);
  if (!gridCourses.length) return listCourses;

  // 先去掉网格接口内部的完全重复行；不同星期/节次/周次的同名课程不会被去重。
  const merged = [];
  gridCourses.forEach((gridCourse) => {
    const target = merged.find((existing) => sameCourse(existing, gridCourse));
    if (target) mergeCourseFields(target, gridCourse);
    else merged.push(gridCourse);
  });

  listCourses.forEach((listCourse) => {
    const target = merged.find((gridCourse) => sameCourse(gridCourse, listCourse));
    if (target) {
      mergeCourseFields(target, listCourse);
      return;
    }

    // 列表接口有时返回一条包含多个星期/节次的汇总记录。网格已经拆成精确的
    // 单条安排时，只把汇总行作为补充来源，不能再渲染成一张重复课程卡片。
    const identityCandidate = merged.find((gridCourse) => courseIdentityMatches(gridCourse, listCourse));
    if (identityCandidate && isAggregateCourseRecord(listCourse)) {
      mergeCourseFields(identityCandidate, listCourse);
      return;
    }
    merged.push(listCourse);
  });
  return merged;
}

// 个人课表要同时保留两种粒度：下方“本学期全部课程记录”是一门课一行，
// 而网格必须是一条排课一张卡片。同一门课可能在周二第 3-4 节和周四第
// 3-4 节各有一条安排，不能为了维持课程行数而把后一个安排吞掉。
function mergePersonalCourseSources(listRows, gridRows) {
  const listCourses = (listRows || []).map((raw) => mapCourse(raw));
  // 列表接口包含完整课程记录，其中可能有“未安排上课次”的课程；网格
  // 接口则是已经排入课表的安排。两边都先拆成单条排课，但只有能识别
  // 星期的记录才进入 scheduleDetail。
  const gridDetailCourses = expandCourseRows(gridRows || []);
  const listDetailCourses = expandCourseRows(listRows || []);
  const scheduledGridCourses = gridDetailCourses.filter(hasSchedulePlacement);
  const scheduledListCourses = listDetailCourses.filter(hasSchedulePlacement);
  // 网格是个人课表的权威来源；列表只为网格没有覆盖到的课程提供回退。
  // 这一步会排除原系统列表中的未排课记录，也不会把同一门课的汇总
  // 时间地点串再拆成一组重复的网格卡片。
  const detailCourses = [
    ...scheduledGridCourses,
    // 只过滤已经被网格完整覆盖的同一排课；不能因为课程身份相同就
    // 丢掉列表里另一星期、另一节次、另一周次或另一教室的安排。
    ...scheduledListCourses.filter((detail) => (
      !scheduledGridCourses.some((gridCourse) => sameCourse(gridCourse, detail))
    ))
  ];
  const courses = [];
  const findIdentityIndex = (course) => courses.findIndex((existing) => courseIdentityMatches(existing, course));

  listCourses.forEach((course) => {
    const index = findIdentityIndex(course);
    if (index >= 0) mergeCourseFields(courses[index], course);
    else courses.push(course);
  });

  const scheduleDetail = [];
  detailCourses.forEach((detail) => {
    let sourceCourseIndex = findIdentityIndex(detail);
    if (sourceCourseIndex < 0) {
      sourceCourseIndex = courses.length;
      courses.push({ ...detail });
    }
    // 列表接口通常有课程类别、学分等元数据，网格接口通常有可靠的
    // 星期/节次；两者都回填到课程卡片和详情中。
    mergeCourseFields(courses[sourceCourseIndex], detail);
    mergeCourseFields(detail, courses[sourceCourseIndex]);
    detail.sourceCourseIndex = sourceCourseIndex;
    const existing = scheduleDetail.find((candidate) => sameCourse(candidate, detail));
    if (existing) {
      mergeCourseFields(existing, detail);
      return;
    }
    scheduleDetail.push(detail);
  });

  return { courses, scheduleDetail };
}

async function loadTermData(requestId = refreshRequestSequence) {
  const termCode = state.termCode;
  if (!termCode) return false;
  state.loading = true;
  state.errors = [];
  state.scoreDetail = null;
  render();

  const allScoreTermCodes = [...new Set(state.terms.map((term) => term.code).filter(Boolean))];
  let cachedTerm = state.personalCache.termSnapshots?.[termCode] || null;

  const results = await Promise.allSettled([
    getHome("student/scores.do", { termCode }),
    loadFullScores(termCode),
    loadAllScoreRows(allScoreTermCodes),
    getScore("api/wdcj/queryPjxfjd.do"),
    getHome("student/exams.do", { termCode }),
    getHome("student/courses.do", { termCode }),
    postNativeScheduleDetail(termCode)
  ]);

  if (requestId !== refreshRequestSequence || state.termCode !== termCode) return false;
  const [scoreResult, fullScoreResult, allScoreResult, gpaResult, examResult, courseResult, scheduleResult] = results;
  const homeScoreRows = scoreResult.status === "fulfilled" ? rowsOf(scoreResult.value) : [];
  const fullScoreRows = fullScoreResult.status === "fulfilled" && Array.isArray(fullScoreResult.value) ? fullScoreResult.value : [];
  const scoreRows = fullScoreRows.length ? fullScoreRows : homeScoreRows;
  const scoreEndpointResolved = scoreResult.status === "fulfilled" || fullScoreResult.status === "fulfilled";
  const examLive = examResult.status === "fulfilled";
  const liveStudentId = [scoreResult, fullScoreResult, allScoreResult, gpaResult, examResult, courseResult, scheduleResult]
    .filter((result) => result.status === "fulfilled")
    .map((result) => findStudentId(result.value))
    .find(Boolean) || "";
  if (liveStudentId && state.personalCache.studentId && liveStudentId !== state.personalCache.studentId) {
    state.personalCache.available = false;
    state.personalCache.termSnapshots = {};
    state.personalCache.allScores = [];
    state.personalCache.scoreDetails = {};
    state.data = emptyPersonalData();
    cachedTerm = null;
  }
  if (liveStudentId) {
    state.studentId = liveStudentId;
    state.personalCache.studentId = liveStudentId;
    await switchLocalScheduleProfile(liveStudentId);
  }

  // 空数组可能只是接口暂时没有把结果页返回完整；已有缓存时不要因为
  // 这种“成功但空”的响应覆盖上一次可用数据。
  const scoreEndpointLive = scoreEndpointResolved && (scoreRows.length > 0 || !cachedTerm?.scores?.length);

  if (scoreEndpointLive) {
    state.data.scores = scoreRows.map(mapScore);
    queueNewScoreReminder(
      termCode,
      state.data.scores,
      cachedTerm && Array.isArray(cachedTerm.scores) ? cachedTerm.scores : null
    );
  } else if (Array.isArray(cachedTerm?.scores)) {
    state.data.scores = cachedTerm.scores;
  }
  const reportedGpa = gpaResult.status === "fulfilled"
    ? findGpa(gpaResult.value)
    : scoreResult.status === "fulfilled" ? findGpa(scoreResult.value) : "—";
  const gpaLive = gpaResult.status === "fulfilled" && (reportedGpa !== "—" || !cachedTerm?.gpaMeta);
  const allScoreBundle = allScoreResult.status === "fulfilled" && allScoreResult.value && typeof allScoreResult.value === "object"
    ? allScoreResult.value
    : { rows: [], queriedCodes: allScoreTermCodes, successfulCodes: [], populatedCodes: [], failedCodes: allScoreTermCodes };
  const allScoreRows = Array.isArray(allScoreBundle.rows) ? allScoreBundle.rows : [];
  // 聚合成绩请求可能返回一个“成功但空数组”的占位响应。已有缓存时，
  // 这种响应不能把完整累计成绩和 GPA 清空；新账号没有缓存时则可以接受为空。
  const allScoresLive = allScoreResult.status === "fulfilled"
    && (allScoreRows.length > 0 || !state.personalCache.allScores.length);
  if (allScoresLive) {
    // allScoreRows 与当前学期 scoreRows 可能同时包含同一课程的不同成绩尝试。
    // 必须沿用成绩尝试级 key，不能退回到课程号+学期+课程名的粗粒度去重。
    state.data.allScores = mergeScoreRows([...allScoreRows, ...scoreRows]);
  } else if (Array.isArray(state.personalCache.allScores)) {
    state.data.allScores = state.personalCache.allScores;
  }
  if (allScoresLive || gpaLive) {
    state.data.gpaMeta = calculateAverageGpa(dedupeGpaRows(allScoreRows), reportedGpa, state.studentId);
    state.data.gpaMeta.scope = "全部已查询学期累计";
    state.data.gpaMeta.termCount = allScoreBundle.queriedCodes?.length || allScoreTermCodes.length;
    state.data.gpaMeta.successfulTermCount = allScoreBundle.successfulCodes?.length || 0;
    state.data.gpaMeta.populatedTermCount = allScoreBundle.populatedCodes?.length || 0;
    state.data.gpaMeta.failedTermCount = allScoreBundle.failedCodes?.length || 0;
    if (state.data.gpaMeta.failedTermCount && state.studentId && studentCohort(state.studentId) >= 25) {
      state.errors.push(`平均绩点有 ${state.data.gpaMeta.failedTermCount} 个学期未读取，当前数值仅基于已成功读取的学期`);
    }
    state.data.gpa = state.data.gpaMeta.value;
  } else if (cachedTerm?.gpaMeta) {
    state.data.gpaMeta = { ...emptyPersonalData().gpaMeta, ...cachedTerm.gpaMeta };
    state.data.gpa = displayValue(cachedTerm.gpa, state.data.gpa || "—");
  }
  const examRows = examResult.status === "fulfilled" ? rowsOf(examResult.value).map(mapExam) : [];
  if (examLive && (examRows.length > 0 || !cachedTerm?.exams?.length)) {
    state.data.exams = examRows;
  } else if (Array.isArray(cachedTerm?.exams)) {
    state.data.exams = cachedTerm.exams;
  }
  const courseRows = courseResult.status === "fulfilled" ? extractCourseRows(courseResult.value) : [];
  const detailRows = scheduleResult.status === "fulfilled" ? extractCourseRows(scheduleResult.value) : [];
  const gridRows = detailRows.filter(hasGridScheduleData);
  const courseEndpointResolved = courseResult.status === "fulfilled" || scheduleResult.status === "fulfilled";
  const courseLive = courseEndpointResolved && (courseRows.length > 0 || gridRows.length > 0 || !cachedTerm?.courses?.length);
  if (courseLive) {
    const personalCourses = mergePersonalCourseSources(courseRows, gridRows);
    state.data.courses = personalCourses.courses;
    state.data.scheduleDetail = personalCourses.scheduleDetail;
    state.data.scheduleSource = gridRows.length ? "网格" : courseRows.length ? "列表" : "无数据";
  } else {
    if (Array.isArray(cachedTerm?.courses)) state.data.courses = cachedTerm.courses;
    if (Array.isArray(cachedTerm?.scheduleDetail)) state.data.scheduleDetail = cachedTerm.scheduleDetail;
    if (cachedTerm?.scheduleSource !== undefined) state.data.scheduleSource = cachedTerm.scheduleSource;
  }

  results.forEach((result, index) => {
    if (result.status === "rejected" && ![1, 2, 3, 6].includes(index)) {
      state.errors.push(result.reason?.message || "部分数据读取失败");
    }
  });
  const liveEndpointCount = [scoreEndpointLive, allScoresLive, gpaLive, examLive, courseLive].filter(Boolean).length;
  const hasLiveData = liveEndpointCount > 0;
  state.personalCache.lastLiveEndpointCount = liveEndpointCount;
  state.loading = false;
  state.connected = hasLiveData;
  if (hasLiveData) {
    state.updatedAt = new Date().toISOString();
    elements.updatedAt.textContent = `更新于 ${cacheDateText(state.updatedAt)}`;
    persistPersonalCache();
  } else if (!state.personalCache.available) {
    throw new ApiError("无法读取教务系统", "个人查询接口均未返回数据");
  }
  render();
  return true;
}

function mapScheduleType(raw) {
  return {
    code: displayValue(valueOf(raw, ["code", "CODE", "itemCode", "DM"]), ""),
    name: displayValue(valueOf(raw, ["name", "NAME", "itemName", "MC"]), "未命名查询"),
    queryAction: displayValue(valueOf(raw, ["queryAction", "QUERYACTION", "query_action", "action"]), ""),
    permission: displayValue(valueOf(raw, ["permission", "PERMISSION", "permissionCode", "QXDM"]), ""),
    raw
  };
}

function selectedScheduleType() {
  return state.scheduleTypes.find((item) => item.code === state.allTypeCode) || state.scheduleTypes[0] || null;
}

function scheduleTypeKind(type = selectedScheduleType()) {
  const name = type?.name || "";
  if (/班级/.test(name)) return "class";
  if (/教师/.test(name)) return "teacher";
  if (/教室/.test(name)) return "room";
  if (/学生/.test(name)) return "student";
  if (/专业方向/.test(name)) return "direction";
  if (/非主修|辅修方案/.test(name)) return "nonMajor";
  if (/教学任务/.test(name)) return "teachingTask";
  if (/课程/.test(name)) return "course";
  if (/专业/.test(name)) return "major";
  return "generic";
}

function normalizedScheduleAction(action) {
  return String(action || "")
    .trim()
    .replace(/^\/+/, "")
    .split("/")
    .pop()
    .replace(/\.do$/i, "");
}

function isSupportedAllScheduleType(type) {
  // getScheduleTypeList.do 还会返回学生、专业、课程等内部报表类型，但原系统
  // 会先用 jwAppConfig.hasPermission 过滤；当前登录账号实际只开放这三种对象列表。
  // 保留动作白名单可以避免把无权限的内部入口渲染出来后再触发一串 403。
  return new Set(["bjlb", "lslb", "jslb"]).has(normalizedScheduleAction(type?.queryAction));
}

function isClassScheduleType(type = selectedScheduleType()) {
  return scheduleTypeKind(type) === "class";
}

function allScheduleAction(type = selectedScheduleType()) {
  const kind = scheduleTypeKind(type);
  // getScheduleTypeList.do 是原系统的权威映射：教室=jslb、教师=lslb、班级=bjlb。
  // 不能按中文名称猜接口后缀，教师和教室的名称/动作恰好不是同名缩写。
  if (kind === "class") return type?.queryAction || "bjlb";
  if (kind === "teacher") return type?.queryAction || "lslb";
  if (kind === "room") return type?.queryAction || "jslb";
  return type?.queryAction || "qxkbcx";
}

async function loadScheduleTypes() {
  state.scheduleTypesLoaded = true;
  state.scheduleTypeError = "";
  try {
    let payload;
    try {
      payload = await getKb("api/qxkbcx/getScheduleTypeList.do");
    } catch (firstError) {
      try {
        payload = await getKbContext("api/qxkbcx/getScheduleTypeList.do");
      } catch {
        payload = await postKb("api/qxkbcx/getScheduleTypeList.do", {});
      }
    }
    const discoveredTypes = rowsOf(payload).map(mapScheduleType).filter((item) => item.code);
    const supportedTypes = discoveredTypes.filter(isSupportedAllScheduleType);
    state.allScheduleHiddenTypes = supportedTypes.length
      ? discoveredTypes.filter((item) => !isSupportedAllScheduleType(item))
      : [];
    state.scheduleTypes = supportedTypes.length ? supportedTypes : discoveredTypes;
    if (!state.scheduleTypes.length) throw new ApiError("没有读取到全校课表类型");
    const classType = state.scheduleTypes.find((item) => scheduleTypeKind(item) === "class");
    state.allTypeCode = classType?.code || state.scheduleTypes[0].code;
  } catch (error) {
    state.scheduleTypeError = error.message || "全校课表类型读取失败";
    state.scheduleTypes = [{ code: "01", name: "全校大课表", queryAction: "cxdyqxdkb", raw: {} }];
    state.allScheduleHiddenTypes = [];
    state.allTypeCode = "01";
  }
  render();
}

function allScheduleQuerySetting(termCode) {
  const filters = [];
  const typeKind = scheduleTypeKind();
  const keyword = state.filters.allKeyword.trim();
  if (typeKind !== "class" && keyword) {
    const keywordField = typeKind === "teacher"
      ? { name: "XM", caption: "教师名" }
      : typeKind === "room"
        ? { name: "JASMC", caption: "教室名称" }
        : { name: "_commonFilter", caption: "关键字" };
    filters.push({
      name: keywordField.name,
      caption: keywordField.caption,
      linkOpt: "AND",
      builderList: "cbl_String",
      builder: "include",
      value: keyword
    });
  }
  const classCodeInput = state.filters.allCode.trim();
  if (typeKind === "class" && classCodeInput) {
    // 用户经常把“自动化”填进班级代码框；中文输入应按班级名称查询，数字才按班级代码查询。
    const field = /[\u3400-\u9fff]/.test(classCodeInput) ? "BJMC" : "CODE";
    filters.push({
      name: field,
      caption: field === "BJMC" ? "班级名称" : "班级代码",
      linkOpt: "AND",
      builderList: "cbl_String",
      builder: "include",
      value: classCodeInput
    });
  }
  if (typeKind === "class" && state.filters.allName.trim()) {
    filters.push({
      name: "BJMC",
      caption: "班级名称",
      linkOpt: "AND",
      builderList: "cbl_String",
      builder: "include",
      value: state.filters.allName.trim()
    });
  }
  // 原系统会把学期同时放进独立字段和 querySetting；缺少这个条件时接口会返回权限校验失败。
  filters.push({ name: "XNXQDM", value: termCode, linkOpt: "AND", builder: "equal" });
  return JSON.stringify(filters);
}

function findPayloadMessage(payload, depth = 0) {
  if (depth > 5 || payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload.trim();
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findPayloadMessage(item, depth + 1);
      if (found && /未发布|尚未|稍后|加载中|暂无|没有排课|没有课表|无数据/.test(found)) return found;
    }
    return "";
  }
  if (typeof payload !== "object") return "";
  const direct = valueOf(payload, ["message", "msg", "tip", "提示", "statusText", "errorMessage", "warning"], "");
  if (direct && /未发布|尚未|稍后|加载中|暂无|没有排课|没有课表|无数据/.test(String(direct))) return String(direct);
  for (const child of Object.values(payload)) {
    const found = findPayloadMessage(child, depth + 1);
    if (found) return found;
  }
  return "";
}

function allScheduleApiPath(queryAction, typeName = "") {
  const action = String(queryAction || "").trim().replace(/^\/+/, "");
  // 动态类型接口返回的 queryAction 是权威映射，优先使用；中文名称仅在旧版接口
  // 没有 queryAction 时作为兼容兜底，避免“教师/教室”等名称变化后请求错端点。
  if (action) {
    if (action.includes("/")) {
      const normalized = action.endsWith(".do") ? action : `${action}.do`;
      return normalized.startsWith("modules/") ? normalized : `modules/${normalized}`;
    }
    if (action.endsWith(".do")) return `modules/qxkbcx/${action}`;
    return `modules/qxkbcx/${action}.do`;
  }
  if (/班级/.test(typeName)) return "modules/qxkbcx/bjlb.do";
  if (/教师/.test(typeName)) return "modules/qxkbcx/lslb.do";
  if (/教室/.test(typeName)) return "modules/qxkbcx/jslb.do";
  return "modules/qxkbcx/bjlb.do";
}

async function requestAllSchedulePayload(body, typeName = "", typeAction = "") {
  // 原系统的全校课表页面入口是 modules/qxkbcx.do，但真正的查询请求会按类型
  // 发到 qxkbcx/bjlb.do（班级）、qxkbcx/lslb.do（教师）或 qxkbcx/jslb.do（教室）。
  // 原系统表格的 emap-app-name 是 kbbpapp，因此按应用标记优先查询 kbbpapp，
  // 再兼容 kbapp 和 *default 上下文；只有拿到可解析的课程数组才停止尝试。
  const path = allScheduleApiPath(typeAction, typeName);
  const roots = [KB_API_ROOT, KB_CONTEXT_ROOT, KBBP_API_ROOT, KBBP_CONTEXT_ROOT];
  let emptyPayload = null;
  let lastError = null;
  for (const root of roots) {
    try {
      const payload = await requestJson(webVpnApiUrl(root, path), {
        method: "POST",
        body,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        includeFetchApi: false,
        timeoutMs: ALL_SCHEDULE_REQUEST_TIMEOUT
      });
      if (rowsOf(payload).length) return payload;
      if (!emptyPayload) emptyPayload = payload;
    } catch (error) {
      lastError = error;
    }
  }
  if (emptyPayload) return emptyPayload;
  throw lastError || new ApiError("全校课表接口请求失败");
}

function isAllSchedulePermissionError(error) {
  return Number(error?.status) === 403
    || /(?:HTTP\s*)?403|没有权限|无权限/.test(`${error?.message || ""} ${error?.details || ""}`);
}

async function queryAllSchedule() {
  const type = state.scheduleTypes.find((item) => item.code === state.allTypeCode) || state.scheduleTypes[0];
  if (!type) return;
  const requestId = ++allScheduleRequestSequence;
  allScheduleDetailRequestSequence += 1;
  const termCode = allQueryTermCode();
  if (!termCode) {
    state.allError = "还没有选择课表学期";
    render();
    return;
  }
  if (state.allScheduleHiddenTypes.length && !isSupportedAllScheduleType(type)) {
    state.allError = "当前登录账号没有该查询类型的权限，请选择原系统开放的班级、教师或教室课表";
    state.allRetrying = false;
    render();
    return;
  }
  state.allError = "";
  state.allPendingMessage = "";
  state.allRows = [];
  state.allPage = 1;
  state.allDetail = null;
  state.courseTransfer.selectionMode = false;
  state.courseTransfer.selectionScope = "";
  state.courseTransfer.selectedKeys.clear();
  clearCourseTransferModal();
  state.selectedCourse = null;
  state.allAttempt = 0;
  state.allRetrying = true;
  render();
  const body = {
    XNXQDM: termCode,
    querySetting: allScheduleQuerySetting(termCode),
    pageSize: "10",
    pageNumber: "1"
  };
  let lastError = null;
  for (let attempt = 1; attempt <= ALL_SCHEDULE_RETRY_LIMIT; attempt += 1) {
    if (requestId !== allScheduleRequestSequence) return;
    state.allAttempt = attempt;
    render();
    try {
      const pageResult = await loadAllSchedulePages(body, type.name, allScheduleAction(type));
      if (requestId !== allScheduleRequestSequence) return;
      const payload = pageResult.payload;
      state.allRows = pageResult.rows;
      state.allTotal = pageResult.totalSize ? String(pageResult.totalSize) : displayValue(valueOf(payload, ["total", "totalRows", "totalCount"]), "");
      if (state.allRows.length) break;
      const responseMessage = findPayloadMessage(payload) || displayValue(valueOf(payload, ["message", "msg", "tip", "提示", "statusText"]), "");
      if (/未发布|尚未|稍后|加载中|暂无|没有排课|没有课表|无数据/.test(responseMessage)) state.allPendingMessage = responseMessage;
      lastError = new ApiError(responseMessage || "课表接口暂时没有返回记录");
    } catch (error) {
      if (requestId !== allScheduleRequestSequence) return;
      lastError = error;
    }
    if (isAllSchedulePermissionError(lastError)) break;
    if (attempt < ALL_SCHEDULE_RETRY_LIMIT) {
      await new Promise((resolve) => setTimeout(resolve, ALL_SCHEDULE_RETRY_DELAY));
      if (requestId !== allScheduleRequestSequence) return;
    }
  }
  if (requestId !== allScheduleRequestSequence) return;
  if (!state.allRows.length) state.allError = lastError?.message || "全校课表查询失败";
  state.allRetrying = false;
  render();
}

function setConnection(text, type) {
  elements.connection.textContent = text;
  elements.connection.className = `connection is-${type}`;
}

function showToast(text = "", type = "success", category = "default") {
  if (!elements.toastRegion) return;
  if (!text) {
    window.clearTimeout(toastTimer);
    elements.toastRegion.replaceChildren();
    return;
  }
  // 关闭开关后完全隐藏底部 Toast，包括缓存、刷新和登录状态提示。
  // category 保留用于兼容已有调用方，但不再绕过此开关。
  if (!toastNotificationsEnabled()) {
    window.clearTimeout(toastTimer);
    elements.toastRegion.replaceChildren();
    return;
  }
  window.clearTimeout(toastTimer);
  const toast = document.createElement("div");
  toast.className = `toast toast-${type || "info"}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = text;
  elements.toastRegion.replaceChildren(toast);
  const duration = type === "error" ? 5600 : type === "info" ? 4200 : 3200;
  toastTimer = window.setTimeout(() => {
    if (toast.parentElement === elements.toastRegion) elements.toastRegion.replaceChildren();
  }, duration);
}

function setNotice(text = "", type = "", category = "default") {
  if (elements.notice) {
    elements.notice.textContent = "";
    elements.notice.className = "notice";
  }
  showToast(text, type || "info", category);
}

function numberOrDash(value) {
  return value ? String(value) : "—";
}

function statCard(label, value, meta, tone) {
  return `<article class="stat-card ${tone}"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-meta">${escapeHtml(meta)}</div></article>`;
}

function actionCard(title, copy, action, tone = "blue") {
  return `<article class="action-card"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div><button class="button button-soft ${tone}" type="button" data-action="${escapeHtml(action)}">立即查看</button></article>`;
}

function sectionHeading(title, copy, action = "") {
  const pageTitle = { overview: "总览", personal: "课表", exams: "考试", scores: "成绩", all: "全校课表", curriculum: "培养计划", settings: "设置" }[state.view];
  if (pageTitle === title) return action ? `<div class="section-heading section-heading-context">${action}</div>` : "";
  return `<div class="section-heading"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div>${action}</div>`;
}

function emptyCard(title, copy, action = "") {
  return `<div class="empty-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${action}</div>`;
}

function loadingCard(copy = "正在读取教务接口…") {
  return `<div class="loading-card"><div><div class="spinner"></div><div>${escapeHtml(copy)}</div></div></div>`;
}

function renderAcademicTermPicker() {
  const options = state.terms.length
    ? state.terms.map((term) => `<option value="${escapeHtml(term.code)}" ${term.code === state.termCode ? "selected" : ""}>${escapeHtml(term.name)}</option>`).join("")
    : `<option value="">正在读取当前学期…</option>`;
  return `<div class="academic-term-picker"><label><span>查询学期</span><select data-term-select ${state.terms.length ? "" : "disabled"}>${options}</select></label><button class="button button-ghost button-small" type="button" data-action="refresh">刷新所选学期</button></div>`;
}

function renderSectionUtilities(action = "") {
  // 成绩、考试和个人课表共用主工具栏里的学期选择；页面底部不再重复放置
  // 同一控件，避免用户为了切换上下滚动。
  return action ? `<div class="section-utilities"><div class="section-utility-actions">${action}</div></div>` : "";
}

function renderCurriculumPortalGuide() {
  return "";
}

function curriculumErrorNeedsLogin(error = "") {
  return /没有找到已打开的教务系统页面|没有检测到有效的教务系统登录状态|未登录|登录状态|会话已失效|请先登录原系统|cookie/i.test(String(error));
}

function curriculumBootstrapTitle(status) {
  return {
    preparing: "正在准备培养计划…",
    checking: "正在检查教务系统登录状态…",
    opening: "正在进入培养方案…",
    reading: "正在读取培养计划…",
    organizing: "正在整理课程与学分要求…"
  }[status] || "正在准备培养计划…";
}

function renderCurriculumBootstrapState() {
  const bootstrap = state.curriculum.bootstrap || {};
  const status = bootstrap.status || (state.curriculum.error ? "failed" : "idle");
  if (CURRICULUM_BOOTSTRAP_ACTIVE_STATUSES.has(status) || bootstrap.reading) {
    const title = curriculumBootstrapTitle(status);
    return `<section class="curriculum-bootstrap-card" aria-live="polite"><div class="curriculum-bootstrap-progress"><span class="curriculum-bootstrap-kicker">培养计划</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(bootstrap.message || title)}</p></div><div class="curriculum-bootstrap-actions"><span class="curriculum-bootstrap-spinner" aria-hidden="true"></span><button class="button button-primary" type="button" disabled>请稍候</button></div></section>`;
  }
  if (status === "login-required") {
    return `<section class="curriculum-error-state curriculum-login-state" role="status" aria-live="polite"><h3>登录已过期</h3><p>请在刚刚打开的学校页面完成登录。登录成功后，插件会自动继续读取培养计划。</p><div class="curriculum-error-actions"><button class="button button-primary" type="button" disabled>正在等待登录…</button><button class="button button-ghost" type="button" data-action="start-curriculum-bootstrap">重新检查登录状态</button></div></section>`;
  }
  return renderCurriculumFailure(bootstrap.error || state.curriculum.error, status);
}

function renderCurriculumFailure(error = "", status = "idle") {
  const failed = status === "failed" || Boolean(error);
  const title = failed ? "自动进入培养方案失败" : "培养计划需要连接学校教务系统";
  const copy = failed
    ? "请重试；如果自动进入仍不成功，请打开教务系统后按“培养 → 培养方案”进入，保持页面打开再重试。"
    : "插件会自动打开教务系统并进入培养方案。若登录已过期，只需要完成一次学校账号登录，之后会自动继续读取。";
  const details = error ? `<details class="curriculum-error-details"><summary>查看详情</summary><p>${escapeHtml(error)}</p></details>` : "";
  return `<section class="curriculum-error-state" role="alert"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${details}<div class="curriculum-error-actions"><button class="button button-primary" type="button" data-action="start-curriculum-bootstrap">自动打开并读取培养计划</button><button class="button button-ghost" type="button" data-action="open-portal">打开教务系统</button></div></section>`;
}

function overviewClockMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function overviewDateLabel(date = new Date()) {
  const normalized = localDateOnly(date);
  const info = academicDayInfo(normalized);
  return {
    date: `${normalized.getMonth() + 1}月${normalized.getDate()}日`,
    weekday: SUNDAY_FIRST_DAY_NAMES[normalized.getDay()],
    week: info.week ? `第${info.week}周` : "教学周未设置",
    weekNumber: info.week
  };
}

function overviewClockRange(course) {
  const range = localScheduleClockRange(course);
  return {
    ...range,
    text: range.startText && range.endText ? `${range.startText}-${range.endText}` : range.startText || ""
  };
}

function overviewCourseTime(course) {
  const range = overviewClockRange(course);
  if (range.text) return range.text.replace("-", "–");
  return [course?.weekday, courseSectionLabel(course)].filter(Boolean).join(" · ") || "时间待识别";
}

function overviewCoursePlace(course) {
  return [course?.location, course?.teacher].filter(Boolean).join(" · ") || course?.detail || "地点待识别";
}

function overviewCourseMeta(course) {
  const range = overviewClockRange(course);
  const section = courseSectionLabel(course);
  return [section !== "节次待识别" ? section : "", range.endText ? `结束 ${range.endText}` : ""].filter(Boolean).join(" · ") || "节次待识别";
}

function overviewDurationText(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 60) return `${value}分钟`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}

function overviewTodayCourses(rows, date = new Date()) {
  return filterCoursesForDate(rows, date).sort((left, right) => {
    const leftClock = overviewClockMinutes(left.time);
    const rightClock = overviewClockMinutes(right.time);
    return (leftClock ?? 9999) - (rightClock ?? 9999)
      || (courseSectionRange(left)?.start || 99) - (courseSectionRange(right)?.start || 99);
  });
}

function overviewNextCourse(rows, date = new Date()) {
  const info = academicDayInfo(date);
  if (info.week === null) return { course: null, state: "unknown" };
  const todayRows = overviewTodayCourses(rows, date);
  const now = date.getHours() * 60 + date.getMinutes();
  const active = todayRows.find((course) => {
    const range = overviewClockRange(course);
    return range.start !== null && range.end !== null && now >= range.start && now < range.end;
  });
  if (active) return { course: active, state: "active", elapsed: now - overviewClockRange(active).start };
  const upcoming = todayRows.find((course) => {
    const start = overviewClockRange(course).start;
    return start !== null && start >= now;
  });
  if (upcoming) return { course: upcoming, state: "next", until: overviewClockRange(upcoming).start - now };
  if (todayRows.length) {
    const tomorrow = overviewTodayCourses(rows, addCalendarDays(date, 1));
    return { course: null, state: "ended", tomorrow: tomorrow[0] || null };
  }
  return { course: null, state: "none" };
}

function renderOverviewPriority(next) {
  if (next.state === "unknown") {
    return `<div class="overview-week-unknown"><strong>教学周未设置</strong><p>课表中可能包含不同周次；设置第一周日期后，才能准确判断今天的课程。</p><div class="overview-inline-actions"><button class="button button-link" type="button" data-action="view-settings">设置学周 →</button><button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div></div>`;
  }
  if (next.state === "none") {
    return `<div class="overview-no-class"><strong>今天没有课程</strong><span>可以安心安排自己的时间。</span><button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div>`;
  }
  if (next.state === "ended") {
    const tomorrow = next.tomorrow;
    const tomorrowMarkup = tomorrow
      ? `<div class="overview-tomorrow"><span>明日第一节</span><strong>${escapeHtml(tomorrow.name || "未命名课程")}</strong><small>${escapeHtml([overviewCourseTime(tomorrow), overviewCoursePlace(tomorrow)].filter(Boolean).join(" · "))}</small></div>`
      : `<div class="overview-tomorrow is-muted"><span>明日安排</span><small>暂未读取到已排课程</small></div>`;
    return `<div class="overview-ended"><strong>今天的课程已结束</strong><span>今天的课程已全部结束。</span>${tomorrowMarkup}</div>`;
  }
  const course = next.course;
  const range = overviewClockRange(course);
  const isActive = next.state === "active";
  const stateLabel = isActive ? "正在上课" : "下一节课";
  const stateMeta = isActive ? `已开始 ${overviewDurationText(next.elapsed)}` : `还有 ${overviewDurationText(next.until)}`;
  return `<div class="overview-priority-main ${isActive ? "is-active" : ""}"><div class="overview-priority-time"><strong>${escapeHtml(range.startText || overviewCourseTime(course))}</strong><span>${escapeHtml(range.endText ? `至 ${range.endText}` : overviewCourseMeta(course))}</span></div><div class="overview-priority-copy"><strong>${escapeHtml(course.name || "未命名课程")}</strong><span>${escapeHtml(overviewCoursePlace(course))}</span><small>${escapeHtml(overviewCourseMeta(course))}</small></div><div class="overview-priority-status"><strong>${escapeHtml(stateLabel)}</strong><span>${escapeHtml(stateMeta)}</span></div></div>`;
}

function renderOverview() {
  const dateLabel = overviewDateLabel();
  const scheduleRows = personalScheduleRows(state.data.courses || []);
  const next = overviewNextCourse(scheduleRows);
  const todayRows = dateLabel.weekNumber === null ? [] : overviewTodayCourses(scheduleRows);
  const todayMarkup = dateLabel.weekNumber === null
    ? `<div class="overview-today-unknown">设置第一周日期后，这里会按教学周显示今天的课程。</div>`
    : todayRows.length
      ? `<div class="overview-timeline">${todayRows.map((course) => {
        const range = overviewClockRange(course);
        const active = next.state === "active" && next.course === course;
        return `<button class="overview-timeline-row ${active ? "is-active" : ""}" ${courseActionAttributes(course, "personal")}><span class="overview-timeline-time">${escapeHtml(range.startText || overviewCourseTime(course))}</span><span class="overview-timeline-marker" aria-hidden="true"></span><span class="overview-timeline-copy"><strong>${escapeHtml(course.name || "未命名课程")}</strong><span>${escapeHtml(overviewCoursePlace(course))}</span><small>${escapeHtml(overviewCourseMeta(course))}</small></span></button>`;
      }).join("")}</div>`
      : `<div class="overview-empty">今天没有课程。<button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div>`;
  const exams = sortExamRows(state.data.exams.filter((exam) => !/已结束/.test(exam.status))).slice(0, 3);
  const examMarkup = exams.length
    ? `<div class="overview-list">${exams.map((exam) => `<div class="overview-list-row"><span class="overview-list-date">${escapeHtml(exam.date || "—")}</span><span class="overview-list-copy"><strong>${escapeHtml(exam.name)}</strong><span>${escapeHtml([exam.time, exam.place, exam.seat ? `${exam.seat}号` : ""].filter(Boolean).join(" · ") || "信息待发布")}</span></span><span class="overview-list-status">${escapeHtml(exam.countdown)}</span></div>`).join("")}</div>`
    : `<div class="overview-empty">暂无近期考试</div>`;
  const scoreMarkup = state.data.scores.length
    ? `<div class="overview-list">${state.data.scores.slice(0, 3).map((score) => `<div class="overview-score-row"><strong>${escapeHtml(score.name)}</strong><span class="${scoreSemanticClass(score)}">${escapeHtml(score.score || "—")}</span></div>`).join("")}</div>`
    : `<div class="overview-empty">暂无成绩</div>`;
  const cacheNote = personalCacheStatusText() ? `<p class="overview-cache-note">${escapeHtml(personalCacheStatusText())}</p>` : "";
  const weekContext = dateLabel.weekNumber === null
    ? `<span class="overview-week-context">教学周未设置 <button class="button button-link" type="button" data-action="view-settings">设置 →</button></span>`
    : `<span class="overview-week-context">${escapeHtml(dateLabel.week)}</span>`;
  return `<div class="overview-page">${sectionHeading("总览", "")}<header class="overview-date"><div class="overview-date-main"><strong>${escapeHtml(dateLabel.date)}</strong><span>${escapeHtml(dateLabel.weekday)}</span></div>${weekContext}</header><section class="overview-section overview-priority-section"><div class="overview-section-header"><h3>今日安排</h3><button class="button button-link" type="button" data-action="view-personal">查看课表</button></div>${renderOverviewPriority(next)}</section><section class="overview-section overview-today-section"><div class="overview-section-header"><h3>今天的课程</h3><button class="button button-link" type="button" data-action="view-personal">完整课表</button></div>${todayMarkup}</section><div class="overview-columns"><section class="overview-section"><div class="overview-section-header"><h3>近期考试</h3><button class="button button-link" type="button" data-action="view-exams">查看全部</button></div>${examMarkup}</section><section class="overview-section"><div class="overview-section-header"><h3>最新成绩</h3><button class="button button-link" type="button" data-action="view-scores">查看全部</button></div>${scoreMarkup}</section></div>${cacheNote}</div>`;
}

function renderOverviewUtilities() {
  return "";
}

function filterRows(rows, keys, text) {
  const query = text.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => keys.some((key) => String(row[key] ?? "").toLowerCase().includes(query)));
}

function scoreStatusTag(status) {
  const text = displayValue(status, "");
  if (!text) return "<span class=\"muted\">—</span>";
  const pass = /通过|合格|及格|pass/i.test(text);
  return `<span class="tag ${pass ? "pass" : "warn"}">${escapeHtml(text)}</span>`;
}

function scoreSemanticClass(row = {}) {
  const text = [row.score, row.status].filter(Boolean).join(" ");
  if (/不及格|不通过|不合格|未通过|挂科|fail/i.test(text)) return "score-cell-danger";
  if (/修读中|进行中|待发布|缺考|缓考/i.test(text)) return "score-cell-progress";
  return "";
}

function renderScoreDetailModal() {
  const detail = state.scoreDetail;
  if (!detail) return "";
  const row = detail.row || {};
  const title = row.name || "成绩详情";
  if (detail.loading) {
    return `<div class="modal-backdrop" role="presentation"><section class="detail-modal score-detail-modal" role="dialog" aria-modal="true" aria-label="成绩详情"><div class="detail-modal-head"><div><p class="eyebrow">SCORE DETAIL</p><h3>${escapeHtml(title)}</h3></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-score-detail">关闭</button></div>${loadingCard("正在读取成绩分项…")}</section></div>`;
  }
  if (detail.error) {
    return `<div class="modal-backdrop" role="presentation"><section class="detail-modal score-detail-modal" role="dialog" aria-modal="true" aria-label="成绩详情"><div class="detail-modal-head"><div><p class="eyebrow">SCORE DETAIL</p><h3>${escapeHtml(title)}</h3></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-score-detail">关闭</button></div><div class="error-card"><h3>分项成绩读取失败</h3><p>${escapeHtml(detail.error)}</p><button class="button button-ghost" type="button" data-action="retry-score-detail">重新读取</button></div></section></div>`;
  }
  const data = detail.data || { score: row.score, gpa: row.gpa, passed: false, items: [] };
  const itemTable = data.items.length
    ? `<div class="score-detail-table-wrap"><table class="score-detail-table"><thead><tr><th>分项</th><th>成绩</th></tr></thead><tbody>${data.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td class="score-detail-value">${escapeHtml(item.value)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="schedule-note">教务系统没有返回可识别的分项成绩。</div>`;
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal score-detail-modal" role="dialog" aria-modal="true" aria-label="成绩详情"><div class="detail-modal-head"><div><p class="eyebrow">SCORE DETAIL</p><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(row.code || "")}</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-score-detail">关闭</button></div><div class="score-detail-summary"><div><span>总成绩</span><strong>${escapeHtml(data.score || "—")}</strong></div><div><span>绩点</span><strong>${escapeHtml(data.gpa || "—")}</strong></div><div><span>状态</span><strong>${data.passed ? "已通过" : "—"}</strong></div></div><h4 class="score-detail-heading">分项成绩</h4>${itemTable}</section></div>`;
}

async function openScoreDetail(index) {
  const row = state.data.scores[index];
  if (!row?.detailId) return;
  const token = `${row.detailId}-${Date.now()}`;
  const cachedDetail = state.personalCache.scoreDetails?.[row.detailId];
  if (cachedDetail && typeof cachedDetail === "object") {
    state.scoreDetail = { token, row, loading: false, error: "", data: cachedDetail };
    render();
    return;
  }
  state.scoreDetail = { token, row, loading: true, error: "", data: null };
  render();
  try {
    const payload = await loadScoreDetail(row.detailId);
    if (state.scoreDetail?.token !== token) return;
    const detailData = mapScoreDetail(payload, row);
    state.personalCache.scoreDetails[row.detailId] = cacheSafeValue(detailData);
    persistPersonalCache();
    state.scoreDetail = { token, row, loading: false, error: "", data: detailData };
  } catch (error) {
    if (state.scoreDetail?.token !== token) return;
    state.scoreDetail = { token, row, loading: false, error: error.message || "成绩详情接口请求失败", data: null };
  }
  render();
}

function renderNewScoreReminderModal() {
  const pending = currentScoreReminder();
  if (!pending) return "";
  const termName = state.terms.find((term) => term.code === pending.termCode)?.name || pending.termCode;
  const rows = pending.rows.map((row) => `<article class="new-score-reminder-row"><div><strong>${escapeHtml(row.name || "未命名课程")}</strong><small>${escapeHtml([row.code, row.credit ? `${row.credit} 学分` : "", row.status].filter(Boolean).join(" · "))}</small></div><span class="${scoreSemanticClass(row)}">${escapeHtml(row.score || "—")}</span></article>`).join("");
  return `<div class="modal-backdrop" role="presentation" data-score-reminder-scope="${escapeHtml(pending.scope)}"><section class="detail-modal new-score-reminder-modal" role="dialog" aria-modal="true" aria-label="新成绩提醒"><div class="detail-modal-head"><div><p class="eyebrow">NEW SCORES</p><h3>有新成绩了</h3><p class="muted">${escapeHtml(termName)} · ${pending.rows.length} 门课程</p></div><button class="button button-primary detail-modal-close" type="button" data-action="acknowledge-new-scores">知道了</button></div><div class="new-score-reminder-list">${rows}</div><div class="settings-callout new-score-reminder-note"><strong>严格按学期提醒</strong><span>这里只比较当前查询学期与该学期已经确认过的成绩；首次查看其他学期只会建立基线，不会把整学期成绩都当成新增。</span></div></section></div>`;
}

function renderScores() {
  const rows = filterRows(state.data.scores, ["name", "code", "term", "category", "nature"], state.filters.scores);
  const scoreMeta = (row) => [row.code, row.category, row.examType, row.retake, row.status].filter(Boolean).join(" · ");
  const table = rows.length ? `<div class="table-wrap score-desktop-table"><table class="score-table"><thead><tr><th>课程</th><th>学分</th><th>成绩</th><th>绩点</th><th>性质</th><th>学期</th></tr></thead><tbody>${rows.map((row) => {
    const index = state.data.scores.indexOf(row);
    const score = row.detailId
      ? `<button class="score-link" type="button" data-action="show-score-detail" data-score-index="${index}" title="点击查看分项成绩">${escapeHtml(row.score)}</button>`
      : escapeHtml(row.score);
    return `<tr><td class="primary-cell"><div class="score-course-cell"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(scoreMeta(row))}</small></div></td><td>${escapeHtml(row.credit)}</td><td class="score-cell ${scoreSemanticClass(row)}">${score}</td><td>${escapeHtml(row.gpa)}</td><td>${escapeHtml(row.nature || row.category || "—")}</td><td>${escapeHtml(row.term)}</td></tr>`;
  }).join("")}</tbody></table></div>` : emptyCard(state.filters.scores ? "没有匹配的成绩" : "当前学期暂无成绩", state.filters.scores ? "换一个课程名、课程号或类别关键词。" : "成绩以学校系统已发布的数据为准。", `<button class="button button-ghost" type="button" data-action="open-portal">打开培养板块</button>`);
  const mobileList = rows.length ? `<div class="score-mobile-list">${rows.map((row) => {
    const index = state.data.scores.indexOf(row);
    const action = row.detailId ? ` data-action="show-score-detail" data-score-index="${index}"` : "";
    return `<button class="score-mobile-row" type="button"${action}><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml([row.credit ? `${row.credit} 学分` : "", row.gpa ? `绩点 ${row.gpa}` : "", row.nature || row.category || ""].filter(Boolean).join(" · "))}</small></span><span class="score-mobile-value ${scoreSemanticClass(row)}">${escapeHtml(row.score || "—")}</span></button>`;
  }).join("")}</div>` : "";
  const meta = state.data.gpaMeta || {};
  const scope = meta.scope || "全部已查询学期累计";
  const termScope = meta.termCount ? `${scope}（${meta.populatedTermCount || 0} 个有成绩学期，共 ${meta.total || 0} 门成绩）` : scope;
  const excludedLabel = (meta.excludedRows || []).map((row) => `${row.name}（${row.reason}）`).join("、");
  const gpaNote = meta.rule
    ? `${termScope} · ${meta.rule} · 纳入 ${meta.included || 0} 门，排除 ${meta.excluded || 0} 门 · 计入 ${meta.credit || 0} 学分${excludedLabel ? ` · 已排除：${excludedLabel}` : ""}`
    : "等待成绩接口返回完整绩点字段";
  return `<div>${sectionHeading("成绩", "") }<div class="panel"><div class="gpa-summary"><div><span>平均绩点</span><strong>${escapeHtml(state.data.gpa)}</strong></div><p>${escapeHtml(meta.reported !== "—" && meta.reported !== state.data.gpa ? `原系统累计总绩点 ${meta.reported}` : `已修 ${meta.total || state.data.scores.length} 门课程`)}</p></div><details class="gpa-details"><summary>计算规则</summary><p>${escapeHtml(gpaNote)}</p></details><div class="toolbar"><input id="scoreFilter" data-filter="scores" value="${escapeHtml(state.filters.scores)}" placeholder="搜索课程名、课程号或类别" /><span class="muted">${rows.length} / ${state.data.scores.length} 条</span></div>${table}${mobileList}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">原系统</button>`)}${renderNewScoreReminderModal()}${renderScoreDetailModal()}</div>`;
}

function renderExams() {
  const rows = sortExamRows(filterRows(state.data.exams, ["name", "code", "date", "time", "place", "seat", "teacher", "type", "status"], state.filters.exams));
  const upcoming = sortExamRows(state.data.exams.filter((row) => !/已结束/.test(row.status)))[0];
  const nextText = upcoming ? `${upcoming.name} · ${upcoming.date} · ${upcoming.countdown}` : state.data.exams.length ? "本学期考试已结束" : "暂无考试安排";
  const cards = rows.length ? `<div class="exam-list">${rows.map((row) => `<article class="exam-card ${examStatusClass(row.status)}"><div class="exam-date-block"><strong>${escapeHtml(row.dateDay || "—")}</strong><span>${escapeHtml(row.dateMonth ? `${row.dateMonth}月` : "待定")}</span><em>${escapeHtml(row.weekday || "")}</em></div><div class="exam-card-body"><div class="exam-card-head"><div><h4>${escapeHtml(row.name)}</h4><p>${escapeHtml(row.code)}${row.teacher ? ` · ${escapeHtml(row.teacher)}` : ""}</p></div><div class="exam-card-head-right"><span class="tag exam-type">${escapeHtml(row.type || "考试")}</span><span class="tag ${examStatusClass(row.status)}">${escapeHtml(row.status)}</span></div></div><div class="exam-facts"><div class="exam-fact"><span>考试时间</span><strong>${escapeHtml(row.start && row.end ? `${row.start}–${row.end}` : row.time)}</strong>${row.session ? `<small>${escapeHtml(row.session)}</small>` : ""}</div><div class="exam-fact"><span>考场 / 地点</span><strong>${escapeHtml(row.place || "地点待发布")}</strong></div><div class="exam-fact"><span>座位</span><strong>${escapeHtml(row.seat ? `${row.seat}号` : "座位待发布")}</strong></div><div class="exam-fact"><span>提醒</span><strong>${escapeHtml(row.countdown)}</strong></div></div></div></article>`).join("")}</div>` : emptyCard(state.filters.exams ? "没有匹配的考试" : "当前没有已发布考试安排", state.filters.exams ? "换一个课程名、日期、考场、座位或状态关键词。" : "考试信息以运行 → 考务管理中的发布结果为准。", `<button class="button button-ghost" type="button" data-action="open-portal">打开考务管理</button>`);
  return `<div>${sectionHeading("考试信息", "来自运行 → 考务管理；已自动解析考试日期、星期、起止时间、场次、考场、座位和考试状态。")}<div class="panel"><div class="exam-summary-grid"><div class="exam-summary-card"><span>本学期考试</span><strong>${escapeHtml(state.data.exams.length)}</strong><small>已发布安排</small></div><div class="exam-summary-card"><span>最近一场</span><strong>${escapeHtml(upcoming ? upcoming.date : "—")}</strong><small>${escapeHtml(nextText)}</small></div><div class="exam-summary-card"><span>显示范围</span><strong>${escapeHtml(rows.length)} / ${escapeHtml(state.data.exams.length)}</strong><small>${state.filters.exams ? "已按关键词筛选" : "按考试时间排序"}</small></div></div><div class="toolbar"><input data-filter="exams" value="${escapeHtml(state.filters.exams)}" placeholder="搜索课程、日期、考场、座位或状态" /><span class="muted">显示 ${rows.length} / ${state.data.exams.length} 项</span></div>${cards}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">打开原查询</button>`)}</div>`;
}

// 新的信息架构：考试页把下一场考试提升到首屏，历史考试默认折叠。
// 保留原来的字段解析和考试状态，只改变呈现层。
function renderExams() {
  const rows = sortExamRows(filterRows(state.data.exams, ["name", "code", "date", "time", "place", "seat", "teacher", "type", "status"], state.filters.exams));
  const upcoming = sortExamRows(state.data.exams.filter((row) => !/已结束/.test(row.status)))[0];
  const card = (row) => `<article class="exam-card ${examStatusClass(row.status)}"><div class="exam-date-block"><strong>${escapeHtml(row.dateDay || "—")}</strong><span>${escapeHtml(row.dateMonth ? `${row.dateMonth}月` : "待定")}</span><em>${escapeHtml(row.weekday || "")}</em></div><div class="exam-card-body"><div class="exam-card-head"><div><h4>${escapeHtml(row.name)}</h4><p>${escapeHtml(row.code)}${row.teacher ? ` · ${escapeHtml(row.teacher)}` : ""}</p></div><div class="exam-card-head-right"><span class="tag exam-type">${escapeHtml(row.type || "考试")}</span><span class="tag ${examStatusClass(row.status)}">${escapeHtml(row.status)}</span></div></div><div class="exam-facts"><div class="exam-fact"><span>时间</span><strong>${escapeHtml(row.start && row.end ? `${row.start}–${row.end}` : row.time)}</strong>${row.session ? `<small>${escapeHtml(row.session)}</small>` : ""}</div><div class="exam-fact"><span>地点</span><strong>${escapeHtml(row.place || "地点待发布")}</strong></div><div class="exam-fact"><span>座位</span><strong>${escapeHtml(row.seat ? `${row.seat}号` : "座位待发布")}</strong></div><div class="exam-fact"><span>倒计时</span><strong>${escapeHtml(row.countdown)}</strong></div></div></div></article>`;
  const filteredUpcoming = rows.filter((row) => !/已结束/.test(row.status));
  const ended = rows.filter((row) => /已结束/.test(row.status));
  const nextMarkup = upcoming
    ? `<section class="overview-section"><div class="overview-section-header"><h3>下一场</h3></div><div class="exam-next"><div class="exam-next-date"><strong>${escapeHtml(upcoming.dateDay || "—")}</strong>${escapeHtml(upcoming.dateMonth ? `${upcoming.dateMonth}月` : "日期待发布")}<br />${escapeHtml(upcoming.weekday || "")}</div><div class="exam-next-copy"><h4>${escapeHtml(upcoming.name)}</h4><p>${escapeHtml([upcoming.time, upcoming.place, upcoming.seat ? `座位 ${upcoming.seat}` : ""].filter(Boolean).join(" · ") || "信息待发布")}</p></div><span class="exam-next-countdown">${escapeHtml(upcoming.countdown)}</span></div></section>`
    : "";
  const cards = filteredUpcoming.length ? `<div class="exam-list">${filteredUpcoming.map(card).join("")}</div>` : "";
  const endedMarkup = ended.length ? `<details class="ended-exams"><summary>已结束 ${ended.length}</summary><div class="exam-list">${ended.map(card).join("")}</div></details>` : "";
  const empty = !rows.length ? emptyCard(state.filters.exams ? "没有匹配的考试" : "暂无考试", state.filters.exams ? "换一个课程名、日期或考场关键词。" : "当前学期没有已发布安排。", `<button class="button button-ghost" type="button" data-action="open-portal">原系统</button>`) : "";
  return `<div>${sectionHeading("考试", "")}<div class="panel"><div class="toolbar"><input data-filter="exams" value="${escapeHtml(state.filters.exams)}" placeholder="搜索课程、日期、考场或座位" /><span class="muted">${rows.length} / ${state.data.exams.length} 项</span></div>${nextMarkup}${cards}${endedMarkup}${empty}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">原系统</button>`)}</div>`;
}

function parseDay(value) {
  const text = String(value ?? "");
  const namedDay = text.match(/(?:星期|周)(日|天|一|二|三|四|五|六|七|[0-7])/);
  if (namedDay) {
    const dayValue = namedDay[1];
    if (/\d/.test(dayValue)) return Number(dayValue) === 0 ? 7 : Number(dayValue);
    return { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7 }[dayValue] || 0;
  }
  const digit = text.trim().match(/^[1-7]$/);
  return digit ? Number(digit[0]) : 0;
}

function chineseSectionNumber(value) {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  return {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    十一: 11, 十二: 12
  }[text] || 0;
}

function parseSectionRange(value) {
  const text = String(value ?? "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[－–—−]/g, "-")
    .trim();
  if (!text) return null;
  const sectionMatch = text.match(/第?\s*([0-9一二三四五六七八九十]+)\s*[-~至]\s*第?\s*([0-9一二三四五六七八九十]+)\s*节/) || text.match(/第?\s*([0-9一二三四五六七八九十]+)\s*节\s*(?:[-~至]\s*第?\s*([0-9一二三四五六七八九十]+)\s*节?)?/);
  const plainMatch = sectionMatch || text.match(/^\s*第?\s*([0-9一二三四五六七八九十]+)\s*(?:[-~至]\s*第?\s*([0-9一二三四五六七八九十]+))?\s*节?\s*$/);
  if (!plainMatch) return null;
  const start = chineseSectionNumber(plainMatch[1]);
  const end = chineseSectionNumber(plainMatch[2] || plainMatch[1]);
  if (!start || !end) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function courseSectionRange(course) {
  // Local Schedule 的 detail 是用户备注，不能沿用教务课程的“整段文本兜底
  // 解析”规则；否则备注“123”会被误认为第 123 节。自定义安排只允许
  // 明确的 section/time 字段参与节次识别。
  if (course?.source === "local") {
    const localCandidates = [course?.section, course?.time].filter((value) => hasDisplayValue(value));
    const localParsed = localCandidates
      .map((value) => ({ value, range: parseSectionRange(value) }))
      .filter((item) => item.range);
    return localParsed.find((item) => item.range.end > item.range.start)?.range || localParsed[0]?.range || null;
  }
  const candidates = [
    course?.section,
    course?.detail,
    course?.time,
    rawScheduleText(course?.raw),
    ...scheduleDetailCandidates(course?.raw)
  ].filter((value) => hasDisplayValue(value));
  const parsed = candidates.map((value) => ({ value, range: parseSectionRange(value) })).filter((item) => item.range);
  return parsed.find((item) => item.range.end > item.range.start)?.range || parsed[0]?.range || null;
}

function courseSectionLabel(course) {
  const range = courseSectionRange(course);
  if (range) return range.start === range.end ? `第${range.start}节` : `第${range.start}-${range.end}节`;
  return displayValue(course?.section, "节次待识别");
}

function extractClockText(value) {
  const matches = String(value ?? "").match(/\d{1,2}:\d{2}/g) || [];
  if (matches.length < 2) return "";
  return `${matches[0]}-${matches[1]}`;
}

function courseIndexForScope(course, scope = "personal") {
  if (scope === "all-detail") return (state.allDetail?.courses || []).indexOf(course);
  if (scope === "all") return state.allRows.indexOf(course?.raw || course);
  return Number.isInteger(course?.sourceCourseIndex) && course.sourceCourseIndex >= 0
    ? course.sourceCourseIndex
    : state.data.courses.indexOf(course);
}

function courseRowsForScope(scope = "personal") {
  if (scope === "all-detail") return state.allDetail?.courses || [];
  if (scope === "all") return normalizedScheduleCourses(state.allRows.filter(isCourseDetailRow));
  return state.data.courses;
}

function courseAtScopeIndex(scope, index) {
  if (scope === "all") {
    const raw = state.allRows[index];
    return raw ? mapCourse(raw) : null;
  }
  if (scope === "personal") {
    return state.data.courses[index] || state.data.scheduleDetail.find((course) => course.sourceCourseIndex === index) || null;
  }
  return courseRowsForScope(scope)[index] || null;
}

function courseActionAttributes(course, scope = "personal") {
  const index = courseIndexForScope(course, scope);
  const detailIndex = scope === "personal" ? state.data.scheduleDetail.indexOf(course) : -1;
  if (index < 0 && detailIndex < 0) return "";
  const sourceIndex = index >= 0 ? index : course.sourceCourseIndex;
  return `type="button" data-action="show-course" data-course-scope="${scope}" data-course-index="${sourceIndex}"${detailIndex >= 0 ? ` data-course-detail-index="${detailIndex}"` : ""}`;
}

function courseDataAttributes(course, scope = "personal") {
  const index = courseIndexForScope(course, scope);
  const detailIndex = scope === "personal" ? state.data.scheduleDetail.indexOf(course) : -1;
  if (index < 0 && detailIndex < 0) return "";
  const sourceIndex = index >= 0 ? index : course.sourceCourseIndex;
  return `data-action="show-course" data-course-scope="${scope}" data-course-index="${sourceIndex}"${detailIndex >= 0 ? ` data-course-detail-index="${detailIndex}"` : ""}`;
}

function localScheduleSourceBadge(itemOrRow) {
  const type = itemOrRow?.localType || itemOrRow?.type;
  return `<span class="local-source-badge local-source-${type === "event" ? "event" : "course"}">${type === "event" ? "日程" : "自定义"}</span>`;
}

function courseChipMarkup(course, scope = "personal", extraClass = "", style = "", availability = null) {
  const clockText = extractClockText(course.time) || localScheduleClockText(course);
  const timeText = [course.weeks, course.weekday, courseSectionLabel(course), clockText].filter((value) => value && value !== "节次待识别").join(" ") || (course.localDate ? `${course.localDate} ${clockText}`.trim() : "时间待识别");
  const placeText = [course.teacher, course.location].filter(Boolean).join(" · ") || course.detail || "地点待识别";
  const className = ["course-chip", extraClass, course.source === "local" ? "local-schedule-chip" : ""].filter(Boolean).join(" ");
  const badge = course.source === "local" ? localScheduleSourceBadge(course) : "";
  return `<button class="${className}" ${courseActionAttributes(course, scope)} style="${style}" title="点击查看课程详情"><strong>${escapeHtml(course.name || "未命名课程")}</strong>${badge}<span>${escapeHtml(timeText)}</span><span>${escapeHtml(placeText)}</span>${courseTagsMarkup(course, availability || { assessment: true, requirement: true })}</button>`;
}

function localScheduleFilterText(row) {
  return [row?.name, row?.teacher, row?.location, row?.detail, row?.weeks, row?.weekday, row?.time, row?.localDate].filter(Boolean).join(" ");
}

function localScheduleItemDisplayText(item) {
  const row = localScheduleItemToCourseRow(item);
  const schedule = item.type === "event"
    ? [item.event.date && localScheduleDateText(item.event.date), localScheduleClockText(item), localScheduleSectionText(item)].filter(Boolean).join(" · ")
    : [item.course.weekNumbers.length ? formatWeeksValue(item.course.weekNumbers.join(",")) : "周次待设置", localScheduleWeekdayText(item.course.weekdayIndex), localScheduleSectionText(item), localScheduleClockText(item)].filter(Boolean).join(" · ");
  return { row, schedule };
}

function localScheduleActionButtons(item) {
  const id = escapeHtml(item.id);
  return `<div class="local-item-actions"><button class="button button-ghost button-small" type="button" data-action="edit-local-schedule" data-local-schedule-id="${id}">编辑</button><button class="button button-ghost button-small" type="button" data-action="copy-local-schedule" data-local-schedule-id="${id}">复制</button>${item.enabled ? `<button class="button button-soft button-small" type="button" data-action="toggle-local-schedule" data-local-schedule-id="${id}">停用</button>` : `<button class="button button-soft button-small" type="button" data-action="toggle-local-schedule" data-local-schedule-id="${id}">启用</button>`}<button class="button button-danger button-small" type="button" data-action="delete-local-schedule" data-local-schedule-id="${id}">删除</button></div>`;
}

function renderLocalScheduleRecords(items = localScheduleItemsForTerm(state.termCode, true)) {
  const rows = (items || []).map((item) => {
    const display = localScheduleItemDisplayText(item);
    const disabled = item.enabled ? "" : " is-disabled";
    return `<article class="local-schedule-record local-schedule-color-${escapeHtml(item.colorKey || "blue")}${disabled}"><button class="local-record-main" type="button" data-action="show-local-schedule" data-course-source="local" data-local-schedule-id="${escapeHtml(item.id)}"><div class="local-record-head"><strong>${escapeHtml(item.title || "未命名安排")}</strong>${localScheduleSourceBadge(item)}${!item.enabled ? `<span class="tag">已停用</span>` : ""}</div><span>${escapeHtml(display.schedule || "时间待设置")}</span><small>${escapeHtml([item.location, item.teacher, item.note].filter(Boolean).join(" · ") || "没有补充信息")}</small></button>${localScheduleActionButtons(item)}</article>`;
  }).join("");
  return rows ? `<div class="local-schedule-records">${rows}</div>` : `<div class="local-schedule-empty"><strong>本学期还没有自定义安排</strong><span>可以添加一门重复课程或一次性日程。</span></div>`;
}

function localScheduleTermOptionsMarkup(selected = state.termCode) {
  const terms = localScheduleTerms();
  if (!terms.length && selected) return `<option value="${escapeHtml(selected)}" selected>${escapeHtml(localScheduleTermName(selected))}</option>`;
  return terms.map((term) => `<option value="${escapeHtml(term.code)}" ${term.code === selected ? "selected" : ""}>${escapeHtml(term.name || term.code)}</option>`).join("");
}

function localScheduleSectionOptions(selected = null, placeholder = "不指定", minimum = null) {
  const max = Math.max(12, ...schoolPersonalScheduleRows(state.data.courses || []).map((course) => courseSectionRange(course)?.end || 0));
  const selectedNumber = localScheduleInteger(selected, null);
  const minimumNumber = localScheduleInteger(minimum, null);
  const selectedPlaceholder = selectedNumber === null || (minimumNumber !== null && selectedNumber < minimumNumber);
  const options = Array.from({ length: max }, (_, index) => index + 1)
    .filter((value) => minimumNumber === null || value >= minimumNumber)
    .map((value) => `<option value="${value}" ${selectedNumber === value ? "selected" : ""}>第${value}节</option>`)
    .join("");
  return `<option value="" ${selectedPlaceholder ? "selected" : ""}>${placeholder}</option>${options}`;
}

function localScheduleEditorMarkup() {
  if (!state.localSchedule.editorOpen) return "";
  const draft = state.localSchedule.draft || localScheduleDraftFromItem(null, "course");
  const type = draft.type === "event" ? "event" : "course";
  const course = draft.course || {};
  const event = draft.event || {};
  const weeks = new Set(course.weekNumbers || []);
  const minWeek = course.weekNumbers?.length ? Math.min(...course.weekNumbers) : "";
  const maxWeek = course.weekNumbers?.length ? Math.max(...course.weekNumbers) : "";
  const isContiguous = course.weekNumbers?.length === maxWeek - minWeek + 1 && course.weekNumbers.every((week) => week >= minWeek && week <= maxWeek);
  const isOdd = course.weekNumbers?.length && course.weekNumbers.every((week) => week % 2 === 1) && course.weekNumbers.length === Math.ceil((maxWeek - minWeek + 1) / 2);
  const isEven = course.weekNumbers?.length && course.weekNumbers.every((week) => week % 2 === 0) && course.weekNumbers.length === Math.floor((maxWeek - minWeek + 1) / 2);
  const repeatValue = !course.weekNumbers?.length ? "every" : isContiguous ? "every" : isOdd ? "odd" : isEven ? "even" : "custom";
  const weekCheckboxes = Array.from({ length: 20 }, (_, index) => index + 1)
    .map((week) => `<label class="local-week-option"><input type="checkbox" data-local-week value="${week}" ${weeks.has(week) ? "checked" : ""} />${week}</label>`).join("");
  const termOptions = localScheduleTermOptionsMarkup(draft.termCode || state.termCode);
  const colorOptions = LOCAL_SCHEDULE_COLOR_KEYS.map((key) => `<label class="local-color-option local-color-${key}"><input type="radio" name="localColorKey" value="${key}" ${draft.colorKey === key ? "checked" : ""} /><span></span></label>`).join("");
  const todayInfo = academicDayInfo(new Date());
  const currentOccurrence = course.weekNumbers?.length === 1
    && course.weekNumbers[0] === todayInfo.week
    && course.weekdayIndex === todayInfo.weekdayIndex;
  const weekContext = currentOccurrence
    ? `<p class="local-week-context is-current">已按今天设置为第 ${todayInfo.week} 周 · ${escapeHtml(SUNDAY_FIRST_DAY_NAMES[todayInfo.weekdayIndex])}，默认只添加本周这一次。</p>`
    : !course.weekNumbers?.length
      ? `<p class="local-week-context is-warning">已识别今天是${escapeHtml(SUNDAY_FIRST_DAY_NAMES[todayInfo.weekdayIndex])}，但尚未设置第一周周日，无法自动计算当前教学周。请在下方直接填写周次，或先到设置页配置学周。</p>`
      : "";
  const courseForm = `<div class="local-editor-section"><h4>上课时间</h4>${weekContext}<div class="local-form-grid"><label class="local-form-field local-form-wide"><span>课程名称 <em>*</em></span><input id="localTitle" value="${escapeHtml(draft.title)}" placeholder="例如：自动控制补课" /></label><label class="local-form-field"><span>学期 <em>*</em></span><select id="localTermCode">${termOptions}</select></label><label class="local-form-field"><span>星期 <em>*</em></span><select id="localWeekday"><option value="">请选择星期</option>${["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((name, index) => `<option value="${index}" ${course.weekdayIndex === index ? "selected" : ""}>${name}</option>`).join("")}</select></label><label class="local-form-field"><span>开始节次 <em>*</em></span><select id="localStartSection">${localScheduleSectionOptions(course.startSection, "请选择")}</select></label><label class="local-form-field"><span>结束节次 <em>*</em></span><select id="localEndSection">${localScheduleSectionOptions(course.endSection, "请选择", course.startSection)}</select></label></div><div class="local-week-builder"><strong>上课周次 <em>*</em></strong><div class="local-week-range"><label>起始周<input id="localWeekStart" type="number" min="1" max="60" value="${escapeHtml(minWeek)}" placeholder="例如 ${todayInfo.week || 8}" /></label><label>结束周<input id="localWeekEnd" type="number" min="1" max="60" value="${escapeHtml(maxWeek)}" placeholder="临时课与起始周相同" /></label><label>重复<select id="localWeekRepeat"><option value="every" ${repeatValue === "every" ? "selected" : ""}>每周</option><option value="odd" ${repeatValue === "odd" ? "selected" : ""}>单周</option><option value="even" ${repeatValue === "even" ? "selected" : ""}>双周</option><option value="custom" ${repeatValue === "custom" ? "selected" : ""}>自定义周次</option></select></label></div><details class="local-custom-weeks" ${repeatValue === "custom" ? "open" : ""}><summary>自定义周次（可选）</summary><div class="local-week-options">${weekCheckboxes}</div></details></div></div><div class="local-editor-section"><h4>课程信息</h4><div class="local-form-grid"><label class="local-form-field"><span>教师</span><input id="localTeacher" value="${escapeHtml(draft.teacher)}" placeholder="可选" /></label><label class="local-form-field"><span>地点</span><input id="localLocation" value="${escapeHtml(draft.location)}" placeholder="可选" /></label><label class="local-form-field"><span>开始时间</span><input id="localStartTime" type="time" value="${escapeHtml(course.startTime || "")}" /></label><label class="local-form-field"><span>结束时间</span><input id="localEndTime" type="time" value="${escapeHtml(course.endTime || "")}" /></label><label class="local-form-field local-form-wide"><span>备注</span><textarea id="localNote" rows="3" placeholder="可选">${escapeHtml(draft.note)}</textarea></label></div></div>`;
  const eventForm = `<div class="local-editor-section"><h4>日程信息</h4><div class="local-form-grid"><label class="local-form-field local-form-wide"><span>标题 <em>*</em></span><input id="localTitle" value="${escapeHtml(draft.title)}" placeholder="例如：摄影社例会" /></label><label class="local-form-field"><span>学期 <em>*</em></span><select id="localTermCode">${termOptions}</select></label><label class="local-form-field"><span>日期 <em>*</em></span><input id="localEventDate" type="date" value="${escapeHtml(event.date || "")}" /></label><label class="local-form-check local-form-wide"><input id="localEventAllDay" type="checkbox" ${event.allDay ? "checked" : ""} /><span>全天日程（不参与时间冲突判断）</span></label><label class="local-form-field"><span>开始时间</span><input id="localStartTime" type="time" value="${escapeHtml(event.startTime || "")}" /></label><label class="local-form-field"><span>结束时间</span><input id="localEndTime" type="time" value="${escapeHtml(event.endTime || "")}" /></label><label class="local-form-field"><span>开始节次（可选）</span><select id="localStartSection">${localScheduleSectionOptions(event.startSection, "未指定")}</select></label><label class="local-form-field"><span>结束节次（可选）</span><select id="localEndSection">${localScheduleSectionOptions(event.endSection, "未指定", event.startSection)}</select></label><label class="local-form-field"><span>地点</span><input id="localLocation" value="${escapeHtml(draft.location)}" placeholder="可选" /></label><label class="local-form-field"><span>备注</span><textarea id="localNote" rows="3" placeholder="可选">${escapeHtml(draft.note)}</textarea></label><p class="local-form-help local-form-wide">一次性日程会按日期显示，即使尚未设置教学周。</p></div></div>`;
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal local-editor-modal" role="dialog" aria-modal="true" aria-label="${type === "event" ? "编辑本地日程" : "编辑本地课程"}"><div class="detail-modal-head"><div><p class="eyebrow">LOCAL SCHEDULE</p><h3>${draft.id && state.localSchedule.editingId ? "编辑安排" : "添加安排"}</h3><p class="muted">内容只保存在本机，不会写入教务系统或上传到服务器。</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-local-editor">关闭</button></div><div class="local-editor-tabs"><button class="button button-small ${type === "course" ? "button-primary" : "button-ghost"}" type="button" data-action="local-editor-type" data-local-type="course">课程</button><button class="button button-small ${type === "event" ? "button-primary" : "button-ghost"}" type="button" data-action="local-editor-type" data-local-type="event">日程</button></div>${type === "course" ? courseForm : eventForm}<div class="local-editor-section"><h4>颜色</h4><div class="local-color-options">${colorOptions}</div></div>${state.localSchedule.editorError ? `<p class="local-form-error" role="alert">${escapeHtml(state.localSchedule.editorError)}</p>` : ""}<div class="schedule-export-actions"><button class="button button-ghost" type="button" data-action="close-local-editor">取消</button><button class="button button-primary" type="button" data-action="save-local-schedule">保存安排</button></div></section></div>`;
}

function localScheduleManagerMarkup() {
  if (!state.localSchedule.managerOpen) return "";
  const allItems = localScheduleItemsForTerm(state.termCode, true);
  const filter = state.localSchedule.filter || "all";
  const items = allItems.filter((item) => filter === "all" || filter === item.type || (filter === "disabled" && !item.enabled));
  const hidden = (state.localSchedule.hiddenSchoolEntries || []).filter((entry) => !entry.termCode || entry.termCode === state.termCode);
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal local-manager-modal" role="dialog" aria-modal="true" aria-label="管理自定义安排"><div class="detail-modal-head"><div><p class="eyebrow">LOCAL SCHEDULE</p><h3>管理自定义安排</h3><p class="muted">当前查询学期 · ${allItems.filter((item) => item.enabled).length} 项启用安排；学校课程仍保存在教务数据层。</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-local-manager">关闭</button></div><div class="local-manager-toolbar"><select id="localManagerFilter"><option value="all" ${filter === "all" ? "selected" : ""}>全部本地安排</option><option value="course" ${filter === "course" ? "selected" : ""}>自定义课程</option><option value="event" ${filter === "event" ? "selected" : ""}>自定义日程</option><option value="disabled" ${filter === "disabled" ? "selected" : ""}>已停用</option></select><button class="button button-primary button-small" type="button" data-action="open-local-editor">+ 添加安排</button></div>${renderLocalScheduleRecords(items)}<section class="local-hidden-school-section"><div class="local-manager-section-head"><strong>本地隐藏的教务排课</strong><span>${hidden.length} 条</span></div>${hidden.length ? hidden.map((entry) => `<div class="local-hidden-school-row"><div><strong>${escapeHtml(entry.label || "教务排课")}</strong><small>只在本地组合课表中隐藏，不会修改教务系统</small></div><button class="button button-ghost button-small" type="button" data-action="restore-hidden-school" data-hidden-school-key="${escapeHtml(entry.key)}" data-hidden-school-term="${escapeHtml(entry.termCode || "")}">恢复显示</button></div>`).join("") : `<p class="muted">没有本地隐藏的教务排课。</p>`}</section><div class="local-manager-danger"><button class="button button-danger" type="button" data-action="clear-local-schedule">清除全部自定义安排</button><small>只删除你手动创建的数据，不影响教务系统课程。</small></div></section></div>`;
}

function localScheduleConflictMarkup() {
  const conflict = state.localSchedule.conflict;
  if (!conflict) return "";
  const candidate = conflict.candidate;
  const candidateText = localScheduleItemDisplayText(candidate).schedule;
  const confirmed = conflict.conflicts.filter((item) => item.status === SCHEDULE_COLLISION_STATUS.CONFIRMED);
  const possible = conflict.conflicts.filter((item) => item.status === SCHEDULE_COLLISION_STATUS.POSSIBLE);
  const list = conflict.conflicts.map((item) => {
    const existing = item.existingItem || item.existing;
    const label = existing?.source === "local" ? "自定义安排" : "教务课程";
    const statusText = item.status === SCHEDULE_COLLISION_STATUS.CONFIRMED
      ? "确定冲突"
      : `可能重叠：${(item.reasons || []).join("、") || "时间信息不足"}`;
    return `<article class="local-conflict-row"><div><strong>${escapeHtml(existing?.name || existing?.title || "未命名安排")}</strong><span>${escapeHtml(label)} · ${escapeHtml(statusText)}</span></div><small>${escapeHtml(existing?.source === "local" ? localScheduleItemDisplayText(existing).schedule : courseTransferScheduleText(existing))}</small></article>`;
  }).join("");
  const heading = confirmed.length ? `发现 ${confirmed.length} 项确定冲突` : "时间信息不足，暂不能确认冲突";
  const summary = confirmed.length
    ? `${possible.length ? `另有 ${possible.length} 项可能重叠，但不会显示为确定冲突。` : ""} 默认不会自动隐藏任何课程；“仅保留新安排”只针对确定冲突。`
    : `有 ${possible.length} 项安排可能重叠，但缺少教学周、结束时间或其他信息，无法确认。可以直接保存，不会隐藏任何课程。`;
  const actions = confirmed.length
    ? `<div class="local-conflict-actions"><button class="button button-ghost" type="button" data-action="resolve-local-conflict" data-conflict-choice="existing">保留现有安排</button><button class="button button-primary" type="button" data-action="resolve-local-conflict" data-conflict-choice="both">同时保留</button><button class="button button-soft" type="button" data-action="resolve-local-conflict" data-conflict-choice="new">仅保留新安排<br /><small>仅隐藏确定冲突的教务课程</small></button></div>`
    : `<div class="local-conflict-actions"><button class="button button-primary" type="button" data-action="resolve-local-conflict" data-conflict-choice="both">仍然保存</button></div>`;
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal local-conflict-modal" role="dialog" aria-modal="true" aria-label="${confirmed.length ? "发现时间冲突" : "时间信息不足"}"><div class="detail-modal-head"><div><p class="eyebrow">SCHEDULE CONFLICT</p><h3>${heading}</h3><p class="muted">你添加的安排：${escapeHtml(candidate.title)} · ${escapeHtml(candidateText)}</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-local-conflict">关闭</button></div><div class="local-conflict-list">${list}</div><div class="local-conflict-choice"><strong>如何处理？</strong><p>${summary}</p>${actions}</div></section></div>`;
}

function localScheduleModalMarkup() {
  return `${localScheduleEditorMarkup()}${localScheduleManagerMarkup()}${localScheduleConflictMarkup()}`;
}

function hasActiveModalState() {
  return Boolean(
    state.webvpnTool.open
    || state.scheduleExport
    || state.courseTransfer.mode
    || state.selectedCourse
    || state.scoreDetail
    || state.curriculum.courseDetail
    || state.localSchedule.editorOpen
    || state.localSchedule.managerOpen
    || state.localSchedule.conflict
    || state.campus.promptOpen
  );
}

function clearActiveModalState() {
  sportProjectRequestSequence += 1;
  state.webvpnTool.open = false;
  state.scheduleExport = null;
  state.selectedCourse = null;
  state.selectedCourseScope = "personal";
  state.scoreDetail = null;
  state.curriculum.courseDetail = null;
  state.localSchedule.editorOpen = false;
  state.localSchedule.managerOpen = false;
  state.localSchedule.conflict = null;
  state.localSchedule.editingId = "";
  state.localSchedule.draft = null;
  state.localSchedule.editorError = "";
  state.campus.promptOpen = false;
  clearCourseTransferModal();
}

function localScheduleRowHasConflict(row, rows = mergedPersonalScheduleRows()) {
  return rows.some((candidate) => candidate !== row
    && compareScheduleItemsOverlap(row, candidate).status === SCHEDULE_COLLISION_STATUS.CONFIRMED);
}

function renderDailyScheduleWithLocalOverlay(rows, scope = "personal") {
  const availability = courseFieldAvailability(rows, scope);
  const today = localDateOnly(new Date());
  const dates = [today, addCalendarDays(today, 1)];
  const firstWeekDate = normalizeCalendarDate(state.calendar.firstWeekStart);
  const calendarHint = firstWeekDate
    ? `第一周从 ${calendarDateText(firstWeekDate)}（周日）开始；自定义日程按真实日期显示。`
    : "尚未设置第一周的周日；一次性日程仍会按真实日期显示，重复课程需要设置教学周后才能判断。";
  const cards = dates.map((date, index) => {
    const info = academicDayInfo(date);
    const courses = filterCoursesForDate(rows, date);
    const period = index === 0 ? "今天" : "明天";
    const weekText = info.week ? `第${info.week}周` : "教学周未设置";
    const courseMarkup = courses.length
      ? courses.map((course) => {
        const sectionText = [courseSectionLabel(course) === "节次待识别" ? "" : courseSectionLabel(course), courseClockText(course)].filter(Boolean).join(" · ") || (course.localAllDay ? "全天" : "时间待识别");
        const placeText = course.location || course.detail || "地点待识别";
        const badge = course.source === "local" ? localScheduleSourceBadge(course) : "";
        const conflict = localScheduleRowHasConflict(course, rows);
        return `<button class="daily-course-card ${course.source === "local" ? `local-schedule-card local-schedule-color-${escapeHtml(course.localColorKey || "blue")}` : ""}" ${courseActionAttributes(course, scope)} title="点击查看课程详情"><div class="daily-course-title"><strong>${escapeHtml(course.name || "未命名课程")}</strong><span>${escapeHtml(sectionText)}</span></div><div class="daily-course-tags">${badge}${courseTagsMarkup(course, availability)}</div><p class="daily-course-teacher">${escapeHtml(course.teacher || (course.localType === "event" ? "自定义日程" : "教师待识别"))}</p><p class="daily-course-location">${escapeHtml(placeText)}</p><small class="daily-course-meta">${escapeHtml(course.localDate ? `${course.localDate}${course.localAllDay ? " · 全天" : ""}` : `${course.weeks || "周次待识别"} · ${course.code || "无课程号"}`)}${conflict ? " · ⚠ 时间冲突" : ""}</small></button>`;
      }).join("")
      : info.week === null
        ? `<div class="daily-empty"><strong>教学周未设置</strong><span>一次性日程仍会显示；设置第一周周日后才能加入重复课程。</span><button class="button button-link" type="button" data-action="view-settings">设置学周 →</button></div>`
        : `<div class="daily-empty"><strong>这天没有安排</strong><span>可以安心安排自己的时间</span></div>`;
    return `<section class="daily-day-card ${index === 0 ? "is-today" : ""}"><header class="daily-day-header"><div><span class="daily-day-badge">${period}</span><h4>${SUNDAY_FIRST_DAY_NAMES[info.weekdayIndex]} · ${calendarDateText(date)}</h4></div><span class="tag ${info.week ? "pass" : "warn"}">${weekText}</span></header><div class="daily-course-list">${courseMarkup}</div></section>`;
  }).join("");
  return `<div class="daily-schedule"><div class="daily-schedule-note"><span class="hero-dot" aria-hidden="true"></span><span>${escapeHtml(calendarHint)}</span><button class="button button-ghost button-small" type="button" data-action="view-settings">设置学周</button></div><div class="daily-schedule-grid">${cards}</div></div>`;
}

function renderOverviewPriority(next) {
  if (next.state === "unknown") {
    return `<div class="overview-week-unknown"><strong>教学周未设置</strong><p>一次性日程可以正常显示；重复课程需要设置第一周日期后才能准确判断今天。</p><div class="overview-inline-actions"><button class="button button-link" type="button" data-action="view-settings">设置学周 →</button><button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div></div>`;
  }
  if (next.state === "none") {
    const tomorrow = next.tomorrow;
    return `<div class="overview-no-class"><strong>今天没有安排</strong><span>${tomorrow ? `明日第一项：${escapeHtml(tomorrow.name || "未命名安排")}` : "可以安心安排自己的时间。"}</span><button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div>`;
  }
  if (next.state === "all-day") {
    return `<div class="overview-no-class local-priority"><strong>今天有全天安排</strong><span>${escapeHtml(next.course?.name || "未命名日程")} · 不计入下一项时间提醒</span><button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div>`;
  }
  if (next.state === "time-unknown") {
    const campusMissing = !state.campus.code;
    return `<div class="overview-week-unknown"><strong>还不能判断今日安排是否结束</strong><p>${campusMissing ? "教务系统只提供了节次；设置默认校区后即可按校区作息时间准确计算。" : "部分安排缺少可识别的节次或时间，为避免误判，不会提前显示“已结束”。"}</p><div class="overview-inline-actions">${campusMissing ? `<button class="button button-link" type="button" data-action="view-settings">设置校区 →</button>` : ""}<button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div></div>`;
  }
  if (next.state === "ended") {
    const tomorrow = next.tomorrow;
    return `<div class="overview-ended"><strong>今天的安排已结束</strong><span>今天的课程与日程已全部结束。</span>${tomorrow ? `<div class="overview-tomorrow"><span>明日第一项</span><strong>${escapeHtml(tomorrow.name || "未命名安排")}</strong><small>${escapeHtml([overviewCourseTime(tomorrow), overviewCoursePlace(tomorrow)].filter(Boolean).join(" · "))}</small></div>` : `<div class="overview-tomorrow is-muted"><span>明日安排</span><small>暂未读取到已排安排</small></div>`}</div>`;
  }
  const course = next.course;
  const range = localScheduleClockRange(course);
  const isActive = next.state === "active";
  const isEvent = course?.source === "local" && course?.localType === "event";
  const stateLabel = isActive ? (isEvent ? "正在进行" : "正在上课") : next.state === "started" ? "已开始" : isEvent ? "下一项安排" : "下一节课";
  const stateMeta = isActive ? `已开始 ${overviewDurationText(next.elapsed)}` : next.until !== undefined ? `还有 ${overviewDurationText(next.until)}` : "时间已到";
  const badge = isEvent || course?.source === "local" ? localScheduleSourceBadge(course) : "";
  return `<button class="overview-priority-main ${isActive ? "is-active" : ""} ${isEvent ? "local-priority" : ""}" ${courseActionAttributes(course, "personal")} aria-label="查看${escapeHtml(course?.name || "当前安排")}详情"><div class="overview-priority-time"><strong>${escapeHtml(range.startText || (course?.localAllDay ? "全天" : overviewCourseTime(course)))}</strong><span>${escapeHtml(range.endText ? `至 ${range.endText}` : overviewCourseMeta(course))}</span></div><div class="overview-priority-copy"><strong>${escapeHtml(course?.name || "未命名安排")} ${badge}</strong><span>${escapeHtml(overviewCoursePlace(course))}</span><small>${escapeHtml(overviewCourseMeta(course))}</small></div><div class="overview-priority-status"><strong>${escapeHtml(stateLabel)}</strong><span>${escapeHtml(stateMeta)}</span></div></button>`;
}

function renderOverview() {
  const dateLabel = overviewDateLabel();
  const scheduleRows = mergedPersonalScheduleRows(state.data.courses || []);
  const next = overviewNextCourse(scheduleRows);
  const todayRows = overviewTodayCourses(scheduleRows);
  const todayMarkup = todayRows.length
    ? `<div class="overview-timeline">${todayRows.map((course) => {
      const range = localScheduleClockRange(course);
      const active = next.state === "active" && next.course === course;
      const badge = course.source === "local" ? localScheduleSourceBadge(course) : "";
      const conflict = localScheduleRowHasConflict(course, scheduleRows);
      const startTime = range.startText || (course.localAllDay ? "全天" : overviewCourseTime(course));
      const endTime = range.endText || "";
      return `<button class="overview-timeline-row ${active ? "is-active" : ""} ${course.source === "local" ? `local-overview-row local-schedule-color-${escapeHtml(course.localColorKey || "blue")}` : ""}" ${courseActionAttributes(course, "personal")}><span class="overview-timeline-time"><b>${escapeHtml(startTime)}</b>${endTime ? `<small>至 ${escapeHtml(endTime)}</small>` : ""}</span><span class="overview-timeline-marker" aria-hidden="true"></span><span class="overview-timeline-card"><span class="overview-timeline-copy"><strong>${escapeHtml(course.name || "未命名安排")} ${badge}${conflict ? `<em class="overview-conflict-mark">⚠ 冲突</em>` : ""}</strong><span>${escapeHtml(overviewCoursePlace(course))}</span><small>${escapeHtml(overviewCourseMeta(course))}</small></span><span class="overview-timeline-arrow" aria-hidden="true">›</span></span></button>`;
    }).join("")}</div>`
    : dateLabel.weekNumber === null
      ? `<div class="overview-today-unknown">设置第一周日期后，这里会按教学周显示重复课程；本地一次性日程不受影响。</div>`
      : `<div class="overview-empty">今天没有安排。<button class="button button-link" type="button" data-action="view-personal">查看完整课表</button></div>`;
  const exams = sortExamRows(state.data.exams.filter((exam) => !/已结束/.test(exam.status))).slice(0, 3);
  const examMarkup = exams.length
    ? `<div class="overview-list">${exams.map((exam) => `<div class="overview-list-row"><span class="overview-list-date">${escapeHtml(exam.date || "—")}</span><span class="overview-list-copy"><strong>${escapeHtml(exam.name)}</strong><span>${escapeHtml([exam.time, exam.place, exam.seat ? `${exam.seat}号` : ""].filter(Boolean).join(" · ") || "信息待发布")}</span></span><span class="overview-list-status">${escapeHtml(exam.countdown)}</span></div>`).join("")}</div>`
    : `<div class="overview-empty">暂无近期考试</div>`;
  const scoreMarkup = state.data.scores.length
    ? `<div class="overview-list">${state.data.scores.slice(0, 3).map((score) => `<div class="overview-score-row"><strong>${escapeHtml(score.name)}</strong><span class="${scoreSemanticClass(score)}">${escapeHtml(score.score || "—")}</span></div>`).join("")}</div>`
    : `<div class="overview-empty">暂无成绩</div>`;
  const cacheNote = personalCacheStatusText() ? `<p class="overview-cache-note">${escapeHtml(personalCacheStatusText())}</p>` : "";
  const localNote = state.localSchedule.corrupted ? `<p class="overview-cache-note">部分本地自定义安排无法读取，学校课表不受影响。</p>` : "";
  const weekContext = dateLabel.weekNumber === null
    ? `<span class="overview-week-context">教学周未设置 <button class="button button-link" type="button" data-action="view-settings">设置 →</button></span>`
    : `<span class="overview-week-context">${escapeHtml(dateLabel.week)}</span>`;
  return `<div class="overview-page">${sectionHeading("总览", "") }<header class="overview-date"><div class="overview-date-main"><strong>${escapeHtml(dateLabel.date)}</strong><span>${escapeHtml(dateLabel.weekday)}</span></div>${weekContext}</header><section class="overview-section overview-priority-section"><div class="overview-section-header"><h3>今日安排</h3><button class="button button-link" type="button" data-action="view-personal">查看课表</button></div>${renderOverviewPriority(next)}</section><section class="overview-section overview-today-section"><div class="overview-section-header"><h3>今天安排</h3><button class="button button-link" type="button" data-action="view-personal">完整课表</button></div>${todayMarkup}</section><div class="overview-columns"><section class="overview-section"><div class="overview-section-header"><h3>近期考试</h3><button class="button button-link" type="button" data-action="view-exams">查看全部</button></div>${examMarkup}</section><section class="overview-section"><div class="overview-section-header"><h3>最新成绩</h3><button class="button button-link" type="button" data-action="view-scores">查看全部</button></div>${scoreMarkup}</section></div>${cacheNote}${localNote}</div>${renderCourseDetailModal()}`;
}

function renderLocalScheduleDetailModal(row) {
  const item = (state.localSchedule.items || []).find((candidate) => candidate.id === row.localId);
  if (!item) return "";
  const display = localScheduleItemDisplayText(item);
  const scheduleDetails = item.type === "event"
    ? [["日期", localScheduleDateText(item.event.date)], ["时间", item.event.allDay ? "全天" : localScheduleClockText(item) || "时间待设置"], ["对应节次", localScheduleSectionText(item) || "未指定"]]
    : [["学期", item.termName || item.termCode || "—"], ["周次", formatWeeksValue(item.course.weekNumbers.join(",")) || "—"], ["星期", localScheduleWeekdayText(item.course.weekdayIndex)], ["节次", localScheduleSectionText(item) || "—"], ["时间", localScheduleClockText(item) || "—"]];
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal local-detail-modal" role="dialog" aria-modal="true" aria-label="自定义安排详情"><div class="detail-modal-head"><div><p class="eyebrow">LOCAL SCHEDULE</p><h3>${escapeHtml(item.title || "未命名安排")}</h3><p>${localScheduleSourceBadge(item)} ${item.enabled ? "" : "已停用"}</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-course">关闭</button></div><div class="detail-grid">${scheduleDetails.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("")}<div><span>地点</span><strong>${escapeHtml(item.location || "—")}</strong></div>${item.teacher ? `<div><span>教师</span><strong>${escapeHtml(item.teacher)}</strong></div>` : ""}</div>${item.note ? `<div class="detail-copy"><span>备注</span><p>${escapeHtml(item.note)}</p></div>` : ""}<div class="local-detail-actions"><button class="button button-primary" type="button" data-action="edit-local-schedule" data-local-schedule-id="${escapeHtml(item.id)}">编辑</button><button class="button button-ghost" type="button" data-action="copy-local-schedule" data-local-schedule-id="${escapeHtml(item.id)}">复制</button><button class="button button-danger" type="button" data-action="delete-local-schedule" data-local-schedule-id="${escapeHtml(item.id)}">删除</button></div></section></div>`;
}

function renderCourseDetailWithLocalOverlay() {
  if (state.selectedCourse?.source === "local") return renderLocalScheduleDetailModal(state.selectedCourse);
  const course = state.selectedCourse;
  if (!course) return "";
  const scope = state.selectedCourseScope || "personal";
  const rows = courseRowsForScope(scope);
  const availability = courseFieldAvailability(rows, scope);
  const rawText = course.raw && typeof course.raw === "object" ? JSON.stringify(course.raw, null, 2) : "";
  const sport = courseIsSport(course);
  const catalogCode = courseCatalogCodeValue(course);
  const sportEntries = sport && !course.sportProjectLoading ? courseIncludedEntries(course) : [];
  const catalogField = sport && catalogCode ? `<div><span>课程代码</span><strong>${escapeHtml(catalogCode)}</strong></div>` : "";
  const assessmentField = availability.assessment ? `<div><span>考核方式</span><strong>${escapeHtml(courseAssessmentValue(course) || "—")}</strong></div>` : "";
  const requirementField = availability.requirement ? `<div><span>课程性质</span><strong>${escapeHtml(courseRequirementValue(course) || "—")}</strong></div>` : "";
  const categoryField = availability.category ? `<div><span>课程类别</span><strong>${escapeHtml(courseCategoryValue(course) || "—")}</strong></div>` : "";
  const sportDetails = sport
    ? `<div class="course-included-panel sport-project-panel"><div class="sport-project-head"><span>原系统体育课“列表”</span>${sportEntries.length ? `<em>${escapeHtml(`${sportEntries.length} 个项目/教学班`)}</em>` : ""}</div>${course.sportProjectLoading ? `<p class="sport-project-status">正在读取原系统弹窗中的项目名称、教师和排课信息…</p>` : ""}${course.sportProjectError ? `<p class="sport-project-status sport-project-error">${escapeHtml(course.sportProjectError)}</p>` : ""}${sportEntries.length ? `<ul>${sportEntries.map((entry) => `<li><strong>${escapeHtml(entry.project || entry.name || entry.text || "体育课程")}</strong><span>${escapeHtml([entry.name !== entry.project && entry.name ? `课程：${entry.name}` : "", entry.catalogCode && `课程号 ${entry.catalogCode}`, entry.teachingCode && `教学班 ${entry.teachingCode}`, entry.weeks, entry.weekday, entry.section, entry.teacher && `教师：${entry.teacher}`, entry.location && `地点：${entry.location}`].filter(Boolean).join(" ｜ "))}</span></li>`).join("")}</ul>` : ""}<small>点击体育课程名称后读取原系统项目列表；原系统没有提供的字段会自动留空。</small></div>`
    : "";
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal" role="dialog" aria-modal="true" aria-label="课程详情"><div class="detail-modal-head"><div><p class="eyebrow">COURSE DETAIL</p><h3>${escapeHtml(course.name || "未命名课程")}</h3></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-course">关闭</button></div><div class="detail-grid"><div><span>课程号 / 教学班号</span><strong>${escapeHtml(course.code || "—")}</strong></div>${catalogField}<div><span>周次</span><strong>${escapeHtml(course.weeks || "—")}</strong></div><div><span>星期</span><strong>${escapeHtml(course.weekday || "—")}</strong></div><div><span>节次 / 时间</span><strong>${escapeHtml([courseSectionLabel(course), courseClockText(course)].filter(Boolean).join(" / ") || "—")}</strong></div><div><span>授课教师</span><strong>${escapeHtml(course.teacher || "—")}</strong></div><div><span>上课地点</span><strong>${escapeHtml(course.location || "—")}</strong></div>${categoryField}${assessmentField}${requirementField}<div><span>学分</span><strong>${escapeHtml(course.credit || "—")}</strong></div></div>${sportDetails}<div class="detail-copy"><span>原系统时间地点</span><p>${escapeHtml(course.detail || course.time || "—")}</p></div>${rawText ? `<details class="raw-details"><summary>查看原始字段</summary><pre>${escapeHtml(rawText)}</pre></details>` : ""}</section></div>`;
}

function personalScheduleActions() {
  return `<div class="button-row schedule-export-action-row"><button class="button button-primary button-small" type="button" data-action="open-local-editor">+ 添加安排</button><button class="button button-soft button-small" type="button" data-action="open-local-manager">管理自定义安排</button>${scheduleExportActions("personal").replace(/^<div class="button-row schedule-export-action-row">|<\/div>$/g, "")}</div>`;
}

function renderCampusPromptModal() {
  if (!state.campus.promptOpen || state.campus.code) return "";
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal campus-setting-modal" role="dialog" aria-modal="true" aria-label="设置默认校区"><div class="detail-modal-head"><div><p class="eyebrow">CAMPUS &amp; CLASS TIME</p><h3>请先选择默认校区</h3><p class="muted">教务系统有时只返回节次。选择校区后，课表才能准确判断上课、下课和“今天已结束”。</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="dismiss-campus-prompt">稍后设置</button></div><label class="settings-field"><span>默认校区</span><select id="campusPromptSelect"><option value="">请选择</option><option value="nanhu">南湖校区</option><option value="hunnan">浑南校区</option></select><small>课程地点如果明确写了“南湖”或“浑南”，会自动优先使用该校区时间。</small></label><div class="settings-actions"><button class="button button-primary" type="button" data-action="save-campus-prompt">保存并查看课表</button></div></section></div>`;
}

function prepareCampusPromptForPersonalView(nextView, previousView = state.view) {
  if (nextView === "personal" && previousView !== "personal" && !state.campus.code) state.campus.promptOpen = true;
}

function renderPersonalWithLocalOverlay() {
  const filterKeys = ["name", "code", "teacher", "location", "time", "weeks", "weekday", "category", "nature", "requirement", "assessment", "examType", "detail", "localDate"];
  const schoolCourses = filterRows(state.data.courses || [], filterKeys, state.filters.personal);
  const mergedRows = mergedPersonalScheduleRows(state.data.courses || []);
  const scheduleRows = filterRows(mergedRows, filterKeys, state.filters.personal);
  const localItems = localScheduleItemsForTerm(state.termCode, true).filter((item) => !state.filters.personal || localScheduleFilterText(localScheduleItemToCourseRow(item)).toLowerCase().includes(state.filters.personal.toLowerCase()));
  const schoolCount = state.data.courses?.length || 0;
  const localCount = localScheduleItemsForTerm(state.termCode, true).length;
  const sourceText = state.data.scheduleSource === "网格" ? "数据来源：课表网格（优先）" : state.data.scheduleSource === "列表" ? "数据来源：课程列表（已整理）" : localCount ? "学校数据 + 本地安排" : "数据来源：未读取到课表数据";
  const sourceClass = state.data.scheduleSource === "网格" || localCount ? "pass" : "";
  const counts = `教务课程 ${schoolCount} 门 · 自定义 ${localCount} 项 · 共 ${scheduleRows.length} 条当前排课`;
  const localSummary = localCount ? `<section class="local-schedule-inline"><div class="local-inline-head"><div><strong>本地自定义安排</strong><span>${localCount} 项；不会被教务刷新覆盖</span></div><button class="button button-ghost button-small" type="button" data-action="open-local-manager">管理</button></div>${renderLocalScheduleRecords(localItems)}</section>` : `<div class="local-add-hint"><strong>想把旁听课、社团或预约加入课表？</strong><button class="button button-link" type="button" data-action="open-local-editor">+ 添加本地安排</button></div>`;
  if (state.scheduleDisplay.personal !== "week") {
    const records = schoolCourses.length
      ? `<details class="course-records-details"><summary>查看本学期教务课程记录（${schoolCourses.length} 条）</summary>${renderCourseRowsTable(schoolCourses, false, "personal")}</details>`
      : "";
    return `<div>${sectionHeading("课表", "今天 / 明天会把教务课程、自定义课程和一次性日程放进同一条时间线。", personalScheduleActions())}<div class="panel"><div class="toolbar"><input data-filter="personal" value="${escapeHtml(state.filters.personal)}" placeholder="搜索课程、教师、时间、地点、周次或日程" /><span class="tag ${sourceClass}">${escapeHtml(sourceText)}</span><span class="muted">${escapeHtml(counts)}</span></div>${renderScheduleDisplayControls()}${renderDailySchedule(scheduleRows, "personal")}${localSummary}${records}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">打开原查询</button>`)}${renderCourseDetailModal()}${renderScheduleExportModal()}${localScheduleModalMarkup()}${renderCampusPromptModal()}</div>`;
  }
  const weekRows = filterScheduleWeekRows(scheduleRows, "personal");
  const grid = renderScheduleGrid(weekRows, "personal");
  const selectedWeek = scheduleWeekValue("personal");
  const gridNotice = scheduleRows.length && !grid
    ? `<div class="schedule-note">当前没有可铺入周表网格的节次；带具体时间的一次性日程会在周表下方的其他日程区域显示。</div>`
    : "";
  return `<div>${sectionHeading("课表", "周表同时显示教务课程、自定义课程和日程；没有节次的一次性日程会列在网格下方。", personalScheduleActions())}<div class="panel"><div class="toolbar"><input data-filter="personal" value="${escapeHtml(state.filters.personal)}" placeholder="搜索课程、教师、时间、地点、周次或日程" /><span class="tag ${sourceClass}">${escapeHtml(sourceText)}</span><span class="muted">${escapeHtml(counts)}</span></div>${renderScheduleDisplayControls()}${renderScheduleWeekControls(scheduleRows, "personal")}${grid}${gridNotice}${localSummary}${schoolCourses.length ? `<details class="course-records-details" open><summary>本学期教务课程记录（${schoolCourses.length} 门课 · ${schoolPersonalScheduleRows(schoolCourses).length} 条排课）</summary>${renderCourseRowsTable(schoolCourses, false, "personal")}</details>` : ""}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">打开原查询</button>`)}${renderCourseDetailModal()}${renderScheduleExportModal()}${localScheduleModalMarkup()}${renderCampusPromptModal()}</div>`;
}

function webVpnBytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function webVpnAesXtime(value) {
  return ((value << 1) ^ (value & 0x80 ? 0x11b : 0)) & 0xff;
}

function webVpnAesExpandKey(key) {
  if (!(key instanceof Uint8Array) || key.length !== 16) throw new Error("WebVPN 兼容密钥长度无效");
  const expanded = new Uint8Array(176);
  const temp = new Uint8Array(4);
  expanded.set(key);
  let generated = 16;
  let rcon = 1;
  while (generated < expanded.length) {
    for (let index = 0; index < 4; index += 1) temp[index] = expanded[generated - 4 + index];
    if (generated % 16 === 0) {
      const first = temp[0];
      temp[0] = WEBVPN_AES_SBOX[temp[1]] ^ rcon;
      temp[1] = WEBVPN_AES_SBOX[temp[2]];
      temp[2] = WEBVPN_AES_SBOX[temp[3]];
      temp[3] = WEBVPN_AES_SBOX[first];
      rcon = webVpnAesXtime(rcon);
    }
    for (let index = 0; index < 4; index += 1) {
      expanded[generated] = expanded[generated - 16] ^ temp[index];
      generated += 1;
    }
  }
  return expanded;
}

function webVpnAesEncryptBlock(block, expandedKey) {
  const value = Uint8Array.from(block);
  const addRoundKey = (round) => {
    const offset = round * 16;
    for (let index = 0; index < 16; index += 1) value[index] ^= expandedKey[offset + index];
  };
  const shiftRows = () => {
    let temp = value[1];
    value[1] = value[5]; value[5] = value[9]; value[9] = value[13]; value[13] = temp;
    temp = value[2]; value[2] = value[10]; value[10] = temp;
    temp = value[6]; value[6] = value[14]; value[14] = temp;
    temp = value[15];
    value[15] = value[11]; value[11] = value[7]; value[7] = value[3]; value[3] = temp;
  };
  const mixColumns = () => {
    for (let column = 0; column < 4; column += 1) {
      const offset = column * 4;
      const a0 = value[offset];
      const a1 = value[offset + 1];
      const a2 = value[offset + 2];
      const a3 = value[offset + 3];
      value[offset] = webVpnAesXtime(a0) ^ (webVpnAesXtime(a1) ^ a1) ^ a2 ^ a3;
      value[offset + 1] = a0 ^ webVpnAesXtime(a1) ^ (webVpnAesXtime(a2) ^ a2) ^ a3;
      value[offset + 2] = a0 ^ a1 ^ webVpnAesXtime(a2) ^ (webVpnAesXtime(a3) ^ a3);
      value[offset + 3] = (webVpnAesXtime(a0) ^ a0) ^ a1 ^ a2 ^ webVpnAesXtime(a3);
    }
  };
  addRoundKey(0);
  for (let round = 1; round <= 10; round += 1) {
    for (let index = 0; index < 16; index += 1) value[index] = WEBVPN_AES_SBOX[value[index]];
    shiftRows();
    if (round < 10) mixColumns();
    addRoundKey(round);
  }
  return value;
}

function webVpnEncryptHostname(hostname) {
  const encoder = new TextEncoder();
  const key = encoder.encode(WEBVPN_COMPAT_KEY);
  const plain = encoder.encode(String(hostname || ""));
  const expandedKey = webVpnAesExpandKey(key);
  let feedback = Uint8Array.from(key);
  const encrypted = new Uint8Array(plain.length);
  for (let offset = 0; offset < plain.length; offset += 16) {
    const stream = webVpnAesEncryptBlock(feedback, expandedKey);
    const size = Math.min(16, plain.length - offset);
    const cipherBlock = new Uint8Array(16);
    for (let index = 0; index < size; index += 1) {
      cipherBlock[index] = plain[offset + index] ^ stream[index];
      encrypted[offset + index] = cipherBlock[index];
    }
    feedback = cipherBlock;
  }
  return webVpnBytesToHex(encrypted);
}

function webVpnUrlFromInput(input) {
  let source = String(input || "").trim();
  if (!source) throw new Error("请输入需要通过 WebVPN 访问的网址");
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(source)) source = `http://${source}`;
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error("网址格式无效，请输入完整域名或 http(s) 地址");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("仅支持 http:// 或 https:// 地址");
  if (!parsed.hostname) throw new Error("网址中缺少可识别的域名");
  if (parsed.username || parsed.password) throw new Error("请勿在网址中填写账号或密码");
  if (parsed.port) throw new Error("暂不支持带自定义端口的网址");
  const keyHex = webVpnBytesToHex(new TextEncoder().encode(WEBVPN_COMPAT_KEY));
  const protocol = parsed.protocol.slice(0, -1);
  const encryptedHostname = webVpnEncryptHostname(parsed.hostname);
  return `https://webvpn.neu.edu.cn/${protocol}/${keyHex}${encryptedHostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

const WEBVPN_QUICK_SITES = [
  ["新版教务系统", "http://jwxt.neu.edu.cn"],
  ["新版选课", "http://jwxk.neu.edu.cn"],
  ["旧版教务系统", "http://219.216.96.4/eams"],
  ["创新创业管理系统", "https://cxcy.neu.edu.cn"],
  ["学生邮件系统", "https://mails.neu.edu.cn"]
];

function updateWebVpnTool(input) {
  state.webvpnTool.input = String(input || "").trim();
  try {
    state.webvpnTool.output = webVpnUrlFromInput(state.webvpnTool.input);
    state.webvpnTool.error = "";
    return true;
  } catch (error) {
    state.webvpnTool.output = "";
    state.webvpnTool.error = error.message || "WebVPN 地址生成失败";
    return false;
  }
}

function renderWebVpnToolModal() {
  if (!state.webvpnTool.open) return "";
  const quickSites = WEBVPN_QUICK_SITES.map(([name, url]) => `<button class="webvpn-quick-site" type="button" data-action="webvpn-use-site" data-webvpn-url="${escapeHtml(url)}">${escapeHtml(name)}</button>`).join("");
  const output = state.webvpnTool.output
    ? `<label class="webvpn-tool-field"><span>生成结果</span><textarea id="webvpnOutput" readonly>${escapeHtml(state.webvpnTool.output)}</textarea></label><div class="webvpn-tool-actions"><button class="button button-primary" type="button" data-action="copy-webvpn-url">复制地址</button><button class="button button-ghost" type="button" data-action="open-webvpn-url">直接访问</button></div>`
    : "";
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal webvpn-tool-modal" role="dialog" aria-modal="true" aria-label="WebVPN 地址生成器"><div class="detail-modal-head"><div><p class="eyebrow">WEBVPN URL</p><h3>WebVPN 地址生成器</h3><p class="muted">把普通 HTTP(S) 地址转换成东北大学 WebVPN 代理地址。</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-webvpn-tool">关闭</button></div><div class="webvpn-quick-sites"><span>常用网站</span><div>${quickSites}</div></div><label class="webvpn-tool-field"><span>原始网址</span><div class="webvpn-tool-input-row"><input id="webvpnUrlInput" type="url" inputmode="url" autocomplete="off" spellcheck="false" value="${escapeHtml(state.webvpnTool.input)}" placeholder="https://example.com/path" /><button class="button button-primary" type="button" data-action="generate-webvpn-url">转换</button></div></label>${state.webvpnTool.error ? `<p class="webvpn-tool-error" role="alert">${escapeHtml(state.webvpnTool.error)}</p>` : ""}${output}<div class="settings-callout webvpn-tool-privacy"><strong>完全本地处理</strong><span>网址不会上传到任何服务器；生成结果仍需使用东北大学统一身份认证登录 WebVPN。部分网站经代理后可能功能受限。</span></div></section></div>`;
}

async function copyGeneratedWebVpnUrl() {
  const output = state.webvpnTool.output || "";
  if (!output) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(output);
    else {
      const textarea = document.getElementById("webvpnOutput");
      textarea?.focus();
      textarea?.select();
      if (!document.execCommand("copy")) throw new Error("浏览器拒绝复制");
    }
    showToast("WebVPN 地址已复制。", "success");
  } catch (error) {
    showToast(`复制失败：${error.message || "请手动选中地址复制"}`, "error");
  }
}

function openGeneratedWebVpnUrl() {
  const url = state.webvpnTool.output || "";
  if (!url.startsWith("https://webvpn.neu.edu.cn/")) return;
  if (globalThis.AndroidApi?.openWebVpnUrl) globalThis.AndroidApi.openWebVpnUrl(url);
  else if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
}

function currentTermSettingsBlock() {
  const terms = currentTermCandidates();
  const selectedCode = configuredCurrentTermCode() || currentTermCodeFor(terms);
  const options = terms.length
    ? terms.map((term) => `<option value="${escapeHtml(term.code)}" ${term.code === selectedCode ? "selected" : ""}>${escapeHtml(term.name || term.code)}</option>`).join("")
    : `<option value="">暂无可选学期</option>`;
  const source = state.currentTerm.mode === "manual"
    ? "手动设置"
    : state.currentTerm.detectedSource || "等待教务系统同步";
  const syncedText = state.currentTerm.syncedAt ? cacheDateText(state.currentTerm.syncedAt) : "尚未同步";
  const syncing = state.currentTerm.syncing;
  return `<section class="settings-section current-term-settings"><div class="settings-intro"><h3>当前学期</h3><p>总览、个人课表、成绩、考试和新建自定义安排等需要“当前学期”的功能统一读取这里。各查询页仍可临时切换其他学期，不会修改本设置。</p></div><label class="settings-field"><span>当前学期</span><select id="currentTermSelect" ${terms.length ? "" : "disabled"}>${options}</select><small>当前：${escapeHtml(currentTermName(selectedCode))} · 来源：${escapeHtml(source)} · ${escapeHtml(syncedText)}</small></label>${state.currentTerm.error ? `<div class="schedule-note">${escapeHtml(state.currentTerm.error)}</div>` : ""}<div class="settings-actions"><button class="button button-primary" type="button" data-action="save-current-term" ${terms.length || selectedCode ? "" : "disabled"}>手动设为当前学期</button><button class="button button-ghost" type="button" data-action="sync-current-term" ${syncing ? "disabled" : ""}>${syncing ? "正在同步…" : "从教务系统同步"}</button></div><div class="settings-callout"><strong>${state.currentTerm.mode === "manual" ? "当前使用手动设置" : "当前跟随教务系统"}</strong><span>${state.currentTerm.mode === "manual" ? "点击“从教务系统同步”可恢复自动模式；之后学校当前学期变化时会随正常刷新自动更新。" : "正常刷新会继续检测学校当前学期；某个查询页手动选择历史学期只影响该页面。"}</span></div></section>`;
}

function renderSettingsWithLocalOverlay() {
  const firstWeekDate = normalizeCalendarDate(state.calendar.firstWeekStart);
  const invalidWeekday = firstWeekDate && firstWeekDate.getDay() !== 0;
  const currentText = firstWeekDate ? `${calendarDateText(firstWeekDate)} · ${SUNDAY_FIRST_DAY_NAMES[firstWeekDate.getDay()]}` : "尚未设置";
  const configuredLoginMethod = IS_ANDROID_APP ? androidLoginMethod() : (readStoredSetting("zhizhang.loginMethod") === "wechat" ? "wechat" : "password");
  const toastEnabled = toastNotificationsEnabled();
  const cacheStatus = personalCacheStatusText() || "尚未缓存个人教务数据";
  const configuredCurrentCode = currentTermCodeFor(currentTermCandidates());
  const localCount = (state.localSchedule.items || []).filter((item) => item.termCode === configuredCurrentCode || !configuredCurrentCode).length;
  const curriculumMore = IS_ANDROID_APP ? "" : `<div class="settings-row settings-link-row"><div><strong>培养计划</strong><small>查看培养方案、课组和课程完成情况</small></div><button class="button button-ghost" type="button" data-action="view-curriculum">打开</button></div>`;
  const courseOutlineMore = IS_ANDROID_APP ? "" : `<div class="settings-row settings-link-row"><div><strong>课程大纲</strong><small>查询课程目录并查看完整课程大纲</small></div><button class="button button-ghost" type="button" data-action="view-course-outline">打开</button></div>`;
  const cachePrivacy = IS_ANDROID_APP
    ? "查询缓存按学号隔离，不包含密码、验证码、Cookie 或令牌；Android 内置登录凭据另行由 Keystore 加密保存。"
    : "缓存按学号隔离，只保存页面展示所需查询结果；不会保存密码、验证码、Cookie 或令牌。";
  const cacheBlock = `<section class="settings-section"><div class="settings-intro"><h3>教务数据缓存</h3><p>${escapeHtml(cacheStatus)}。只保存页面展示所需的查询结果，教务系统暂时不可用时仍可查看上次结果。</p></div>${IS_ANDROID_APP ? `<div class="settings-actions"><button class="button button-ghost" type="button" data-action="clear-personal-cache">清除教务缓存</button></div>` : ""}<div class="settings-callout"><strong>隐私</strong><span>${escapeHtml(cachePrivacy)}</span></div></section>`;
  const localBlock = `<section class="settings-section"><div class="settings-intro"><h3>自定义课表</h3><p>${localCount} 条本地安排。手动创建的课程和日程仅保存在本机，并与教务缓存分开存储。</p></div><div class="settings-actions"><button class="button button-primary" type="button" data-action="open-local-manager">管理自定义安排</button><button class="button button-ghost" type="button" data-action="open-local-editor">+ 添加安排</button></div><div class="settings-actions"><button class="button button-danger" type="button" data-action="clear-local-schedule">清除全部自定义安排</button></div><div class="settings-callout"><strong>不会影响教务数据</strong><span>清除教务缓存不会删除自定义安排；清除自定义安排也不会删除成绩、考试或学校课表。</span></div></section>`;
  const loginDescription = IS_ANDROID_APP
    ? "教务或 E 码通任一会话失效时，都会独立在后台使用本机加密凭据恢复；学校原网页入口始终保留。"
    : "下次打开教务系统登录页时默认进入所选方式。";
  const loginOptions = IS_ANDROID_APP
    ? `<option value="builtin" ${configuredLoginMethod === "builtin" ? "selected" : ""}>内置登录（默认）</option><option value="password" ${configuredLoginMethod === "password" ? "selected" : ""}>原网页账密登录</option><option value="wechat" ${configuredLoginMethod === "wechat" ? "selected" : ""}>微信二维码登录</option>`
    : `<option value="password" ${configuredLoginMethod === "password" ? "selected" : ""}>账号密码登录</option><option value="wechat" ${configuredLoginMethod === "wechat" ? "selected" : ""}>微信扫码登录</option>`;
  const loginPrivacy = IS_ANDROID_APP
    ? "学号和密码只使用 Android Keystore 加密保存在本机；验证码不保存。"
    : "插件不会保存账号、密码或验证码。";
  const moreToolsBlock = `<section class="settings-section settings-tools-section"><div class="settings-intro"><h3>更多工具</h3><p>低频功能集中在这里。</p></div><div class="settings-row settings-link-row"><div><strong>WebVPN 地址生成器</strong><small>把普通网址转换为东北大学校外访问链接</small></div><button class="button button-primary" type="button" data-action="open-webvpn-tool">生成</button></div><div class="settings-row settings-link-row"><div><strong>全校课表</strong><small>查询班级、教师和教室</small></div><button class="button button-ghost" type="button" data-action="view-all">打开</button></div>${curriculumMore}${courseOutlineMore}<div class="settings-row settings-link-row"><div><strong>原教务系统</strong><small>登录、查看原页面或处理未发布数据</small></div><button class="button button-ghost" type="button" data-action="open-portal">打开</button></div></section>`;
  const toastBlock = `<section class="settings-section"><div class="settings-intro"><h3>状态提示</h3><p>控制页面底部的临时 Toast 提示。</p></div><label class="settings-row settings-toggle-row" for="toastNotificationsEnabled"><div><strong>显示底部 Toast 提示</strong><small>关闭后隐藏所有底部 Toast，包括登录状态、缓存和数据刷新提示。</small></div><span class="settings-switch"><input id="toastNotificationsEnabled" type="checkbox" role="switch" ${toastEnabled ? "checked" : ""} /><span class="settings-switch-track" aria-hidden="true"></span></span></label></section>`;
  const campusBlock = `<section class="settings-section campus-settings"><div class="settings-intro"><h3>默认校区与上课时间</h3><p>当教务课表只提供节次时，用于计算正在上课、下一节课和今日是否结束。课程地点中明确的校区会优先于此设置。</p></div><label class="settings-field"><span>默认校区</span><select id="campusSettingSelect"><option value="" ${state.campus.code ? "" : "selected"}>未设置</option><option value="nanhu" ${state.campus.code === CAMPUS_CODES.NANHU ? "selected" : ""}>南湖校区</option><option value="hunnan" ${state.campus.code === CAMPUS_CODES.HUNNAN ? "selected" : ""}>浑南校区</option></select><small>当前：${escapeHtml(campusLabel(state.campus.code))}。南湖早课 08:00 开始，浑南早课 08:30 开始；第 5–12 节时间相同。</small></label><div class="settings-actions"><button class="button button-primary" type="button" data-action="save-campus-setting">保存校区</button></div><div class="settings-callout"><strong>节次时间</strong><span>南湖1–4节：08:00–11:40；浑南1–4节：08:30–12:10；5–8节：14:00–17:40；9–12节：18:30–22:00。</span></div></section>`;
  return `<div>${sectionHeading("设置", "") }<div class="panel settings-panel">${moreToolsBlock}${currentTermSettingsBlock()}${campusBlock}<section class="settings-section"><div class="settings-intro"><h3>课表</h3><p>设置第一周的周日，日视图和周表会据此定位重复课程；一次性日程按真实日期显示。</p></div><label class="settings-field"><span>第一周周日</span><input id="firstWeekStartInput" type="date" value="${escapeHtml(state.calendar.firstWeekStart)}" /><small>当前：${escapeHtml(currentText)}。必须选择周日。</small></label>${invalidWeekday ? `<div class="schedule-note">保存的日期不是周日，请重新选择。</div>` : ""}<div class="settings-actions"><button class="button button-primary" type="button" data-action="save-calendar-settings">保存</button><button class="button button-ghost" type="button" data-action="clear-calendar-settings">清除日期</button></div></section><section class="settings-section"><div class="settings-intro"><h3>账户</h3><p>${escapeHtml(loginDescription)}</p></div><label class="settings-field"><span>默认登录方式</span><select id="loginMethodSelect">${loginOptions}</select><small>${escapeHtml(loginPrivacy)}</small></label></section>${toastBlock}${cacheBlock}${localBlock}</div>${renderWebVpnToolModal()}${renderCourseDetailModal()}${localScheduleModalMarkup()}</div>`;
}

function updatePersonalTermSelect() {
  if (!elements.termSelect) return;
  const terms = localScheduleTerms();
  if (!terms.length) {
    elements.termSelect.innerHTML = `<option value="">暂无缓存学期</option>`;
    elements.termSelect.disabled = true;
    return;
  }
  elements.termSelect.innerHTML = terms.map((term) => `<option value="${escapeHtml(term.code)}">${escapeHtml(term.name || term.code)}</option>`).join("");
  elements.termSelect.value = state.termCode;
  elements.termSelect.disabled = false;
}

function scheduleExportRows(scope = "personal") {
  const source = scope === "all-detail"
    ? (state.allDetail?.courses || [])
    : mergedPersonalScheduleRows(state.data.courses || []);
  const normalized = normalizedScheduleCourses(source);
  const expanded = scope === "all-detail" ? normalized.flatMap((course) => expandMappedCourse(course)) : normalized;
  const seen = new Set();
  return expanded.filter((course) => {
    const range = courseSectionRange(course);
    const key = [course.source || "school", course.localId || course.code, course.name, courseDayIndex(course), range ? `${range.start}-${range.end}` : course.section, [...courseWeekNumbers(course)].sort((a, b) => a - b).join(","), course.localDate, course.teacher, course.location].map((value) => String(value ?? "").trim()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scheduleExportFilteredRows(rows, selectedWeek) {
  if (selectedWeek === "all") return rows;
  const week = Number(selectedWeek);
  if (!Number.isInteger(week) || week <= 0) return rows;
  return (rows || []).filter((course) => {
    if (course.localDate && normalizeCalendarDate(course.localDate)) {
      const info = academicDayInfo(normalizeCalendarDate(course.localDate));
      return info.week === null || info.week === week;
    }
    const weeks = courseWeekNumbers(course);
    return !weeks.size || weeks.has(week);
  });
}

function scheduleCsvSchoolRows() {
  const courses = Array.isArray(state.data.courses) ? state.data.courses : [];
  const source = schoolPersonalScheduleRows(courses);
  const hiddenKeys = new Set((state.localSchedule.hiddenSchoolEntries || []).filter((entry) => !entry.termCode || entry.termCode === state.termCode).map((entry) => entry.key));
  return source.filter((course) => course?.source !== "local" && !hiddenKeys.has(schoolScheduleOccurrenceKey(course)));
}

function localScheduleCsvEntries(scope = "personal") {
  if (scope !== "personal") {
    const source = scope === "all-detail" ? (state.allDetail?.courses || state.allDetail?.rawRows || []) : (state.allRows || []).filter(isCourseDetailRow);
    const seen = new Set();
    return expandedScheduleOccurrenceRows(source).map((course) => {
      const range = courseSectionRange(course);
      return { courseName: displayValue(course.name, ""), weekday: courseDayIndex(course) >= 0 ? String(courseDayIndex(course) === 0 ? 7 : courseDayIndex(course)) : "", startSection: range ? String(range.start) : "", endSection: range ? String(range.end) : "", teacher: course.teacher || "", location: course.location || "", weekText: scheduleCsvWeekText(course) };
    }).filter((entry) => entry.courseName).filter((entry) => {
      const key = Object.values(entry).join("\u001f");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const mapped = expandedScheduleOccurrenceRows(scheduleCsvSchoolRows());
  const localItems = localScheduleItemsForTerm(state.termCode);
  const entries = [];
  let skipped = 0;
  const seen = new Set();
  const add = (entry) => {
    if (!entry.courseName) return;
    const key = Object.values(entry).join("\u001f");
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  mapped.forEach((course) => {
    const range = courseSectionRange(course);
    add({ courseName: displayValue(course.name, ""), weekday: courseDayIndex(course) >= 0 ? String(courseDayIndex(course) === 0 ? 7 : courseDayIndex(course)) : "", startSection: range ? String(range.start) : "", endSection: range ? String(range.end) : "", teacher: course.teacher || "", location: course.location || "", weekText: scheduleCsvWeekText(course) });
  });
  localItems.forEach((item) => {
    const row = localScheduleItemToCourseRow(item);
    if (item.type === "event") {
      const info = normalizeCalendarDate(item.event.date) ? academicDayInfo(normalizeCalendarDate(item.event.date)) : null;
      const range = scheduleItemSectionRange(row);
      if (!info || info.week === null || !range) {
        skipped += 1;
        return;
      }
      add({ courseName: item.title, weekday: String(info.weekdayIndex === 0 ? 7 : info.weekdayIndex), startSection: String(range.start), endSection: String(range.end), teacher: item.teacher || "", location: item.location || "", weekText: `${info.week}周` });
      return;
    }
    const range = scheduleItemSectionRange(row);
    add({ courseName: item.title, weekday: row.weekday && courseDayIndex(row) >= 0 ? String(courseDayIndex(row) === 0 ? 7 : courseDayIndex(row)) : "", startSection: range ? String(range.start) : "", endSection: range ? String(range.end) : "", teacher: item.teacher || "", location: item.location || "", weekText: formatWeeksValue(item.course.weekNumbers.join(",")) });
  });
  entries.skippedCount = skipped;
  state.localSchedule.lastCsvSkipped = skipped;
  return entries;
}

function localScheduleCsvHasRows(scope = "personal") {
  return localScheduleCsvEntries(scope).length > 0;
}

function localExportScheduleCsv(scope = "personal") {
  const entries = localScheduleCsvEntries(scope);
  if (!entries.length) {
    if (entries.skippedCount) setNotice(`当前没有可用的 WakeUp 课程格式记录；${entries.skippedCount} 条一次性日程缺少教学周或节次。`, "error");
    else setNotice("当前没有可导出的课表记录，请先查询或刷新课表。", "error");
    return false;
  }
  const saved = downloadScheduleCsv(buildScheduleCsv(entries), scheduleCsvFileName(scope));
  if (saved && entries.skippedCount) setNotice(`CSV 已导出；${entries.skippedCount} 条仅含具体时间或缺少教学周/节次的一次性日程无法用 WakeUp 课程格式表示，因此未包含。`, "success");
  return saved;
}

function scheduleExportCourseBadge(course, scope = "personal") {
  if (course?.source === "local") return course.localType === "event" ? "自定义日程" : "自定义课程";
  if (scope === "personal") return scheduleExportIsPracticeCourse(course) ? "实验实践课程" : "普通课程";
  return scheduleExportCategoryLabel(course);
}

function scheduleExportEntryText(course, selectedWeek, scope = "personal") {
  const range = courseSectionRange(course);
  const section = range ? (range.start === range.end ? `第${range.start}节` : `第${range.start}-${range.end}节`) : "";
  const clock = courseClockText(course);
  const weekText = selectedWeek === "all" ? (course.weeks || (course.localDate ? localScheduleDateText(course.localDate) : "周次待识别")) : `第${selectedWeek}周`;
  return {
    title: course.name || "未命名安排",
    schedule: [weekText, course.weekday || (course.localDate ? localScheduleDateText(course.localDate) : "星期待识别"), section, clock || (course.localAllDay ? "全天" : "")].filter(Boolean).join(" · "),
    teacher: course.teacher || (course.source === "local" ? "自定义安排" : "教师待识别"),
    location: course.location || course.detail || "地点待识别",
    code: course.source === "local" ? "本地安排" : course.code || "无课程号",
    tags: [courseAssessmentValue(course), courseRequirementValue(course), course.source === "local" ? (course.localType === "event" ? "日程" : "自定义") : scope === "all-detail" ? courseCategoryValue(course) : ""].filter(Boolean).join(" · ")
  };
}

function localScheduleInputValue(id) {
  return document.getElementById(id)?.value || "";
}

function syncLocalScheduleEndSectionSelect(startValue = localScheduleInputValue("localStartSection")) {
  const endSelect = document.getElementById("localEndSection");
  if (!endSelect) return;
  const start = localScheduleInteger(startValue, null);
  [...endSelect.options].forEach((option) => {
    option.hidden = Boolean(start && option.value && Number(option.value) < start);
  });
  if (!start) {
    endSelect.value = "";
    return;
  }
  if (endSelect.value && Number(endSelect.value) < start) endSelect.value = "";
  if (!endSelect.value) endSelect.value = String(start);
}

function localScheduleFormCandidate() {
  const draft = state.localSchedule.draft || localScheduleDraftFromItem(null, "course");
  const type = draft.type === "event" ? "event" : "course";
  const title = localScheduleTrim(localScheduleInputValue("localTitle"), 160);
  const termCode = localScheduleTrim(localScheduleInputValue("localTermCode") || state.termCode, 80);
  const termName = localScheduleTermName(termCode);
  const teacher = localScheduleTrim(localScheduleInputValue("localTeacher"), 120);
  const location = localScheduleTrim(localScheduleInputValue("localLocation"), 180);
  const note = localScheduleTrim(localScheduleInputValue("localNote"), 1000);
  const colorKey = document.querySelector("input[name='localColorKey']:checked")?.value || draft.colorKey || "blue";
  const startTime = localScheduleTime(localScheduleInputValue("localStartTime"));
  const endTime = localScheduleTime(localScheduleInputValue("localEndTime"));
  const startSection = localScheduleInputValue("localStartSection");
  const endSection = localScheduleInputValue("localEndSection");
  if (type === "event") {
    const allDay = Boolean(document.getElementById("localEventAllDay")?.checked);
    return normalizeLocalScheduleItem({
      id: draft.id,
      type,
      termCode,
      termName,
      title,
      teacher,
      location,
      note,
      colorKey,
      createdAt: draft.createdAt,
      event: { date: localScheduleDate(localScheduleInputValue("localEventDate")), allDay, startTime: allDay ? "" : startTime, endTime: allDay ? "" : endTime, startSection: startSection ? Number(startSection) : null, endSection: endSection ? Number(endSection) : null }
    });
  }
  const checkedWeeks = [...document.querySelectorAll("[data-local-week]:checked")].map((input) => Number(input.value)).filter((week) => week > 0);
  const repeat = document.getElementById("localWeekRepeat")?.value || "every";
  const weekStartValue = localScheduleInteger(localScheduleInputValue("localWeekStart"), null);
  const weekEndValue = localScheduleInteger(localScheduleInputValue("localWeekEnd"), null);
  const weekStart = weekStartValue === null ? null : Math.max(1, Math.min(60, weekStartValue));
  const weekEnd = weekStart === null ? null : Math.max(weekStart, Math.min(60, weekEndValue === null ? weekStart : weekEndValue));
  const weekNumbers = repeat === "custom"
    ? checkedWeeks
    : weekStart === null || weekEnd === null
      ? []
      : Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index).filter((week) => repeat === "odd" ? week % 2 === 1 : repeat === "even" ? week % 2 === 0 : true);
  return normalizeLocalScheduleItem({
    id: draft.id,
    type,
    termCode,
    termName,
    title,
    teacher,
    location,
    note,
    colorKey,
    createdAt: draft.createdAt,
    course: { weekNumbers, weekdayIndex: localScheduleInputValue("localWeekday") === "" ? null : Number(localScheduleInputValue("localWeekday")), startSection: startSection ? Number(startSection) : null, endSection: endSection ? Number(endSection) : null, startTime, endTime }
  });
}

function localScheduleValidate(item) {
  if (!item.title) return item.type === "event" ? "请填写日程标题" : "请填写课程名称";
  if (!item.termCode) return "请选择学期";
  if (item.type === "course") {
    if (!item.course.weekNumbers.length) return "请选择至少一个教学周";
    if (!Number.isInteger(item.course.weekdayIndex)) return "请选择星期";
    if (!item.course.startSection || !item.course.endSection) return "请选择开始和结束节次";
    if (item.course.endSection < item.course.startSection) return "结束节次不能早于开始节次";
    if ((item.course.startTime && !item.course.endTime) || (!item.course.startTime && item.course.endTime)) return "开始时间和结束时间需要同时填写";
    if (item.course.startTime && item.course.endTime && overviewClockMinutes(item.course.startTime) >= overviewClockMinutes(item.course.endTime)) return "结束时间必须晚于开始时间";
  } else {
    if (!item.event.date) return "请选择日程日期";
    if (item.event.startSection && item.event.endSection && item.event.endSection < item.event.startSection) return "结束节次不能早于开始节次";
    if (!item.event.allDay && ((item.event.startTime && !item.event.endTime) || (!item.event.startTime && item.event.endTime))) return "开始时间和结束时间需要同时填写";
    if (!item.event.allDay && item.event.startTime && item.event.endTime && overviewClockMinutes(item.event.startTime) >= overviewClockMinutes(item.event.endTime)) return "结束时间必须晚于开始时间";
  }
  return "";
}

function findLocalScheduleConflicts(candidate) {
  const candidateRow = localScheduleItemToCourseRow(candidate);
  const hidden = new Set((state.localSchedule.hiddenSchoolEntries || [])
    .filter((entry) => !entry.termCode || entry.termCode === candidate.termCode)
    .map((entry) => entry.key));
  const conflicts = [];
  const schoolRows = !state.termCode || candidate.termCode === state.termCode
    ? schoolPersonalScheduleRows(state.data.courses || [])
    : [];
  schoolRows.filter((row) => !hidden.has(schoolScheduleOccurrenceKey(row))).forEach((existing) => {
    const overlap = compareScheduleItemsOverlap(candidateRow, existing);
    if (overlap.status !== SCHEDULE_COLLISION_STATUS.NONE) {
      conflicts.push({
        existing,
        existingItem: null,
        status: overlap.status,
        reason: overlap.reason,
        reasons: overlap.reasons || [],
        evidence: overlap.evidence || {}
      });
    }
  });
  (state.localSchedule.items || [])
    .filter((item) => item.termCode === candidate.termCode && item.id !== candidate.id && item.enabled !== false)
    .forEach((existingItem) => {
      const existing = localScheduleItemToCourseRow(existingItem);
      const overlap = compareScheduleItemsOverlap(candidateRow, existing);
      if (overlap.status !== SCHEDULE_COLLISION_STATUS.NONE) {
        conflicts.push({
          existing,
          existingItem,
          status: overlap.status,
          reason: overlap.reason,
          reasons: overlap.reasons || [],
          evidence: overlap.evidence || {}
        });
      }
    });
  return conflicts;
}

async function commitLocalSchedule(candidate, choice = "both") {
  const conflicts = state.localSchedule.conflict?.conflicts || [];
  if (choice === "existing") {
    state.localSchedule.conflict = null;
    state.localSchedule.editorOpen = false;
    state.localSchedule.editorError = "";
    setNotice("已保留现有安排，本次自定义安排未保存。", "success");
    render();
    return false;
  }
  const nextItems = (state.localSchedule.items || []).filter((item) => item.id !== candidate.id);
  if (choice === "new") {
    conflicts.filter((conflict) => conflict.status === SCHEDULE_COLLISION_STATUS.CONFIRMED).forEach((conflict) => {
      if (conflict.existingItem) {
        const old = nextItems.find((item) => item.id === conflict.existingItem.id);
        if (old) old.enabled = false;
      } else if (conflict.existing) {
        const key = schoolScheduleOccurrenceKey(conflict.existing);
        if (!state.localSchedule.hiddenSchoolEntries.some((entry) => entry.key === key && (!entry.termCode || entry.termCode === candidate.termCode))) {
          state.localSchedule.hiddenSchoolEntries.push({ key, termCode: candidate.termCode, label: conflict.existing.name || "教务排课", hiddenByLocalId: candidate.id, createdAt: localScheduleNow() });
        }
      }
    });
  }
  nextItems.push(candidate);
  state.localSchedule.items = nextItems;
  state.localSchedule.conflict = null;
  state.localSchedule.editorOpen = false;
  state.localSchedule.editingId = "";
  state.localSchedule.draft = null;
  state.localSchedule.editorError = "";
  await persistLocalSchedule();
  updatePersonalTermSelect();
  setNotice(choice === "new" ? "已保存；冲突教务排课仅在本地组合课表中隐藏。" : "自定义安排已保存。", "success");
  render();
  return true;
}

async function saveLocalScheduleFromEditor() {
  const candidate = localScheduleFormCandidate();
  state.localSchedule.draft = candidate;
  const error = localScheduleValidate(candidate);
  if (error) {
    state.localSchedule.editorError = error;
    render();
    return;
  }
  const conflicts = findLocalScheduleConflicts(candidate);
  if (conflicts.length) {
    state.localSchedule.conflict = { candidate, conflicts };
    render();
    return;
  }
  await commitLocalSchedule(candidate, "both");
}

function openLocalScheduleEditor(item = null, type = "course") {
  state.selectedCourse = null;
  state.localSchedule.editingId = item?.id || "";
  state.localSchedule.draft = localScheduleDraftFromItem(item, type);
  state.localSchedule.editorError = "";
  state.localSchedule.conflict = null;
  state.localSchedule.editorOpen = true;
  state.localSchedule.managerOpen = false;
  render();
}

async function clearAllLocalSchedule() {
  const confirmed = typeof window.confirm === "function"
    ? window.confirm("确定清除全部自定义安排？\n只删除你手动创建的数据，不影响教务系统课程。")
    : true;
  if (!confirmed) return;
  await clearLocalSchedule(state.localSchedule.profileKey || localScheduleProfileKey());
  state.localSchedule.items = [];
  state.localSchedule.hiddenSchoolEntries = [];
  state.localSchedule.editorOpen = false;
  state.localSchedule.managerOpen = false;
  state.localSchedule.conflict = null;
  state.localSchedule.draft = null;
  state.localSchedule.lastCsvSkipped = 0;
  setNotice("已清除全部自定义安排；教务数据未受影响。", "success");
  render();
}

elements.content.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (!["open-local-editor", "open-local-manager", "close-local-editor", "local-editor-type", "save-local-schedule", "close-local-conflict", "resolve-local-conflict", "show-local-schedule", "edit-local-schedule", "copy-local-schedule", "delete-local-schedule", "toggle-local-schedule", "restore-hidden-school", "close-local-manager", "clear-local-schedule"].includes(action)) return;
  event.stopImmediatePropagation?.();
  if (action === "open-local-editor") return openLocalScheduleEditor();
  if (action === "open-local-manager") {
    state.localSchedule.managerOpen = true;
    state.localSchedule.editorOpen = false;
    state.localSchedule.conflict = null;
    render();
    return;
  }
  if (action === "close-local-editor") {
    state.localSchedule.editorOpen = false;
    state.localSchedule.editingId = "";
    state.localSchedule.draft = null;
    state.localSchedule.editorError = "";
    render();
    return;
  }
  if (action === "local-editor-type") {
    const nextType = button.dataset.localType === "event" ? "event" : "course";
    const previous = state.localSchedule.draft || localScheduleDraftFromItem(null, nextType);
    const next = localScheduleDraftFromItem(null, nextType);
    next.id = previous.id;
    next.createdAt = previous.createdAt;
    next.title = previous.title;
    next.termCode = previous.termCode || state.termCode;
    next.termName = previous.termName || localScheduleTermName(next.termCode);
    next.teacher = previous.teacher;
    next.location = previous.location;
    next.note = previous.note;
    next.colorKey = previous.colorKey;
    state.localSchedule.draft = next;
    state.localSchedule.editorError = "";
    render();
    return;
  }
  if (action === "save-local-schedule") return saveLocalScheduleFromEditor();
  if (action === "close-local-conflict") {
    state.localSchedule.conflict = null;
    render();
    return;
  }
  if (action === "resolve-local-conflict") {
    const choice = button.dataset.conflictChoice || "both";
    const candidate = state.localSchedule.conflict?.candidate;
    if (candidate) await commitLocalSchedule(candidate, choice);
    return;
  }
  if (action === "show-local-schedule") {
    const item = (state.localSchedule.items || []).find((candidate) => candidate.id === button.dataset.localScheduleId);
    if (!item) return;
    state.selectedCourse = localScheduleItemToCourseRow(item);
    state.selectedCourseScope = "personal";
    state.localSchedule.managerOpen = false;
    render();
    return;
  }
  const item = (state.localSchedule.items || []).find((candidate) => candidate.id === button.dataset.localScheduleId);
  if (action === "edit-local-schedule" && item) return openLocalScheduleEditor(item, item.type);
  if (action === "copy-local-schedule" && item) {
    const copy = localScheduleDraftFromItem(item, item.type);
    copy.id = localScheduleId();
    copy.title = `${copy.title}（副本）`;
    copy.createdAt = localScheduleNow();
    copy.updatedAt = copy.createdAt;
    return openLocalScheduleEditor(copy, copy.type);
  }
  if (action === "delete-local-schedule" && item) {
    const confirmed = typeof window.confirm === "function" ? window.confirm(`删除“${item.title}”？\n删除后无法自动恢复。`) : true;
    if (!confirmed) return;
    state.localSchedule.items = state.localSchedule.items.filter((candidate) => candidate.id !== item.id);
    state.localSchedule.hiddenSchoolEntries = state.localSchedule.hiddenSchoolEntries.filter((entry) => entry.hiddenByLocalId !== item.id);
    if (state.selectedCourse?.localId === item.id) state.selectedCourse = null;
    await persistLocalSchedule();
    setNotice(`已删除“${item.title}”。`, "success");
    render();
    return;
  }
  if (action === "toggle-local-schedule" && item) {
    item.enabled = !item.enabled;
    item.updatedAt = localScheduleNow();
    await persistLocalSchedule();
    setNotice(item.enabled ? "自定义安排已启用。" : "自定义安排已停用。", "success");
    render();
    return;
  }
  if (action === "restore-hidden-school") {
    const key = button.dataset.hiddenSchoolKey || "";
    const termCode = button.dataset.hiddenSchoolTerm || "";
    state.localSchedule.hiddenSchoolEntries = state.localSchedule.hiddenSchoolEntries.filter((entry) => entry.key !== key || (termCode && entry.termCode !== termCode));
    await persistLocalSchedule();
    setNotice("已恢复显示这条教务排课。", "success");
    render();
    return;
  }
  if (action === "close-local-manager") {
    state.localSchedule.managerOpen = false;
    render();
    return;
  }
  if (action === "clear-local-schedule") return clearAllLocalSchedule();
});

elements.content.addEventListener("change", (event) => {
  if (event.target.id !== "localManagerFilter") return;
  event.stopImmediatePropagation?.();
  state.localSchedule.filter = event.target.value || "all";
  render();
});




function courseChipMarkup(course, scope = "personal", extraClass = "", style = "", availability = null) {
  const clockText = extractClockText(course.time) || localScheduleClockText(course);
  const timeText = [course.weeks, course.weekday, courseSectionLabel(course), clockText].filter((value) => value && value !== "节次待识别").join(" ") || (course.localDate ? `${course.localDate} ${clockText}`.trim() : "时间待识别");
  const placeText = [course.teacher, course.location].filter(Boolean).join(" · ") || course.detail || "地点待识别";
  const className = ["course-chip", extraClass, course.source === "local" ? `local-schedule-chip local-schedule-color-${course.localColorKey || "blue"}` : ""].filter(Boolean).join(" ");
  const badge = course.source === "local" ? localScheduleSourceBadge(course) : "";
  return `<button class="${className}" ${courseActionAttributes(course, scope)} style="${style}" title="点击查看课程详情"><strong>${escapeHtml(course.name || "未命名课程")}</strong>${badge}<span>${escapeHtml(timeText)}</span><span>${escapeHtml(placeText)}</span>${courseTagsMarkup(course, availability || { assessment: true, requirement: true })}</button>`;
}

function courseWeekNumbers(course) {
  const text = displayValue(course?.weeks, "");
  const numbers = new Set();
  [...text.matchAll(/(\d+)\s*(?:[-~至]\s*(\d+))?\s*周?\s*(?:[（(]\s*(单|双)\s*[）)])?/g)].forEach((match) => {
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (!start || !end) return;
    const parity = match[3] === "单" ? 1 : match[3] === "双" ? 0 : null;
    for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) {
      if (parity === null || week % 2 === parity) numbers.add(week);
    }
  });
  return numbers;
}

const SUNDAY_FIRST_DAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function courseDayIndex(course) {
  const source = course?.weekday || course?.detail || "";
  const parsed = parseDay(source);
  if (!parsed) return -1;
  // parseDay 保留原系统“星期一=1…星期日=7”的表示；界面统一换成
  // JavaScript/学校日历使用的“周日=0…周六=6”。
  return parsed === 7 ? 0 : parsed;
}

function normalizeCalendarDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? date
    : null;
}

function localDateOnly(value = new Date()) {
  return normalizeCalendarDate(value) || normalizeCalendarDate(new Date());
}

function calendarOrdinal(date) {
  const normalized = localDateOnly(date);
  return Date.UTC(normalized.getFullYear(), normalized.getMonth(), normalized.getDate()) / 86400000;
}

function addCalendarDays(date, days) {
  const normalized = localDateOnly(date);
  return new Date(normalized.getFullYear(), normalized.getMonth(), normalized.getDate() + days, 12);
}

function calendarDateText(date) {
  const normalized = localDateOnly(date);
  return `${normalized.getMonth() + 1}月${normalized.getDate()}日`;
}

function academicDayInfo(date) {
  const normalized = localDateOnly(date);
  const first = normalizeCalendarDate(state.calendar.firstWeekStart);
  if (!first) return { date: normalized, weekdayIndex: normalized.getDay(), week: null, diffDays: null };
  const diffDays = calendarOrdinal(normalized) - calendarOrdinal(first);
  return {
    date: normalized,
    weekdayIndex: normalized.getDay(),
    week: diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : null,
    diffDays
  };
}

function filterCoursesForDate(rows, date) {
  const info = academicDayInfo(date);
  // 没有第一周日期时无法区分同一星期几的不同周次；宁可明确提示设置，
  // 也不能把整学期同一天的课程误当成“今天”的课程。
  if (info.week === null) return [];
  return rows
    .filter((course) => courseDayIndex(course) === info.weekdayIndex)
    .filter((course) => {
      const weeks = courseWeekNumbers(course);
      return !weeks.size || weeks.has(info.week);
    })
    .sort((left, right) => {
      const leftSection = courseSectionRange(left)?.start || 99;
      const rightSection = courseSectionRange(right)?.start || 99;
      return leftSection - rightSection || String(left.name).localeCompare(String(right.name), "zh-CN");
    });
}

function scheduleWeekValue(scope = "personal") {
  if (scope === "personal" && !state.scheduleWeek?.personal) return defaultPersonalScheduleWeek();
  return state.scheduleWeek?.[scope] || "all";
}

function scheduleWeekNumbers(rows) {
  const numbers = new Set();
  rows.forEach((course) => courseWeekNumbers(course).forEach((week) => numbers.add(week)));
  return [...numbers].sort((left, right) => left - right);
}

function filterScheduleWeekRows(rows, scope = "personal") {
  const selected = scheduleWeekValue(scope);
  if (selected === "all") return rows;
  const week = Number(selected);
  if (!Number.isInteger(week) || week <= 0) return rows;
  return rows.filter((course) => {
    const weeks = courseWeekNumbers(course);
    return !weeks.size || weeks.has(week);
  });
}

function currentAcademicWeekNumber() {
  if (!normalizeCalendarDate(state.calendar.firstWeekStart)) return null;
  const info = academicDayInfo(new Date());
  return Number.isInteger(info.week) && info.week > 0 ? info.week : null;
}

function defaultPersonalScheduleWeek() {
  const week = currentAcademicWeekNumber();
  return week ? String(week) : "all";
}

function renderScheduleWeekControls(rows, scope = "personal") {
  const numbers = scheduleWeekNumbers(rows);
  const selected = scheduleWeekValue(scope);
  // 当前周可能暂时没有课程（例如学期刚开始或某周没有排课），但仍要让
  // 个人课表明确显示当前周，并允许用户切回整学期或其他有课周。
  const selectedNumber = Number(selected);
  if (scope === "personal" && Number.isInteger(selectedNumber) && selectedNumber > 0 && !numbers.includes(selectedNumber)) {
    numbers.push(selectedNumber);
    numbers.sort((left, right) => left - right);
  }
  if (!numbers.length) return "";
  const selectId = scope === "all-detail" ? "allDetailWeekSelect" : "personalWeekSelect";
  const visibleRows = filterScheduleWeekRows(rows, scope);
  const selectedText = selected === "all" ? "全部周次" : `第${selected}周`;
  const allWeeksLabel = scope === "personal" ? "学期课表（全部周次叠加）" : "全部周次（叠加查看）";
  const options = [`<option value="all" ${selected === "all" ? "selected" : ""}>${allWeeksLabel}</option>`, ...numbers.map((week) => `<option value="${week}" ${String(selected) === String(week) ? "selected" : ""}>第${week}周</option>`)].join("");
  const hint = scope === "personal" && selected !== "all" && String(selected) === defaultPersonalScheduleWeek()
    ? "已按开学日期定位当前周，也可切换整学期或其他周"
    : "选择单周后，网格只保留该周课程";
  return `<div class="schedule-week-toolbar"><div><span class="schedule-week-label">网格查看周次</span><select id="${selectId}">${options}</select></div><span class="muted">${selectedText} · 显示 ${visibleRows.length} / ${rows.length} 条课程记录</span><span class="schedule-week-hint">${hint}</span></div>`;
}

function scheduleWeeksOverlap(left, right) {
  const leftWeeks = courseWeekNumbers(left);
  const rightWeeks = courseWeekNumbers(right);
  if (!leftWeeks.size || !rightWeeks.size) return true;
  return [...leftWeeks].some((week) => rightWeeks.has(week));
}

function courseTransferKey(scope, index) {
  return `${scope}:${index}`;
}

function courseTransferSortMode(scope) {
  return state.courseTransfer.sortMode?.[scope] || "source";
}

function sortCourseTransferRecords(records, scope) {
  const mode = courseTransferSortMode(scope);
  if (mode === "source") return records;
  let collator;
  try {
    // zh-CN 的默认排序在主流 Chromium 中按拼音；显式指定 pinyin，
    // 让“课程名排序”在不同系统区域设置下也保持一致。
    collator = new Intl.Collator("zh-CN-u-co-pinyin", { sensitivity: "base", numeric: true });
  } catch {
    collator = new Intl.Collator("zh-CN", { sensitivity: "base", numeric: true });
  }
  const direction = mode === "desc" ? -1 : 1;
  return records.slice().sort((left, right) => direction * collator.compare(
    String(left.course?.name || ""),
    String(right.course?.name || "")
  ));
}

function courseTransferSortLabel(scope) {
  const mode = courseTransferSortMode(scope);
  if (mode === "asc") return "排序：名称拼音 A-Z";
  if (mode === "desc") return "排序：名称拼音 Z-A";
  return "排序：原始顺序";
}

function courseTransferRecords(scope = "all", rows = []) {
  if (scope === "all") {
    return state.allRows
      .map((raw, index) => ({ raw, index, course: mapCourse(raw) }))
      .filter((record) => isCourseDetailRow(record.raw));
  }
  const source = scope === "all-detail" ? (state.allDetail?.courses || []) : rows;
  return (source || []).map((row, index) => ({
    raw: row?.raw || row,
    index,
    course: row?.raw ? row : mapCourse(row)
  }));
}

function selectedCourseTransferRecords(scope, rows = []) {
  const records = courseTransferRecords(scope, rows);
  return records.filter((record) => state.courseTransfer.selectedKeys.has(courseTransferKey(scope, record.index)));
}

function sanitizeCourseTransferValue(value, depth = 0) {
  if (depth > 8 || value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeCourseTransferValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== "object") return String(value);
  const result = {};
  Object.entries(value).forEach(([key, child]) => {
    // 课程接口通常不会返回这些字段，但即使未来接口把会话信息塞进原始对象，
    // 标准化文本也不应把密码、Cookie、令牌或验证码带出去。
    if (/password|passwd|pwd|token|cookie|authorization|captcha|secret|sessionid/i.test(key)) return;
    const sanitized = sanitizeCourseTransferValue(child, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  });
  return result;
}

function courseTransferEntry(course) {
  return {
    name: displayValue(course?.name, ""),
    code: displayValue(course?.code, ""),
    teachingCode: displayValue(course?.code, ""),
    catalogCode: displayValue(course?.catalogCode, ""),
    courseCode: displayValue(course?.catalogCode || course?.code, ""),
    weeks: displayValue(course?.weeks, ""),
    weekday: displayValue(course?.weekday, ""),
    section: displayValue(course?.section, ""),
    time: displayValue(course?.time, ""),
    teacher: displayValue(course?.teacher, ""),
    location: displayValue(course?.location, ""),
    detail: displayValue(course?.detail, ""),
    credit: displayValue(course?.credit, ""),
    category: displayValue(course?.category, ""),
    assessment: courseAssessmentValue(course) || displayValue(course?.assessment, ""),
    requirement: courseRequirementValue(course) || displayValue(course?.requirement, ""),
    nature: displayValue(course?.nature, ""),
    examType: displayValue(course?.examType, ""),
    includedCourses: sanitizeCourseTransferValue(course?.includedCourses || []),
    raw: sanitizeCourseTransferValue(course?.raw || {})
  };
}

function courseTransferPayload(scope = "all") {
  const records = selectedCourseTransferRecords(scope);
  return {
    schema: "neu-course-selection/v1",
    schemaVersion: 1,
    title: "东北大学课表课程信息",
    source: "东北大学教务助手",
    exportedAt: new Date().toISOString(),
    term: allQueryTermCode(),
    queryType: selectedScheduleType()?.name || (scope === "all-detail" ? state.allDetail?.typeName : "全校课表") || "",
    selectionScope: scope,
    courses: records.map((record) => courseTransferEntry(record.course))
  };
}

function normalizeTransferDirectValue(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") return source[key];
  }
  return "";
}

function normalizeImportedCourse(value) {
  const source = value && typeof value === "object" && value.course && typeof value.course === "object"
    ? { ...value.course, raw: value.raw || value.course.raw }
    : (value || {});
  const raw = source.raw && typeof source.raw === "object" ? source.raw : null;
  const name = displayValue(normalizeTransferDirectValue(source, ["name", "courseName", "course", "课程", "课程名称"]), "");
  const teachingCode = displayValue(normalizeTransferDirectValue(source, ["teachingCode", "teachingClassCode", "teachClassId", "code", "courseNo", "KCH", "课程号", "教学班号"]), "");
  const catalogCode = displayValue(normalizeTransferDirectValue(source, ["catalogCode", "courseCatalogCode", "courseCode", "KCHM", "KCDM", "课程目录号"]), "");
  const weeksDirect = normalizeTransferDirectValue(source, ["weeks", "week", "SKZC", "ZC", "classWeek", "weekRange", "上课周次"]);
  const weekdayDirect = normalizeTransferDirectValue(source, ["weekday", "weekDay", "SKXQMC", "SKXQ", "XQJ", "dayOfWeek", "星期", "上课星期"]);
  const sectionDirect = normalizeTransferDirectValue(source, ["section", "sectionName", "JC", "JCDM", "JCS", "period", "lesson", "节次"]);
  const timeDirect = normalizeTransferDirectValue(source, ["time", "classTime", "SKSJ", "scheduleTime", "上课时间"]);
  const locationDirect = normalizeTransferDirectValue(source, ["location", "classroom", "room", "place", "placeName", "SKDD", "上课地点"]);
  const teacherDirect = normalizeTransferDirectValue(source, ["teacher", "teacherName", "teacherNames", "SKJS", "授课教师"]);
  const detailDirect = normalizeTransferDirectValue(source, ["detail", "原始时间地点", "timePlace", "classDateAndPlace"]);
  const pseudoRaw = {
    courseName: name,
    courseNo: teachingCode || catalogCode,
    courseCode: catalogCode || teachingCode,
    weeks: weeksDirect,
    weekday: weekdayDirect,
    section: sectionDirect,
    classTime: timeDirect,
    classroom: locationDirect,
    teacherName: teacherDirect,
    detail: detailDirect,
    KCLB: normalizeTransferDirectValue(source, ["category", "课程类别"]),
    KSLXMC: normalizeTransferDirectValue(source, ["assessment", "examType", "考核方式"]),
    KCXZMC: normalizeTransferDirectValue(source, ["requirement", "nature", "课程性质"])
  };
  const mapped = mapCourse(raw || pseudoRaw);
  const parsed = parseCourseText([weeksDirect, weekdayDirect, sectionDirect, timeDirect, detailDirect, locationDirect].filter(Boolean).join(" "));
  const rawWeeks = displayValue(weeksDirect, mapped.weeks || parsed.weeks || "");
  const weeks = canonicalWeeksText(rawWeeks) || formatWeeksValue(rawWeeks) || mapped.weeks || parsed.weeks || "";
  const weekday = normalizeWeekday(displayValue(weekdayDirect, mapped.weekday || parsed.weekday || ""));
  const section = normalizeSection(displayValue(sectionDirect, mapped.section || parsed.section || ""));
  const assessment = normalizeCourseAssessment(normalizeTransferDirectValue(source, ["assessment", "examType", "KSLXMC", "考核方式"]))
    || courseAssessmentValue(mapped);
  const requirement = normalizeCourseRequirement(normalizeTransferDirectValue(source, ["requirement", "nature", "KCXZMC", "课程性质"]))
    || courseRequirementValue(mapped);
  return {
    ...mapped,
    name: name || mapped.name || "未命名课程",
    code: teachingCode || mapped.code || catalogCode,
    catalogCode: catalogCode || mapped.catalogCode || "",
    weeks,
    weekday,
    section,
    time: displayValue(timeDirect, mapped.time || [weeks, weekday, section].filter(Boolean).join(" ") || parsed.time || ""),
    teacher: displayValue(teacherDirect, mapped.teacher || parsed.teacher || ""),
    location: displayValue(locationDirect, mapped.location || parsed.location || ""),
    detail: displayValue(detailDirect, mapped.detail || [weeks, weekday, section, locationDirect].filter(Boolean).join(" ")),
    category: displayValue(normalizeTransferDirectValue(source, ["category", "课程类别"]), mapped.category || ""),
    nature: requirement || mapped.nature || "",
    requirement,
    assessment,
    examType: assessment,
    credit: displayValue(normalizeTransferDirectValue(source, ["credit", "credits", "学分"]), mapped.credit || ""),
    includedCourses: Array.isArray(source.includedCourses) ? source.includedCourses : mapped.includedCourses || [],
    raw: raw || source
  };
}

function parseCourseTransferText(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned) throw new Error("请先粘贴课程信息文本");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("课程信息文本不是有效的 JSON；请粘贴导出的完整文本");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.courses)
      ? parsed.courses
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];
  if (!list.length) throw new Error("文本中没有找到 courses 课程数组");
  const courses = list.map(normalizeImportedCourse).filter((course) => course.name || course.code);
  if (!courses.length) throw new Error("文本中的课程缺少课程名称和课程号");
  return { parsed, courses };
}

function scheduleSectionsOverlap(left, right) {
  const leftRange = courseSectionRange(left);
  const rightRange = courseSectionRange(right);
  if (!leftRange || !rightRange) return { status: "possible", reason: "section-unknown", reasons: ["节次"] };
  const overlap = leftRange.start <= rightRange.end && rightRange.start <= leftRange.end;
  return {
    status: overlap ? "confirmed" : "none",
    reason: overlap ? "section-overlap" : "section-separated",
    reasons: []
  };
}

function compareCourseScheduleOverlap(left, right) {
  const leftDay = courseDayIndex(left);
  const rightDay = courseDayIndex(right);
  const dayKnown = leftDay >= 0 && rightDay >= 0;
  if (dayKnown && leftDay !== rightDay) return { status: "none", reason: "weekday-separated", reasons: [] };

  const leftWeeks = courseWeekNumbers(left);
  const rightWeeks = courseWeekNumbers(right);
  const weeksKnown = leftWeeks.size > 0 && rightWeeks.size > 0;
  if (weeksKnown && ![...leftWeeks].some((week) => rightWeeks.has(week))) {
    return { status: "none", reason: "week-separated", reasons: [] };
  }

  const section = scheduleSectionsOverlap(left, right);
  if (section.status === "none") return { status: "none", reason: section.reason, reasons: [] };
  const reasons = [];
  if (!dayKnown) reasons.push("星期");
  if (!weeksKnown) reasons.push("周次");
  reasons.push(...(section.reasons || []));
  return {
    status: dayKnown && weeksKnown && section.status === "confirmed" ? "confirmed" : "possible",
    reason: section.reason,
    reasons
  };
}

function courseTransferScheduleText(course) {
  const range = courseSectionRange(course);
  const section = range ? courseSectionLabel(course) : displayValue(course?.section, "节次待识别");
  const time = extractClockText(course?.time);
  return [course?.weeks || "周次待识别", course?.weekday || "星期待识别", section, time].filter(Boolean).join(" · ");
}

function courseTransferBrief(course) {
  const identity = [course?.name || "未命名课程", course?.code || course?.catalogCode].filter(Boolean).join(" · ");
  const place = [course?.teacher && `教师：${course.teacher}`, course?.location && `地点：${course.location}`].filter(Boolean).join(" · ");
  return [identity, courseTransferScheduleText(course), place].filter(Boolean).join(" ｜ ");
}

function currentAllScheduleCourses() {
  return normalizedScheduleCourses(state.allDetail?.courses || []);
}

function currentAllScheduleLabel() {
  const detail = state.allDetail;
  return [detail?.typeName, detail?.name].filter(Boolean).join(" · ") || "当前打开的全校课表";
}

function analyzeCourseTransferCollisions(importedCourses) {
  const currentCourses = currentAllScheduleCourses();
  const conflicts = [];
  const possible = [];
  importedCourses.forEach((imported) => {
    currentCourses.forEach((existing) => {
      const overlap = compareCourseScheduleOverlap(imported, existing);
      if (overlap.status === SCHEDULE_COLLISION_STATUS.NONE) return;
      const item = {
        imported,
        existing,
        status: overlap.status,
        reason: overlap.reason,
        reasons: overlap.reasons || [],
        missing: overlap.reasons || []
      };
      if (overlap.status === SCHEDULE_COLLISION_STATUS.CONFIRMED) conflicts.push(item);
      else possible.push(item);
    });
  });
  return {
    importedCount: importedCourses.length,
    referenceCount: currentCourses.length,
    referenceLabel: currentAllScheduleLabel(),
    conflicts,
    possible,
    noConflictCount: importedCourses.filter((imported) => !conflicts.some((item) => item.imported === imported) && !possible.some((item) => item.imported === imported)).length
  };
}

function courseGroupChipMarkup(courses, scope = "personal", style = "", availability = null) {
  const variants = courses.map((course) => {
    const clockText = extractClockText(course.time) || localScheduleClockText(course);
    const timeText = [course.weeks, course.weekday, courseSectionLabel(course), clockText].filter((value) => value && value !== "节次待识别").join(" ") || (course.localDate ? `${course.localDate} ${clockText}`.trim() : "时间待识别");
    const placeText = [course.teacher, course.location].filter(Boolean).join(" · ") || course.detail || "地点待识别";
    const badge = course.source === "local" ? localScheduleSourceBadge(course) : "";
    return `<button class="course-chip course-chip-variant ${course.source === "local" ? `local-schedule-chip local-schedule-color-${course.localColorKey || "blue"}` : ""}" ${courseActionAttributes(course, scope)} title="点击查看课程详情"><strong>${escapeHtml(course.name || "未命名课程")}</strong>${badge}<span>${escapeHtml(timeText)}</span><span>${escapeHtml(placeText)}</span>${courseTagsMarkup(course, availability || { assessment: true, requirement: true })}</button>`;
  }).join("");
  return `<div class="schedule-course-group-chip" style="${style}">${variants}</div>`;
}

function renderScheduleGrid(rows, scope = "personal") {
  const availability = courseFieldAvailability(rows, scope);
  const positioned = rows.map((course) => ({
    course,
    day: courseDayIndex(course),
    range: courseSectionRange(course)
  })).filter((item) => item.day >= 0);
  if (!positioned.length) return "";

  const sectionCount = Math.max(12, ...positioned.map((item) => item.range?.end || 0));
  const names = SUNDAY_FIRST_DAY_NAMES;
  const groupedByTime = new Map();
  const groupedPositioned = [];
  positioned.filter((item) => item.range).forEach((item) => {
    const key = `${item.day}:${item.range.start}-${item.range.end}`;
    const slots = groupedByTime.get(key) || [];
    let slot = slots.find((candidate) => candidate.items.every((existing) => sameCourse(existing.course, item.course) || !scheduleWeeksOverlap(existing.course, item.course)));
    if (!slot) {
      slot = { ...item, items: [] };
      slots.push(slot);
      groupedPositioned.push(slot);
    }
    slot.items.push(item);
    groupedByTime.set(key, slots);
  });
  const laneItems = new Map();
  const layoutOverlapCluster = (cluster) => {
    const active = [];
    let maxLane = 0;
    cluster
      .slice()
      .sort((left, right) => left.range.start - right.range.start || left.range.end - right.range.end)
      .forEach((item) => {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].range.end < item.range.start) active.splice(index, 1);
        }
        const occupied = active.map((candidate) => candidate.lane);
        let lane = 0;
        while (occupied.includes(lane)) lane += 1;
        item.lane = lane;
        maxLane = Math.max(maxLane, lane);
        active.push(item);
      });
    cluster.forEach((item) => { item.laneCount = maxLane + 1; });
  };
  groupedPositioned.forEach((item) => {
    const dayItems = laneItems.get(item.day) || [];
    dayItems.push(item);
    laneItems.set(item.day, dayItems);
  });
  laneItems.forEach((dayItems) => {
    const sorted = dayItems.slice().sort((left, right) => left.range.start - right.range.start || left.range.end - right.range.end);
    let cluster = [];
    let clusterEnd = 0;
    sorted.forEach((item) => {
      if (cluster.length && item.range.start > clusterEnd) {
        layoutOverlapCluster(cluster);
        cluster = [];
      }
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.range.end);
    });
    if (cluster.length) layoutOverlapCluster(cluster);
  });
  const header = `<div class="schedule-corner">节次</div>${names.map((name) => `<div class="schedule-day-header">${name}</div>`).join("")}`;
  const labels = Array.from({ length: sectionCount }, (_, index) => `<div class="schedule-section-label" style="grid-row:${index + 2}">第${index + 1}节</div>`).join("");
  const tracks = names.map((name, dayIndex) => {
    const items = laneItems.get(dayIndex) || [];
    const chips = items.map((item) => {
      const span = item.range.end - item.range.start + 1;
      const itemLaneCount = item.laneCount || 1;
      const style = `top:calc(${item.range.start - 1} * var(--section-height) + 4px);height:calc(${span} * var(--section-height) - 8px);left:calc(${item.lane} * (100% / ${itemLaneCount}) + 3px);width:calc(100% / ${itemLaneCount} - 6px);`;
      return item.items?.length > 1
        ? courseGroupChipMarkup(item.items.map((entry) => entry.course), scope, style, availability)
        : courseChipMarkup(item.course, scope, "schedule-course-chip", style, availability);
    }).join("");
    return `<section class="schedule-day-track" style="grid-column:${dayIndex + 2};grid-row:2 / span ${sectionCount}">${chips || `<span class="muted schedule-empty">暂无课程</span>`}</section>`;
  }).join("");
  const unplaced = positioned.filter((item) => !item.range).map((item) => courseChipMarkup(item.course, scope, "schedule-unplaced-chip", "", availability)).join("");
  const unplacedBlock = unplaced ? `<div class="schedule-unplaced"><strong>已识别星期但未识别节次</strong><div class="schedule-unplaced-list">${unplaced}</div></div>` : "";
  return `<div class="schedule-grid-scroll"><div class="schedule-grid" style="--section-count:${sectionCount}">${header}${labels}${tracks}</div></div>${unplacedBlock}`;
}

function scheduleExportRows(scope = "personal") {
  const source = scope === "all-detail"
    ? (state.allDetail?.courses || [])
    : personalScheduleRows(state.data.courses || []);
  const normalized = normalizedScheduleCourses(source);
  // 全校详情接口有时把同一门课的多个排课段放在一条记录里；导出时先拆成
  // 独立课程卡片，避免一个卡片内部再出现难以阅读的复合时间地点串。
  const expanded = scope === "all-detail"
    ? normalized.flatMap((course) => expandMappedCourse(course))
    : normalized;
  const seen = new Set();
  return expanded.filter((course) => {
    const range = courseSectionRange(course);
    const key = [
      course.code,
      course.name,
      courseDayIndex(course),
      range ? `${range.start}-${range.end}` : course.section,
      [...courseWeekNumbers(course)].sort((left, right) => left - right).join(","),
      course.teacher,
      course.location
    ].map((value) => String(value ?? "").trim()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const SCHEDULE_CSV_HEADERS = ["课程名称", "星期", "开始节数", "结束节数", "老师", "地点", "周数"];

function scheduleCsvSourceRows(scope = "personal") {
  if (scope === "all-detail") {
    const detailRows = Array.isArray(state.allDetail?.courses) ? state.allDetail.courses : [];
    return detailRows.length ? detailRows : (state.allDetail?.rawRows || []);
  }
  if (scope === "all") return (state.allRows || []).filter(isCourseDetailRow);

  const courses = Array.isArray(state.data.courses) ? state.data.courses : [];
  const detailRows = Array.isArray(state.data.scheduleDetail) ? state.data.scheduleDetail : [];
  if (!detailRows.length) return courses;
  // 排课明细是主来源；课程列表里可能还包含没有安排上课次的课程，
  // 这些课程也保留一行，避免因星期/节次为空而整条丢失。
  const supplements = courses.filter((course) => (
    !detailRows.some((detail) => courseIdentityMatches(detail, course))
  ));
  return [...detailRows, ...supplements];
}

function scheduleCsvMappedRows(scope = "personal") {
  return scheduleCsvSourceRows(scope).flatMap((row) => {
    const course = row?.raw ? row : mapCourse(row);
    return expandMappedCourse(course);
  });
}

function scheduleCsvWeekText(course) {
  const candidates = [
    course?.weeks,
    course?.raw?.weeks,
    course?.raw?.week,
    course?.raw?.SKZC,
    course?.raw?.ZC,
    course?.detail,
    rawScheduleText(course?.raw)
  ].filter((value) => hasDisplayValue(value));
  const canonical = candidates.map((value) => canonicalWeeksText(value)).find(Boolean);
  if (canonical) return canonical;
  return candidates.map((value) => formatWeeksValue(value)).find(Boolean) || "";
}

function scheduleCsvEntries(scope = "personal") {
  const seen = new Set();
  return scheduleCsvMappedRows(scope)
    .map((course) => {
      const name = displayValue(course?.name, "");
      const dayIndex = courseDayIndex(course);
      const range = courseSectionRange(course);
      const teacher = hasDisplayValue(course?.teacher) ? String(course.teacher).trim() : "";
      const location = hasDisplayValue(course?.location) ? String(course.location).trim() : "";
      const entry = {
        courseName: name,
        weekday: dayIndex >= 0 ? String(dayIndex === 0 ? 7 : dayIndex) : "",
        startSection: range ? String(range.start) : "",
        endSection: range ? String(range.end) : "",
        teacher,
        location,
        weekText: scheduleCsvWeekText(course)
      };
      return entry;
    })
    .filter((entry) => entry.courseName)
    .filter((entry) => {
      const key = [
        entry.courseName,
        entry.weekday,
        entry.startSection,
        entry.endSection,
        entry.teacher,
        entry.location,
        entry.weekText
      ].join("\u001f");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function scheduleCsvHasRows(scope = "personal") {
  return scheduleCsvSourceRows(scope).some((row) => {
    const name = row?.name || valueOf(row, ["courseName", "KCM", "KCMC", "course", "name"], "");
    return hasDisplayValue(name);
  });
}

function scheduleCsvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildScheduleCsv(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  return `\uFEFF${SCHEDULE_CSV_HEADERS.map(scheduleCsvEscape).join(",")}\r\n${rows
    .map((entry) => [
      entry.courseName,
      entry.weekday,
      entry.startSection,
      entry.endSection,
      entry.teacher,
      entry.location,
      entry.weekText
    ].map(scheduleCsvEscape).join(","))
    .join("\r\n")}\r\n`;
}

function scheduleCsvSafeSegment(value, fallback = "课表") {
  const segment = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return segment || fallback;
}

function scheduleCsvFileName(scope = "personal") {
  const term = scheduleCsvSafeSegment(scheduleExportTermLabel(), "当前学期");
  if (scope === "all-detail") {
    const detail = state.allDetail || {};
    const type = scheduleCsvSafeSegment(detail.typeName, "全校课表");
    const target = scheduleCsvSafeSegment(detail.name || detail.code, "查询结果");
    return `${type}_${target}_${term}.csv`;
  }
  if (scope === "all") {
    const type = scheduleCsvSafeSegment(selectedScheduleType()?.name, "全校课表");
    const target = scheduleCsvSafeSegment(
      state.filters.allKeyword || state.filters.allName || state.filters.allCode,
      "查询结果"
    );
    return `${type}_${target}_${term}.csv`;
  }
  return `个人课表_${term}.csv`;
}

function downloadScheduleCsv(csv, fileName) {
  if (typeof globalThis.AndroidApi?.saveCsv === "function") {
    try {
      globalThis.AndroidApi.saveCsv(csv, fileName);
      setNotice("CSV 已导出，可通过系统分享或文件管理查看。", "success");
      return true;
    } catch (error) {
      setNotice(`CSV 导出失败：${error.message || "原生保存接口不可用"}`, "error");
      return false;
    }
  }
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setNotice("CSV 已开始下载。", "success");
    return true;
  } catch (error) {
    setNotice(`CSV 导出失败：${error.message || "浏览器下载接口不可用"}`, "error");
    return false;
  }
}

function exportScheduleCsv(scope = "personal") {
  const entries = scheduleCsvEntries(scope);
  if (!entries.length) {
    setNotice("当前没有可导出的课表记录，请先查询或刷新课表。", "error");
    return false;
  }
  return downloadScheduleCsv(buildScheduleCsv(entries), scheduleCsvFileName(scope));
}

function scheduleExportFilteredRows(rows, selectedWeek) {
  if (selectedWeek === "all") return rows;
  const week = Number(selectedWeek);
  if (!Number.isInteger(week) || week <= 0) return rows;
  return rows.filter((course) => {
    const weeks = courseWeekNumbers(course);
    return !weeks.size || weeks.has(week);
  });
}

function scheduleExportActions(scope, backAction = "") {
  const csvAction = scheduleCsvHasRows(scope)
    ? `<button class="button button-ghost button-small" type="button" data-action="export-schedule-csv" data-schedule-scope="${scope}">导出 CSV</button>`
    : "";
  return `<div class="button-row schedule-export-action-row"><button class="button button-primary button-small" type="button" data-action="open-schedule-image-export" data-schedule-scope="${scope}">导出图片</button>${csvAction}${backAction}</div>`;
}

function renderScheduleExportModal() {
  const exportState = state.scheduleExport;
  if (!exportState) return "";
  const rows = scheduleExportRows(exportState.scope);
  const numbers = scheduleWeekNumbers(rows);
  const selected = exportState.selectedWeek === "all" || numbers.includes(Number(exportState.selectedWeek))
    ? String(exportState.selectedWeek)
    : "all";
  const exportRows = scheduleExportFilteredRows(rows, selected);
  const title = exportState.scope === "all-detail" ? "全校课表图片导出" : "个人课表图片导出";
  const options = [
    `<option value="all" ${selected === "all" ? "selected" : ""}>整个学期（全部周次）</option>`,
    ...numbers.map((week) => `<option value="${week}" ${selected === String(week) ? "selected" : ""}>第${week}周</option>`)
  ].join("");
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal schedule-export-modal" role="dialog" aria-modal="true" aria-label="导出课表图片"><div class="detail-modal-head"><div><p class="eyebrow">SCHEDULE IMAGE</p><h3>${title}</h3><p class="muted">导出图片使用节次 × 星期网格；每门课按完整节次跨行，相同节次的多周安排才合并展示，不同节次保持独立卡片并列显示，并会按课程类型使用不同浅色背景。</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-schedule-export">关闭</button></div><div class="schedule-export-choice"><label><span>导出范围</span><select id="scheduleExportWeekSelect" ${rows.length ? "" : "disabled"}>${options}</select></label><div class="schedule-export-summary"><strong>${exportRows.length} 条将导出${selected === "all" ? "" : ` · 本学期共 ${rows.length} 条`}</strong><span>${numbers.length ? `可选第 ${numbers.join("、")} 周` : "未识别到周次，将按课程原始信息导出"}</span></div></div><div class="schedule-export-tip"><strong>图片布局说明</strong><span>左侧是节次、顶部是星期；课程卡片会覆盖各自完整的第 N-M 节。只有星期和节次范围都相同的安排会合并到同一张卡片；范围不同的冲突课程会保留独立卡片并按列排列。必修、选修、实验实践、通识、体育素养等课程会使用不同的浅色背景辅助区分。</span></div>${exportState.error ? `<div class="error-card schedule-export-error"><h4>生成失败</h4><p>${escapeHtml(exportState.error)}</p></div>` : ""}<div class="schedule-export-actions"><button class="button button-ghost" type="button" data-action="close-schedule-export">取消</button><button class="button button-primary" type="button" data-action="confirm-schedule-image-export" ${exportRows.length ? "" : "disabled"}>生成并保存图片</button></div></section></div>`;
}

function canvasTextLines(context, value, maxWidth, maxLines = Number.POSITIVE_INFINITY) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || "—";
  const characters = [...text];
  const lines = [];
  let line = "";
  for (let index = 0; index < characters.length; index += 1) {
    const next = line + characters[index];
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = characters[index];
    if (Number.isFinite(maxLines) && lines.length === maxLines - 1) {
      line += characters.slice(index + 1).join("");
      break;
    }
  }
  if (line) lines.push(line);
  if (Number.isFinite(maxLines) && lines.length > maxLines) lines.length = maxLines;
  if (Number.isFinite(maxLines) && lines.length === maxLines && context.measureText(lines[maxLines - 1]).width > maxWidth) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.length ? lines : ["—"];
}

function canvasRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawCanvasTextLines(context, lines, x, y, lineHeight) {
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function scheduleExportIsPracticeCourse(course) {
  return scheduleExportEntries(course).some((entry) => {
    const source = [entry?.name, entry?.category, entry?.nature, entry?.assessment]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
    return /实验|实践|实训|上机|见习|实习|课程设计|毕业设计|毕业论文|创新创业|设计周|集中实践/.test(source);
  });
}

function scheduleExportCategoryLabel(course) {
  const categories = [...new Set(scheduleExportEntries(course)
    .map((entry) => courseCategoryValue(entry))
    .filter(Boolean))];
  if (categories.length === 1) return categories[0];
  if (categories.length > 1) return "多种课程类别";
  return "";
}

function scheduleExportCourseTheme(course, scope = "personal") {
  // 个人课表网格没有足够可靠的课程类别字段，导出只区分普通课程与实验实践课程。
  if (scope === "personal") return scheduleExportIsPracticeCourse(course) ? "lab" : "required";
  const entries = scheduleExportEntries(course);
  const score = { required: 0, elective: 0, general: 0, lab: 0, sport: 0 };
  entries.forEach((entry) => {
    const source = [entry?.required, entry?.nature, entry?.category, entry?.assessment, entry?.name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
    if (!source) {
      score.required += 1;
      return;
    }
    if (/实验|实践|实训|上机|见习|实习|课程设计|毕业设计|毕业论文|创新创业|设计周|集中实践/.test(source)) {
      score.lab += 1;
      return;
    }
    if (/体育|体测|军事|军训|美育|艺术|素养/.test(source)) {
      score.sport += 1;
      return;
    }
    if (/通识|公选|任选|选修/.test(source)) {
      if (/专业/.test(source)) score.elective += 1;
      else score.general += 1;
      return;
    }
    if (/必修|限选|核心|专业/.test(source)) {
      score.required += 1;
      return;
    }
    score.required += 1;
  });
  const ranked = Object.entries(score).sort((left, right) => right[1] - left[1]);
  if (!ranked.length || ranked[0][1] <= 0) return "required";
  const nonZero = ranked.filter((item) => item[1] > 0);
  if (nonZero.length > 1 && nonZero[0][1] === nonZero[1][1]) return "mixed";
  return ranked[0][0];
}

function scheduleExportCourseBadge(course, scope = "personal") {
  if (scope === "personal") return scheduleExportIsPracticeCourse(course) ? "实验实践课程" : "普通课程";
  // 全校课表的徽标只展示原系统下方课程列表返回的“课程类别”。
  // 如果接口确实没有该字段，就隐藏徽标，不用课程名称或考核方式推测，
  // 避免把“专业基础课”等类别误写成“专业必修课”。
  return scheduleExportCategoryLabel(course);
}

function scheduleExportPalette(course, scope = "personal") {
  const theme = scheduleExportCourseTheme(course, scope);
  switch (theme) {
    case "elective":
      return {
        bg: "#eef8f2",
        top: "#e4f3ea",
        border: "#d5e9dd",
        accent: "#58a77b",
        accentSoft: "#dff0e6",
        title: "#1f4f39",
        text: "#4f6e60",
        muted: "#759181",
        badgeBg: "#d7eddf",
        badgeText: "#2e7a55",
        divider: "#d9e8df"
      };
    case "general":
      return {
        bg: "#f3efff",
        top: "#ebe4ff",
        border: "#e2d8fa",
        accent: "#8b6de5",
        accentSoft: "#e7dfff",
        title: "#47327b",
        text: "#665790",
        muted: "#8879ad",
        badgeBg: "#e5dcff",
        badgeText: "#6a4dcb",
        divider: "#e3dcf3"
      };
    case "lab":
      return {
        bg: "#fff6ea",
        top: "#ffefd2",
        border: "#f2e0be",
        accent: "#d89a33",
        accentSoft: "#f8e6bf",
        title: "#6f4a0b",
        text: "#82653a",
        muted: "#a08356",
        badgeBg: "#faebc9",
        badgeText: "#aa7316",
        divider: "#f0e1c2"
      };
    case "sport":
      return {
        bg: "#fff1f4",
        top: "#ffe5eb",
        border: "#f2d7df",
        accent: "#de7b96",
        accentSoft: "#f8dbe3",
        title: "#7a3346",
        text: "#8d5b67",
        muted: "#a77883",
        badgeBg: "#f7dbe3",
        badgeText: "#bb5875",
        divider: "#eed8de"
      };
    case "mixed":
      return {
        bg: "#f5f7fb",
        top: "#eef2f8",
        border: "#dde5f1",
        accent: "#7b8da9",
        accentSoft: "#e8eef6",
        title: "#30445f",
        text: "#5b6d86",
        muted: "#7f8ea5",
        badgeBg: "#e3eaf4",
        badgeText: "#59718f",
        divider: "#dfe6f0"
      };
    default:
      return {
        bg: "#eef4ff",
        top: "#e4eeff",
        border: "#d3e1fb",
        accent: "#5d87f7",
        accentSoft: "#dae6ff",
        title: "#21406e",
        text: "#536a91",
        muted: "#7686a4",
        badgeBg: "#d9e6ff",
        badgeText: "#3d69c4",
        divider: "#d9e5f7"
      };
  }
}

function scheduleExportEntries(course) {
  return Array.isArray(course?.exportEntries) && course.exportEntries.length
    ? course.exportEntries
    : [course].filter(Boolean);
}

function scheduleExportEntryCount(course) {
  return scheduleExportEntries(course).length;
}

function scheduleExportUniqueCourseCount(courses) {
  const source = Array.isArray(courses) ? courses : [courses];
  const seen = new Set();
  source.flatMap((course) => scheduleExportEntries(course)).forEach((course) => {
    const code = String(course?.code || "").trim();
    const name = String(course?.name || "").trim();
    seen.add(code ? `code:${code}` : `name:${name || "未命名课程"}`);
  });
  return seen.size;
}

function scheduleExportGroupTitle(prefix, courses) {
  const arrangements = Array.isArray(courses)
    ? courses.flatMap((course) => scheduleExportEntries(course)).length
    : scheduleExportEntryCount(courses);
  const coursesCount = scheduleExportUniqueCourseCount(courses);
  return `${prefix} · ${coursesCount} 门课${arrangements === coursesCount ? "" : ` · ${arrangements} 条安排`}`;
}

function makeScheduleExportGroup(courses, range, title) {
  const entries = courses.flatMap((course) => scheduleExportEntries(course));
  const first = entries[0] || {};
  if (entries.length <= 1 && !title) return first;
  const section = range?.start && range?.end
    ? `第${range.start}-${range.end}节`
    : courseSectionLabel(first) || "节次待识别";
  return {
    ...first,
    name: title || scheduleExportGroupTitle("同一时段", courses),
    section,
    exportEntries: entries
  };
}

function scheduleExportEntryText(course, selectedWeek, scope = "personal") {
  const range = courseSectionRange(course);
  const section = courseSectionLabel(course) || (range ? `第${range.start}-${range.end}节` : "节次待识别");
  const clock = extractClockText(course.time);
  const weekText = selectedWeek === "all" ? (course.weeks || "周次待识别") : `第${selectedWeek}周`;
  return {
    title: course.name || "未命名课程",
    schedule: [weekText, course.weekday || "星期待识别", section, clock].filter(Boolean).join(" · "),
    teacher: course.teacher || "教师待识别",
    location: course.location || course.detail || "地点待识别",
    code: course.code || "无课程号",
    tags: [courseAssessmentValue(course), courseRequirementValue(course), scope === "all-detail" ? courseCategoryValue(course) : ""].filter(Boolean).join(" · ")
  };
}

function scheduleExportCardText(course, selectedWeek, scope = "personal") {
  const entries = scheduleExportEntries(course).map((entry) => scheduleExportEntryText(entry, selectedWeek, scope));
  const range = courseSectionRange(course) || courseSectionRange(scheduleExportEntries(course)[0]);
  const first = entries[0] || scheduleExportEntryText(course, selectedWeek, scope);
  if (entries.length > 1) {
    return {
      title: course.name || scheduleExportGroupTitle("同一时段", entries),
      groupEntries: entries,
      schedule: range ? `第${range.start}-${range.end}节 · ${entries.length} 条安排` : `${entries.length} 条安排`,
      teacher: "",
      location: "",
      code: "",
      tags: ""
    };
  }
  return {
    title: first.title,
    schedule: first.schedule,
    teacher: first.teacher,
    location: first.location,
    code: first.code,
    tags: first.tags
  };
}

function scheduleExportCardMetrics(context, course, width, selectedWeek, scope = "personal") {
  const padding = width < 240 ? 12 : 16;
  const palette = scheduleExportPalette(course, scope);
  const badge = scheduleExportCourseBadge(course, scope);
  const text = scheduleExportCardText(course, selectedWeek, scope);
  context.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  const badgeWidth = badge
    ? Math.min(
      width - padding * 2,
      Math.max(72, Math.ceil(context.measureText(badge).width + 26))
    )
    : 0;
  const titleWidth = Math.max(92, width - padding * 2 - (badge ? Math.min(badgeWidth + 12, Math.floor(width * 0.42)) : 0));
  context.font = "700 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  const titleLines = canvasTextLines(context, text.title, titleWidth);
  if (text.groupEntries?.length) {
    const entryLayouts = text.groupEntries.map((entry) => {
      context.font = "700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
      const entryTitleLines = canvasTextLines(context, entry.title, width - padding * 2 - 20);
      context.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
      const entryScheduleLines = canvasTextLines(context, entry.schedule, width - padding * 2 - 20);
      const entryMeta = [`教师：${entry.teacher}`, `地点：${entry.location}`, `课程号：${entry.code}${entry.tags ? ` · ${entry.tags}` : ""}`].join(" · ");
      const entryMetaLines = canvasTextLines(context, entryMeta, width - padding * 2 - 20);
      return {
        entry,
        entryTitleLines,
        entryScheduleLines,
        entryMetaLines,
        height: 54 + entryTitleLines.length * 18 + entryScheduleLines.length * 16 + entryMetaLines.length * 16
      };
    });
    const height = Math.max(
      186,
      padding * 2
        + 34
        + titleLines.length * 25
        + entryLayouts.reduce((total, layout) => total + layout.height, 0)
        + Math.max(0, entryLayouts.length - 1) * 10
    );
    return { padding, palette, badge, badgeWidth, text, titleLines, groupEntryLayouts: entryLayouts, height };
  }
  context.font = "600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  const scheduleLines = canvasTextLines(context, text.schedule, width - padding * 2 - 20);
  context.font = "500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  const teacherLines = canvasTextLines(context, `教师：${text.teacher}`, width - padding * 2);
  const locationLines = canvasTextLines(context, `地点：${text.location}`, width - padding * 2);
  context.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  const footerLines = canvasTextLines(context, `课程号：${text.code}${text.tags ? ` · ${text.tags}` : ""}`, width - padding * 2);
  const scheduleBandHeight = 22 + scheduleLines.length * 20;
  const height = Math.max(
    186,
    padding * 2
      + 70
      + titleLines.length * 25
      + scheduleBandHeight
      + teacherLines.length * 18
      + locationLines.length * 18
      + footerLines.length * 17
  );
  return {
    padding,
    palette,
    badge,
    badgeWidth,
    text,
    titleLines,
    scheduleLines,
    teacherLines,
    locationLines,
    footerLines,
    scheduleBandHeight,
    height
  };
}

function drawScheduleExportCard(context, course, x, y, width, height, selectedWeek, scope = "personal") {
  const metrics = scheduleExportCardMetrics(context, course, width, selectedWeek, scope);
  const {
    padding,
    palette,
    badge,
    badgeWidth,
    titleLines,
    scheduleLines,
    teacherLines,
    locationLines,
    footerLines,
    scheduleBandHeight
  } = metrics;
  context.save();
  context.shadowColor = "rgba(30, 52, 90, 0.07)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 4;
  canvasRoundedRect(context, x, y, width, height, 16);
  context.fillStyle = palette.bg;
  context.fill();
  context.restore();
  context.save();
  canvasRoundedRect(context, x, y, width, height, 16);
  context.clip();
  context.fillStyle = palette.top;
  context.fillRect(x, y, width, 52);
  context.fillStyle = palette.accent;
  context.fillRect(x, y, 7, height);
  context.fillStyle = palette.border;
  context.fillRect(x, y + 52, width, 1);
  context.restore();

  context.save();
  canvasRoundedRect(context, x, y, width, height, 16);
  context.strokeStyle = palette.border;
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();

  context.save();
  canvasRoundedRect(context, x, y, width, height, 16);
  context.clip();
  if (badge) {
    const badgeX = x + width - padding - badgeWidth;
    const badgeY = y + padding - 2;
    canvasRoundedRect(context, badgeX, badgeY, badgeWidth, 28, 14);
    context.fillStyle = palette.badgeBg;
    context.fill();
    context.fillStyle = palette.badgeText;
    context.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    context.fillText(badge, badgeX + 13, badgeY + 19);
  }

  context.fillStyle = palette.title;
  context.font = "700 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  let cursor = drawCanvasTextLines(context, titleLines, x + padding, y + padding + 20, 25) + 8;

  if (metrics.groupEntryLayouts?.length) {
    metrics.groupEntryLayouts.forEach((layout, index) => {
      const blockTop = cursor + (index ? 10 : 6);
      canvasRoundedRect(context, x + padding, blockTop, width - padding * 2, layout.height - 8, 12);
      context.fillStyle = "rgba(255,255,255,0.54)";
      context.fill();
      context.strokeStyle = palette.divider;
      context.lineWidth = 1;
      context.stroke();
      let inner = blockTop + 18;
      context.fillStyle = palette.title;
      context.font = "700 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
      inner = drawCanvasTextLines(context, layout.entryTitleLines, x + padding + 10, inner, 18) + 4;
      context.fillStyle = palette.badgeText;
      context.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
      inner = drawCanvasTextLines(context, layout.entryScheduleLines, x + padding + 10, inner + 10, 16) + 2;
      context.fillStyle = palette.text;
      drawCanvasTextLines(context, layout.entryMetaLines, x + padding + 10, inner + 10, 16);
      cursor = blockTop + layout.height;
    });
    context.restore();
    return;
  }

  const scheduleBoxY = cursor + 6;
  canvasRoundedRect(context, x + padding, scheduleBoxY, width - padding * 2, scheduleBandHeight, 12);
  context.fillStyle = palette.accentSoft;
  context.fill();
  context.fillStyle = palette.badgeText;
  context.font = "600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  cursor = drawCanvasTextLines(context, scheduleLines, x + padding + 10, scheduleBoxY + 18, 20) + 8;
  context.fillStyle = palette.text;
  context.font = "500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  cursor = drawCanvasTextLines(context, teacherLines, x + padding, cursor + 14, 18) + 2;
  cursor = drawCanvasTextLines(context, locationLines, x + padding, cursor + 12, 18) + 3;
  context.strokeStyle = palette.divider;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + padding, cursor + 8);
  context.lineTo(x + width - padding, cursor + 8);
  context.stroke();
  context.fillStyle = palette.muted;
  context.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  drawCanvasTextLines(context, footerLines, x + padding, cursor + 24, 17);
  context.restore();
}

function scheduleExportTermLabel() {
  const allTerm = document.getElementById("allTermSelect");
  const topTerm = elements.termSelect;
  return (allTerm?.selectedOptions?.[0]?.textContent || topTerm?.selectedOptions?.[0]?.textContent || "当前学期").trim();
}

function scheduleExportFileName(scope, selectedWeek) {
  const prefix = scope === "all-detail" ? `全校课表-${state.allDetail?.name || "详情"}` : "个人课表";
  const suffix = selectedWeek === "all" ? "全学期" : `第${selectedWeek}周`;
  return `${prefix}-${scheduleExportTermLabel()}-${suffix}.png`.replace(/[\\/:*?"<>|\r\n]+/g, "_");
}

function buildScheduleExportCanvas(rows, scope, selectedWeek) {
  const filtered = scheduleExportFilteredRows(rows, selectedWeek)
    .slice()
    .sort((left, right) => {
      const dayDiff = (courseDayIndex(left) < 0 ? 7 : courseDayIndex(left)) - (courseDayIndex(right) < 0 ? 7 : courseDayIndex(right));
      const leftSection = courseSectionRange(left)?.start || 99;
      const rightSection = courseSectionRange(right)?.start || 99;
      return dayDiff || leftSection - rightSection || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
    });
  const sectionCount = Math.max(12, ...filtered.map((course) => courseSectionRange(course)?.end || 0));
  let dayItems = Array.from({ length: 7 }, () => []);
  const unplaced = [];
  filtered.forEach((course) => {
    const day = courseDayIndex(course);
    const range = courseSectionRange(course);
    if (day < 0 || day >= 7 || !range) {
      unplaced.push(course);
      return;
    }
    const item = {
      course,
      day,
      range: {
        start: Math.max(1, Math.min(sectionCount, range.start)),
        end: Math.max(1, Math.min(sectionCount, range.end))
      }
    };
    dayItems[day].push(item);
  });

  // 全学期视图里，同一门课经常会因为不同周次/教师/地点返回多条记录。
  // 它们共享同一个星期和节次，不应被误判成同时发生的横向冲突；先合并成
  // 一张卡片，卡片内部逐条列出安排，才能既保留完整信息又避免窄条卡片。
  dayItems = dayItems.map((items) => {
    const byRange = new Map();
    items.forEach((item) => {
      const key = `${item.range.start}-${item.range.end}`;
      const existing = byRange.get(key);
      if (!existing) {
        byRange.set(key, { ...item });
        return;
      }
      existing.course = makeScheduleExportGroup(
        [existing.course, item.course],
        existing.range,
        scheduleExportGroupTitle("同一时段", [existing.course, item.course])
      );
    });
    return [...byRange.values()];
  });

  const canvas = document.createElement("canvas");
  const width = 4200;
  const outer = 48;
  const gap = 18;
  const sectionLabelWidth = 150;
  const columnWidth = Math.floor((width - outer * 2 - sectionLabelWidth - gap * 7) / 7);
  const cellPadding = 12;
  const cardGap = 10;
  const headerHeight = 68;
  const gridTop = 166;
  const measureContext = document.createElement("canvas").getContext("2d");
  const spanItems = [];
  const dayComponents = (items) => {
    const sorted = items.slice().sort((left, right) => left.range.start - right.range.start || left.range.end - right.range.end);
    const components = [];
    let component = [];
    let componentEnd = 0;
    sorted.forEach((item) => {
      if (component.length && item.range.start > componentEnd) {
        components.push(component);
        component = [];
        componentEnd = 0;
      }
      component.push(item);
      componentEnd = Math.max(componentEnd, item.range.end);
    });
    if (component.length) components.push(component);
    return components;
  };
  dayItems.forEach((items, day) => {
    dayComponents(items).forEach((component) => {
      const active = [];
      let maxLane = 0;
      component.forEach((item) => {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].range.end < item.range.start) active.splice(index, 1);
        }
        const occupied = active.map((candidate) => candidate.lane);
        let lane = 0;
        while (occupied.includes(lane)) lane += 1;
        item.lane = lane;
        maxLane = Math.max(maxLane, lane);
        active.push(item);
      });
      const laneCount = maxLane + 1;
      // 只有相同星期 + 相同节次范围的记录已在上面合并；这里无论冲突列数多少，
      // 都保留每个 item 的真实范围，并按 lane 并排绘制，不能把不同范围扩成 union card。
      component.forEach((item) => {
        item.mode = "span";
        item.laneCount = laneCount;
        item.cardWidth = Math.floor((columnWidth - cellPadding * 2 - cardGap * (laneCount - 1)) / laneCount);
        spanItems.push(item);
      });
    });
  });

  // 导出图保持真正的“节次网格”：每节先使用统一行高，课程通过跨行卡片
  // 表示第 N-M 节。只有内容确实放不下时，才把不足高度均匀分摊到它覆盖
  // 的所有节次，避免出现首节很高、后续节次被压成细线的错觉。
  const rowHeights = Array.from({ length: sectionCount }, () => 194);

  // 先按统一行高测量跨行卡片；不足的高度平均补给整个范围，保证卡片真正
  // 覆盖“第5-8节”而且完整容纳课程名称、地点和标签。
  spanItems.forEach((item) => {
    const rowCount = item.range.start <= item.range.end ? item.range.end - item.range.start + 1 : 0;
    const available = rowCount
      ? rowHeights.slice(item.range.start - 1, item.range.end).reduce((total, value) => total + value, 0) - cellPadding * 2
      : 0;
    const cardHeight = scheduleExportCardMetrics(measureContext, item.course, item.cardWidth, selectedWeek, scope).height;
    if (cardHeight > available && rowCount) {
      const addition = (cardHeight - available) / rowCount;
      for (let index = item.range.start - 1; index < item.range.end; index += 1) rowHeights[index] += addition;
    }
  });
  const gridHeight = rowHeights.reduce((total, value) => total + value, 0);
  const unplacedRows = Math.ceil(unplaced.length / 4);
  const unplacedWidth = Math.floor((width - outer * 2 - gap * 3) / 4);
  const unplacedCardWidths = unplacedWidth - cellPadding * 2;
  const unplacedRowHeights = Array.from({ length: unplacedRows }, (_, row) => Math.max(178, ...unplaced.slice(row * 4, row * 4 + 4).map((course) => scheduleExportCardMetrics(measureContext, course, unplacedCardWidths, selectedWeek, scope).height)));
  const unplacedHeight = unplaced.length ? 80 + cellPadding * 2 + unplacedRowHeights.reduce((total, value) => total + value, 0) + cardGap * Math.max(0, unplacedRowHeights.length - 1) : 0;
  const height = gridTop + gridHeight + (unplaced.length ? 28 + unplacedHeight : 0) + outer;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f6f8fc";
  context.fillRect(0, 0, width, height);
  context.save();
  context.shadowColor = "rgba(22, 40, 73, 0.06)";
  context.shadowBlur = 20;
  context.shadowOffsetY = 6;
  canvasRoundedRect(context, outer, 28, width - outer * 2, 108, 24);
  context.fillStyle = "#ffffff";
  context.fill();
  context.restore();
  context.save();
  canvasRoundedRect(context, outer, 28, width - outer * 2, 108, 24);
  context.strokeStyle = "#dfe7f3";
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
  canvasRoundedRect(context, outer + 24, 52, 18, 58, 9);
  context.fillStyle = "#5d87f7";
  context.fill();
  context.fillStyle = "#23406d";
  context.font = "700 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  context.fillText(scope === "all-detail" ? `全校课表 · ${state.allDetail?.name || "详情"}` : "个人课表", outer + 58, 74);
  context.fillStyle = "#6a7f9f";
  context.font = "500 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  context.fillText(`${scheduleExportTermLabel()} · ${selectedWeek === "all" ? "整个学期" : `第${selectedWeek}周`} · 节次 × 星期网格 · 课程按完整节次跨行`, outer + 58, 111);

  const headerX = outer + sectionLabelWidth + gap;
  const headerY = gridTop;
  context.fillStyle = "#edf3ff";
  context.strokeStyle = "#d9e4f4";
  context.lineWidth = 1.5;
  context.fillRect(outer, headerY, sectionLabelWidth, headerHeight);
  context.strokeRect(outer, headerY, sectionLabelWidth, headerHeight);
  context.fillStyle = "#476a9f";
  context.font = "700 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  context.fillText("节次", outer + 46, headerY + 42);
  SUNDAY_FIRST_DAY_NAMES.forEach((name, day) => {
    const x = headerX + day * (columnWidth + gap);
    context.fillStyle = "#edf3ff";
    context.fillRect(x, headerY, columnWidth, headerHeight);
    context.strokeStyle = "#d9e4f4";
    context.strokeRect(x, headerY, columnWidth, headerHeight);
    context.fillStyle = "#476a9f";
    context.font = "700 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    context.fillText(name, x + 16, headerY + 42);
    const arrangements = dayItems[day].reduce((total, item) => total + scheduleExportEntryCount(item.course), 0);
    const coursesCount = scheduleExportUniqueCourseCount(dayItems[day].map((item) => item.course));
    context.fillStyle = "#8092ac";
    context.font = "500 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    const countText = coursesCount === arrangements
      ? `${coursesCount} 门课`
      : `${coursesCount} 门课 · ${arrangements} 条安排`;
    context.fillText(countText, x + columnWidth - 16 - context.measureText(countText).width, headerY + 40);
  });

  const rowTops = [];
  let rowTop = gridTop + headerHeight;
  rowHeights.forEach((rowHeight, section) => {
    rowTops[section] = rowTop;
    context.fillStyle = section % 2 ? "#f8fbff" : "#f1f5fb";
    context.fillRect(outer, rowTop, sectionLabelWidth, rowHeight);
    context.strokeStyle = "#d9e4f4";
    context.strokeRect(outer, rowTop, sectionLabelWidth, rowHeight);
    context.fillStyle = "#5b7397";
    context.font = "700 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    context.fillText(`第${section + 1}节`, outer + 39, rowTop + Math.min(48, rowHeight / 2 + 8));
    for (let day = 0; day < 7; day += 1) {
      const x = headerX + day * (columnWidth + gap);
      context.fillStyle = section % 2 ? "#ffffff" : "#fcfdff";
      context.fillRect(x, rowTop, columnWidth, rowHeight);
      context.strokeStyle = "#d9e4f4";
      context.strokeRect(x, rowTop, columnWidth, rowHeight);
    }
    rowTop += rowHeight;
  });

  // 背景网格全部绘制完成后再画课程卡片，跨行卡片不会被后续行的白色背景盖住。
  spanItems.forEach((item) => {
    const x = headerX + item.day * (columnWidth + gap);
    const cardX = x + cellPadding + item.lane * (item.cardWidth + cardGap);
    const cardY = rowTops[item.range.start - 1] + cellPadding;
    const rangeBottom = rowTops[item.range.end - 1] + rowHeights[item.range.end - 1] - cellPadding;
    drawScheduleExportCard(context, item.course, cardX, cardY, item.cardWidth, rangeBottom - cardY, selectedWeek, scope);
  });

  if (unplaced.length) {
    const y = rowTop + 28;
    canvasRoundedRect(context, outer, y, width - outer * 2, unplacedHeight, 16);
    context.fillStyle = "#ffffff";
    context.fill();
    context.strokeStyle = "#dfe7f4";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#edf3ff";
    canvasRoundedRect(context, outer, y, width - outer * 2, 60, 16);
    context.fill();
    context.fillStyle = "#476da9";
    context.font = "700 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";
    context.fillText(unplaced.some((course) => course.source === "local" && course.localType === "event") ? "本周其他日程 / 未识别节次的安排" : "未识别星期或节次的课程", outer + cellPadding, y + 38);
    unplaced.forEach((course, index) => {
      const row = Math.floor(index / 4);
      const column = index % 4;
      const previousRowsHeight = unplacedRowHeights.slice(0, row).reduce((total, value) => total + value + cardGap, 0);
      drawScheduleExportCard(context, course, outer + column * (unplacedWidth + gap) + cellPadding, y + 80 + cellPadding + previousRowsHeight, unplacedCardWidths, unplacedRowHeights[row], selectedWeek, scope);
    });
  }
  return { canvas, count: filtered.length };
}

function downloadScheduleCanvas(canvas, fileName) {
  if (typeof globalThis.AndroidApi?.saveImage === "function") {
    try {
      globalThis.AndroidApi.saveImage(canvas.toDataURL("image/png"), fileName);
      setNotice("课表图片已发送到 Android 保存，请在图片/执掌东大中查看。", "success");
      return true;
    } catch (error) {
      setNotice(`保存课表图片失败：${error.message || "原生保存接口不可用"}`, "error");
      return false;
    }
  }
  const save = (blob) => {
    if (!blob) {
      setNotice("课表图片生成失败，请重试。", "error");
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setNotice("课表图片已生成并开始下载。", "success");
  };
  if (typeof canvas.toBlob === "function") canvas.toBlob(save, "image/png");
  else save(dataUrlToBlob(canvas.toDataURL("image/png")));
  return true;
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl).split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(parts[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function openScheduleImageExport(scope = "personal") {
  const rows = scheduleExportRows(scope);
  if (!rows.length) {
    setNotice("当前没有可导出的课表记录，请先刷新课表。", "error");
    return;
  }
  const numbers = scheduleWeekNumbers(rows);
  const current = scheduleWeekValue(scope);
  const selectedWeek = current === "all" || numbers.includes(Number(current)) ? String(current) : "all";
  state.selectedCourse = null;
  state.scheduleExport = { scope, selectedWeek };
  render();
}

function exportScheduleImage() {
  const exportState = state.scheduleExport;
  if (!exportState) return;
  const rows = scheduleExportRows(exportState.scope);
  const selectedWeek = document.getElementById("scheduleExportWeekSelect")?.value || exportState.selectedWeek || "all";
  let result;
  try {
    result = buildScheduleExportCanvas(rows, exportState.scope, selectedWeek);
  } catch (error) {
    console.error("schedule image export failed", error);
    state.scheduleExport.error = error?.message || "浏览器画布无法完成绘制";
    setNotice(`课表图片生成失败：${state.scheduleExport.error}`, "error");
    render();
    return;
  }
  if (!result.count) {
    state.scheduleExport.error = selectedWeek === "all" ? "当前没有可导出的课程。" : `第${selectedWeek}周没有课程可导出。`;
    setNotice(state.scheduleExport.error, "error");
    render();
    return;
  }
  state.scheduleExport = null;
  render();
  downloadScheduleCanvas(result.canvas, scheduleExportFileName(exportState.scope, selectedWeek));
}

function renderCourseCards(rows, scope = "personal") {
  if (!rows.length) return emptyCard("当前学期暂无课表", "接口没有返回个人课表数据，可以先打开原系统确认当前学期是否已发布。", `<button class="button button-ghost" type="button" data-action="open-portal">打开我的课表</button>`);
  const availability = courseFieldAvailability(rows, scope);
  return `<div class="course-list">${rows.map((row) => `<button class="course-card course-card-button" ${courseActionAttributes(row, scope)}><h4>${escapeHtml(row.name)}</h4><div class="course-meta"><span>课程号：${escapeHtml(row.code)}</span><span>教师：${escapeHtml(row.teacher)}</span><span>时间：${escapeHtml(row.time || row.section || row.weekday || "待识别")}</span><span>地点：${escapeHtml(row.location || row.detail || "待识别")}</span><span>周次：${escapeHtml(row.weeks)}</span><span>学分：${escapeHtml(row.credit)}</span>${availability.assessment && courseAssessmentValue(row) ? `<span>考核：${escapeHtml(courseAssessmentValue(row))}</span>` : ""}${availability.requirement && courseRequirementValue(row) ? `<span>性质：${escapeHtml(courseRequirementValue(row))}</span>` : ""}</div></button>`).join("")}</div>`;
}

function courseMobileArrangementMarkup(arrangement, index, scope = "personal") {
  const clockText = extractClockText(arrangement.time) || localScheduleClockText(arrangement);
  const sectionText = courseSectionLabel(arrangement);
  const weekText = arrangement.weeks || "周次待识别";
  const weekdayText = arrangement.weekday || "星期待识别";
  const timingText = [weekdayText, sectionText].filter(Boolean).join(" · ") || "上课时间待识别";
  const metaText = [arrangement.teacher || "教师待识别", arrangement.location || "地点待识别"].join(" · ");
  const unresolved = sectionText === "节次待识别" || (!arrangement.weekday && !clockText);
  const action = courseActionAttributes(arrangement, scope) || `type="button"`;
  return `<li><button class="course-arrangement-item${unresolved ? " is-unresolved" : ""}" ${action} title="查看第${index + 1}条排课详情"><span class="course-arrangement-summary"><span class="course-arrangement-week">${escapeHtml(weekText)}</span><span class="course-arrangement-slot">${escapeHtml(timingText)}</span>${clockText ? `<time class="course-arrangement-clock">${escapeHtml(clockText)}</time>` : ""}</span><small class="course-arrangement-meta">${escapeHtml(metaText)}</small></button></li>`;
}

function renderCourseRowsTable(rows, includeDetail = false, scope = "personal") {
  const courses = normalizedScheduleCourses(rows);
  const availability = courseFieldAvailability(courses, scope);
  const detailHeader = includeDetail ? "<th>原始时间地点</th>" : "";
  const assessmentHeader = availability.assessment ? "<th>考核方式</th>" : "";
  const requirementHeader = availability.requirement ? "<th>课程性质</th>" : "";
  const categoryHeader = availability.category ? "<th>课程类别</th>" : "";
  const body = courses.map((course) => {
    const arrangements = courseArrangementRows(course, scope);
    const arrangementList = arrangements.map((arrangement, index) => {
      const clockText = extractClockText(arrangement.time) || localScheduleClockText(arrangement);
      const scheduleText = [arrangement.weeks, arrangement.weekday, courseSectionLabel(arrangement), clockText].filter(Boolean).join(" · ") || "排课信息待识别";
      const metaText = [arrangement.teacher && `教师：${arrangement.teacher}`, arrangement.location && `地点：${arrangement.location}`].filter(Boolean).join(" · ") || "教师、地点待识别";
      const action = courseActionAttributes(arrangement, scope) || `type="button"`;
      return `<li><button class="course-arrangement-item" ${action} title="查看第${index + 1}条排课详情"><span class="course-arrangement-summary">${escapeHtml(scheduleText)}</span><small class="course-arrangement-meta">${escapeHtml(metaText)}</small></button></li>`;
    }).join("");
    const courseAction = courseActionAttributes(course, scope) || `type="button"`;
    const categoryCell = availability.category ? `<td>${escapeHtml(courseCategoryValue(course) || "—")}</td>` : "";
    const assessmentCell = availability.assessment ? `<td>${escapeHtml(courseAssessmentValue(course) || "—")}</td>` : "";
    const requirementCell = availability.requirement ? `<td>${escapeHtml(courseRequirementValue(course) || "—")}</td>` : "";
    return `<tr><td class="primary-cell"><button class="course-mobile-heading" ${courseAction} title="查看课程详情">${escapeHtml(course.name)}</button></td><td>${escapeHtml(course.code || course.catalogCode || "—")}</td><td class="course-arrangements-cell">${arrangements.length > 1 ? `<span class="course-arrangement-count">${arrangements.length} 条上课安排</span>` : ""}<ul class="course-arrangement-list">${arrangementList}</ul></td>${categoryCell}${assessmentCell}${requirementCell}${includeDetail ? `<td>${escapeHtml(course.detail || course.time || "—")}</td>` : ""}</tr>`;
  }).join("");
  const mobile = courses.map((course) => {
    const arrangements = courseArrangementRows(course, scope);
    const action = courseActionAttributes(course, scope) || `type="button"`;
    const arrangementList = arrangements.map((arrangement, index) => courseMobileArrangementMarkup(arrangement, index, scope)).join("");
    const arrangementLabel = arrangements.length ? `${arrangements.length} 条安排` : "待排课";
    return `<article class="course-mobile-row course-mobile-standalone"><div class="course-mobile-group-head"><button class="course-mobile-heading" ${action} title="点击查看课程详情"><strong>${escapeHtml(course.name)}</strong><small>${escapeHtml(course.code || course.catalogCode || "无课程号")}</small></button><span class="course-arrangement-count">${escapeHtml(arrangementLabel)}</span></div><ul class="course-arrangement-list">${arrangementList}</ul></article>`;
  }).join("");
  return `<div class="table-wrap course-desktop-table"><table><thead><tr><th>课程</th><th>课程号</th><th>上课安排</th>${categoryHeader}${assessmentHeader}${requirementHeader}${detailHeader}</tr></thead><tbody>${body}</tbody></table></div><div class="course-mobile-list">${mobile}</div>`;
}

function renderCourseTransferToolbar(scope, rows = []) {
  const records = courseTransferRecords(scope, rows);
  const active = state.courseTransfer.selectionScope === scope && state.courseTransfer.selectionMode;
  const selectedCount = selectedCourseTransferRecords(scope, rows).length;
  const scopeLabel = scope === "all-detail" ? "当前课表明细" : "全校查询结果";
  const hint = active
    ? `已选择 ${selectedCount} / ${records.length} 门课程；勾选后可生成可粘贴的标准化 JSON 文本。`
    : `可从${scopeLabel}中选择课程；导入课程文本后，会与当前打开的全校课表逐条检查撞课。`;
  const csvAction = scheduleCsvHasRows(scope)
    ? `<button class="button button-ghost button-small" type="button" data-action="export-schedule-csv" data-schedule-scope="${scope}">导出 CSV</button>`
    : "";
  return `<div class="course-transfer-toolbar"><div class="course-transfer-copy"><strong>课程信息导出 / 撞课查询</strong><span>${escapeHtml(hint)}</span></div><div class="button-row"><button class="button button-ghost button-small" type="button" data-action="toggle-course-name-sort" data-course-transfer-scope="${scope}" title="按中文课程名的拼音首字母排序">${escapeHtml(courseTransferSortLabel(scope))}</button>${csvAction}${active ? `<button class="button button-primary" type="button" data-action="export-selected-courses" data-course-transfer-scope="${scope}" ${selectedCount ? "" : "disabled"}>导出已选（${selectedCount}）</button><button class="button button-ghost" type="button" data-action="cancel-course-selection">退出选择</button>` : `<button class="button button-ghost" type="button" data-action="start-course-selection" data-course-transfer-scope="${scope}">选择课程并导出</button>`}<button class="button button-soft" type="button" data-action="open-course-import">导入文本并检查撞课</button></div></div>`;
}

function renderSelectableCourseRowsTable(rows, includeDetail = false, scope = "all") {
  const records = courseTransferRecords(scope, rows);
  const courses = records.map((record) => record.course);
  if (!courses.length) return emptyCard("没有可选择的课程", "当前结果表没有识别出课程记录；请先打开某个班级、教师或教室的课表明细。", `<button class="button button-soft" type="button" data-action="open-course-import">导入文本并检查撞课</button>`);
  const availability = courseFieldAvailability(courses, scope);
  const active = state.courseTransfer.selectionScope === scope && state.courseTransfer.selectionMode;
  const selectedKeys = state.courseTransfer.selectedKeys;
  const allChecked = active && records.length > 0 && records.every((record) => selectedKeys.has(courseTransferKey(scope, record.index)));
  const selectionHeader = active ? `<th class="course-select-column"><input type="checkbox" data-action="toggle-course-selection-all" data-course-selection-all="true" data-course-transfer-scope="${scope}" aria-label="全选课程" ${allChecked ? "checked" : ""} /></th>` : "";
  const detailHeader = includeDetail ? "<th>原始时间地点</th>" : "";
  const assessmentHeader = availability.assessment ? "<th>考核方式</th>" : "";
  const requirementHeader = availability.requirement ? "<th>课程性质</th>" : "";
  const categoryHeader = availability.category ? "<th>课程类别</th>" : "";
  const body = sortCourseTransferRecords(records, scope).map((record) => {
    const course = record.course;
    const key = courseTransferKey(scope, record.index);
    const checked = active && selectedKeys.has(key);
    const clockText = extractClockText(course.time);
    const sectionText = [courseSectionLabel(course), clockText].filter(Boolean).join(" / ") || "—";
    const categoryCell = availability.category ? `<td>${escapeHtml(courseCategoryValue(course) || "—")}</td>` : "";
    const assessmentCell = availability.assessment ? `<td>${escapeHtml(courseAssessmentValue(course) || "—")}</td>` : "";
    const requirementCell = availability.requirement ? `<td>${escapeHtml(courseRequirementValue(course) || "—")}</td>` : "";
    const selectCell = active ? `<td class="course-select-column"><input type="checkbox" data-action="toggle-course-selection" data-course-selection="true" data-course-transfer-scope="${scope}" data-course-transfer-key="${escapeHtml(key)}" aria-label="选择${escapeHtml(course.name || "课程")}" ${checked ? "checked" : ""} /></td>` : "";
    return `<tr class="clickable-row" ${courseDataAttributes(course, scope)} title="点击查看课程详情">${selectCell}<td class="primary-cell">${escapeHtml(course.name)}</td><td>${escapeHtml(course.code || course.catalogCode || "—")}</td><td>${escapeHtml(course.weeks || "—")}</td><td>${escapeHtml(course.weekday || "—")}</td><td>${escapeHtml(sectionText)}</td><td>${escapeHtml(course.teacher || "—")}</td><td>${escapeHtml(course.location || "—")}</td>${categoryCell}${assessmentCell}${requirementCell}${includeDetail ? `<td>${escapeHtml(course.detail || course.time || "—")}</td>` : ""}</tr>`;
  }).join("");
  const mobile = sortCourseTransferRecords(records, scope).map((record) => {
    const course = record.course;
    const key = courseTransferKey(scope, record.index);
    const checked = active && selectedKeys.has(key);
    const clockText = extractClockText(course.time);
    const sectionText = [courseSectionLabel(course), clockText].filter(Boolean).join(" / ");
    const scheduleText = [course.weeks, course.weekday, sectionText].filter(Boolean).join(" · ") || "排课信息待识别";
    const placeText = [course.teacher, course.location].filter(Boolean).join(" · ") || course.detail || "地点待识别";
    const action = courseActionAttributes(course, scope) || `type="button"`;
    const selection = active ? `<label class="course-mobile-select"><input type="checkbox" data-action="toggle-course-selection" data-course-selection="true" data-course-transfer-scope="${scope}" data-course-transfer-key="${escapeHtml(key)}" aria-label="选择${escapeHtml(course.name || "课程")}" ${checked ? "checked" : ""} /></label>` : "";
    return `<div class="course-mobile-row">${selection}<button class="course-mobile-main" ${action} title="点击查看课程详情"><strong>${escapeHtml(course.name)}</strong><span>${escapeHtml(scheduleText)}</span><small>${escapeHtml(placeText)}</small></button></div>`;
  }).join("");
  return `${renderCourseTransferToolbar(scope, rows)}<div class="table-wrap course-transfer-table-wrap"><table><thead><tr>${selectionHeader}<th>课程</th><th>课程号</th><th>周次</th><th>星期</th><th>节次 / 时间</th><th>授课教师</th><th>上课地点</th>${categoryHeader}${assessmentHeader}${requirementHeader}${detailHeader}</tr></thead><tbody>${body}</tbody></table></div><div class="course-mobile-list course-transfer-mobile-list">${mobile}</div><p class="muted table-footnote">当前表格共 ${courses.length} 条课程记录。点击课程名称所在行可查看完整字段；进入选择模式后可多选导出。</p>`;
}

function renderCourseTransferCollisionResult(result) {
  if (!result) return "";
  const conflictItems = result.conflicts.map((item) => `<article class="course-collision-item course-collision-certain"><div class="course-collision-head"><span class="tag warn">确定冲突</span><strong>${escapeHtml(item.imported.name || "导入课程")}</strong><span>与</span><strong>${escapeHtml(item.existing.name || "当前课表课程")}</strong></div><p>导入课程：${escapeHtml(courseTransferBrief(item.imported))}</p><p>当前课表课程：${escapeHtml(courseTransferBrief(item.existing))}</p></article>`).join("");
  const possibleItems = result.possible.map((item) => `<article class="course-collision-item course-collision-possible"><div class="course-collision-head"><span class="tag">可能冲突</span><strong>${escapeHtml(item.imported.name || "导入课程")}</strong><span>与</span><strong>${escapeHtml(item.existing.name || "当前课表课程")}</strong></div><p>导入课程：${escapeHtml(courseTransferBrief(item.imported))}</p><p>当前课表课程：${escapeHtml(courseTransferBrief(item.existing))}</p><small>因${escapeHtml((item.reasons || item.missing || []).join("、") || "排课字段") }未完整返回，已按保守规则提示，请结合原系统确认。</small></article>`).join("");
  const summary = `<div class="course-collision-summary"><div><span>导入课程</span><strong>${result.importedCount}</strong></div><div><span>确定冲突</span><strong class="collision-number-danger">${result.conflicts.length}</strong></div><div><span>可能冲突</span><strong class="collision-number-warn">${result.possible.length}</strong></div><div><span>当前课表课程</span><strong>${result.referenceCount}</strong></div></div>`;
  const empty = !result.conflicts.length && !result.possible.length
    ? `<div class="course-collision-empty"><strong>没有发现时间重叠</strong><span>已按周次、星期和节次范围与“${escapeHtml(result.referenceLabel)}”逐条比较。</span></div>`
    : "";
  const referenceNote = result.referenceCount
    ? `<div class="schedule-note">比较对象：${escapeHtml(result.referenceLabel)}（${result.referenceCount} 条课程记录）。</div>`
    : `<div class="schedule-note">当前没有打开可比较的全校课表明细；请先返回全校课表查询结果，点击“查看课表”打开目标课表后再分析。</div>`;
  return `<div class="course-collision-result"><h4>撞课分析结果</h4>${summary}${referenceNote}${empty}${conflictItems}${possibleItems}</div>`;
}

function renderCourseTransferModal() {
  const transfer = state.courseTransfer;
  if (!transfer.mode) return "";
  const isExport = transfer.mode === "export";
  const title = isExport ? "导出课程信息" : "导入课程文本并检查撞课";
  const copy = isExport
    ? "下面是标准化 JSON 文本，包含课程身份、周次、星期、节次、时间、教师、地点、课程类别、考核方式、课程性质和原始接口字段。"
    : `粘贴之前导出的完整 JSON 文本；系统会与当前打开的${currentAllScheduleLabel()}按周次、星期和节次范围比较。`;
  const content = isExport
    ? `<div class="course-transfer-format-note"><strong>已选择课程</strong><span>${escapeHtml(`${JSON.parse(transfer.exportText || "{}")?.courses?.length || 0} 门 · 可直接复制或保存`)}</span></div><textarea id="courseTransferExportText" class="course-transfer-textarea" readonly>${escapeHtml(transfer.exportText)}</textarea><div class="course-transfer-modal-actions"><button class="button button-primary" type="button" data-action="copy-course-export">复制标准文本</button><button class="button button-ghost" type="button" data-action="download-course-export">保存为 .json</button></div>`
    : `<div class="course-transfer-format-note"><strong>当前比较对象</strong><span>${escapeHtml(`${currentAllScheduleLabel()} · ${currentAllScheduleCourses().length} 条课程记录`)}</span></div><textarea id="courseImportText" class="course-transfer-textarea" placeholder="请粘贴课程信息导出文本…">${escapeHtml(transfer.text)}</textarea><p class="muted course-transfer-modal-hint">支持本插件导出的 neu-course-selection/v1，也支持直接粘贴 courses 数组或 JSON 数组。不会把导入文本上传到任何服务器。</p>${renderCourseTransferCollisionResult(transfer.result)}<div class="course-transfer-modal-actions"><button class="button button-primary" type="button" data-action="analyze-course-import">开始分析撞课</button></div>`;
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal course-transfer-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="detail-modal-head"><div><p class="eyebrow">COURSE TRANSFER</p><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(copy)}</p></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-course-transfer">关闭</button></div>${transfer.error ? `<div class="error-card course-transfer-message"><p>${escapeHtml(transfer.error)}</p></div>` : ""}${transfer.notice ? `<div class="notice is-success course-transfer-message">${escapeHtml(transfer.notice)}</div>` : ""}${content}<div class="schedule-export-actions"><button class="button button-ghost" type="button" data-action="close-course-transfer">关闭</button></div></section></div>`;
}

function clearCourseTransferModal() {
  state.courseTransfer.mode = "";
  state.courseTransfer.text = "";
  state.courseTransfer.exportText = "";
  state.courseTransfer.error = "";
  state.courseTransfer.notice = "";
  state.courseTransfer.result = null;
}

function openCourseExport(scope) {
  const selected = selectedCourseTransferRecords(scope);
  if (!selected.length) {
    setNotice("请先勾选至少一门课程，再导出课程信息。", "error");
    return;
  }
  state.courseTransfer.mode = "export";
  state.courseTransfer.exportText = JSON.stringify(courseTransferPayload(scope), null, 2);
  state.courseTransfer.error = "";
  state.courseTransfer.notice = "";
  state.courseTransfer.result = null;
  render();
}

async function copyCourseExport() {
  const text = state.courseTransfer.exportText || "";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.getElementById("courseTransferExportText");
      textarea?.focus();
      textarea?.select();
      if (!document.execCommand("copy")) throw new Error("浏览器拒绝复制");
    }
    state.courseTransfer.notice = "";
    state.courseTransfer.error = "";
    showToast("已复制标准化课程信息文本。", "success");
  } catch (error) {
    state.courseTransfer.error = `复制失败：${error.message || "请手动选中文本复制"}`;
    state.courseTransfer.notice = "";
  }
  render();
}

function downloadCourseExport() {
  const text = state.courseTransfer.exportText || "";
  if (!text) return;
  const term = String(allQueryTermCode() || "课程").replace(/[^\w\u3400-\u9fff-]+/g, "_");
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `东北大学课程信息_${term}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
  state.courseTransfer.notice = "";
  state.courseTransfer.error = "";
  showToast("已生成课程信息 JSON 文件。", "success");
  render();
}

function analyzeCourseImport() {
  const input = document.getElementById("courseImportText");
  state.courseTransfer.text = input?.value || state.courseTransfer.text || "";
  try {
    if (!currentAllScheduleCourses().length) {
      throw new Error("请先在全校课表查询结果中点击“查看课表”，打开要比较的课表后再分析。");
    }
    const parsed = parseCourseTransferText(state.courseTransfer.text);
    state.courseTransfer.result = analyzeCourseTransferCollisions(parsed.courses);
    state.courseTransfer.error = "";
    state.courseTransfer.notice = `已读取 ${parsed.courses.length} 门导入课程并完成时间比较。`;
  } catch (error) {
    state.courseTransfer.result = null;
    state.courseTransfer.error = error.message || "课程文本解析失败";
    state.courseTransfer.notice = "";
  }
  render();
}

function renderCourseDetailModal() {
  const course = state.selectedCourse;
  if (!course) return "";
  const scope = state.selectedCourseScope || "personal";
  const rows = courseRowsForScope(scope);
  const availability = courseFieldAvailability(rows, scope);
  const rawText = course.raw && typeof course.raw === "object" ? JSON.stringify(course.raw, null, 2) : "";
  const sport = courseIsSport(course);
  const catalogCode = courseCatalogCodeValue(course);
  const sportEntries = sport && !course.sportProjectLoading ? courseIncludedEntries(course) : [];
  const catalogField = sport && catalogCode ? `<div><span>课程代码</span><strong>${escapeHtml(catalogCode)}</strong></div>` : "";
  const assessmentField = availability.assessment ? `<div><span>考核方式</span><strong>${escapeHtml(courseAssessmentValue(course) || "—")}</strong></div>` : "";
  const requirementField = availability.requirement ? `<div><span>课程性质</span><strong>${escapeHtml(courseRequirementValue(course) || "—")}</strong></div>` : "";
  const categoryField = availability.category ? `<div><span>课程类别</span><strong>${escapeHtml(courseCategoryValue(course) || "—")}</strong></div>` : "";
  const sportDetails = sport
    ? `<div class="course-included-panel sport-project-panel"><div class="sport-project-head"><span>原系统体育课“列表”</span>${sportEntries.length ? `<em>${escapeHtml(`${sportEntries.length} 个项目/教学班`)}</em>` : ""}</div>${course.sportProjectLoading ? `<p class="sport-project-status">正在读取原系统弹窗中的项目名称、教师和排课信息…</p>` : ""}${course.sportProjectError ? `<p class="sport-project-status sport-project-error">${escapeHtml(course.sportProjectError)}</p>` : ""}${sportEntries.length ? `<ul>${sportEntries.map((entry) => {
      const title = entry.project || entry.name || entry.text || "体育课程";
      const courseLabel = entry.project && entry.name && entry.name !== entry.project ? `课程：${entry.name}` : "";
      const codes = [entry.catalogCode && `课程号 ${entry.catalogCode}`, entry.teachingCode && `教学班 ${entry.teachingCode}`].filter(Boolean).join(" · ");
      const schedule = [entry.weeks, entry.weekday, entry.section].filter(Boolean).join(" · ");
      const teacherPlace = [entry.teacher && `教师：${entry.teacher}`, entry.location && `地点：${entry.location}`].filter(Boolean).join(" · ");
      const labels = [courseLabel, codes, schedule, teacherPlace, entry.assessment, entry.requirement].filter(Boolean).join(" ｜ ");
      return `<li><strong>${escapeHtml(title)}</strong>${labels ? `<span>${escapeHtml(labels)}</span>` : ""}</li>`;
    }).join("")}</ul>` : ""}<small>点击体育课程名称后读取原系统 cxpxbxx.do 返回的项目名称、教学班、教师、周次/节次及考核方式；原系统没有提供的字段会自动留空。</small></div>`
    : "";
  return `<div class="modal-backdrop" role="presentation"><section class="detail-modal" role="dialog" aria-modal="true" aria-label="课程详情"><div class="detail-modal-head"><div><p class="eyebrow">COURSE DETAIL</p><h3>${escapeHtml(course.name || "未命名课程")}</h3></div><button class="button button-ghost detail-modal-close" type="button" data-action="close-course">关闭</button></div><div class="detail-grid"><div><span>课程号 / 教学班号</span><strong>${escapeHtml(course.code || "—")}</strong></div>${catalogField}<div><span>周次</span><strong>${escapeHtml(course.weeks || "—")}</strong></div><div><span>星期</span><strong>${escapeHtml(course.weekday || "—")}</strong></div><div><span>节次 / 时间</span><strong>${escapeHtml([courseSectionLabel(course), extractClockText(course.time)].filter(Boolean).join(" / ") || "—")}</strong></div><div><span>授课教师</span><strong>${escapeHtml(course.teacher || "—")}</strong></div><div><span>上课地点</span><strong>${escapeHtml(course.location || "—")}</strong></div>${categoryField}${assessmentField}${requirementField}<div><span>学分</span><strong>${escapeHtml(course.credit || "—")}</strong></div></div>${sportDetails}<div class="detail-copy"><span>原系统时间地点</span><p>${escapeHtml(course.detail || course.time || "—")}</p></div>${rawText ? `<details class="raw-details"><summary>查看原始字段</summary><pre>${escapeHtml(rawText)}</pre></details>` : ""}</section></div>`;
}

function renderScheduleDisplayControls() {
  const mode = state.scheduleDisplay.personal === "week" ? "week" : "days";
  return `<div class="schedule-display-switch" role="tablist" aria-label="课表视图"><span>课表视图</span><button class="button button-small ${mode === "days" ? "button-primary" : "button-ghost"}" type="button" data-action="schedule-days">今天 / 明天</button><button class="button button-small ${mode === "week" ? "button-primary" : "button-ghost"}" type="button" data-action="schedule-week">周表</button></div>`;
}

function renderDailySchedule(rows, scope = "personal") {
  const availability = courseFieldAvailability(rows, scope);
  const today = localDateOnly(new Date());
  const dates = [today, addCalendarDays(today, 1)];
  const firstWeekDate = normalizeCalendarDate(state.calendar.firstWeekStart);
  const calendarHint = firstWeekDate
    ? `第一周从 ${calendarDateText(firstWeekDate)}（周日）开始，课程已按学周过滤。`
    : "尚未设置第一周的周日，无法准确判断今天和明天的课程；请先设置教学周。";
  const cards = dates.map((date, index) => {
    const info = academicDayInfo(date);
    const courses = filterCoursesForDate(rows, date);
    const period = index === 0 ? "今天" : "明天";
    const weekText = info.week ? `第${info.week}周` : "教学周未设置";
    const courseMarkup = info.week === null
      ? `<div class="daily-empty"><strong>教学周未设置</strong><span>设置第一周周日后才能准确显示这天的课程。</span><button class="button button-link" type="button" data-action="view-settings">设置学周 →</button></div>`
      : courses.length
      ? courses.map((course) => {
        const sectionText = [courseSectionLabel(course), extractClockText(course.time)].filter(Boolean).join(" · ") || "节次待识别";
        const placeText = course.location || course.detail || "地点待识别";
        return `<button class="daily-course-card" ${courseActionAttributes(course, scope)} title="点击查看课程详情"><div class="daily-course-title"><strong>${escapeHtml(course.name || "未命名课程")}</strong><span>${escapeHtml(sectionText)}</span></div><div class="daily-course-tags">${courseTagsMarkup(course, availability)}</div><p class="daily-course-teacher">${escapeHtml(course.teacher || "教师待识别")}</p><p class="daily-course-location">${escapeHtml(placeText)}</p><small class="daily-course-meta">${escapeHtml(course.weeks || "周次待识别")} · ${escapeHtml(course.code || "无课程号")}</small></button>`;
      }).join("")
      : `<div class="daily-empty"><strong>这天没有课程</strong><span>可以安心安排自己的时间</span></div>`;
    return `<section class="daily-day-card ${index === 0 ? "is-today" : ""}"><header class="daily-day-header"><div><span class="daily-day-badge">${period}</span><h4>${SUNDAY_FIRST_DAY_NAMES[info.weekdayIndex]} · ${calendarDateText(date)}</h4></div><span class="tag ${info.week ? "pass" : "warn"}">${weekText}</span></header><div class="daily-course-list">${courseMarkup}</div></section>`;
  }).join("");
  return `<div class="daily-schedule"><div class="daily-schedule-note"><span class="hero-dot" aria-hidden="true"></span><span>${escapeHtml(calendarHint)}</span><button class="button button-ghost button-small" type="button" data-action="view-settings">设置学周</button></div><div class="daily-schedule-grid">${cards}</div></div>`;
}

function renderSettings() {
  const firstWeekDate = normalizeCalendarDate(state.calendar.firstWeekStart);
  const invalidWeekday = firstWeekDate && firstWeekDate.getDay() !== 0;
  const currentText = firstWeekDate
    ? `${calendarDateText(firstWeekDate)} · ${SUNDAY_FIRST_DAY_NAMES[firstWeekDate.getDay()]}`
    : "尚未设置";
  const configuredLoginMethod = IS_ANDROID_APP
    ? androidLoginMethod()
    : (readStoredSetting("zhizhang.loginMethod") === "wechat" ? "wechat" : "password");
  const loginSettings = `<div class="settings-divider"></div><div class="settings-intro settings-login-intro"><span class="eyebrow">LOGIN</span><h3>教务系统默认登录方式</h3><p>账号密码和微信扫码登录仍然都保留。下次打开原系统登录页时，${IS_ANDROID_APP ? "手机端会优先显示这里选择的方式；微信扫码会先保存二维码图片，再打开微信供你从相册扫描" : "电脑端会自动切到这里选择的原系统标签"}。</p></div><label class="settings-field"><span>默认方式</span><select id="loginMethodSelect"><option value="password" ${configuredLoginMethod === "password" ? "selected" : ""}>账号密码登录</option><option value="wechat" ${configuredLoginMethod === "wechat" ? "selected" : ""}>微信扫码登录</option></select><small>应用不会保存账号、密码或验证码。</small></label>`;
  const cacheStatus = personalCacheStatusText() || "尚未缓存个人教务数据";
  const cacheSettings = IS_ANDROID_APP
    ? `<div class="settings-divider"></div><div class="settings-intro settings-login-intro"><span class="eyebrow">OFFLINE CACHE</span><h3>个人教务数据缓存</h3><p>${escapeHtml(cacheStatus)}。成绩、考试、个人课表和总览会在成功读取后自动更新；教务系统暂时不可用时，应用仍会展示上次缓存。</p></div><div class="settings-actions"><button class="button button-ghost" type="button" data-action="clear-personal-cache">清除本机缓存</button></div><div class="settings-callout"><strong>隐私说明</strong><span>查询缓存按学号隔离，不包含密码、验证码、Cookie 或令牌；Android 内置登录凭据另行由 Keystore 加密保存。</span></div>`
    : "";
  return `<div>${sectionHeading("设置", "为手机端课表设置学周起点。东北大学每周从周日开始，请选择第一周的周日。", `<button class="button button-ghost" type="button" data-action="view-personal">返回课表</button>`)}<div class="panel settings-panel"><div class="settings-intro"><span class="eyebrow">CALENDAR</span><h3>第一周的第一天</h3><p>这个日期用于把课程列表中的“第几周、星期几、节次”换算成日历日期。保存后，个人课表日视图仍显示今天和明天；切换到周表时会默认定位当前周，也可以切回整个学期或其他周。</p></div><label class="settings-field"><span>第一周周日</span><input id="firstWeekStartInput" type="date" value="${escapeHtml(state.calendar.firstWeekStart)}" /><small>当前：${escapeHtml(currentText)}。必须选择周日。</small></label>${invalidWeekday ? `<div class="schedule-note">当前保存的日期不是周日，请重新选择后保存，否则可能造成整周错位。</div>` : ""}<div class="settings-actions"><button class="button button-primary" type="button" data-action="save-calendar-settings">保存设置</button><button class="button button-ghost" type="button" data-action="clear-calendar-settings">清除日期</button></div><div class="settings-callout"><strong>显示规则</strong><span>日视图显示今天和明天；个人周表按开学日期默认定位当前周，并可切换全部周次或指定周；全校课表详情保持原先的全部周次显示逻辑。</span></div>${loginSettings}${cacheSettings}</div></div>`;
}

function renderSettings() {
  const firstWeekDate = normalizeCalendarDate(state.calendar.firstWeekStart);
  const invalidWeekday = firstWeekDate && firstWeekDate.getDay() !== 0;
  const currentText = firstWeekDate ? `${calendarDateText(firstWeekDate)} · ${SUNDAY_FIRST_DAY_NAMES[firstWeekDate.getDay()]}` : "尚未设置";
  const configuredLoginMethod = IS_ANDROID_APP
    ? androidLoginMethod()
    : (readStoredSetting("zhizhang.loginMethod") === "wechat" ? "wechat" : "password");
  const cacheStatus = personalCacheStatusText() || "尚未缓存个人教务数据";
  const curriculumMore = IS_ANDROID_APP ? "" : `<div class="settings-row settings-link-row"><div><strong>培养计划</strong><small>查看培养方案、课组和课程完成情况</small></div><button class="button button-ghost" type="button" data-action="view-curriculum">打开</button></div>`;
  const cacheBlock = IS_ANDROID_APP ? `<section class="settings-section"><div class="settings-intro"><h3>数据缓存</h3><p>${escapeHtml(cacheStatus)}。成功读取后自动更新，离线时仍可查看上次结果。</p></div><div class="settings-actions"><button class="button button-ghost" type="button" data-action="clear-personal-cache">清除本机缓存</button></div><div class="settings-callout"><strong>隐私</strong><span>查询缓存不包含密码、验证码、Cookie 或令牌；内置登录凭据另行由 Android Keystore 加密保存。</span></div></section>` : "";
  return `<div>${sectionHeading("设置", "")}<div class="panel settings-panel"><section class="settings-section"><div class="settings-intro"><h3>课表</h3><p>设置第一周的周日，日视图和周表会据此定位当前学周。</p></div><label class="settings-field"><span>第一周周日</span><input id="firstWeekStartInput" type="date" value="${escapeHtml(state.calendar.firstWeekStart)}" /><small>当前：${escapeHtml(currentText)}。必须选择周日。</small></label>${invalidWeekday ? `<div class="schedule-note">保存的日期不是周日，请重新选择。</div>` : ""}<div class="settings-actions"><button class="button button-primary" type="button" data-action="save-calendar-settings">保存</button><button class="button button-ghost" type="button" data-action="clear-calendar-settings">清除日期</button></div></section><section class="settings-section"><div class="settings-intro"><h3>账户</h3><p>内置登录默认开启可信设备与后台自动重登；原网页账密和二维码入口始终保留。</p></div><label class="settings-field"><span>默认登录方式</span><select id="loginMethodSelect"><option value="builtin" ${configuredLoginMethod === "builtin" ? "selected" : ""}>内置登录（默认）</option><option value="password" ${configuredLoginMethod === "password" ? "selected" : ""}>原网页账密登录</option><option value="wechat" ${configuredLoginMethod === "wechat" ? "selected" : ""}>微信二维码登录</option></select><small>学号和密码只使用 Android Keystore 加密保存在本机；验证码不保存。</small></label></section><section class="settings-section"><div class="settings-intro"><h3>更多工具</h3><p>低频功能集中在这里。</p></div><div class="settings-row settings-link-row"><div><strong>全校课表</strong><small>查询班级、教师和教室</small></div><button class="button button-ghost" type="button" data-action="view-all">打开</button></div>${curriculumMore}<div class="settings-row settings-link-row"><div><strong>原教务系统</strong><small>登录、查看原页面或处理未发布数据</small></div><button class="button button-ghost" type="button" data-action="open-portal">打开</button></div></section>${cacheBlock}</div></div>`;
}

function renderPersonal() {
  const filterKeys = ["name", "code", "teacher", "location", "time", "weeks", "weekday", "category", "nature", "requirement", "assessment", "examType"];
  const rows = filterRows(state.data.courses, filterKeys, state.filters.personal);
  const scheduleRows = filterRows(personalScheduleRows(rows), filterKeys, state.filters.personal);
  if (state.scheduleDisplay.personal !== "week") {
    const records = rows.length
      ? `<details class="course-records-details"><summary>查看本学期全部课程记录（${rows.length} 条）</summary>${renderCourseRowsTable(rows, false, "personal")}</details>`
      : renderCourseCards(rows, "personal");
    return `<div>${sectionHeading("课表", "手机端默认显示今天和明天；点击任意课程可查看教师、周次、节次、时间和地点。需要查看整周时切换到周表。", scheduleExportActions("personal"))}<div class="panel"><div class="toolbar"><input data-filter="personal" value="${escapeHtml(state.filters.personal)}" placeholder="搜索课程、教师、时间、地点或周次" /><span class="tag ${state.data.scheduleSource === "网格" ? "pass" : ""}">${escapeHtml(state.data.scheduleSource === "网格" ? "数据来源：课表网格" : state.data.scheduleSource === "列表" ? "数据来源：课程列表已整理" : "数据来源：未读取到课表")}</span><span class="muted">显示 ${rows.length} / ${state.data.courses.length} 门课${scheduleRows.length !== rows.length ? ` · ${scheduleRows.length} 条排课` : ""}</span></div>${renderScheduleDisplayControls()}${renderDailySchedule(scheduleRows, "personal")}${records}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">打开原查询</button>`)}${renderCourseDetailModal()}${renderScheduleExportModal()}</div>`;
  }
  const weekRows = filterScheduleWeekRows(scheduleRows, "personal");
  const grid = renderScheduleGrid(weekRows, "personal");
  const selectedWeek = scheduleWeekValue("personal");
  const gridNotice = rows.length && !grid
    ? selectedWeek === "all"
      ? `<div class="schedule-note">该学期的课程列表已经返回，但没有识别出可铺入网格的星期；下面仍会展示完整的课程列表和原始时间地点。</div>`
      : `<div class="schedule-note">第${escapeHtml(selectedWeek)}周没有可显示的课程，下面仍保留本学期完整课程列表。</div>`
    : "";
  const sourceText = state.data.scheduleSource === "网格"
    ? "数据来源：课表网格（优先）"
    : state.data.scheduleSource === "列表"
      ? "数据来源：课程列表（已整理为周课表网格）"
      : "数据来源：未读取到课表数据";
  const sourceClass = state.data.scheduleSource === "网格" ? "pass" : "";
  return `<div>${sectionHeading("课表", "周表按周日、周一……周六排列；优先读取原系统网格，网格为空时按课程列表中的周次、星期和节次重新铺成周课表。可切换全部周次或指定单周，点击任意课程可查看详情。", scheduleExportActions("personal"))}<div class="panel"><div class="toolbar"><input data-filter="personal" value="${escapeHtml(state.filters.personal)}" placeholder="搜索课程、教师、时间、地点或周次" /><span class="tag ${sourceClass}">${escapeHtml(sourceText)}</span><span class="muted">显示 ${rows.length} / ${state.data.courses.length} 门课${scheduleRows.length !== rows.length ? ` · 网格 ${scheduleRows.length} 条排课` : ""}</span></div>${renderScheduleDisplayControls()}${renderScheduleWeekControls(scheduleRows, "personal")}${grid}${gridNotice}${rows.length ? `<details class="course-records-details" open><summary>本学期全部课程记录（${rows.length} 门课 · ${scheduleRows.length} 条排课）</summary>${renderCourseRowsTable(rows, false, "personal")}</details>` : renderCourseCards(rows, "personal")}</div>${renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">打开原查询</button>`)}${renderCourseDetailModal()}${renderScheduleExportModal()}</div>`;
}

function renderAll() {
  // declaration placeholder; the final implementation below is used after
  // the legacy renderers have been parsed.
  return "";
}

function renderAllRows() {
  if (state.allRetrying) return loadingCard(`正在查询全校课表接口…${state.allAttempt ? `（第 ${state.allAttempt}/${ALL_SCHEDULE_RETRY_LIMIT} 次）` : ""}`);
  if (state.allPendingMessage && !state.allRows.length && state.allError) return `<div class="empty-card"><h3>该学期课表可能尚未发布</h3><p>${escapeHtml(state.allPendingMessage)}。稍后可以再次查询。</p><button class="button button-primary" type="button" data-action="search-all">再次查询</button></div>`;
  if (state.allError) return `<div class="error-card"><h3>全校课表没有返回结果</h3><p>${escapeHtml(state.allError)}</p><button class="button button-ghost" type="button" data-action="open-portal">原系统</button></div>`;
  if (!state.allRows.length) return emptyCard("还没有查询全校课表", "选择查询类型并输入关键词。", "");
  const courseRows = state.allRows.filter(isCourseDetailRow);
  if (courseRows.length) return renderSelectableCourseRowsTable(courseRows, true, "all");
  const fields = state.allRows.flatMap(allRowFields).map((item) => item.label);
  const headers = [...new Set(fields)].slice(0, 8);
  const pageSize = Math.max(1, Number(state.allPageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(state.allRows.length / pageSize));
  const page = Math.min(Math.max(1, Number(state.allPage) || 1), totalPages);
  const start = (page - 1) * pageSize;
  const visibleRows = state.allRows.slice(start, start + pageSize);
  const actionMarkup = (row, index) => {
    const identity = allScheduleDetailIdentity(row);
    const scheduleFlag = valueOf(row, ["SFPK_DISPLAY", "SFPK"], "");
    if (scheduleFlag !== "" && !isTruthyFlag(scheduleFlag)) return `<span class="muted">未排课</span>`;
    return identity.code ? `<button class="button button-soft button-small" type="button" data-action="show-all-detail" data-row-index="${index}">查看课表</button>` : `<span class="muted">—</span>`;
  };
  const body = visibleRows.map((row, visibleIndex) => {
    const index = start + visibleIndex;
    const items = allRowFields(row);
    return `<tr>${headers.map((header) => `<td>${escapeHtml(items.find((item) => item.label === header)?.value || "—")}</td>`).join("")}<td>${actionMarkup(row, index)}</td></tr>`;
  }).join("");
  const mobile = visibleRows.map((row, visibleIndex) => {
    const index = start + visibleIndex;
    const items = allRowFields(row);
    const identity = allScheduleDetailIdentity(row);
    const title = identity.name || items[0]?.value || "查询结果";
    const summary = items.filter((item) => item.value && item.value !== title).slice(0, 3).map((item) => `${item.label}：${item.value}`).join(" · ");
    return `<article class="all-mobile-row"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(summary || "")}</span></div>${actionMarkup(row, index)}</article>`;
  }).join("");
  return `<div class="course-transfer-toolbar course-transfer-toolbar-hint"><div class="course-transfer-copy"><strong>全校课表结果</strong><span>打开一条记录查看完整课表。</span></div><button class="button button-ghost" type="button" data-action="open-course-import">导入文本</button></div><div class="table-wrap all-desktop-table"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}<th>课表</th></tr></thead><tbody>${body}</tbody></table></div><div class="all-mobile-list">${mobile}</div>${renderAllPagination(state.allRows.length, page, totalPages)}<p class="muted table-footnote">${start + 1}-${Math.min(start + pageSize, state.allRows.length)} / ${state.allRows.length} 条</p>`;
}

function renderAll() {
  const orderedTypes = [...state.scheduleTypes].sort((a, b) => Number(scheduleTypeKind(b) === "class") - Number(scheduleTypeKind(a) === "class"));
  const options = orderedTypes.map((type) => `<option value="${escapeHtml(type.code)}">${escapeHtml(type.name)}</option>`).join("");
  const classMode = isClassScheduleType();
  const filterFields = classMode
    ? `<label>班级代码<input id="allCode" value="${escapeHtml(state.filters.allCode)}" placeholder="如 13022601" /></label><label>班级名称<input id="allName" value="${escapeHtml(state.filters.allName)}" placeholder="如 自动化" /></label>`
    : `<label>关键词<input id="allKeyword" value="${escapeHtml(state.filters.allKeyword)}" placeholder="代码、名称、教师或教室" /></label>`;
  const allTermOptions = state.allTerms.length
    ? state.allTerms.map((term) => `<option value="${escapeHtml(term.code)}">${escapeHtml(term.name)}</option>`).join("")
    : `<option value="">正在读取学期…</option>`;
  const permissionHint = state.allScheduleHiddenTypes.length
    ? `<p class="muted all-schedule-permission-hint">原系统当前开放：${escapeHtml(state.scheduleTypes.map((type) => type.name).join("、"))}。其他类型没有查询权限，已按原系统规则隐藏。</p>`
    : "";
  return `<div>${sectionHeading("全校课表", "")}<div class="all-query-toolbar"><div class="all-query-context"><label>学期<select id="allTermSelect" ${state.allTerms.length ? "" : "disabled"}>${allTermOptions}</select></label><label>查询类型<select id="allMode">${options}</select></label></div><div class="inline-form">${filterFields}<button class="button button-primary" type="button" data-action="search-all">查询</button></div></div>${state.allTermError ? `<p class="muted">${escapeHtml(state.allTermError)}</p>` : ""}${state.scheduleTypeError ? `<p class="muted">${escapeHtml(state.scheduleTypeError)}</p>` : ""}${permissionHint}<div class="panel all-results-panel">${renderAllRows()}</div>${renderAllDetail()}${renderAllUtilities()}${renderCourseTransferModal()}</div>`;
}

function renderAllUtilities() {
  return renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">原系统</button>`);
}

function allRowFields(row) {
  const scheduleFlagKey = valueOf(row, ["SFPK_DISPLAY"], "") !== "" ? "SFPK_DISPLAY" : "SFPK";
  const scheduleFlag = valueOf(row, [scheduleFlagKey], "");
  const preferred = [
    ["CODE", "代码"], ["BJDM", "班级代码"], ["BJMC", "班级名称"], ["JSXM", "教师姓名"], ["JSMC", "教师/教室"], ["JASMC", "教室"],
    ["KCM", "课程"], ["KCH", "课程号"], ["KCLB", "课程类别"], ["SKJS", "授课教师"], ["XZNJ", "年级"], ["YXMC", "学院"], ["YXDM", "学院代码"], ["ZYMC", "专业"], ["ZYDM", "专业代码"],
    ["ZYFXMC", "专业方向"], ["XQMC", "校区"], ["SKZC", "上课周次"], ["SKXQ", "上课星期"], ["JC", "节次"], ["YPSJDD", "已排时间地点"], [scheduleFlagKey, "是否排课"]
  ];
  const used = new Set();
  const result = [];
  preferred.forEach(([key, label]) => {
    const value = valueOf(row, [key]);
    if (value !== "" && value !== undefined && value !== null) {
      used.add(key);
      const shownValue = key === scheduleFlagKey && scheduleFlagKey === "SFPK"
        ? (isTruthyFlag(value) ? "是" : ["0", "false", "no", "n", "否"].includes(String(value).trim().toLowerCase()) ? "否" : displayValue(value))
        : displayValue(value);
      result.push({ label, value: shownValue });
    }
  });
  if (result.length < 3) {
    Object.entries(row).forEach(([key, value]) => {
      if (used.has(key) || value === null || value === undefined || typeof value === "object") return;
      result.push({ label: key, value: displayValue(value) });
    });
  }
  return result.slice(0, 10);
}

function isCourseDetailRow(row) {
  return Boolean(valueOf(row, ["KCM", "courseName", "KCH", "courseNo", "YPSJDD", "SKZC", "SKJS"], ""));
}

function allScheduleDetailIdentity(row, type = selectedScheduleType()) {
  const kind = scheduleTypeKind(type);
  const codeKeysByKind = {
    class: ["CODE", "code", "BJDM", "classCode"],
    teacher: ["CODE", "code", "WID", "JSDM", "teacherCode", "teacherId"],
    room: ["CODE", "code", "WID", "JASDM", "JASCODE", "roomCode", "roomId"],
    student: ["XSBH", "XH", "XSID", "STUDENTID", "CODE", "code", "WID", "studentCode", "studentId"],
    major: ["ZYDM", "ZYCODE", "CODE", "code", "WID", "majorCode", "majorId"],
    course: ["KCH", "KCDM", "CODE", "code", "WID", "courseCode", "courseId"],
    teachingTask: ["JXBID", "JXBH", "JXBDM", "JXRWDM", "CODE", "code", "WID", "teachingTaskCode", "teachingTaskId"],
    direction: ["ZYFXDM", "ZYFXCODE", "CODE", "code", "WID", "directionCode", "directionId"],
    nonMajor: ["FADM", "FACODE", "CODE", "code", "WID", "planCode", "planId"],
    generic: ["CODE", "code", "DM", "ID", "WID", "BJDM", "JSDM", "JASDM", "JASCODE"]
  };
  const codeKeys = codeKeysByKind[kind] || codeKeysByKind.generic;
  const codeCandidates = [...new Set(codeKeys.map((key) => displayValue(valueOf(row, [key]), "")).filter(Boolean))];
  const code = codeCandidates[0] || "";
  const nameKeysByKind = {
    class: ["BJMC", "className", "name"],
    teacher: ["XM", "JSXM", "teacherName", "name"],
    room: ["JASMC", "roomName", "name"],
    student: ["XSXM", "XSMC", "XM", "studentName", "name"],
    major: ["ZYMC", "majorName", "name"],
    course: ["KCM", "KCMC", "courseName", "name"],
    teachingTask: ["JXBMC", "JXRWMC", "taskName", "name"],
    direction: ["ZYFXMC", "directionName", "name"],
    nonMajor: ["FAMC", "planName", "name"],
    generic: ["BJMC", "XM", "JASMC", "ZYMC", "KCM", "name"]
  };
  const name = displayValue(valueOf(row, nameKeysByKind[kind] || nameKeysByKind.generic), "未命名对象");
  // 全校类型接口返回的 code（教室=01、教师=02、班级=05）才是当前部署
  // getScheduleDetail.do 所需的 KBLX；列表行通常没有单独的 KBLX 字段。
  const typeCode = displayValue(valueOf(row, ["KBLX", "kblx", "scheduleTypeCode"]), "") || displayValue(type?.code, "");
  return { code, codeCandidates, name, kind, typeCode, typeName: type?.name || "全校课表" };
}

function scheduleDetailTypeCodes(detail) {
  // 当前部署使用全校类型列表的 code：教室 01、教师 02、班级 05。
  // 旧版本曾把教师/教室写成 06/07，保留旧值作为兼容兜底，但必须先试当前码。
  const fallback = {
    class: ["05"],
    teacher: ["02", "06", "05", "07"],
    room: ["01", "07", "05", "06"],
    student: ["03", "06", "05", "07"],
    major: ["04", "06", "05", "07"],
    course: ["06", "05", "07"],
    teachingTask: ["07", "06", "05"],
    direction: ["08", "06", "05", "07"],
    nonMajor: ["09", "06", "05", "07"]
  }[detail.kind] || ["05", "06", "07"];
  return [...new Set([detail.typeCode, ...fallback].filter(Boolean))];
}

async function queryAllScheduleDetail(rowIndex) {
  const requestId = ++allScheduleDetailRequestSequence;
  const type = selectedScheduleType();
  const row = state.allRows[rowIndex];
  if (!row) return;
  const identity = allScheduleDetailIdentity(row, type);
  if (!identity.code) {
    state.allError = "该条记录没有可用于详情查询的代码";
    render();
    return;
  }
  const termCode = allQueryTermCode();
  state.selectedCourse = null;
  state.scheduleWeek["all-detail"] = "all";
  state.allDetail = {
    ...identity,
    termCode,
    loading: true,
    error: "",
    rawRows: [],
    courses: [],
    source: ""
  };
  render();
  let lastPayload = null;
  let lastListPayload = null;
  let lastError = null;
  try {
    for (const code of identity.codeCandidates) {
      for (const kblx of scheduleDetailTypeCodes(identity)) {
        let gridRawRows = [];
        let gridCourses = [];
        try {
          const payload = await postAllScheduleDetail({ CODE: code, KBLX: kblx, XNXQDM: termCode, XQDM: "00" });
          if (requestId !== allScheduleDetailRequestSequence) return;
          lastPayload = payload;
          gridRawRows = extractCourseRows(payload).filter(isCourseDetailRow);
          gridCourses = gridRawRows.map(mapCourse);
        } catch (error) {
          lastError = error;
        }

        // 当前 WebVPN 会拒绝 cxkblbms.do（403），而 getScheduleDetail.do
        // 已经包含课程名、星期、节次、教师和地点。网格有数据时立即展示，
        // 不再为补充字段重复请求必然失败的列表接口。
        if (gridCourses.length) {
          state.allDetail = {
            ...identity,
            code,
            termCode,
            loading: false,
            error: "",
            rawRows: gridRawRows,
            courses: gridCourses,
            source: "网格接口"
          };
          render();
          return;
        }

        // 如果网格为空，再兼容旧系统只提供课程列表的版本；列表接口的
        // 403/超时只影响当前代码与类型，不会阻塞后续候选类型。
        let listRawRows = [];
        let listCourses = [];
        try {
          const listResult = await loadAllScheduleList(code, kblx, termCode);
          if (requestId !== allScheduleDetailRequestSequence) return;
          lastListPayload = listResult.payload;
          listRawRows = listResult.rawRows.filter(isCourseDetailRow);
          listCourses = listRawRows.map(mapCourse);
        } catch (error) {
          lastError = error;
        }

        if (gridCourses.length || listCourses.length) {
          const courses = gridCourses.length && listCourses.length
            ? mergeCourseSources(listRawRows, gridRawRows)
            : gridCourses.length ? gridCourses : listCourses;
          if (courses.length) {
            state.allDetail = {
              ...identity,
              code,
              termCode,
              loading: false,
              error: "",
              rawRows: [...gridRawRows, ...listRawRows],
              courses,
              source: gridCourses.length && listCourses.length ? "网格 + 课程列表" : gridCourses.length ? "网格接口" : "课程列表"
            };
            render();
            return;
          }
        }
      }
    }
    if (requestId !== allScheduleDetailRequestSequence) return;
    state.allDetail = {
      ...identity,
      termCode,
      loading: false,
      error: findPayloadMessage(lastListPayload) || findPayloadMessage(lastPayload) || lastError?.message || "该对象在所选学期没有课程明细",
      rawRows: [],
      courses: [],
      source: ""
    };
  } catch (error) {
    if (requestId !== allScheduleDetailRequestSequence) return;
    state.allDetail = { ...identity, termCode, loading: false, error: error.message || "课表详情读取失败", rawRows: [], courses: [], source: "" };
  }
  if (requestId !== allScheduleDetailRequestSequence) return;
  render();
}

function renderAllDetail() {
  const detail = state.allDetail;
  if (!detail) return "";
  const title = `${detail.typeName} · ${detail.name}`;
  if (detail.loading) {
    return `<div class="detail-panel">${sectionHeading(title, `正在读取 ${detail.termCode} 的课程明细…`, `<button class="button button-ghost button-small schedule-export-back" type="button" data-action="close-all-detail">返回查询结果</button>`)}${loadingCard("正在读取课表详情…")}</div>`;
  }
  if (detail.error && !detail.courses.length) {
    return `<div class="detail-panel">${sectionHeading(title, `代码 ${detail.code} · ${detail.termCode}`, `<button class="button button-ghost button-small schedule-export-back" type="button" data-action="close-all-detail">返回查询结果</button>`)}<div class="error-card"><h3>没有课程明细</h3><p>${escapeHtml(detail.error)}</p><button class="button button-ghost" type="button" data-action="open-portal">打开原系统详情</button></div></div>`;
  }
  const weekRows = filterScheduleWeekRows(detail.courses, "all-detail");
  const grid = renderScheduleGrid(weekRows, "all-detail");
  const selectedWeek = scheduleWeekValue("all-detail");
  const gridNotice = grid ? "" : selectedWeek === "all"
    ? `<div class="schedule-note">详情接口返回了课程列表，但没有识别出可铺入网格的星期和节次；下方仍保留完整字段。</div>`
    : `<div class="schedule-note">第${escapeHtml(selectedWeek)}周没有可显示的课程，下方仍保留该对象的完整课程列表。</div>`;
  const sourceLabel = detail.source === "课程列表"
    ? "课程列表已整理为网格"
    : detail.source === "网格 + 课程列表"
      ? "网格与课程列表已合并"
      : "已读取课表详情";
  return `<div class="detail-panel">${sectionHeading(title, `代码 ${detail.code} · ${detail.termCode} · 点击课程卡片可查看完整字段`, scheduleExportActions("all-detail", `<button class="button button-ghost button-small schedule-export-back" type="button" data-action="close-all-detail">返回查询结果</button>`))}<div class="panel"><div class="toolbar"><span class="tag pass">${sourceLabel}</span><span class="muted">${detail.courses.length} 条课表记录</span></div>${renderScheduleWeekControls(detail.courses, "all-detail")}${grid}${gridNotice}${renderSelectableCourseRowsTable(detail.courses, true, "all-detail")}</div>${renderCourseDetailModal()}${renderScheduleExportModal()}</div>`;
}

function renderAllPagination(total, page, totalPages) {
  if (totalPages <= 1) return "";
  const pageButton = (label, target, disabled = false) => `<button class="button button-ghost button-small" type="button" data-action="all-page" data-page="${target}" ${disabled ? "disabled" : ""}>${label}</button>`;
  return `<div class="all-pagination"><div class="all-pagination-actions">${pageButton("首页", 1, page <= 1)}${pageButton("上一页", page - 1, page <= 1)}<span>第 ${page} / ${totalPages} 页</span>${pageButton("下一页", page + 1, page >= totalPages)}${pageButton("末页", totalPages, page >= totalPages)}</div><span class="muted">共 ${total} 条，已读取原系统全部分页</span></div>`;
}

function renderAllRows() {
  if (state.allRetrying) return loadingCard(`正在查询全校课表接口…${state.allAttempt ? `（第 ${state.allAttempt}/${ALL_SCHEDULE_RETRY_LIMIT} 次）` : ""}；若该学期尚未发布，插件会继续等待并重试`);
  if (state.allPendingMessage && !state.allRows.length && state.allError) return `<div class="empty-card"><h3>该学期课表可能尚未发布</h3><p>${escapeHtml(state.allPendingMessage)}。插件已完成延迟重试；如果原系统稍后出现课程列表，可以再次点击查询。</p><button class="button button-primary" type="button" data-action="search-all">再次查询</button></div>`;
  if (state.allError) return `<div class="error-card"><h3>全校课表没有返回结果</h3><p>${escapeHtml(state.allError)}</p><button class="button button-ghost" type="button" data-action="open-portal">原系统</button></div>`;
  if (!state.allRows.length) return emptyCard("还没有查询全校课表", "选择查询类型并输入关键词。", "");
  const courseRows = state.allRows.filter(isCourseDetailRow);
  if (courseRows.length) return renderSelectableCourseRowsTable(courseRows, true, "all");
  const fields = state.allRows.flatMap(allRowFields).map((item) => item.label);
  const headers = [...new Set(fields)].slice(0, 8);
  const actionHeader = "<th>课表</th>";
  const pageSize = Math.max(1, Number(state.allPageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(state.allRows.length / pageSize));
  const page = Math.min(Math.max(1, Number(state.allPage) || 1), totalPages);
  if (page !== state.allPage) state.allPage = page;
  const start = (page - 1) * pageSize;
  const visibleRows = state.allRows.slice(start, start + pageSize);
  const body = visibleRows.map((row, visibleIndex) => {
    const index = start + visibleIndex;
    const items = allRowFields(row);
    const identity = allScheduleDetailIdentity(row);
    const scheduleFlag = valueOf(row, ["SFPK_DISPLAY", "SFPK"], "");
    const isUnscheduled = scheduleFlag !== "" && !isTruthyFlag(scheduleFlag);
    const action = isUnscheduled
      ? `<span class="muted">未排课</span>`
      : identity.code
      ? `<button class="button button-soft button-small" type="button" data-action="show-all-detail" data-row-index="${index}">查看课表</button>`
      : `<span class="muted">—</span>`;
    return `<tr>${headers.map((header) => `<td>${escapeHtml(items.find((item) => item.label === header)?.value || "—")}</td>`).join("")}<td>${action}</td></tr>`;
  }).join("");
  const mobile = visibleRows.map((row, visibleIndex) => {
    const index = start + visibleIndex;
    const items = allRowFields(row);
    const identity = allScheduleDetailIdentity(row);
    const title = identity.name || items[0]?.value || "查询结果";
    const summary = items.filter((item) => item.value && item.value !== title).slice(0, 3).map((item) => `${item.label}：${item.value}`).join(" · ");
    const scheduleFlag = valueOf(row, ["SFPK_DISPLAY", "SFPK"], "");
    const action = scheduleFlag !== "" && !isTruthyFlag(scheduleFlag)
      ? `<span class="muted">未排课</span>`
      : identity.code
        ? `<button class="button button-soft button-small" type="button" data-action="show-all-detail" data-row-index="${index}">查看课表</button>`
        : `<span class="muted">—</span>`;
    return `<article class="all-mobile-row"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(summary || "")}</span></div>${action}</article>`;
  }).join("");
  return `<div class="course-transfer-toolbar course-transfer-toolbar-hint"><div class="course-transfer-copy"><strong>全校课表结果</strong><span>打开一条记录查看完整课表。</span></div><button class="button button-ghost" type="button" data-action="open-course-import">导入文本</button></div><div class="table-wrap all-desktop-table"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}${actionHeader}</tr></thead><tbody>${body}</tbody></table></div><div class="all-mobile-list">${mobile}</div>${renderAllPagination(state.allRows.length, page, totalPages)}<p class="muted table-footnote">当前显示第 ${page} 页 ${start + 1}-${Math.min(start + pageSize, state.allRows.length)} 条${state.allTotal ? `，接口总记录数 ${escapeHtml(state.allTotal)}` : ""}。</p>`;
}

function renderAll() {
  const orderedTypes = [...state.scheduleTypes].sort((a, b) => Number(scheduleTypeKind(b) === "class") - Number(scheduleTypeKind(a) === "class"));
  const options = orderedTypes.map((type) => `<option value="${escapeHtml(type.code)}">${escapeHtml(type.name)}</option>`).join("");
  const typeError = state.scheduleTypeError ? `<p class="muted">动态类型接口读取失败，已保留全校大课表入口：${escapeHtml(state.scheduleTypeError)}</p>` : "";
  const allTermOptions = state.allTerms.length
    ? state.allTerms.map((term) => `<option value="${escapeHtml(term.code)}">${escapeHtml(term.name)}</option>`).join("")
    : `<option value="">正在读取课表学期…</option>`;
  const allTermError = state.allTermError ? `<p class="muted">课表模块学期列表读取失败，已使用通用学期列表：${escapeHtml(state.allTermError)}</p>` : "";
  const classMode = isClassScheduleType();
  const filterFields = classMode
    ? `<label>班级代码<input id="allCode" value="${escapeHtml(state.filters.allCode)}" placeholder="如：13022601" /></label><label>班级名称<input id="allName" value="${escapeHtml(state.filters.allName)}" placeholder="如：自动化" /></label>`
    : `<label>关键词<input id="allKeyword" value="${escapeHtml(state.filters.allKeyword)}" placeholder="代码 / 名称 / 教师 / 教室" /></label>`;
  const classHint = classMode ? "当前为班级课表，筛选字段与原系统一致：班级代码、班级名称；查询会自动读取原系统全部分页。" : "当前模式使用关键词匹配名称、代码、教师或教室，查询会自动读取原系统全部分页。";
  return `<div>${sectionHeading("全校课表", "课表模块单独维护学期；这里的学期会直接传给全校课表接口，不跟随顶部总览学期。查询结果可直接点“查看课表”进入美化后的课程网格。")}<div class="panel"><div class="inline-form"><label>查询类型<select id="allMode">${options}</select></label>${filterFields}<button class="button button-primary" type="button" data-action="search-all">查询</button></div><p class="muted">${classHint}</p>${typeError}</div><div class="panel">${renderAllRows()}</div>${renderAllDetail()}${renderAllUtilities(allTermOptions, allTermError)}${renderCourseTransferModal()}</div>`;
}

function renderAllUtilities(allTermOptions, allTermError = "") {
  return `<div class="section-utilities"><div class="section-utility-actions"><button class="button button-ghost" type="button" data-action="open-portal">打开原查询</button></div><div class="academic-term-picker"><label><span>课表查询学期</span><select id="allTermSelect" ${state.allTerms.length ? "" : "disabled"}>${allTermOptions}</select></label></div>${allTermError}</div>`;
}

function curriculumProgressOverviewMarkup(plan, progressMap = curriculumProgressMap()) {
  const records = (state.curriculum.courses || []).map((course) => ({ course, completion: curriculumCourseCompletion(course) }));
  const claimedScoreKeys = new Set(records.map((record, index) => record.completion.score
    ? curriculumScoreLogicalKey(record.completion.score) || curriculumScoreKey(record.completion.score, index)
    : "").filter(Boolean));
  const categoryRecords = [...progressMap.values()]
    .flatMap((progress) => progress.records || [])
    .filter((record) => record.categoryFallback && record.completion?.earned)
    .filter((record, index) => {
      const key = curriculumScoreLogicalKey(record.completion.score) || curriculumScoreKey(record.completion.score, index);
      if (!key || claimedScoreKeys.has(key)) return false;
      claimedScoreKeys.add(key);
      return true;
    });
  records.push(...categoryRecords);
  const earnedRecords = records.filter((record) => record.completion.earned);
  const rawEarnedCredits = earnedRecords.reduce((total, record) => total + curriculumCreditNumber(record.course.credit), 0);
  const rawRequiredCredits = earnedRecords.reduce((total, record) => total + (curriculumCourseType(record.course) === "required" ? curriculumCreditNumber(record.course.credit) : 0), 0);
  const rawElectiveCredits = earnedRecords.reduce((total, record) => total + (curriculumCourseType(record.course) === "elective" ? curriculumCreditNumber(record.course.credit) : 0), 0);
  const targetCredits = curriculumRequirementCredit(plan.credit);
  const meta = state.data.gpaMeta || {};
  const coverageText = meta.termCount ? `成绩覆盖 ${meta.successfulTermCount || 0} / ${meta.termCount} 个学期` : "成绩覆盖待读取";
  const rootGroups = state.curriculum.groups.filter((group) => {
    if (!group.parentId) return true;
    return !state.curriculum.groups.some((candidate) => String(candidate.id || "") === String(group.parentId));
  });
  const rootProgresses = rootGroups.map((group) => progressMap.get(curriculumGroupIdentity(group))).filter(Boolean);
  const knownTarget = (key) => {
    let found = false;
    const total = rootProgresses.reduce((sum, progress) => {
      const value = curriculumRequirementCredit(progress[key]);
      if (value === null) return sum;
      found = true;
      return sum + value;
    }, 0);
    return found ? total : null;
  };
  const requiredTarget = knownTarget("targetRequiredCredits");
  const electiveTarget = knownTarget("targetElectiveCredits");
  // 总学分、必修和选修分别按方案要求封顶；课程明细仍保留真实学分，
  // 这里只限制进度统计，避免超修课程把总进度“冲过头”。
  const earnedCredits = curriculumCappedCredit(rawEarnedCredits, targetCredits);
  const requiredCredits = curriculumCappedCredit(rawRequiredCredits, requiredTarget);
  const electiveCredits = curriculumCappedCredit(rawElectiveCredits, electiveTarget);
  const remainingCredits = targetCredits === null ? null : curriculumRemainingCredit(targetCredits, earnedCredits);
  const percent = targetCredits && targetCredits > 0 ? Math.min(100, Math.max(0, earnedCredits / targetCredits * 100)) : 0;
  const categoryNote = categoryRecords.length ? `其中 ${categoryRecords.length} 门通识选修按成绩类别计入` : "按已读取成绩匹配";
  const remainingMarkup = remainingCredits !== null && remainingCredits > 0
    ? `<p class="curriculum-progress-warning"><strong>还差 ${escapeHtml(formatCurriculumCredit(remainingCredits))} 学分</strong><span>完成剩余课程后即可达到方案最低要求。</span></p>`
    : remainingCredits === 0
      ? `<p class="curriculum-progress-success"><strong>✓ 已达到方案最低学分</strong><span>仍可继续查看各课组与课程完成状态。</span></p>`
      : "";
  const failedMarkup = meta.failedTermCount ? `<p class="curriculum-progress-warning"><strong>成绩读取不完整</strong><span>有 ${meta.failedTermCount} 个学期成绩读取失败，请先刷新成绩页，避免把未读取课程误判为未完成。</span></p>` : "";
  const compositionItem = (label, earned, target) => `<div class="curriculum-composition-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatCurriculumCredit(earned))}${target > 0 ? ` / ${escapeHtml(formatCurriculumCredit(target))}` : ""} 学分</strong><small>${target > 0 ? "已获 / 要求" : "已获得"}</small></div>`;
  return `<section class="panel curriculum-progress-panel"><div class="curriculum-progress-head"><div><h3>毕业进度</h3><p class="muted">${escapeHtml(categoryNote)}；${escapeHtml(coverageText)}。</p></div><span class="curriculum-progress-coverage">${escapeHtml(coverageText)}</span></div><div class="curriculum-progress-total"><strong>${escapeHtml(formatCurriculumCredit(earnedCredits))}</strong><span> / ${escapeHtml(formatCurriculumCredit(targetCredits))} 学分</span><em>${Math.round(percent)}%</em></div><div class="curriculum-progress-bar" role="progressbar" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="毕业学分进度"><span style="width:${percent.toFixed(1)}%"></span></div><div class="curriculum-progress-grid"><div class="curriculum-progress-card curriculum-progress-card-earned"><span>已获得</span><strong>${escapeHtml(formatCurriculumCredit(earnedCredits))}</strong><small>培养方案学分</small></div><div class="curriculum-progress-card curriculum-progress-card-remaining"><span>剩余</span><strong>${escapeHtml(formatCurriculumCredit(remainingCredits))}</strong><small>达到最低要求</small></div><div class="curriculum-progress-card"><span>已完成课程</span><strong>${escapeHtml(`${earnedRecords.length} / ${records.length}`)}</strong><small>按已通过成绩匹配</small></div><div class="curriculum-progress-card"><span>课组</span><strong>${escapeHtml(state.curriculum.groups.length)}</strong><small>当前方案层级</small></div></div><div class="curriculum-credit-composition"><div class="curriculum-credit-composition-head"><strong>学分构成</strong><span>只展示已有数据，不改变原系统判定</span></div><div class="curriculum-composition-grid">${compositionItem("必修", requiredCredits, requiredTarget)}${compositionItem("选修", electiveCredits, electiveTarget)}<div class="curriculum-composition-item"><span>方案最低要求</span><strong>${escapeHtml(formatCurriculumCredit(targetCredits))} 学分</strong><small>原系统方案字段</small></div></div></div>${remainingMarkup}${failedMarkup}</section>`;
}

// 这些最终定义位于所有旧页面 renderer 之后，确保同一套业务状态在桌面和
// Android 移动壳层都使用新的信息架构。
function renderSettings() {
  const firstWeekDate = normalizeCalendarDate(state.calendar.firstWeekStart);
  const invalidWeekday = firstWeekDate && firstWeekDate.getDay() !== 0;
  const currentText = firstWeekDate ? `${calendarDateText(firstWeekDate)} · ${SUNDAY_FIRST_DAY_NAMES[firstWeekDate.getDay()]}` : "尚未设置";
  const configuredLoginMethod = IS_ANDROID_APP ? androidLoginMethod() : (readStoredSetting("zhizhang.loginMethod") === "wechat" ? "wechat" : "password");
  const cacheStatus = personalCacheStatusText() || "尚未缓存个人教务数据";
  const curriculumMore = IS_ANDROID_APP ? "" : `<div class="settings-row settings-link-row"><div><strong>培养计划</strong><small>查看培养方案、课组和课程完成情况</small></div><button class="button button-ghost" type="button" data-action="view-curriculum">打开</button></div>`;
  const cacheBlock = IS_ANDROID_APP ? `<section class="settings-section"><div class="settings-intro"><h3>数据缓存</h3><p>${escapeHtml(cacheStatus)}。成功读取后自动更新，离线时仍可查看上次结果。</p></div><div class="settings-actions"><button class="button button-ghost" type="button" data-action="clear-personal-cache">清除本机缓存</button></div><div class="settings-callout"><strong>隐私</strong><span>查询缓存不包含密码、验证码、Cookie 或令牌；内置登录凭据另行由 Android Keystore 加密保存。</span></div></section>` : "";
  return `<div>${sectionHeading("设置", "")}<div class="panel settings-panel"><section class="settings-section"><div class="settings-intro"><h3>课表</h3><p>设置第一周的周日，日视图和周表会据此定位当前学周。</p></div><label class="settings-field"><span>第一周周日</span><input id="firstWeekStartInput" type="date" value="${escapeHtml(state.calendar.firstWeekStart)}" /><small>当前：${escapeHtml(currentText)}。必须选择周日。</small></label>${invalidWeekday ? `<div class="schedule-note">保存的日期不是周日，请重新选择。</div>` : ""}<div class="settings-actions"><button class="button button-primary" type="button" data-action="save-calendar-settings">保存</button><button class="button button-ghost" type="button" data-action="clear-calendar-settings">清除日期</button></div></section><section class="settings-section"><div class="settings-intro"><h3>账户</h3><p>内置登录默认开启可信设备与后台自动重登；原网页账密和二维码入口始终保留。</p></div><label class="settings-field"><span>默认登录方式</span><select id="loginMethodSelect"><option value="builtin" ${configuredLoginMethod === "builtin" ? "selected" : ""}>内置登录（默认）</option><option value="password" ${configuredLoginMethod === "password" ? "selected" : ""}>原网页账密登录</option><option value="wechat" ${configuredLoginMethod === "wechat" ? "selected" : ""}>微信二维码登录</option></select><small>学号和密码只使用 Android Keystore 加密保存在本机；验证码不保存。</small></label></section><section class="settings-section"><div class="settings-intro"><h3>更多工具</h3><p>低频功能集中在这里。</p></div><div class="settings-row settings-link-row"><div><strong>全校课表</strong><small>查询班级、教师和教室</small></div><button class="button button-ghost" type="button" data-action="view-all">打开</button></div>${curriculumMore}<div class="settings-row settings-link-row"><div><strong>原教务系统</strong><small>登录、查看原页面或处理未发布数据</small></div><button class="button button-ghost" type="button" data-action="open-portal">打开</button></div></section>${cacheBlock}</div></div>`;
}

function renderAll() {
  const orderedTypes = [...state.scheduleTypes].sort((a, b) => Number(scheduleTypeKind(b) === "class") - Number(scheduleTypeKind(a) === "class"));
  const options = orderedTypes.map((type) => `<option value="${escapeHtml(type.code)}">${escapeHtml(type.name)}</option>`).join("");
  const classMode = isClassScheduleType();
  const filterFields = classMode
    ? `<label>班级代码<input id="allCode" value="${escapeHtml(state.filters.allCode)}" placeholder="如 13022601" /></label><label>班级名称<input id="allName" value="${escapeHtml(state.filters.allName)}" placeholder="如 自动化" /></label>`
    : `<label>关键词<input id="allKeyword" value="${escapeHtml(state.filters.allKeyword)}" placeholder="代码、名称、教师或教室" /></label>`;
  const allTermOptions = state.allTerms.length
    ? state.allTerms.map((term) => `<option value="${escapeHtml(term.code)}">${escapeHtml(term.name)}</option>`).join("")
    : `<option value="">正在读取学期…</option>`;
  const permissionHint = state.allScheduleHiddenTypes.length
    ? `<p class="muted all-schedule-permission-hint">原系统当前开放：${escapeHtml(state.scheduleTypes.map((type) => type.name).join("、"))}。其他类型没有查询权限，已按原系统规则隐藏。</p>`
    : "";
  return `<div>${sectionHeading("全校课表", "")}<div class="all-query-toolbar"><div class="all-query-context"><label>学期<select id="allTermSelect" ${state.allTerms.length ? "" : "disabled"}>${allTermOptions}</select></label><label>查询类型<select id="allMode">${options}</select></label></div><div class="inline-form">${filterFields}<button class="button button-primary" type="button" data-action="search-all">查询</button></div></div>${state.allTermError ? `<p class="muted">${escapeHtml(state.allTermError)}</p>` : ""}${state.scheduleTypeError ? `<p class="muted">${escapeHtml(state.scheduleTypeError)}</p>` : ""}${permissionHint}<div class="panel all-results-panel">${renderAllRows()}</div>${renderAllDetail()}${renderAllUtilities()}${renderCourseTransferModal()}</div>`;
}

function renderAllUtilities() {
  return renderSectionUtilities(`<button class="button button-ghost" type="button" data-action="open-portal">原系统</button>`);
}

function renderAndroidLoginEntry() {
  if (!IS_ANDROID_APP) return "";
  const loginStatus = state.androidLogin.status;
  const loginMessage = state.androidLogin.message;
  const shouldShow = loginStatus === "retrying" || loginStatus === "failed"
    || (state.personalCache.available && !state.connected);
  if (!shouldShow || state.fatalError) return "";
  const savedAt = cacheDateText(state.personalCache.savedAt);
  const retrying = loginStatus === "retrying";
  const title = retrying ? "正在后台重新登录" : loginStatus === "failed" ? "后台自动登录失败" : "当前显示本机缓存";
  const detail = loginMessage || "教务系统登录会话已失效或暂时不可用。";
  const diagnosticAction = loginStatus === "failed"
    ? `<button class="button button-ghost" type="button" data-action="copy-login-diagnostics">复制详细报错</button>`
    : "";
  return `<section class="android-login-entry" aria-live="polite"><div class="android-login-entry-copy"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>${savedAt ? `<small>缓存时间：${escapeHtml(savedAt)}</small>` : ""}</div><div class="android-login-entry-actions"><button class="button button-primary" type="button" data-action="open-portal">手动登录 / 其他方式</button>${diagnosticAction}</div></section>`;
}

function render() {
  try {
  if (IS_ANDROID_APP && ["curriculum", "course-outline"].includes(state.view)) state.view = "overview";
  try { updatePersonalTermSelect(); } catch { /* 初始化阶段元素可能尚未准备好 */ }
  const pageTitles = { overview: "总览", personal: "课表", exams: "考试", scores: "成绩", all: "全校课表", curriculum: "培养计划", "course-outline": "课程大纲", settings: "设置" };
  document.querySelectorAll("[data-view]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.view));
  if (elements.pageTitle) elements.pageTitle.textContent = pageTitles[state.view] || "执掌东大";
  elements.content.classList.toggle("curriculum-content", state.view === "curriculum");
  elements.content.classList.toggle("course-outline-content", state.view === "course-outline");
  // content.innerHTML 会随路由切换重建，但 Campus Header 属于外层
  // Mobile Shell；每次 render 只重新套用已有状态，绝不默认显示。
  applyNativeEcodePlaceholderState();
  if (state.fatalError && state.view !== "settings" && !localScheduleItemsForTerm(state.termCode).length) {
    const completeError = IS_ANDROID_APP ? (state.androidLogin.message || state.fatalError) : state.fatalError;
    const loginPrivacy = IS_ANDROID_APP
      ? `<p class="muted">内置登录凭据仅使用 Android Keystore 加密保存在本机；也可以改用学校原网页账密或二维码登录。</p>`
      : `<p class="muted">插件不会保存账号或密码，只会复用浏览器当前的登录会话。登录完成后点击“刷新数据”即可。</p>`;
    const loginButtonLabel = IS_ANDROID_APP ? "手动登录 / 其他方式" : "打开教务系统";
    const diagnosticAction = IS_ANDROID_APP
      ? `<button class="button button-ghost" type="button" data-action="copy-login-diagnostics">复制详细报错</button>`
      : "";
    elements.content.innerHTML = `<div class="error-card"><h3>需要先登录教务系统</h3><p>${escapeHtml(completeError)}</p>${loginPrivacy}<div class="android-login-actions"><button class="button button-primary" type="button" data-action="open-portal">${loginButtonLabel}</button>${diagnosticAction}</div></div>${state.view === "personal" ? renderCampusPromptModal() : ""}`;
    return;
  }
  if (state.loading && !state.data.scores.length && !state.data.exams.length && !state.data.courses.length && !localScheduleItemsForTerm(state.termCode).length && state.view === "overview") {
    elements.content.innerHTML = loadingCard();
    return;
  }
  if (state.view === "overview") elements.content.innerHTML = renderOverview();
  if (state.view === "scores") elements.content.innerHTML = state.loading && !state.data.scores.length ? loadingCard() : renderScores();
  if (state.view === "curriculum") elements.content.innerHTML = renderCurriculum();
  if (state.view === "course-outline") elements.content.innerHTML = renderCourseOutline();
  if (state.view === "exams") elements.content.innerHTML = state.loading && !state.data.exams.length ? loadingCard() : renderExams();
  if (state.view === "personal") elements.content.innerHTML = state.loading && !state.data.courses.length ? `${loadingCard()}${renderCampusPromptModal()}` : renderPersonal();
  if (state.view === "all") elements.content.innerHTML = renderAll();
  if (state.view === "settings") elements.content.innerHTML = renderSettings();
  if (state.view === "all" && state.allTypeCode) {
    const mode = document.getElementById("allMode");
    if (mode) mode.value = state.allTypeCode;
  }
  if (state.view === "all" && state.allTermCode) {
    const term = document.getElementById("allTermSelect");
    if (term) term.value = state.allTermCode;
  }
  const loginEntry = renderAndroidLoginEntry();
  if (loginEntry) elements.content.insertAdjacentHTML("beforeend", loginEntry);
  } finally {
    // 无论页面走正常渲染、加载占位还是登录错误分支，都同步模态锁；
    // 这样任意新弹窗都默认隔离校园码手势，不依赖逐个绑定事件。
    syncNativeEcodeOverlayLock();
  }
}

function openPortal() {
  if (globalThis.AndroidApi?.openPortal) {
    globalThis.AndroidApi.openPortal();
    return;
  }
  if (globalThis.chrome?.tabs?.create) {
    const method = readStoredSetting("zhizhang.loginMethod") === "wechat" ? "wechat" : "password";
    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "open-portal-login", method }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) chrome.tabs.create({ url: PORTAL_URL });
      });
    } else {
      chrome.tabs.create({ url: PORTAL_URL });
    }
  } else {
    window.open(PORTAL_URL, "_blank", "noopener");
  }
}

async function openCurriculumPortal() {
  return startCurriculumBootstrap();
}

function preparePersonalDataAfterDefaultTermChange(previousTermCode) {
  if (!state.termCode || state.termCode === previousTermCode) return;
  state.scheduleWeek.personal = "";
  state.scheduleDisplay.personal = "days";
  if (!applyCachedTermSnapshot(state.termCode)) {
    state.data = emptyPersonalData();
    state.data.allScores = Array.isArray(state.personalCache.allScores) ? state.personalCache.allScores : [];
  }
}

async function saveManualCurrentTerm() {
  const select = document.getElementById("currentTermSelect");
  const code = String(select?.value || configuredCurrentTermCode() || "").trim();
  if (!code || !currentTermCandidates().some((term) => term.code === code)) {
    setNotice("请先选择一个可用学期。", "error");
    return;
  }
  const previousTermCode = state.termCode;
  state.currentTerm.mode = "manual";
  state.currentTerm.overrideCode = code;
  state.currentTerm.error = "";
  saveCurrentTermPreference();
  applyCurrentTermDefaults();
  preparePersonalDataAfterDefaultTermChange(previousTermCode);
  setNotice(`当前学期已手动设为 ${currentTermName(code)}。`, "success");
  render();
  if (state.termCode !== previousTermCode) await refresh();
}

async function syncCurrentTermFromSchool() {
  if (state.currentTerm.syncing) return;
  const previousTermCode = state.termCode;
  state.currentTerm.syncing = true;
  state.currentTerm.error = "";
  render();
  try {
    await loadTerms({ useSchoolAsCurrent: true });
    if (!state.currentTerm.detectedCode) throw new Error("教务系统没有返回可识别的当前学期");
    preparePersonalDataAfterDefaultTermChange(previousTermCode);
    state.currentTerm.syncing = false;
    setNotice(`已从教务系统同步当前学期：${currentTermName(state.currentTerm.detectedCode)}。`, "success", TOAST_CATEGORY_ESSENTIAL);
    render();
    if (state.termCode !== previousTermCode) await refresh();
  } catch (error) {
    state.currentTerm.syncing = false;
    state.currentTerm.error = `同步失败：${error.message || "教务系统暂时不可用"}`;
    setNotice(state.currentTerm.error, "error");
    render();
  }
}

async function runRefresh(forceTerms = false) {
  const requestId = ++refreshRequestSequence;
  const localBootstrap = await bootstrapLocalDashboard();
  const hasCache = Boolean(localBootstrap?.hasCache || state.personalCache.available);
  const hasLocalSchedule = localScheduleItemsForTerm(state.termCode).length > 0;
  state.fatalError = "";
  setNotice(hasCache ? "正在尝试刷新教务接口，页面先显示上次缓存…" : hasLocalSchedule && state.localSchedule.items.length ? "正在读取教务接口，页面先显示本地安排…" : "正在读取教务接口…", "", hasCache ? TOAST_CATEGORY_ESSENTIAL : "default");
  setConnection(hasCache ? "正在刷新 · 已显示本地缓存" : "正在读取数据", "loading");
  render();
  try {
    if (forceTerms || !state.terms.length || !state.personalCache.networkTermsAttempted) {
      try {
        await loadTerms();
      } catch (error) {
        if (!hasCache) throw error;
        // 学期列表也可能因会话失效而暂时不可用；保留缓存中的学期选项。
        state.personalCache.networkTermsAttempted = true;
      }
    }
    if (requestId !== refreshRequestSequence) return;
    const loaded = await loadTermData(requestId);
    if (!loaded || requestId !== refreshRequestSequence) return;
    const refreshed = state.personalCache.lastLiveEndpointCount > 0;
    if (refreshed) {
      setConnection("已连接 · 使用当前登录会话", "ready");
      if (state.errors.length) setNotice(`数据已自动更新，但有 ${state.errors.length} 项接口暂时失败，可点击刷新重试。`, "", TOAST_CATEGORY_ESSENTIAL);
      else setNotice("数据已更新，个人结果已缓存到本机。", "success", TOAST_CATEGORY_ESSENTIAL);
    } else if (hasCache) {
      state.personalCache.source = "cache";
      setConnection("离线 · 使用本地缓存", "ready");
      setNotice(`教务系统暂时不可用，当前显示缓存${cacheDateText(state.personalCache.savedAt) ? `（${cacheDateText(state.personalCache.savedAt)}）` : ""}。登录后刷新会自动更新。`, "", TOAST_CATEGORY_ESSENTIAL);
    }
  } catch (error) {
    if (requestId !== refreshRequestSequence) return;
    state.loading = false;
    state.connected = false;
    if (hasCache && state.personalCache.available) {
      // 有缓存时，网络或会话异常不能把已经可用的个人页面替换成登录错误页。
      state.fatalError = "";
      state.personalCache.source = "cache";
      setConnection("离线 · 使用本地缓存", "ready");
      setNotice(`教务系统暂时不可用，当前显示缓存${cacheDateText(state.personalCache.savedAt) ? `（${cacheDateText(state.personalCache.savedAt)}）` : ""}。登录后刷新会自动更新。`, "", TOAST_CATEGORY_ESSENTIAL);
    } else if (localScheduleItemsForTerm(state.termCode).length) {
      state.fatalError = "";
      state.personalCache.source = "";
      setConnection("仅显示本地安排", "ready");
      setNotice("教务系统暂时不可用，当前仍显示本机自定义安排。登录后刷新会自动补充学校课表。", "");
    } else {
      state.fatalError = error.message || "无法读取教务系统";
      setConnection(error.message || "连接失败", "error");
      setNotice(`${state.fatalError}。请先打开原系统并登录，再回到本页刷新。`, "error");
    }
  }
  if (requestId === refreshRequestSequence) render();
}

// Android 启动、原生登录成功、页面切换和用户点击刷新都可能在同一时段
// 到达。只允许一条刷新链路运行；只有用户已经明确切换查询学期时，才把
// 新学期排到当前请求之后，普通重复触发直接复用当前 Promise。
function refresh(forceTerms = false) {
  if (refreshInFlight) {
    const termChangedDuringFlight = state.termSelectionTouched
      && state.termCode
      && refreshFlightTermCode
      && state.termCode !== refreshFlightTermCode;
    if (termChangedDuringFlight || forceTerms) {
      refreshQueued = true;
      refreshQueuedForceTerms = refreshQueuedForceTerms || forceTerms;
    }
    return refreshInFlight;
  }
  refreshFlightTermCode = state.termCode || "";
  const current = Promise.resolve(runRefresh(forceTerms));
  refreshInFlight = current.finally(() => {
    const shouldRunQueued = refreshQueued;
    const queuedForceTerms = refreshQueuedForceTerms;
    refreshInFlight = null;
    refreshFlightTermCode = "";
    refreshQueued = false;
    refreshQueuedForceTerms = false;
    if (shouldRunQueued) window.setTimeout(() => refresh(queuedForceTerms), 0);
  });
  return refreshInFlight;
}

/* -------------------------------------------------------------------------
 * Local schedule overlay
 *
 * The school response remains the source of truth in state.data. Everything
 * below is a presentation/data-management layer for items created locally by
 * the user. Keep this block independent from mapCourse() and the school cache.
 * ---------------------------------------------------------------------- */
const LOCAL_SCHEDULE_SCHEMA = "zhizhang-local-schedule/v1";
const LOCAL_SCHEDULE_STORAGE_PREFIX = "zhizhang.local-schedule.v1.";
const LOCAL_SCHEDULE_MAX_BYTES = 900 * 1024;
const LOCAL_SCHEDULE_COLOR_KEYS = ["blue", "teal", "green", "violet", "orange", "rose"];

function localScheduleTrim(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function localScheduleNow() {
  return new Date().toISOString();
}

function localScheduleStableHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function localScheduleId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // file:// 页面和较旧的 Android WebView 可能没有 randomUUID。
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function localScheduleProfileKey(value = "") {
  const explicit = String(value ?? "").trim();
  if (explicit) return explicit;
  return String(state.studentId || state.personalCache.studentId || "anonymous").trim() || "anonymous";
}

function localScheduleStorageKey(profileKey = localScheduleProfileKey()) {
  return `${LOCAL_SCHEDULE_STORAGE_PREFIX}${localScheduleStableHash(profileKey)}`;
}

function localScheduleChromeStorageAvailable() {
  return Boolean(globalThis.chrome?.storage?.local);
}

function chromeLocalScheduleGet(key) {
  return new Promise((resolve) => {
    try {
      const getter = globalThis.chrome.storage.local.get;
      if (getter.length >= 2) {
        getter.call(globalThis.chrome.storage.local, key, (result) => resolve(result?.[key] ?? null));
        return;
      }
      const result = getter.call(globalThis.chrome.storage.local, key);
      if (result && typeof result.then === "function") result.then((value) => resolve(value?.[key] ?? null)).catch(() => resolve(null));
      else resolve(result?.[key] ?? null);
    } catch {
      resolve(null);
    }
  });
}

function chromeLocalScheduleSet(key, value) {
  return new Promise((resolve, reject) => {
    try {
      const setter = globalThis.chrome.storage.local.set;
      if (setter.length >= 2) {
        setter.call(globalThis.chrome.storage.local, { [key]: value }, () => {
          const error = globalThis.chrome.runtime?.lastError;
          if (error) reject(new Error(error.message || "Chrome 本地存储失败"));
          else resolve(true);
        });
        return;
      }
      const result = setter.call(globalThis.chrome.storage.local, { [key]: value });
      if (result && typeof result.then === "function") result.then(() => resolve(true)).catch(reject);
      else resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}

function chromeLocalScheduleRemove(key) {
  return new Promise((resolve, reject) => {
    try {
      const remover = globalThis.chrome.storage.local.remove;
      if (remover.length >= 2) {
        remover.call(globalThis.chrome.storage.local, key, () => {
          const error = globalThis.chrome.runtime?.lastError;
          if (error) reject(new Error(error.message || "Chrome 本地存储失败"));
          else resolve(true);
        });
        return;
      }
      const result = remover.call(globalThis.chrome.storage.local, key);
      if (result && typeof result.then === "function") result.then(() => resolve(true)).catch(reject);
      else resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}

async function loadLocalSchedule(profileKey = localScheduleProfileKey()) {
  const key = localScheduleStorageKey(profileKey);
  if (IS_ANDROID_APP && typeof globalThis.AndroidApi?.loadLocalSchedule === "function") {
    try {
      let raw = "";
      try {
        raw = globalThis.AndroidApi.loadLocalSchedule(profileKey) || "";
      } catch {
        raw = globalThis.AndroidApi.loadLocalSchedule() || "";
      }
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  if (localScheduleChromeStorageAvailable()) {
    return await chromeLocalScheduleGet(key);
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveLocalSchedule(payload) {
  if (!payload || typeof payload !== "object") return false;
  const serialized = JSON.stringify(payload);
  if (new Blob([serialized]).size > LOCAL_SCHEDULE_MAX_BYTES) throw new Error("本地自定义安排过多，暂时无法保存");
  const profileKey = localScheduleProfileKey(payload.profileKey || payload.studentId);
  const key = localScheduleStorageKey(profileKey);
  if (IS_ANDROID_APP && typeof globalThis.AndroidApi?.saveLocalSchedule === "function") {
    globalThis.AndroidApi.saveLocalSchedule(serialized);
    return true;
  }
  if (localScheduleChromeStorageAvailable()) {
    await chromeLocalScheduleSet(key, payload);
    return true;
  }
  try {
    window.localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    throw new Error(error?.message || "本地存储不可用");
  }
}

async function clearLocalSchedule(profileKey = localScheduleProfileKey()) {
  const key = localScheduleStorageKey(profileKey);
  if (IS_ANDROID_APP && typeof globalThis.AndroidApi?.clearLocalSchedule === "function") {
    try {
      globalThis.AndroidApi.clearLocalSchedule(profileKey);
    } catch {
      try { globalThis.AndroidApi.clearLocalSchedule(); } catch { /* ignore */ }
    }
  } else if (localScheduleChromeStorageAvailable()) {
    await chromeLocalScheduleRemove(key);
  } else {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }
  return true;
}

function localScheduleTime(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : "";
}

function localScheduleDate(value) {
  const date = normalizeCalendarDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localScheduleInteger(value, fallback = null) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function localScheduleWeekNumbers(value) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[,，、;；\s]+/);
  return [...new Set(source
    .flatMap((part) => String(part ?? "").match(/\d+/g) || [])
    .map(Number)
    .filter((week) => Number.isInteger(week) && week > 0 && week <= 60))].sort((a, b) => a - b);
}

function localScheduleTermName(code) {
  const value = String(code ?? "");
  return state.terms.find((term) => term.code === value)?.name
    || state.localSchedule.termOptions?.find((term) => term.code === value)?.name
    || value;
}

function normalizeLocalScheduleItem(raw = {}, options = {}) {
  const type = raw.type === "event" ? "event" : "course";
  const now = localScheduleNow();
  const course = raw.course && typeof raw.course === "object" ? raw.course : {};
  const event = raw.event && typeof raw.event === "object" ? raw.event : {};
  const schedule = type === "event" ? event : course;
  const termCode = localScheduleTrim(raw.termCode || options.termCode || currentTermCodeFor(currentTermCandidates()), 80);
  const sourceWeeks = course.weekNumbers ?? raw.weekNumbers ?? raw.weeks;
  const weekdayValue = course.weekdayIndex ?? raw.weekdayIndex ?? raw.weekday;
  let weekdayIndex = localScheduleInteger(weekdayValue, null);
  if (weekdayIndex === null || weekdayIndex < 0 || weekdayIndex > 6) {
    const parsedDay = parseDay(weekdayValue);
    weekdayIndex = parsedDay ? (parsedDay === 7 ? 0 : parsedDay) : null;
  }
  const startSection = localScheduleInteger(schedule.startSection ?? raw.startSection, null);
  const endSection = localScheduleInteger(schedule.endSection ?? raw.endSection, null);
  const normalizedStartSection = startSection && startSection > 0 ? startSection : null;
  // 结束节次单独存在没有语义；保持可选字段的 canonical null，避免旧数据
  // 或表单空值在后续比较中被当成一节真实排课。
  const normalizedEndSection = normalizedStartSection && endSection && endSection > 0 ? endSection : null;
  const startTime = localScheduleTime(schedule.startTime ?? raw.startTime);
  const endTime = localScheduleTime(schedule.endTime ?? raw.endTime);
  const item = {
    id: localScheduleTrim(raw.id, 120) || localScheduleId(),
    source: "local",
    type,
    termCode,
    termName: localScheduleTrim(raw.termName || options.termName || localScheduleTermName(termCode), 120),
    title: localScheduleTrim(raw.title || raw.name, 160),
    teacher: localScheduleTrim(raw.teacher, 120),
    location: localScheduleTrim(raw.location, 180),
    note: localScheduleTrim(raw.note, 1000),
    createdAt: localScheduleTrim(raw.createdAt, 80) || now,
    updatedAt: localScheduleTrim(raw.updatedAt, 80) || now,
    enabled: raw.enabled !== false,
    colorKey: LOCAL_SCHEDULE_COLOR_KEYS.includes(raw.colorKey) ? raw.colorKey : "blue",
    excludedWeeks: localScheduleWeekNumbers(raw.excludedWeeks),
    excludedDates: Array.isArray(raw.excludedDates) ? raw.excludedDates.map(localScheduleDate).filter(Boolean) : [],
    course: {
      weekNumbers: localScheduleWeekNumbers(sourceWeeks),
      weekdayIndex,
      startSection: normalizedStartSection,
      endSection: normalizedEndSection,
      startTime,
      endTime
    },
    event: {
      date: localScheduleDate(event.date ?? raw.date),
      allDay: Boolean(event.allDay ?? raw.allDay),
      startTime,
      endTime,
      startSection: normalizedStartSection,
      endSection: normalizedEndSection
    }
  };
  if (type === "course") item.event = { date: "", allDay: false, startTime: "", endTime: "", startSection: null, endSection: null };
  if (type === "event") item.course = { weekNumbers: [], weekdayIndex: null, startSection: normalizedStartSection, endSection: normalizedEndSection, startTime, endTime };
  return item;
}

function localScheduleDraftFromItem(item = null, type = "course") {
  if (!item) {
    const currentCode = currentTermCodeFor(currentTermCandidates());
    const base = {
      type,
      termCode: currentCode,
      termName: localScheduleTermName(currentCode)
    };
    if (type === "event") {
      return normalizeLocalScheduleItem({
        ...base,
        event: { date: localScheduleDate(new Date()), allDay: false, startSection: null, endSection: null }
      });
    }
    const occurrence = localScheduleDefaultCourseOccurrence();
    return normalizeLocalScheduleItem({
      ...base,
      course: { weekNumbers: occurrence.weekNumbers, weekdayIndex: occurrence.weekdayIndex, startSection: 1, endSection: 2 }
    });
  }
  return normalizeLocalScheduleItem(JSON.parse(JSON.stringify(item)));
}

function localScheduleDefaultCourseOccurrence(date = new Date()) {
  const info = academicDayInfo(date);
  return {
    weekNumbers: Number.isInteger(info.week) && info.week > 0 ? [info.week] : [],
    weekdayIndex: info.weekdayIndex
  };
}

function localSchedulePayload() {
  const profileKey = localScheduleProfileKey(state.localSchedule.profileKey);
  const studentId = state.studentId || state.personalCache.studentId || "";
  return {
    schema: LOCAL_SCHEDULE_SCHEMA,
    schemaVersion: 1,
    profileKey,
    studentId: String(studentId),
    savedAt: localScheduleNow(),
    items: (state.localSchedule.items || []).map((item) => normalizeLocalScheduleItem(item)),
    hiddenSchoolEntries: (state.localSchedule.hiddenSchoolEntries || []).map((entry) => ({
      key: localScheduleTrim(entry.key, 240),
      termCode: localScheduleTrim(entry.termCode, 80),
      label: localScheduleTrim(entry.label, 300),
      hiddenByLocalId: localScheduleTrim(entry.hiddenByLocalId, 120),
      createdAt: localScheduleTrim(entry.createdAt, 80) || localScheduleNow()
    })).filter((entry) => entry.key)
  };
}

async function persistLocalSchedule() {
  try {
    await saveLocalSchedule(localSchedulePayload());
    state.localSchedule.profileKey = localScheduleProfileKey(state.localSchedule.profileKey);
    return true;
  } catch (error) {
    setNotice(`自定义安排保存失败：${error.message || "本地存储不可用"}`, "error");
    return false;
  }
}

function localScheduleTerms() {
  const byCode = new Map((state.terms || []).map((term) => [term.code, { code: term.code, name: term.name }]));
  (state.localSchedule.items || []).forEach((item) => {
    if (item.termCode && !byCode.has(item.termCode)) byCode.set(item.termCode, { code: item.termCode, name: item.termName || item.termCode });
  });
  return [...byCode.values()];
}

async function hydrateLocalSchedule(profileKey = localScheduleProfileKey(), force = false) {
  const normalizedProfile = localScheduleProfileKey(profileKey);
  if (!force && state.localSchedule.hydrated && state.localSchedule.profileKey === normalizedProfile) return true;
  state.localSchedule.loading = true;
  state.localSchedule.profileKey = normalizedProfile;
  let payload = null;
  try {
    payload = await loadLocalSchedule(normalizedProfile);
  } catch {
    payload = null;
  }
  state.localSchedule.items = [];
  state.localSchedule.hiddenSchoolEntries = [];
  state.localSchedule.termOptions = [];
  state.localSchedule.corrupted = false;
  if (payload) {
    if (payload.schema !== LOCAL_SCHEDULE_SCHEMA || Number(payload.schemaVersion || 0) !== 1) {
      state.localSchedule.corrupted = true;
    } else {
      state.localSchedule.items = Array.isArray(payload.items)
        ? payload.items.map((item) => normalizeLocalScheduleItem(item)).filter((item) => item.title)
        : [];
      state.localSchedule.hiddenSchoolEntries = Array.isArray(payload.hiddenSchoolEntries)
        ? payload.hiddenSchoolEntries.filter((entry) => entry && entry.key).map((entry) => ({ ...entry }))
        : [];
      state.localSchedule.termOptions = [...new Map(state.localSchedule.items
        .filter((item) => item.termCode)
        .map((item) => [item.termCode, { code: item.termCode, name: item.termName || item.termCode }])).values()];
    }
  }
  state.localSchedule.hydrated = true;
  state.localSchedule.loading = false;
  if (!state.termCode && state.localSchedule.termOptions.length) {
    state.termSelectionTouched = false;
    state.termCode = currentTermCodeFor(currentTermCandidates());
  }
  try { updatePersonalTermSelect(); } catch { /* renderer may not be ready in smoke tests */ }
  return !state.localSchedule.corrupted;
}

async function bootstrapLocalDashboard() {
  if (localBootstrapPromise) return localBootstrapPromise;
  localBootstrapPromise = (async () => {
    // 个人缓存是同步原生桥，本地自定义安排可能走异步存储；两者都必须在
    // dashboardReady 之前完成，断网时不能再依赖远程会话探测放行。
    const hasCache = hydratePersonalCache();
    await hydrateLocalSchedule();
    if (!state.termCode) state.termCode = currentTermCodeFor(currentTermCandidates());
    applyCurrentTermDefaults();
    const hasLocalSchedule = localScheduleItemsForTerm(state.termCode).length > 0;
    state.loading = false;
    state.fatalError = "";
    state.connected = false;
    if (hasCache && state.personalCache.available) {
      state.personalCache.source = "cache";
      setConnection("已加载本地缓存，等待同步", "ready");
    } else if (hasLocalSchedule) {
      setConnection("仅显示本地安排，等待同步", "ready");
    } else {
      setConnection("等待联网读取教务数据", "loading");
    }
    render();
    return { hasCache: Boolean(hasCache && state.personalCache.available), hasLocalSchedule };
  })().catch((error) => {
    // 本地存储损坏或旧版本桥缺失也不能把首页卡在 loading；让网络刷新或
    // 用户手动刷新继续有机会恢复，同时保留已成功读到的部分数据。
    state.loading = false;
    state.fatalError = "";
    state.connected = false;
    setConnection("本地数据暂不可用，等待同步", "loading");
    render();
    return { hasCache: false, hasLocalSchedule: false, error };
  });
  return localBootstrapPromise;
}

async function switchLocalScheduleProfile(studentId) {
  const nextProfile = localScheduleProfileKey(studentId);
  if (state.localSchedule.profileKey === nextProfile && state.localSchedule.hydrated) return;
  await hydrateLocalSchedule(nextProfile, true);
}

function localScheduleItemsForTerm(termCode = state.termCode, includeDisabled = false) {
  const code = String(termCode || "");
  return (state.localSchedule.items || []).filter((item) => {
    if (!includeDisabled && !item.enabled) return false;
    return !code || !item.termCode || item.termCode === code;
  });
}

function localScheduleDateText(date) {
  const normalized = normalizeCalendarDate(date);
  return normalized ? `${normalized.getMonth() + 1}月${normalized.getDate()}日` : "日期待设置";
}

function localScheduleWeekdayText(index) {
  return Number.isInteger(index) && index >= 0 && index <= 6
    ? `星期${["日", "一", "二", "三", "四", "五", "六"][index]}`
    : "星期待设置";
}

function localScheduleClockText(item) {
  const value = item?.type === "event" ? item.event : item?.course;
  if (!value) return "";
  if (value.startTime && value.endTime) return `${value.startTime}–${value.endTime}`;
  return value.startTime || "";
}

function localScheduleSectionText(item) {
  const value = item?.type === "event" ? item.event : item?.course;
  if (!value?.startSection) return "";
  return value.endSection && value.endSection !== value.startSection
    ? `第${value.startSection}-${value.endSection}节`
    : `第${value.startSection}节`;
}

function localScheduleItemToCourseRow(item) {
  const normalized = normalizeLocalScheduleItem(item);
  const event = normalized.type === "event";
  const date = event ? normalizeCalendarDate(normalized.event.date) : null;
  const dateInfo = date ? academicDayInfo(date) : null;
  const weekdayIndex = event
    ? date?.getDay() ?? normalized.event.weekdayIndex
    : normalized.course.weekdayIndex;
  const sectionValue = event ? normalized.event : normalized.course;
  const weeks = event
    ? dateInfo?.week ? `${dateInfo.week}周` : ""
    : formatWeeksValue(normalized.course.weekNumbers.join(","));
  const weekday = localScheduleWeekdayText(weekdayIndex);
  const section = sectionValue?.startSection ? localScheduleSectionText(normalized) : "";
  const clock = localScheduleClockText(normalized);
  return {
    name: normalized.title,
    code: `LOCAL-${normalized.id.slice(0, 8)}`,
    catalogCode: "",
    teacher: normalized.teacher,
    location: normalized.location,
    time: clock || [weeks, weekday, section].filter(Boolean).join(" "),
    weeks,
    weekday,
    section,
    detail: normalized.note,
    category: "",
    nature: "",
    requirement: "",
    assessment: "",
    examType: "",
    credit: "",
    raw: null,
    source: "local",
    localId: normalized.id,
    localType: normalized.type,
    localDate: event ? normalized.event.date : "",
    localAllDay: event ? normalized.event.allDay : false,
    localColorKey: normalized.colorKey,
    termCode: normalized.termCode,
    termName: normalized.termName,
    startTime: sectionValue?.startTime || "",
    endTime: sectionValue?.endTime || ""
  };
}

function schoolPersonalScheduleRows(rows = state.data.courses) {
  const sourceRows = (Array.isArray(rows) ? rows : []).filter((row) => row?.source !== "local");
  return dedupeScheduleOccurrenceRows(sourceRows
    .flatMap((course) => courseArrangementRows(course, "personal"))
    .filter(hasSchedulePlacement));
}

function schoolScheduleOccurrenceKey(course) {
  const raw = course?.raw && typeof course.raw === "object" ? course.raw : {};
  const rawId = valueOf(raw, ["JXBID", "teachClassId", "teachClassCode", "classCode", "courseSerialNo"], "");
  const range = courseSectionRange(course);
  const signature = [
    rawId,
    course?.code,
    course?.catalogCode,
    course?.name,
    courseDayIndex(course),
    range ? `${range.start}-${range.end}` : course?.section,
    [...courseWeekNumbers(course)].sort((a, b) => a - b).join(","),
    course?.teacher,
    course?.location
  ].map((value) => String(value ?? "").trim()).join("|");
  return `school:${localScheduleStableHash(signature)}`;
}

function mergedPersonalScheduleRows(rows = state.data.courses) {
  const hiddenKeys = new Set((state.localSchedule.hiddenSchoolEntries || [])
    .filter((entry) => !entry.termCode || entry.termCode === state.termCode)
    .map((entry) => entry.key));
  const schoolRows = schoolPersonalScheduleRows(rows).filter((course) => !hiddenKeys.has(schoolScheduleOccurrenceKey(course)));
  const localRows = localScheduleItemsForTerm(state.termCode).map(localScheduleItemToCourseRow);
  return [...schoolRows, ...localRows];
}

function normalizedScheduleCourses(rows) {
  return (rows || []).map((row) => row?.source === "local" || row?.raw ? row : mapCourse(row));
}

function dedupeScheduleOccurrenceRows(rows) {
  const seen = new Set();
  return (rows || []).filter((course) => {
    const range = courseSectionRange(course);
    const key = [
      course.source || "school",
      course.localId || course.code || course.catalogCode,
      course.name,
      courseDayIndex(course),
      range ? `${range.start}-${range.end}` : course.section,
      [...courseWeekNumbers(course)].sort((left, right) => left - right).join(","),
      course.localDate,
      extractClockText(course.time) || [course.startTime, course.endTime].filter(Boolean).join("-"),
      course.teacher,
      course.location
    ].map((value) => String(value ?? "").trim()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expandedScheduleOccurrenceRows(rows) {
  const expanded = normalizedScheduleCourses(rows).flatMap((course) => {
    // scheduleDetail 中的记录已经是一条独立排课。再次解析它携带的原始
    // 复合字符串会把同一门课的全部安排复制到每一条明细上。
    if (course?.source === "local" || course?.scheduleSegment || Number.isInteger(course?.sourceCourseIndex)) return [course];
    return expandMappedCourse(course);
  });
  return dedupeScheduleOccurrenceRows(expanded);
}

function courseArrangementRows(course, scope = "personal") {
  const mapped = course?.source === "local" || course?.raw ? course : mapCourse(course);
  if (mapped?.source === "local") return [mapped];
  const sourceIndex = scope === "personal" ? courseIndexForScope(mapped, scope) : -1;
  const details = scope === "personal"
    ? (state.data.scheduleDetail || []).filter((detail) => {
      if (Number.isInteger(detail?.sourceCourseIndex) && sourceIndex >= 0) return detail.sourceCourseIndex === sourceIndex;
      if (Number.isInteger(detail?.sourceCourseIndex)) return false;
      const mappedCode = comparableCourseIdentity(mapped.code || mapped.catalogCode);
      const detailCode = comparableCourseIdentity(detail.code || detail.catalogCode);
      if (mappedCode && detailCode && mappedCode !== detailCode) return false;
      return courseIdentityMatches(mapped, detail);
    })
    : [];
  const fallback = expandMappedCourse(mapped).map((detail) => (
    sourceIndex >= 0 && !Number.isInteger(detail?.sourceCourseIndex)
      ? { ...detail, sourceCourseIndex: sourceIndex }
      : detail
  ));
  const merged = [];
  [...details, ...fallback].forEach((candidate) => {
    const detailIndex = state.data.scheduleDetail.indexOf(candidate);
    const existingIndex = merged.findIndex((item) => sameCourse(item, candidate));
    if (existingIndex >= 0) {
      const combined = { ...merged[existingIndex] };
      mergeCourseFields(combined, candidate);
      if (!Number.isInteger(combined.sourceDetailIndex) && detailIndex >= 0) combined.sourceDetailIndex = detailIndex;
      merged[existingIndex] = combined;
    } else {
      merged.push({ ...candidate, ...(detailIndex >= 0 ? { sourceDetailIndex: detailIndex } : {}) });
    }
  });
  return dedupeScheduleOccurrenceRows(merged).sort((left, right) => {
    const leftDay = courseDayIndex(left);
    const rightDay = courseDayIndex(right);
    const leftRange = courseSectionRange(left);
    const rightRange = courseSectionRange(right);
    const leftWeek = Math.min(...courseWeekNumbers(left), Number.MAX_SAFE_INTEGER);
    const rightWeek = Math.min(...courseWeekNumbers(right), Number.MAX_SAFE_INTEGER);
    return (leftDay < 0 ? 8 : leftDay) - (rightDay < 0 ? 8 : rightDay)
      || (leftRange?.start || 99) - (rightRange?.start || 99)
      || leftWeek - rightWeek
      || String(left.location || "").localeCompare(String(right.location || ""), "zh-CN");
  });
}

function personalScheduleRows(rows = state.data.courses) {
  return mergedPersonalScheduleRows(rows);
}

function localScheduleRowById(id) {
  const item = (state.localSchedule.items || []).find((candidate) => candidate.id === String(id || ""));
  return item ? localScheduleItemToCourseRow(item) : null;
}

function resolveScheduleItemFromAction(element) {
  const source = element?.dataset?.courseSource || element?.dataset?.source || "school";
  if (source === "local" || element?.dataset?.localScheduleId) {
    return localScheduleRowById(element.dataset.localScheduleId);
  }
  const scope = element?.dataset?.courseScope || "personal";
  const index = Number(element?.dataset?.courseIndex);
  const detailIndex = Number(element?.dataset?.courseDetailIndex);
  if (scope === "personal" && Number.isInteger(detailIndex) && detailIndex >= 0) return state.data.scheduleDetail[detailIndex] || courseAtScopeIndex(scope, index);
  return Number.isInteger(index) ? courseAtScopeIndex(scope, index) : null;
}

const SCHEDULE_COLLISION_STATUS = Object.freeze({
  NONE: "none",
  POSSIBLE: "possible",
  CONFIRMED: "confirmed"
});

function scheduleCollisionResult(status, reason, reasons = [], evidence = {}) {
  return {
    status,
    reason,
    reasons: [...new Set(reasons.filter(Boolean))],
    evidence
  };
}

function scheduleClockRangeFromText(value) {
  const matches = String(value ?? "").match(/\d{1,2}:\d{2}/g) || [];
  const start = matches[0] ? overviewClockMinutes(matches[0]) : null;
  const end = matches[1] ? overviewClockMinutes(matches[1]) : null;
  return {
    start,
    end,
    startText: matches[0] || "",
    endText: matches[1] || "",
    hasStart: start !== null,
    hasEnd: end !== null,
    hasRange: start !== null && end !== null && end > start
  };
}

function campusLabel(code) {
  return normalizeCampusCode(code) === CAMPUS_CODES.HUNNAN ? "浑南校区" : normalizeCampusCode(code) === CAMPUS_CODES.NANHU ? "南湖校区" : "未设置";
}

function campusCodeForScheduleItem(item) {
  const campusText = [item?.location, item?.detail, rawScheduleText(item?.raw)].filter(Boolean).join(" ");
  if (/浑南/.test(campusText)) return CAMPUS_CODES.HUNNAN;
  if (/南湖/.test(campusText)) return CAMPUS_CODES.NANHU;
  return normalizeCampusCode(state.campus.code);
}

function campusPeriodClockRange(item) {
  const section = courseSectionRange(item);
  const campusCode = campusCodeForScheduleItem(item);
  const periods = CAMPUS_PERIOD_TIMES[campusCode];
  const startPeriod = section && periods?.[section.start];
  const endPeriod = section && periods?.[section.end];
  if (!startPeriod || !endPeriod) return null;
  return {
    start: overviewClockMinutes(startPeriod[0]),
    end: overviewClockMinutes(endPeriod[1]),
    startText: startPeriod[0],
    endText: endPeriod[1],
    hasStart: true,
    hasEnd: true,
    hasRange: true,
    source: "campus-period",
    campusCode
  };
}

function localScheduleClockRange(item) {
  const row = item?.source === "local" && item?.localType
    ? item
    : item?.source === "local"
      ? localScheduleItemToCourseRow(item)
      : item;
  const directStart = overviewClockMinutes(row?.startTime);
  const directEnd = overviewClockMinutes(row?.endTime);
  if (directStart !== null || directEnd !== null) {
    return {
      start: directStart,
      end: directEnd,
      startText: row?.startTime || "",
      endText: row?.endTime || "",
      hasStart: directStart !== null,
      hasEnd: directEnd !== null,
      hasRange: directStart !== null && directEnd !== null && directEnd > directStart
    };
  }
  const explicitRange = scheduleClockRangeFromText([row?.time, row?.detail, rawScheduleText(row?.raw)].filter(Boolean).join(" "));
  if (explicitRange.hasStart || explicitRange.hasEnd) return { ...explicitRange, source: "explicit" };
  return campusPeriodClockRange(row) || { ...explicitRange, source: "unknown", campusCode: "" };
}

function courseClockText(course) {
  const range = localScheduleClockRange(course);
  return range.startText && range.endText ? `${range.startText}-${range.endText}` : range.startText || "";
}

function scheduleItemIsEvent(item) {
  return item?.source === "local" && item?.localType === "event";
}

function scheduleItemDate(item) {
  if (!scheduleItemIsEvent(item)) return null;
  return normalizeCalendarDate(item.localDate);
}

function scheduleItemSectionRange(item) {
  return courseSectionRange(item);
}

function scheduleCollisionOccurrenceForDate(item, date) {
  const normalized = normalizeCalendarDate(date);
  if (!normalized) return { status: "unknown", reason: "date-unknown", reasons: ["日期"] };
  const day = courseDayIndex(item);
  if (day < 0) return { status: "unknown", reason: "weekday-unknown", reasons: ["星期"] };
  if (day !== normalized.getDay()) return { status: "none", reason: "weekday-separated", reasons: [] };
  const info = academicDayInfo(normalized);
  const weeks = courseWeekNumbers(item);
  if (info.week === null) return { status: "unknown", reason: "week-unknown", reasons: ["教学周"] };
  if (!weeks.size) return { status: "unknown", reason: "course-weeks-unknown", reasons: ["周次"] };
  if (!weeks.has(info.week)) return { status: "none", reason: "week-separated", reasons: [] };
  return { status: "match", reason: "occurs-on-date", reasons: [] };
}

function scheduleCollisionOccurrence(left, right) {
  const leftEvent = scheduleItemIsEvent(left);
  const rightEvent = scheduleItemIsEvent(right);
  if (leftEvent && rightEvent) {
    const leftDate = scheduleItemDate(left);
    const rightDate = scheduleItemDate(right);
    if (!leftDate || !rightDate) return { status: "unknown", reason: "date-unknown", reasons: ["日期"] };
    return localScheduleDate(leftDate) === localScheduleDate(rightDate)
      ? { status: "match", reason: "same-date", reasons: [] }
      : { status: "none", reason: "date-separated", reasons: [] };
  }
  if (leftEvent || rightEvent) {
    const event = leftEvent ? left : right;
    const recurring = leftEvent ? right : left;
    const eventDate = scheduleItemDate(event);
    if (!eventDate) return { status: "unknown", reason: "date-unknown", reasons: ["日期"] };
    return scheduleCollisionOccurrenceForDate(recurring, eventDate);
  }

  const leftDay = courseDayIndex(left);
  const rightDay = courseDayIndex(right);
  if (leftDay >= 0 && rightDay >= 0 && leftDay !== rightDay) {
    return { status: "none", reason: "weekday-separated", reasons: [] };
  }
  const reasons = [];
  if (leftDay < 0 || rightDay < 0) reasons.push("星期");
  const leftWeeks = courseWeekNumbers(left);
  const rightWeeks = courseWeekNumbers(right);
  if (leftWeeks.size && rightWeeks.size) {
    if (![...leftWeeks].some((week) => rightWeeks.has(week))) {
      return { status: "none", reason: "week-separated", reasons: [] };
    }
  } else {
    reasons.push("周次");
  }
  return reasons.length
    ? { status: "unknown", reason: "recurrence-unknown", reasons }
    : { status: "match", reason: "same-occurrence", reasons: [] };
}

function scheduleCollisionClock(left, right) {
  const leftRange = localScheduleClockRange(left);
  const rightRange = localScheduleClockRange(right);
  const evidence = { left: leftRange, right: rightRange };
  if (leftRange.hasRange && rightRange.hasRange) {
    const overlap = leftRange.start < rightRange.end && rightRange.start < leftRange.end;
    return {
      ...scheduleCollisionResult(
        overlap ? SCHEDULE_COLLISION_STATUS.CONFIRMED : SCHEDULE_COLLISION_STATUS.NONE,
        overlap ? "clock-overlap" : "clock-separated",
        [],
        evidence
      ),
      complete: true
    };
  }
  if (!leftRange.hasStart && !rightRange.hasStart) return null;
  if (leftRange.hasStart && rightRange.hasStart) {
    if (!leftRange.hasRange && !rightRange.hasRange) {
      return {
        ...scheduleCollisionResult(
          leftRange.start === rightRange.start ? SCHEDULE_COLLISION_STATUS.POSSIBLE : SCHEDULE_COLLISION_STATUS.NONE,
          leftRange.start === rightRange.start ? "same-start-time-incomplete" : "start-times-separated",
          leftRange.start === rightRange.start ? ["结束时间"] : [],
          evidence
        ),
        complete: false
      };
    }
    const range = leftRange.hasRange ? leftRange : rightRange;
    const point = leftRange.hasRange ? rightRange.start : leftRange.start;
    if (point < range.start || point >= range.end) {
      return { ...scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, "clock-point-separated", [], evidence), complete: false };
    }
    return { ...scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.POSSIBLE, "clock-incomplete", ["结束时间"], evidence), complete: false };
  }
  return { ...scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.POSSIBLE, "clock-incomplete", ["具体时间"], evidence), complete: false };
}

function scheduleCollisionSections(left, right) {
  const leftRange = scheduleItemSectionRange(left);
  const rightRange = scheduleItemSectionRange(right);
  if (!leftRange || !rightRange) return null;
  const overlap = leftRange.start <= rightRange.end && rightRange.start <= leftRange.end;
  return scheduleCollisionResult(
    overlap ? SCHEDULE_COLLISION_STATUS.CONFIRMED : SCHEDULE_COLLISION_STATUS.NONE,
    overlap ? "section-overlap" : "section-separated",
    [],
    { left: leftRange, right: rightRange }
  );
}

function compareScheduleItemsOverlap(left, right) {
  const leftEvent = scheduleItemIsEvent(left);
  const rightEvent = scheduleItemIsEvent(right);
  if ((leftEvent && left.localAllDay) || (rightEvent && right.localAllDay)) {
    return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, "all-day-event", [], { allDay: true });
  }

  const leftClock = localScheduleClockRange(left);
  const rightClock = localScheduleClockRange(right);
  const leftDateOnly = leftEvent && !leftClock.hasStart && !scheduleItemSectionRange(left);
  const rightDateOnly = rightEvent && !rightClock.hasStart && !scheduleItemSectionRange(right);
  if (leftDateOnly || rightDateOnly) {
    return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, "date-only-no-occupancy", [], {
      leftDateOnly,
      rightDateOnly
    });
  }

  const occurrence = scheduleCollisionOccurrence(left, right);
  const evidence = { occurrence };
  if (occurrence.status === "none") {
    return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, occurrence.reason, occurrence.reasons, evidence);
  }

  const completeClock = leftClock.hasRange && rightClock.hasRange;
  const clock = scheduleCollisionClock(left, right);
  if (clock) evidence.clock = clock.evidence;

  // 两边都有完整时钟时，时钟是最终依据，不能再被节次覆盖。
  if (completeClock) {
    if (clock.status === SCHEDULE_COLLISION_STATUS.NONE) {
      return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, clock.reason, [], evidence);
    }
    if (occurrence.status === "match") {
      return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.CONFIRMED, clock.reason, [], evidence);
    }
    return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.POSSIBLE, "occurrence-unknown", occurrence.reasons, evidence);
  }

  // 没有两边完整时钟时，节次才作为 fallback；缺节次不能直接制造 overlap。
  const sections = scheduleCollisionSections(left, right);
  if (sections) {
    evidence.section = sections.evidence;
    if (sections.status === SCHEDULE_COLLISION_STATUS.NONE) {
      return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, sections.reason, [], evidence);
    }
    if (occurrence.status === "match") {
      return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.CONFIRMED, sections.reason, [], evidence);
    }
    return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.POSSIBLE, "occurrence-unknown", occurrence.reasons, evidence);
  }

  if (clock) {
    if (clock.status === SCHEDULE_COLLISION_STATUS.NONE) {
      return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.NONE, clock.reason, [], evidence);
    }
    return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.POSSIBLE, clock.reason, [...occurrence.reasons, ...clock.reasons], evidence);
  }

  return scheduleCollisionResult(SCHEDULE_COLLISION_STATUS.POSSIBLE, "time-unknown", [...occurrence.reasons, "具体时间或节次"], evidence);
}

function compareCourseScheduleOverlap(left, right) {
  return compareScheduleItemsOverlap(left, right);
}

function filterCoursesForDate(rows, date) {
  const normalizedDate = localDateOnly(date);
  const info = academicDayInfo(normalizedDate);
  return (rows || [])
    .filter((course) => {
      if (scheduleItemIsEvent(course)) return course.localDate === localScheduleDate(normalizedDate);
      if (info.week === null) return false;
      if (courseDayIndex(course) !== info.weekdayIndex) return false;
      const weeks = courseWeekNumbers(course);
      return !weeks.size || weeks.has(info.week);
    })
    .filter((course) => {
      if (course?.source !== "local") return true;
      const item = (state.localSchedule.items || []).find((candidate) => candidate.id === course.localId);
      if (!item) return true;
      if (item.excludedDates?.includes(localScheduleDate(normalizedDate))) return false;
      const week = info.week;
      return !Number.isInteger(week) || !item.excludedWeeks?.includes(week);
    })
    .sort((left, right) => {
      const leftClock = localScheduleClockRange(left).start;
      const rightClock = localScheduleClockRange(right).start;
      return (leftClock ?? 9999) - (rightClock ?? 9999)
        || (courseSectionRange(left)?.start || 99) - (courseSectionRange(right)?.start || 99)
        || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
    });
}

function overviewTodayCourses(rows, date = new Date()) {
  return filterCoursesForDate(rows, date);
}

function overviewNextCourse(rows, date = new Date()) {
  const todayRows = overviewTodayCourses(rows, date);
  const todayInfo = academicDayInfo(date);
  const hasRecurringTodayCandidate = todayInfo.week === null && (rows || []).some((course) => !scheduleItemIsEvent(course) && courseDayIndex(course) === todayInfo.weekdayIndex);
  if (!todayRows.length && hasRecurringTodayCandidate) {
    return { course: null, state: "unknown", tomorrow: null };
  }
  const now = date.getHours() * 60 + date.getMinutes();
  const nonAllDayRows = todayRows.filter((course) => !course.localAllDay);
  const timedRows = nonAllDayRows.filter((course) => {
    const range = localScheduleClockRange(course);
    return range.start !== null || range.end !== null;
  });
  const untimedRows = nonAllDayRows.filter((course) => {
    const range = localScheduleClockRange(course);
    return range.start === null && range.end === null;
  });
  if (untimedRows.length) return { course: untimedRows[0], state: "time-unknown", untimedCount: untimedRows.length };
  const active = timedRows.find((course) => {
    const range = localScheduleClockRange(course);
    return range.start !== null && range.end !== null && now >= range.start && now < range.end;
  });
  if (active) return { course: active, state: "active", elapsed: now - localScheduleClockRange(active).start };
  const upcoming = timedRows.find((course) => {
    const start = localScheduleClockRange(course).start;
    return start !== null && start >= now;
  });
  if (upcoming) return { course: upcoming, state: "next", until: localScheduleClockRange(upcoming).start - now };
  const started = timedRows.find((course) => localScheduleClockRange(course).start !== null && localScheduleClockRange(course).start < now && localScheduleClockRange(course).end === null);
  if (started) return { course: started, state: "started", elapsed: now - localScheduleClockRange(started).start };
  const allDayRows = todayRows.filter((course) => course.localAllDay);
  if (allDayRows.length) return { course: allDayRows[0], state: "all-day", allDayCount: allDayRows.length };
  const tomorrow = overviewTodayCourses(rows, addCalendarDays(date, 1));
  if (todayRows.length) return { course: null, state: "ended", tomorrow: tomorrow[0] || null };
  if (tomorrow.length) return { course: null, state: "none", tomorrow: tomorrow[0] };
  return { course: null, state: "none", tomorrow: null };
}

function courseIndexForScope(course, scope = "personal") {
  if (scope === "all-detail") return (state.allDetail?.courses || []).indexOf(course);
  if (scope === "all") return state.allRows.indexOf(course?.raw || course);
  return Number.isInteger(course?.sourceCourseIndex) && course.sourceCourseIndex >= 0
    ? course.sourceCourseIndex
    : state.data.courses.indexOf(course);
}

function courseActionAttributes(course, scope = "personal") {
  if (course?.source === "local" && course.localId) {
    return `type="button" data-action="show-local-schedule" data-course-source="local" data-local-schedule-id="${escapeHtml(course.localId)}"`;
  }
  const index = courseIndexForScope(course, scope);
  const detailIndex = scope === "personal"
    ? Number.isInteger(course?.sourceDetailIndex) ? course.sourceDetailIndex : state.data.scheduleDetail.indexOf(course)
    : -1;
  if (index < 0 && detailIndex < 0) return "";
  const sourceIndex = index >= 0 ? index : course.sourceCourseIndex;
  return `type="button" data-action="show-course" data-course-scope="${scope}" data-course-index="${sourceIndex}"${detailIndex >= 0 ? ` data-course-detail-index="${detailIndex}"` : ""}`;
}

function courseDataAttributes(course, scope = "personal") {
  if (course?.source === "local" && course.localId) return `data-course-source="local" data-local-schedule-id="${escapeHtml(course.localId)}"`;
  const index = courseIndexForScope(course, scope);
  const detailIndex = scope === "personal"
    ? Number.isInteger(course?.sourceDetailIndex) ? course.sourceDetailIndex : state.data.scheduleDetail.indexOf(course)
    : -1;
  if (index < 0 && detailIndex < 0) return "";
  const sourceIndex = index >= 0 ? index : course.sourceCourseIndex;
  return `data-action="show-course" data-course-scope="${scope}" data-course-index="${sourceIndex}"${detailIndex >= 0 ? ` data-course-detail-index="${detailIndex}"` : ""}`;
}

const COURSE_OUTLINE_SECTION_DEFINITIONS = Object.freeze([
  { title: "基本信息", endpoint: "cxkcxxx.do", hint: "课程编号、名称、学分、学时及原系统课程属性" },
  { title: "课程简介", endpoint: "cxkcjcxx.do", hint: "课程中文简介与英文简介" },
  { title: "课程目标", endpoint: "cxkcmbxx.do", hint: "课程目标与目标文本" },
  { title: "毕业要求支撑", endpoint: "kcmbybyzccx.do", hint: "毕业要求、支撑程度和权重" },
  { title: "教学安排", endpoint: "cxkcmbhnrdgx.do", hint: "章节、教学内容、学时与教学方法" },
  { title: "课程成绩评定方法", endpoint: "cxkccjpdff.do", hint: "课程总评成绩的组成、评定方法及各环节比例", forceReadable: true, supplementalLabel: "成绩评定信息" },
  { title: "考核形式", endpoint: "cxkhxs.do", hint: "考核形式字典与顺序" },
  { title: "目标考核关系", endpoint: "cxkhxscjzb.do", hint: "课程目标与考核环节的对应关系" },
  { title: "达成标准", endpoint: "cxkcmbdcbz.do", hint: "课程目标达成标准与评价标准" },
  { title: "成绩评定", endpoint: "cxkhhjsz.do", hint: "考核环节、目标权重和成绩计算信息" },
  { title: "教材参考 / 先修", endpoint: "cxkcdgxx.do", hint: "适用专业、先修课程、参考资料和其他课程信息", forceReadable: true, supplementalLabel: "教材参考信息" },
  { title: "质量改进", endpoint: "cxkczlpjhgjjz.do", hint: "课程质量评价与持续改进记录" },
  { title: "编制信息", endpoint: "cxzbrxgxx.do", hint: "制订、审核、批准与日期" },
  { title: "附件", endpoint: "cxkcdgfj.do", hint: "原系统返回的附件字段；不猜测下载地址" }
]);

// 原系统课程大纲接口使用的是 EMAP 内部字段名。它们适合传输和导出，
// 但不适合直接给普通用户阅读。详情页只在“易读信息”层使用中文标签；
// 原始字段名和完整值仍保留在下方的系统信息/原始数据折叠区中。
const COURSE_OUTLINE_FIELD_LABELS = Object.freeze({
  WID: "记录标识",
  BBWID: "大纲版本",
  XNXQDM: "适用学期",
  KCH: "课程号",
  KCHM: "课程号",
  KCDM: "课程号",
  KCM: "课程名称",
  KCMC: "课程名称",
  KKDWDM: "开课单位（代码）",
  KKDWDM_DISPLAY: "开课单位",
  KKDWMC: "开课单位",
  KCCCDM: "课程层次（代码）",
  KCCCDM_DISPLAY: "课程层次",
  KCCCMC: "课程层次",
  KCJBDM: "课程级别（代码）",
  KCJBDM_DISPLAY: "课程级别",
  KCJBMC: "课程级别",
  KCLBDM: "课程类别（代码）",
  KCLBDM_DISPLAY: "课程类别",
  KCLBMC: "课程类别",
  KCXZDM: "课程性质（代码）",
  KCXZDM_DISPLAY: "课程性质",
  KCXZMC: "课程性质",
  KCFL1_DISPLAY: "课程分类",
  KCF1_DISPLAY: "课程分类",
  KCFDL_DISPLAY: "课程分类",
  SYZY: "适用专业",
  SFXYJC_DISPLAY: "是否需要先修课程",
  SFXYJC: "是否需要先修课程（代码）",
  XKKC: "先修课程",
  XXK: "先修课程",
  CKSJJXZY: "参考书籍及资料",
  CKSJXZY: "参考书籍及资料",
  QTSM: "其他说明",
  KSLXDM: "考核方式（代码）",
  KSLXDM_DISPLAY: "考核方式",
  KSLXMC: "考核方式",
  KSFS_DISPLAY: "考核方式",
  KSFSMC: "考核方式",
  XF: "学分",
  XS: "总学时",
  SYXS: "实验学时",
  SJXS: "实践学时",
  SJIXS: "实践学时",
  KTJSXS: "课堂教学学时",
  TLXS: "讨论学时",
  JYKKXQ: "建议开课学期",
  SKJS: "授课教师",
  SKJS_DISPLAY: "授课教师",
  JASMC: "上课地点",
  JASMC_DISPLAY: "上课地点",
  JXBID: "教学班标识",
  JXBMC: "教学班名称",
  KCJJ: "课程简介",
  KCDG: "课程大纲",
  KCMB: "课程目标",
  KCMBBZ: "课程目标标准",
  QZCJ: "期中成绩",
  QMCJ: "期末成绩",
  PSCJ: "平时成绩",
  SYCJ: "实验成绩",
  SJCJ: "实践成绩",
  CJUEFS: "成绩评定方式",
  QTCJ20: "其他成绩（20%）",
  KCCJPDFF: "课程成绩评定方法",
  KCCJPDFF_DISPLAY: "课程成绩评定方法",
  CJPDFF: "成绩评定方法",
  CJPDFF_DISPLAY: "成绩评定方法",
  SFWHCJGC: "文化基础课程",
  KSSJ: "考试时间",
  KSSJ_DISPLAY: "考试时间",
  FZR: "课程负责人",
  FZRMC: "课程负责人",
  ZBR: "制订人",
  SHR: "审核人",
  PZR: "批准人",
  ZBRQ: "制订日期",
  SHRQ: "审核日期",
  PZRQ: "批准日期"
});

const COURSE_OUTLINE_TECHNICAL_FIELD_KEYS = new Set([
  "WID", "BBWID", "XNXQDM", "KKDWDM", "KCCCDM", "KCJBDM", "KCLBDM", "KCXZDM",
  "KSLXDM", "JXBID", "KCFDM"
]);

function courseOutlineValueIsEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function courseOutlineFieldBaseKey(key) {
  return String(key || "").replace(/(?:_DISPLAY|_TEXT|_LABEL|_NAME|MC)$/i, "");
}

function courseOutlineHasReadableAlias(record, key) {
  if (!record || typeof record !== "object") return false;
  const base = courseOutlineFieldBaseKey(key);
  const aliases = [
    `${base}_DISPLAY`, `${base}_TEXT`, `${base}_LABEL`, `${base}_NAME`, `${base}MC`, `${base}MC_DISPLAY`
  ];
  return aliases.some((alias) => alias !== key && !courseOutlineValueIsEmpty(record[alias]));
}

function courseOutlineFieldLabel(key) {
  const normalizedKey = String(key || "").trim();
  if (COURSE_OUTLINE_FIELD_LABELS[normalizedKey]) return COURSE_OUTLINE_FIELD_LABELS[normalizedKey];
  const base = courseOutlineFieldBaseKey(normalizedKey);
  if (COURSE_OUTLINE_FIELD_LABELS[base]) return COURSE_OUTLINE_FIELD_LABELS[base];
  // 少数部署会直接返回中文字段名；这种情况无需再翻译。
  if (/[\u3400-\u9fff]/.test(normalizedKey)) return normalizedKey;
  return "补充信息";
}

function courseOutlineIsTechnicalField(key, record) {
  const normalizedKey = String(key || "").trim();
  if (courseOutlineHasReadableAlias(record, normalizedKey)) return false;
  if (COURSE_OUTLINE_TECHNICAL_FIELD_KEYS.has(normalizedKey)) return true;
  // 不认识的新字段也不要把类似 XXXXXXDM / XXXXXXID 的内部代码直接铺在主界面。
  return /(?:DM|ID|UUID|WID)$/i.test(normalizedKey) && !["KCH", "KCHM", "KCDM"].includes(normalizedKey);
}

function courseOutlineShapeLabel(shape) {
  return ({
    paged: "分页列表",
    rows: "列表",
    array: "列表",
    object: "单条信息",
    empty: "暂无内容",
    unknown: "原始响应"
  })[shape] || "已读取";
}

function courseOutlinePayloadFromResponse(response) {
  const data = response?.data ?? response;
  const payload = data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "payload")
    ? data.payload
    : data;
  if (payload === undefined || payload === null) return payload ?? null;
  // BH_UTILS 在不同版本的教务前端里既可能返回已解析对象，也可能返回
  // JSON 文本。先尝试解析文本，避免列表被当成一个没有 KCH/KCM 字段的
  // “未知对象”；解析失败时保留原字符串，原始数据仍可在详情导出中看到。
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return payload;
    try { return JSON.parse(text); } catch { return payload; }
  }
  return payload;
}

// 保留旧测试/调用方的纯解析名称；课程大纲正常请求不再依赖 runtime 消息。
function courseOutlinePayloadFromRuntimeResponse(response) {
  return courseOutlinePayloadFromResponse(response);
}

function courseOutlineBusinessError(payload) {
  const normalizedPayload = courseOutlinePayloadFromResponse(payload);
  if (!normalizedPayload || typeof normalizedPayload !== "object" || Array.isArray(normalizedPayload)) return "";
  if (isAuthenticationPayload(normalizedPayload)) return "教务系统登录已失效";
  const code = normalizedPayload.code ?? normalizedPayload.status ?? normalizedPayload.errCode ?? normalizedPayload.errorCode;
  const codeText = String(code ?? "").trim().toLowerCase();
  if (["401", "403"].includes(codeText)) return String(normalizedPayload.message || normalizedPayload.msg || "教务系统登录已失效");
  if (codeText && !["0", "200", "ok", "success"].includes(codeText)) {
    return String(normalizedPayload.message || normalizedPayload.msg || normalizedPayload.errorMessage || `教务系统返回失败状态（${codeText}）`);
  }
  if (normalizedPayload.success === false || normalizedPayload.ok === false || normalizedPayload.error === true) {
    return String(normalizedPayload.message || normalizedPayload.msg || normalizedPayload.errorMessage || "教务系统返回了失败状态");
  }
  return "";
}

function courseOutlineErrorFromPayload(payload) {
  const message = courseOutlineBusinessError(payload);
  if (!message) return null;
  const normalizedPayload = courseOutlinePayloadFromResponse(payload);
  const error = new ApiError(message, "课程大纲业务响应失败", 0, { retryable: false });
  if (isAuthenticationPayload(normalizedPayload)) error.authFailure = true;
  return error;
}

function courseOutlineDetailStateFrom(row) {
  const endpoints = {};
  COURSE_OUTLINE_DETAIL_ENDPOINTS.forEach((endpoint) => {
    endpoints[endpoint] = {
      endpoint,
      path: courseOutlineEndpointPath(endpoint),
      status: "loading",
      shape: "empty",
      raw: null,
      records: [],
      error: "",
      startedAt: "",
      finishedAt: "",
      durationMs: 0
    };
  });
  return {
    key: courseOutlineKey(row),
    row,
    endpoints,
    loading: true,
    error: "",
    requestSequence: 0,
    startedAt: new Date().toISOString(),
    finishedAt: ""
  };
}

function setCourseOutlineTransportState(status, message = "", error = "") {
  state.courseOutline.bootstrap = {
    ...state.courseOutline.bootstrap,
    status,
    message,
    error
  };
}

function isCourseOutlineLoginError(error) {
  return Boolean(error?.authFailure)
    || [401, 403].includes(Number(error?.status))
    || /登录失效|请先登录|认证页面重定向/i.test(String(error?.message || ""));
}

function courseOutlineTransportStatusLabel(status = state.courseOutline.bootstrap?.status) {
  if (status === "ready") return "已连接";
  if (status === "login-required") return "登录失效";
  return "使用浏览器登录会话";
}

function courseOutlinePayloadOrThrow(response, fallbackMessage = "教务系统没有返回课程大纲数据") {
  const payload = courseOutlinePayloadFromResponse(response);
  const businessError = courseOutlineErrorFromPayload(payload);
  if (businessError) throw businessError;
  if (payload === undefined || payload === null) throw new ApiError(fallbackMessage);
  return payload;
}

async function readCourseOutlineDirect(path, body = {}, options = {}) {
  const response = await postCourseOutline(path, body, options);
  try {
    return {
      payload: courseOutlinePayloadOrThrow(response),
      rawResponse: response
    };
  } catch (error) {
    // Preserve a valid business-error envelope as well. Transport failures
    // happen before a response exists and are handled by requestJsonOnce.
    error.rawResponse = response;
    throw error;
  }
}

async function courseOutlineMapWithConcurrency(items, limit, mapper) {
  const values = Array.isArray(items) ? items : [];
  const results = new Array(values.length);
  const workerCount = Math.min(Math.max(1, Number(limit) || 1), values.length);
  let nextIndex = 0;
  const consume = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      try {
        results[index] = { status: "fulfilled", value: await mapper(values[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}

async function loadCourseOutlineMetadata(options = {}) {
  if (IS_ANDROID_APP) return false;
  const metadata = state.courseOutline.metadata;
  if (metadata.loading || metadata.loaded && !options.force) return metadata.loaded;
  metadata.loading = true;
  metadata.error = "";
  try {
    // 两种接口实现都接受 JSON 查询开关；*json 是原系统请求组件的
    // 形式，URL 构造器会在其后安全追加 WebVPN marker。
    const response = await getCourseOutline(COURSE_OUTLINE_METADATA_PATH, { "*json": 1 }, { timeoutMs: options.timeoutMs || 8000 });
    const normalized = courseOutlinePayloadOrThrow(response, "课程大纲元数据为空");
    const codePaths = courseOutlineCodePathsFromMetadata(normalized);
    const settled = await courseOutlineMapWithConcurrency(codePaths, 4, async (path) => {
      try {
        const dictionaryResponse = await getCourseOutline(path, {}, { timeoutMs: options.dictionaryTimeoutMs || 8000 });
        return {
          path,
          status: "success",
          payload: courseOutlinePayloadOrThrow(dictionaryResponse, "筛选字典为空"),
          rawResponse: dictionaryResponse,
          error: ""
        };
      } catch (error) {
        return {
          path,
          status: "failed",
          payload: null,
          rawResponse: error?.rawResponse ?? null,
          error: error?.message || "筛选字典读取失败"
        };
      }
    });
    const endpoints = {};
    settled.forEach((item, index) => {
      const path = codePaths[index];
      endpoints[path] = item.status === "fulfilled"
        ? item.value
        : {
          path,
          status: "failed",
          payload: null,
          rawResponse: item.reason?.rawResponse ?? null,
          error: item.reason?.message || "筛选字典读取失败"
        };
    });
    metadata.loaded = true;
    metadata.loading = false;
    metadata.error = "";
    metadata.rawResponse = response;
    metadata.endpoints = endpoints;
    metadata.codePaths = codePaths;
    return true;
  } catch (error) {
    metadata.loading = false;
    metadata.loaded = false;
    metadata.error = error?.message || "课程大纲元数据读取失败";
    if (isCourseOutlineLoginError(error)) setCourseOutlineTransportState("login-required", "登录失效", metadata.error);
    return false;
  }
}

async function loadCourseOutlineList(options = {}) {
  if (IS_ANDROID_APP) return false;
  const list = state.courseOutline.list;
  if (list.loading && !options.force) return false;
  const requestId = ++list.requestSequence;
  const filters = { ...list.filters, ...(options.filters || {}) };
  const pageNumber = Math.max(1, Number(options.pageNumber || list.pageNumber) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || list.pageSize) || 10));
  list.filters = filters;
  list.pageNumber = pageNumber;
  list.pageSize = pageSize;
  list.loading = true;
  list.error = "";
  setCourseOutlineTransportState("connecting", "使用浏览器登录会话", "");
  if (state.view === "course-outline") render();
  try {
    const response = await readCourseOutlineDirect(
      COURSE_OUTLINE_LIST_PATH,
      courseOutlineListBody(filters, pageNumber, pageSize),
      { timeoutMs: options.timeoutMs || COURSE_OUTLINE_REQUEST_TIMEOUT }
    );
    if (!courseOutlineRequestIsCurrent(requestId, list.requestSequence)) return false;
    const normalized = normalizeCourseOutlineEndpointPayload(response.payload, COURSE_OUTLINE_LIST_PATH);
    list.rows = normalized.records;
    list.totalSize = normalized.totalSize || normalized.records.length;
    list.rawResponse = response.rawResponse;
    list.loaded = true;
    list.loading = false;
    list.error = "";
    setCourseOutlineTransportState("ready", "已连接", "");
    if (state.view === "course-outline") render();
    return true;
  } catch (error) {
    if (!courseOutlineRequestIsCurrent(requestId, list.requestSequence)) return false;
    list.loading = false;
    list.loaded = true;
    list.error = error?.message || "课程大纲列表读取失败";
    list.rawResponse = error?.rawResponse ?? list.rawResponse;
    setCourseOutlineTransportState(
      isCourseOutlineLoginError(error) ? "login-required" : "failed",
      isCourseOutlineLoginError(error) ? "登录失效" : "使用浏览器登录会话",
      list.error
    );
    if (state.view === "course-outline") render();
    return false;
  }
}

function captureCourseOutlineFilters() {
  const list = state.courseOutline.list;
  const ids = { code: "outlineFilterCode", name: "outlineFilterName", unit: "outlineFilterUnit", level: "outlineFilterLevel", grade: "outlineFilterGrade" };
  Object.entries(ids).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (input) list.filters[key] = input.value;
  });
  return { ...list.filters };
}

function searchCourseOutline() {
  const filters = captureCourseOutlineFilters();
  return loadCourseOutlineList({ filters, pageNumber: 1, force: true });
}

async function loadCourseOutlineDetail(row) {
  if (IS_ANDROID_APP || !row || typeof row !== "object") return false;
  const detail = courseOutlineDetailStateFrom(row);
  const requestId = ++courseOutlineDetailRequestSequence;
  detail.requestSequence = requestId;
  state.courseOutline.detail = detail;
  state.view = "course-outline";
  setCourseOutlineTransportState("connecting", "使用浏览器登录会话", "");
  render();
  const settled = await courseOutlineMapWithConcurrency(COURSE_OUTLINE_DETAIL_ENDPOINTS, COURSE_OUTLINE_DETAIL_CONCURRENCY, async (endpoint) => {
    const startedAt = new Date().toISOString();
    try {
      const response = await readCourseOutlineDirect(endpoint, courseOutlineDetailBody(row), { timeoutMs: COURSE_OUTLINE_REQUEST_TIMEOUT });
      return { endpoint, payload: response.payload, rawResponse: response.rawResponse, startedAt };
    } catch (error) {
      return { endpoint, error, rawResponse: error?.rawResponse ?? null, startedAt };
    }
  });
  if (state.courseOutline.detail !== detail || !courseOutlineRequestIsCurrent(requestId, courseOutlineDetailRequestSequence)) return false;
  let hasSuccess = false;
  let hasLoginFailure = false;
  settled.forEach((settledResult, index) => {
    const endpoint = COURSE_OUTLINE_DETAIL_ENDPOINTS[index];
    const item = settledResult.status === "fulfilled"
      ? settledResult.value
      : {
        endpoint,
        error: settledResult.reason,
        rawResponse: settledResult.reason?.rawResponse ?? null,
        startedAt: new Date().toISOString()
      };
    if (item.error) {
      hasLoginFailure ||= isCourseOutlineLoginError(item.error);
      detail.endpoints[endpoint] = courseOutlineEndpointResult(endpoint, item.payload ?? null, {
        raw: item.rawResponse,
        status: "failed",
        error: item.error?.message || String(item.error || "课程章节读取失败"),
        startedAt: item.startedAt,
        finishedAt: new Date().toISOString()
      });
    } else {
      hasSuccess = true;
      detail.endpoints[endpoint] = courseOutlineEndpointResult(endpoint, item.payload, {
        raw: item.rawResponse,
        status: "success",
        startedAt: item.startedAt,
        finishedAt: new Date().toISOString()
      });
    }
  });
  detail.loading = false;
  detail.finishedAt = new Date().toISOString();
  if (hasLoginFailure) setCourseOutlineTransportState("login-required", "登录失效", "课程大纲接口返回登录失效");
  else if (hasSuccess) setCourseOutlineTransportState("ready", "已连接", "");
  else setCourseOutlineTransportState("failed", "使用浏览器登录会话", "课程大纲章节读取失败");
  render();
  return true;
}

async function retryCourseOutlineEndpoint(endpoint) {
  const detail = state.courseOutline.detail;
  if (!detail || !COURSE_OUTLINE_DETAIL_ENDPOINTS.includes(endpoint) || detail.loading && detail.endpoints[endpoint]?.status === "loading") return false;
  const requestId = ++courseOutlineDetailRequestSequence;
  const previous = detail.endpoints[endpoint] || {};
  detail.requestSequence = requestId;
  detail.endpoints[endpoint] = { ...previous, endpoint, path: courseOutlineEndpointPath(endpoint), status: "loading", error: "", startedAt: new Date().toISOString() };
  setCourseOutlineTransportState("connecting", "使用浏览器登录会话", "");
  render();
  try {
    const startedAt = detail.endpoints[endpoint].startedAt;
    const response = await readCourseOutlineDirect(endpoint, courseOutlineDetailBody(detail.row), { timeoutMs: COURSE_OUTLINE_REQUEST_TIMEOUT });
    if (state.courseOutline.detail !== detail || !courseOutlineRequestIsCurrent(requestId, courseOutlineDetailRequestSequence)) return false;
    detail.endpoints[endpoint] = courseOutlineEndpointResult(endpoint, response.payload, {
      raw: response.rawResponse,
      status: "success",
      error: "",
      startedAt,
      finishedAt: new Date().toISOString()
    });
    setCourseOutlineTransportState("ready", "已连接", "");
  } catch (error) {
    if (state.courseOutline.detail !== detail || !courseOutlineRequestIsCurrent(requestId, courseOutlineDetailRequestSequence)) return false;
    detail.endpoints[endpoint] = courseOutlineEndpointResult(endpoint, previous.raw ?? null, {
      raw: error?.rawResponse ?? previous.raw ?? null,
      status: "failed",
      error: error?.message || "课程章节读取失败",
      startedAt: detail.endpoints[endpoint].startedAt,
      finishedAt: new Date().toISOString()
    });
    setCourseOutlineTransportState(
      isCourseOutlineLoginError(error) ? "login-required" : "failed",
      isCourseOutlineLoginError(error) ? "登录失效" : "使用浏览器登录会话",
      error?.message || "课程章节读取失败"
    );
  }
  render();
  return true;
}

function courseOutlineDisplayValue(row, keys, fallback = "") {
  return courseOutlineFirstValue(row, keys) ?? fallback;
}

function courseOutlineText(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function courseOutlineValueMarkup(value) {
  const text = courseOutlineText(value);
  const className = value && typeof value === "object" ? "course-outline-value-text is-structured" : "course-outline-value-text";
  return `<div class="${className}">${escapeHtml(text)}</div>`;
}

function courseOutlineFieldMarkup(label, value, options = {}) {
  const source = options.showSource && options.source
    ? `<small class="course-outline-field-source">原系统字段：${escapeHtml(options.source)}</small>`
    : "";
  return `<div class="course-outline-field${options.className ? ` ${options.className}` : ""}"><span>${escapeHtml(label)}</span><div class="course-outline-field-content">${courseOutlineValueMarkup(value)}${source}</div></div>`;
}

function renderCourseOutlineRecord(record, options = {}) {
  if (!record || typeof record !== "object") return `<div class="course-outline-value"><pre>${escapeHtml(courseOutlineText(record))}</pre></div>`;
  const entries = Object.entries(record);
  if (!entries.length) return `<div class="course-outline-empty">原系统返回了空对象。</div>`;
  const forceReadable = options.forceReadable === true;
  const supplementalLabel = String(options.supplementalLabel || "补充信息");
  const readable = [];
  const supplemental = [];
  const technical = [];
  const empty = [];
  entries.forEach(([key, value]) => {
    if (courseOutlineValueIsEmpty(value)) {
      empty.push([key, value]);
      return;
    }
    if (!forceReadable && courseOutlineIsTechnicalField(key, record)) {
      technical.push([key, value]);
      return;
    }
    const label = courseOutlineFieldLabel(key);
    if (label === "补充信息") supplemental.push([key, value]);
    else readable.push([label, value, key]);
  });

  const readableMarkup = readable.map(([label, value]) => courseOutlineFieldMarkup(label, value)).join("");
  const supplementalMarkup = supplemental.length
    ? forceReadable
      ? `<div class="course-outline-record course-outline-readable-supplemental">${supplemental.map(([key, value], index) => courseOutlineFieldMarkup(`${supplementalLabel} ${index + 1}`, value, { source: key, showSource: false, className: "is-supplemental" })).join("")}</div>`
      : `<details class="course-outline-more-fields"><summary>补充信息（${supplemental.length} 项）</summary><div class="course-outline-record">${supplemental.map(([key, value], index) => courseOutlineFieldMarkup(`补充信息 ${index + 1}`, value, { source: key, showSource: true, className: "is-supplemental" })).join("")}</div></details>`
    : "";
  const technicalMarkup = technical.length
    ? `<details class="course-outline-more-fields course-outline-technical-fields"><summary>系统信息（${technical.length} 项）</summary><p class="course-outline-more-fields-hint">这些是教务系统内部编码，通常不影响阅读；需要核对原系统数据时可展开查看。</p><div class="course-outline-record">${technical.map(([key, value]) => courseOutlineFieldMarkup(courseOutlineFieldLabel(key), value, { source: key, showSource: true, className: "is-technical" })).join("")}</div></details>`
    : "";
  const emptyMarkup = empty.length
    ? `<details class="course-outline-more-fields course-outline-empty-fields"><summary>未填写信息（${empty.length} 项）</summary><div class="course-outline-record">${empty.map(([key]) => courseOutlineFieldMarkup(courseOutlineFieldLabel(key), "未提供", { source: key, showSource: true, className: "is-empty" })).join("")}</div></details>`
    : "";
  return `<div class="course-outline-record course-outline-readable-record">${readableMarkup || (!supplemental.length && !technical.length ? `<div class="course-outline-empty">原系统没有提供可显示的课程信息。</div>` : "")}</div>${supplementalMarkup}${technicalMarkup}${emptyMarkup}`;
}

function renderCourseOutlineSection(definition, detail) {
  const result = detail?.endpoints?.[definition.endpoint];
  if (!result || result.status === "loading") return `<section class="course-outline-section panel"><div class="course-outline-section-head"><div><h3>${escapeHtml(definition.title)}</h3><small>${escapeHtml(definition.hint)}</small></div><span class="course-outline-section-status is-loading">读取中</span></div><div class="course-outline-placeholder">正在读取原系统数据…</div></section>`;
  if (result.status === "failed") {
    return `<section class="course-outline-section panel is-failed"><div class="course-outline-section-head"><div><h3>${escapeHtml(definition.title)}</h3><small>${escapeHtml(definition.hint)}</small></div><span class="course-outline-section-status is-failed">读取失败</span></div><div class="course-outline-error"><strong>${escapeHtml(result.error || "原系统未返回此章节")}</strong><button class="button button-ghost button-small" type="button" data-action="retry-course-outline-endpoint" data-outline-endpoint="${escapeHtml(definition.endpoint)}">重试此章节</button></div>${result.raw !== null && result.raw !== undefined ? renderCourseOutlineRecord(result.raw) : ""}</section>`;
  }
  const content = result.records?.length
    ? result.records.map((record) => renderCourseOutlineRecord(record, definition)).join("")
    : `<div class="course-outline-placeholder">原系统未提供此项</div>`;
  return `<section class="course-outline-section panel"><div class="course-outline-section-head"><div><h3>${escapeHtml(definition.title)}</h3><small>${escapeHtml(definition.hint)}</small></div><span class="course-outline-section-status">${escapeHtml(`${courseOutlineShapeLabel(result.shape)} · ${result.records?.length || 0} 项`)}</span></div>${content}</section>`;
}

function courseOutlineJsonText(detail = state.courseOutline.detail) {
  return JSON.stringify(courseOutlineExportDocument(detail || {}), null, 2);
}

async function copyCourseOutline() {
  try {
    const text = courseOutlineJsonText();
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("浏览器拒绝复制");
      textarea.remove();
    }
    setNotice("完整课程大纲 JSON 已复制。", "success");
  } catch (error) {
    setNotice(`复制课程大纲失败：${error?.message || "请重试"}`, "error");
  }
}

function courseOutlineFileName(detail = state.courseOutline.detail) {
  const row = detail?.row || {};
  const name = courseOutlineText(courseOutlineDisplayValue(row, ["KCM", "KCMC", "name"], "课程大纲"))
    .replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "课程大纲";
  return `${name}-${String(courseOutlineDisplayValue(row, ["KCH", "courseCode", "code"], "course")).replace(/[^\w-]+/g, "-")}.json`;
}

function downloadCourseOutline() {
  try {
    const blob = new Blob([courseOutlineJsonText()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = courseOutlineFileName();
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice("完整课程大纲 JSON 已下载。", "success");
  } catch (error) {
    setNotice(`下载课程大纲失败：${error?.message || "请重试"}`, "error");
  }
}

async function openCourseOutlineOriginal() {
  if (IS_ANDROID_APP) return;
  try {
    const response = await runtimeMessageWithTimeout(
      { type: "open-course-outline-portal" },
      30000,
      "打开原系统课程大纲超时"
    );
    if (!response?.ok && response?.status !== "login-required") throw new ApiError(response?.error || "无法打开原系统课程大纲");
    setNotice(response?.status === "login-required" ? "请先在原系统完成登录。" : "已打开原系统课程大纲页面。", response?.status === "login-required" ? "error" : "success");
  } catch (error) {
    setNotice(error?.message || "无法打开原系统课程大纲", "error");
  }
}

function renderCourseOutlineList() {
  const list = state.courseOutline.list;
  const filters = list.filters;
  const filterMarkup = [
    ["code", "课程代码", "如 A1502000016", "outlineFilterCode"],
    ["name", "课程名称", "支持名称关键字", "outlineFilterName"],
    ["unit", "开课单位", "单位代码或名称", "outlineFilterUnit"],
    ["level", "课程层次", "如 本科", "outlineFilterLevel"],
    ["grade", "课程级别", "如 基础 / 核心", "outlineFilterGrade"]
  ].map(([key, label, placeholder, id]) => `<label class="course-outline-filter"><span>${escapeHtml(label)}</span><input id="${id}" data-outline-filter="${key}" value="${escapeHtml(filters[key] || "")}" placeholder="${escapeHtml(placeholder)}" /></label>`).join("");
  const rows = list.rows || [];
  const table = rows.length
    ? `<div class="course-outline-list">${rows.map((row, index) => {
      const name = courseOutlineDisplayValue(row, ["KCM", "KCMC", "courseName", "name"], "未命名课程");
      const code = courseOutlineDisplayValue(row, ["KCH", "courseCode", "courseNo", "code"], "—");
      const unit = courseOutlineDisplayValue(row, ["KKDWDM_DISPLAY", "KKDWMC", "KKDWDM", "unit"], "—");
      const level = courseOutlineDisplayValue(row, ["KCCCDM_DISPLAY", "KCCCMC", "KCCCDM", "level"], "—");
      const grade = courseOutlineDisplayValue(row, ["KCJBDM_DISPLAY", "KCJBMC", "KCJBDM", "grade"], "—");
      const credits = courseOutlineDisplayValue(row, ["XF", "credit", "credits"], "—");
      return `<article class="course-outline-list-row"><div class="course-outline-list-main"><div class="course-outline-list-title"><strong>${escapeHtml(name)}</strong><code>${escapeHtml(code)}</code></div><div class="course-outline-list-meta"><span>开课单位：${escapeHtml(unit)}</span><span>层次：${escapeHtml(level)}</span><span>级别：${escapeHtml(grade)}</span><span>学分：${escapeHtml(credits)}</span></div></div><button class="button button-primary button-small" type="button" data-action="show-course-outline-detail" data-outline-row-index="${index}">查看大纲</button></article>`;
    }).join("")}</div>`
    : list.loading ? `<div class="course-outline-placeholder course-outline-list-placeholder">正在读取课程目录…</div>` : `<div class="course-outline-placeholder course-outline-list-placeholder">${list.loaded ? "没有符合条件的课程" : "输入筛选条件后查询课程大纲"}</div>`;
  const total = Number(list.totalSize) || rows.length;
  const pages = total ? Math.max(1, Math.ceil(total / list.pageSize)) : 1;
  const pagination = `<div class="course-outline-pagination"><span>第 ${escapeHtml(list.pageNumber)} / ${escapeHtml(pages)} 页 · 共 ${escapeHtml(total)} 门课程</span><div><button class="button button-ghost button-small" type="button" data-action="course-outline-page" data-outline-page="${Math.max(1, list.pageNumber - 1)}" ${list.pageNumber <= 1 || list.loading ? "disabled" : ""}>上一页</button><button class="button button-ghost button-small" type="button" data-action="course-outline-page" data-outline-page="${Math.min(pages, list.pageNumber + 1)}" ${list.pageNumber >= pages || list.loading ? "disabled" : ""}>下一页</button><label class="course-outline-page-size">每页<select data-outline-page-size ${list.loading ? "disabled" : ""}><option value="10" ${list.pageSize === 10 ? "selected" : ""}>10</option><option value="20" ${list.pageSize === 20 ? "selected" : ""}>20</option><option value="50" ${list.pageSize === 50 ? "selected" : ""}>50</option></select></label></div></div>`;
  const error = list.error ? `<div class="course-outline-error"><strong>${escapeHtml(list.error)}</strong><button class="button button-ghost button-small" type="button" data-action="refresh-course-outline-list">重试</button></div>` : "";
  const transportLabel = courseOutlineTransportStatusLabel();
  return `<div class="course-outline-page">${sectionHeading("课程大纲", "从教务系统课程目录查询并完整保留课程大纲原始信息。课程目录不随顶部当前学期选择自动清空。", `<button class="button button-ghost" type="button" data-action="open-course-outline-original">原系统查看</button>`)}<section class="panel course-outline-query-panel"><div class="course-outline-query-head"><div><h3>课程查询</h3><p class="muted">支持课程代码、名称、开课单位、层次和级别；查询结果按教务系统服务端分页。</p></div><div class="course-outline-query-actions"><button class="button button-primary" type="button" data-action="search-course-outline">查询</button><button class="button button-ghost" type="button" data-action="clear-course-outline">清空</button></div></div><div class="course-outline-filter-grid">${filterMarkup}</div></section>${error}<section class="course-outline-results panel"><div class="course-outline-results-head"><div><h3>课程目录</h3><span>${list.loading ? "正在同步课程目录…" : list.loaded ? "点击课程查看完整大纲" : "等待查询"}</span></div><span class="course-outline-session-state">${escapeHtml(transportLabel)}</span></div>${table}${pagination}</section></div>`;
}

function renderCourseOutlineDetail() {
  const detail = state.courseOutline.detail;
  if (!detail) return renderCourseOutlineList();
  const row = detail.row || {};
  const name = courseOutlineDisplayValue(row, ["KCM", "KCMC", "courseName", "name"], "未命名课程");
  const code = courseOutlineDisplayValue(row, ["KCH", "courseCode", "courseNo", "code"], "—");
  const term = courseOutlineDisplayValue(row, ["XNXQDM", "termCode", "xnxqdm"], "未提供");
  const key = courseOutlineKey(row);
  const failures = Object.values(detail.endpoints || {}).filter((item) => item.status === "failed").length;
  const actions = `<div class="course-outline-detail-actions"><button class="button button-ghost" type="button" data-action="back-course-outline">返回目录</button><button class="button button-primary" type="button" data-action="refresh-course-outline-detail">${detail.loading ? "读取中…" : "刷新全部"}</button><button class="button button-ghost" type="button" data-action="copy-course-outline">复制完整 JSON</button><button class="button button-ghost" type="button" data-action="download-course-outline">下载完整 JSON</button><button class="button button-ghost" type="button" data-action="print-course-outline">打印</button><button class="button button-ghost" type="button" data-action="open-course-outline-original">原系统查看</button></div>`;
  const raw = `<section class="course-outline-raw panel"><details><summary>原始数据（完整保留，供需要时核对）<span>${escapeHtml(`${Object.keys(detail.endpoints || {}).length} 个接口${failures ? ` · ${failures} 个失败` : ""}`)}</span></summary><div class="course-outline-raw-list">${Object.entries(detail.endpoints || {}).map(([endpoint, result]) => `<details class="course-outline-raw-item"><summary><code>${escapeHtml(endpoint)}</code><span>${escapeHtml(`${result.status} · ${courseOutlineShapeLabel(result.shape || "empty")}`)}</span></summary><pre>${escapeHtml(courseOutlineText(result.raw))}</pre></details>`).join("")}</div></details></section>`;
  const technicalKey = `<details class="course-outline-technical-key"><summary>查看查询标识</summary><code>${escapeHtml(key)}</code></details>`;
  return `<div class="course-outline-page course-outline-detail-page">${sectionHeading("课程大纲详情", "常用信息已翻译成中文；系统编码和完整原始响应已收起，单个章节仍可独立重试。", "") }<header class="course-outline-detail-header panel"><div class="course-outline-detail-title"><span class="eyebrow">COURSE OUTLINE</span><h2>${escapeHtml(name)}</h2><p><span>课程号：<code>${escapeHtml(code)}</code></span><span>适用学期：${escapeHtml(term)}</span></p>${technicalKey}</div>${actions}</header>${detail.loading ? `<div class="course-outline-loading-note">正在并行读取 ${COURSE_OUTLINE_DETAIL_ENDPOINTS.length} 个课程章节…已返回的章节会逐步显示。</div>` : failures ? `<div class="course-outline-loading-note is-warning">有 ${failures} 个章节读取失败；其他原始数据仍已保留，可点击对应章节的“重试此章节”。</div>` : `<div class="course-outline-loading-note is-success">课程大纲读取完成；常用字段已转换为中文，完整原始数据仍可展开查看。</div>`}${COURSE_OUTLINE_SECTION_DEFINITIONS.map((definition) => renderCourseOutlineSection(definition, detail)).join("")}${raw}</div>`;
}

function renderCourseOutline() {
  return state.courseOutline.detail ? renderCourseOutlineDetail() : renderCourseOutlineList();
}

// Final presentation-layer overrides. The legacy export helpers are kept for
// full-school pages; personal exports must use the merged school + local rows.
function scheduleExportRows(scope = "personal") {
  const source = scope === "all-detail" ? (state.allDetail?.courses || []) : mergedPersonalScheduleRows(state.data.courses || []);
  return expandedScheduleOccurrenceRows(source);
}

function scheduleExportFilteredRows(rows, selectedWeek) {
  if (selectedWeek === "all") return rows;
  const week = Number(selectedWeek);
  if (!Number.isInteger(week) || week <= 0) return rows;
  return (rows || []).filter((course) => {
    if (course.localDate) {
      const info = academicDayInfo(normalizeCalendarDate(course.localDate));
      return info.week === null || info.week === week;
    }
    const weeks = courseWeekNumbers(course);
    return !weeks.size || weeks.has(week);
  });
}

function scheduleCsvEntries(scope = "personal") {
  return localScheduleCsvEntries(scope);
}

function scheduleCsvHasRows(scope = "personal") {
  return scheduleCsvEntries(scope).length > 0;
}

function exportScheduleCsv(scope = "personal") {
  return localExportScheduleCsv(scope);
}

function scheduleExportCourseBadge(course, scope = "personal") {
  if (course?.source === "local") return course.localType === "event" ? "自定义日程" : "自定义课程";
  if (scope === "personal") return scheduleExportIsPracticeCourse(course) ? "实验实践课程" : "普通课程";
  return scheduleExportCategoryLabel(course);
}

function scheduleExportEntryText(course, selectedWeek, scope = "personal") {
  const range = courseSectionRange(course);
  const section = range ? (range.start === range.end ? `第${range.start}节` : `第${range.start}-${range.end}节`) : "";
  const clock = extractClockText(course.time) || localScheduleClockText(course);
  const weekText = selectedWeek === "all" ? (course.weeks || (course.localDate ? localScheduleDateText(course.localDate) : "周次待识别")) : `第${selectedWeek}周`;
  return {
    title: course.name || "未命名安排",
    schedule: [weekText, course.weekday || (course.localDate ? localScheduleDateText(course.localDate) : "星期待识别"), section, clock || (course.localAllDay ? "全天" : "")].filter(Boolean).join(" · "),
    teacher: course.teacher || (course.source === "local" ? "自定义安排" : "教师待识别"),
    location: course.location || course.detail || "地点待识别",
    code: course.source === "local" ? "本地安排" : course.code || "无课程号",
    tags: [courseAssessmentValue(course), courseRequirementValue(course), course.source === "local" ? (course.localType === "event" ? "日程" : "自定义") : scope === "all-detail" ? courseCategoryValue(course) : ""].filter(Boolean).join(" · ")
  };
}

// Keep the local overlay renderer at the end of the file so legacy renderer
// declarations above cannot accidentally replace the merged schedule UI.
function renderDailySchedule(rows, scope = "personal") {
  return renderDailyScheduleWithLocalOverlay(rows, scope);
}

function renderCourseDetailModal() {
  if (state.selectedCourse?.source === "local") return renderLocalScheduleDetailModal(state.selectedCourse);
  return renderCourseDetailWithLocalOverlay();
}

function renderPersonal() {
  return renderPersonalWithLocalOverlay();
}

function renderSettings() {
  return renderSettingsWithLocalOverlay();
}

document.querySelectorAll("[data-view]").forEach((tab) => {
  tab.addEventListener("click", async () => {
    const nextView = tab.dataset.view;
    if (IS_ANDROID_APP && nextView === "course-outline") return;
    const previousView = state.view;
    if (nextView !== state.view) {
      clearActiveModalState();
    }
    prepareCampusPromptForPersonalView(nextView, previousView);
    state.view = nextView;
    if (state.view === "curriculum" && !curriculumBootstrapIsActive()) {
      invalidateCurriculum();
      state.curriculum.bootstrap = { status: "idle", message: "", error: "", tabId: null, reading: false };
    }
    render();
    if (state.view === "scores" && !state.loading) {
      // 成绩提醒只以进入成绩页后得到的最新网络结果为准。各平台都在
      // 进入时刷新；学号与当前查询学期仍由提醒作用域严格隔离。
      refresh();
    } else if (IS_ANDROID_APP && ["overview", "exams", "personal"].includes(state.view) && !state.loading) {
      // 进入个人功能时再尝试一次网络刷新；缓存已经先渲染出来，离线时不会阻塞页面。
      refresh();
    }
    if (state.view === "all") {
      const tasks = [];
      if (!state.scheduleTypesLoaded) tasks.push(loadScheduleTypes());
      if (!state.allTermsLoaded) tasks.push(loadAllTerms());
      if (tasks.length) await Promise.all(tasks);
    } else if (state.view === "course-outline" && !state.courseOutline.list.loaded && !state.courseOutline.list.loading && !state.courseOutline.detail) {
      loadCourseOutlineList();
    }
  });
});

elements.termSelect.addEventListener("change", async () => {
  state.termCode = elements.termSelect.value;
  state.termSelectionTouched = true;
  state.scheduleWeek.personal = "";
  state.scheduleDisplay.personal = "days";
  if (!applyCachedTermSnapshot(state.termCode)) {
    state.data = emptyPersonalData();
    state.data.allScores = Array.isArray(state.personalCache.allScores) ? state.personalCache.allScores : [];
  }
  state.personalCache.source = state.personalCache.available ? "cache" : "";
  render();
  await refresh();
});

elements.refresh.addEventListener("click", refresh);
document.getElementById("openPortal").addEventListener("click", openPortal);

elements.content.addEventListener("input", (event) => {
  const outlineFilter = event.target.dataset.outlineFilter;
  if (outlineFilter && state.courseOutline?.list?.filters) {
    state.courseOutline.list.filters[outlineFilter] = event.target.value;
    return;
  }
  const filter = event.target.dataset.filter;
  if (filter) {
    state.filters[filter] = event.target.value;
    const selectionStart = event.target.selectionStart;
    const selectionEnd = event.target.selectionEnd;
    const rerender = () => {
      render();
      const next = document.querySelector(`[data-filter="${filter}"]`);
      if (next) {
        next.focus();
        if (typeof selectionStart === "number" && typeof next.setSelectionRange === "function") {
          next.setSelectionRange(selectionStart, typeof selectionEnd === "number" ? selectionEnd : selectionStart);
        }
      }
    };
    if (filter === "curriculum") {
      // 课程树很大，不能在每个字符输入时同步销毁并重建 input，否则输入法和光标会被打断。
      window.clearTimeout(filterRenderTimer);
      filterRenderTimer = window.setTimeout(rerender, 140);
    } else {
      rerender();
    }
    return;
  }
  if (event.target.id === "allKeyword") state.filters.allKeyword = event.target.value;
  if (event.target.id === "allCode") state.filters.allCode = event.target.value;
  if (event.target.id === "allName") state.filters.allName = event.target.value;
  if (event.target.id === "webvpnUrlInput") state.webvpnTool.input = event.target.value;
});

elements.content.addEventListener("change", (event) => {
  if (event.target.id === "toastNotificationsEnabled") {
    const enabled = Boolean(event.target.checked);
    setToastNotificationsEnabled(enabled);
    if (!enabled) showToast("");
    else setNotice("一般状态提示已开启。", "success");
    return;
  }
  if (event.target.matches("[data-term-select]")) {
    state.termCode = event.target.value;
    state.termSelectionTouched = true;
    elements.termSelect.value = state.termCode;
    state.scheduleWeek.personal = "";
    state.scheduleDisplay.personal = "days";
    refresh();
    return;
  }
  if (event.target.matches("[data-course-selection]")) {
    const scope = event.target.dataset.courseTransferScope || "all";
    const key = event.target.dataset.courseTransferKey || "";
    if (state.courseTransfer.selectionScope !== scope || !state.courseTransfer.selectionMode || !key) return;
    if (event.target.checked) state.courseTransfer.selectedKeys.add(key);
    else state.courseTransfer.selectedKeys.delete(key);
    render();
    return;
  }
  if (event.target.matches("[data-course-selection-all]")) {
    const scope = event.target.dataset.courseTransferScope || "all";
    if (state.courseTransfer.selectionScope !== scope || !state.courseTransfer.selectionMode) return;
    const records = courseTransferRecords(scope);
    records.forEach((record) => {
      const key = courseTransferKey(scope, record.index);
      if (event.target.checked) state.courseTransfer.selectedKeys.add(key);
      else state.courseTransfer.selectedKeys.delete(key);
    });
    render();
    return;
  }
  if (event.target.id === "personalWeekSelect") {
    state.scheduleWeek.personal = event.target.value;
    state.selectedCourse = null;
    render();
    return;
  }
  if (event.target.id === "localStartSection") {
    syncLocalScheduleEndSectionSelect(event.target.value);
    return;
  }
  if (event.target.id === "localEndSection" && localScheduleInteger(localScheduleInputValue("localStartSection"), null) === null) {
    event.target.value = "";
    return;
  }
  if (event.target.id === "allDetailWeekSelect") {
    state.scheduleWeek["all-detail"] = event.target.value;
    state.selectedCourse = null;
    render();
    return;
  }
  if (event.target.id === "scheduleExportWeekSelect") {
    if (state.scheduleExport) {
      state.scheduleExport.selectedWeek = event.target.value;
      render();
    }
    return;
  }
  if (event.target.id === "allMode") {
    allScheduleRequestSequence += 1;
    allScheduleDetailRequestSequence += 1;
    state.allRetrying = false;
    state.allTypeCode = event.target.value;
    state.allRows = [];
    state.allPage = 1;
    state.allDetail = null;
    state.courseTransfer.selectionMode = false;
    state.courseTransfer.selectionScope = "";
    state.courseTransfer.selectedKeys.clear();
    clearCourseTransferModal();
    state.scheduleWeek["all-detail"] = "all";
    state.selectedCourse = null;
    state.allError = "";
    state.allPendingMessage = "";
    render();
    return;
  }
  if (event.target.id === "allTermSelect") {
    allScheduleRequestSequence += 1;
    allScheduleDetailRequestSequence += 1;
    state.allRetrying = false;
    state.allTermCode = event.target.value;
    state.allTermSelectionTouched = true;
    state.allRows = [];
    state.allPage = 1;
    state.allDetail = null;
    state.courseTransfer.selectionMode = false;
    state.courseTransfer.selectionScope = "";
    state.courseTransfer.selectedKeys.clear();
    clearCourseTransferModal();
    state.scheduleWeek["all-detail"] = "all";
    state.selectedCourse = null;
    state.allError = "";
    state.allPendingMessage = "";
    render();
    return;
  }
  if (event.target.id === "curriculumPlanSelect") {
    state.curriculum.selectedPlanId = event.target.value;
    state.curriculum.semester = "all";
    state.curriculum.expanded = {};
    loadCurriculumPlan(event.target.value);
    return;
  }
  if (event.target.id === "curriculumMode") {
    state.curriculum.mode = event.target.value;
    render();
    return;
  }
  if (event.target.id === "curriculumSemesterSelect") {
    state.curriculum.semester = event.target.value;
    render();
    return;
  }
  if (event.target.id === "curriculumPendingOnly") {
    state.curriculum.pendingOnly = event.target.checked;
    state.curriculum.expanded = {};
    render();
    return;
  }
  if (event.target.matches("[data-outline-page-size]")) {
    state.courseOutline.list.pageSize = Math.max(1, Math.min(100, Number(event.target.value) || 10));
    return loadCourseOutlineList({ pageNumber: 1, pageSize: state.courseOutline.list.pageSize, force: true });
  }
  if (event.target.id === "loginMethodSelect") {
    const requestedMethod = String(event.target.value || "");
    const method = IS_ANDROID_APP
      ? (["builtin", "password", "wechat"].includes(requestedMethod) ? requestedMethod : "builtin")
      : (requestedMethod === "wechat" ? "wechat" : "password");
    try {
      if (IS_ANDROID_APP) globalThis.AndroidApi?.setLoginMethod?.(method);
      else writeStoredSetting("zhizhang.loginMethod", method);
      const methodLabel = method === "builtin" ? "内置登录" : method === "wechat" ? "微信扫码登录" : "原网页账密登录";
      setNotice(`已保存默认登录方式：${methodLabel}。`, "success");
    } catch (error) {
      setNotice(`默认登录方式保存失败：${error.message || "原生设置不可用"}`, "error");
    }
    return;
  }
});

elements.content.addEventListener("click", async (event) => {
  const treeSummary = event.target.closest?.(".curriculum-tree-summary");
  if (treeSummary) {
    const treeNode = treeSummary.closest(".curriculum-tree-node");
    if (treeNode?.dataset.curriculumKey) {
      // details 的 open 状态在 click 回调之后才完成切换，因此放到微任务后读取。
      window.setTimeout(() => {
        state.curriculum.expanded = {
          ...(state.curriculum.expanded || {}),
          [treeNode.dataset.curriculumKey]: Boolean(treeNode.open)
        };
        syncCurriculumTreeBulkAction();
      }, 0);
    }
  }
  if (event.target.classList.contains("modal-backdrop")) {
    if (event.target.dataset.scoreReminderScope) {
      acknowledgeCurrentScoreReminder();
      return;
    }
    clearActiveModalState();
    render();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "save-campus-setting" || action === "save-campus-prompt") {
    const select = document.getElementById(action === "save-campus-prompt" ? "campusPromptSelect" : "campusSettingSelect");
    const code = normalizeCampusCode(select?.value);
    if (action === "save-campus-prompt" && !code) {
      setNotice("请先选择南湖校区或浑南校区。", "error");
      return;
    }
    state.campus.code = persistCampusCode(code);
    state.campus.promptOpen = false;
    setNotice(code ? `已设置默认校区：${campusLabel(code)}。` : "已清除默认校区。", "success");
    render();
    return;
  }
  if (action === "dismiss-campus-prompt") {
    state.campus.promptOpen = false;
    render();
    return;
  }
  if (action === "open-webvpn-tool") {
    state.webvpnTool.open = true;
    updateWebVpnTool(state.webvpnTool.input);
    render();
    return;
  }
  if (action === "close-webvpn-tool") {
    state.webvpnTool.open = false;
    render();
    return;
  }
  if (action === "webvpn-use-site") {
    updateWebVpnTool(button.dataset.webvpnUrl || "");
    render();
    return;
  }
  if (action === "generate-webvpn-url") {
    const input = document.getElementById("webvpnUrlInput");
    updateWebVpnTool(input?.value || state.webvpnTool.input);
    render();
    return;
  }
  if (action === "copy-webvpn-url") return copyGeneratedWebVpnUrl();
  if (action === "copy-login-diagnostics") return copyAndroidLoginDiagnostics();
  if (action === "open-webvpn-url") return openGeneratedWebVpnUrl();
  if (action === "open-portal") return openPortal();
  if (action === "start-curriculum-bootstrap" || action === "open-curriculum-portal") return startCurriculumBootstrap();
  if (action === "open-course-outline-original") return openCourseOutlineOriginal();
  if (action === "search-course-outline") return searchCourseOutline();
  if (action === "clear-course-outline") {
    state.courseOutline.list.filters = { code: "", name: "", unit: "", level: "", grade: "" };
    return loadCourseOutlineList({ pageNumber: 1, force: true });
  }
  if (action === "refresh-course-outline-list") return loadCourseOutlineList({ force: true });
  if (action === "course-outline-page") {
    const page = Number(button.dataset.outlinePage);
    if (page > 0) return loadCourseOutlineList({ pageNumber: page, force: true });
    return;
  }
  if (action === "show-course-outline-detail") {
    const row = state.courseOutline.list.rows[Number(button.dataset.outlineRowIndex)];
    return loadCourseOutlineDetail(row);
  }
  if (action === "back-course-outline") {
    courseOutlineDetailRequestSequence += 1;
    state.courseOutline.detail = null;
    render();
    return;
  }
  if (action === "refresh-course-outline-detail") {
    if (state.courseOutline.detail?.row) return loadCourseOutlineDetail(state.courseOutline.detail.row);
    return;
  }
  if (action === "retry-course-outline-endpoint") return retryCourseOutlineEndpoint(button.dataset.outlineEndpoint || "");
  if (action === "copy-course-outline") return copyCourseOutline();
  if (action === "download-course-outline") return downloadCourseOutline();
  if (action === "print-course-outline") {
    if (typeof window.print === "function") window.print();
    return;
  }
  if (action === "open-schedule-image-export") return openScheduleImageExport(button.dataset.scheduleScope || "personal");
  if (action === "export-schedule-csv") return exportScheduleCsv(button.dataset.scheduleScope || "personal");
  if (action === "close-schedule-export") {
    state.scheduleExport = null;
    render();
    return;
  }
  if (action === "toggle-course-name-sort") {
    const scope = button.dataset.courseTransferScope || "all";
    const current = courseTransferSortMode(scope);
    const next = current === "source" ? "asc" : current === "asc" ? "desc" : "source";
    state.courseTransfer.sortMode[scope] = next;
    render();
    return;
  }
  if (action === "start-course-selection") {
    const scope = button.dataset.courseTransferScope || "all";
    state.courseTransfer.selectionScope = scope;
    state.courseTransfer.selectionMode = true;
    state.courseTransfer.selectedKeys.clear();
    clearCourseTransferModal();
    render();
    return;
  }
  if (action === "cancel-course-selection") {
    state.courseTransfer.selectionMode = false;
    state.courseTransfer.selectionScope = "";
    state.courseTransfer.selectedKeys.clear();
    clearCourseTransferModal();
    render();
    return;
  }
  if (action === "export-selected-courses") {
    return openCourseExport(button.dataset.courseTransferScope || state.courseTransfer.selectionScope || "all");
  }
  if (action === "open-course-import") {
    state.courseTransfer.mode = "import";
    state.courseTransfer.text = "";
    state.courseTransfer.error = "";
    state.courseTransfer.notice = "";
    state.courseTransfer.result = null;
    render();
    return;
  }
  if (action === "copy-course-export") return copyCourseExport();
  if (action === "download-course-export") return downloadCourseExport();
  if (action === "analyze-course-import") return analyzeCourseImport();
  if (action === "close-course-transfer") {
    clearCourseTransferModal();
    render();
    return;
  }
  if (action === "toggle-course-selection" || action === "toggle-course-selection-all") return;
  if (action === "confirm-schedule-image-export") return exportScheduleImage();
  if (action === "refresh") return refresh();
  if (action === "view-settings") {
    state.selectedCourse = null;
    state.selectedCourseScope = "personal";
    state.view = "settings";
    render();
    return;
  }
  if (action === "clear-personal-cache") return clearPersonalCache();
  if (action === "save-current-term") return saveManualCurrentTerm();
  if (action === "sync-current-term") return syncCurrentTermFromSchool();
  if (action === "schedule-days") {
    state.scheduleDisplay.personal = "days";
    state.selectedCourse = null;
    render();
    return;
  }
  if (action === "schedule-week") {
    // 只有第一次进入个人周表，或切换了学期后尚未主动选择过周次时，
    // 才按开学日期定位当前周。用户主动选择“全部周次/其他周次”后保留选择。
    if (!state.scheduleWeek.personal) state.scheduleWeek.personal = defaultPersonalScheduleWeek();
    state.scheduleDisplay.personal = "week";
    state.selectedCourse = null;
    render();
    return;
  }
  if (action === "save-calendar-settings") {
    const input = document.getElementById("firstWeekStartInput");
    const value = input?.value || "";
    const date = normalizeCalendarDate(value);
    if (value && (!date || date.getDay() !== 0)) {
      setNotice("第一周的第一天必须是周日，请重新选择日期。", "error");
      return;
    }
    state.calendar.firstWeekStart = value;
    writeStoredSetting("zhizhang.firstWeekStart", value);
    // 开学日期改变后，之前手动选择的周次已经没有确定的学周语义；
    // 下一次进入周表应重新按新日期定位当前周。用户之后手动选择的
    // “全部周次”或其他周次仍会继续保留，直到再次切换学期/改日期。
    state.scheduleWeek.personal = "";
    state.scheduleDisplay.personal = "days";
    prepareCampusPromptForPersonalView("personal", state.view);
    state.view = "personal";
    setNotice(value ? "学周设置已保存，课表已按周日重新计算。" : "已清除学周设置；设置教学周后才能准确显示今天和明天的课程。", "success");
    render();
    return;
  }
  if (action === "clear-calendar-settings") {
    state.calendar.firstWeekStart = "";
    writeStoredSetting("zhizhang.firstWeekStart", "");
    state.scheduleWeek.personal = "";
    state.scheduleDisplay.personal = "days";
    prepareCampusPromptForPersonalView("personal", state.view);
    state.view = "personal";
    setNotice("已清除学周设置；设置教学周后才能准确显示今天和明天的课程。", "success");
    render();
    return;
  }
  if (action === "close-course") {
    sportProjectRequestSequence += 1;
    state.selectedCourse = null;
    state.selectedCourseScope = "personal";
    render();
    return;
  }
  if (action === "close-score-detail") {
    state.scoreDetail = null;
    render();
    return;
  }
  if (action === "acknowledge-new-scores") {
    acknowledgeCurrentScoreReminder();
    return;
  }
  if (action === "show-score-detail") {
    return openScoreDetail(Number(button.dataset.scoreIndex));
  }
  if (action === "retry-score-detail") {
    const index = state.data.scores.indexOf(state.scoreDetail?.row);
    return openScoreDetail(index);
  }
  if (action === "close-curriculum-course") {
    state.curriculum.courseDetail = null;
    render();
    return;
  }
  if (action === "export-curriculum-pdf") {
    return exportCurriculumPdf();
  }
  if (action === "show-curriculum-course") {
    const key = button.dataset.courseKey || "";
    const row = state.curriculum.courses.find((course) => curriculumCourseKey(course) === key);
    if (!row) return;
    state.curriculum.courseDetail = { row, loading: false, error: "" };
    render();
    return;
  }
  if (action === "retry-curriculum") {
    return IS_ANDROID_APP ? loadCurriculumPlans() : startCurriculumBootstrap();
  }
  if (action === "refresh-curriculum") {
    return IS_ANDROID_APP ? loadCurriculumPlans() : startCurriculumBootstrap();
  }
  if (action === "curriculum-expand-all" || action === "curriculum-collapse-all") {
    const open = action === "curriculum-expand-all";
    state.curriculum.expanded = Object.fromEntries(curriculumTreeKeys(state.curriculum.groups).map((key) => [key, open]));
    render();
    return;
  }
  if (action === "close-all-detail") {
    allScheduleDetailRequestSequence += 1;
    state.selectedCourse = null;
    state.selectedCourseScope = "personal";
    state.allDetail = null;
    render();
    return;
  }
  if (action === "show-course") {
    const scope = button.dataset.courseScope || "personal";
    const index = Number(button.dataset.courseIndex);
    const detailIndex = Number(button.dataset.courseDetailIndex);
    state.selectedCourse = resolveScheduleItemFromAction(button) || (scope === "personal" && Number.isInteger(detailIndex) && detailIndex >= 0
      ? state.data.scheduleDetail[detailIndex] || courseAtScopeIndex(scope, index)
      : courseAtScopeIndex(scope, index));
    state.selectedCourseScope = scope;
    if (state.selectedCourse && courseIsSport(state.selectedCourse)) {
      return loadSportProjectsForCourse(state.selectedCourse, scope);
    }
    render();
    return;
  }
  if (action === "all-page") {
    const page = Number(button.dataset.page);
    if (page > 0) {
      state.allPage = page;
      state.allDetail = null;
      state.selectedCourse = null;
      render();
    }
    return;
  }
  if (action === "show-all-detail") {
    return queryAllScheduleDetail(Number(button.dataset.rowIndex));
  }
  if (["view-scores", "view-curriculum", "view-course-outline", "view-exams", "view-personal", "view-all"].includes(action)) {
    state.selectedCourse = null;
    state.selectedCourseScope = "personal";
  }
  if (action === "view-scores") state.view = "scores";
  if (action === "view-curriculum" && !IS_ANDROID_APP) {
    state.view = "curriculum";
    invalidateCurriculum();
    state.curriculum.bootstrap = { status: "idle", message: "", error: "", tabId: null, reading: false };
  }
  if (action === "view-course-outline" && !IS_ANDROID_APP) {
    state.view = "course-outline";
    state.courseOutline.detail = null;
  }
  if (action === "view-exams") state.view = "exams";
  if (action === "view-personal") {
    prepareCampusPromptForPersonalView("personal", state.view);
    state.view = "personal";
  }
  if (action === "view-all") state.view = "all";
  if (action === "search-all") {
    const mode = document.getElementById("allMode");
    if (mode) state.allTypeCode = mode.value;
    const term = document.getElementById("allTermSelect");
    const keyword = document.getElementById("allKeyword");
    const code = document.getElementById("allCode");
    const name = document.getElementById("allName");
    if (term) state.allTermCode = term.value;
    state.filters.allKeyword = keyword?.value || "";
    state.filters.allCode = code?.value || "";
    state.filters.allName = name?.value || "";
    return queryAllSchedule();
  }
  render();
  if (action === "view-scores" && !state.loading) {
    await refresh();
  }
  if (state.view === "course-outline" && !state.courseOutline.list.loaded && !state.courseOutline.list.loading) {
    loadCourseOutlineList();
  }
  if (state.view === "all") {
    const tasks = [];
    if (!state.scheduleTypesLoaded) tasks.push(loadScheduleTypes());
    if (!state.allTermsLoaded) tasks.push(loadAllTerms());
    if (tasks.length) await Promise.all(tasks);
  }
});

setConnection("正在连接教务系统", "loading");
globalThis.__refreshDashboard = refresh;
globalThis.__handleAndroidBack = () => {
  if (currentScoreReminder()) {
    acknowledgeCurrentScoreReminder();
    return true;
  }
  if (hasActiveModalState()) {
    clearActiveModalState();
    render();
    return true;
  }
  if (state.allDetail) {
    state.allDetail = null;
    render();
    return true;
  }
  if (state.view !== "overview") {
    state.view = "overview";
    render();
    return true;
  }
  return false;
};
// 桌面扩展保持原有的自动刷新；Android 只在文档加载完成后向原生发送
// 一次启动握手，由原生并行安排 WebVPN 轻量会话探测和唯一刷新链路。
if (IS_ANDROID_APP) {
  // 原生会话探测与 WebView 的 onPageFinished 存在天然竞争：先渲染稳定的
  // 加载态，再完成本地缓存水合；远程探测只负责随后同步，不得阻塞首屏。
  state.loading = true;
  render();
  bootstrapLocalDashboard().finally(() => {
    // 本地数据已经可交互后才通知原生安排远程探测；断网时这一步仍然会
    // 完成，UNKNOWN 结果不会让 Dashboard 回到 loading 或登录错误页。
    globalThis.AndroidApi?.dashboardReady?.();
  });
} else {
  refresh();
}
