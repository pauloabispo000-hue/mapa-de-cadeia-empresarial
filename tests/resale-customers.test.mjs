import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../Apps Script/Code.js', import.meta.url), 'utf8');
const supplierCnpj = '11222333000181', buyerCnpj = '11444777000161';
const payload = () => ({
  business: { nome: 'Compradora fictícia', cnpj: buyerCnpj, ofertas: [{ nome: 'Produto de teste' }] },
  answers: { revendeProdutos: 'Sim', segredo: 'não compartilhar' },
  suppliers: { lista: [{ empresa: 'Fornecedora fictícia', cnpj: supplierCnpj, categorias: ['Produto de teste'], purchasePurposes: { 'Produto de teste': 'revenda' }, shareResaleWithSupplier: true }] }
});
function response(data, date = '2026-01-01', account = 'buyer') {
  return [new Date(date), 'response-test', data.business.nome, data.business.cnpj, '', '', JSON.stringify(data), account];
}
function fixture(rows = [response(payload())], settings = []) {
  const data = {
    ContasPerfisPublicos: [['CNPJ','Conta'], [supplierCnpj,'supplier'],[buyerCnpj,'buyer']],
    Respostas: [Array(8).fill(''),...rows], ConfiguracoesPerfil: [Array(4).fill(''),...settings]
  };
  // Somente leitura: nenhum método de escrita é fornecido pelo adaptador de teste.
  const ss = { getSheetByName: name => data[name] && ({ getLastRow: () => data[name].length,
    getRange: (row,col,count,width) => ({ getValues: () => data[name].slice(row-1,row-1+count).map(r => Array.from({length:width},(_,i)=>r[col-1+i]??'')) }) }) };
  const ctx = vm.createContext({}); vm.runInContext(code,ctx);
  ctx.getSpreadsheet_ = () => ss;
  ctx.getAvanteSessionUser_ = token => ({ owner:'supplier', buyer:'buyer', outsider:'outsider' })[token] || '';
  return { ctx, data };
}

test('identifica o cliente pela declaração consentida da compradora e pelo mesmo produto oferecido', () => {
  const {ctx,data}=fixture(), before=JSON.stringify(data);
  const result=ctx.getAvanteResaleCustomers('owner',supplierCnpj);
  assert.equal(result.ok,true); assert.equal(result.customers.length,1);
  assert.equal(result.customers[0].cnpj,buyerCnpj);
  assert.deepEqual(Array.from(result.customers[0].products),['Produto de teste']);
  assert.equal(result.customers[0].confirmedBySupplier,false);
  assert(!JSON.stringify(result).includes('segredo'));assert(!JSON.stringify(result).includes('buyer'));
  assert.equal(JSON.stringify(data),before);
});

test('resposta Sim isolada, uso próprio, oferta diferente ou ausência de consentimento não identificam cliente', () => {
  for (const mutate of [
    p=>{p.answers.revendeProdutos='Não';},p=>{delete p.suppliers.lista[0].purchasePurposes;},
    p=>{p.suppliers.lista[0].purchasePurposes['Produto de teste']='uso_proprio';},
    p=>{p.suppliers.lista[0].shareResaleWithSupplier=false;},p=>{p.business.ofertas=[{nome:'Outro produto'}];},
    p=>{p.suppliers.lista[0].cnpj='';},p=>{p.suppliers.lista[0].categorias=[];}
  ]) {const p=payload();mutate(p);const {ctx}=fixture([response(p)]);assert.equal(ctx.getAvanteResaleCustomers('owner',supplierCnpj).customers.length,0);}
});

test('consulta recusa sessão inválida e conta sem vínculo com o CNPJ', () => {
  const {ctx}=fixture();assert.equal(ctx.getAvanteResaleCustomers('expired',supplierCnpj).ok,false);
  assert.equal(ctx.getAvanteResaleCustomers('outsider',supplierCnpj).ok,false);
  assert.equal(ctx.getAvanteResaleCustomers('buyer',supplierCnpj).ok,false);
});

test('a declaração mais recente substitui a anterior e revogações deixam de aparecer', () => {
  const old=payload(), current=payload();current.answers.revendeProdutos='Não';
  const {ctx}=fixture([response(old),response(current,'2026-02-01')]);
  assert.equal(ctx.getAvanteResaleCustomers('owner',supplierCnpj).customers.length,0);
  const duplicate=fixture([response(old),response(old,'2026-02-01')]);
  assert.equal(duplicate.ctx.getAvanteResaleCustomers('owner',supplierCnpj).customers.length,1);
});

test('edição privada posterior da finalidade ou do consentimento revoga a descoberta', () => {
  const p=payload();p.suppliers.lista[0].shareResaleWithSupplier=false;
  const settings=[['buyer',buyerCnpj,new Date('2026-03-01'),JSON.stringify({answers:p.answers,suppliers:p.suppliers})]];
  const {ctx}=fixture(undefined,settings);
  assert.equal(ctx.getAvanteResaleCustomers('owner',supplierCnpj).customers.length,0);
});

test('respostas de outra conta e declarações sem conta autenticada não alteram a relação', () => {
  const p=payload();p.answers.revendeProdutos='Não';
  const {ctx}=fixture([response(payload()),response(p,'2026-03-01','outsider'),response(p,'2026-04-01','')]);
  assert.equal(ctx.getAvanteResaleCustomers('owner',supplierCnpj).customers.length,1);
});

test('vendedor não cria clientes por meio do campo legado customers', () => {
  const p=payload();p.answers.revendeProdutos='Não';p.customers={lista:[{empresa:'Cliente indicado',cnpj:supplierCnpj}]};
  const {ctx}=fixture([response(p)]);assert.equal(ctx.getAvanteResaleCustomers('owner',supplierCnpj).customers.length,0);
});

const html = readFileSync(new URL('../Apps Script/Index.html',import.meta.url),'utf8');
const questionsCode = html.slice(html.indexOf('var conversationQuestions = ['),html.indexOf('function inferAreaFromText('));
test('pesquisa usa a pergunta exata e só pede os produtos/fontes após Sim',()=>{
  const ctx=vm.createContext({surveyMode:'research',state:{answers:{revendeProdutos:''}},PAISES_OPTS:[],ESTADOS_OPTS:[],PERFIL_CLIENTES_OPTS:[],CATEGORIA_INSUMOS_OPTS:[],SEGMENTOS_OPTS:[]});
  vm.runInContext(questionsCode,ctx);
  let q=ctx.activeConversationQuestions();
  assert(q.some(q=>q.prompt==='Você revende algum produto comprado de fornecedores?'));
  const promotion=q.find(q=>q.prompt==='Você já fez alguma oferta ou promoção junto com outro negócio?');
  assert.equal(promotion.kind,'companies');assert.equal(promotion.key,'empresasVendaConjunta');
  assert(!ctx.conversationQuestions.some(q=>/O que essas empresas compram ou usam do seu negócio|Quais empresas compram de você|Como essas empresas usam ou revendem seus produtos ou serviços|Que outros tipos de negócio seus clientes também costumam procurar/.test(q.prompt)));
  assert(!q.some(q=>['clientesSelecionados','categoriasClientes','usoOferta','revendaFornecedores'].includes(q.key)));
  ctx.state.answers.revendeProdutos='Sim';q=ctx.activeConversationQuestions();assert(q.some(q=>q.key==='revendaFornecedores'));
  ctx.state.answers.revendeProdutos='Não';assert(!ctx.activeConversationQuestions().some(q=>q.key==='revendaFornecedores'));
});
