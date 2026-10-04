const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../dashboard.js'), 'utf8');
const code = source.slice(source.indexOf('let activePersonalScheduleMotion ='), source.indexOf('function renderPageSkeleton('));
const toggleCode = source.slice(source.indexOf('elements.content.addEventListener("toggle",'), source.indexOf('elements.content.addEventListener("input",', source.indexOf('elements.content.addEventListener("toggle",')));
// Keep the shared click dispatcher and summary's native keyboard-generated
// click path intact, without invoking unrelated course or modal actions.
const summaryClickCode = source.slice(source.indexOf('elements.content.addEventListener("click", async'), source.indexOf('  const treeSummary =', source.indexOf('elements.content.addEventListener("click", async'))) + '\n});';
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const animations = [], listeners = new Map(), globalListeners = new Map(), mediaListeners = new Map();
  let reduced = false, modal = false;
  function node(kind, rect = {left: 20, width: 350, height: 200}) {
    const attrs = new Map(), classes = new Set();
    const result = {
      kind, style: {setProperty(name, value) {this[name] = value;}}, children: [], parentElement: null,
      inert: false, naturalRect: {...rect}, visual: {},
      classList: {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)},
      setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name), getAttribute: name => attrs.get(name),
      appendChild(child) {child.remove(); this.children.push(child); child.parentElement = this; child.removed = false;},
      remove() {if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; this.removed = true;},
      getBoundingClientRect() {
        let inheritedX = 0;
        for (let parent = this.parentElement; parent; parent = parent.parentElement) inheritedX += parent.visual?.x || 0;
        return {...this.naturalRect, left: this.naturalRect.left + inheritedX + (this.visual.x || 0),
          height: this.visual.height ?? (this.style.height ? parseFloat(this.style.height) : this.naturalRect.height)};
      },
      closest(selector) {
        if (selector === '.schedule-tools > summary' && this.kind === 'summary') return this;
        if (selector === '.schedule-primary-actions' && this.kind === 'tools') return row;
        return null;
      },
      querySelector(selector) {
        return this.children.find(child => selector === 'summary' ? child.kind === 'summary'
          : selector === '.schedule-tools-body' ? child.kind === 'tools-body'
          : selector.startsWith('.personal-schedule-view') ? child.kind === 'view' && (!selector.includes(':not(') || !child.classList.contains('schedule-view-departure')) : false) || null;
      },
      querySelectorAll(selector) {
        const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
        return selector === '*' ? all : all.filter(child => child.getAttribute('id') || child.getAttribute('aria-live'));
      },
      matches(selector) {return selector === '.schedule-tools' && this.kind === 'tools';},
      animate(frames, options) {
        let resolve, reject;
        const animation = {target: this, frames, options, cancelled: false,
          finished: new Promise((a, b) => {resolve = a; reject = b;}),
          advance(fraction) {
            if ('height' in frames[0]) result.visual.height = parseFloat(frames[0].height) + (parseFloat(frames[1].height) - parseFloat(frames[0].height)) * fraction;
            if ('opacity' in frames[0]) result.visual.opacity = Number(frames[0].opacity) + (Number(frames[1].opacity) - Number(frames[0].opacity)) * fraction;
            if ('transform' in frames[0]) result.visual.x = parseFloat(frames[0].transform.slice(11)) + (parseFloat(frames[1].transform.slice(11)) - parseFloat(frames[0].transform.slice(11))) * fraction;
          },
          finish() {this.advance(1); resolve();},
          cancel() {this.cancelled = true; result.visual = {}; reject(new Error('cancelled'));}
        };
        animation.advance(0); animations.push(animation); return animation;
      }
    };
    return result;
  }
  const row = node('row', {left: 20, width: 350, height: 44});
  const tools = node('tools', {left: 110, width: 200, height: 44}); tools.open = false;
  const summary = node('summary'), body = node('tools-body', {left: 20, width: 350, height: 240});
  tools.appendChild(summary); tools.appendChild(body);
  let viewport;
  function mount(height = 200, layout = {left: 20, width: 350}) {
    viewport = node('viewport', {left: layout.left, width: layout.width, height});
    const view = node('view', {left: layout.left, width: layout.width, height});
    const input = node('input', {left: layout.contentLeft ?? layout.left, width: layout.contentWidth ?? layout.width, height});
    input.setAttribute('id', 'schedule-filter'); input.setAttribute('aria-live', 'polite'); view.appendChild(input);
    viewport.appendChild(view); return {viewport, view, input};
  }
  mount();
  const content = {
    querySelector: selector => selector === '.personal-schedule-viewport' ? viewport : selector === '.schedule-tools' ? tools : null,
    addEventListener(type, callback) {if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback);},
    contains: target => target === tools || target === summary
  };
  const state = {view: 'personal', personalUi: {toolsOpen: false}, filters: {exams: ''}, settingsUi: {}};
  const context = {console, elements: {content}, state, document: {querySelector: () => modal ? {} : null},
    interfaceMotionEnabled: () => !reduced, getComputedStyle: target => ({opacity: String(target.visual.opacity ?? 1)}),
    addEventListener: (type, callback) => globalListeners.set(type, callback),
    matchMedia: () => ({addEventListener: (type, callback) => mediaListeners.set(type, callback)})};
  vm.createContext(context);
  vm.runInContext(code + toggleCode + summaryClickCode + '\nthis.motion={capturePersonalScheduleView,animatePersonalScheduleView,cancelPersonalScheduleMotion,toggleScheduleTools,cancelScheduleToolsMotion,syncScheduleToolsLayout};', context);
  return {context, state, animations, tools, summary, body, mount, get viewport() {return viewport;},
    setReduced: value => {reduced = value;}, setModal: value => {modal = value;}, node,
    event(type, target) {
      const event = {target, defaultPrevented: false, preventDefault() {this.defaultPrevented = true;}};
      (listeners.get(type) || []).forEach(callback => callback(event)); return event;
    },
    resize: () => globalListeners.get('resize')(),
    reduce: () => {reduced = true; mediaListeners.get('change')({matches: true});}
  };
}

(async () => {
  const h = harness(), m = h.context.motion;
  let old = h.viewport.querySelector('.personal-schedule-view');
  const child = old.children[0], departure = m.capturePersonalScheduleView();
  assert.equal(departure.view, old, 'reuse actual outgoing schedule nodes');
  assert(old.inert && old.getAttribute('aria-hidden') === 'true');
  assert.equal(child.getAttribute('id'), undefined, 'departing controls cannot duplicate live IDs');
  assert.equal(child.getAttribute('aria-live'), undefined, 'only incoming schedule announces updates');
  const first = h.mount(480);
  m.animatePersonalScheduleView(departure, 1);
  assert.equal(h.animations[0].frames[1].transform, 'translateX(-350px)');
  assert.equal(h.animations[1].frames[0].transform, 'translateX(350px)');
  assert.equal(h.animations[2].frames[0].height, '200px');
  assert.equal(h.animations[2].frames[1].height, '480px', 'viewport interpolates content height without a jump');
  assert(first.viewport.classList.contains('is-switching'));
  assert.equal(first.viewport.children.length, 2);
  h.animations.forEach(animation => animation.advance(.4));
  const visualHeight = first.viewport.getBoundingClientRect().height;
  const visualOffset = first.view.getBoundingClientRect().left - first.viewport.getBoundingClientRect().left;
  const reversed = m.capturePersonalScheduleView();
  assert.equal(reversed.height, visualHeight, 'quick reversal uses displayed height');
  assert.equal(reversed.offset, visualOffset, 'quick reversal preserves incoming view position');
  assert(old.removed && h.animations.slice(0, 3).every(animation => animation.cancelled));
  assert.equal(first.viewport.style.height, '');
  assert(!first.viewport.classList.contains('is-switching'));
  const second = h.mount(200);
  m.animatePersonalScheduleView(reversed, -1);
  assert.equal(h.animations[3].frames[0].transform, `translateX(${visualOffset}px)`);
  assert.equal(h.animations[3].frames[1].transform, 'translateX(350px)');
  assert.equal(h.animations[4].frames[0].transform, 'translateX(-350px)');
  await tick();
  assert(second.viewport.classList.contains('is-switching'), 'cancelled completion cannot tear down newer transition');
  h.animations.slice(3).forEach(animation => animation.finish()); await tick();
  assert(first.view.removed && h.animations.slice(3).every(animation => animation.cancelled));
  assert.equal(second.viewport.children.length, 1);
  assert.equal(second.viewport.style.height, '');
  assert(!second.viewport.classList.contains('is-switching'));

  // Layout supplies a stable full-page animation frame while the two designs
  // keep different content edges: day cards at 16 px and week grid at 10 px.
  // These mocked child bounds verify the motion uses the outer frame width,
  // not either inner footprint. Real shadow clipping still needs browser QA.
  const geometry = harness(), gm = geometry.context.motion;
  const day = geometry.mount(220, {left: 0, width: 390, contentLeft: 16, contentWidth: 358});
  const dayDeparture = gm.capturePersonalScheduleView();
  const week = geometry.mount(500, {left: 0, width: 390, contentLeft: 10, contentWidth: 370});
  gm.animatePersonalScheduleView(dayDeparture, 1);
  assert.equal(geometry.animations[0].frames[1].transform, 'translateX(-390px)', 'slide distance comes from stable outer width');
  assert.equal(geometry.animations[1].frames[0].transform, 'translateX(390px)');
  geometry.animations.forEach(animation => animation.advance(.998));
  const nearEnd = week.input.getBoundingClientRect();
  assert(Math.abs(nearEnd.left - 10) < 1 && nearEnd.width === 370, 'week grid approaches its own resting inset smoothly');
  geometry.animations.forEach(animation => animation.finish());
  const finalBeforeCleanup = week.input.getBoundingClientRect();
  await tick();
  assert.equal(week.input.getBoundingClientRect().left, finalBeforeCleanup.left, 'releasing animation cannot change week content edge');
  assert.equal(week.input.getBoundingClientRect().width, 370);
  const weekDeparture = gm.capturePersonalScheduleView();
  const backToDay = geometry.mount(220, {left: 0, width: 390, contentLeft: 16, contentWidth: 358});
  gm.animatePersonalScheduleView(weekDeparture, -1);
  geometry.animations.slice(3).forEach(animation => animation.advance(.45));
  const partialDayLeft = backToDay.input.getBoundingClientRect().left;
  const partialDayDeparture = gm.capturePersonalScheduleView();
  assert.equal(partialDayDeparture.offset, partialDayLeft - 16, 'quick reversal captures frame translation without absorbing design inset');
  geometry.mount(500, {left: 0, width: 390, contentLeft: 10, contentWidth: 370});
  gm.animatePersonalScheduleView(partialDayDeparture, 1);
  assert.equal(backToDay.input.getBoundingClientRect().left, partialDayLeft, 'reversed departure keeps current visual content edge');
  gm.cancelPersonalScheduleMotion(); await tick();
  assert(day.view.removed);

  const fallback = harness();
  fallback.setReduced(true); assert.equal(fallback.context.motion.capturePersonalScheduleView(), null);
  assert.equal(fallback.animations.length, 0);
  fallback.setReduced(false); fallback.setModal(true); assert.equal(fallback.context.motion.capturePersonalScheduleView(), null);
  fallback.setModal(false); fallback.state.view = 'scores'; assert.equal(fallback.context.motion.capturePersonalScheduleView(), null);
  fallback.state.view = 'personal'; fallback.viewport.children[0].animate = undefined;
  assert.equal(fallback.context.motion.capturePersonalScheduleView(), null, 'missing WAAPI keeps normal rendering');
  assert.equal(fallback.viewport.children.length, 1);

  const t = harness(), tm = t.context.motion;
  assert(!t.event('click', t.node('other')).defaultPrevented, 'summary interception leaves unrelated clicks untouched');
  assert.equal(t.animations.length, 0);
  const click = t.event('click', t.summary);
  assert(click.defaultPrevented && t.state.personalUi.toolsOpen && t.tools.open, 'summary click including keyboard activation opens with motion');
  assert.equal(t.summary.getAttribute('aria-expanded'), 'true');
  assert.equal(t.body.style['--schedule-tools-width'], '350px');
  assert.equal(t.body.style['--schedule-tools-offset'], '-90px');
  assert.equal(t.animations[0].frames[0].height, '0px');
  assert.equal(t.animations[0].frames[1].height, '240px');
  t.animations[0].advance(.35);
  t.event('click', t.summary);
  assert.equal(t.animations[1].frames[0].height, '84px', 'closing starts at current animated height');
  assert.equal(t.animations[1].frames[0].opacity, '0.35', 'closing starts at current opacity');
  assert(t.animations[0].cancelled && t.tools.open && t.body.inert);
  assert(!t.state.personalUi.toolsOpen && t.summary.getAttribute('aria-expanded') === 'false');
  t.event('toggle', t.tools);
  assert.equal(t.state.personalUi.toolsOpen, false, 'details temporarily open while closing must not overwrite intent');
  t.animations[1].advance(.5);
  t.event('click', t.summary);
  assert.equal(t.animations[2].frames[0].height, '42px');
  assert.equal(t.animations[2].frames[0].opacity, '0.175');
  assert.equal(t.animations[2].frames[1].height, '240px');
  assert(!t.body.inert && t.state.personalUi.toolsOpen);
  await tick(); assert(t.body.classList.contains('is-expanding'), 'cancelled opener cannot clear reversed motion');
  t.animations[2].finish(); await tick();
  assert(t.tools.open && !t.body.inert && !t.body.classList.contains('is-expanding'));
  t.event('click', t.summary);
  assert(t.tools.open, 'details remains open until closing animation ends');
  t.animations[3].finish(); await tick();
  assert(!t.tools.open && !t.state.personalUi.toolsOpen && !t.body.inert);
  assert(!t.body.classList.contains('is-expanding'));
  t.event('toggle', t.tools); assert.equal(t.state.personalUi.toolsOpen, false);
  t.tools.open = true; t.event('toggle', t.tools);
  assert.equal(t.state.personalUi.toolsOpen, true, 'native or programmatic settled toggle still synchronizes');
  tm.cancelScheduleToolsMotion();

  const plain = harness(); plain.body.animate = undefined;
  plain.event('click', plain.summary); assert(plain.tools.open && plain.state.personalUi.toolsOpen);
  plain.event('click', plain.summary); assert(!plain.tools.open && !plain.state.personalUi.toolsOpen);
  const reduced = harness(); reduced.setReduced(true);
  reduced.event('click', reduced.summary); assert(reduced.tools.open && reduced.state.personalUi.toolsOpen);
  reduced.event('click', reduced.summary); assert(!reduced.tools.open && reduced.animations.length === 0);

  for (const cancel of ['resize', 'reduce']) {
    const c = harness(), cm = c.context.motion;
    const departing = cm.capturePersonalScheduleView(); c.mount(480); cm.animatePersonalScheduleView(departing, 1);
    c.event('click', c.summary); c.event('click', c.summary);
    c[cancel](); await tick();
    assert(c.animations.every(animation => animation.cancelled), `${cancel} releases all compositor layers`);
    assert(departing.view.removed && !c.viewport.classList.contains('is-switching'));
    assert.equal(c.viewport.style.height, '');
    assert(!c.tools.open && !c.body.inert && !c.body.classList.contains('is-expanding'));
  }
  console.log('personal schedule motion tests: PASS');
})().catch(error => {console.error(error); process.exitCode = 1;});
