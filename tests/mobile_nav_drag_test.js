const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../dashboard.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../dashboard.css'), 'utf8');
assert(css.includes('.mobile-bottom-nav { touch-action: none; }'), 'the fixed drag dock must reserve the touch gesture before pointerdown');
const section = source.slice(source.indexOf('function mobileBottomNavView()'), source.indexOf('\nfunction render()'));
const route = source.slice(source.indexOf('async function selectDashboardView(nextView)'), source.indexOf('\ndocument.querySelectorAll("[data-view]")', source.indexOf('async function selectDashboardView(nextView)')));
const classes = () => {
  const values = new Set();
  return { add: (...names) => names.forEach(n => values.add(n)), remove: (...names) => names.forEach(n => values.delete(n)),
    toggle(n, on) { if (on) values.add(n); else values.delete(n); }, contains: n => values.has(n) };
};
const styles = new Map([['--mobile-nav-index', '1']]);
const items = ['overview', 'personal', 'scores', 'exams', 'settings'].map(view => ({ dataset: { view }, classList: classes(), attributes: {},
  setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; } }));
const listeners = new Map(), frames = new Map(), globals = new Map();
let clock = 0, frameId = 0, reduced = false, captured = null, pressesCancelled = 0;
const refreshes = [], prompts = [], closedModals = [];
const nav = { isConnected: true, dataset: {}, classList: classes(), style: { setProperty: (k, v) => styles.set(k, v) },
  querySelectorAll: () => items, querySelector: () => indicator, getBoundingClientRect: () => ({ left: 5 }),
  setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id, releasePointerCapture: () => { captured = null; },
  addEventListener: (name, fn) => listeners.set('nav:' + name, fn), closest: () => nav };
const indicator = { offsetWidth: 64, offsetLeft: 5, getBoundingClientRect() {
  const left = 10 + Number(styles.get('--mobile-nav-index')) * 64;
  return { left, right: left + 64, top: 700, bottom: 758, width: 64, height: 58 };
} };
const context = { Math, Number, Date, Array, Promise, state: { view: 'personal', loading: false }, MOBILE_NAV_VIEW_ALIASES: { all: 'settings' }, IS_ANDROID_APP: true,
  document: { querySelector: () => nav, addEventListener: (name, fn) => listeners.set(name, fn) },
  interfaceMotionEnabled: () => !reduced, finishLiquidPress: cancel => { assert(cancel); pressesCancelled++; },
  requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
  addEventListener: (name, fn) => globals.set(name, fn), matchMedia: () => ({ addEventListener: (name, fn) => globals.set('reduce', fn) }),
  clearActiveModalState: () => closedModals.push(true), prepareCampusPromptForPersonalView: (...args) => prompts.push(args),
  refreshAfterRouteArrival: view => refreshes.push(view),
  render: () => context.api.syncMobileBottomNavIndicator() };
vm.createContext(context);
vm.runInContext(section + '\n' + route + '\nthis.api={beginMobileNavDrag,moveMobileNavDrag,endMobileNavDrag,cancelMobileNavMotion,syncMobileBottomNavIndicator,selectDashboardView,drag:()=>activeMobileNavDrag,snap:()=>activeMobileNavSnap};', context);
const event = (x, y = 724, extra = {}) => ({ target: nav, pointerId: 1, pointerType: 'touch', button: 0, buttons: 1, isPrimary: true,
  clientX: x, clientY: y, timeStamp: clock, preventDefault() { this.prevented = true; }, ...extra });
const position = () => Number(styles.get('--mobile-nav-index'));
function advance(ms = 1000) {
  for (let t = 0; t < ms; t += 16) { clock += 16; const queue = [...frames.values()]; frames.clear(); queue.forEach(fn => fn(clock)); }
}
function reset(view = 'personal') {
  context.api.cancelMobileNavMotion(); context.state.view = view; context.api.syncMobileBottomNavIndicator();
  refreshes.length = prompts.length = closedModals.length = 0;
}
function beginAtCurrent() { const b = indicator.getBoundingClientRect(); context.api.beginMobileNavDrag(event(b.left + 32)); return b.left + 32; }

const start = beginAtCurrent();
context.api.moveMobileNavDrag(event(start + 5));
assert.equal(position(), 1, 'small movements retain ordinary tap');
assert.equal(captured, null);
clock += 64; const movement = event(start + 100); context.api.moveMobileNavDrag(movement);
assert(movement.prevented); assert.equal(captured, 1); assert.equal(position(), 2.5625);
assert.equal(context.state.view, 'personal', 'drag previews do not navigate before release');
assert(items[3].classList.contains('is-drag-preview'));
assert.equal(pressesCancelled, 1, 'slider dragging releases the jelly button press');
context.api.syncMobileBottomNavIndicator(); assert.equal(position(), 2.5625, 'background render does not reset the tracking position');
const release = event(start + 100); context.api.endMobileNavDrag(release);
assert.equal(context.state.view, 'exams'); assert.equal(captured, null);
assert.deepEqual(refreshes, ['exams']); assert.deepEqual(prompts, [['exams', 'personal']]); assert.equal(closedModals.length, 1);
assert.equal(position(), 2.5625, 'navigation render preserves the current spring position');
assert.equal(items[3].attributes['aria-current'], 'page');
assert(!items[1].attributes['aria-current']);
assert(nav.classList.contains('is-nav-snapping'));
advance(32); assert(position() > 2.5625, 'nearest slot attracts the slider');
advance(); assert.equal(position(), 3); assert.equal(context.api.snap(), null); assert.equal(frames.size, 0);
assert(!nav.classList.contains('is-nav-snapping')); assert(!items.some(i => i.classList.contains('is-drag-preview')));
const synthetic = { detail: 1, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
listeners.get('nav:click')(synthetic); assert(synthetic.prevented && synthetic.stopped, 'post-drag synthetic click cannot navigate twice');
const keyboard = { ...synthetic, detail: 0, prevented: false, stopped: false }; listeners.get('nav:click')(keyboard); assert(!keyboard.prevented && !keyboard.stopped);

reset(); let x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 4, 754));
assert.equal(context.api.drag(), null, 'vertical gestures cancel before capture'); assert.equal(position(), 1);
assert.equal(captured, null); assert.equal(refreshes.length, 0);
context.api.beginMobileNavDrag(event(300)); assert.equal(context.api.drag(), null, 'drag can start only on the visible selected slider');
x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 2)); context.api.endMobileNavDrag(event(x + 2));
assert.equal(context.api.drag(), null); assert(!nav.classList.contains('is-nav-tracking'));
context.api.selectDashboardView('scores'); assert.equal(context.state.view, 'scores'); assert.deepEqual(refreshes, ['scores'], 'ordinary taps retain the shared route refresh');

reset(); x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x - 200)); assert.equal(position(), 0, 'left edge is bounded');
context.api.moveMobileNavDrag(event(x + 600)); assert.equal(position(), 4, 'right edge is bounded');
listeners.get('pointercancel')(event(x, 724, { pointerId: 2 })); assert(context.api.drag(), 'unrelated pointer cancellation is ignored');
listeners.get('pointercancel')(event(x)); assert.equal(position(), 1); assert.equal(context.state.view, 'personal'); assert.equal(captured, null);
assert(!nav.classList.contains('is-nav-dragging')); assert.equal(frames.size, 0);
x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 30)); listeners.get('pointerdown')(event(x, 724, { pointerId: 2, isPrimary: false }));
assert.equal(context.api.drag(), null, 'a second finger cancels safely'); assert.equal(position(), 1);

reset(); x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 42)); context.api.endMobileNavDrag(event(x + 42)); advance(32);
const interrupted = position(); x = beginAtCurrent(); assert.equal(position(), interrupted, 'grabbing a settling slider keeps its visible position');
context.api.moveMobileNavDrag(event(x - 30)); assert(position() < interrupted);
globals.get('blur')(); assert.equal(position(), 2); assert.equal(frames.size, 0); assert.equal(captured, null);
reset(); x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 20)); globals.get('resize')();
assert(context.api.drag(), 'viewport height-only resize must not interrupt unchanged nav geometry');
indicator.offsetWidth = 72; globals.get('resize')(); assert.equal(position(), 1); assert.equal(context.api.drag(), null); indicator.offsetWidth = 64;
x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 20)); captured = null; listeners.get('nav:lostpointercapture')(event(x)); assert.equal(context.api.drag(), null);
x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 20)); context.document.hidden = true; listeners.get('visibilitychange')(); assert.equal(context.api.drag(), null); context.document.hidden = false;

reset(); reduced = true; x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 50)); context.api.endMobileNavDrag(event(x + 50));
assert.equal(context.state.view, 'scores'); assert.equal(position(), 2); assert.equal(frames.size, 0, 'reduced motion preserves drag navigation with an instant landing');
reduced = false; reset(); x = beginAtCurrent(); context.api.moveMobileNavDrag(event(x + 50)); context.api.endMobileNavDrag(event(x + 50));
globals.get('reduce')({ matches: true }); assert.equal(position(), 2); assert.equal(frames.size, 0);
reset();
const touchButton = { closest: () => nav };
x = indicator.getBoundingClientRect().left + 32;
context.api.beginMobileNavDrag(event(x, 724, { target: touchButton }));
context.api.moveMobileNavDrag(event(x + 14, 728, { target: touchButton }));
assert.equal(captured, 1);
// A touchscreen implicitly captures the original button. Transferring capture
// to the nav emits lostpointercapture on that button, and it bubbles to nav.
listeners.get('nav:lostpointercapture')(event(x + 14, 728, { target: touchButton }));
assert(context.api.drag(), 'implicit button capture transfer must not cancel the nav drag');
context.api.moveMobileNavDrag(event(x + 50, 735, { buttons: 0 }));
assert(context.api.drag(), 'touch contact does not depend on mouse buttons state');
assert.equal(position(), 1 + 50 / 64);
listeners.get('nav:lostpointercapture')(event(x + 50, 735));
assert(context.api.drag(), 'a stale lostcapture notification cannot cancel a pointer currently captured by nav');
context.api.endMobileNavDrag(event(x + 50, 735, { buttons: 0 }));
assert.equal(context.state.view, 'scores');
captured = null;
listeners.get('nav:lostpointercapture')(event(x + 50, 735));
assert(context.api.snap(), 'normal capture release after pointerup must not stop the spring landing');
advance(); assert.equal(position(), 2); assert.equal(frames.size, 0);
reset();
x = indicator.getBoundingClientRect().left + 32;
context.api.beginMobileNavDrag(event(x, 724, { pointerType: 'mouse' }));
context.api.moveMobileNavDrag(event(x + 20, 724, { pointerType: 'mouse', buttons: 0 }));
assert.equal(context.api.drag(), null, 'released mouse buttons still cancel a drag');
reset(); x = beginAtCurrent();
context.api.moveMobileNavDrag(event(x + 9, 735));
assert(context.api.drag(), 'small diagonal finger wobble must not cancel an intended horizontal gesture');
context.api.moveMobileNavDrag(event(x + 50, 736));
context.api.endMobileNavDrag(event(x + 50, 736));
assert.equal(context.state.view, 'scores'); advance();
reset('all'); assert.equal(position(), 4, 'secondary views retain their More alias');
console.log('mobile nav drag tests: PASS');
