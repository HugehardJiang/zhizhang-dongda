const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../dashboard.js'), 'utf8');
const section = source.slice(source.indexOf('let renderedPageView ='), source.indexOf('let activePersonalScheduleMotion ='));
const animations = [], appended = [], frames = new Map();
let frameId = 0, reduced = false, modal = false, renders = 0, refreshes = 0;
function node(rect = {left: 16, top: -160, width: 358, height: 1200, bottom: 1040}) {
  const attributes = new Map(), classes = new Set();
  return {
    style: {}, className: 'content-area', removed: false, inert: false, children: [], parent: null,
    classList: {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)},
    getBoundingClientRect: () => rect,
    removeAttribute: name => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    get firstChild() {return this.children[0];},
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(n => [n, ...n.querySelectorAll('*')]);
      return selector === '*' ? descendants : descendants.filter(n => (selector.includes('[id]') && n.getAttribute('id'))
        || (selector.includes('[aria-live]') && n.getAttribute('aria-live')));
    },
    cloneNode() {throw new Error('whole-page cloning is forbidden');},
    appendChild(child) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this; this.children.push(child);
    },
    remove() {this.removed = true;},
    animate(keyframes, options) {
      let resolve;
      const animation = {target: this, frames: keyframes, options, cancelled: false, finished: new Promise(r => {resolve = r;}),
        finish() {resolve();}, cancel() {this.cancelled = true; resolve();}};
      animations.push(animation); return animation;
    }
  };
}
const content = node(); content.setAttribute('id','content'); content.setAttribute('aria-live','polite');
const originalRow = node(); originalRow.setAttribute('id','grade-row'); content.appendChild(originalRow);
const pageBody = node(); pageBody.className = 'page-body'; pageBody.appendChild(content);
const slot = node({left:16,top:600,width:358,height:126,bottom:726});
slot.className = 'android-session-slot'; slot.hidden = false; slot.setAttribute('id','androidSessionSlot');
const progress = node(); progress.setAttribute('aria-live','polite'); slot.appendChild(progress); pageBody.appendChild(slot);
slot.cloneNode = () => {
  const copy = node(); copy.className = slot.className; copy.setAttribute('id','androidSessionSlot');
  const text = node(); text.setAttribute('aria-live','polite'); copy.appendChild(text); return copy;
};
const context = { cancelNativeCampusContentMotion() {}, elements: {content}, state: {view: 'scores', loading: false}, MOBILE_NAV_VIEW_ALIASES: {all: 'settings'},
  document: {getElementById: id => ({pageBody, androidSessionSlot: slot})[id], querySelector: sel => sel === '.modal-backdrop' ? (modal ? {} : null) : node({left:0,top:0,width:390,height:844,bottom:844}),
    createElement: () => node(), body: {appendChild: n => appended.push(n)}},
  requestAnimationFrame(callback) {frames.set(++frameId, callback); return frameId;},
  cancelAnimationFrame(id) {frames.delete(id);},
  matchMedia: () => ({matches: reduced}), render: () => {renders++;}, refresh: () => {refreshes++;}, console };
vm.createContext(context);
vm.runInContext(section + '\nthis.motion={captureRouteDeparture,animateRouteArrival,cancelRouteTransition,primaryPageIndex,refreshAfterRouteArrival};', context);
function setView(previous, next) {
  vm.runInContext(`renderedPageView=${JSON.stringify(previous)};state.view=${JSON.stringify(next)};`, context);
}
function paintFrame() {const pending = [...frames.values()];frames.clear();pending.forEach(callback => callback());}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  setView('overview', 'scores');
  const first = context.motion.captureRouteDeparture();
  assert(first && first.departingContent.inert);
  assert.equal(first.departingContent.firstChild, originalRow, 'reuse actual outgoing nodes');
  assert.equal(originalRow.getAttribute('id'), undefined);
  assert.equal(content.getAttribute('id'), 'content', 'live delegated event root is preserved');
  assert.equal(first.departingContent.style.top, '-160px', 'departing scroll position must survive');
  const snapshot = first.departingBody.children[1];
  assert(snapshot && snapshot !== slot && snapshot.inert, 'outgoing card is a small inert snapshot');
  assert.equal(snapshot.style.top, '600px', 'outgoing footer keeps its original scroll position');
  assert.equal(snapshot.getAttribute('id'), undefined);
  assert.equal(snapshot.firstChild.getAttribute('aria-live'), undefined, 'only the live card announces progress');
  assert.equal(slot.parent, pageBody, 'live footer stays attached for progress and delegated actions');
  context.motion.animateRouteArrival(first);
  context.motion.refreshAfterRouteArrival('scores');
  assert.equal(refreshes,0); assert.equal(animations.length,0,'prepare compositor before sliding');
  paintFrame(); assert.equal(animations.length,0);
  paintFrame();
  assert.equal(animations[0].frames[1].transform, 'translateX(-390px)');
  assert.equal(animations[1].frames[0].transform, 'translateX(390px)');
  assert.equal(animations[0].target, first.departingBody, 'outgoing content and card share one animation');
  assert.equal(animations[1].target, pageBody, 'incoming content and live card share one animation');
  assert(!content.style.maxHeight && !slot.style.transform, 'clipping must not pull the footer into view or move it independently');
  assert.equal(slot.getAttribute('id'), 'androidSessionSlot');
  assert(animations.every(a => !('opacity' in a.frames[0])), 'route never fades from a blank frame');
  content.appendChild(node());
  setView('scores', 'exams');
  const second = context.motion.captureRouteDeparture();
  context.motion.cancelRouteTransition();
  assert(first.viewport.removed && animations[0].cancelled && animations[1].cancelled);
  context.motion.animateRouteArrival(second);
  context.motion.refreshAfterRouteArrival('exams');
  await tick(); assert.equal(refreshes,0,'superseded routes cannot launch refresh');
  paintFrame();paintFrame();
  assert.equal(appended.filter(n => !n.removed).length, 1);
  vm.runInContext('routeRenderPending=true;', context);
  animations[2].finish(); animations[3].finish();await tick();
  assert(second.viewport.removed);
  assert.equal(renders,1,'coalesce data updates until slide finishes');
  assert.equal(refreshes,1,'refresh current destination only after slide');
  assert.equal(pageBody.style.maxHeight,'');
  assert(!pageBody.classList.contains('route-arrival'));
  assert.equal(slot.parent, pageBody);
  assert.equal(slot.firstChild, progress, 'switching preserves the live progress node');
  assert(animations.every(a => a.cancelled),'release compositor layers after finish');
  slot.hidden = true;
  setView('exams','settings');
  const pending = context.motion.captureRouteDeparture();
  assert.equal(pending.departingBody.children.length,1,'hidden footer leaves no ghost card');
  context.motion.animateRouteArrival(pending);
  context.motion.cancelRouteTransition();paintFrame();paintFrame();
  assert.equal(animations.length,4,'cancel during preparation cannot leave a late animation');
  reduced = true;assert.equal(context.motion.captureRouteDeparture(),null);
  reduced = false;modal = true;assert.equal(context.motion.captureRouteDeparture(),null);
  modal = false;setView('scores','scores');assert.equal(context.motion.captureRouteDeparture(),null);
  assert.equal(context.motion.primaryPageIndex('all'),4);
  console.log('page motion tests: PASS');
})().catch(error => {console.error(error);process.exitCode=1;});
