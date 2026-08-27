const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const executeCalls = [];
const event = () => ({ addListener() {} });
const chrome = {
  action: { onClicked: event() },
  runtime: {
    getURL: (path) => `extension://${path}`,
    getManifest: () => ({ version: "test" }),
    onMessage: event()
  },
  tabs: {
    query: async () => [],
    create: async () => ({ id: 1 }),
    update: async () => ({}),
    get: async () => ({ id: 1 }),
    highlight: async () => ({}),
    onUpdated: event(),
    onRemoved: event()
  },
  scripting: {
    executeScript: async (details) => {
      executeCalls.push(details);
      if (details.target.allFrames) {
        return [{ frameId: 7, result: { available: true, courseOutlineFrame: true } }];
      }
      return [{ frameId: 7, result: { available: true, courseOutlineFrame: true, payload: { code: "0" } } }];
    }
  }
};

const context = { chrome, URL, Promise, setTimeout, clearTimeout, console };
const source = `${fs.readFileSync(require.resolve("../background.js"), "utf8")}\nthis.__testRequest = executeCourseOutlinePortalRequest;`;
vm.runInNewContext(source, context, { filename: "background.js" });

(async () => {
  const result = await context.__testRequest(42, "modules/dgcx/cxlb.do", { pageNumber: 1 });
  assert.equal(result.payload.code, "0");
  assert.equal(executeCalls.length, 2);
  assert.equal(executeCalls[0].target.allFrames, true);
  assert.deepEqual(Array.from(executeCalls[1].target.frameIds), [7]);
  assert.equal(Object.hasOwn(executeCalls[1], "COURSE_OUTLINE_REQUEST_SCRIPT_TIMEOUT_MS"), false);
  console.log("background course-outline targeted-frame bridge: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
