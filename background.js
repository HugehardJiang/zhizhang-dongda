chrome.action.onClicked.addListener(() => {
  const dashboardUrl = new URL(chrome.runtime.getURL("dashboard.html"));
  dashboardUrl.searchParams.set("v", chrome.runtime.getManifest().version);
  chrome.tabs.create({
    url: dashboardUrl.toString()
  });
});

// 培养方案模块的部分接口会校验原系统页面注入的 WebVPN 会话标记，
// 直接从 extension:// 页面 fetch 会得到 403。这里仅在用户已经打开的
// 教务系统标签页中执行只读请求，复用该页面现有的 jQuery/WebVPN 会话，
// 不填写、不保存，也不提交任何教务信息。
//
// 注意：不要把任何学生的方案 ID、年级、专业或最低学分写在这里。
// 方案 ID 是教务系统按账号动态分配的，换账号后必须以原系统当前页面为准。
const PORTAL_URL = "https://webvpn.neu.edu.cn/http/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";
const LOGIN_METHOD_WECHAT = "wechat";
const CURRICULUM_PENDING_KEY = "zhizhang.curriculumBootstrap";
const CURRICULUM_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const CURRICULUM_NAVIGATION_TIMEOUT_MS = 18000;
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
const COURSE_OUTLINE_NAVIGATION_TIMEOUT_MS = 18000;
let curriculumPendingFallback = null;
let curriculumBootstrapInFlight = null;
const curriculumResumeLocks = new Map();
let courseOutlineBootstrapInFlight = null;

function isWebVpnPortalUrl(url = "") {
  return /^https:\/\/webvpn\.neu\.edu\.cn\//i.test(String(url || ""));
}

function isCurriculumPageIdentity(url = "", title = "") {
  const identity = `${String(url || "")} ${String(title || "")}`;
  const moduleUrl = /(?:pyfagl|pyfaglepg|pyfacx|pyfakz|pyfadm|pyfa)/i.test(String(url || ""));
  const moduleTitle = /培养方案查询|培养方案管理|培养计划/.test(String(title || ""))
    && !/首页|home|portal/i.test(String(title || ""));
  return moduleUrl || moduleTitle || /pyfagl|pyfaglepg|pyfacx|pyfakz|pyfa/i.test(identity);
}

function isCourseOutlinePageIdentity(url = "", title = "") {
  const identity = `${String(url || "")} ${String(title || "")}`;
  return /(?:kcdgwhgl|dgcx|课程大纲查询|课程大纲)/i.test(identity);
}

async function findLatestPortalTab(preferredTabId = null, preferredModule = "curriculum") {
  const tabs = await chrome.tabs.query({ url: "https://webvpn.neu.edu.cn/*" });
  const portalTabs = tabs
    .filter((item) => item.id && isWebVpnPortalUrl(item.url))
    .sort((left, right) => {
      const preferredDelta = Number(right.id === Number(preferredTabId)) - Number(left.id === Number(preferredTabId));
      if (preferredDelta) return preferredDelta;
      // 当前活动的 WebVPN 标签页优先；否则优先最近访问且已经进入原系统模块的页面。
      const activeDelta = Number(Boolean(right.active)) - Number(Boolean(left.active));
      if (activeDelta) return activeDelta;
      const outlineDelta = Number(isCourseOutlinePageIdentity(right.url, right.title))
        - Number(isCourseOutlinePageIdentity(left.url, left.title));
      const curriculumDelta = Number(isCurriculumPageIdentity(right.url, right.title))
        - Number(isCurriculumPageIdentity(left.url, left.title));
      // Keep the two portal workflows from stealing each other's tab when
      // both the curriculum and course-outline pages are open.  The default
      // remains the legacy curriculum preference for all existing callers.
      const moduleDelta = preferredModule === "outline" ? outlineDelta : curriculumDelta;
      if (moduleDelta) return moduleDelta;
      const secondaryDelta = preferredModule === "outline" ? curriculumDelta : outlineDelta;
      if (secondaryDelta) return secondaryDelta;
      return Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0);
    });
  return portalTabs[0] || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executePortalScript(tabId, details, timeoutMs = 4000) {
  const invoke = (limit) => {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("原系统页面响应超时");
        error.code = "PORTAL_SCRIPT_TIMEOUT";
        reject(error);
      }, limit);
    });
    return Promise.race([
      chrome.scripting.executeScript({
        ...details,
        target: { ...(details.target || {}), tabId }
      }),
      timeout
    ]).finally(() => clearTimeout(timer));
  };
  try {
    return await invoke(timeoutMs);
  } catch (error) {
    if (error?.code !== "PORTAL_SCRIPT_TIMEOUT") throw error;
    // Edge 会让长时间未激活的 WebVPN 标签页进入睡眠状态；先唤醒一次，
    // 再重试注入，避免整个自动流程无限等待。
    try {
      await chrome.tabs.update(tabId, { active: true });
      await delay(180);
    } catch {
      // 继续让第二次注入给出实际错误。
    }
    return invoke(Math.max(timeoutMs, 8000));
  }
}

async function selectPortalQrLogin(tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    try {
      const result = await executePortalScript(tabId, {
        target: { tabId, allFrames: true },
        world: "MAIN",
        func: () => {
          const href = String(location.href || "");
          if (!/\/tpass\/login/i.test(href)) return { loginPage: false, selected: false };
          const tab = document.getElementById("qrcode_login");
          if (tab && typeof tab.click === "function") {
            tab.click();
            return { loginPage: true, selected: true };
          }
          return { loginPage: true, selected: false };
        }
      });
      if (result.some((item) => item?.result?.selected)) return true;
    } catch {
      // 原系统页面可能仍在跳转或脚本尚未加载，继续短暂等待。
    }
    await delay(250);
  }
  return false;
}

async function openPortalLogin(method) {
  const tab = await chrome.tabs.create({ url: PORTAL_URL, active: true });
  if (!tab?.id) return { ok: false, error: "无法打开教务系统登录页" };
  if (method === LOGIN_METHOD_WECHAT) {
    const selected = await selectPortalQrLogin(tab.id);
    return {
      ok: true,
      tabId: tab.id,
      selected,
      message: selected ? "已打开原系统二维码登录页" : "已打开原系统，二维码标签仍可在页面中手动切换"
    };
  }
  return { ok: true, tabId: tab.id, message: "已打开原系统账号登录页" };
}

async function navigatePortalTabToCurriculum(tabId) {
  const clickedLabels = [];
  let clicked = false;
  let lastClickedLabel = "";
  let lastError = "";
  const startedAt = Date.now();
  while (Date.now() - startedAt < CURRICULUM_NAVIGATION_TIMEOUT_MS) {
    let attemptedLabel = "";
    try {
      // 先只读检查所有 frame，再从所有候选中选出一个 frame 和一个入口。
      // 旧实现会让每个 frame 各自 click 一次，首页/嵌套菜单因此可能被重复触发。
      const result = await executePortalScript(tabId, {
        target: { tabId, allFrames: true },
        world: "MAIN",
        args: [clickedLabels],
        func: (ignoredLabels) => {
          const href = String(location.href || "");
          const title = String(document.title || "");
          const bodyText = String(document.body?.innerText || "").slice(0, 2600);
          const moduleUrl = /(?:pyfagl|pyfaglepg|pyfacx|pyfakz|pyfadm|pyfa)/i.test(href);
          const moduleTitle = /培养方案查询|培养方案管理|培养计划/.test(title)
            && !/首页|home|portal/i.test(title);
          const already = moduleUrl || moduleTitle;
          const loginByUrl = /(?:\/tpass\/login|\/login(?:[/?#]|$))/i.test(href);
          const loginText = /统一身份认证|用户登录|账号登录|用户名|密码/.test(`${title} ${bodyText}`);
          const hasPassword = Boolean(document.querySelector("input[type='password'],input[name*='pass' i],#password"));
          if (loginByUrl || (hasPassword && loginText)) {
            return { loginRequired: true, pageUrl: href, title };
          }
          if (already) return { already: true, label: "培养方案页面", pageUrl: href, title };

          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none"
              && style.visibility !== "hidden"
              && rect.width > 0
              && rect.height > 0;
          };
          const labels = ["培养方案查询", "培养方案管理", "培养方案", "培养计划", "培养"];
          const selector = "a,button,[role='button'],[onclick],li,div,span,[class*='application'],[class*='Application'],[class*='item'],[class*='Item'],[class*='card'],[class*='Card'],[class*='menu'],[class*='Menu'],[class*='nav'],[class*='Nav']";
          const targetSelector = "a,button,[role='button'],[onclick],li,[class*='application'],[class*='Application'],[class*='item'],[class*='Item'],[class*='card'],[class*='Card'],[class*='menu'],[class*='Menu'],[class*='nav'],[class*='Nav']";
          const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
          const candidates = [];
          const seen = new Set();
          Array.from(document.querySelectorAll(selector)).forEach((element) => {
            // 教务系统首页的菜单由 React 事件委托驱动，真正带文字的 div/span
            // 本身没有 onclick 属性；直接 click 文本节点会向上冒泡到应用卡片。
            // 仍保留 targetSelector 作为候选优先级信息，但不强制把文本节点
            // 替换成可能包含整块页面文本的祖先节点。
            const target = element;
            if (!target || !visible(target)) return;
            const text = normalize(target.innerText || target.textContent || "");
            if (!text || text.length > 96) return;
            const label = labels.find((item) => text === item || text.includes(item));
            if (!label || ignoredLabels.includes(label)) return;
            const key = `${label}|${text}`;
            if (seen.has(key)) return;
            seen.add(key);
            const rank = labels.indexOf(label);
            const exact = text === label;
            const targetClass = typeof target.className === "string" ? target.className : "";
            const interactive = /^(A|BUTTON|LI)$/i.test(target.tagName || "")
              || target.hasAttribute?.("role")
              || target.hasAttribute?.("onclick")
              || target.closest?.(targetSelector)
              || /application|item|card|menu|nav|click/i.test(targetClass);
            candidates.push({
              label,
              text,
              score: (labels.length - rank) * 1000
                + (exact ? 300 : 0)
                + (interactive ? 120 : 0)
                - Math.min(text.length, 96) / 10
            });
          });
          candidates.sort((left, right) => right.score - left.score);
          return { candidates: candidates.slice(0, 8), pageUrl: href, title };
        }
      });
      const frameResults = result
        .map((item) => item?.result ? { ...item.result, frameId: item.frameId } : null)
        .filter(Boolean);
      const readyFrame = frameResults.find((item) => item.already);
      if (readyFrame) {
        return { ready: true, already: true, label: readyFrame.label, pageUrl: readyFrame.pageUrl };
      }
      if (frameResults.some((item) => item.loginRequired)) {
        const loginFrame = frameResults.find((item) => item.loginRequired);
        return { ready: false, loginRequired: true, pageUrl: loginFrame?.pageUrl || "" };
      }
      const chosen = frameResults
        .flatMap((item) => (item.candidates || []).map((candidate) => ({ ...candidate, frameId: item.frameId, pageUrl: item.pageUrl })))
        .sort((left, right) => right.score - left.score)[0];
      if (chosen) {
        attemptedLabel = chosen.label || "";
        const clickResult = await executePortalScript(tabId, {
          target: { tabId, frameIds: [chosen.frameId] },
          world: "MAIN",
          args: [chosen.label, chosen.text],
          func: (requestedLabel, requestedText) => {
            const labels = ["培养方案查询", "培养方案管理", "培养方案", "培养计划", "培养"];
            const selector = "a,button,[role='button'],[onclick],li,div,span,[class*='application'],[class*='Application'],[class*='item'],[class*='Item'],[class*='card'],[class*='Card'],[class*='menu'],[class*='Menu'],[class*='nav'],[class*='Nav']";
            const targetSelector = "a,button,[role='button'],[onclick],li,[class*='application'],[class*='Application'],[class*='item'],[class*='Item'],[class*='card'],[class*='Card'],[class*='menu'],[class*='Menu'],[class*='nav'],[class*='Nav']";
            const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
            const visible = (element) => {
              const style = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            };
            const candidates = [];
            const seen = new Set();
            Array.from(document.querySelectorAll(selector)).forEach((element) => {
              const target = element;
              if (!target || !visible(target)) return;
              const text = normalize(target.innerText || target.textContent || "");
              const label = labels.find((item) => text === item || text.includes(item));
              if (!label || label !== requestedLabel || text !== requestedText) return;
              const key = `${label}|${text}`;
              if (seen.has(key)) return;
              seen.add(key);
              const rank = labels.indexOf(label);
              const exact = text === label;
              const targetClass = typeof target.className === "string" ? target.className : "";
              const interactive = /^(A|BUTTON|LI)$/i.test(target.tagName || "")
                || target.hasAttribute?.("role")
                || target.hasAttribute?.("onclick")
                || /application|item|card|menu|nav|click/i.test(targetClass);
              candidates.push({ target, score: (labels.length - rank) * 1000 + (exact ? 300 : 0) + (interactive ? 120 : 0) - Math.min(text.length, 96) / 10 });
            });
            const chosen = candidates.sort((left, right) => right.score - left.score)[0];
            if (!chosen?.target || typeof chosen.target.click !== "function") return { clicked: false };
            chosen.target.click();
            return { clicked: true, label: requestedLabel, text: requestedText, pageUrl: location.href };
          }
        });
        const click = clickResult.find((item) => item?.result?.clicked)?.result;
        if (click?.clicked) {
          clicked = true;
          lastClickedLabel = click.label || lastClickedLabel;
          if (click.label && !clickedLabels.includes(click.label)) clickedLabels.push(click.label);
        }
      }
    } catch (error) {
      lastError = error?.message || "页面尚未完成加载";
      // React/Vue 菜单点击可能恰好替换整个 frame，Chrome 会把一次已经
      // 发出的 click 报成“Frame ... was removed”。把这次 click 记入阶段
      // 状态，下一轮重新扫描新 frame，而不是重复点击或直接失败。
      if (attemptedLabel && /frame with id .*removed/i.test(lastError)) {
        clicked = true;
        lastClickedLabel = attemptedLabel;
        if (!clickedLabels.includes(attemptedLabel)) clickedLabels.push(attemptedLabel);
      }
    }
    await delay(450);
  }
  // 菜单点击可能在返回结果前替换主 frame；最后再做一次只读确认，
  // 避免把已经进入培养方案的标签页误报成失败。
  try {
    const finalState = await inspectPortalTabState(tabId);
    if (finalState.ready) return { ready: true, already: true, pageUrl: finalState.pageUrl };
    if (finalState.loginRequired) return { ready: false, loginRequired: true, pageUrl: finalState.pageUrl };
  } catch {
    // 由上层展示友好的重试和手动路径。
  }
  return {
    ready: false,
    clicked,
    label: lastClickedLabel,
    error: lastError
  };
}

async function inspectPortalTabState(tabId) {
  try {
    const result = await executePortalScript(tabId, {
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: () => {
        const href = String(location.href || "");
        const title = String(document.title || "");
        const bodyText = String(document.body?.innerText || "").slice(0, 1800);
          const curriculum = /(?:pyfagl|pyfaglepg|pyfacx|pyfakz|pyfadm|pyfa)/i.test(`${href} ${title}`)
            || (/培养方案查询|培养方案管理|培养计划/.test(title) && !/首页|home|portal/i.test(title));
          const courseOutline = /(?:kcdgwhgl|dgcx|课程大纲查询|课程大纲)/i.test(`${href} ${title}`);
        const loginByUrl = /(?:\/tpass\/login|\/login(?:[/?#]|$))/i.test(href);
        const loginText = /统一身份认证|用户登录|账号登录|用户名|密码/.test(`${title} ${bodyText}`);
        const hasPassword = Boolean(document.querySelector("input[type='password'],input[name*='pass' i],#password"));
          return {
            curriculum,
            courseOutline,
            loginRequired: loginByUrl || (hasPassword && loginText),
          pageUrl: href,
          title
        };
      }
    });
    const values = result.map((item) => item?.result).filter(Boolean);
    const ready = values.find((item) => item.curriculum);
    const outline = values.find((item) => item.courseOutline);
    const login = values.find((item) => item.loginRequired);
    return {
      ready: Boolean(ready),
      courseOutlineReady: Boolean(outline),
      loginRequired: !ready && Boolean(login),
      courseOutlinePage: outline?.pageUrl || "",
      pageUrl: ready?.pageUrl || login?.pageUrl || values[0]?.pageUrl || "",
      title: ready?.title || login?.title || values[0]?.title || ""
    };
  } catch (error) {
    return { ready: false, loginRequired: false, error: error?.message || "原系统页面尚未完成加载" };
  }
}

function courseOutlineRequestPath(endpoint) {
  const name = String(endpoint || "").trim();
  if (name === COURSE_OUTLINE_LIST_PATH || name === COURSE_OUTLINE_METADATA_PATH) return `/${name.replace(/^\/+/, "")}`;
  if (!COURSE_OUTLINE_DETAIL_ENDPOINTS.includes(name)) return "";
  return `/modules/kcdgwhgl/${name}`;
}

async function executeCourseOutlinePortalRequest(tabId, path, params = {}) {
  const requestPath = courseOutlineRequestPath(path);
  if (!requestPath) throw new Error("课程大纲接口不在允许范围内");
  const result = await executePortalScript(tabId, {
    target: { tabId, allFrames: true },
    world: "MAIN",
    args: [requestPath, params],
    func: (safePath, safeParams) => {
      if (!window.BH_UTILS?.doSyncAjax || !window.WIS_EMAP_SERV?.getAbsPath) {
        return { available: false, error: "当前框架尚未加载原系统请求封装" };
      }
      try {
        const payload = window.BH_UTILS.doSyncAjax(
          window.WIS_EMAP_SERV.getAbsPath(safePath),
          safeParams || {}
        );
        return { available: true, payload: payload === undefined ? null : payload };
      } catch (error) {
        return { available: true, error: error?.message || "原系统接口请求失败" };
      }
    }
  });
  const values = result.map((item) => item?.result).filter(Boolean);
  const successful = values.find((item) => item.available && !item.error);
  if (successful) return { payload: successful.payload, tabId };
  throw new Error(values.map((item) => item.error).find(Boolean) || "课程大纲页面尚未准备好");
}

async function navigatePortalTabToCourseOutline(tabId) {
  const labels = ["课程大纲查询", "课程大纲", "课程查询", "培养"];
  const clickedLabels = [];
  let lastError = "";
  const startedAt = Date.now();
  while (Date.now() - startedAt < COURSE_OUTLINE_NAVIGATION_TIMEOUT_MS) {
    try {
      const result = await executePortalScript(tabId, {
        target: { tabId, allFrames: true },
        world: "MAIN",
        args: [clickedLabels],
        func: (ignoredLabels) => {
          const href = String(location.href || "");
          const title = String(document.title || "");
          const bodyText = String(document.body?.innerText || "").slice(0, 1800);
          if (/(?:kcdgwhgl|dgcx|课程大纲查询|课程大纲)/i.test(`${href} ${title}`)
            || (/课程大纲查询|课程大纲/.test(bodyText) && !/首页|home|portal/i.test(title))) {
            return { ready: true };
          }
          const loginByUrl = /(?:\/tpass\/login|\/login(?:[/?#]|$))/i.test(href);
          const loginText = /统一身份认证|用户登录|账号登录|用户名|密码/.test(`${title} ${bodyText}`);
          if (loginByUrl || (document.querySelector("input[type='password'],input[name*='pass' i],#password") && loginText)) {
            return { loginRequired: true };
          }
          const labels = ["课程大纲查询", "课程大纲", "课程查询", "培养"];
          const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
          const candidates = [];
          const selector = "a,button,[role='button'],[onclick],li,div,span,[class*='item'],[class*='menu'],[class*='nav'],[class*='card']";
          Array.from(document.querySelectorAll(selector)).forEach((element) => {
            const text = normalize(element.innerText || element.textContent || "");
            const label = labels.find((item) => text === item || text.includes(item));
            if (!label || ignoredLabels.includes(label) || text.length > 90) return;
            const style = window.getComputedStyle?.(element);
            const rect = element.getBoundingClientRect?.();
            if (style && (style.display === "none" || style.visibility === "hidden")) return;
            if (rect && (!rect.width || !rect.height)) return;
            const interactive = /^(A|BUTTON|LI)$/i.test(element.tagName || "")
              || element.hasAttribute?.("role")
              || /item|menu|nav|card|click/i.test(String(element.className || ""));
            candidates.push({ label, text, score: (labels.length - labels.indexOf(label)) * 1000 + (text === label ? 250 : 0) + (interactive ? 100 : 0) - text.length / 10 });
          });
          candidates.sort((left, right) => right.score - left.score);
          return { candidates: candidates.slice(0, 6) };
        }
      });
      const frameResults = result.map((item) => item?.result ? { ...item.result, frameId: item.frameId } : null).filter(Boolean);
      if (frameResults.some((item) => item.ready)) return { ready: true };
      if (frameResults.some((item) => item.loginRequired)) return { loginRequired: true };
      const chosen = frameResults
        .flatMap((item) => (item.candidates || []).map((candidate) => ({ ...candidate, frameId: item.frameId })))
        .sort((left, right) => right.score - left.score)[0];
      if (chosen) {
        const clickResult = await executePortalScript(tabId, {
          target: { tabId, frameIds: [chosen.frameId] },
          world: "MAIN",
          args: [chosen.label, chosen.text],
          func: (requestedLabel, requestedText) => {
            const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
            const selector = "a,button,[role='button'],[onclick],li,div,span,[class*='item'],[class*='menu'],[class*='nav'],[class*='card']";
            const target = Array.from(document.querySelectorAll(selector)).find((element) => {
              const text = normalize(element.innerText || element.textContent || "");
              return text === requestedText && text.includes(requestedLabel);
            });
            if (!target || typeof target.click !== "function") return false;
            target.click();
            return true;
          }
        });
        if (clickResult.some((item) => item?.result === true) && !clickedLabels.includes(chosen.label)) clickedLabels.push(chosen.label);
      }
    } catch (error) {
      lastError = error?.message || "原系统页面尚未完成加载";
    }
    await delay(450);
  }
  try {
    const finalState = await inspectPortalTabState(tabId);
    if (finalState.courseOutlineReady) return { ready: true };
    if (finalState.loginRequired) return { loginRequired: true };
  } catch {
    // 上层返回可操作的重试提示。
  }
  return { ready: false, error: lastError || "没有识别到课程大纲入口，请在原系统进入“培养 → 课程查询 → 课程大纲查询”后重试" };
}

async function startCourseOutlineBootstrap(preferredTabId = null) {
  if (courseOutlineBootstrapInFlight) return courseOutlineBootstrapInFlight;
  courseOutlineBootstrapInFlight = (async () => {
    let tab = await findLatestPortalTab(preferredTabId, "outline");
    if (!tab?.id) tab = await chrome.tabs.create({ url: PORTAL_URL, active: false });
    if (!tab?.id) return { ok: false, status: "failed", error: "无法打开教务系统页面" };
    const current = await inspectPortalTabState(tab.id);
    if (current.loginRequired) return { ok: false, status: "login-required", tabId: tab.id, error: "请先在原系统完成登录" };
    if (current.courseOutlineReady) return { ok: true, status: "ready", tabId: tab.id };
    const navigation = await navigatePortalTabToCourseOutline(tab.id);
    if (navigation.loginRequired) return { ok: false, status: "login-required", tabId: tab.id, error: "请先在原系统完成登录" };
    if (!navigation.ready) return { ok: false, status: "failed", tabId: tab.id, error: navigation.error || "无法进入课程大纲查询" };
    return { ok: true, status: "ready", tabId: tab.id };
  })();
  try {
    return await courseOutlineBootstrapInFlight;
  } finally {
    courseOutlineBootstrapInFlight = null;
  }
}

async function openCourseOutlinePortalPage(preferredTabId = null) {
  const result = await startCourseOutlineBootstrap(preferredTabId);
  if (result?.tabId) await activatePortalTab(result.tabId);
  return result;
}

async function readCourseOutlinePortalRequest(endpoint, params = {}, preferredTabId = null) {
  const bootstrap = await startCourseOutlineBootstrap(preferredTabId);
  if (!bootstrap?.ok || bootstrap.status !== "ready") {
    throw new Error(bootstrap?.error || (bootstrap?.status === "login-required" ? "请先完成教务系统登录" : "课程大纲页面暂不可用"));
  }
  return executeCourseOutlinePortalRequest(bootstrap.tabId, endpoint, params);
}

async function readCourseOutlineListFromPortalTab(body = {}, preferredTabId = null) {
  return readCourseOutlinePortalRequest(COURSE_OUTLINE_LIST_PATH, body, preferredTabId);
}

async function readCourseOutlineDetailEndpoint(endpoint, body = {}, preferredTabId = null) {
  if (!COURSE_OUTLINE_DETAIL_ENDPOINTS.includes(String(endpoint || ""))) throw new Error("课程大纲章节接口不在允许范围内");
  return readCourseOutlinePortalRequest(String(endpoint), body, preferredTabId);
}

async function readCourseOutlineMetadata(preferredTabId = null) {
  return readCourseOutlinePortalRequest(COURSE_OUTLINE_METADATA_PATH, { "*json": 1 }, preferredTabId);
}

async function getCurriculumPending() {
  let pending = null;
  try {
    const stored = await chrome.storage.session.get(CURRICULUM_PENDING_KEY);
    pending = stored?.[CURRICULUM_PENDING_KEY] || null;
  } catch {
    pending = curriculumPendingFallback;
  }
  if (!pending && curriculumPendingFallback) pending = curriculumPendingFallback;
  if (pending?.createdAt && Date.now() - Number(pending.createdAt) > CURRICULUM_PENDING_MAX_AGE_MS) {
    await clearCurriculumPending();
    return null;
  }
  return pending;
}

async function setCurriculumPending(pending) {
  curriculumPendingFallback = pending || null;
  try {
    await chrome.storage.session.set({ [CURRICULUM_PENDING_KEY]: pending });
  } catch {
    // 旧版浏览器没有 storage.session 时，保留本 service worker 生命周期内的兜底状态。
  }
}

async function clearCurriculumPending() {
  curriculumPendingFallback = null;
  try {
    await chrome.storage.session.remove(CURRICULUM_PENDING_KEY);
  } catch {
    // 兼容没有 storage.session 的环境。
  }
}

function broadcastCurriculumStatus(status, message = "", error = "", tabId = null, dashboardTabId = null) {
  const payload = {
    type: "curriculum-bootstrap-status",
    status,
    message,
    error,
    tabId: Number.isFinite(Number(tabId)) ? Number(tabId) : null
  };
  try {
    chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
  } catch {
    // dashboard 可能已经关闭，状态仍会保存在下一次点击时重新计算。
  }
  if (Number.isFinite(Number(dashboardTabId))) {
    try {
      chrome.tabs.sendMessage(Number(dashboardTabId), payload, () => void chrome.runtime.lastError);
    } catch {
      // extension 页面不一定允许 tabs.sendMessage，runtime 广播已经足够。
    }
  }
}

async function activatePortalTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // 标签页可能在登录过程中被用户关闭；后续状态会通过失败消息反馈。
  }
}

async function startCurriculumBootstrap(dashboardTabId = null) {
  if (curriculumBootstrapInFlight) return curriculumBootstrapInFlight;
  curriculumBootstrapInFlight = (async () => {
    const pending = await getCurriculumPending();
    if (pending?.tabId && pending.phase === "login-required") {
      await activatePortalTab(pending.tabId);
      broadcastCurriculumStatus("login-required", "请在刚刚打开的学校页面完成登录，登录成功后会自动继续读取。", "", pending.tabId, pending.dashboardTabId || dashboardTabId);
      return { ok: true, status: "login-required", tabId: pending.tabId, message: "请完成教务系统登录，登录成功后会自动继续读取培养计划" };
    }

    broadcastCurriculumStatus("checking", "正在检查教务系统登录状态…", "", pending?.tabId || null, dashboardTabId);
    let tab = await findLatestPortalTab(pending?.tabId || null);
    if (!tab?.id) {
      tab = await chrome.tabs.create({ url: PORTAL_URL, active: false });
    }
    if (!tab?.id) return { ok: false, status: "failed", error: "无法打开教务系统页面" };

    const current = await inspectPortalTabState(tab.id);
    if (current.loginRequired) {
      const nextPending = { tabId: tab.id, dashboardTabId, phase: "login-required", createdAt: Date.now() };
      await setCurriculumPending(nextPending);
      await activatePortalTab(tab.id);
      const message = "请在刚刚打开的学校页面完成登录，登录成功后会自动继续读取培养计划。";
      broadcastCurriculumStatus("login-required", message, "", tab.id, dashboardTabId);
      return { ok: true, status: "login-required", tabId: tab.id, message };
    }

    const openingMessage = current.ready ? "正在确认培养方案页面…" : "正在进入培养方案…";
    broadcastCurriculumStatus("opening", openingMessage, "", tab.id, dashboardTabId);
    const navigation = await navigatePortalTabToCurriculum(tab.id);
    if (navigation.loginRequired) {
      const nextPending = { tabId: tab.id, dashboardTabId, phase: "login-required", createdAt: Date.now() };
      await setCurriculumPending(nextPending);
      await activatePortalTab(tab.id);
      const message = "请在刚刚打开的学校页面完成登录，登录成功后会自动继续读取培养计划。";
      broadcastCurriculumStatus("login-required", message, "", tab.id, dashboardTabId);
      return { ok: true, status: "login-required", tabId: tab.id, message };
    }
    if (!navigation.ready) {
      const error = navigation.error || "没有识别到培养方案入口，请在原系统进入“培养 → 培养方案”后重试";
      await clearCurriculumPending();
      broadcastCurriculumStatus("failed", "自动进入培养方案失败", error, tab.id, dashboardTabId);
      return { ok: false, status: "failed", tabId: tab.id, error };
    }
    await clearCurriculumPending();
    const message = "已进入培养方案页面，正在读取培养计划…";
    broadcastCurriculumStatus("ready", message, "", tab.id, dashboardTabId);
    return { ok: true, status: "ready", tabId: tab.id, message };
  })();
  try {
    return await curriculumBootstrapInFlight;
  } finally {
    curriculumBootstrapInFlight = null;
  }
}

async function resumePendingCurriculumBootstrap(tabId) {
  if (curriculumResumeLocks.has(tabId)) return;
  const pending = await getCurriculumPending();
  if (!pending || Number(pending.tabId) !== Number(tabId)) return;
  const lock = (async () => {
    try {
      const current = await inspectPortalTabState(tabId);
      if (current.loginRequired) return;
      broadcastCurriculumStatus("opening", "正在进入培养方案…", "", tabId, pending.dashboardTabId);
      const navigation = await navigatePortalTabToCurriculum(tabId);
      if (navigation.loginRequired) {
        await setCurriculumPending({ ...pending, phase: "login-required", createdAt: Date.now() });
        await activatePortalTab(tabId);
        broadcastCurriculumStatus("login-required", "请完成教务系统登录，登录成功后会自动继续读取培养计划。", "", tabId, pending.dashboardTabId);
        return;
      }
      if (!navigation.ready) {
        const error = navigation.error || "没有识别到培养方案入口，请在原系统进入“培养 → 培养方案”后重试";
        await clearCurriculumPending();
        broadcastCurriculumStatus("failed", "自动进入培养方案失败", error, tabId, pending.dashboardTabId);
        return;
      }
      await clearCurriculumPending();
      broadcastCurriculumStatus("ready", "已进入培养方案页面，正在读取培养计划…", "", tabId, pending.dashboardTabId);
    } catch (error) {
      await clearCurriculumPending();
      broadcastCurriculumStatus("failed", "自动进入培养方案失败", error?.message || "原系统页面暂时不可用", tabId, pending.dashboardTabId);
    }
  })();
  curriculumResumeLocks.set(tabId, lock);
  try {
    await lock;
  } finally {
    curriculumResumeLocks.delete(tabId);
  }
}

// 保留旧消息名，避免旧版 dashboard 或已打开的页面失去入口；新流程会继续自动读取。
async function openCurriculumPortalPage(dashboardTabId = null) {
  return startCurriculumBootstrap(dashboardTabId);
}

async function readCurriculumPlansFromPortalTab(preferredTabId = null) {
  let lastError = null;
  // 培养方案页面的表格是 iframe 进入后再异步填充的；导航已完成不代表
  // 首次注入时已经有 tr。多等几轮，避免把“正在加载”误判为当前账号没有方案。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const tab = await findLatestPortalTab(preferredTabId);
      if (!tab?.id) throw new Error("没有找到已打开的教务系统页面，请先登录原系统");
      const result = await executePortalScript(tab.id, {
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN",
        func: () => {
          const currentPlanId = String(
            window.CURRENT_PYFAGL_FAXZXG_PYFADM
              || window.CURRENT_PYFAGL_PYFADM
              || window.CURRENT_PYFA_PYFADM
              || ""
          );
          const textOf = (node) => String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
          const pageText = textOf(document.body);
          const standardRowNodes = Array.from(document.querySelectorAll("tr,[role='row']"));
          const rowNodes = [...new Set(standardRowNodes.length
            ? standardRowNodes
            : Array.from(document.querySelectorAll("[class~='row'],[class*='Row'],[class*='row']")))];
          const rowTextOf = (row) => {
            const direct = textOf(row);
            if (direct) return direct;
            return Array.from(row?.querySelectorAll?.("td,[role='cell'],th") || [])
              .map(textOf)
              .filter(Boolean)
              .join(" ");
          };
          const visibleRows = rowNodes
            .map(rowTextOf)
            .filter((text) => text && /20\d{2}\s+[^\n]+/.test(text));
          const visiblePlans = rowNodes.map((row) => {
            const rowText = rowTextOf(row);
            const tokens = rowText.split(/\s+/).filter(Boolean);
            const gradeIndex = tokens.findIndex((token) => /^20\d{2}级$/.test(token));
            if (gradeIndex < 1) return null;
            const nameTokens = tokens.slice(0, gradeIndex);
            while (nameTokens.length && /^(查看详情|查看|详情|0)$/.test(nameTokens[0])) nameTokens.shift();
            const name = nameTokens.join(" ");
            if (!name || /^(方案名称|培养方案)$/.test(name)) return null;
            const fields = tokens.slice(gradeIndex + 1);
            const attrs = ["data-key", "data-id", "data-code", "data-pyfaid", "data-pyfadm", "data-value"];
            const explicitId = attrs
              .map((attr) => row?.getAttribute(attr))
              .map((value) => String(value || "").trim())
              .find((value) => value && !/^(0|null|undefined|true|false)$/i.test(value));
            const id = explicitId || `portal-name:${encodeURIComponent(`${tokens[gradeIndex]}|${name}|${fields[1] || ""}`)}`;
            return {
              id,
              name,
              grade: tokens[gradeIndex],
              college: fields[0] || "",
              major: fields[1] || "",
              type: fields[2] || "",
              studyType: fields[3] || "",
              credit: fields[4] || "",
              level: fields[5] || "",
              status: fields.slice(6).join(" "),
              raw: { rowText, source: "当前账号原系统方案列表", explicitId: explicitId || "" }
            };
          }).filter(Boolean);
          const titleMatch = pageText.match(/(20\d{2})\s+([^\n]+?)\s+至少达到学分\s*[：:]\s*([0-9]+(?:\.[0-9]+)?)/);
          const currentPlan = titleMatch
            ? { id: currentPlanId, name: `${titleMatch[1]} ${titleMatch[2].trim()}`, grade: `${titleMatch[1]}级`, credit: titleMatch[3] }
            : { id: currentPlanId, name: "", grade: "", credit: "" };
          if (!window.BH_UTILS?.doSyncAjax || !window.WIS_EMAP_SERV?.getAbsPath) {
            return { currentPlan, visiblePlans, payload: null, visibleRows, pageUrl: location.href, error: "当前框架尚未加载培养方案接口" };
          }
          const read = (path, params) => window.BH_UTILS.doSyncAjax(
            window.WIS_EMAP_SERV.getAbsPath(path),
            params
          );
          const candidates = [
            ["/modules/pyfaglepg/pyfacx.do", { pageSize: 100, pageNumber: 1, needCount: true }],
            ["/pyfaglepg/pyfacx.do", { pageSize: 100, pageNumber: 1, needCount: true }],
            ["/modules/pyfaglepg.do", { pageSize: 100, pageNumber: 1, needCount: true }]
          ];
          const looksLikePlan = (value) => Boolean(value && typeof value === "object" && (
            value.PYFADM || value.PYFAID || value.PYFACDM || value.PYFAMC || value.PYFAM
              || value.FAMC || value.PYFANAME || value.方案名称 || value.培养方案
          ));
          const hasPlanRows = (value, depth = 0) => {
            if (depth > 7 || value === null || value === undefined) return false;
            if (Array.isArray(value)) return value.some((item) => looksLikePlan(item) || hasPlanRows(item, depth + 1));
            if (typeof value !== "object") return false;
            if (looksLikePlan(value)) return true;
            return Object.values(value).some((child) => hasPlanRows(child, depth + 1));
          };
          let lastResponse = null;
          for (const [path, params] of candidates) {
            try {
              const response = read(path, params);
              lastResponse = response;
              if (response && typeof response === "object" && hasPlanRows(response)) {
                return { currentPlan, visiblePlans, payload: response, visibleRows, path, pageUrl: location.href };
              }
            } catch {
              // 尝试同一模块的下一个版本路径。
            }
          }
          return { currentPlan, visiblePlans, payload: lastResponse, visibleRows, pageUrl: location.href };
        }
      });
      const values = result.map((item) => item?.result).filter(Boolean);
      const hasRows = (value, depth = 0) => {
        if (depth > 6 || value === null || value === undefined) return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value !== "object") return false;
        if (Array.isArray(value.rows) && value.rows.length) return true;
        return Object.values(value).some((child) => hasRows(child, depth + 1));
      };
      const value = values.find((item) => item?.visiblePlans?.length)
        || values.find((item) => item?.visibleRows?.some((row) => /20\d{2}\s+\S+.*20\d{2}级/.test(row)) && hasRows(item?.payload))
        || values.find((item) => hasRows(item?.payload))
        || values.find((item) => item?.currentPlan?.id || item?.currentPlan?.name)
        || values[0];
      if (!value) throw new Error("原系统页面没有返回培养方案列表");
      // 导航完成时，培养方案 iframe 可能已经存在，但列表 DOM 和同步接口
      // 仍在异步填充。空结果不能作为成功响应，否则会要求用户手动再刷新一次。
      const hasPlanData = Boolean(value?.visiblePlans?.length) || hasRows(value?.payload);
      if (!hasPlanData) {
        throw new Error(value?.error || "原系统培养方案列表正在加载");
      }
      return value;
    } catch (error) {
      lastError = error;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 1100 + attempt * 550));
    }
  }
  throw lastError || new Error("原系统页面读取培养方案列表失败");
}

async function openCurriculumPlanDetailInPortalTab(planId, planName = "", preferredTabId = null) {
  const tab = await findLatestPortalTab(preferredTabId);
  if (!tab?.id) return false;
  const result = await executePortalScript(tab.id, {
    target: { tabId: tab.id, allFrames: true },
    args: [String(planId || ""), String(planName || "")],
    world: "MAIN",
    func: (requestedPlanId, requestedPlanName) => {
      const rows = [...new Set(Array.from(document.querySelectorAll("tr,[role='row'],[class~='row'],[class*='Row']")))];
      const rowFor = (element) => element?.closest("tr,[role='row'],[class~='row'],[class*='Row']") || element;
      const keyFor = (element) => {
        const row = rowFor(element);
        const attrs = ["data-key", "data-id", "data-code", "data-pyfadm", "data-pyfaid", "data-value"];
        return attrs.map((attr) => row?.getAttribute(attr)).map((value) => String(value || "").trim()).find((value) => value && !/^(0|null|undefined|true|false)$/i.test(value)) || "";
      };
      const rowText = (row) => String(row?.innerText || "").replace(/\s+/g, " ").trim();
      const actionFor = (row) => Array.from(row?.querySelectorAll("a,button,[role='button'],[class*='button'],[class*='Button']") || [])
        .find((element) => /查看详情|详情|查看|培养方案/.test(String(element.innerText || element.textContent || "")))
        || row?.querySelector("a,button,[role='button']")
        || row;
      const targetRow = rows.find((row) => requestedPlanId && keyFor(row) === requestedPlanId)
        || rows.find((row) => requestedPlanName && rowText(row).includes(requestedPlanName));
      if (!targetRow) return false;
      const target = actionFor(targetRow);
      if (!target || typeof target.click !== "function") return false;
      target.click();
      return true;
    }
  });
  return result.some((item) => item?.result === true);
}

async function readCurriculumFromPortalTab(planId, planName = "", preferredTabId = null) {
  let lastError = null;
  let detailOpened = false;
  // 原系统切换培养方案后，两个接口可能先返回一次空 rows，再返回完整数据。
  // 连续短暂重试，避免把这次空响应误判成“没有课程”。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const tab = await findLatestPortalTab(preferredTabId);
      if (!tab?.id) throw new Error("没有找到已打开的教务系统页面，请先登录原系统");
      const result = await executePortalScript(tab.id, {
        target: { tabId: tab.id, allFrames: true },
        args: [String(planId || ""), String(planName || "")],
        // 这些对象由原系统脚本注入到页面主世界；隔离世界看不到它们。
        // 只读调用原系统已经使用的同步请求函数，避免重新拼 WebVPN URL。
        world: "MAIN",
        func: (requestedPlanId, requestedPlanName) => {
          const currentPlanId = String(
            window.CURRENT_PYFAGL_FAXZXG_PYFADM
              || window.CURRENT_PYFAGL_PYFADM
              || window.CURRENT_PYFA_PYFADM
              || ""
          );
          const textOf = (node) => String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
          const pageText = textOf(document.body);
          const visibleRows = Array.from(document.querySelectorAll("tr,[role='row'],[class~='row'],[class*='Row'],[class*='row']"))
            .map(textOf)
            .filter((text) => text && /20\d{2}\s+[^\n]+/.test(text));
          const titleMatch = pageText.match(/(20\d{2})\s+([^\n]+?)\s+至少达到学分\s*[：:]\s*([0-9]+(?:\.[0-9]+)?)/);
          const currentPlan = titleMatch
            ? { id: currentPlanId, name: `${titleMatch[1]} ${titleMatch[2].trim()}`, grade: `${titleMatch[1]}级`, credit: titleMatch[3] }
            : { id: currentPlanId, name: "", grade: "", credit: "" };
          const requested = String(requestedPlanId || "");
          const requestedName = String(requestedPlanName || "").trim();
          const currentMatchesRequested = !requestedName || !currentPlan.name || currentPlan.name.includes(requestedName) || requestedName.includes(currentPlan.name);
          // 不允许把当前标签页上另一个账号/另一个方案的 currentPlanId 套到当前选择项上。
          const planIds = [...new Set([requested, currentMatchesRequested ? currentPlanId : ""].filter(Boolean))];
          if (!planIds.length) throw new Error("原系统当前没有选中的培养方案");
          if (!window.BH_UTILS?.doSyncAjax || !window.WIS_EMAP_SERV?.getAbsPath) {
            return { planId: "", requestedPlanId: requested, currentPlan, visibleRows, pageUrl: location.href, error: "当前框架尚未加载培养方案接口" };
          }
          const read = (path, params) => window.BH_UTILS.doSyncAjax(
            window.WIS_EMAP_SERV.getAbsPath(path),
            params
          );
          let lastResponseError = null;
          for (const effectivePlanId of planIds) {
            try {
              const groupsResponse = read("/modules/pyfaglepg/pyfakzcx.do", { PYFADM: effectivePlanId });
              const coursesResponse = read("/modules/pyfaglepg/pyfakzkccx.do", {
                PYFADM: effectivePlanId,
                "*order": "+KCH",
                querySetting: "[[]]"
              });
              const groups = groupsResponse?.datas?.pyfakzcx || {};
              const courses = coursesResponse?.datas?.pyfakzkccx || {};
              if (groups.rows?.length || courses.rows?.length) {
                return {
                  planId: effectivePlanId,
                  requestedPlanId: requested,
                  currentPlan,
                  visibleRows,
                  pageUrl: location.href,
                  payloads: [
                    {
                      kind: "tree",
                      url: "/modules/pyfaglepg/pyfakzcx.do",
                      payload: { datas: { pyfakzcx: { rows: groups.rows || [], totalSize: groups.totalSize || groups.rows?.length || 0 } } }
                    },
                    {
                      kind: "courses",
                      url: "/modules/pyfaglepg/pyfakzkccx.do",
                      payload: { datas: { pyfakzkccx: { rows: courses.rows || [], totalSize: courses.totalSize || courses.rows?.length || 0 } } }
                    }
                  ]
                };
              }
              lastResponseError = `方案 ${effectivePlanId} 暂未返回课程`;
            } catch (error) {
              lastResponseError = error?.message || String(error);
            }
          }
          return { planId: "", requestedPlanId: requested, currentPlan, visibleRows, pageUrl: location.href, error: lastResponseError || "原系统培养方案接口暂未返回课程，正在等待页面完成加载" };
        }
      });
      const values = result.map((item) => item?.result).filter(Boolean);
      const hasCourseRows = (value) => (value?.payloads || []).some((item) => {
        const rows = item?.payload?.datas?.pyfakzcx?.rows || item?.payload?.datas?.pyfakzkccx?.rows || [];
        return Array.isArray(rows) && rows.length > 0;
      });
      const value = values.find(hasCourseRows) || values.find((item) => item?.planId && item?.payloads) || values[0];
      if (!value || !hasCourseRows(value)) {
        const message = values.map((item) => item?.error).find(Boolean) || "原系统页面没有返回培养方案数据";
        throw new Error(message);
      }
      return value;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        if (!detailOpened) {
          try {
            detailOpened = await openCurriculumPlanDetailInPortalTab(planId, planName, preferredTabId);
          } catch {
            detailOpened = false;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, detailOpened ? 1800 : 900 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error("原系统页面读取培养方案失败");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "open-portal-login") {
    openPortalLogin(message.method === LOGIN_METHOD_WECHAT ? LOGIN_METHOD_WECHAT : "password")
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ ok: false, error: error.message || "无法打开教务系统登录页" }));
    return true;
  }
  if (message?.type === "open-curriculum-portal") {
    openCurriculumPortalPage(message.dashboardTabId || sender?.tab?.id || null)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ ok: false, error: error.message || "无法打开培养方案原查询" }));
    return true;
  }
  if (message?.type === "open-course-outline-portal") {
    openCourseOutlinePortalPage(message.tabId || sender?.tab?.id || null)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ ok: false, status: "failed", error: error.message || "无法打开课程大纲原查询" }));
    return true;
  }
  if (message?.type === "course-outline-bootstrap") {
    startCourseOutlineBootstrap(message.tabId || null)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ ok: false, status: "failed", error: error.message || "无法进入课程大纲查询" }));
    return true;
  }
  if (message?.type === "course-outline-list-read") {
    readCourseOutlineListFromPortalTab(message.body || {}, message.tabId || null)
      .then((data) => sendResponse({ ok: true, data: { ...data, endpoint: COURSE_OUTLINE_LIST_PATH } }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "原系统课程大纲列表读取失败" }));
    return true;
  }
  if (message?.type === "course-outline-detail-read") {
    readCourseOutlineDetailEndpoint(message.endpoint, message.body || {}, message.tabId || null)
      .then((data) => sendResponse({ ok: true, data: { ...data, endpoint: message.endpoint } }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "原系统课程大纲章节读取失败" }));
    return true;
  }
  if (message?.type === "course-outline-metadata-read") {
    readCourseOutlineMetadata(message.tabId || null)
      .then((data) => sendResponse({ ok: true, data: { ...data, endpoint: COURSE_OUTLINE_METADATA_PATH } }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "原系统课程大纲元数据读取失败" }));
    return true;
  }
  if (message?.type === "curriculum-bootstrap") {
    startCurriculumBootstrap(message.dashboardTabId || sender?.tab?.id || null)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ ok: false, status: "failed", error: error.message || "无法自动读取培养计划" }));
    return true;
  }
  if (message?.type === "curriculum-plans-portal-read") {
    readCurriculumPlansFromPortalTab(message.tabId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "原系统页面读取培养方案列表失败" }));
    return true;
  }
  if (message?.type !== "curriculum-portal-read") return undefined;
  readCurriculumFromPortalTab(message.planId, message.planName, message.tabId)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "原系统页面读取失败" }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  resumePendingCurriculumBootstrap(tabId).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getCurriculumPending().then(async (pending) => {
    if (!pending || Number(pending.tabId) !== Number(tabId)) return;
    await clearCurriculumPending();
    broadcastCurriculumStatus("failed", "自动读取已停止", "教务系统标签页已关闭，请重新点击自动打开并读取培养计划。", tabId, pending.dashboardTabId);
  }).catch(() => undefined);
});
