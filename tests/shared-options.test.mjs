import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../Apps Script/Index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function loadSharedOptions('),html.indexOf('function loadPublicCompanyProfile('));
function fixture(official=false){
 const scripts=[],timers=[],stats=[{textContent:'Carregando…'}],notes=[{textContent:''}];
 let success,failure;
 const ctx=vm.createContext({APPS_SCRIPT_URL:'https://fixture/exec',sharedOptionsStatus:'idle',sharedNetwork:null,sharedWorkforce:{},state:{},learnedSharedCompanies:[],
 document:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)},querySelectorAll:q=>q==='[data-network-value]'?stats:notes},
 loadMunicipalDirectory(){},isAppsScriptApp:()=>official,uid:()=> 'callback1',setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},refreshSharedCompanies(){},syncConversationAnswers(){},saveState(){},renderCurrentStep(){},renderProgramSection(){},canAddAnswer:()=>false,
 google:{script:{run:{withSuccessHandler(fn){success=fn;return this},withFailureHandler(fn){failure=fn;return this},getAvanteSharedOptions(){}}}}});ctx.window=ctx;vm.runInContext(source,ctx);
 return {ctx,scripts,timers,stats,notes,success:r=>success(r),failure:()=>failure()};
}
test('Apps Script inicializa por RPC e não injeta script JSONP',()=>{
 const f=fixture(true);f.ctx.loadSharedOptions();assert.equal(f.scripts.length,0);
 f.success({ok:true,options:{},companies:[],network:{companies:0},workforce:{active:0}});
 assert.equal(f.ctx.sharedOptionsStatus,'ready');assert.equal(f.ctx.sharedNetwork.companies,0);
});
test('timeout mantém callback inofensivo e marca totais indisponíveis em vez de zero',()=>{
 const f=fixture();f.ctx.loadSharedOptions();assert.equal(f.scripts.length,1);
 f.timers[0]();assert.equal(f.ctx.sharedOptionsStatus,'error');assert.equal(f.stats[0].textContent,'Indisponível');
 assert.doesNotThrow(()=>f.ctx.__mapaOptions_callback1({ok:true,options:{},companies:[],network:{companies:99}}));
 assert.equal(f.ctx.sharedNetwork,null);
});
test('JSONP do servidor não lança ReferenceError quando callback já não existe',()=>{
 const ctx=vm.createContext({ContentService:{MimeType:{JAVASCRIPT:'js',JSON:'json',TEXT:'txt'},createTextOutput:text=>({text,setMimeType(){return this}})}});
 vm.runInContext(server,ctx);ctx.getAvanteSharedOptions=()=>({ok:true,options:{},companies:[]});
 const result=ctx.doGet({parameter:{callback:'__mapaOptions_late'}});
 assert.doesNotThrow(()=>vm.runInNewContext(result.text,{}));
 const received=[];vm.runInNewContext(result.text,{__mapaOptions_late:r=>received.push(r)});assert.equal(received.length,1);
 assert.equal(ctx.doGet({parameter:{callback:'bad();'}}).text,'invalid callback');
});
