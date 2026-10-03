const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../dashboard.js'), 'utf8');
const section = source.slice(source.indexOf('const LIQUID_CONTROL_SELECTOR'), source.indexOf('bindLiquidControls();'));
const listeners = new Map(), animations = [], controls = [];
let reduced = false;
function control() {
  const classes = new Set(), navClasses = new Set(), styles = new Map();
  const nav = {classList:{add:n=>navClasses.add(n),remove:n=>navClasses.delete(n)}};
  const c = {disabled:false, styles, classes, navClasses, style:{setProperty:(k,v)=>styles.set(k,v)},
    classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},
    getAttribute:()=>null, matches:()=>true,
    closest:selector=>selector==='.mobile-bottom-nav'?nav:selector.startsWith('[inert]')?null:c,
    getBoundingClientRect:()=>({left:10,top:20,width:60,height:44}),
    animate(frames,options) {
      let resolve;
      const a={frames,options,finished:new Promise(r=>{resolve=r;}),cancelled:false,
        cancel(){this.cancelled=true;resolve();},finish(){resolve();}};
      animations.push(a);return a;
    }};
  controls.push(c);return c;
}
const context={document:{addEventListener:(name,fn)=>listeners.set(name,fn)},
  interfaceMotionEnabled:()=>!reduced,getComputedStyle:()=>({transform:'none'}),WeakMap,Math,Number,console};
vm.createContext(context);
vm.runInContext(section+'\nbindLiquidControls();this.motion={beginLiquidPress,finishLiquidPress,moveLiquidPress};',context);
const a=control(), b=control();
const event=(target,x=32,y=36)=>({target,clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true});
(async()=>{
  context.motion.beginLiquidPress(event(a));
  assert(a.classes.has('is-liquid-pressed')&&a.navClasses.has('is-liquid-pressing'));
  assert.equal(a.styles.get('--liquid-touch-x'),'22px');
  assert.equal(animations[0].options.duration,110);
  context.motion.beginLiquidPress(event(b));
  assert(!a.classes.has('is-liquid-pressed'), 'previous pressed state must clear');
  assert(b.classes.has('is-liquid-pressed'));
  context.motion.moveLiquidPress(event(b,80,36));
  assert(!b.classes.has('is-liquid-pressed'), 'scroll gestures release visual press');
  const cancelledRelease=animations.at(-1);
  assert.equal(cancelledRelease.options.duration,180);
  listeners.get('pointerup')(event(b));
  assert.equal(animations.at(-1),cancelledRelease, 'pointerup after cancelled gesture must not bounce twice');
  context.motion.beginLiquidPress(event(a));
  context.motion.finishLiquidPress();
  const release=animations.at(-1);
  assert.equal(release.options.duration,460);
  assert(release.frames[1].transform.includes('1.045'), 'release gets a bounded overshoot');
  release.finish();await new Promise(r=>setImmediate(r));
  assert(release.cancelled, 'completed animation must release its compositor state');
  const count=animations.length; reduced=true;
  context.motion.beginLiquidPress(event(a));context.motion.finishLiquidPress();
  assert.equal(animations.length,count,'reduced motion adds no animations');
  reduced=false;b.disabled=true;
  context.motion.beginLiquidPress(event(b));
  assert(!b.classes.has('is-liquid-pressed'), 'disabled buttons never enter pressed state');
  console.log('liquid controls tests: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
