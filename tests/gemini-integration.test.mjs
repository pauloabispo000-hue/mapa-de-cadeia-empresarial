import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
function fixture({status=200,body={candidates:[{finishReason:'STOP',content:{parts:[{text:'### Orientação\n**Cidade fictícia**\n* Item'}]}}]},key='fixture-key',model='',throws=false,statuses=null,retryAfter=null,quotaResult=true}={}){
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

function generated(finishReason,parts=[{text:'**Orientação** parcial,'}],extra={}){return fixture({body:{candidates:[{finishReason,content:{parts}}],...extra}});}
test('MAX_TOKENS preserva texto seguro e informa resposta parcial sem continuação',()=>{
 const f=generated('MAX_TOKENS',undefined,{usageMetadata:{thoughtsTokenCount:900,candidatesTokenCount:300,totalTokenCount:1400}}),r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});
 assert.equal(r.ok,true);assert.equal(r.partial,true);assert.equal(r.finishReason,'MAX_TOKENS');assert.match(r.warning,/Resposta parcial/);assert.equal(r.tokenUsage.thoughtsTokenCount,900);assert.equal(f.calls.length,1);
 const payload=JSON.parse(f.calls[0].options.payload);assert.equal(payload.generationConfig.maxOutputTokens,1200);assert.match(payload.systemInstruction.parts[0].text,/180 palavras/);
});
test('STOP confirma conclusão; raciocínio não é exibido e números de uso inválidos são descartados',()=>{
 const f=generated('STOP',[{thought:true,text:'raciocínio privado'},{text:'Texto completo.'}],{usageMetadata:{thoughtsTokenCount:'segredo',totalTokenCount:30}}),r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});
 assert.equal(r.partial,false);assert.equal(r.warning,'');assert.equal(r.answer,'Texto completo.');assert.equal(r.tokenUsage.thoughtsTokenCount,undefined);assert.equal(r.tokenUsage.totalTokenCount,30);assert.equal(f.calls.length,1);
});
test('bloqueios no candidato não exibem conteúdo nem disparam continuação',()=>{
 for(const reason of ['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII']){const f=generated(reason),r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});assert.equal(r.code,'AI_CONTENT_REJECTED');assert.equal(r.answer,undefined);assert.equal(f.calls.length,1);}
});
test('sem candidates, sem texto visível ou sem motivo de término não presume conclusão',()=>{
 for(const body of [{},{candidates:[]}]){const f=fixture({body}),r=f.ctx.runAvanteAiAssistant('user',{question:'Teste'});assert.equal(r.ok,false);assert.equal(f.calls.length,1);}
 const empty=generated('MAX_TOKENS',[{thought:true,text:'não exibir'}]);assert.equal(empty.ctx.runAvanteAiAssistant('user',{question:'Teste'}).code,'AI_INCOMPLETE_RESPONSE');
 const unknown=generated(undefined);assert.equal(unknown.ctx.runAvanteAiAssistant('user',{question:'Teste'}).partial,true);
 const capped=generated('STOP',[{text:'a'.repeat(12001)}]);assert.equal(capped.ctx.runAvanteAiAssistant('user',{question:'Teste'}).partial,true);
});

test('busca de fornecedores usa web e retorna somente evidência vinculada a referências, sem relações privadas',()=>{
 const answer='Empresa fictícia oferece pão. Entrega ainda não confirmada.';
 const f=fixture({body:{candidates:[{finishReason:'STOP',content:{parts:[{text:answer}]},groundingMetadata:{groundingChunks:[{web:{title:'Catálogo fictício',uri:'https://example.com/catalogo'}},{web:{title:'Sem apoio',uri:'https://example.com/sem-apoio'}}],groundingSupports:[{segment:{text:'Empresa fictícia oferece pão.'},groundingChunkIndices:[0]},{segment:{text:'Não está na resposta'},groundingChunkIndices:[1]}]}}]}});
 const r=f.ctx.runAvanteAiAssistant('user',{mode:'suppliers',question:'pão em Cidade fictícia'});
 assert.equal(r.ok,true);assert.equal(r.externalResults.length,1);assert.equal(r.externalResults[0].url,'https://example.com/catalogo');assert.equal(r.externalResults[0].evidence.length,1);
 const payload=JSON.parse(f.calls[0].options.payload);assert.deepEqual(payload.tools,[{google_search:{}}]);assert.equal(payload.contents[0].parts[0].text,'pão em Cidade fictícia');assert.equal(f.calls.length,1);
});
test('busca externa sem grounding, com referência insegura ou suporte malformado não inventa fornecedor',()=>{
 for(const metadata of [{},{groundingChunks:[{web:{uri:'javascript:alert(1)'}}],groundingSupports:[{segment:{text:'Texto'},groundingChunkIndices:[0]}]},{groundingChunks:[{web:{uri:'https://example.com'}}],groundingSupports:[{segment:{text:'Texto'},groundingChunkIndices:[-1,0.5,'0']}]}]){
  const f=fixture({body:{candidates:[{finishReason:'STOP',content:{parts:[{text:'Texto'}]},groundingMetadata:metadata}]}}),r=f.ctx.runAvanteAiAssistant('user',{mode:'suppliers',question:'pão'});assert.equal(r.code,'AI_NO_EXTERNAL_EVIDENCE');assert.equal(f.calls.length,1);
 }
 const f=fixture({status:400}),r=f.ctx.runAvanteAiAssistant('user',{mode:'suppliers',question:'pão'});assert.equal(r.code,'AI_WEB_SEARCH_UNAVAILABLE');assert.equal(f.calls.length,1);
});
test('índice de perfis lê somente a planilha pública, sem criação, pendências ou vínculos privados',()=>{
 const f=fixture();const row=(cnpj,status)=>[cnpj,'Empresa fictícia','Brasil','Descalvado','[]','["Pão francês"]','Público','','',new Date('2026-10-18'),status,'[{"name":"Pão congelado"}]'];
 f.ctx.getSpreadsheet_=()=>({getSheetByName(name){assert.equal(name,'PerfisPublicos');return {getLastRow:()=>4,getRange:()=>({getValues:()=>[row('11222333000181','APROVADO AUTOMATICAMENTE'),row('11222333000181','RETIRADO'),row('00000000000000','APROVADO')]})};}});
 const r=f.ctx.readPublishedSupplierProfiles_();assert.equal(r.length,1);assert.equal(r[0].profilePublished,true);assert.equal(r[0].offers.length,2);assert.equal(r[0].description,undefined);assert.equal(f.calls.length,0);
});

test('consulta cadastral autenticada retorna apenas situação pública, sem presumir licenças ou devolver erros brutos',()=>{
 const f=fixture();let count=0;f.ctx.lookupCompanyCnpj=()=>{count++;return {ok:true,dados:{nomeFantasia:'Fictícia',municipio:'Descalvado',uf:'SP',situacao:'ATIVA',fonte:'Fonte pública',segredo:'não retornar'}};};
 assert.equal(f.ctx.getAvanteSupplierRegistration('', '11222333000181').ok,false);assert.equal(count,0);
 const r=f.ctx.getAvanteSupplierRegistration('user','11222333000181');assert.equal(r.status,'ATIVA');assert.equal(r.segredo,undefined);assert.equal(r.license,undefined);assert.equal(count,1);
 f.ctx.lookupCompanyCnpj=()=>({ok:false,error:'fixture-key detalhe bruto'});assert(!JSON.stringify(f.ctx.getAvanteSupplierRegistration('user','11222333000181')).includes('fixture-key'));
});
