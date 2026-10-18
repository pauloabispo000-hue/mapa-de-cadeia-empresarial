import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
const draft=()=>({meta:{startedAt:'2026-10-18T10:00:00Z'},answers:{nome:'Empresa fictícia'},business:{cnpj:'11222333000181'},suppliers:{lista:[]}});
function fixture(rows){
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 ctx.getAvanteSessionUser_=token=>token==='valid'?'owner':'';
 ctx.getSpreadsheet_=()=>({getSheetByName:()=>({getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>rows})})});
 return ctx;
}
const row=(data,account='owner',id='test-receipt')=>['',id,'','','','',JSON.stringify(data),account];
test('recibo autentica a conta e confirma apenas respostas idênticas, sem gravar ou publicar',()=>{
 const p=draft(),ctx=fixture([row(p)]),result=ctx.getAvanteSurveyReceipt('valid',p);
 assert.equal(result.responsesSaved,true);assert.equal(result.responseId,'test-receipt');assert.equal(result.profilePublished,null);
 assert.equal(ctx.getAvanteSurveyReceipt('expired',p).ok,false);
 assert.equal(fixture([row(p,'other')]).getAvanteSurveyReceipt('valid',p).ok,false);
});
test('ausência, ambiguidade e respostas diferentes mantêm resultado desconhecido',()=>{
 const p=draft();
 assert.equal(fixture([]).getAvanteSurveyReceipt('valid',p).ok,false);
 assert.equal(fixture([row(p),row(p,'owner','another')]).getAvanteSurveyReceipt('valid',p).ok,false);
 const ctx=fixture([row(p)]);p.answers.nome='Respostas editadas';assert.equal(ctx.getAvanteSurveyReceipt('valid',p).ok,false);
 delete p.meta.startedAt;assert.equal(ctx.getAvanteSurveyReceipt('valid',p).ok,false);
});
test('comparação independe da ordem das propriedades e não retorna dados privados',()=>{
 const p=draft(),other={suppliers:p.suppliers,business:p.business,answers:p.answers,meta:p.meta};
 const r=fixture([row(p)]).getAvanteSurveyReceipt('valid',other);
 assert.equal(r.ok,true);assert(!JSON.stringify(r).includes('Empresa fictícia'));assert(!JSON.stringify(r).includes('owner'));
});
