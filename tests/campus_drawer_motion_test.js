const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('../dashboard.js'),'utf8');
const code = source.slice(source.indexOf('let nativeCampusContentAnimation ='),source.indexOf('function setNativeEcodePlaceholderHidden('));
const classes = new Set();
const classList = {contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}};
const hint={hidden:false};
let scrollTop=0,translation=0,modal=false,reduced=false,renders=0;
const animations=[];
const top=()=>{
 const visible=classes.has('has-visible-campus-code');
 const reservation=visible?112:0, hintHeight=hint.hidden?0:34;
 scrollTop=Math.min(scrollTop,1000+reservation+hintHeight); // layout scroll clamp
 return 106+reservation+hintHeight-scrollTop+translation;
};
const content={getBoundingClientRect:()=>({top:top()}),animate(frames,options){
 let resolve,reject;
 const animation={frames,options,cancelled:false,finished:new Promise((a,b)=>{resolve=a;reject=b;}),
  cancel(){this.cancelled=true;translation=0;reject(Error('cancelled'));},
  advance(fraction){translation=parseFloat(frames[0].translate.split(' ')[1])*(1-fraction);},
  finish(){translation=0;resolve();}};
 animation.advance(0);animations.push(animation);return animation;
}};
const context={IS_ANDROID_APP:true,document:{documentElement:{classList},getElementById:()=>hint},
 state:{mobileShell:{campusHeaderState:'HIDDEN_AT_TOP'}},androidEcodeElements:{card:{classList:{toggle(){}}}},
 elements:{content},nativeCampusCodeButton:null,CAMPUS_HEADER_VISIBLE:'VISIBLE',
 CSS:{supports:()=>true},nativeEcodeModalOpen:()=>modal,interfaceMotionEnabled:()=>!reduced,render:()=>renders++};
vm.createContext(context);vm.runInContext(code+'\nthis.apply=applyNativeEcodePlaceholderState;this.cancel=cancelNativeCampusContentMotion;',context);
function change(value){context.state.mobileShell.campusHeaderState=value;context.apply();}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const start=top();change('VISIBLE');assert.equal(top(),start,'opening starts at the same visual position');
 assert.equal(animations[0].frames[0].translate,'0 -78px','drawer and discovery line share one motion');
 animations[0].advance(.5);const midway=top();change('HIDDEN');
 assert.equal(top(),midway,'rapid reversal starts at current position');assert(animations[0].cancelled);
 vm.runInContext('nativeCampusRenderPending=true;',context);
 animations[1].finish();await tick();assert.equal(renders,1,'one deferred update after settling');
 assert.equal(translation,0);
 change('VISIBLE');animations.at(-1).finish();await tick();
 // At the bottom, collapsing removes scrollable space. Compensate the actual
 // clamp, not a guessed 112px: this case needs zero additional translation.
 scrollTop=1112;const bottom=top(),count=animations.length;change('HIDDEN');
 assert.equal(top(),bottom);assert.equal(scrollTop,1034);assert.equal(animations.length,count);
 scrollTop=400;change('VISIBLE');animations.at(-1).advance(.3);
 modal=true;change('HIDDEN');assert.equal(translation,0,'modal never inherits a drawer transform');
 modal=false;reduced=true;const before=animations.length;change('VISIBLE');assert.equal(animations.length,before);
 console.log('campus drawer motion tests: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
