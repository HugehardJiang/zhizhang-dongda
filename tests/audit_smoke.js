const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function createElementStub() {
  return {
    value: '', textContent: '', innerHTML: '', className: '', disabled: false, hidden: false, src: '',
    dataset: {}, selectedOptions: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, setAttribute(){}, remove(){}, focus(){}, setSelectionRange(){}, click(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; }, matches(){ return false; }, closest(){ return null; }
  };
}

const elements = new Map();
global.window = global;
global.document = {
  documentElement: { classList: { add(){}, remove(){}, toggle(){} } },
  getElementById(id) { if (!elements.has(id)) elements.set(id, createElementStub()); return elements.get(id); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return createElementStub(); }
};
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
global.location = { href: 'chrome-extension://test/dashboard.html' };
global.navigator = {};
global.open = () => null;
global.fetch = async () => { throw new Error('network disabled in audit smoke test'); };

const dashboardPath = path.join(__dirname, '..', 'dashboard.js');
let code = fs.readFileSync(dashboardPath, 'utf8');
code = code.replace(/\nrefresh\(\);\s*$/, '\n');
code += `
globalThis.__auditTest = {
  parseExamDate, normalizeCalendarDate, escapeHtml, mergeCurriculumPlans,
  allScheduleApiPath, mapScheduleType, scheduleTypeKind, normalizedScheduleAction,
  isSupportedAllScheduleType, allScheduleDetailIdentity, scheduleDetailTypeCodes,
  isAllSchedulePermissionError, mapCourse, parseSectionRange, courseWeekNumbers,
  splitScheduleSegments, expandMappedCourse, expandCourseRows, mergeCourseSources,
  renderScheduleGrid,
  mergePersonalCourseSources,
  calculateAverageGpa, courseIndexForScope,
  courseAtScopeIndex, courseRowsForScope, queryAllSchedule, loadAllScheduleList,
  currentAcademicWeekNumber, defaultPersonalScheduleWeek, scheduleWeekValue,
  personalScheduleRows,
  scheduleCsvEntries, buildScheduleCsv, scheduleCsvFileName,
  curriculumTreeKeys, curriculumTreeIsFullyExpanded, curriculumRequirementOverviewMarkup,
  curriculumExportMarkup, curriculumExportDocument, curriculumExportFileName,
  curriculumPdfDocumentModel, curriculumPdfPaginateBlocks,
  state,
  setLoadAllSchedulePages(fn) { loadAllSchedulePages = fn; },
  setPostAllScheduleList(fn) { postAllScheduleList = fn; }
};
`;
vm.runInThisContext(code, { filename: dashboardPath });
const t = global.__auditTest;

(async () => {
  // Input sanitization and strict calendar validation.
  assert.strictEqual(t.escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
  assert.strictEqual(t.parseExamDate('2026-02-31'), null);
  assert.strictEqual(t.parseExamDate('2025-13-01'), null);
  assert.deepStrictEqual(t.parseExamDate('2026-02-28'), {
    year: 2026, month: 2, day: 28, dateKey: '2026-02-28', timestamp: new Date(2026, 1, 28).getTime()
  });
  assert.strictEqual(t.normalizeCalendarDate('2026-02-30'), null);

  // Configured first-week Sunday drives only the personal schedule default.
  const today = new Date();
  const firstWeekSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const firstWeekText = `${firstWeekSunday.getFullYear()}-${String(firstWeekSunday.getMonth() + 1).padStart(2, '0')}-${String(firstWeekSunday.getDate()).padStart(2, '0')}`;
  t.state.calendar.firstWeekStart = firstWeekText;
  assert.strictEqual(t.currentAcademicWeekNumber(), 1);
  assert.strictEqual(t.defaultPersonalScheduleWeek(), '1');
  t.state.scheduleWeek.personal = '';
  assert.strictEqual(t.scheduleWeekValue('personal'), '1');
  assert.strictEqual(t.scheduleWeekValue('all-detail'), 'all');
  t.state.scheduleWeek.personal = 'all';
  assert.strictEqual(t.scheduleWeekValue('personal'), 'all');
  t.state.scheduleWeek.personal = '';
  assert.strictEqual(t.scheduleWeekValue('personal'), '1');
  t.state.calendar.firstWeekStart = '';
  assert.strictEqual(t.defaultPersonalScheduleWeek(), 'all');

  // Existing schedule parsing behavior remains intact.
  assert.deepStrictEqual(t.parseSectionRange('第5-8节'), { start: 5, end: 8 });
  assert.deepStrictEqual([...t.courseWeekNumbers({ weeks: '1-8周（单）、2-8周（双）' })].sort((a,b)=>a-b), [1,2,3,4,5,6,7,8]);
  const mapped = t.mapCourse({
    KCM: '电路原理', KCH: 'A123456', SKZC: '1-16周', SKXQMC: '星期二', JC: '5-8',
    SKJS: '张老师', JASMC: '信息楼101', XF: '4', KCXZDM_DISPLAY: '必修', KSLXDM_DISPLAY: '考试'
  });
  assert.strictEqual(mapped.name, '电路原理');
  assert.strictEqual(mapped.weekday, '星期二');
  assert.strictEqual(mapped.section, '第5-8节');
  assert.strictEqual(mapped.requirement, '必修');
  assert.strictEqual(mapped.assessment, '考试课');

  // The personal grid can return multiple weekday/section segments inside one
  // classDateAndPlace string. Every segment must become an independent grid
  // record; otherwise the second meeting silently disappears.
  const multiDayGridRaw = {
    courseName: '人工智能导论',
    classId: 'A117877',
    courseNo: 'A1308000022',
    classDateAndPlace: '10-17周[理论]/星期三/第一节-第二节/郭世毅[主讲]，10-17周[理论]/星期五/第五节-第六节/郭世毅[主讲]'
  };
  assert.deepStrictEqual(t.splitScheduleSegments(multiDayGridRaw.classDateAndPlace), [
    '10-17周[理论]/星期三/第一节-第二节/郭世毅[主讲]',
    '10-17周[理论]/星期五/第五节-第六节/郭世毅[主讲]'
  ]);
  const expandedGrid = t.expandMappedCourse(t.mapCourse(multiDayGridRaw));
  assert.strictEqual(expandedGrid.length, 2);
  assert.deepStrictEqual(expandedGrid.map((course) => [course.weekday, course.section]), [
    ['星期三', '第1-2节'],
    ['星期五', '第5-6节']
  ]);
  const mergedMultiDayGrid = t.mergeCourseSources([], [multiDayGridRaw]);
  assert.strictEqual(mergedMultiDayGrid.length, 2);
  const mergedWithList = t.mergeCourseSources([
    { courseName: '人工智能导论', courseNo: 'A1308000022', weeks: '10-17周', weekday: '星期三', section: '第1-2节' }
  ], [multiDayGridRaw]);
  assert.strictEqual(mergedWithList.length, 2);
  assert.ok(t.renderScheduleGrid(mergedWithList, 'personal').includes('星期五'));

  // Personal data keeps one compact course row for the table but exposes every
  // grid arrangement separately, so a course with two meetings is not lost.
  const personalMerged = t.mergePersonalCourseSources([
    { KCM: '人工智能导论', KCH: 'A1308000022', SKZC: '10-17周', SKXQMC: '星期三', JC: '1-2' }
  ], [multiDayGridRaw]);
  assert.strictEqual(personalMerged.courses.length, 1);
  assert.strictEqual(personalMerged.scheduleDetail.length, 2);
  assert.deepStrictEqual(personalMerged.scheduleDetail.map((course) => course.weekday), ['星期三', '星期五']);

  // CSV uses the complete normalized arrangement list, not the current day/week
  // view. Sunday is WakeUp's 7, and single/double week text stays intact.
  t.state.data.courses = personalMerged.courses;
  t.state.data.scheduleDetail = personalMerged.scheduleDetail;
  const csvEntries = t.scheduleCsvEntries('personal');
  assert.strictEqual(csvEntries.length, 2);
  assert.deepStrictEqual(csvEntries.map((entry) => [entry.weekday, entry.startSection, entry.endSection]), [
    ['3', '1', '2'],
    ['5', '5', '6']
  ]);
  const sunday = t.mapCourse({
    courseName: '体育(二)', SKZC: '1-9周（单）、11-16周', SKXQMC: '星期日', JC: '3-4',
    SKJS: '宋建欣', JASMC: '线上'
  });
  t.state.data.courses = [sunday];
  t.state.data.scheduleDetail = [sunday];
  const sundayEntry = t.scheduleCsvEntries('personal')[0];
  assert.deepStrictEqual(sundayEntry, {
    courseName: '体育(二)', weekday: '7', startSection: '3', endSection: '4',
    teacher: '宋建欣', location: '线上', weekText: '1-9周（单）、11-16周'
  });
  const csv = t.buildScheduleCsv([sundayEntry]);
  assert.ok(csv.startsWith('\uFEFF"课程名称","星期","开始节数","结束节数","老师","地点","周数"\r\n'));
  assert.ok(csv.includes('"体育(二)","7","3","4","宋建欣","线上","1-9周（单）、11-16周"'));
  const escaped = t.buildScheduleCsv([{ ...sundayEntry, courseName: '含"引号"' }]);
  assert.ok(escaped.includes('"含""引号"""'));

  // Curriculum expand/collapse is a single state batch over every depth, not
  // a sequence of DOM clicks. The export tree is independent and always open.
  const curriculumGroups = [];
  for (let rootIndex = 0; rootIndex < 4; rootIndex += 1) {
    const rootId = `curriculum-root-${rootIndex}`;
    curriculumGroups.push({ id: rootId, name: `一级模块${rootIndex + 1}`, parentId: "", minCredits: "40", courses: [] });
    for (let childIndex = 0; childIndex < 7; childIndex += 1) {
      const childId = `${rootId}-child-${childIndex}`;
      curriculumGroups.push({ id: childId, name: `课组${rootIndex + 1}-${childIndex + 1}`, parentId: rootId, minCredits: "5", courses: [] });
    }
  }
  const curriculumCourses = Array.from({ length: 112 }, (_, index) => ({
    name: `培养课程${index + 1}`, code: `C${String(index + 1).padStart(4, "0")}`, credit: "2",
    category: "专业基础课", nature: "必修", required: "必修", semester: "2025-2026-1", raw: {}
  }));
  curriculumCourses.forEach((course, index) => {
    curriculumGroups[1 + (index % 28)].courses.push(course);
  });
  t.state.curriculum.groups = curriculumGroups;
  t.state.curriculum.courses = curriculumCourses;
  t.state.curriculum.plans = [{ id: "curriculum-plan", name: "2025 自动化", grade: "2025级", major: "自动化", college: "信息学院", credit: "162" }];
  t.state.curriculum.selectedPlanId = "curriculum-plan";
  t.state.curriculum.selectedPlan = t.state.curriculum.plans[0];
  t.state.curriculum.expanded = {};
  const curriculumKeys = t.curriculumTreeKeys(curriculumGroups);
  assert.strictEqual(curriculumKeys.length, 32);
  assert.strictEqual(t.curriculumTreeIsFullyExpanded(curriculumGroups), false);
  t.state.curriculum.expanded = Object.fromEntries(curriculumKeys.map((key) => [key, true]));
  assert.strictEqual(t.curriculumTreeIsFullyExpanded(curriculumGroups), true);
  const interactiveTree = t.curriculumRequirementOverviewMarkup(curriculumGroups, t.state.curriculum.selectedPlan, { progressMap: new Map() });
  assert.ok(interactiveTree.includes("收起全部"));
  assert.strictEqual((interactiveTree.match(/data-tree-depth=/g) || []).length, 32);
  const exportMarkup = t.curriculumExportMarkup();
  assert.ok(exportMarkup.includes('data-curriculum-export="full"'));
  assert.strictEqual((exportMarkup.match(/<tr class="curriculum-pdf-course-row/g) || []).length, 112);
  assert.strictEqual((exportMarkup.match(/<th>/g) || []).length, 28 * 8);
  assert.ok(exportMarkup.includes("课程号"));
  assert.ok(exportMarkup.includes("完成情况"));
  assert.ok(!exportMarkup.includes("curriculum-tree-node"));
  assert.ok(!exportMarkup.includes("curriculum-tree-summary"));
  assert.ok(!exportMarkup.includes("<details"));
  const exportDocument = t.curriculumExportDocument();
  assert.strictEqual(exportDocument.format, "A4 landscape");
  assert.strictEqual(exportDocument.model.groupCount, 32);
  assert.strictEqual(exportDocument.model.courseCount, 112);
  const exportCourses = exportDocument.model.groups.flatMap((entry) => entry.group.courses || []);
  assert.strictEqual(exportCourses.at(-1).name, "培养课程112");
  assert.strictEqual(exportDocument.scale, 2);
  assert.strictEqual(t.curriculumExportFileName(t.state.curriculum.selectedPlan), "培养计划_2025级_自动化");
  const syntheticMetrics = {
    title: 24,
    summary: 24,
    structure: 24,
    groupHeadings: new Map(exportDocument.model.groups.map((entry) => [entry.key, 28])),
    continuationHeadings: new Map(exportDocument.model.groups.map((entry) => [entry.key, 24])),
    rows: new Map(exportDocument.model.groups.flatMap((entry) => (entry.group.courses || []).map((_, index) => [`${entry.key}:${index}`, 22]))),
    tableHeader: 26,
    tableGap: 9
  };
  const curriculumPaged = t.curriculumPdfPaginateBlocks(exportDocument.model, syntheticMetrics);
  const pagedCourses = curriculumPaged.flatMap((page) => page.entries.filter((entry) => entry.type === "table").flatMap((entry) => entry.rows));
  assert.ok(curriculumPaged.length > 1);
  assert.strictEqual(pagedCourses.length, 112);
  assert.strictEqual(pagedCourses.at(-1).name, "培养课程112");

  t.state.allDetail = {
    typeName: '教师课表', name: '张三', code: 'T001',
    courses: [sunday], rawRows: [sunday]
  };
  assert.strictEqual(t.scheduleCsvEntries('all-detail').length, 1);
  assert.ok(t.scheduleCsvFileName('all-detail').startsWith('教师课表_张三_'));

  // When the grid is available, a list row for the same course is metadata
  // only. Its aggregate string must not create duplicate arrangements, and a
  // list-only record without a weekday must remain a course-table row rather
  // than a fake grid booking.
  const personalGridPreferred = t.mergePersonalCourseSources([
    { courseName: '人工智能导论', courseNo: 'A1308000022', classDateAndPlace: '10-17周/星期三/第一节-第二节' },
    { courseName: '电工电子技术实验(模拟电子部分)', courseNo: 'A1312100003', classDateAndPlace: '2-8周、10-18周/南湖校区' }
  ], [multiDayGridRaw]);
  assert.strictEqual(personalGridPreferred.scheduleDetail.length, 2);
  assert.strictEqual(personalGridPreferred.courses.length, 2);
  assert.ok(personalGridPreferred.courses.some((course) => course.name === '电工电子技术实验(模拟电子部分)'));

  const personalUnscheduled = t.mergePersonalCourseSources([
    { courseName: '大学物理实验㈠', courseNo: 'A1502100031', weeks: '2-8周、10-18周', weekday: '', section: '第2-8节', classroom: '南湖校区' }
  ], [multiDayGridRaw]);
  assert.strictEqual(personalUnscheduled.scheduleDetail.length, 2);
  assert.ok(personalUnscheduled.courses.some((course) => course.name === '大学物理实验㈠'));

  // If every list row is unscheduled, no fake grid arrangement is exposed.
  const onlyUnscheduled = t.mergePersonalCourseSources([
    { courseName: '大学物理实验㈠', courseNo: 'A1502100031', weeks: '2-8周、10-18周', weekday: '', section: '第2-8节', classroom: '南湖校区' }
  ], []);
  t.state.data.courses = onlyUnscheduled.courses;
  t.state.data.scheduleDetail = [];
  assert.strictEqual(t.personalScheduleRows(t.state.data.courses).length, 0);

  // A non-empty grid response must not hide list-only courses. Both sources
  // use the same segment parser, so a list-only row keeps its full section range.
  const listOnlyMerged = t.mergePersonalCourseSources([
    { courseName: '大学物理㈡', courseNo: 'A1502000016', classDateAndPlace: '1-16周/星期二/第三节-第四节' }
  ], [multiDayGridRaw]);
  assert.strictEqual(listOnlyMerged.courses.length, 2);
  assert.ok(listOnlyMerged.scheduleDetail.some((course) => course.name === '大学物理㈡' && course.section === '第3-4节'));

  // Same course at different times must not be accidentally collapsed.
  const mergedCourses = t.mergeCourseSources([
    { KCM: '电路原理', KCH: 'A123456', SKZC: '1-16周', SKXQMC: '星期二', JC: '1-2' },
    { KCM: '电路原理', KCH: 'A123456', SKZC: '1-16周', SKXQMC: '星期四', JC: '3-4' }
  ], []);
  assert.strictEqual(mergedCourses.length, 2);

  // GPA rules that existed before the audit are preserved.
  const gpa = t.calculateAverageGpa([
    { KCM: '必修课', KCH: 'A1', XF: '2', JD: '4.0', XSZCJ: '90', KCXZDM_DISPLAY: '必修' },
    { KCM: '通识选修课', KCH: 'B1', XF: '2', JD: '2.0', XSZCJ: '70', KCLBDM_DISPLAY: '通识选修' }
  ], '3.0', '2025012345');
  assert.strictEqual(gpa.excluded, 1);
  assert.strictEqual(gpa.value, '4.0000');

  // Curriculum list merge: fallback portal ID can be replaced by real ID without duplicates.
  const plans = t.mergeCurriculumPlans(
    [{ id: 'portal-name:plan-a', name: '2024 自动化', grade: '2024级', source: 'portal' }],
    [
      { id: 'REAL-001', name: '2024 自动化', credit: '160', source: 'api' },
      { id: 'REAL-001', name: '2024 自动化专业培养方案', major: '自动化', source: 'api-2' }
    ]
  );
  assert.strictEqual(plans.length, 1);
  assert.strictEqual(plans[0].id, 'REAL-001');
  assert.strictEqual(plans[0].name, '2024 自动化专业培养方案');
  assert.strictEqual(plans[0].major, '自动化');

  // Server queryAction is authoritative; name-based endpoint mapping remains a fallback.
  assert.strictEqual(t.allScheduleApiPath('customTeacherAction', '教师课表'), 'modules/qxkbcx/customTeacherAction.do');
  assert.strictEqual(t.allScheduleApiPath('', '教师课表'), 'modules/qxkbcx/lslb.do');
  assert.strictEqual(t.allScheduleApiPath('', '未知类型'), 'modules/qxkbcx/bjlb.do');

  // The raw type endpoint also exposes internal reports that the original page
  // hides when jwAppConfig.hasPermission is false. Keep the extension aligned
  // with the three object-list routes available to the signed-in account.
  const rawTypes = [
    { code: '01', name: '教室课表', queryAction: 'jslb', permission: 'qxkbcx-jaskb' },
    { code: '02', name: '教师课表', queryAction: 'lslb', permission: 'qxkbcx-jskb' },
    { code: '03', name: '学生课表', queryAction: 'xslb', permission: 'qxkbcx-xskb' },
    { code: '05', name: '班级课表', queryAction: 'bjlb', permission: 'qxkbcx-bjkb' }
  ];
  assert.deepStrictEqual(rawTypes.map((raw) => t.mapScheduleType(raw).queryAction), ['jslb', 'lslb', 'xslb', 'bjlb']);
  assert.deepStrictEqual(rawTypes.map((raw) => t.isSupportedAllScheduleType(t.mapScheduleType(raw))), [true, true, false, true]);
  assert.strictEqual(t.normalizedScheduleAction('/modules/qxkbcx/lslb.do'), 'lslb');
  assert.strictEqual(t.scheduleTypeKind({ name: '专业方向课表' }), 'direction');
  assert.strictEqual(t.isAllSchedulePermissionError({ status: 403 }), true);

  // The current deployment uses the dynamic type code as KBLX. Teacher and
  // room details must therefore try 02 and 01 before legacy 06/07 fallbacks.
  const teacherType = { code: '02', name: '教师课表', queryAction: 'lslb' };
  const roomType = { code: '01', name: '教室课表', queryAction: 'jslb' };
  const teacherIdentity = t.allScheduleDetailIdentity({ CODE: '00009945', WID: '9839', XM: '李硕' }, teacherType);
  const roomIdentity = t.allScheduleDetailIdentity({ CODE: 'A101', JASMC: '机211' }, roomType);
  assert.strictEqual(teacherIdentity.typeCode, '02');
  assert.strictEqual(roomIdentity.typeCode, '01');
  assert.strictEqual(t.scheduleDetailTypeCodes(teacherIdentity)[0], '02');
  assert.strictEqual(t.scheduleDetailTypeCodes(roomIdentity)[0], '01');

  // Direct full-school course rows remain clickable after mapping.
  const rawCourse = { KCM: '高等数学', KCH: 'MATH001', SKJS: '李老师', JASMC: 'A101', SKXQMC: '星期一', JC: '1-2' };
  t.state.allRows = [rawCourse];
  const mappedAll = t.mapCourse(rawCourse);
  assert.strictEqual(t.courseIndexForScope(mappedAll, 'all'), 0);
  assert.strictEqual(t.courseAtScopeIndex('all', 0).name, '高等数学');
  assert.strictEqual(t.courseRowsForScope('all').length, 1);

  // Full-school list pagination retries a transient failed page instead of silently dropping it.
  const pageCalls = new Map();
  t.setPostAllScheduleList(async (body) => {
    const page = Number(body.pageNumber || 1);
    pageCalls.set(page, (pageCalls.get(page) || 0) + 1);
    if (page === 2 && pageCalls.get(page) === 1) throw new Error('transient');
    return { datas: { list: { rows: [{ KCM: `课程${page}`, KCH: `C${page}`, JC: '1-2' }], totalSize: 21, pageSize: 10 } } };
  });
  const paged = await t.loadAllScheduleList('CODE', '01', '2026-2027-1');
  assert.strictEqual(paged.rawRows.length, 3);
  assert.strictEqual(pageCalls.get(2), 2);

  // Full-school queries must not clear the independent core-data loading flag.
  t.state.scheduleTypes = [{ code: '01', name: '班级课表', queryAction: 'bjlb' }];
  t.state.allTypeCode = '01';
  t.state.allTermCode = '2026-2027-1';
  t.state.loading = true;
  t.setLoadAllSchedulePages(async () => ({ payload: {}, rows: [{ BJMC: '自动化2601', BJDM: '13022601' }], totalSize: 1 }));
  await t.queryAllSchedule();
  assert.strictEqual(t.state.loading, true);
  assert.strictEqual(t.state.allRetrying, false);

  // A slower stale full-school query cannot overwrite a newer query.
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let callNo = 0;
  t.setLoadAllSchedulePages(async () => {
    callNo += 1;
    if (callNo === 1) {
      await firstGate;
      return { payload: {}, rows: [{ BJMC: '旧结果', BJDM: 'OLD' }], totalSize: 1 };
    }
    return { payload: {}, rows: [{ BJMC: '新结果', BJDM: 'NEW' }], totalSize: 1 };
  });
  const firstQuery = t.queryAllSchedule();
  const secondQuery = t.queryAllSchedule();
  await secondQuery;
  releaseFirst();
  await firstQuery;
  assert.strictEqual(t.state.allRows[0].BJDM, 'NEW');

  console.log('audit smoke tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
