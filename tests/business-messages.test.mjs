import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
const from='11222333000181',to='11444777000161';
function fixture(){
 const rows={PerfisPublicos:[[from,'Compradora','','Descalvado','','[]','','','',new Date(),'APROVADO','[]'],[to,'Fornecedora','','São Carlos','','[]','','','',new Date(),'APROVADO','[]']],ContasPerfisPublicos:[[from,'buyer'],[to,'seller']],PreferenciasComunicacaoAvante:[['seller','true']]};let writes=0;
 const sheet=name=>({getLastRow:()=>rows[name].length+1,getRange:(start,col,count,width)=>({getValues:()=>rows[name].slice(start-2,start-2+count).map(row=>row.slice(col-1,col-1+width)),setValue:value=>{rows[name][start-2][col-1]=value;writes++;}}),appendRow:row=>{rows[name].push(row);writes++;}});
 const ss={getSheetByName:name=>rows[name]?sheet(name):null};
 const ctx=vm.createContext({Utilities:{getUuid:()=> 'message-'+writes},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})}});vm.runInContext(source,ctx);ctx.getAvanteSessionUser_=token=>['buyer','seller','third'].includes(token)?token:'';ctx.getSpreadsheet_=()=>ss;ctx.ensureSheet_=(_,name)=>{rows[name]??=[];return sheet(name);};
 return {ctx,rows,writes:()=>writes};
}
const payload=(more={})=>({fromCnpj:from,toCnpj:to,body:'Solicito cotação com frete.',requestId:'test-attempt-0001',consent:true,...more});
test('sessão, vínculo de origem, destinatário publicado, opt-in e consentimento são necessários antes de gravar',()=>{
 for(const [token,input,setup] of [['',payload()],['third',payload()],['buyer',payload({consent:false})],['buyer',payload({simulation:true})],['buyer',payload({toCnpj:'00000000000000'})],['buyer',payload(),f=>{f.rows.PreferenciasComunicacaoAvante=[];}],['buyer',payload(),f=>{f.rows.PerfisPublicos[1][10]='RETIRADO';}]]){const f=fixture();if(setup)setup(f);assert.equal(f.ctx.sendAvanteBusinessMessage(token,input).ok,false);assert.equal(f.writes(),0);}
});
test('envio explícito é privado e idempotente; mesmo ID e outro texto é recusado',()=>{
 const f=fixture(),first=f.ctx.sendAvanteBusinessMessage('buyer',payload());assert.equal(first.ok,true);assert.equal(f.writes(),1);assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload()).duplicate,true);assert.equal(f.writes(),1);assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({body:'Outro texto'})).ok,false);assert.equal(f.writes(),1);
 assert.equal(f.ctx.getAvanteCommunications('buyer').messages.length,1);assert.equal(f.ctx.getAvanteCommunications('seller').messages.length,1);assert.equal(f.ctx.getAvanteCommunications('third').messages.length,0);
 const returned=f.ctx.getAvanteCommunications('seller').messages[0];assert.equal(returned.fromName,'Compradora');assert.equal(returned.fromAccount,undefined);assert.equal(returned.requestId,'');
});
test('mensagens que começam com fórmula ficam serializadas e retomam o texto exato',()=>{
 const f=fixture(),body='=IMPORTDATA("https://example.com")';assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({body})).ok,true);assert.equal(f.rows.MensagensEmpresariaisAvante[0][8],JSON.stringify(body));assert.equal(f.ctx.getAvanteCommunications('seller').messages[0].body,body);assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({body})).duplicate,true);
});
test('limite de 10 mensagens por 24 horas é respeitado, sem impedir confirmação idempotente',()=>{
 const f=fixture();for(let i=0;i<10;i++)assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({requestId:'attempt-number-'+i})).ok,true);assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({requestId:'attempt-number-11'})).ok,false);assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({requestId:'attempt-number-0'})).duplicate,true);assert.equal(f.rows.MensagensEmpresariaisAvante.length,10);
});
test('desabilitar recebimento preserva histórico e bloqueia novas mensagens; leituras não criam planilhas',()=>{
 const f=fixture();f.ctx.getAvanteCommunications('buyer');assert.equal(f.writes(),0);f.ctx.sendAvanteBusinessMessage('buyer',payload());assert.equal(f.ctx.setAvanteCommunicationPreference('seller',false).ok,true);assert.equal(f.ctx.sendAvanteBusinessMessage('buyer',payload({requestId:'attempt-new-0002'})).ok,false);assert.equal(f.ctx.getAvanteCommunications('seller').messages.length,1);
});

test('falha depois da gravação retorna resultado desconhecido; mesma tentativa confirma sem duplicar',()=>{
 const f=fixture(),original=f.ctx.ensureSheet_;f.ctx.ensureSheet_=(...args)=>{const sheet=original(...args);return {...sheet,appendRow(row){sheet.appendRow(row);throw new Error('resposta interrompida');}};};
 const first=f.ctx.sendAvanteBusinessMessage('buyer',payload());assert.equal(first.ok,false);assert.equal(first.outcomeUnknown,true);assert.equal(f.writes(),1);const retry=f.ctx.sendAvanteBusinessMessage('buyer',payload());assert.equal(retry.ok,true);assert.equal(retry.duplicate,true);assert.equal(f.writes(),1);
});
