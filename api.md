# 东北大学本科教务管理系统接口说明

> 本文档根据“东北大学教务焕新”插件 0.3.39 的实际请求和解析逻辑整理，覆盖成绩、考试、个人课表、全校课表、培养方案和课表/成绩分项详情。
>
> 所有接口都位于登录态和 WebVPN 保护范围内。本文只描述已授权账号的只读查询；不要把账号、密码、Cookie、SSO ticket 或 `Authorization` 信息写入代码、提交到仓库或转发给他人。接口、字段和 WebVPN 路由可能随学校系统升级而变化，开发时应保留字段别名和兜底逻辑。

## 1. 系统结构和地址

### 1.1 WebVPN 应用根地址

当前本科教务系统的 WebVPN 应用路由为：

```text
https://webvpn.neu.edu.cn/http/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db
```

登录前或部分页面中也可能看到同一路由的 `/https/` 版本：

```text
https://webvpn.neu.edu.cn/https/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db
```

登录后原系统通常会重定向到 `/http/`。实现时建议优先使用 `/http/`，请求失败后再尝试 `/https/`。上面的长串是应用路由标识，不是账号密码，也不能代替登录会话。

下面用变量表示地址：

```js
const PORTAL = "https://webvpn.neu.edu.cn/http/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";
const PORTAL_FALLBACK = "https://webvpn.neu.edu.cn/https/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";

const HOME = `${PORTAL}/jwapp/sys/homeapp/api/home`;
const KB = `${PORTAL}/jwapp/sys/kbapp`;
const KB_CONTEXT = `${PORTAL}/jwapp/sys/kbapp/*default`;
const KBBP = `${PORTAL}/jwapp/sys/kbbpapp`;
const KBBP_CONTEXT = `${PORTAL}/jwapp/sys/kbbpapp/*default`;
const JWPUB = `${PORTAL}/jwapp/sys/jwpubapp`;
const SCORE = `${PORTAL}/jwapp/sys/cjzhcxapp`;
const SCORE_CONTEXT = `${PORTAL}/jwapp/sys/cjzhcxapp/*default`;
```

### 1.2 WebVPN 目标主机标记

课表模块的原系统 XHR 通常会带一个没有值的查询参数，缺少它时可能返回 403：

```text
?vpn-12-o1-jwxt.neu.edu.cn
```

例如：

```text
${PORTAL}/jwapp/sys/kbapp/api/wdkbcx/getMyScheduleDetail.do?vpn-12-o1-jwxt.neu.edu.cn
```

该标记只用于课表模块的 WebVPN 路由识别，不是认证凭据。课表接口建议同时设置：

```http
Accept: application/json, text/plain, */*
X-Requested-With: XMLHttpRequest
```

并且不要给这些原系统 XHR 接口添加 `Fetch-Api: true`。成绩、学期等普通接口则可以带 `Fetch-Api: true`。

## 2. 通用请求规则

### 2.1 必须使用当前浏览器登录会话

插件或同源页面应使用：

```js
fetch(url, {
  credentials: "include",
  cache: "no-store"
});
```

普通网页可能被 CORS 阻止；Chrome/Edge 扩展需要在 `manifest.json` 中声明：

```json
{
  "host_permissions": ["https://webvpn.neu.edu.cn/*"]
}
```

这不会自动登录，也不会绕过统一身份认证。正确流程是：用户先在原系统完成登录，查询页再复用浏览器已有 Cookie。

### 2.2 GET 和 POST 的编码

这些接口的 POST 请求不是 JSON body，而是 `application/x-www-form-urlencoded`：

```js
function formBody(body) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null && value !== "") {
      form.set(key, String(value));
    }
  }
  return form;
}

await fetch(url, {
  method: "POST",
  headers: {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
  },
  body: formBody(body),
  credentials: "include",
  cache: "no-store"
});
```

`querySetting` 本身是一个 JSON 字符串，但它仍然作为表单字段提交，不能把整个 POST body 直接改成 JSON。

### 2.3 `/http/` 和 `/https/` 兜底

如果请求路径包含 `/jwapp/`，建议按下面顺序重试：

1. `/http/` 应用根地址；
2. `/https/` 应用根地址；
3. 课表接口再尝试 `kbapp`、`kbapp/*default`、`kbbpapp`、`kbbpapp/*default` 四个应用上下文。

`kbbpapp` 是全校课表原页面经常使用的应用名，但不同页面或系统版本可能由 `kbapp` 上下文响应，因此不能只写死一个根。

### 2.4 响应解析不要只认一个字段

同一模块的返回外层可能不同，常见数组容器包括：

```js
function firstArray(value, depth = 0) {
  if (depth > 6 || value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") return [];

  for (const key of ["datas", "rows", "items", "list", "records", "data", "result", "content"]) {
    if (value[key] !== undefined) {
      const result = firstArray(value[key], depth + 1);
      if (result.length) return result;
    }
  }
  for (const child of Object.values(value)) {
    const result = firstArray(child, depth + 1);
    if (result.length) return result;
  }
  return [];
}

function rowsOf(payload) {
  return firstArray(payload).filter((item) => item && typeof item === "object");
}
```

响应可能是数组、`{rows: []}`、`{data: {rows: []}}` 或更深层的对象。不要把 `payload.data` 当成唯一格式。

### 2.5 识别登录失效和非 JSON 响应

WebVPN 登录失效时，接口可能返回登录 HTML，而不是 JSON；也可能返回 JSON 的 401 标记。请求层应先读取文本，再尝试 JSON：

```js
const response = await fetch(url, options);
const text = await response.text();
let payload;
try {
  payload = text ? JSON.parse(text) : {};
} catch {
  if (/登录|统一身份认证|login|cas/i.test(text)) {
    throw new Error("教务系统登录已失效");
  }
  throw new Error(`接口返回非 JSON（HTTP ${response.status}）`);
}

if (!response.ok) throw new Error(`教务接口请求失败（${response.status}）`);
if (payload?.code === 401 || payload?.status === 401 || payload?.loginRequired === true) {
  throw new Error("教务系统登录已失效");
}
```

建议单次请求设置 8–12 秒超时。空数组不一定是异常，可能表示该学期尚未发布或当前筛选无结果。

## 3. 接口总览

| 功能 | 方法 | 接口路径（相对于对应根） | 关键参数 |
| --- | --- | --- | --- |
| 普通学期列表 | GET | `HOME/kb/xnxq.do` | 无 |
| 当前用户/学号 | GET | `HOME/currentUser.do` | 无 |
| 学生配置 | GET | `HOME/student/config.do` | 无 |
| 成绩简表 | GET | `HOME/student/scores.do` | `termCode` |
| 考试信息 | GET | `HOME/student/exams.do` | `termCode` |
| 课程列表 | GET | `HOME/student/courses.do` | `termCode` |
| 完整成绩表 | POST | `SCORE/modules/wdcj/cxwdcj.do` | `action/querySetting/pageIndex/pageSize` |
| 成绩分项 | POST | `SCORE_CONTEXT/api/wdcj/details.do` | `WID` |
| 原系统总平均绩点 | GET | `SCORE/api/wdcj/queryPjxfjd.do` | 无 |
| 课表模块学期 | GET/POST | `JWPUB/modules/zdgl/xnxqcx.do` | `*order=+DM` |
| 全校课表当前学期 | GET | `KB_CONTEXT/modules/qxkbcx/cxdqxnxq.do` | 无 |
| 全校课表类型 | GET/POST | `KB/api/qxkbcx/getScheduleTypeList.do` | 无 |
| 个人课表网格 | POST | `KB/api/wdkbcx/getMyScheduleDetail.do` | `XNXQDM/XQDM` |
| 全校对象列表 | POST | `KB/modules/qxkbcx/bjlb.do`、`lslb.do`、`jslb.do` | `querySetting/pageSize/pageNumber` |
| 全校对象网格详情 | POST | `KB/api/qxkbcx/getScheduleDetail.do` | `CODE/KBLX/XNXQDM/XQDM` |
| 全校对象课程列表 | POST | `KB/modules/dzymmx/cxkblbms.do` | `CODE/KBLX/XNXQDM/pageNumber` |
| 培养方案列表 | POST | `PYFA/pyfaglepg/pyfacx.do` | `pageSize/pageNumber/needCount` |
| 培养方案课组树 | GET/POST | `PYFA/pyfaglepg/pyfakzcx.do` | `PYFADM` |
| 培养方案课程维护列表 | GET/POST | `PYFA/pyfaglepg/pyfakzkccx.do` | `PYFADM/*order/querySetting` |
| 培养方案课程兜底列表 | POST | `PYFA/api/jxjcwh/getValidProcessApplication.do`、`PYFA/modules/dzepg/cxjxjclbfh.do` | `PYFADM` 或 `PYFAID/pageSize/pageNumber` |

课表相关的最后四类接口都应加 `?vpn-12-o1-jwxt.neu.edu.cn` 并尝试四个课表根地址。

## 4. 学期和用户信息

### 4.1 普通学期列表

```http
GET ${HOME}/kb/xnxq.do
```

示例调用：

```js
const payload = await get(`${HOME}/kb/xnxq.do`);
const terms = rowsOf(payload).map((row) => ({
  code: row.itemCode ?? row.XNXQDM ?? row.termCode ?? row.DM ?? row.code ?? row.value,
  name: row.itemName ?? row.XNXQMC ?? row.termName ?? row.MC ?? row.name ?? row.text
}));
```

常见字段：

| 统一字段 | 可能的原字段 | 示例 |
| --- | --- | --- |
| 学期代码 | `itemCode`、`XNXQDM`、`termCode`、`DM` | `2025-2026-2` |
| 学期名称 | `itemName`、`XNXQMC`、`termName`、`MC` | `2025-2026学年春季学期` |

如果只拿到名称，可以按如下规则推导代码：

```text
2025-2026学年秋季学期 -> 2025-2026-1
2025-2026学年春季学期 -> 2025-2026-2
```

优先使用接口返回的代码，不要只依赖名称推导。

### 4.2 当前用户和配置

```http
GET ${HOME}/currentUser.do
GET ${HOME}/student/config.do
```

两者都是辅助接口，不应阻塞其他功能。学号可能出现在以下任意字段中：

```text
xh, xsh, studentId, studentNo, studentNumber, studentCode,
student_id, student_no, userid, userno, loginid, 学号, 学籍号
```

递归搜索对象时，只接受 6–12 位数字字符串，避免把电话、时间或其他数字误认成学号。

### 4.3 全校课表模块学期

全校课表自己的学期选择不应直接复用顶部总览学期。

```http
GET ${JWPUB}/modules/zdgl/xnxqcx.do?*order=+DM
```

如果 GET 失败，使用同路径 POST：

```http
POST ${JWPUB}/modules/zdgl/xnxqcx.do
Content-Type: application/x-www-form-urlencoded

*order=+DM
```

为了读取原系统当前选中的全校课表学期，再请求：

```http
GET ${KB_CONTEXT}/modules/qxkbcx/cxdqxnxq.do
```

失败时可依次尝试 `KB` 根。当前学期可能出现在 `XNXQDM`、`DM`、`termCode`、`itemCode` 或 `code` 中。

## 5. 成绩接口

### 5.1 成绩简表（可选兜底）

```http
GET ${HOME}/student/scores.do?termCode=2025-2026-2
```

这个接口适合快速显示概览，但不同版本可能缺少课程性质、通识选修类别、修读状态等字段。完整成绩表应使用下面的 `cxwdcj.do`。

### 5.2 当前学期完整成绩表

> `wdcj.do` 是页面模型地址，直接请求可能 404；真正返回成绩数据的是 `cxwdcj.do`。

```http
POST ${SCORE}/modules/wdcj/cxwdcj.do
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Fetch-Api: true
```

表单：

```text
action=cxwdcj
querySetting=[{"name":"XNXQDM","value":"2025-2026-2","builder":"m_value_equal","linkOpt":"AND"}]
pageIndex=1
pageSize=1000
```

JavaScript：

```js
const querySetting = JSON.stringify([{
  name: "XNXQDM",
  value: termCode,
  builder: "m_value_equal",
  linkOpt: "AND"
}]);

const payload = await postForm(`${SCORE}/modules/wdcj/cxwdcj.do`, {
  action: "cxwdcj",
  querySetting,
  pageIndex: "1",
  pageSize: "1000"
});
const rows = rowsOf(payload);
```

如果 `SCORE` 根失败，可重试：

```http
POST ${SCORE_CONTEXT}/modules/wdcj/cxwdcj.do
```

### 5.3 成绩字段映射

应使用“原字段优先、英文别名兜底”的映射方式：

| 统一字段 | 常见原字段 |
| --- | --- |
| 课程名 | `KCM`、`KCMC`、`courseName`、`course`、`name` |
| 课程号 | `KCH`、`KCHM`、`courseNo`、`courseCode`、`code` |
| 学分 | `XF`、`credit`、`credits` |
| 总成绩 | `XSZCJ`、`ZCJ`、`score`、`totalScore`、`CJSZ` |
| 绩点 | `JD`、`gpa`、`gradePoint`、`XFJD` |
| 获得学期 | `XNXQDM_DISPLAY`、`XNXQMC`、`term`、`HXXXQ`、`earnedTerm`、`XNXQDM` |
| 课程类别 | `KCLBDM_DISPLAY`、`KCLBMC`、`KCLB`、`courseType`、`category` |
| 课程性质 | `KCXZDM_DISPLAY`、`KCXZMC`、`KCXZDM`、`KCXZ`、`courseNature`、`nature` |
| 通识选修类别 | `XGXKLBDM_DISPLAY`、`XGXKLBDM`、`generalElectiveCategory`、`generalCategory` |
| 考试类型 | `KSLXDM_DISPLAY`、`KSLXMC`、`KSLXDM`、`KSLX`、`examType`、`exam` |
| 修读/重修状态 | `CXCKDM_DISPLAY`、`CXCKDM`、`retakeStatus`、`retake` |
| 通过状态 | `SFJG_DISPLAY`、`SFJG`、`passStatus`、`pass`、`status` |
| 详情主键 | `WID`、`wid`、`scoreId`、`id` |

通过状态的常见转换：`1/true/是/通过/合格` 显示为“已通过”；`0/false/否/不通过/不及格` 显示为“未通过”。

### 5.4 查询全部学期并去重

平均绩点和“全部成绩”不能只请求当前下拉框学期。先取 `xnxq.do` 的所有代码，再对每个代码请求 `cxwdcj.do`：

```js
const results = await Promise.allSettled(
  termCodes.map((termCode) => loadFullScores(termCode))
);

const unique = new Map();
for (const [index, result] of results.entries()) {
  if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
  for (const row of result.value) {
    const key = row.WID
      || [row.KCH ?? row.courseNo, row.XNXQDM ?? row.termCode, row.KCM ?? row.courseName].join("|");
    if (key && !unique.has(key)) unique.set(key, row);
  }
}
const allRows = [...unique.values()];
```

不要因为某个学期返回空数组就停止；新生或尚未产生成绩的学期很常见。建议记录成功、失败和有数据的学期数量，并在 UI 中提示是否有学期未读取。

### 5.5 成绩分项详情

成绩数字对应的详情接口：

```http
POST ${SCORE_CONTEXT}/api/wdcj/details.do
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Fetch-Api: true

WID=<成绩行的 WID>
```

失败时重试：

```http
POST ${SCORE}/api/wdcj/details.do
```

常见返回形态：

```json
{
  "score": "90",
  "gradePoint": "4.0",
  "pass": true,
  "itemScores": [
    {"name": "平时成绩", "value": "92"},
    {"name": "期中成绩", "value": "88"},
    {"name": "期末成绩", "value": "90"}
  ]
}
```

实际返回也可能把上面对象嵌套在 `data` 或 `result` 中，或者将分项放在 `rows/items` 中。分项字段别名：

```text
名称：name, itemName, title, label
成绩：value, score, itemScore, result
分项代码：code, itemCode
总成绩：score, XSZCJ, ZCJ
绩点：gradePoint, JD, gpa
是否通过：pass, SFJG_DISPLAY
```

如果详情接口没有返回分项，但成绩行原始对象有 `PSCJ`、`QZCJ`、`QMCJ`，可以用它们作为最后兜底。

### 5.6 原系统平均绩点和插件计算

原系统累计平均绩点接口：

```http
GET ${SCORE}/api/wdcj/queryPjxfjd.do
```

常见字段：`ZPJXFJD`、`gpa`、`GPA`、`averageGpa`、`pjxfjd`。它是原系统的对照值，不应误认为当前学期 GPA。

按照当前已验证的东北大学规则，插件的计算流程是：

1. 请求所有可查询学期的完整成绩；
2. 取每门课的数值绩点和正数学分；
3. 对学号 25 开头或更高年级的学生，排除课程类别/性质/通识类别/原始文本中含“通识选修”的课程；
4. 同样排除“二级分制”，并将“合格、不合格、及格、不及格、通过、不通过”等二级成绩表现视为二级分制；
5. 学号 24 开头或更小的学生，不按上述两类排除；
6. 按学分加权：

```text
平均绩点 = Σ(课程绩点 × 课程学分) / Σ(计入课程学分)
```

只要绩点或学分无法解析为数值，就不把该行放入计算分母。UI 应同时显示：原系统总绩点、插件计算值、计入课程数、排除课程数、计入学分和排除原因，方便核对。

## 6. 考试信息接口

```http
GET ${HOME}/student/exams.do?termCode=2025-2026-2
```

示例：

```js
const payload = await get(`${HOME}/student/exams.do`, {
  termCode: "2025-2026-2"
});
const exams = rowsOf(payload).map(mapExam);
```

### 6.1 字段映射

| 统一字段 | 常见原字段 |
| --- | --- |
| 课程名 | `courseName`、`KCM`、`KCMC`、`course`、`name` |
| 课程号 | 课表优先使用教学班号 `teachClassId`、`courseSerialNo`、`teachClassCode`、`classCode`；成绩/课程目录再使用 `courseNo`、`KCH`、`KCHM`、`courseCode`、`code` |
| 日期 | `examDate`、`KSRQ`、`examTime`、`date` |
| 时间描述 | `examTimeDescription`、`examTimeDesc`、`KSSJMS`、`timeDescription` |
| 开始时间 | `startTime`、`KSSJ`、`beginTime`、`start` |
| 结束时间 | `endTime`、`JSSJ`、`finishTime`、`end` |
| 考场/地点 | `examPlace`、`KCDMC`、`JASMC`、`place`、`room`、`location`、`classDateAndPlace` |
| 座位号 | `examSeatNo`、`seatNo`、`seatNumber`、`seat` |
| 教师 | `teachers`、`teacherName`、`teacher`、`SKJS` |
| 考试类型 | `examTypeName`、`examType`、`KSLXDM_DISPLAY`、`KSLXMC`、`KSLX`、`type` |
| 原始状态 | `examStatus`、`KSZT`、`status` |

### 6.2 时间描述解析

教务系统经常把完整信息放在一个字符串中，例如：

```text
2026年07月06日 16:10-18:10(星期一第4场)
```

建议从日期和描述两处同时解析：

```js
const date = text.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/);
const time = text.match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
const weekday = text.match(/星期(日|天|一|二|三|四|五|六|七)/);
const session = text.match(/第\s*(\d+)\s*场/);
```

当 `examDate` 不完整时，使用 `examTimeDescription` 中的日期；当没有星期时，根据日期计算星期。状态字段有时只是数字代码（例如 `2`），不要直接展示数字，应根据考试日期动态生成“待考试 / 今日考试 / 已结束”；如果返回了非数字的明确状态文本，则优先使用文本。

## 7. 个人课表接口

个人课表需要同时读取列表和网格两个来源。

### 7.1 课程列表

```http
GET ${HOME}/student/courses.do?termCode=2025-2026-2
```

该接口适合在网格为空或原系统显示“课表尚未发布”时提供课程记录。

### 7.2 原系统课表网格

```http
POST ${KB}/api/wdkbcx/getMyScheduleDetail.do?vpn-12-o1-jwxt.neu.edu.cn
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

表单：

```text
XNXQDM=2025-2026-2
XQDM=00
```

请求选项与普通 API 不同：

```js
await fetch(`${KB}/api/wdkbcx/getMyScheduleDetail.do?vpn-12-o1-jwxt.neu.edu.cn`, {
  method: "POST",
  headers: {
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest"
  },
  body: formBody({XNXQDM: termCode, XQDM: "00"}),
  credentials: "include",
  cache: "no-store"
});
```

如果 `KB` 无结果，按以下根地址重试：

```text
KB_CONTEXT
KBBP
KBBP_CONTEXT
```

### 7.3 课程字段和优先级

| 统一字段 | 原系统字段别名 |
| --- | --- |
| 课程名 | `courseName`、`KCM`、`KCMC`、`course`、`name` |
| 课程号 | `courseNo`、`KCH`、`KCHM`、`courseCode`、`code` |
| 原始时间地点串 | `YPSJDD`、`KCSJDD`、`SKSJDD`、`classDateAndPlace`、`classInfo`、`scheduleInfo`、`timePlace`、`schedule` |
| 周次 | `weeks`、`week`、`SKZC`、`ZC`、`classWeek`、`weekRange`、`weekNo`、`weeksAndTeachers` |
| 星期 | `weekday`、`weekDay`、`SKXQ_DISPLAY`、`SKXQMC`、`SKXQ`、`XQJ`、`dayOfWeek`、`dayIndex`、`colIndex`、`columnIndex`、`day` |
| 节次 | `section`、`sectionName`、`JC`、`JCDM`、`JCS`、`JCSJ`、`period`、`lesson` |
| 起止节次 | `beginSection`/`startSection`、`endSection`/`finishSection`、`sectionIndex`/`rowIndex` |
| 教室 | `classroom`、`JASMC`、`SKDD`、`JAS`、`roomName`、`classroomName`、`room`、`place`、`location` |
| 时间 | `classTime`、`SKSJ`、`SJ`、`time`、`scheduleTime`、`beginTime`、`endTime` |
| 教师 | `teacherName`、`SKJS`、`teacher`、`teacherNames` |
| 学分 | `credit`、`XF`、`credits` |

网格记录优先使用星期、节次、周次、教师、校区和教室；列表记录只用来补充网格缺失字段。不能只按课程名合并，因为“电路原理”等课程可能在不同星期、节次或周次重复出现。应先判断课程名/课程号身份，再比较星期、节次和周次：

```js
function sameCourse(a, b) {
  const sameIdentity = (a.name && b.name && compact(a.name) === compact(b.name))
    || (a.code && b.code && compact(a.code) === compact(b.code));
  if (!sameIdentity) return false;

  const left = scheduleSignature(a); // day + section + normalized week set
  const right = scheduleSignature(b);
  return !["day", "section", "weeks"].some((key) => (
    left[key] && right[key] && left[key] !== right[key]
  ));
}
```

如果列表接口返回的是一条包含多个安排的汇总记录，而网格接口已经返回了更细的同日同节记录，应优先保留网格记录，避免把汇总记录再次渲染成重复课程。这样可以同时保留周二第 1–2 节和周四其他节次的“电路原理”。

课表接口还可能把同一教学班的多段安排放在 `cellDetail` 数组中，例如：

```json
[
  {"text": "4周,12周李硕 南湖校区 线上"},
  {"text": "1-3周,5-11周,13-14周李硕 南湖校区 机211"}
]
```

必须先提取数组中的 `text`，按“分隔符后紧跟周次”拆成多个排课段，再为每段分别生成 `weeks`、`weekday`、`section`、`teacher`、`location`。不能只取数组第一项，也不能把整个数组压成一条课程。教学班号 `courseSerialNo/teachClassId` 是原系统课表显示的编号，例如电路原理的 `A104419`，不要用成绩接口中的课程目录号覆盖它。

### 7.4 从列表重建周课表网格

当网格接口没有可识别行时，仍然使用课程列表重建网格，不要直接显示成按星期分组的长列表。

建议统一产生以下结构：

```js
{
  name: "电路原理",
  code: "A104419",
  weeks: "1-3周（单）、5-9周",
  weekday: "星期四",
  section: "第3-4节",
  time: "1-3周、5-9周 星期四 第3-4节",
  teacher: "李硕",
  location: "南湖校区 教212",
  detail: "原始时间地点文本",
  raw: {}
}
```

解析规则：

- 周次：识别 `3-18周`、`1~9周`、`第3-18周`，也兼容以逗号/顿号分隔的数字列表；`1-3周(单)` 只展开第 1、3 周，`1-4周(双)` 只展开第 2、4 周，不能按连续区间处理；
- 星期：识别 `星期一`、`周一` 和数字星期，数字 `1–6` 对应周一至周六，`0/7` 对应周日；
- 节次：识别 `第1-2节`、`1-2节`、`JC/JCDM/JCS`，单节次统一为 `第N节`；
- 地点：优先使用结构化教室字段，文本中再识别 `校区`、`楼`、`室`、`实验室`、`机211`、`大成113`、`逸209`、`线上`、`网络平台` 等片段；
- 教师：优先使用教师字段；若网格的周次字段中包含教师串，再从斜杠后的文本清理 `[主讲]`；
- 原始字段必须保留，便于解析失败时在详情弹窗中核对。

### 7.5 周次筛选

网格同时支持全部周次和指定周：

```js
function courseWeekNumbers(course) {
  const numbers = new Set();
  for (const match of String(course.weeks || "").matchAll(/(\d+)\s*(?:[-~至]\s*(\d+))?\s*周?\s*(?:[（(]\s*(单|双)\s*[）)])?/g)) {
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    const parity = match[3] === "单" ? 1 : match[3] === "双" ? 0 : null;
    for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) {
      if (parity !== null && week % 2 !== parity) continue;
      numbers.add(week);
    }
  }
  return numbers;
}

function filterByWeek(rows, selectedWeek) {
  if (selectedWeek === "all") return rows;
  const week = Number(selectedWeek);
  return rows.filter((course) => {
    const weeks = courseWeekNumbers(course);
    // 没有周次信息的课程保留，避免误删无法解析的原始数据。
    return !weeks.size || weeks.has(week);
  });
}
```

“全部周次”表示叠加显示所有周；指定第 N 周时，网格只铺该周课程。课程卡片仍应保留原始周次范围，点击后显示完整时间地点。

### 7.6 网格布局算法

建议使用“星期 × 节次”的 CSS Grid 或等价二维布局：

1. 将星期转换成 1–7；
2. 将节次转换成起止行，例如 `第3-4节` 为 `[3, 4]`；
3. 同一星期、同一节次范围的课程按冲突关系分配列；
4. 如果两门课的周次集合没有交集，它们可以共用一列并在同一卡片组中切换；
5. 只识别出星期、没有识别出节次的课程，放到网格下方的“未识别节次”区域；
6. 课程卡片必须可点击，弹出课程号、周次、星期、节次/时间、教师、地点、学分和原始字段。

## 8. 全校课表接口

全校课表分为“对象列表”和“对象课程详情”两阶段。对象可以是班级、教师或教室。

### 8.1 读取查询类型

```http
GET ${KB}/api/qxkbcx/getScheduleTypeList.do?vpn-12-o1-jwxt.neu.edu.cn
```

失败时尝试 `KB_CONTEXT`，再尝试 POST 空表单：

```http
POST ${KB}/api/qxkbcx/getScheduleTypeList.do?vpn-12-o1-jwxt.neu.edu.cn
```

类型记录常见字段：

| 统一字段 | 原字段 |
| --- | --- |
| 类型代码 | `code`、`CODE`、`itemCode`、`DM` |
| 类型名称 | `name`、`NAME`、`itemName`、`MC` |
| 查询动作 | `queryAction`、`QUERYACTION`、`query_action`、`action` |
| 权限标识 | `permission`、`PERMISSION` |

原系统的权威映射通常为：

| 类型 | 查询动作 | 列表接口 |
| --- | --- | --- |
| 班级课表 | `bjlb` | `modules/qxkbcx/bjlb.do` |
| 教师课表 | `lslb` | `modules/qxkbcx/lslb.do` |
| 教室课表 | `jslb` | `modules/qxkbcx/jslb.do` |

原系统还会返回当前账号没有权限的内部报表类型；前端应按原系统的权限结果过滤后再展示。不要只根据中文名称拼接后缀，因为教师和教室的原系统缩写不是同名拼音首字母。

### 8.2 查询班级/教师/教室列表

#### 班级列表

```http
POST ${KB}/modules/qxkbcx/bjlb.do?vpn-12-o1-jwxt.neu.edu.cn
```

#### 教师列表

```http
POST ${KB}/modules/qxkbcx/lslb.do?vpn-12-o1-jwxt.neu.edu.cn
```

#### 教室列表

```http
POST ${KB}/modules/qxkbcx/jslb.do?vpn-12-o1-jwxt.neu.edu.cn
```

三者都使用类似的表单：

```text
XNXQDM=2025-2026-2
querySetting=<JSON字符串>
pageSize=10
pageNumber=1
```

`querySetting` 的基本格式：

```js
const filters = [
  {
    name: "XNXQDM",
    value: termCode,
    linkOpt: "AND",
    builder: "equal"
  }
];

const body = {
  XNXQDM: termCode,
  querySetting: JSON.stringify(filters),
  pageSize: "10",
  pageNumber: "1"
};
```

班级模式的筛选：

```js
// 数字输入按班级代码筛选
filters.push({
  name: "CODE",
  caption: "班级代码",
  linkOpt: "AND",
  builderList: "cbl_String",
  builder: "include",
  value: "13022601"
});

// 中文输入按班级名称筛选
filters.push({
  name: "BJMC",
  caption: "班级名称",
  linkOpt: "AND",
  builderList: "cbl_String",
  builder: "include",
  value: "自动化"
});
```

教师和教室模式的关键词字段：

```text
教师：XM
教室：JASMC
其他类型：_commonFilter
```

关键词筛选同样使用：`builderList=cbl_String`、`builder=include`、`linkOpt=AND`。

### 8.3 列表分页

返回结果一般包含一个带分页元数据的集合：

```json
{
  "rows": [
    {
      "CODE": "13022601",
      "BJMC": "自动化2601",
      "XZNJ": "2026",
      "SFPK": "0"
    }
  ],
  "totalSize": 364,
  "pageSize": 10,
  "pageNumber": 1,
  "totalPage": 37
}
```

不同页面可能使用 `total`、`totalRows`、`totalCount`、`pageCount` 或 `pages`。实现时：

1. 从 `rows` 和这些字段读取第一页；
2. 计算总页数；
3. 对 `pageNumber=2...N` 继续发送同一个请求；
4. 可以按 5 页一批并发，但失败页必须记录并提示；
5. 页面显示“首页/上一页/下一页/末页”时，最好已经读取全部服务器分页，避免只显示接口默认的前 10 条。

列表行常见字段：

| 统一字段 | 常见原字段 |
| --- | --- |
| 对象代码 | `CODE`、`BJDM`、`WID`、`JSDM`、`JASDM`、`JASCODE` |
| 班级名称 | `BJMC` |
| 教师姓名 | `XM`、`JSXM` |
| 教师/教室名称 | `JSMC`、`JASMC` |
| 课程名/课程号 | `KCM`、`KCH` |
| 年级 | `XZNJ` |
| 学院 | `YXMC`、`YXDM` |
| 专业 | `ZYMC`、`ZYDM`、`ZYFXMC` |
| 校区 | `XQMC` |
| 是否排课 | `SFPK_DISPLAY`、`SFPK` |

如果 `SFPK` 是 `0`、`false`、`否` 等，应显示“未排课”，不要继续请求详情；否则可显示“查看课表”。

### 8.4 对象课表网格详情

从列表行拿到对象代码后请求：

```http
POST ${KB}/api/qxkbcx/getScheduleDetail.do?vpn-12-o1-jwxt.neu.edu.cn
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

表单：

```text
CODE=13022601
KBLX=05
XNXQDM=2025-2026-2
XQDM=00
```

`KBLX` 的常见映射：

| 对象 | 首选 `KBLX` |
| --- | --- |
| 班级 | `05` |
| 教师 | `06` |
| 教室 | `07` |

如果列表行本身有 `KBLX`，先尝试该值；再按对象类型尝试上表的默认值。旧系统可能因为对象代码字段不同而需要尝试多个候选：

```text
班级：CODE、BJDM、classCode
教师：CODE、WID、JSDM、teacherCode、teacherId
教室：CODE、WID、JASDM、JASCODE、roomCode、roomId
```

详情响应仍然用 `extractCourseRows` 一类的递归课程数组识别，并映射成个人课表相同的课程结构。`KBLX` 优先使用 `getScheduleTypeList.do` 返回的类型 `code`（当前部署教室=01、教师=02、班级=05）；旧版 06/07 只作为兼容候选。若网格接口已经返回课程，应直接展示，不要继续请求当前 WebVPN 会返回 403 的 `cxkblbms.do`。

### 8.5 体育课程名称弹窗：项目、教师和教学班明细

在全校课表或个人课表网格中，体育课程（例如 `体育(二)`）不是一条普通课程记录。原系统允许点击网格卡片里的课程名称，弹出一个标题为“列表”的表格；这个表格才包含体育项目（乒乓球、羽毛球、足球等）、每个项目的教学班号和对应教师。

接口地址：

```http
POST ${KB}/modules/qxkbcx/cxpxbxx.do?vpn-12-o1-jwxt.neu.edu.cn
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

按课程目录号读取课程号下的项目列表：

```text
querySetting=[{"name":"KCH","value":",A1801100232,","linkOpt":"and","builder":"m_value_equal"}]
```

`value` 两端的逗号是原系统筛选器的格式；`A1801100232` 是 `体育(二)` 的课程号。按单个教学班号查询也可用，但只能得到当前网格中的部分安排，不能替代课程名称弹窗：

```text
querySetting=[{"name":"JXBID","value":",A106183,A106193,","linkOpt":"and","builder":"m_value_equal"}]
```

注意：`KCH` 查询在不同部署/权限下可能返回该课程号下的全校项目（例如上千条），不能直接全部展示。插件应使用当前详情对象的班级名称/代码，在返回行的 `SKBJ`（上课对象）中做二次筛选；例如当前对象为 `自动化类2513`，只保留 `SKBJ` 包含 `自动化类2513` 或对应班级代码的行。若返回行没有 `SKBJ`，再用当前网格中的 `JXBID` 集合兜底。这样才能得到原系统点击某个体育课程后“列表”弹窗对应的项目集合，而不是全校所有体育班。

响应结构：

```json
{
  "code": "0",
  "datas": {
    "cxpxbxx": {
      "totalSize": 13,
      "pageSize": 5000,
      "rows": []
    }
  }
}
```

关键字段映射：

| 含义 | 字段 | 说明 |
| --- | --- | --- |
| 课程号 | `KCH` | 例如 `A1801100232` |
| 课程名 | `KCM` | 例如 `体育(二)` |
| 教学班号 | `JXBID` | 例如 `A106183` |
| 课序号 | `KXH` | 原系统列表中的课序号 |
| 体育项目 | `TYXMDM_DISPLAY` | 例如 `乒乓球`、`羽毛球`、`足球` |
| 体育项目代码 | `TYXMDM` | 项目代码 |
| 上课对象 | `SKBJ` | 目标班级/教学班 |
| 课程类别 | `KCLBDM_DISPLAY` | 例如 `人文社会科学类` |
| 课程性质 | `KCXZDM_DISPLAY` | `必修` 或 `选修` |
| 考核方式 | `KSLXDM_DISPLAY` | `考查` 应统一显示为“考察课” |
| 周次及教师 | `SKJSSJ` | 例如 `3-14周[理论]/程丽华[主讲]` |
| 排课结果 | `YPSJDD` | 例如 `3-14周[理论]/星期二/第三节-第四节/程丽华[主讲]` |
| 校区 | `XXXQDM_DISPLAY` | 例如 `南湖校区` |
| 排课要求 | `PKYQMS` | 原系统排课要求描述 |
| 学分 | `XF` | 课程学分 |
| 容量/人数 | `KRL` / `XKRS` | 课容量与已选人数 |

`totalSize` 取决于学期、班级和原系统当前数据；上面的 `13` 只是某个班级课表弹窗的示例，不应写死。

项目列表解析规则：

1. 全校班级详情优先用 `KCH` 查询，再按当前班级/上课对象二次筛选；个人课表卡片已经对应一个具体教学班，应直接用该卡片的 `JXBID` 查询，避免个人页面退回全校项目集合。只有缺少课程号/教学班号时才使用另一种方式兜底。
2. 从 `TYXMDM_DISPLAY` 显示项目名称，从 `SKJSSJ` 或 `YPSJDD` 提取带 `[主讲]`/`[辅导]` 标记的教师姓名。
3. 从 `YPSJDD` 解析周次、星期、节次。`第三节-第四节` 必须合并成 `第3-4节`，不能拆成两个单节。
4. `SKDD`、`JASMC` 等字段存在时显示教室；没有教室字段时显示 `XXXQDM_DISPLAY` 校区，不把整段 `YPSJDD` 错当成地点。
5. 网格详情弹窗使用筛选后的每一行作为一条体育项目明细；网格卡片仍保留当前实际排课记录，二者不能相互覆盖。

插件实现不需要打开或依赖教务系统网页：扩展页直接携带浏览器现有登录会话向上述接口发送请求（`credentials: include`），原系统标签页只作为用户手动核对数据的入口。

### 8.6 “网格未发布，但课程列表后来出现”的兼容

某些未来学期会出现以下情况：

1. `getScheduleDetail.do` 返回“课表未发布”或空数据；
2. 原系统弹出确认提示后，页面下方的课程列表接口可以返回记录；
3. 网格区域仍然看不到课程。

不要等待或依赖用户手动点击弹窗。详情查询失败或没有识别到课程后，直接调用：

```http
POST ${KB}/modules/dzymmx/cxkblbms.do?vpn-12-o1-jwxt.neu.edu.cn
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

表单：

```text
CODE=13022601
XNXQDM=2026-2027-1
KBLX=05
*order=+KKDWDM, +KCH, +JXBMC
pageSize=10
pageNumber=1
```

此接口同样分页，必须读取所有页：

```js
const base = {
  CODE: code,
  XNXQDM: termCode,
  KBLX: kblx,
  "*order": "+KKDWDM, +KCH, +JXBMC",
  pageSize: "10"
};

const first = await postScheduleList({...base, pageNumber: "1"});
const collection = findPagedCollection(first);
const total = Number(
  collection?.totalSize
  ?? collection?.total
  ?? collection?.totalRows
  ?? collection?.totalCount
  ?? collection?.rows?.length
  ?? 0
);
const size = Number(collection?.pageSize) || 10;
const pages = Math.max(1, Math.ceil(total / size));

const rows = [...(collection?.rows || [])];
for (let page = 2; page <= pages; page += 1) {
  const payload = await postScheduleList({...base, pageNumber: String(page)});
  rows.push(...(findPagedCollection(payload)?.rows || rowsOf(payload)));
}
```

列表字段中的 `SKZC`、`SKXQ`、`JC`、`SKJS`、`JASMC`、`YPSJDD` 等经过第 7 节的解析后，应该照样生成“星期 × 节次”的网格，而不是只按星期显示一列列表。

### 8.7 全校课表查询重试

未来学期尚未发布时，列表接口也可能暂时为空。当前插件的策略是：

```text
最多 8 次
每次间隔 1500 ms
全校接口单次超时 8000 ms
```

如果响应中包含“未发布、尚未、稍后、加载中、暂无、没有排课、没有课表、无数据”等提示，应保留提示并允许用户再次查询，而不是误报为“没有这个班级”。

## 9. 课程网格通用解析器

全校详情和个人课表最终都应转换成同一种内部模型：

```ts
type Course = {
  name: string;
  code: string;
  weeks: string;
  weekday: string;
  section: string;
  time: string;
  teacher: string;
  location: string;
  detail: string;
  credit: string;
  raw: Record<string, unknown>;
};
```

推荐的转换顺序：

1. 读取结构化字段；
2. 读取原始时间地点串；
3. 从文本中补齐周次、星期、节次、地点和教师；
4. 统一数字星期、节次和周次格式；
5. 保留完整 raw 对象；
6. 用 `hasGridScheduleData` 判断该行是否真的包含网格数据；
7. 网格数据有课程时，以网格为主、列表为补充；网格没有课程时，以列表为主；
8. 对同一课程去重，但不要把同课程不同周次、教师或地点错误合并成一条不可查看的记录。

课程详情弹窗至少应展示：课程号、周次、星期、节次/时间、授课教师、上课地点、学分和原始字段 JSON。

## 10. 一个可复用的最小客户端骨架

下面的代码只展示请求结构，不包含任何账号信息：

```js
const TARGET = "vpn-12-o1-jwxt.neu.edu.cn";

function withTarget(url) {
  return `${url}?${TARGET}`;
}

function toForm(body = {}) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null && value !== "") {
      form.set(key, String(value));
    }
  }
  return form;
}

async function requestJson(url, {
  method = "GET",
  query = {},
  body = null,
  xhr = false,
  timeoutMs = 12000
} = {}) {
  const target = new URL(url);
  if (method === "GET") {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        target.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    Accept: "application/json, text/plain, */*"
  };
  if (!xhr) headers["Fetch-Api"] = "true";
  if (method !== "GET" && body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    if (xhr) headers["X-Requested-With"] = "XMLHttpRequest";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method,
      headers,
      body: method === "GET" ? undefined : toForm(body),
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(/登录|login|cas/i.test(text) ? "登录已失效" : "接口返回非 JSON");
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function getTermScores(termCode) {
  const querySetting = JSON.stringify([{
    name: "XNXQDM",
    value: termCode,
    builder: "m_value_equal",
    linkOpt: "AND"
  }]);
  return requestJson(`${SCORE}/modules/wdcj/cxwdcj.do`, {
    method: "POST",
    body: {
      action: "cxwdcj",
      querySetting,
      pageIndex: "1",
      pageSize: "1000"
    }
  });
}

async function getPersonalSchedule(termCode) {
  return requestJson(withTarget(`${KB}/api/wdkbcx/getMyScheduleDetail.do`), {
    method: "POST",
    xhr: true,
    body: {XNXQDM: termCode, XQDM: "00"}
  });
}

async function getExams(termCode) {
  return requestJson(`${HOME}/student/exams.do`, {
    query: {termCode}
  });
}
```

生产代码还应加入 `/http/`/`/https/`、四个课表根、超时、401、空数据重试和全部分页处理。

## 11. 常见问题排查

### 11.1 403

优先检查：

- 是否使用当前已登录的 WebVPN Cookie；
- 课表接口 URL 是否带 `?vpn-12-o1-jwxt.neu.edu.cn`；
- 是否误用了页面入口而不是数据接口；
- 是否把 `Fetch-Api: true` 加到了原系统课表 XHR；
- 是否需要切换 `kbapp`/`kbbpapp` 或 `*default` 上下文。

### 11.2 404

优先检查：

- 成绩使用 `cxwdcj.do`，不要直接请求 `wdcj.do`；
- 全校课表使用 `qxkbcx/bjlb.do`、`lslb.do`、`jslb.do`，`qxkbcx.do` 通常只是页面入口；
- 是否把 `modules/`、`api/` 重复拼接；
- `/http/` 和 `/https/` 路由是否已经失效。

### 11.3 返回登录页面或 HTML

说明会话大概率已失效。不要尝试解析 HTML 表格；提示用户打开原系统重新登录，然后重新读取。

### 11.4 返回空数组

空数组可能是：学期未发布、班级未排课、筛选条件过严、接口上下文不对或数据正在延迟加载。全校课表应在四个课表根之间重试，并按第 8.6 节延迟重试；详情网格为空时直接请求 `cxkblbms.do`。

### 11.5 只有课程列表，没有网格

不要放弃。使用列表中的 `SKZC/SKXQ/JC/SKJS/JASMC/YPSJDD` 等字段生成统一 `Course`，再用星期和节次铺成网格。

### 11.6 GPA 对不上

检查：

- 是否查询了所有有成绩学期，而不是只查当前学期；
- 是否按学分加权；
- 学号是否以 25 级规则判断；
- 是否排除了通识选修和二级分制；
- 是否把“合格/不合格”错误转成数值 GPA；
- 是否把原系统接口返回的累计 GPA 当成当前学期 GPA。

## 12. 只读和安全要求

- 不调用选课、退课、重修报名、课程调整、成绩修改等写入接口；
- 不保存账号、密码、Cookie、验证码或统一身份认证票据；
- 不在日志中输出完整 URL 查询参数、Cookie 或原始认证响应；
- 只对当前用户有权限看到的数据做查询；
- 部署为扩展时限制 `host_permissions` 到实际 WebVPN 域名；
- 接口失败时给用户清晰提示，不要无限重试；
- 将原始字段放在本地内存中用于详情展示即可，不要上传到第三方服务器；
- 由于系统接口并非稳定公开 API，正式发布前应重新通过浏览器开发者工具核验一次请求路径、字段和响应结构。

## 13. 培养方案（培养计划）接口

培养计划在原系统中通常显示为树状的“培养方案管理”页面。原系统的树节点主要提供课组层级和学分要求，课程名称、课程号、课程类别、性质和修读学期通常来自另一个课程维护接口。因此，不能只请求一个树接口，也不能把树节点直接当成课程。

当前插件的实现顺序是：

1. 在当前登录账号的原系统页面中找到可见的培养方案列表或当前方案；
2. 用原系统页面的主世界会话读取方案列表，建立当前账号的方案边界；
3. 读取选中方案的课组树；
4. 读取同一方案的课程维护列表；
5. 将课组树和课程行按课组编号、父子关系或课组名称合并；
6. 递归展开所有层级，保留每一级的最低学分、课程合计、必修学分、选修学分和选择规则；
7. 将课程原始字段标准化后提供搜索、性质筛选、学期筛选、课程详情和 PDF 打印。

### 13.1 模块根地址和 WebVPN 标记

培养方案模块使用 pyfagl 应用上下文，与成绩、个人课表和全校课表的根地址不同：

~~~js
const PYFA_API_ROOT = PORTAL + "/jwapp/sys/pyfagl";
const PYFA_CONTEXT_ROOT = PORTAL + "/jwapp/sys/pyfagl/*default";
const PYFA_TARGET_MARKER = "vpn-12-o1-jwxt.neu.edu.cn";
~~~

扩展页面直接拼接接口时，当前实现使用：

~~~js
function pyfaUrl(root, path) {
  return root + "/" + String(path).replace(/^\/+/, "") + "?" + PYFA_TARGET_MARKER;
}
~~~

GET 参数会追加在目标标记后面，例如：

~~~text
https://webvpn.neu.edu.cn/http/<应用路由>/jwapp/sys/pyfagl/modules/pyfaglepg/pyfakzcx.do?vpn-12-o1-jwxt.neu.edu.cn&PYFADM=<方案ID>
~~~

实际部署时应同时尝试以下组合：

| 维度 | 首选 | 兜底 |
| --- | --- | --- |
| WebVPN 应用根 | /http/ | /https/ |
| pyfagl 上下文 | /jwapp/sys/pyfagl | /jwapp/sys/pyfagl/*default |
| 请求方法 | 原系统主世界同步请求 | 扩展页的 GET/POST 表单请求 |

培养方案的 WebVPN 会话校验比普通查询更严格。浏览器扩展不能假设在 extension:// 页面中直接 fetch 一定成功。

### 13.2 浏览器扩展的主世界读取方式

在桌面浏览器中，当前实现把已经打开的原系统标签页当成培养方案的唯一会话来源。Manifest 至少需要：

~~~json
{
  "permissions": ["scripting", "tabs"],
  "host_permissions": ["https://webvpn.neu.edu.cn/*"]
}
~~~

后台脚本优先选择活动的、最近访问的 WebVPN 教务系统标签页；如果没有标签页，则在后台创建教务系统标签页。随后使用主世界和全部 frame 执行读取：

~~~js
const result = await chrome.scripting.executeScript({
  target: { tabId, allFrames: true },
  world: "MAIN",
  func: () => {
    const read = (path, params) => window.BH_UTILS.doSyncAjax(
      window.WIS_EMAP_SERV.getAbsPath(path),
      params
    );
    return read("/modules/pyfaglepg/pyfakzcx.do", { PYFADM: "当前方案ID" });
  }
});
~~~

这里的 BH_UTILS 和 WIS_EMAP_SERV 是原系统页面主世界已经加载的对象。不能在扩展隔离世界中直接读取它们，否则会得到 undefined；也不要把原系统的 WebVPN Cookie、SSO ticket 或账号密码复制到扩展页面。

后台脚本提供以下消息：

| 消息类型 | 请求参数 | 返回结果 |
| --- | --- | --- |
| open-curriculum-portal | 无 | { ok, opened/already/clicked, tabId, message } |
| curriculum-plans-portal-read | 无 | { ok, data }，读取当前账号可见方案 |
| curriculum-portal-read | planId、planName | { ok, data }，读取课组树和课程列表 |

失败统一返回 { ok: false, error: "可读错误信息" }。培养方案列表读取超时约 12 秒，培养方案详情读取超时约 15 秒。

打开原系统培养方案页时，不要只根据页面正文里是否出现“培养方案”判断已经到位：首页也可能显示这个入口。当前实现同时检查 URL、页面标题和实际导航结果，并在最多 12 秒内每隔约 450 毫秒检查一次。点击入口时按“培养方案管理”“培养方案查询”“培养方案”以及“培养”菜单逐级尝试。

### 13.3 培养方案列表接口

培养方案列表接口用于找出当前账号能看到的方案，不能写死某个专业、年级或方案 ID。当前实现依次尝试：

| 用途 | 方法 | 路径（相对于 PYFA 根） | 参数 |
| --- | --- | --- | --- |
| 方案列表首选 | POST | pyfaglepg/pyfacx.do | pageSize=100、pageNumber=1、needCount=true |
| 方案列表模块路径 | POST | modules/pyfaglepg/pyfacx.do | pageSize=100、pageNumber=1、needCount=true |
| 旧版本页面入口兜底 | POST | modules/pyfaglepg.do | pageSize=100、pageNumber=1、needCount=true |

在原系统页面主世界中，三个候选路径通过同一个同步函数读取：

~~~js
const candidates = [
  ["/modules/pyfaglepg/pyfacx.do", { pageSize: 100, pageNumber: 1, needCount: true }],
  ["/pyfaglepg/pyfacx.do", { pageSize: 100, pageNumber: 1, needCount: true }],
  ["/modules/pyfaglepg.do", { pageSize: 100, pageNumber: 1, needCount: true }]
];

for (const [path, params] of candidates) {
  try {
    const payload = read(path, params);
    if (looksLikePlanResponse(payload)) return payload;
  } catch {
    // 继续尝试同模块的其他版本路径
  }
}
~~~

响应外层在不同版本中可能是数组、rows、data.rows、datas 下的对象或更深层结构。应递归读取以下常见容器：

~~~js
const preferredKeys = [
  "datas", "rows", "items", "list", "records",
  "data", "result", "content"
];
~~~

当原系统列表行没有稳定的 data-id 属性时，页面读取器可以生成临时标识：

~~~text
portal-name:<年级|方案名称|专业字段>
~~~

这种临时标识只能用于界面选择，不能拿去调用直接方案接口。必须回到原系统当前页面，通过方案名称或当前页面上下文读取详情。

### 13.4 方案、课组和课程详情接口

#### 13.4.1 课组树

树接口的主要路径和参数如下：

| 方法 | 路径 | 参数 | 主要响应位置 |
| --- | --- | --- | --- |
| GET | pyfaglepg/pyfakzcx.do | PYFADM=方案 ID | datas.pyfakzcx.rows |
| GET | modules/pyfaglepg/pyfakzcx.do | PYFADM=方案 ID | datas.pyfakzcx.rows |
| POST | pyfaglepg/pyfakzcx.do | 表单字段 PYFADM | datas.pyfakzcx.rows |
| POST | modules/pyfaglepg/pyfakzcx.do | 表单字段 PYFADM | datas.pyfakzcx.rows |
| GET | pyfaglepg/pyfacxcd.do | PYFADM=方案 ID | 旧版本树状响应兜底 |

原系统主世界中使用的请求示例：

~~~js
const groupsResponse = read(
  "/modules/pyfaglepg/pyfakzcx.do",
  { PYFADM: effectivePlanId }
);
const groups = groupsResponse?.datas?.pyfakzcx || {};
const groupRows = groups.rows || [];
~~~

#### 13.4.2 课程维护列表

课程维护列表是课程名称和课程字段的主要来源：

~~~js
const coursesResponse = read(
  "/modules/pyfaglepg/pyfakzkccx.do",
  {
    PYFADM: effectivePlanId,
    "*order": "+KCH",
    querySetting: "[[]]"
  }
);
const courses = coursesResponse?.datas?.pyfakzkccx || {};
const courseRows = courses.rows || [];
~~~

接口表：

| 方法 | 路径 | 参数 | 主要响应位置 |
| --- | --- | --- | --- |
| GET | pyfaglepg/pyfakzkccx.do | PYFADM、*order=+KCH、querySetting=[[]] | datas.pyfakzkccx.rows |
| GET | modules/pyfaglepg/pyfakzkccx.do | 同上 | datas.pyfakzkccx.rows |
| POST | pyfaglepg/pyfakzkccx.do | 表单字段同上 | datas.pyfakzkccx.rows |
| POST | modules/pyfaglepg/pyfakzkccx.do | 表单字段同上 | datas.pyfakzkccx.rows |

querySetting 是表单字段中的字符串，不是整个 POST body。不要把整个请求改成 application/json。

#### 13.4.3 课程列表兜底接口

如果原系统主世界的课程维护列表暂时为空，扩展页可以在当前 WebVPN 会话下尝试以下课程进程接口：

~~~text
POST api/jxjcwh/getValidProcessApplication.do
  PYFADM=<方案ID>
  XNXQDM1=<方案ID>
  XNXQDM=<方案ID>
  pageSize=1000
  pageNumber=1
  needCount=true

POST api/jxjcwh/getValidProcessApplication.do
  PYFAID=<方案ID>
  pageSize=1000
  pageNumber=1
  needCount=true

POST modules/dzepg/cxjxjclbfh.do
  PYFADM=<方案ID>
  pageSize=1000
  pageNumber=1
  needCount=true
~~~

这些兜底接口只能在没有拿到有效课程行时使用，并且仍然要通过 PYFA 根和 *default 根重试。课程字段若已经从原系统课程维护列表读到，应优先使用原系统课程维护列表。

当前插件的课程点击详情不是另调一个写入接口，而是从课程维护行保留的 raw 原始对象中展示全部可识别字段。这样既能显示系统当前返回的扩展字段，也不会发起选课或修改课程的请求。若将来系统新增真正的课程详情接口，应先用开发者工具确认其只读请求和权限，再作为可选补充。

### 13.5 培养方案字段映射

#### 13.5.1 方案字段

| 统一字段 | 常见原字段 | 说明 |
| --- | --- | --- |
| id | PYFADM、PYFAID、PYFACDM、WID、ID、DM、CODE | 培养方案动态 ID，不能硬编码 |
| name | PYFAMC、PYFAM、FAMC、PYFANAME、MC、name、text | 方案名称 |
| grade | NJMC、NJM、NJ、grade、XZNJ | 年级，例如 2025级 |
| college | YXMC、YX、college、院系 | 学院或院系 |
| major | ZYMC、ZY、major、年度专业 | 专业 |
| type | PYFALXMC、PYFALX、type、方案类型 | 方案类型 |
| studyType | XDLXMC、XDLX、修读类型、studyType | 修读类型 |
| level | PYCCMC、PYCC、培养层次、level | 培养层次 |
| credit | ZSXDXF、ZXS、MINXF、ZXF、leastCredit、credit、总学分 | 方案最低学分 |

原始行必须保存在 raw 中，但 raw 只用于当前内存中的详情和诊断，不应上传到第三方服务器。

#### 13.5.2 课组字段

| 统一字段 | 常见原字段 | 说明 |
| --- | --- | --- |
| id | KZDM、KZID、KZH、GROUPID、NODEID、ID、WID、DM | 课组 ID |
| name | KZMC、KZMC_DISPLAY、KZM、KZH_DISPLAY、GROUP_NAME、NODE_NAME、NODEMC、MC、name、label、text、title | 课组名称 |
| parentId | FKZH、parentId、parentNodeId、GGKZH | 父课组 ID |
| minCredits | ZSXDXF、MINXF、ZXF、YQXF、leastCredit、minCredit、credit、ZXS、KCZXF | 最低要求学分 |
| totalCredits | KCZXF、totalCredit、totalCredits、courseCredit | 课程合计学分 |
| requiredCredits | BXXF、BXXXF、BXXKXF、requiredCredit、requiredCredits | 必修学分 |
| electiveCredits | XXXF、XXXKXF、XKXF、electiveCredit、electiveCredits | 选修学分 |
| category | KCLBDM_DISPLAY、KCLBMC、KCLB、category | 课程分类 |
| kind | KZLXDM_DISPLAY、KZLXDM、kind | 课组层级/类型 |
| rule | XZTS、SELECT_RULE、RULE、selectionRule、选课规则 | 例如 3选1 |

如果最低学分没有独立字段，可以从课组名称或备注中匹配：

~~~text
至少达到学分：36.25
~~~

不要把没有直接课程的父课组显示成“零门课程”后就结束。父课组可能只负责总学分和子课组关系，课程应从下级课组显示；界面同时显示“本级直接课程数”和整棵子树的课程数会更清楚。

#### 13.5.3 课程字段

| 统一字段 | 常见原字段 | 说明 |
| --- | --- | --- |
| name | KCMC、KCM、courseName、course、COURSE_NAME、MC、name、text | 课程名称 |
| code | KCH、KCHM、KCDM、courseCode、courseNo、COURSE_CODE、code | 课程号 |
| credit | XF、XKXF、COURSE_CREDIT、credit、credits | 学分 |
| category | KCLBDM_DISPLAY、KCLBMC、KCLB、KCLB_DISPLAY、courseCategory、category | 课程类别 |
| nature | KCXZDM_DISPLAY、KCXZMC、KCXZ、KCXZ_DISPLAY、courseNature、nature | 课程性质 |
| assessment | KSLXDM_DISPLAY、KSLXMC、KSLXDM、KSLX、KSFS_DISPLAY、KSFSMC、KSFS、KHFSMC、KHFS、assessmentType、examType | 考核方式；“考试/闭卷/机考”等归一为考试课，“考查/考察”等归一为考察课 |
| requirement | KCXZDM_DISPLAY、KCXZMC、KCXZDM、KCXZ、XKXZMC、XKXZ、XXKC、required、courseRequirement | 必修/选修；课程类别或原始时间地点文本可作为兜底 |
| semester | XNXQ_DISPLAY、XQMC、XQ、XNXQMC、semester、term、KCSM | 修读学期 |
| required | KCXZDM_DISPLAY、XXKC、XXKMC、XXK、XKXZMC、XKXZ、required、courseRequirement、type | 必修/选修等要求 |
| direction | ZYFXMC、ZYFX、direction、majorDirection | 专业方向 |
| hours | XS、ZXS、hours、学时 | 学时 |
| groupId | KZDM、KZID、KZH、GROUPID、parentId、parentNodeId、PYFAKZDM | 所属课组 ID |
| groupName | KZMC、KZM、KZH_DISPLAY、GROUP_NAME、groupName | 所属课组名称 |

课程判定不能只看课程名称。当前实现将同时满足以下条件之一的行视为课程：

1. 有课程号，并且有课程名或学分；
2. 有课程名和学分，并且有课程类别或课程性质。

### 13.6 树状结构展开和课程合并

培养方案接口的数组可能嵌套在 children、nodes、items、courses、datas、pyfakzcx、pyfakzkccx、rows、data、result、content 等字段中。推荐使用递归读取，而不是固定写死一个层级：

~~~js
function childValues(raw) {
  const keys = [
    "children", "child", "nodes", "subNodes", "subItems",
    "items", "list", "courseList", "kcList", "courses",
    "datas", "pyfakzcx", "pyfakzkccx", "rows",
    "data", "result", "content"
  ];
  // 读取这些字段中的数组或对象，并继续递归
}
~~~

推荐的展开算法：

1. 以树接口为课组层级来源，以课程维护接口为课程来源；
2. 递归深度设置上限，例如 12 层，并用 WeakSet 防止循环对象重复遍历；
3. 当前对象满足课程判定时，先归入当前父课组，不再把它创建成课组；
4. 其他带名称且有子节点、学分要求、选择规则或课组类型的对象创建为课组；
5. 根据 parentId/FKZH 建立父子关系；没有父 ID 时用遍历路径补齐；
6. 课组名称去掉只用于原系统显示的 【…】 后缀，但 raw 保留原文；
7. 课程优先按 groupId 归组，其次按 groupName 匹配；
8. 仍无法归组时放入“全部课程”或“未分组”兜底课组，并保留原始 groupId；
9. 课组按路径和名称排序，课程按课程号或接口返回顺序排序。

课程去重键应包含课程号、课程名、学分和修读学期：

~~~js
const key = [
  course.code || "name",
  course.name,
  course.credit,
  course.semester
].join(":").replace(/\s+/g, "").toLowerCase();
~~~

不能只按课程名去重。同名课程可能在不同课组、不同学期或不同方向中各出现一次。

### 13.7 学期转换和筛选

原接口一般返回完整学期名或学期代码，界面需要转换为更容易理解的“大一上、大一下”：

| 原始学期 | 显示 |
| --- | --- |
| 2025-2026学年秋季学期 | 大一上 |
| 2025-2026学年春季学期 | 大一下 |
| 2026-2027学年秋季学期 | 大二上 |
| 2026-2027学年春季学期 | 大二下 |

转换规则：

1. 从方案年级字段或方案名称中读取入学年份，例如 2025级；
2. 从课程学期中读取学年起始年份，例如 2026；
3. 秋季学期或代码 -1 映射为“上”，春季学期或代码 -2 映射为“下”；
4. 年级序号为 学年起始年份 - 入学年份 + 1；
5. 将 1、2、3、4 转成 一、二、三、四；
6. 如果年份、季节或年级无法解析，保留原始学期文本，不要错误猜测。

筛选逻辑应在标准化后的内存模型上完成：

- 文本搜索覆盖课程名、课程号、类别、性质、原始学期、转换后学期和课组名称；
- 性质筛选支持全部、必修、选修；
- 学期筛选支持全部学期和当前方案实际出现的每一个“大X上/下”；
- 筛选命中子课组时，继续保留所有祖先课组，避免结果失去层级上下文；
- 默认所有课组使用 HTML details 展开，点击父级标题即可同时折叠整棵子树。

### 13.8 成绩与培养方案学分联动

培养方案里的“通识选修课”经常不是一组具体课程行，而是只有“通识选修课 / 通识教育课程模块”和最低选修学分的课组。此时不能因为课程维护接口没有返回课程名，就把它显示成未获得或直接忽略。

联动规则应与 GPA 规则分开：

1. 先请求所有可查询学期的完整成绩，并只把已通过且学分为正的成绩用于培养方案完成度；
2. 有具体课程行时，先按课程号匹配，再按标准化课程名匹配，并校验必修/选修性质；
3. 如果成绩类别或通识选修类别包含“通识”和“选修”，而培养方案中存在“通识选修课”或带选修学分的“通识教育课程模块”课组，则将该成绩作为该课组的类别成绩计入；
4. 类别成绩需要使用成绩行自己的学分，不能把课组最低学分重复当成已获得学分；
5. 25 级及以后学生的 GPA 统计仍然排除通识选修，不能把这个排除条件复用到培养方案学分统计；
6. 如果具体课程已经按课程号或课程名匹配成功，不得再按类别重复计入；
7. UI 应在课组上显示“通识选修类别计入”及门数/学分，让用户知道这不是培养方案接口漏读。
8. 通识选修通常有三个类别；类别名称/代码应优先取成绩行的 `XGXKLBDM_DISPLAY`、`XGXKLBDM` 等字段，与课组名称、课组分类或课组原始代码做标准化匹配。匹配成功后，已通过成绩只在当前页面内作为补充课程行插入对应课组，课程名、课程号、学分和获得学期都来自成绩记录；这不是对教务系统的写入。
9. 进度统计必须按课组最低/总要求、必修要求、选修要求和方案总学分分别封顶；超出某一类别要求的已通过课程仍保留在课程明细中，但不得把“已获得”显示到要求以上，也不得让“剩余所需”出现负数。
10. 导出 PDF 时必须使用原始 `group.courses`，不要把这些前端补充课程行混入导出数据；导出结果不应出现“已选通识选修”、成绩、个人完成情况或其他个人信息。

示例伪代码：

~~~js
const passedGeneralElectives = allScores.filter(score =>
  passed(score) && positiveCredit(score) && /通识.*选修/.test(allText(score))
);

if (!matchedByConcreteCourse(score)) {
  const group = findDeepestGeneralElectiveGroup(groups);
  group.categoryProgress.push({ score, source: "通识选修类别" });
}
~~~

类别联动只改变培养方案“已获得/剩余学分”显示，不改变成绩原表、原系统 GPA、课程成绩或任何教务数据。

### 13.9 当前账号边界和换账号处理

培养方案最容易出现的严重问题是把旧账号、旧标签页或其他专业的方案混进来。实现时必须遵循以下规则：

1. 不在代码中写死专业、学院、年级、最低学分或方案 ID；
2. 优先使用当前原系统页面实际显示的方案行作为候选边界；
3. 原系统详情页没有方案列表时，只使用当前详情页的 currentPlan；
4. 直接从 extension:// 页面得到的方案列表只能作为 Android 或诊断兜底，不能在浏览器中覆盖原系统当前账号边界；
5. 列表接口返回的其他方案只能补充当前页面同 ID/同名称方案的空字段，不能新增候选方案；
6. 方案切换后，如果原系统返回的实际 planId 与请求 ID 不同，以当前页面实际返回的 planId 为准；
7. 不把方案、课程或 raw 响应写入跨账号共享的持久缓存；
8. 换账号时先在原系统刷新或重新登录，再保持当前账号的培养方案页打开，最后点击插件“刷新方案”。

原系统页面读取器还会读取以下当前页面标识，按顺序取第一个非空值：

~~~js
window.CURRENT_PYFAGL_FAXZXG_PYFADM
window.CURRENT_PYFAGL_PYFADM
window.CURRENT_PYFA_PYFADM
~~~

如果当前页面没有这些标识，也不能用上一次账号的 ID 代替；应通过可见方案名称或重新打开方案详情获得当前 ID。

### 13.10 空数据、403 和延迟加载

培养方案切换后，树接口和课程接口可能先返回空 rows，过一会儿才返回完整数据。推荐策略：

| 阶段 | 当前实现 |
| --- | --- |
| 方案列表读取 | 最多 3 次尝试，失败后提示保持原系统方案页打开 |
| 方案详情读取 | 最多 3 次尝试 |
| 每次详情失败后的动作 | 首次失败时尝试点击当前方案的“查看详情”，随后等待约 1800 毫秒；其他重试等待约 900 毫秒递增 |
| 直接接口超时 | 约 7–8 秒 |
| 浏览器主世界桥接超时 | 方案列表约 12 秒，方案详情约 15 秒 |

错误处理：

- HTTP 403：优先回到原系统主世界读取，不要无限试探 pyfagl URL；
- 返回登录 HTML：提示教务系统会话失效；
- 返回空 rows：提示“方案尚未完成加载或当前页面未选中方案”，保留重新读取按钮；
- 只返回课组没有课程：仍显示课组层级和学分要求，并继续尝试课程维护列表；
- 只有课程没有树：创建“全部课程”兜底课组，不要丢弃课程；
- 换账号后方案数量异常：清空内存状态并重新从当前原系统页面建立方案边界。

### 13.11 PDF 导出

PDF 导出不是教务系统后端接口，而是当前页面将标准化后的培养方案重新生成打印 HTML：

1. 读取当前选中的方案、课组和课程；
2. 方案元数据使用白名单，只导出方案名称、年级、培养层次、方案类型、修读类型和方案最低学分；
3. 不读取或导出 raw 中的姓名、学号、账号、头像、登录标识等个人字段；
4. 完整展开课组、最低要求、课程合计、必修/选修学分、选择规则和课程表；
5. 课程表列出课程、课程号、学分、类别、性质/要求和“大X上/下”修读学期；
6. 使用 A4 打印样式，表头设置为可重复打印的 table-header-group；
7. 课程行设置 page-break-inside: avoid，课组标题设置 break-after: avoid，尽量避免课组标题和第一行课程被拆开；
8. 桌面浏览器打开独立打印页，由用户选择“另存为 PDF”；
9. 如果宿主提供 AndroidApi.printHtml，则交给 Android 系统打印服务保存 PDF。

导出页没有后端写入，也不会修改培养方案。若课程数据尚未完整读取，必须先阻止导出并提示用户刷新，不能生成只有“0 门课程”的假 PDF。

### 13.12 Android 宿主说明

Android 端没有 Chrome tabs 和 scripting 主世界，因此不能复用桌面浏览器标签页。若移动端需要实现培养方案，应在同一个 WebView 中完成教务系统登录，然后让原 WebView Cookie 通过原生网络桥接访问 PYFA 接口；不能把桌面浏览器 Cookie 复制到手机。

当前 Android 版本为了避免“手机没有浏览器原系统标签页却显示培养方案入口”的误导，界面隐藏培养计划板块。桌面插件仍按本节的主世界桥接方式提供培养方案和 PDF 导出。若要在 Android 开放该功能，应先实现同一 WebView 的登录持久化、pyfagl 会话验证、方案边界隔离和系统打印服务，再显示入口。

## 14. 课程明细排序、导出与撞课文本

### 14.1 课程名称拼音排序

全校课表的课程明细表支持三态循环排序：

```text
原始顺序 → 名称拼音 A-Z → 名称拼音 Z-A → 原始顺序
```

排序只作用于已经读取到的当前表格，不会再次请求教务系统，也不会改变课程选择状态。实现建议使用浏览器原生 `Intl.Collator`：

```js
const collator = new Intl.Collator("zh-CN-u-co-pinyin", {
  sensitivity: "base",
  numeric: true
});

rows.sort((a, b) => collator.compare(a.courseName, b.courseName));
```

其中 `numeric: true` 用于让名称中的数字按自然数顺序比较；不支持该区域排序的环境应回退到 `new Intl.Collator("zh-CN")`。表格行的稳定键必须使用原始记录索引或课程唯一标识，不能使用排序后的数组下标，否则排序后勾选状态会错位。

### 14.2 标准课程信息导出格式

插件的“课程信息导出 / 撞课查询”是本地功能，不是教务系统后端接口。导出文本为 UTF-8 JSON，顶层格式如下：

```json
{
  "schema": "neu-course-selection/v1",
  "schemaVersion": 1,
  "title": "东北大学课表课程信息",
  "source": "东北大学教务助手",
  "exportedAt": "2026-08-11T00:00:00.000Z",
  "term": "2025-2026-2",
  "queryType": "班级课表",
  "selectionScope": "all-detail",
  "courses": [
    {
      "name": "电路原理",
      "code": "A1306000008",
      "teachingCode": "A104419",
      "weeks": "1-8周、10-17周",
      "weekday": "星期二",
      "section": "第1-2节",
      "time": "08:00-09:40",
      "teacher": "李硕",
      "location": "南湖校区 机211",
      "category": "专业基础课",
      "assessment": "考试课",
      "requirement": "必修",
      "nature": "必修",
      "credit": "3.5",
      "detail": "原系统课程明细文本"
    }
  ]
}
```

导入端至少读取 `courses`，并兼容直接粘贴课程数组或使用 `items` 作为数组字段。字段名缺失时可从 `name/courseName`、`code/courseCode`、`weeks/week`、`weekday/day`、`section/period`、`teacher/instructor`、`location/classroom` 等别名读取。导出前必须递归删除密码、Cookie、Token、Authorization、验证码和 session 等敏感字段；不要上传或跨账号共享原始响应。

### 14.3 撞课判断

将导入课程与当前在“全校课表”页面打开的目标课表明细逐条比较。必须先点击某个班级、教师或教室结果的“查看课表”，再执行导入分析；不能把个人课表当作比较对象：

1. 星期不同，判定为不冲突；
2. 周次集合没有交集，判定为不冲突；
3. 节次范围没有交集，判定为不冲突；
4. 星期、周次、节次都明确且三者均重叠，判定为“确定冲突”；
5. 缺少星期、周次或节次中的任一项但其他信息可能重叠，判定为“可能冲突”，不能直接声称确定冲突；
6. 课程名称、教师、地点只用于展示和辅助判断，不替代周次、星期、节次的时间交集判断。

撞课功能只读当前全校课表明细内存数据和导入文本，不调用写接口、不修改选课或教务数据。

## 15. 本地课表覆盖层

本地课程和一次性日程是个人课表的独立覆盖层，不是教务接口的写入模型。学校接口返回的数据仍只进入 `state.data.courses`、`state.data.scheduleDetail` 和个人教务缓存；本地数据保存在 `state.localSchedule`，渲染前由 `mergedPersonalScheduleRows()` 组合。

### 15.1 数据结构与存储

持久化顶层结构固定为 `zhizhang-local-schedule/v1`：

```json
{
  "schema": "zhizhang-local-schedule/v1",
  "schemaVersion": 1,
  "profileKey": "学号或 anonymous",
  "studentId": "学号",
  "savedAt": "2026-08-18T06:00:00.000Z",
  "items": [],
  "hiddenSchoolEntries": []
}
```

`items` 中的记录使用 `source: "local"`，`type` 为 `course` 或 `event`。重复课程使用 `course.weekNumbers`、`weekdayIndex`、节次和可选的起止时间；一次性日程使用 `event.date`，可以是全天、具体时间或可选节次。`excludedWeeks` 和 `excludedDates` 只表示本地例外，不会改变学校原始记录。

Chrome 写入 `chrome.storage.local`，键名由稳定哈希后的 profile key 生成；非扩展测试/文件环境才回退到 localStorage。Android 写入应用内部 `local-schedule/`，文件名为 profile key 的 SHA-256；写入先保存到同目录临时文件，再进行原子替换。个人教务缓存仍位于独立的 `personal-cache/`，两个清除操作互不影响。

### 15.2 合并与冲突

合并顺序是“未被本地隐藏的学校排课 + 当前学期启用的本地记录”。刷新、切换学期和读取缓存都不应删除 `state.localSchedule`。当用户选择“仅保留新安排”时，只新增 `hiddenSchoolEntries` 的稳定排课键；学校数组和学校缓存永远不被删除或修改，管理页可以恢复隐藏记录。

冲突判断复用 `compareCourseScheduleOverlap()` 的星期、周次、节次和具体时间逻辑，并扩展实际日期事件：全天日程默认不参与冲突；有具体日期的事件无需先设置第一周日期即可显示和参与日期判断；若重复课程无法由当前学周映射到事件日期，则标记“可能冲突”并列出缺失的教学周，而不是声称确定冲突。不同学期不参与比较。

### 15.3 展示与导出边界

总览、个人课表日视图、周表、搜索、PNG 和 CSV 都读取合并层。没有节次的一次性日程进入周表下方的“其他日程”区域和 PNG 的未定位区域；CSV 的 WakeUp 格式无法表达没有教学周或节次的日期事件时，不伪造周次/节次，而是在导出提示中报告跳过数量。Android 继续隐藏培养计划入口，但本地课表覆盖层保留。

## 16. 课程大纲查询

课程大纲查询对应原系统路径“培养 → 课程查询 → 课程大纲查询”，属于桌面插件功能；Android 端不显示入口。课程列表和详情在扩展页面直接复用浏览器已有的 WebVPN Cookie 会话读取，不要求原系统课程大纲页面保持打开；不保存账号、密码、Cookie、Token 或完整个人查询参数。

### 16.1 课程列表

```text
POST modules/dgcx/cxlb.do
```

请求体为原系统的 URL 编码查询参数，主要包括 `*order`、`querySetting`、`pageSize`、`pageNumber`。当前页面支持课程号 `KCH`、课程名 `KCM`、开课单位 `KKDWDM`、课程类别 `KCCCDM`、课程性质/级别 `KCJBDM` 等筛选，并使用服务端 `totalSize`、`pageNumber`、`pageSize` 完成分页。响应通常包装为 `datas.cxlb`，其中包含 `rows` 和分页元数据；实现同时兼容直接数组、单对象、`rows`、未知包装层和空响应。

### 16.2 课程详情接口

选中课程后按原系统返回的课程标识和方案标识读取以下模块。某个模块失败或为空不会遮挡其他模块；每个模块可单独重试。

```text
cxkcxxx.do           基本信息
cxkcdgxx.do          教材参考与先修信息
cxkcjcxx.do          课程简介/描述
cxkcmbxx.do          课程目标
kcmbybyzccx.do       课程目标与毕业要求支撑
cxkcmbhnrdgx.do      课程目标与毕业要求对应关系
cxkccjpdff.do        课程成绩评定方法
cxkhxs.do             教学学时
cxkhxscjzb.do        学时与成绩占比
cxkhhjsz.do          教学环节设置
cxkcmbdcbz.do        课程目标达成度
cxkczlpjhgjjz.do     课程质量评价与改进
cxzbrxgxx.do         负责人/任课教师信息
cxkcdgfj.do          课程大纲附件
```

### 16.3 无损保留与直连传输

详情标准化只用于页面分组和检索，不删除原始结构。每个模块同时保留原始响应、响应状态、记录数组或单对象、`WID`/`BBWID`/`XNXQDM` 等标识、所有未知字段和 `*_DISPLAY` 字段，以及 `null`、空字符串、多行文本和原始顺序。用户可以复制或下载完整 JSON，下载内容不拼接账号信息，也不把原始对象发送到第三方。

课程大纲不依赖隐藏标签页、iframe 或原系统页面 DOM。扩展页面使用浏览器已有的 WebVPN 会话直接请求课程大纲模块：

```text
POST/GET ${PORTAL_ROOT}/jwapp/sys/kccx/...
Cookie: credentials=include
X-Requested-With: XMLHttpRequest
课程大纲目标标记：vpn-12-o2-jwxt.neu.edu.cn
```

列表请求使用 `application/x-www-form-urlencoded`，保留原系统的 `*order`、`querySetting`、`pageSize` 和 `pageNumber` 结构，并明确不发送其他模块使用的 `Fetch-Api: true`。`/http/` 和 `/https/` 入口只在网络错误、超时或 5xx 时有限重试；收到 401/403、登录页 HTML 或业务层会话失效时直接显示“教务系统登录已失效”，不会把认证失败误判为网络问题。课程详情最多并行读取 5 个章节，单个章节失败可独立重试。元数据返回的动态字典地址必须严格匹配同一 WebVPN 应用下的 `/jwapp/code/<UUID>.do`，字典失败不会阻断课程列表。

“原系统查看”按钮只负责在用户明确点击后导航到原页面，不参与课程列表或详情读取。

### 16.4 辅助元数据接口

原系统还提供课程大纲维护页的模块/字段元数据和学期辅助接口，供后续字段标签或筛选增强使用：

```text
modules/kcdgwhgl.do       课程大纲维护模块元数据
modules/kcdgwhgl.do?json=1
xnxq.do                   学期选择数据
mrxnxqcx.do               默认学期查询
```

这些辅助接口不是课程详情的必需请求；课程大纲页沿用用户当前原系统上下文，不把顶部“当前学期”选择误写为课程大纲的固定查询条件。

### 16.5 详情展示

课程大纲详情页不会把 EMAP 内部字段名直接作为主界面标签。`KCM`、`KCH`、`XF`、`XS`、`SYXS`、`KTJSXS`、`JYKKXQ` 等常见字段会分别显示为“课程名称”“课程号”“学分”“总学时”“实验学时”“课堂教学学时”“建议开课学期”；带有 `_DISPLAY`/名称别名时优先显示可读文字，重复的代码字段自动归入“系统信息”。“课程成绩评定方法”和“教材参考 / 先修”章节中的业务字段直接展示，不再放进补充信息折叠项。未知字段和空字段也不会丢失，而是按需收起；完整响应仍可在“原始数据”、复制和下载 JSON 中核对。
