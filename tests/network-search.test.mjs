import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const html=readFileSync(new URL('../Apps Script/Index.html',import.meta.url),'utf8');
const normalizeSearch=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function searchFixture(){
 const ctx=vm.createContext({normalizeSearch,normalizarCNPJ:s=>String(s||'').replace(/\D/g,''),state:{fornecedores:{lista:[{empresa:'PADARIA FICTICIA',cidade:'Descalvado',categorias:['Pão francês','Bolo'],cnpj:'11222333000181'}]}},sharedCompanies:[{name:'Outra padaria',city:'Outra cidade',offers:[{nome:'Pão francês'}]},{name:'CNAE sem oferta',city:'Descalvado',catalogSource:'registry',offer:'Pão francês'}]});
 vm.runInContext(html.slice(html.indexOf('function parseCompanyLabel('),html.indexOf('function surveyCompanyCatalog(')),ctx);
 vm.runInContext(html.slice(html.indexOf('function findKnownSupplierMatches('),html.indexOf('function renderKnownSupplierMatches(')),ctx);return ctx;
}
test('busca encontra pão e pães informados no negócio sem inferir oferta pelo CNAE',()=>{
 const ctx=searchFixture();
 for(const term of ['Encontre fornecedores de pão em Descalvado','Busco pães em Descalvado'])assert.deepEqual(Array.from(ctx.findKnownSupplierMatches(term),c=>c.name),['PADARIA FICTICIA']);
 assert.equal(ctx.findKnownSupplierMatches('fornecedor de extintores em Descalvado').length,0);
});
test('catálogo versionado contém todos os arquivos anunciados e explicita os 500 registros indisponíveis',()=>{
 const index=JSON.parse(readFileSync(new URL('../empresas-descalvado.json',import.meta.url),'utf8'));
 let count=0;
 for(const shard of index.shards){const path=new URL('../'+shard.file,import.meta.url);assert(existsSync(path));const data=JSON.parse(readFileSync(path,'utf8'));assert.equal(data.companies.length,shard.count);count+=data.companies.length;}
 assert.equal(index.count,count);assert.equal(count+index.unavailableShards.reduce((n,s)=>n+s.count,0),index.expectedCount);
 assert.equal(index.coverage,'partial');
});
test('um fragmento indisponível não descarta os demais dados do catálogo',async()=>{
 const ctx=vm.createContext({APP_PUBLIC_ASSET_BASE:'https://fixture/',municipalCompanies:[],municipalDirectoryStatus:{},activeProgramSection:'overview',document:{querySelectorAll:()=>[]},refreshSharedCompanies(){},fetch:async url=>({ok:!url.endsWith('bad.json'),json:async()=>url.endsWith('empresas-descalvado.json')?{municipality:'Cidade fictícia',expectedCount:2,shards:[{file:'good.json'},{file:'bad.json'}]}:{companies:[{name:'Empresa fictícia',cnpj:'11222333000181'}]}})});
 vm.runInContext(html.slice(html.indexOf('function loadMunicipalDirectory('),html.indexOf('function refreshSharedCompanies(')),ctx);
 await ctx.loadMunicipalDirectory();assert.equal(ctx.municipalCompanies.length,1);assert.equal(ctx.municipalDirectoryStatus.partial,true);
 assert.match(ctx.municipalDirectoryMessage(),/Catálogo parcial/);
});


test('fornecedor com cidade ausente continua útil sem inferir localização; UF na cidade é normalizada',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista[0].cidade='';
 let results=ctx.findKnownSupplierMatches('Encontre fornecedores de pão em Descalvado');
 assert.equal(results.length,1);assert.equal(results[0].city,'');
 ctx.state.fornecedores.lista[0].cidade='Descalvado/SP';
 results=ctx.findKnownSupplierMatches('Encontre fornecedores de pão em Descalvado');assert.equal(results.length,1);
});

test('pluralização preserva singular e plural para fornecedores e soluções',()=>{
 const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function quantityLabel('),html.indexOf('function renderNetworkPage(')),ctx);
 assert.equal(ctx.supplierSolutionsLabel({suppliers:{one:1},solutions:{one:1}}),'1 fornecedor · 1 solução informada para este negócio');
 assert.equal(ctx.quantityLabel(0,'solução','soluções'),'0 soluções');
 assert.equal(ctx.quantityLabel(2,'fornecedor','fornecedores'),'2 fornecedores');
});


test('rótulo composto separa identidade e cidade citada sem inventar localização estruturada',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[{empresa:'ESTILOS FICTÍCIOS — CNPJ 11.222.333/0001-81 · DESCALVADO - SP',categorias:['Vestuário corporativo']}];
 const result=ctx.findKnownSupplierMatches('fornecedores de vestuário corporativo em Descalvado')[0];
 assert.equal(result.name,'ESTILOS FICTÍCIOS');assert.equal(result.cnpj,'11222333000181');assert.equal(result.city,'');assert.equal(result.citedCity,'DESCALVADO - SP');
});

test('localidades oficiais normalizam acentos, caixa e UF sem criar equivalentes novos',()=>{
 const ctx=vm.createContext({normalizeSearch,UF_LABELS:{SP:'São Paulo'}});
 vm.runInContext(html.slice(html.indexOf('function normalizeLocality('),html.indexOf('function comboField(')),ctx);
 assert.equal(ctx.normalizeLocality('sao paulo'),ctx.normalizeLocality('São Paulo - SP'));
 assert.equal(ctx.normalizeLocality('DESCALVADO SP'),ctx.normalizeLocality('Descalvado - SP'));
});

test('diretório cadastral encontra padarias como candidatas sem inventar oferta e filtra termos não relacionados',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];ctx.sharedCompanies=[{name:'PADARIA FICTÍCIA',cnpj:'11222333000181',city:'Descalvado',catalogSource:'registry',cnae:'1091102 · Fabricação de produtos de padaria e confeitaria com predominância de produção própria',status:'ATIVA'},{name:'Oficina fictícia',city:'Descalvado',cnae:'Manutenção mecânica'}];
 const results=ctx.findSupplierCandidates('Como encontrar fornecedores de pão em Descalvado?');
 assert.equal(results.length,1);assert.equal(results[0].evidenceType,'registry');assert.equal(results[0].offers.length,0);assert.equal(results[0].region,'local');assert.equal(ctx.findKnownSupplierMatches('pão em Descalvado').length,0);
 assert.equal(ctx.findSupplierCandidates('extintores em Descalvado').length,0);
});
test('ofertas regionais são mantidas com entrega pendente e cobertura explicitamente declarada tem prioridade',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];ctx.sharedCompanies=[{name:'Regional fictícia',city:'São Carlos',offers:[{nome:'Pão francês'}]},{name:'Atendimento fictício',city:'Porto Ferreira',offers:[{nome:'Pão francês'}],serviceCities:['Descalvado']}];
 const r=ctx.findSupplierCandidates('pão em Descalvado');assert.equal(r.length,2);assert.equal(r[0].region,'delivery');assert.equal(r[1].region,'outside');
});
test('busca exige todos os termos do produto, usa oferta de perfil público e deduplica pela melhor evidência',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];ctx.sharedCompanies=[{name:'Fictícia',city:'Descalvado',cnpj:'11222333000181',catalogSource:'registry',cnae:'Confecção de roupas'},{name:'Fictícia',city:'Descalvado',cnpj:'11222333000181',profilePublished:true,offers:[{nome:'Vestuário corporativo'}]},{name:'Outro produto',offers:[{nome:'Vestuário infantil'}]}];
 const r=ctx.findSupplierCandidates('vestuário corporativo em Descalvado');assert.equal(r[0].profilePublished,true);assert.equal(r.filter(c=>c.cnpj==='11222333000181').length,1);assert(!r.some(c=>c.name==='Outro produto'));
});
test('cadastro baixado não vira candidato e CNAE secundário compatível não vira oferta',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];ctx.sharedCompanies=[{name:'Baixada',status:'BAIXADA',city:'Descalvado',cnae:'1091102'},{name:'Secundária',status:'ATIVA',city:'Descalvado',secondaryCnaes:['4721102']}];
 const r=ctx.findSupplierCandidates('pão em Descalvado');assert.equal(r.length,1);assert.equal(r[0].name,'Secundária');assert.equal(r[0].evidenceType,'registry');
});

test('catálogo municipal real versionado produz candidatos para pão sem fabricar ofertas',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];
 const index=JSON.parse(readFileSync(new URL('../empresas-descalvado.json',import.meta.url),'utf8'));
 ctx.sharedCompanies=index.shards.flatMap(shard=>JSON.parse(readFileSync(new URL('../'+shard.file,import.meta.url),'utf8')).companies).map(record=>({name:record.name,cnpj:record.cnpj,city:'Descalvado',cnae:record.cnae,secondaryCnaes:record.secondaryCnaes,status:record.status,catalogSource:'registry'}));
 const r=ctx.findSupplierCandidates('Como encontrar fornecedores de pão em Descalvado?');assert(r.length>0);assert(r.every(c=>c.evidenceType==='registry'&&c.offers.length===0));
});
test('perfil publicado enriquece oferta sem depender da aprovação do diretório ou exportar candidatos privados',()=>{
 const ctx=vm.createContext({PUBLIC_COMPANY_CATALOG:[],municipalCompanies:[{name:'Empresa fictícia',cnpj:'11222333000181',catalogSource:'registry',cnae:'Padaria'}],learnedSharedCompanies:[],publishedSupplierCompanies:[{name:'Empresa fictícia',cnpj:'11222333000181',offers:[{nome:'Pão francês'}],profilePublished:true}],normalizarCNPJ:s=>String(s||''),normName:normalizeSearch});
 vm.runInContext(html.slice(html.indexOf('function refreshSharedCompanies('),html.indexOf('function loadSharedOptions(')),ctx);ctx.refreshSharedCompanies();assert.equal(ctx.sharedCompanies.length,1);assert.equal(ctx.sharedCompanies[0].profilePublished,true);assert.equal(ctx.sharedCompanies[0].offers[0].nome,'Pão francês');
});

test('atualizar catálogo após retirar perfil não retém oferta no registro municipal ou catálogo estático',()=>{
 const municipal={name:'Empresa fictícia',cnpj:'11222333000181',catalogSource:'registry',cnae:'Padaria'},base={name:'Outra empresa',cnpj:'99999999999999',offer:'Oferta pública',catalogSource:'public'};
 const ctx=vm.createContext({PUBLIC_COMPANY_CATALOG:[base],municipalCompanies:[municipal],learnedSharedCompanies:[],publishedSupplierCompanies:[{name:'Empresa fictícia',cnpj:municipal.cnpj,offers:[{nome:'Oferta retirada'}],profilePublished:true}],normalizarCNPJ:s=>String(s||''),normName:normalizeSearch});
 vm.runInContext(html.slice(html.indexOf('function refreshSharedCompanies('),html.indexOf('function loadSharedOptions(')),ctx);ctx.refreshSharedCompanies();assert.equal(ctx.sharedCompanies[1].offers.length,1);assert.equal(municipal.offers,undefined);ctx.publishedSupplierCompanies=[];ctx.refreshSharedCompanies();assert.equal(ctx.sharedCompanies[1].offers.length,0);assert.equal(ctx.sharedCompanies[1].profilePublished,undefined);assert.equal(base.offers,undefined);
});

test('panificação expõe CNAE principal/secundário e exclui alimentos/comércio genéricos sem evidência',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];ctx.sharedCompanies=[
 {name:'A secundária',city:'Descalvado',catalogSource:'registry',cnae:'5611203 · Lanchonetes, casas de chá, de sucos e similares',secondaryCnaes:['5620104','5620102','1091102']},
 {name:'Z principal',city:'Descalvado',catalogSource:'registry',cnae:'1091102 · Fabricação de produtos de padaria e confeitaria com predominância de produção própria'},
 {name:'Mercado genérico',city:'Descalvado',catalogSource:'registry',cnae:'Comércio varejista de alimentos em geral'},
 {name:'Restaurante genérico',city:'Descalvado',catalogSource:'registry',cnae:'Restaurantes e similares'},
 {name:'Mercado com oferta real',city:'Descalvado',offers:[{nome:'Pão francês'}],cnae:'Comércio genérico'}];
 const r=ctx.findSupplierCandidates('fornecedores de pão em Descalvado');
 assert.equal(r.length,3);assert.equal(r[0].name,'Mercado com oferta real');assert.equal(r[1].name,'Z principal');assert.equal(r[2].name,'A secundária');assert.equal(r[2].matchEvidence[0].kind,'CNAE secundário');assert.match(r[2].matchEvidence[0].text,/1091102/);assert.match(r[0].matchEvidence[0].text,/Pão francês/);assert.equal(r[2].source,'Diretório municipal de Descalvado — Dados Abertos do CNPJ');
});
test('busca mantém todos os resultados após ordenação, sem corte silencioso em 30',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];ctx.sharedCompanies=Array.from({length:65},(_,i)=>({name:'Padaria fictícia '+String(i).padStart(2,'0'),cnpj:String(i+1),city:'Descalvado',catalogSource:'registry',cnae:'1091102'}));
 const r=ctx.findSupplierCandidates('pão em Descalvado');assert.equal(r.length,65);assert(r.every(c=>c.matchEvidence.length));
});
test('registro online citado tem evidência secundária no catálogo versionado, sem comprovar produto',()=>{
 const ctx=searchFixture();ctx.state.fornecedores.lista=[];
 const index=JSON.parse(readFileSync(new URL('../empresas-descalvado.json',import.meta.url),'utf8'));
 const record=index.shards.flatMap(shard=>JSON.parse(readFileSync(new URL('../'+shard.file,import.meta.url),'utf8')).companies).find(c=>c.cnpj==='12911593000127');
 ctx.sharedCompanies=[{...record,city:'Descalvado',catalogSource:'registry'}];const r=ctx.findSupplierCandidates('pão em Descalvado');assert.equal(r.length,1);assert.equal(r[0].evidenceType,'registry');assert(r[0].matchEvidence.some(e=>e.kind==='CNAE secundário'&&e.text.includes('1091102')));assert.equal(r[0].offers.length,0);
});
