const assert = require("node:assert/strict");
const fs = require("node:fs");

// 课程大纲查询现在由 dashboard.js 直接请求 WebVPN；background.js 只负责
// 用户主动点击“原系统查看”时的导航，不能再成为列表/详情读取的传输层。
const source = fs.readFileSync(require.resolve("../background.js"), "utf8");

assert.match(source, /open-course-outline-portal/);
assert.match(source, /openCourseOutlinePortalPage/);
assert.doesNotMatch(source, /course-outline-(?:bootstrap|list-read|detail-read|metadata-read|filter-options-read)/);
assert.doesNotMatch(source, /executeCourseOutlinePortalRequest|readCourseOutlinePortalRequest|executeCourseOutlineFilterOptions/);

console.log("background course-outline transport decoupling: PASS");
