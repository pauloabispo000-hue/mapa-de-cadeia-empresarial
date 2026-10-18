import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const html=readFileSync(new URL('../Apps Script/Index.html',import.meta.url),'utf8');
const normalizeSearch=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function searchFixture(){
 const ctx=vm.createContext({normalizeSearch,normalizarCNPJ:s=>String(s||'').replace(/\D/g,''),state:{fornecedores:{lista:[{empresa:'PADARIA FICTICIA',cidade:'Descalvado',categorias:['Pão francês','Bolo'],cnpj:'11222333000181'}]}},sharedCompanies:[{name:'Outra padaria',city:'Outra cidade',offers:[{nome:'Pão francês'}]},{name:'CNAE sem oferta',city:'Descalvado',catalogSource:'registry',offer:'Pão francês'}]});
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
