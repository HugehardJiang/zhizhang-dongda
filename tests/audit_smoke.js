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
  curriculumTreeKeys, curriculumTreeIsFullyExpanded, curriculumProgressMap, curriculumProgressOverviewMarkup, curriculumRequirementOverviewMarkup,
  curriculumExportMarkup, curriculumExportDocument, curriculumExportFileName,
  curriculumPdfDocumentModel, curriculumPdfPaginateBlocks,
  normalizeLocalScheduleItem, localScheduleItemToCourseRow, mergedPersonalScheduleRows,
  compareScheduleItemsOverlap, SCHEDULE_COLLISION_STATUS, filterCoursesForDate, overviewTodayCourses, overviewNextCourse, schoolScheduleOccurrenceKey,
  findLocalScheduleConflicts, localScheduleDraftFromItem, localScheduleEditorMarkup, localScheduleSectionOptions,
  localScheduleDefaultCourseOccurrence,
  localScheduleRowHasConflict, syncLocalScheduleEndSectionSelect, analyzeCourseTransferCollisions, renderCourseTransferCollisionResult,
  matchingTermCode, findExplicitTermCode, officialCurrentTermCode, chooseCurrentTerm,
  currentTermCandidates, configuredCurrentTermCode, currentTermCodeFor, applyCurrentTermDefaults,
  localScheduleStorageKey, localScheduleProfileKey, localSchedulePayload,
  scheduleCsvHasRows, renderPersonal, renderOverview, renderOverviewPriority, renderSettings, renderCourseDetailModal,
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

  // Academic-term defaults must follow the current-term marker/value returned
  // by the school system; a plain term list without a marker must not make the
  // first row look current just because of array order.
  const detectedTerms = [
    { code: '2025-2026-1', name: '2025-2026学年秋季学期' },
    { code: '2025-2026-2', name: '2025-2026学年春季学期' },
    { code: '2026-2027-1', name: '2026-2027学年秋季学期' }
  ];
  assert.strictEqual(t.officialCurrentTermCode({ XNXQDM: '2026-2027-1' }, detectedTerms), '2026-2027-1');
  assert.strictEqual(t.officialCurrentTermCode({ currentTerm: '2025-2026学年春季学期' }, detectedTerms), '2025-2026-2');
  assert.strictEqual(t.findExplicitTermCode({ datas: detectedTerms }, detectedTerms), '');
  assert.strictEqual(t.findExplicitTermCode({ datas: [{ XNXQDM: '2025-2026-1', isCurrent: false }, { XNXQDM: '2026-2027-1', isCurrent: true }] }, detectedTerms), '2026-2027-1');
  assert.strictEqual(t.chooseCurrentTerm(detectedTerms, [{ currentTermCode: '2025-2026-2' }]).code, '2025-2026-2');

  // Every default that means “current term” reads one persisted preference.
  // A page-level query selection becomes independent after the user touches it.
  const savedCurrentTermFixture = {
    terms: t.state.terms,
    allTerms: t.state.allTerms,
    termCode: t.state.termCode,
    allTermCode: t.state.allTermCode,
    termSelectionTouched: t.state.termSelectionTouched,
    allTermSelectionTouched: t.state.allTermSelectionTouched,
    currentTerm: { ...t.state.currentTerm }
  };
  t.state.terms = detectedTerms;
  t.state.allTerms = detectedTerms.slice();
  Object.assign(t.state.currentTerm, { mode: 'auto', overrideCode: '', detectedCode: '2025-2026-2', detectedSource: '教务系统' });
  assert.strictEqual(t.configuredCurrentTermCode(), '2025-2026-2');
  assert.strictEqual(t.currentTermCodeFor(detectedTerms), '2025-2026-2');
  t.state.termSelectionTouched = false;
  t.state.allTermSelectionTouched = false;
  t.applyCurrentTermDefaults();
  assert.strictEqual(t.state.termCode, '2025-2026-2');
  assert.strictEqual(t.state.allTermCode, '2025-2026-2');
  Object.assign(t.state.currentTerm, { mode: 'manual', overrideCode: '2026-2027-1' });
  t.applyCurrentTermDefaults();
  assert.strictEqual(t.state.termCode, '2026-2027-1');
  assert.strictEqual(t.state.allTermCode, '2026-2027-1');
  t.state.termSelectionTouched = true;
  t.state.allTermSelectionTouched = true;
  t.state.termCode = '2025-2026-1';
  t.state.allTermCode = '2025-2026-2';
  t.applyCurrentTermDefaults();
  assert.strictEqual(t.state.termCode, '2025-2026-1');
  assert.strictEqual(t.state.allTermCode, '2025-2026-2');
  // New local entries follow the central current term, not a historical term
  // currently selected only for browsing.
  assert.strictEqual(t.localScheduleDraftFromItem(null, 'course').termCode, '2026-2027-1');
  const currentTermSettingsMarkup = t.renderSettings();
  assert.ok(currentTermSettingsMarkup.includes('id="currentTermSelect"'));
  assert.ok(currentTermSettingsMarkup.includes('data-action="sync-current-term"'));
  assert.ok(currentTermSettingsMarkup.includes('各查询页仍可临时切换其他学期'));
  t.state.terms = savedCurrentTermFixture.terms;
  t.state.allTerms = savedCurrentTermFixture.allTerms;
  t.state.termCode = savedCurrentTermFixture.termCode;
  t.state.allTermCode = savedCurrentTermFixture.allTermCode;
  t.state.termSelectionTouched = savedCurrentTermFixture.termSelectionTouched;
  t.state.allTermSelectionTouched = savedCurrentTermFixture.allTermSelectionTouched;
  t.state.currentTerm = savedCurrentTermFixture.currentTerm;

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

  // Credit progress is capped by each requirement. A completed 4-credit
  // required course plus a completed 4-credit elective course must render as
  // 4/4 required, 2/2 elective, and 6/6 overall when the plan requires 6.
  const cappedRequiredCourse = {
    name: "超额必修课程", code: "CAP-REQ", credit: "4", category: "专业课",
    nature: "必修", required: "必修", groupName: "分类学分测试", semester: "2025-2026-1", raw: {}
  };
  const cappedElectiveCourse = {
    name: "超额选修课程", code: "CAP-ELE", credit: "4", category: "专业选修课",
    nature: "选修", required: "选修", groupName: "分类学分测试", semester: "2025-2026-1", raw: {}
  };
  const cappedGroup = {
    id: "credit-cap-group", name: "分类学分测试", parentId: "", minCredits: "6",
    totalCredits: "6", requiredCredits: "4", electiveCredits: "2",
    courses: [cappedRequiredCourse, cappedElectiveCourse]
  };
  const cappedPlan = { id: "credit-cap-plan", name: "学分封顶测试", credit: "6" };
  t.state.curriculum.groups = [cappedGroup];
  t.state.curriculum.courses = [cappedRequiredCourse, cappedElectiveCourse];
  t.state.curriculum.selectedPlan = cappedPlan;
  t.state.data.allScores = [
    { name: cappedRequiredCourse.name, code: cappedRequiredCourse.code, credit: "4", score: "90", raw: {} },
    { name: cappedElectiveCourse.name, code: cappedElectiveCourse.code, credit: "4", score: "90", raw: {} }
  ];
  const cappedProgress = t.curriculumProgressMap([cappedGroup]).get("credit-cap-group");
  assert.strictEqual(cappedProgress.earnedCredits, 6);
  assert.strictEqual(cappedProgress.remainingCredits, 0);
  assert.strictEqual(cappedProgress.earnedRequiredCredits, 4);
  assert.strictEqual(cappedProgress.remainingRequiredCredits, 0);
  assert.strictEqual(cappedProgress.earnedElectiveCredits, 2);
  assert.strictEqual(cappedProgress.remainingElectiveCredits, 0);
  const cappedOverview = t.curriculumProgressOverviewMarkup(cappedPlan, new Map([["credit-cap-group", cappedProgress]]));
  assert.ok(cappedOverview.includes("6</strong><span> / 6 学分"));
  assert.ok(cappedOverview.includes("4 / 4 学分"));
  assert.ok(cappedOverview.includes("2 / 2 学分"));
  assert.ok(!cappedOverview.includes("8 / 6"));
  assert.ok(!/还差[^<]*-/.test(cappedOverview));

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

  // Local schedule overlay: school data remains untouched and local data has
  // its own compact schema/adapter instead of being pushed into courses.
  const savedLocalState = JSON.parse(JSON.stringify({
    data: t.state.data,
    termCode: t.state.termCode,
    studentId: t.state.studentId,
    localSchedule: t.state.localSchedule,
    calendar: t.state.calendar
  }));
  const localSchool = t.mapCourse({
    courseName: '大学物理', courseNo: 'A-PHYS', weeks: '1-16周', weekday: '星期二', section: '第3-4节',
    teacher: '崔老师', classroom: '逸201'
  });
  const localCourse = t.normalizeLocalScheduleItem({
    id: 'local-course-a', source: 'local', type: 'course', termCode: 'LOCAL-TERM', termName: '本地测试学期',
    title: '自动控制补课', teacher: '本地老师', location: '活动中心', note: '<script>不执行</script>',
    course: { weekNumbers: [1, 2, 3, 4, 5, 6, 7, 8], weekdayIndex: 2, startSection: 4, endSection: 5, startTime: '14:00', endTime: '15:40' }
  });
  const localEvent = t.normalizeLocalScheduleItem({
    id: 'local-event-a', source: 'local', type: 'event', termCode: 'LOCAL-TERM', termName: '本地测试学期',
    title: '摄影社例会', location: '活动中心 201', note: '123',
    event: { date: '2026-08-18', allDay: false, startTime: '18:30', endTime: '20:00' }
  });
  assert.strictEqual(localCourse.source, 'local');
  assert.deepStrictEqual(localCourse.course.weekNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(localCourse.course.weekdayIndex, 2);
  assert.strictEqual(localEvent.event.date, '2026-08-18');
  const localEventRowWithNote = t.localScheduleItemToCourseRow(localEvent);
  assert.strictEqual(localEventRowWithNote.section, '');
  assert.strictEqual(t.renderScheduleGrid([localEventRowWithNote], 'personal').includes('第123节'), false);

  // A newly added course represents a one-off adjustment by default: use
  // today's weekday and only the current academic week. If the first-week
  // date is unknown, keep the week blank instead of silently adding weeks 1-16.
  t.state.calendar.firstWeekStart = '2026-08-16';
  assert.deepStrictEqual(t.localScheduleDefaultCourseOccurrence(new Date(2026, 7, 20, 12)), {
    weekNumbers: [1], weekdayIndex: 4
  });
  t.state.calendar.firstWeekStart = '';
  assert.deepStrictEqual(t.localScheduleDefaultCourseOccurrence(new Date(2026, 7, 20, 12)), {
    weekNumbers: [], weekdayIndex: 4
  });
  const localDefaultToday = new Date();
  const todaySunday = new Date(localDefaultToday.getFullYear(), localDefaultToday.getMonth(), localDefaultToday.getDate() - localDefaultToday.getDay(), 12);
  t.state.calendar.firstWeekStart = `${todaySunday.getFullYear()}-${String(todaySunday.getMonth() + 1).padStart(2, '0')}-${String(todaySunday.getDate()).padStart(2, '0')}`;
  const newCourseDraft = t.localScheduleDraftFromItem(null, 'course');
  assert.deepStrictEqual(newCourseDraft.course.weekNumbers, [1]);
  assert.strictEqual(newCourseDraft.course.weekdayIndex, localDefaultToday.getDay());
  t.state.localSchedule.editorOpen = true;
  t.state.localSchedule.draft = newCourseDraft;
  const currentCourseEditor = t.localScheduleEditorMarkup();
  assert.ok(currentCourseEditor.includes('默认只添加本周这一次'));
  assert.ok(currentCourseEditor.includes('value="1"'));
  t.state.calendar.firstWeekStart = '';
  const unknownWeekDraft = t.localScheduleDraftFromItem(null, 'course');
  assert.deepStrictEqual(unknownWeekDraft.course.weekNumbers, []);
  assert.strictEqual(unknownWeekDraft.course.weekdayIndex, localDefaultToday.getDay());
  t.state.localSchedule.draft = unknownWeekDraft;
  const unknownWeekEditor = t.localScheduleEditorMarkup();
  assert.ok(unknownWeekEditor.includes('无法自动计算当前教学周'));
  assert.ok(unknownWeekEditor.includes('id="localWeekStart" type="number" min="1" max="60" value=""'));
  t.state.localSchedule.editorOpen = false;
  t.state.localSchedule.draft = null;

  // Event fields are independent from course defaults. Empty section values
  // remain canonical nulls, including when an older payload used ""/null.
  const blankSectionEvent = t.normalizeLocalScheduleItem({
    id: 'event-blank-sections', type: 'event', termCode: 'LOCAL-TERM', title: '空节次日程',
    event: { date: '2026-08-18', startTime: '19:29', endTime: '19:35', startSection: '', endSection: null }
  });
  assert.strictEqual(blankSectionEvent.event.startSection, null);
  assert.strictEqual(blankSectionEvent.event.endSection, null);
  assert.strictEqual(blankSectionEvent.course.startSection, null);
  const newEventDraft = t.localScheduleDraftFromItem(null, 'event');
  assert.strictEqual(newEventDraft.event.startSection, null);
  assert.strictEqual(newEventDraft.event.endSection, null);
  const editedMissingEvent = t.localScheduleDraftFromItem(blankSectionEvent, 'event');
  assert.strictEqual(editedMissingEvent.event.startSection, null);
  assert.strictEqual(editedMissingEvent.event.endSection, null);
  const previousEditorState = { editorOpen: t.state.localSchedule.editorOpen, draft: t.state.localSchedule.draft, editingId: t.state.localSchedule.editingId };
  t.state.localSchedule.editorOpen = true;
  t.state.localSchedule.draft = newEventDraft;
  const eventEditorMarkup = t.localScheduleEditorMarkup();
  assert.strictEqual((eventEditorMarkup.match(/<option value="" selected>未指定<\/option>/g) || []).length, 2);
  assert.strictEqual(eventEditorMarkup.includes('<option value="1" selected>第1节</option>'), false);
  t.state.localSchedule.editorOpen = previousEditorState.editorOpen;
  t.state.localSchedule.draft = previousEditorState.draft;
  t.state.localSchedule.editingId = previousEditorState.editingId;
  const endSectionSelect = document.getElementById('localEndSection');
  endSectionSelect.options = [{ value: '', hidden: false }, { value: '2', hidden: false }, { value: '3', hidden: false }, { value: '4', hidden: false }];
  endSectionSelect.value = '';
  t.syncLocalScheduleEndSectionSelect('3');
  assert.strictEqual(endSectionSelect.value, '3');
  t.syncLocalScheduleEndSectionSelect('');
  assert.strictEqual(endSectionSelect.value, '');
  t.state.termCode = 'LOCAL-TERM';
  t.state.studentId = 'student-A';
  t.state.calendar.firstWeekStart = '';
  t.state.data.courses = [localSchool];
  t.state.data.scheduleDetail = [localSchool];
  t.state.localSchedule = {
    hydrated: true, loading: false, items: [localCourse, localEvent], hiddenSchoolEntries: [],
    profileKey: 'student-A', editorOpen: false, managerOpen: false, editingId: '', draft: null,
    editorError: '', conflict: null, filter: 'all', corrupted: false, lastCsvSkipped: 0
  };
  const localRows = t.mergedPersonalScheduleRows(t.state.data.courses);
  assert.strictEqual(localRows.filter((row) => row.source === 'local').length, 2);
  assert.strictEqual(t.state.data.courses.some((row) => row.source === 'local'), false);
  assert.strictEqual(t.state.data.scheduleDetail.some((row) => row.source === 'local'), false);
  assert.ok(localRows.some((row) => row.localId === 'local-course-a' && row.weekday === '星期二'));
  const localPersonalMarkup = t.renderPersonal();
  assert.ok(localPersonalMarkup.includes('自动控制补课'));
  assert.ok(localPersonalMarkup.includes('open-local-editor'));
  assert.ok(localPersonalMarkup.includes('管理自定义安排'));
  const localSettingsMarkup = t.renderSettings();
  assert.ok(localSettingsMarkup.includes('清除教务缓存'));
  assert.ok(localSettingsMarkup.includes('清除全部自定义安排'));
  assert.ok(!localSettingsMarkup.includes('value="builtin"'));
  assert.ok(!localSettingsMarkup.includes('Android Keystore'));
  t.state.selectedCourse = t.localScheduleItemToCourseRow(localEvent);
  assert.ok(t.renderCourseDetailModal().includes('自定义安排详情'));
  assert.ok(t.renderOverview().includes('自定义安排详情'));
  const overviewPriorityMarkup = t.renderOverviewPriority({
    state: 'next', course: localRows.find((row) => row.localId === 'local-course-a'), until: 30
  });
  assert.ok(overviewPriorityMarkup.startsWith('<button'));
  assert.ok(overviewPriorityMarkup.includes('data-action="show-local-schedule"'));
  assert.ok(t.renderOverviewPriority({ state: 'next', course: localSchool, until: 30 }).includes('data-action="show-course"'));
  t.state.selectedCourse = null;
  assert.ok(t.renderOverview().includes('今天安排'));

  // An exact-date event is visible without firstWeekStart; a recurring school
  // course remains conservatively excluded until the academic week is known.
  const eventRow = localRows.find((row) => row.localId === 'local-event-a');
  assert.strictEqual(t.filterCoursesForDate(localRows, new Date(2026, 7, 18)).some((row) => row.localId === 'local-event-a'), true);
  assert.strictEqual(t.filterCoursesForDate([localSchool], new Date(2026, 7, 18)).length, 0);
  assert.strictEqual(t.overviewNextCourse([localSchool], new Date(2026, 7, 18, 9, 0)).state, 'unknown');

  // Collision results are explicit: none / possible / confirmed. Clock ranges
  // win over sections when both sides are complete; sections are only a
  // fallback when clock data cannot decide.
  t.state.calendar.firstWeekStart = '2026-08-16';
  assert.deepStrictEqual(t.SCHEDULE_COLLISION_STATUS, { NONE: 'none', POSSIBLE: 'possible', CONFIRMED: 'confirmed' });
  const overlapCourse = t.normalizeLocalScheduleItem({
    id: 'local-course-overlap', type: 'course', termCode: 'LOCAL-TERM', title: '冲突课程',
    course: { weekNumbers: [1, 2, 3, 4, 5, 6, 7, 8], weekdayIndex: 2, startSection: 4, endSection: 5 }
  });
  const disjointCourse = t.normalizeLocalScheduleItem({
    id: 'local-course-disjoint', type: 'course', termCode: 'LOCAL-TERM', title: '不冲突课程',
    course: { weekNumbers: [9, 10, 11, 12, 13, 14, 15, 16], weekdayIndex: 2, startSection: 4, endSection: 5 }
  });
  const shortSchool = { ...localSchool, weeks: '1-8周', time: '1-8周 星期二 第3-4节', detail: '1-8周 星期二 第3-4节 逸201' };
  const overlapResult = t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(overlapCourse), localSchool);
  assert.strictEqual(overlapResult.status, 'confirmed');
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(disjointCourse), shortSchool).status, 'none');

  const schoolElectrical = t.mapCourse({ courseName: '电路原理', courseNo: 'A-ELEC', weeks: '1-16周', weekday: '星期二', section: '第1-2节', time: '08:00-09:40' });
  const schoolSports = t.mapCourse({ courseName: '体育（二）', courseNo: 'A-SPORT', weeks: '1-16周', weekday: '星期二', section: '第3-4节', time: '10:00-11:40' });
  const schoolPhysics = t.mapCourse({ courseName: '大学物理（一）', courseNo: 'A-PHYSICS', weeks: '1-16周', weekday: '星期二', section: '第5-6节', time: '14:00-15:40' });
  const event1929 = t.normalizeLocalScheduleItem({
    id: 'event-1929', type: 'event', termCode: 'LOCAL-TERM', title: '19:29 测试日程',
    event: { date: '2026-08-18', startTime: '19:29', endTime: '19:35', startSection: null, endSection: null }
  });
  const event1929Row = t.localScheduleItemToCourseRow(event1929);
  [schoolElectrical, schoolSports, schoolPhysics].forEach((course) => {
    assert.strictEqual(t.compareScheduleItemsOverlap(event1929Row, course).status, 'none');
  });
  assert.strictEqual(t.localScheduleRowHasConflict(event1929Row, [event1929Row, schoolElectrical, schoolSports, schoolPhysics]), false);

  const event1430 = t.normalizeLocalScheduleItem({ id: 'event-1430', type: 'event', termCode: 'LOCAL-TERM', title: '14:30 测试日程', event: { date: '2026-08-18', startTime: '14:30', endTime: '15:00' } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(event1430), schoolElectrical).status, 'none');
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(event1430), schoolSports).status, 'none');
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(event1430), schoolPhysics).status, 'confirmed');
  const edgeEvent = t.normalizeLocalScheduleItem({ id: 'event-edge', type: 'event', termCode: 'LOCAL-TERM', title: '边界测试日程', event: { date: '2026-08-18', startTime: '15:40', endTime: '16:00' } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(edgeEvent), schoolPhysics).status, 'none');
  const containedEvent = t.normalizeLocalScheduleItem({ id: 'event-contained', type: 'event', termCode: 'LOCAL-TERM', title: '包含测试日程', event: { date: '2026-08-18', startTime: '14:10', endTime: '14:20' } });
  const broadEvent = t.normalizeLocalScheduleItem({ id: 'event-broad', type: 'event', termCode: 'LOCAL-TERM', title: '长时段测试日程', event: { date: '2026-08-18', startTime: '13:00', endTime: '17:00' } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(containedEvent), schoolPhysics).status, 'confirmed');
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(broadEvent), schoolPhysics).status, 'confirmed');

  const otherDateEvent = t.normalizeLocalScheduleItem({ id: 'event-other-date', type: 'event', termCode: 'LOCAL-TERM', title: '其他日期', event: { date: '2026-08-19', startTime: '14:30', endTime: '15:00' } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(otherDateEvent), schoolPhysics).status, 'none');
  const mondayCourse = t.normalizeLocalScheduleItem({ id: 'local-monday', type: 'course', termCode: 'LOCAL-TERM', title: '周一课程', course: { weekNumbers: [1], weekdayIndex: 1, startSection: 5, endSection: 6 } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(mondayCourse), schoolPhysics).status, 'none');
  const laterWeeksCourse = t.normalizeLocalScheduleItem({ id: 'local-later', type: 'course', termCode: 'LOCAL-TERM', title: '后半学期', course: { weekNumbers: [9, 10], weekdayIndex: 2, startSection: 5, endSection: 6 } });
  const earlySchoolPhysics = { ...schoolPhysics, weeks: '1-8周' };
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(laterWeeksCourse), earlySchoolPhysics).status, 'none');
  const oddWeeksCourse = t.normalizeLocalScheduleItem({ id: 'local-odd', type: 'course', termCode: 'LOCAL-TERM', title: '单周课程', course: { weekNumbers: [1, 3, 5], weekdayIndex: 2, startSection: 5, endSection: 6 } });
  const evenWeeksCourse = t.normalizeLocalScheduleItem({ id: 'local-even', type: 'course', termCode: 'LOCAL-TERM', title: '双周课程', course: { weekNumbers: [2, 4, 6], weekdayIndex: 2, startSection: 5, endSection: 6 } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(oddWeeksCourse), t.localScheduleItemToCourseRow(evenWeeksCourse)).status, 'none');

  const sectionOnlyLocal = t.normalizeLocalScheduleItem({ id: 'local-section-only', type: 'course', termCode: 'LOCAL-TERM', title: '只填节次', course: { weekNumbers: [1], weekdayIndex: 2, startSection: 3, endSection: 4 } });
  const sectionOnlySchool = t.mapCourse({ courseName: '无时间课程', courseNo: 'A-NOTIME', weeks: '1周', weekday: '星期二', section: '第4-5节' });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(sectionOnlyLocal), sectionOnlySchool).status, 'confirmed');
  const sectionSeparatedLocal = t.normalizeLocalScheduleItem({ id: 'local-section-separated', type: 'course', termCode: 'LOCAL-TERM', title: '节次不重叠', course: { weekNumbers: [1], weekdayIndex: 2, startSection: 1, endSection: 2 } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(sectionSeparatedLocal), sectionOnlySchool).status, 'none');
  const unknownLocal = t.normalizeLocalScheduleItem({ id: 'local-unknown', type: 'course', termCode: 'LOCAL-TERM', title: '信息不全', course: { weekNumbers: [1], weekdayIndex: 2 } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(unknownLocal), schoolPhysics).status, 'possible');
  assert.strictEqual(t.localScheduleRowHasConflict(t.localScheduleItemToCourseRow(unknownLocal), [t.localScheduleItemToCourseRow(unknownLocal), schoolPhysics]), false);

  const timedEventA = t.normalizeLocalScheduleItem({ id: 'event-a', type: 'event', termCode: 'LOCAL-TERM', title: 'A', event: { date: '2026-08-18', startTime: '14:00', endTime: '15:00' } });
  const timedEventB = t.normalizeLocalScheduleItem({ id: 'event-b', type: 'event', termCode: 'LOCAL-TERM', title: 'B', event: { date: '2026-08-18', startTime: '14:30', endTime: '16:00' } });
  const timedEventRow = t.localScheduleItemToCourseRow(timedEventA);
  const overviewActive = t.overviewNextCourse([timedEventRow], new Date(2026, 7, 18, 14, 30));
  assert.strictEqual(overviewActive.state, 'active');
  assert.strictEqual(overviewActive.course.localId, 'event-a');
  assert.strictEqual(t.overviewTodayCourses([timedEventRow], new Date(2026, 7, 18)).length, 1);
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(timedEventA), t.localScheduleItemToCourseRow(timedEventB)).status, 'confirmed');
  const allDayEvent = t.normalizeLocalScheduleItem({ id: 'event-all-day', type: 'event', termCode: 'LOCAL-TERM', title: '校庆', event: { date: '2026-08-18', allDay: true } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(allDayEvent), t.localScheduleItemToCourseRow(timedEventB)).status, 'none');
  const dateOnlyEvent = t.normalizeLocalScheduleItem({ id: 'event-date-only', type: 'event', termCode: 'LOCAL-TERM', title: '日期备注', event: { date: '2026-08-18', allDay: false, startTime: '', endTime: '', startSection: null, endSection: null } });
  assert.strictEqual(t.compareScheduleItemsOverlap(t.localScheduleItemToCourseRow(dateOnlyEvent), schoolPhysics).status, 'none');

  // Import analysis keeps confirmed and possible collision buckets separate.
  const savedAllDetail = t.state.allDetail;
  t.state.allDetail = { courses: [schoolPhysics], typeName: '全校课表', name: '测试课表' };
  const importedPhysics = t.mapCourse({ courseName: '导入物理', courseNo: 'I-PHYSICS', weeks: '1-16周', weekday: '星期二', section: '第5-6节', time: '14:30-15:00' });
  const importedUnknown = t.mapCourse({ courseName: '信息不全导入', courseNo: 'I-UNKNOWN', weeks: '1-16周', weekday: '星期二' });
  const transferResult = t.analyzeCourseTransferCollisions([importedPhysics, importedUnknown]);
  assert.ok(transferResult.conflicts.some((item) => item.imported === importedPhysics && item.status === 'confirmed'));
  assert.ok(transferResult.possible.some((item) => item.imported === importedUnknown && item.status === 'possible'));
  assert.ok(t.renderCourseTransferCollisionResult(transferResult).includes('可能冲突'));
  t.state.allDetail = savedAllDetail;

  // “同时保留” is the default merge; “仅保留新安排” is represented by a
  // hidden occurrence key and never mutates the school arrays.
  const occurrenceKey = t.schoolScheduleOccurrenceKey(localSchool);
  t.state.localSchedule.hiddenSchoolEntries = [{ key: occurrenceKey, termCode: 'LOCAL-TERM', label: '大学物理', hiddenByLocalId: 'local-course-a' }];
  assert.strictEqual(t.mergedPersonalScheduleRows(t.state.data.courses).some((row) => row.name === '大学物理'), false);
  assert.strictEqual(t.state.data.courses[0].name, '大学物理');
  t.state.localSchedule.hiddenSchoolEntries = [];
  assert.strictEqual(t.mergedPersonalScheduleRows(t.state.data.courses).some((row) => row.name === '大学物理'), true);

  // Local course can be represented by WakeUp CSV; an exact-date event without
  // a teaching week/section is skipped and reports the count instead of faking a
  // section number.
  t.state.localSchedule.items = [localCourse, localEvent];
  const localCsv = t.scheduleCsvEntries('personal');
  assert.ok(localCsv.some((entry) => entry.courseName === '自动控制补课'));
  assert.strictEqual(localCsv.skippedCount, 1);
  assert.strictEqual(t.scheduleCsvHasRows('personal'), true);

  // Student profile keys are different and deterministic.
  assert.notStrictEqual(t.localScheduleStorageKey('student-A'), t.localScheduleStorageKey('student-B'));
  assert.strictEqual(t.localScheduleProfileKey('student-A'), 'student-A');
  assert.strictEqual(t.localSchedulePayload().schema, 'zhizhang-local-schedule/v1');
  assert.strictEqual(t.localSchedulePayload().studentId, 'student-A');

  // Editing an item does not collide with itself.
  t.state.localSchedule.items = [localCourse];
  t.state.data.courses = [];
  t.state.data.scheduleDetail = [];
  const selfOnly = t.localScheduleItemToCourseRow(localCourse);
  assert.strictEqual(t.findLocalScheduleConflicts(localCourse).length, 0);
  assert.strictEqual(t.compareScheduleItemsOverlap(selfOnly, selfOnly).status, 'confirmed');

  // Restore the fixture used by the earlier audit assertions for callers that
  // inspect the state after this test file finishes.
  t.state.data = savedLocalState.data;
  t.state.termCode = savedLocalState.termCode;
  t.state.studentId = savedLocalState.studentId;
  t.state.localSchedule = savedLocalState.localSchedule;
  t.state.calendar = savedLocalState.calendar;

  console.log('audit smoke tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
