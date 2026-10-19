import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../Apps Script/Code.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({});vm.runInContext(code,context);context.getSpreadsheet_=()=>{throw Error('não pode ler/gravar planilha');};return context;}
test('cinco registros informativos reais são estáveis, independentes de contas e sem vínculo de CNPJ presumido',()=>{
 const ctx=fixture(),a=ctx.getAvanteInformativeProfiles(),b=ctx.getAvanteInformativeProfiles();assert.equal(a.length,5);assert.equal(new Set(a.map(p=>p.id)).size,5);assert.deepEqual(a.map(p=>p.id),b.map(p=>p.id));
 for(const p of a){assert.equal(p.kind,'external_informative');assert.equal(p.claimed,false);assert.equal(p.cnpj,'');assert.equal(p.accountLinked,false);assert.equal(p.profilePublished,false);assert.equal(p.messagingOptIn,false);assert.equal(p.registryLink.status,'pending');assert.equal(p.media.length,0);assert.equal(p.observedAt,'2026-10-18');assert(p.registryLink.candidates.length);for(const candidate of p.registryLink.candidates){assert.equal(candidate.address,'');assert.match(candidate.note,/não declarado/);}}
 a[0].fields.name.value='alterado';assert.notEqual(ctx.getAvanteInformativeProfiles()[0].fields.name.value,'alterado');assert.equal(ctx.getAvanteInformativeProfile('id-inexistente').ok,false);
});
test('Tamanduá é uma página com dois candidatos; cada campo observado preserva a fonte Facebook e ausentes permanecem vazios',()=>{
 const records=fixture().getAvanteInformativeProfiles(),tamandua=records.filter(p=>p.id==='facebook-tamanduasupermercado');assert.equal(tamandua.length,1);assert.deepEqual(Array.from(tamandua[0].registryLink.candidates,c=>c.cnpj),['20976947000140','43626865000170']);
 for(const p of records)for(const [key,field] of Object.entries(p.fields)){if(field.value){assert.equal(field.source.type,'facebook');assert.match(field.source.url,/^https:\/\/www.facebook.com\//);assert.equal(field.source.observedAt,'2026-10-18');}else{assert.equal(field.status,'not_observed');assert.equal(field.source,null);}assert.notEqual(key,'cnpj');}
 assert.equal(records[0].fields.email.value,'');assert.equal(records[0].fields.category.value,'Cafeteria');assert.equal(records[1].fields.email.value,'kokasupermercadoadm@gmail.com');assert.equal(records[4].fields.hours.value,'Segunda a sábado 7h–20h; domingo 7h–13h (informados na bio)');
});
test('rota pública informativa não altera nem consulta perfis reivindicados; ID HTML é seguro e chega ao iframe',()=>{
 const ctx=fixture();ctx.ContentService={MimeType:{JSON:'json',TEXT:'text',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})};
 const id='facebook-flordotrigopadariaeconfeitaria',response=JSON.parse(ctx.doGet({parameter:{informativo:id}}).text);assert.equal(response.informativeProfile.id,id);
 let content='<html><head></head><body>teste</body></html>';const output={getContent:()=>content,setContent(value){content=value;return this;},setTitle(){return this;},setFaviconUrl(){return this;},addMetaTag(){return this;}};ctx.HtmlService={createHtmlOutputFromFile:()=>output};ctx.doGet({parameter:{app:'1',informativo:id}});assert.match(content,/body data-informative-profile="facebook-flordotrigopadariaeconfeitaria"/);
 content='<body>teste</body>';ctx.doGet({parameter:{app:'1',informativo:'"><script>alert(1)</script>'}});assert.equal(content,'<body>teste</body>');
 content='<body>teste</body>';ctx.doGet({parameter:{app:'1',perfil:'11.222.333/0001-81'}});assert.match(content,/body data-public-profile="11222333000181"/);
 content='<body>teste</body>';ctx.doGet({parameter:{app:'1',perfil:'00000000000000'}});assert.equal(content,'<body>teste</body>');
});
