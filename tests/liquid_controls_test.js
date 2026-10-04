const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../dashboard.js'), 'utf8');
const section = source.slice(source.indexOf('const LIQUID_CONTROL_SELECTOR'), source.indexOf('bindLiquidControls();'));
const listeners = new Map(), frames = new Map();
let reduced = false, clock = 0, frameId = 0;
function control({card = false, grid = false, compact = false} = {}) {
  const classes = new Set(), navClasses = new Set(), styles = new Map();
  const nav = {classList:{add:n=>navClasses.add(n),remove:n=>navClasses.delete(n)}};
  const c = {disabled:false, isConnected:true, styles, classes, navClasses,
    style:{setProperty:(k,v)=>styles.set(k,v),getPropertyValue:k=>styles.get(k)||'',removeProperty:k=>styles.delete(k)},
    classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},getAttribute:()=>null,
    matches:selector=>selector.includes('.daily-course-card') ? card : selector.includes('.icon-button') ? compact : false,
    closest:selector=>selector==='.mobile-bottom-nav'?nav:selector==='.schedule-grid-scroll'?(grid?{}:null):selector.startsWith('[inert]')?null:c,
    getBoundingClientRect:()=>({left:10,top:20,width:card?320:100,height:card?120:44})};
  return c;
}
const context={document:{documentElement:{classList:{add(){}}},addEventListener:(name,fn)=>listeners.set(name,fn)},
  interfaceMotionEnabled:()=>!reduced,WeakMap,Math,Number,Map,console,
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
vm.createContext(context);
vm.runInContext(section+'\nbindLiquidControls();this.motion={beginLiquidPress,finishLiquidPress,moveLiquidPress,state:c=>liquidControlAnimations.get(c),active:()=>activeLiquidPress};',context);
const event=(target,x=32,y=36,extra={})=>({target,clientX:x,clientY:y,pointerId:1,pointerType:'touch',buttons:1,button:0,isPrimary:true,...extra});
function advance(ms=240) {
  for(let t=0;t<ms;t+=16){clock+=16;const scheduled=[...frames.values()];frames.clear();scheduled.forEach(fn=>fn(clock));}
}
const a=control(), b=control();
context.motion.beginLiquidPress(event(a));
assert(a.classes.has('is-liquid-pressed')&&a.classes.has('is-liquid-reacting'));
assert.equal(a.styles.get('--liquid-touch-x'),'22px');
advance();
const initial=context.motion.state(a).value.x;
context.motion.moveLiquidPress(event(a,40,36));advance(160);
assert(context.motion.state(a).value.x>initial,'surface follows small finger movement');
assert.equal(a.styles.get('--liquid-touch-x'),'30px','highlight follows the contact point');
assert.notEqual(context.motion.state(a).value.sx,context.motion.state(a).value.sy,'press deforms axes differently');
const verticalScale=context.motion.state(a).value.sy;
context.motion.moveLiquidPress(event(a,40,41));advance(160);
assert(context.motion.state(a).value.sy>verticalScale,'vertical tugs stretch along the finger direction');
const before=a.styles.get('transform');
context.motion.finishLiquidPress();advance(16);
assert.notEqual(a.styles.get('transform'),before,'release continues from the deformation');
let overshoot=false;
for(let i=0;i<40;i++){advance(16);const s=context.motion.state(a);if(s&&(s.value.sy>1.001||s.value.sx<.999))overshoot=true;}
assert(overshoot,'spring crosses rest position on release');
advance(1200);
assert.equal(context.motion.state(a),undefined,'settled springs release their frame and compositor styles');
assert.equal(a.styles.has('transform'),false);
assert.equal(a.styles.has('will-change'),false);
assert.equal(frames.size,0);

context.motion.beginLiquidPress(event(a));advance(32);
context.motion.beginLiquidPress(event(b));
assert(!a.classes.has('is-liquid-pressed'),'previous contact releases');
context.motion.moveLiquidPress(event(b,34,50));
assert(!b.classes.has('is-liquid-pressed'),'vertical scroll intention releases the visual');
const release=context.motion.state(b);listeners.get('pointerup')(event(b));
assert.equal(context.motion.state(b),release,'cancelled gestures do not bounce again on pointerup');
assert(release.cancelled);
advance(1200);

const g=control({card:true,grid:true});
context.motion.beginLiquidPress(event(g));context.motion.moveLiquidPress(event(g,44,36));
assert(!g.classes.has('is-liquid-pressed'),'weekly grid horizontal swipes remain native');
advance(1200);
const mouse=control({card:true});
context.motion.beginLiquidPress(event(mouse,50,70,{pointerType:'mouse'}));
context.motion.moveLiquidPress(event(mouse,105,76,{pointerType:'mouse'}));advance(200);
let shape=context.motion.state(mouse).value;
assert(shape.x>0&&Math.abs(shape.x)<=6.1,'mouse drag has bounded displacement');
assert(Math.abs(shape.rotate)<1.6&&Math.abs(shape.skew)<1.7,'rotation and shear stay subtle');
context.motion.moveLiquidPress(event(mouse,500,400,{pointerType:'mouse'}));
assert(!mouse.classes.has('is-liquid-pressed'),'leaving the surface releases it');advance(1200);

context.motion.beginLiquidPress(event(a));advance(16);
listeners.get('pointercancel')(event(a,32,36,{pointerId:2}));
assert(a.classes.has('is-liquid-pressed'),'another pointer cannot cancel the primary contact');
listeners.get('pointercancel')(event(a));advance(1200);
context.motion.beginLiquidPress({target:a,key:'Enter'});advance(32);
assert.equal(a.styles.get('--liquid-touch-x'),'50px','keyboard presses use the center');
listeners.get('keyup')({key:'Enter'});advance(1200);
context.motion.beginLiquidPress(event(a));listeners.get('scroll')();advance(1200);
assert.equal(context.motion.active(),null);
context.motion.beginLiquidPress(event(a));a.isConnected=false;advance(32);
assert.equal(context.motion.state(a),undefined,'replaced DOM nodes stop their animation');a.isConnected=true;
reduced=true;context.motion.beginLiquidPress(event(a));assert(!a.classes.has('is-liquid-pressed'));assert.equal(frames.size,0);
reduced=false;a.styles.set('transform','rotate(2deg)');
context.motion.beginLiquidPress(event(a));advance(32);reduced=true;advance(32);
assert.equal(a.styles.get('transform'),'rotate(2deg)','reduced motion restores original styles during a press');
assert.equal(frames.size,0);reduced=false;
b.disabled=true;context.motion.beginLiquidPress(event(b));assert(!b.classes.has('is-liquid-pressed'));
assert([...listeners.keys()].includes('scroll'));
console.log('liquid controls tests: PASS');
