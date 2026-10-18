import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../Apps Script/Index.html',import.meta.url),'utf8');
const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function fixture(){const ctx=vm.createContext({normalizeSearch,normalizarCNPJ:value=>String(value||'').replace(/\D/g,''),geoHaversineKm:(a,b)=>Math.abs(a.lat-b.lat)*111});vm.runInContext(html.slice(html.indexOf('function supplierContactKey('),html.indexOf('function supplierContactStorageKey(')),ctx);return ctx;}
const need={product:'Pão francês 50g',unit:'unidade',quantity:100,destination:'Destino A'};
const quote=(more={})=>({product:need.product,unit:need.unit,quantity:100,destination:need.destination,currency:'BRL',unitPrice:1,freight:0,extra:0,discount:0,validUntil:'2026-12-31',comparable:true,deliveryConfirmed:true,...more});
test('plano inclui todos, deduplica por CNPJ e usa município da compradora, não cidade da pesquisa',()=>{
 const ctx=fixture(),r=ctx.buildSupplierContactPlan([{name:'A',cnpj:'1',city:'Descalvado - SP'},{name:'B',cnpj:'2',city:'São Carlos - SP'},{name:'B duplicada',cnpj:'2'},{name:'Sem localização',cnpj:'3'}],{city:'São Carlos - SP'},{},need,'2026-10-18');
 assert.equal(r.total,3);assert.equal(r.entries[0].company.name,'B');assert.equal(r.mode,'municipality');assert(r.entries.every(e=>e.distanceKm===null));
});
test('sem coordenadas precisas não cria quilômetros, centrais municipais ou distância zero; UF conflitante não empata',()=>{
 const ctx=fixture(),r=ctx.buildSupplierContactPlan([{name:'Outra UF',cnpj:'1',city:'Cidade - RJ',geoPoint:{lat:1,lng:1,precise:false}},{name:'Mesma UF',cnpj:'2',city:'Cidade - SP'}],{city:'Cidade - SP',geoPoint:{lat:1,lng:1,precise:true}},{},need,'2026-10-18');
 assert.equal(r.entries[0].company.name,'Mesma UF');assert.equal(r.mode,'municipality');assert(r.entries.every(e=>e.distanceKm===null));
});
test('distâncias precisas comparáveis ordenam primeiro o mais próximo, sem tratar distância como preço',()=>{
 const ctx=fixture(),r=ctx.buildSupplierContactPlan([{name:'Longe',cnpj:'1',geoPoint:{lat:5,lng:0,precise:true}},{name:'Perto',cnpj:'2',geoPoint:{lat:1,lng:0,precise:true}}],{geoPoint:{lat:0,lng:0,precise:true}},{},need,'2026-10-18');
 assert.equal(r.mode,'distance');assert.equal(r.entries[0].company.name,'Perto');assert.equal(r.entries[0].total,null);
});
test('custo total com frete pode inverter preferência por proximidade, mantendo pendentes no plano',()=>{
 const ctx=fixture(),companies=[{name:'Local caro',cnpj:'1',city:'Descalvado'},{name:'Regional barato',cnpj:'2',city:'São Carlos'},{name:'Sem cotação',cnpj:'3'}];
 const r=ctx.buildSupplierContactPlan(companies,{city:'Descalvado'},{'cnpj:1':quote({unitPrice:1,freight:20}),'cnpj:2':quote({unitPrice:0.9,freight:10,extra:2,discount:1})},need,'2026-10-18');
 assert.equal(r.mode,'quotes');assert.equal(r.quoted,2);assert.equal(r.total,3);assert.equal(r.entries[0].company.name,'Regional barato');assert.equal(r.entries[0].total,101);assert.equal(r.entries[2].total,null);
});
test('frete ausente não vira zero; moeda, validade, produto, unidade, quantidade, destino e confirmação devem corresponder',()=>{
 const ctx=fixture();assert.equal(ctx.supplierQuoteTotal(quote(),need,'2026-10-18'),100);
 for(const change of [{freight:null},{extra:null},{discount:null},{currency:'USD'},{validUntil:'2026-10-17'},{validUntil:'2026-99-99'},{product:'Outro pão'},{unit:'kg'},{quantity:200},{destination:'Outro destino'},{comparable:false},{deliveryConfirmed:false},{unitPrice:-1},{unitPrice:Infinity}])assert.equal(ctx.supplierQuoteTotal(quote(change),need,'2026-10-18'),null,JSON.stringify(change));
 assert.equal(ctx.supplierQuoteTotal(quote(),{...need,product:''},'2026-10-18'),null);
});
