import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../Apps Script/Index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('function filterSupplierPurchaseOptions('), html.indexOf('function renderSupplierPurchases('));
const excluded = ['Sistemas de alarme e câmeras', 'Extintores e equipamentos contra incêndio', 'Seguros', 'Segurança patrimonial e monitoramento'];
const clothing = ['Uniformes e equipamentos de proteção (EPIs)', 'Vestuário corporativo'];
const all = [...clothing, ...excluded];
function filter(supplier, options = all) {
  const ctx = vm.createContext({
    normalizeSearch: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    TIPO_FORNECEDOR_AREA: { 'Confecção de roupas': 'Seguranças/Confortos', 'Empresa de segurança patrimonial': 'Seguranças/Confortos' },
    SEGMENTO_AREA: {}, inferAreaFromText: () => '',
    CATEGORIA_INSUMO_AREA: Object.fromEntries(all.map(value => [value, 'Seguranças/Confortos']))
  });
  vm.runInContext(source, ctx);
  return Array.from(ctx.filterSupplierPurchaseOptions(supplier, options));
}

test('confecção mantém vestuário e uniformes e não sugere os quatro itens de segurança', () => {
  assert.deepEqual(filter({ tipoEmpresa: 'Confecção de roupas' }), clothing);
  assert.deepEqual(all, [...clothing, ...excluded]); // O catálogo compartilhado permanece intacto.
});
test('o filtro também vale para o tipo informado em texto livre e não reintroduz opções pelo fallback', () => {
  assert.deepEqual(filter({ tipoEmpresa: 'Outro', tipoEmpresaOutro: 'CONFECÇÃO DE ROUPAS' }), clothing);
  assert.deepEqual(filter({ tipoEmpresa: 'Confecção de roupas' }, excluded), []);
});
test('segurança e seguros recebem somente as ofertas correspondentes, sem a área inteira', () => {
  assert.deepEqual(filter({ tipoEmpresa: 'Empresa de segurança patrimonial' }), [excluded[0], excluded[3]]);
  assert.deepEqual(filter({ tipoEmpresa: 'Seguros' }), ['Seguros']);
  assert.deepEqual(filter({ tipoEmpresa: 'Empresa de segurança patrimonial', tipoEmpresaOutro: 'Confecção de roupas' }), [excluded[0], excluded[3]]);
});

test('tipo ausente ou desconhecido não recebe lista genérica por fallback', () => {
  assert.deepEqual(filter({}), []);
  assert.deepEqual(filter({ tipoEmpresa: 'Tipo não classificado' }), []);
  assert.deepEqual(filter({ tipoEmpresa: 'Confecção de roupas' }, excluded), []);
});

test('as sugestões refletem ofertas do negócio, sem incluir suas despesas', () => {
  const cases = [
    ['Padaria e confeitaria', ['Pão', 'Café', 'Fretes e transporte', 'Leite', 'Equipamentos e maquinário'], ['Pão', 'Café']],
    ['Açougue e comércio de carnes', ['Carne bovina', 'Embalagens', 'Fretes e transporte'], ['Carne bovina']],
    ['Logística e transporte de cargas', ['Fretes e transporte de mercadorias', 'Aluguel de veículos', 'Veículos e frota própria', 'Armazenagem e estoque'], ['Fretes e transporte de mercadorias', 'Armazenagem e estoque']],
    ['Fábrica de produtos de limpeza', ['Produtos de limpeza', 'Serviços de limpeza', 'Higienização de ambientes'], ['Produtos de limpeza']],
    ['Serviço de limpeza', ['Produtos de limpeza', 'Serviços de limpeza', 'Higienização de ambientes'], ['Serviços de limpeza', 'Higienização de ambientes']],
    ['Veterinária e clínica veterinária', ['Serviços veterinários', 'Fertilizantes e rações'], ['Serviços veterinários']]
  ];
  for (const [tipoEmpresa, options, expected] of cases) assert.deepEqual(filter({ tipoEmpresa }, options), expected, tipoEmpresa);
});

test('uma regra conhecida sem correspondências não retorna itens genéricos', () => {
  assert.deepEqual(filter({ tipoEmpresa: 'Padaria e confeitaria' }, ['Seguros', 'Materiais de construção']), []);
});
