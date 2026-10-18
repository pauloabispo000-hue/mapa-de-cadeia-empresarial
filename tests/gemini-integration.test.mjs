import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
function fixture({status=200,body={candidates:[{content:{parts:[{text:'### Orientação\n**Cidade fictícia**\n* Item'}]}}]},key='fixture-key',model='',throws=false,statuses=null,retryAfter=null,quotaResult=true}={}){
 const calls=[],quota=[],logs=[],delays=[];
 const ctx=vm.createContext({Utilities:{sleep:ms=>delays.push(ms)},console:{warn:s=>logs.push(s)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>({GEMINI_API_KEY:key,GEMINI_MODEL:model})[k]||''})},UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});if(throws)throw Error('fixture-key private transport detail');return {getResponseCode:()=>statuses?statuses[Math.min(calls.length-1,statuses.length-1)]:status,getAllHeaders:()=>retryAfter?{'Retry-After':retryAfter}:{},getContentText:()=>typeof body==='string'?body:JSON.stringify(body)};}}});
 vm.runInContext(source,ctx);ctx.getAvanteSessionUser_=t=>t==='admin'?'admin.avante':t==='user'?'user':'';ctx.getAvanteAdminProperty_=()=> 'admin.avante';ctx.consumeAvanteAiQuota_=u=>{quota.push(u);return quota.length>1?quotaResult:true;};
 return {ctx,calls,quota,logs,delays};
}
test('503 é do upstream e não do parser; diagnóstico devolve apenas estado permitido e nunca corpo, chave ou consulta',()=>{
 const f=fixture({status:503,body:{error:{status:'UNAVAILABLE',message:'fixture-key conteúdo privado'}}});
 const r=f.ctx.runAvanteAiAssistant('user',{question:'Consulta fictícia privada'});
 assert.equal(r.httpStatus,503);assert.equal(r.providerStatus,'UNAVAILABLE');assert.equal(r.code,'AI_UNAVAILABLE');assert.equal(r.retryAfterSeconds,30);assert.equal(f.calls.length,2);assert.equal(f.quota.length,2);assert.equal(f.delays.length,1);assert(f.delays[0]>=500&&f.delays[0]<=750);
 assert(!JSON.stringify(r).includes('fixture-key'));assert(!JSON.stringify(r).includes('conteúdo privado'));assert.equal(f.logs.length,0);
});
test('401, 403, 404 e 429 não disparam retries e distinguem configuração, modelo e cota',()=>{
 for(const [status,code] of [[400,'AI_HTTP_ERROR'],[401,'AI_AUTHORIZATION'],[403,'AI_AUTHORIZATION'],[404,'AI_MODEL_NOT_FOUND'],[429,'AI_QUOTA']]){
  const f=fixture({status,body:{error:{status:'NOT_FOUND'}}});const r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});
  assert.equal(r.code,code);assert.equal(f.calls.length,1);assert.equal(f.quota.length,1);
 }
});
test('resposta bem-sucedida, contrato inválido e falha de transporte são diferenciados',()=>{
 assert.equal(fixture().ctx.runAvanteAiAssistant('user',{question:'Teste'}).ok,true);
 assert.equal(fixture({body:'<html>erro</html>'}).ctx.runAvanteAiAssistant('user',{question:'Teste'}).code,'AI_INVALID_JSON');
 assert.equal(fixture({body:{candidates:[{content:{parts:{text:'wrong'}}}]}}).ctx.runAvanteAiAssistant('user',{question:'Teste'}).code,'AI_INVALID_RESPONSE');
 assert.equal(fixture({body:{other:[]}}).ctx.runAvanteAiAssistant('user',{question:'Teste'}).code,'AI_INVALID_RESPONSE');
 const f=fixture({throws:true}),r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});assert.equal(r.code,'AI_TRANSPORT');assert(!JSON.stringify(r).includes('fixture-key'));
});
test('chave ausente ou modelo malformado não chamam o provedor',()=>{
 for(const options of [{key:''},{model:'https://another-host/model'}]){const f=fixture(options);assert.equal(f.ctx.runAvanteAiAssistant('user',{question:'Teste'}).ok,false);assert.equal(f.calls.length,0);}
});
test('diagnóstico administrativo consulta apenas metadados e nunca consome geração ou expõe chave',()=>{
 const f=fixture({body:{supportedGenerationMethods:['generateContent']}});
 assert.equal(f.ctx.getAvanteAiDiagnostics('user').ok,false);assert.equal(f.calls.length,0);
 const r=f.ctx.getAvanteAiDiagnostics('admin');assert.equal(r.ok,true);assert.equal(r.model,'gemini-3.8-flash');assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'get');assert.equal(f.quota.length,0);assert(!JSON.stringify(r).includes('fixture-key'));
});
test('metadados negados ou sem método esperado não confirmam configuração nem disponibilidade de geração',()=>{
 for(const options of [{status:404,body:{error:{status:'NOT_FOUND',message:'fixture-key'}}},{body:{supportedGenerationMethods:['countTokens']}}]){
  const f=fixture(options),r=f.ctx.getAvanteAiDiagnostics('admin');assert.equal(r.ok,false);assert(!JSON.stringify(r).includes('fixture-key'));assert.equal(f.calls.length,1);
 }
});


test('erro transitório seguido de sucesso faz somente duas tentativas e consome as duas cotas',()=>{
 const f=fixture({statuses:[503,200]});const r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});
 assert.equal(r.ok,true);assert.equal(r.attempts,2);assert.equal(f.calls.length,2);assert.equal(f.quota.length,2);assert.equal(f.delays.length,1);
});
test('Retry-After longo e cota esgotada impedem a segunda chamada sem ocultar o 503',()=>{
 for(const options of [{retryAfter:'60'},{quotaResult:'daily'}]){
  const f=fixture({status:503,...options});const r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});
  assert.equal(r.httpStatus,503);assert.equal(r.attempts,1);assert.equal(f.calls.length,1);assert.equal(f.delays.length,0);assert(r.retrySkipped);
 }
});
test('resposta lenta não inicia nova tentativa que pode superar o prazo interativo',()=>{
 const f=fixture({status:503});let clock=0;f.ctx.Date={now:()=>{clock+=6000;return clock;}};
 const r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});assert.equal(r.attempts,1);assert.equal(r.retrySkipped,'INTERACTIVE_BUDGET');
});


test('recusa de conteúdo em resposta válida não é classificada como defeito de contrato nem repetida',()=>{
 const f=fixture({body:{promptFeedback:{blockReason:'SAFETY'}}});
 const r=f.ctx.runAvanteAiAssistant('user',{question:'Consulta fictícia'});
 assert.equal(r.code,'AI_CONTENT_REJECTED');assert.equal(f.calls.length,1);assert.equal(f.delays.length,0);
});
