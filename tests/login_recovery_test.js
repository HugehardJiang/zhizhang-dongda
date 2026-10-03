const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname,'../dashboard.js'),'utf8');
const native = fs.readFileSync(path.join(__dirname,'../android/app/src/main/java/cn/neu/zhizhangdongda/MainActivity.java'),'utf8');
let renders = 0;
const context = {IS_ANDROID_APP:true, state:{androidLogin:{status:'failed',message:'旧的登录失败'},fatalError:'',connected:true,personalCache:{available:true,savedAt:'2026-10-02'}},
  elements:{toastRegion:{children:[{dataset:{category:'login'}}]}},
  showToast(){context.elements.toastRegion.children=[];},
  setNotice(text,type,category){context.elements.toastRegion.children=[{dataset:{category},text}];},
  render(){renders++;}, cacheDateText:()=>'',escapeHtml:String};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('globalThis.__androidLoginStatus ='),source.indexOf('let filterRenderTimer')),context);
vm.runInContext(source.slice(source.indexOf('function androidSessionDisplay()'),source.indexOf('const MOBILE_NAV_VIEW_ALIASES')),context);
assert.match(context.renderAndroidLoginEntry(),/后台自动登录失败/);
context.state.fatalError='登录失效';
context.__androidLoginStatus('ready','');
assert.equal(context.state.androidLogin.message,'');assert.equal(context.state.fatalError,'');
assert.match(context.renderAndroidLoginEntry(),/教务连接正常/);assert.doesNotMatch(context.renderAndroidLoginEntry(),/后台自动登录失败/);assert.equal(context.elements.toastRegion.children.length,0);
context.__androidLoginStatus('ready','');assert.equal(renders,1,'repeated healthy endpoints never rebuild the page');
context.elements.toastRegion.children=[{dataset:{category:'export'},text:'导出成功'}];
context.__androidLoginStatus('ready','');assert.equal(context.elements.toastRegion.children[0].text,'导出成功');
context.__androidLoginStatus('failed','新的真实失效');assert.match(context.renderAndroidLoginEntry(),/新的真实失效/);
context.__androidLoginStatus('ready','');context.state.connected=false;
assert.match(context.renderAndroidLoginEntry(),/当前显示本机缓存/);
assert.doesNotMatch(context.renderAndroidLoginEntry(),/后台自动登录失败/);

// Progress updates preserve the same footer nodes and never render the page.
const nodes = new Map(['title','progress','meta','count'].map(key=>[key,{textContent:''}]));
const persistentCard={dataset:{}};
let slotWrites=0;
const slot={hidden:true,querySelector(selector){return selector==='.android-login-entry'?persistentCard:nodes.get(selector.slice(14,-1));},
 set innerHTML(value){slotWrites++;}};
context.document={getElementById:()=>slot};context.interfaceMotionEnabled=()=>false;
context.state.view='overview';
context.__androidLoginProgress('connecting','正在连接学校认证…');
assert.equal(nodes.get('progress').textContent,'正在连接学校认证…');
const beforeProgress=renders;
context.__androidLoginProgress('authenticating','登录已提交…');
assert.equal(nodes.get('progress').textContent,'登录已提交…');
context.__androidLoginProgress('waiting','请完成学校验证。');
assert.equal(persistentCard.dataset.sessionKind,'waiting');
context.state.connected=true;context.__androidLoginStatus('ready','');
assert.equal(persistentCard.dataset.sessionKind,'ready');
assert.equal(renders,beforeProgress,'streaming progress does not reconstruct page content');
assert.equal(slotWrites,0,'existing footer nodes survive login success');
for(const view of ['overview','personal','scores','exams']){
 context.state.view=view;context.syncAndroidLoginEntry();assert.equal(slot.hidden,false,view+' has the shared session footer');
}
context.state.view='settings';context.syncAndroidLoginEntry();assert.equal(slot.hidden,true);
context.state.view='scores';context.state.loading=true;
context.updateAndroidSyncProgress('考试安排已读取，继续同步…',5,7);
assert.equal(nodes.get('count').textContent,'5 / 7');
assert.equal(nodes.get('progress').textContent,'考试安排已读取，继续同步…');

// Compile the actual two native methods with small UI/preferences stubs. This
// exercises epoch races and recovery state without school requests or a phone.
const extract = (start,end) => native.slice(native.indexOf(start),native.indexOf(end,native.indexOf(start)));
const healthy = extract('    private void markAcademicSessionHealthy()','    private void handleAcademicSessionInvalid(');
const progress = extract('    private void notifyDashboardLoginProgress(', '    private boolean isAcademicPortalReadyUrl(');
const response = extract('    private void applyAcademicResponseStatus(','    private void recordAcademicNetworkFailure(');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'neu-login-recovery-test-'));
const java = `import java.util.*;
public class LoginRecoveryTest {
 boolean backgroundLoginInProgress,backgroundLoginAttemptedForCurrentFailure;
 int academicNetworkFailureStreak,notifications,invalidations;
 long sessionEpoch=2,lastAcademicSessionHealthyAt;
 String pendingAcademicFailureReason="old",lastAcademicLoginError="old",dashboardAcademicLoginStatus="failed";
 String dashboardLoginProgressPhase="",dashboardLoginProgressMessage="";
 boolean dashboardPageReady=true;Web dashboardWebView=new Web();
 static class Web {int deliveries;void evaluateJavascript(String script,Object callback){deliveries++;}}
 static class JSONObject {static String quote(String value){return value;}}
 Pref preferences=new Pref();List<Runnable> queue=new ArrayList<>();
 static class Pref {Pref edit(){return this;}Pref putBoolean(String k,boolean v){return this;}void apply(){}}
 static final String HAS_ACADEMIC_SESSION="session";
 void runOnUiThread(Runnable work){queue.add(work);}
 void flush(){while(!queue.isEmpty())queue.remove(0).run();}
 void setLastAcademicLoginError(String value){lastAcademicLoginError=value;}
 void notifyDashboardLoginStatus(String status,String message){dashboardAcademicLoginStatus=status;notifications++;}
 boolean isAcademicLoginInvalidResponse(int status,String body){return status==401||body.equals("expired");}
 boolean isAcademicPortalReadyUrl(String url){return url.contains("/jwapp/");}
 void handleAcademicSessionInvalid(String message){invalidations++;dashboardAcademicLoginStatus="failed";}
 ${healthy}
 ${response}
 ${progress}
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 public static void main(String[] args){
  LoginRecoveryTest s=new LoginRecoveryTest();
  // Manual success has already cleared persisted error, while WebView still
  // holds failed. A verified endpoint must reconcile both layers exactly once.
  s.lastAcademicLoginError="";s.applyAcademicResponseStatus(2,200,"/jwapp/api","{}");s.flush();
  check(s.dashboardAcademicLoginStatus.equals("ready")&&s.notifications==1,"manual recovery must notify retained UI");
  s.applyAcademicResponseStatus(2,200,"/jwapp/api","{}");s.flush();check(s.notifications==1,"one notification per recovery");
  s.applyAcademicResponseStatus(1,401,"/jwapp/api","expired");s.flush();check(s.invalidations==0,"old cookie response cannot revive failure");
  // The generation check occurs on the UI thread, after queued delivery.
  s.applyAcademicResponseStatus(2,401,"/jwapp/api","expired");s.sessionEpoch=3;s.flush();check(s.invalidations==0,"queued old response is ignored");
  s.applyAcademicResponseStatus(3,401,"/jwapp/api","expired");s.flush();check(s.invalidations==1,"new failure must still display");
  s.applyAcademicResponseStatus(3,200,"/jwapp/api","<html>login</html>");s.flush();check(s.notifications==1,"HTML is not evidence of authenticated data");
  s.backgroundLoginInProgress=true;s.applyAcademicResponseStatus(3,200,"/jwapp/api","{}");s.flush();check(s.notifications==1,"do not clear active background login");
  s.backgroundLoginInProgress=false;s.applyAcademicResponseStatus(3,200,"/jwapp/api","{}");s.flush();check(s.notifications==2,"current healthy session clears newer failure");
  s.notifyDashboardLoginProgress("verifying","checking");s.sessionEpoch=4;s.flush();
  check(s.dashboardWebView.deliveries==0,"old progress cannot overwrite a newer session");
  s.dashboardPageReady=false;s.notifyDashboardLoginProgress("connecting","connect");s.flush();
  check(s.dashboardWebView.deliveries==0,"hold milestones until dashboard script is ready");
  s.dashboardPageReady=true;s.deliverDashboardLoginProgress();check(s.dashboardWebView.deliveries==1,"replay pending milestone on page ready");
  s.notifyDashboardLoginProgress("connecting","connect");s.flush();check(s.dashboardWebView.deliveries==1,"do not repeat identical milestones");
  s.notifyDashboardLoginProgress("waiting","challenge");s.flush();check(s.dashboardWebView.deliveries==2,"publish real verification handoff");
  System.out.println("native login recovery: PASS");
 }
}`;
try {
 fs.writeFileSync(path.join(temp,'LoginRecoveryTest.java'),java);
 const home = process.env.JAVA_HOME || (fs.existsSync('/opt/homebrew/opt/openjdk@17/bin/javac') ? '/opt/homebrew/opt/openjdk@17' : '');
 execFileSync(home?path.join(home,'bin/javac'):'javac',['LoginRecoveryTest.java'],{cwd:temp,stdio:'pipe'});
 const out=execFileSync(home?path.join(home,'bin/java'):'java',['LoginRecoveryTest'],{cwd:temp,encoding:'utf8'});process.stdout.write(out);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log('login recovery tests: PASS');
