import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
function fixture(rows,account='own-account'){
 const ctx=vm.createContext({Date});vm.runInContext(source,ctx);ctx.getAvanteSessionUser_=()=>account;
 const sheet={getLastRow:()=>rows.length+1,getLastColumn:()=>8,getRange:()=>({getValues:()=>rows})};
 ctx.getSpreadsheet_=()=>({getSheetByName:()=>sheet});return ctx;
}
const row=(account,id='own-response',meta={})=>[new Date('2026-10-18T20:00:00Z'),id,'Empresa fictícia','11222333000181','Cidade fictícia','Área fictícia',JSON.stringify({meta,business:{nome:'Empresa fictícia',produtoCategorias:['Produto declarado']},answers:{private:'not returned'},suppliers:{private:'not returned'}}),account];
test('conclusão é autenticada, privada da própria conta e somente leitura',()=>{
 const ctx=fixture([row('own-account'),row('another-account','other-response')]);const r=ctx.getAvanteSurveyCompletion('fixture');assert.equal(r.completed,true);assert.equal(r.responseId,'own-response');assert.equal(r.business.nome,'Empresa fictícia');assert.equal(r.submittedAt,'2026-10-18T20:00:00.000Z');assert.equal(r.answers,undefined);assert.equal(r.suppliers,undefined);assert.equal(r.profilePublished,undefined);
});
test('conclusão não assume dados alheios, simulação, JSON inválido ou identidade legada sem conta',()=>{
 const broken=row('own-account');broken[6]='not json';const nullPayload=row('own-account');nullPayload[6]='null';const ctx=fixture([row('another-account'),row('', 'legacy'),row('own-account','simulation',{simulation:true}),broken,nullPayload]);assert.equal(ctx.getAvanteSurveyCompletion('fixture').completed,false);
});
test('sem autenticação não consulta planilha; ausência de respostas não cria abas',()=>{
 const ctx=fixture([], '');ctx.getSpreadsheet_=()=>{throw Error('não consultar');};assert.equal(ctx.getAvanteSurveyCompletion('').ok,false);
 const empty=fixture([]);empty.getSpreadsheet_=()=>({getSheetByName:()=>null});assert.equal(empty.getAvanteSurveyCompletion('fixture').completed,false);
});
