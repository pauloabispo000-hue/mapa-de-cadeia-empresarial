import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../Apps Script/Code.js', import.meta.url), 'utf8');
const cnpj = '20678438000130';
const input = () => ({ business: { nome: 'ALESSANDRO RODRIGO GUERRA', cnpj, cidade: 'Descalvado', pais: 'Brasil', produtoDetalhe: 'Barbearia' }, publicProfile: { consent: true, products: [] } });

class Sheet {
  rows = [];
  columns = 26;
  appendRow(row) { this.rows.push([...row]); }
  getLastRow() { return this.rows.length; }
  getMaxColumns() { return this.columns; }
  insertColumnsAfter(_, count) { this.columns += count; }
  setFrozenRows() {}
  getRange(row, col, count = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: count }, (_, y) => Array.from({ length: width }, (_, x) => this.rows[row - 1 + y]?.[col - 1 + x] ?? '')),
      setValues: values => values.forEach((cells, y) => cells.forEach((value, x) => { (this.rows[row - 1 + y] ??= [])[col - 1 + x] = value; })),
      setValue: value => { (this.rows[row - 1] ??= [])[col - 1] = value; }
    };
  }
}

function fixture() {
  const sheets = new Map(), files = new Map();
  const ss = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(); sheets.set(name, sheet); return sheet; } };
  let held = false, id = 0;
  const lock = { waitLock: () => { assert.equal(held, false, 'nested lock'); held = true; }, hasLock: () => held, releaseLock: () => { assert.equal(held, true); held = false; } };
  const ctx = vm.createContext({
    console, LockService: { getScriptLock: () => lock }, Utilities: { getUuid: () => 'response-' + ++id },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'public', PRIVATE: 'private' }, Permission: { VIEW: 'view', EDIT: 'edit' }, getFileById: id => { if (!files.has(id)) files.set(id, { getId: () => id, setSharing: access => { files.get(id).access = access; } }); return files.get(id); } }
  });
  vm.runInContext(source, ctx);
  ctx.getSpreadsheet_ = () => ss;
  ctx.getAvanteSessionUser_ = token => ({ alice: 'alice', bob: 'bob' })[token] || '';
  ctx.validateAvanteSession_ = token => !!ctx.getAvanteSessionUser_(token);
  ctx.jsonOutput_ = data => data;
  ctx.saveProfileImage_ = () => 'image-' + ++id;
  // Network analysis is independent of profile publication and uses other sheets.
  ctx.saveContributions_ = ctx.saveRelations_ = ctx.saveCompanies_ = ctx.createAvanteMatchNotifications_ = () => {};
  ctx.extractContributions_ = () => [];
  return { ctx, sheets, files, locked: () => held, ss };
}

test('publica imediatamente com sessão e consentimento, incluindo imagens e catálogo', () => {
  const { ctx, sheets, files, locked } = fixture();
  const data = input();
  data.publicProfile.coverData = 'cover';
  data.publicProfile.products = [{ sku: 'CORTE', name: 'Corte', description: 'Corte de cabelo', imageData: 'photo' }];
  const result = ctx.submitAvantePublicProfile('alice', data);
  assert.equal(result.ok, true);
  assert.equal(locked(), false);
  const profile = ctx.readPublicProfile_(cnpj).profile;
  assert.equal(profile.name, data.business.nome);
  assert.equal(profile.description, 'Barbearia');
  assert.equal(profile.products[0].name, 'Corte');
  assert.equal(files.size, 2);
  assert([...files.values()].every(file => file.access === 'public'));
  assert.match(sheets.get('PerfisPendentes').rows[1][11], /^APROVADO AUTOMATICAMENTE/);
  assert.equal(sheets.get('ContasPerfisPublicos').rows[1][1], 'alice');
  assert.equal('account' in profile, false);
  assert.equal('answers' in profile, false);
});

test('sessão, nome, CNPJ e consentimento são obrigatórios e não criam perfil ao falhar', () => {
  for (const change of [data => { data.publicProfile.consent = false; }, data => { data.business.nome = ''; }, data => { data.business.cnpj = '123'; }]) {
    const { ctx, sheets } = fixture(), data = input();
    change(data);
    assert.equal(ctx.submitAvantePublicProfile('alice', data).ok, false);
    assert.equal(sheets.size, 0);
  }
  const { ctx, sheets } = fixture();
  assert.equal(ctx.submitAvantePublicProfile('expired', input()).ok, false);
  assert.equal(sheets.size, 0);
});

test('a conta criadora edita sem duplicar; outra conta não sobrescreve nem troca o vínculo', () => {
  const { ctx, sheets } = fixture();
  assert.equal(ctx.submitAvantePublicProfile('alice', input()).ok, true);
  const edited = input(); edited.business.produtoDetalhe = 'Descrição atualizada';
  assert.equal(ctx.submitAvantePublicProfile('alice', edited).ok, true);
  assert.equal(sheets.get('PerfisPublicos').getLastRow(), 2);
  assert.equal(sheets.get('ContasPerfisPublicos').getLastRow(), 2);
  const before = JSON.stringify([...sheets]);
  assert.match(ctx.submitAvantePublicProfile('bob', edited).error, /outra conta/);
  assert.equal(JSON.stringify([...sheets]), before);
  assert.equal(ctx.readPublicProfile_(cnpj).profile.description, 'Descrição atualizada');
});

test('envio da pesquisa também publica, mas sem consentimento guarda apenas as respostas privadas', () => {
  for (const consent of [true, false]) {
    const { ctx, sheets } = fixture(), data = input();
    data.authToken = 'alice'; data.publicProfile.consent = consent;
    data.answers = { segredo: 'relação privada' };
    const result = ctx.doPost({ postData: { contents: JSON.stringify(data) } });
    assert.equal(result.ok, true);
    assert.equal(ctx.readPublicProfile_(cnpj).ok, consent);
    assert.equal(sheets.get('Respostas').getLastRow(), 2);
    assert(!sheets.get('Respostas').rows[1][6].includes('authToken'));
    if (consent) assert(!JSON.stringify(ctx.readPublicProfile_(cnpj)).includes('relação privada'));
  }
});

test('envio de outra conta não altera perfil nem grava resposta para esse CNPJ', () => {
  const { ctx, sheets } = fixture();
  ctx.submitAvantePublicProfile('alice', input());
  const data = input(); data.authToken = 'bob';
  assert.equal(ctx.doPost({ postData: { contents: JSON.stringify(data) } }).ok, false);
  assert.equal(sheets.get('Respostas').getLastRow(), 1);
  assert.equal(sheets.get('PerfisPendentes').getLastRow(), 2);
});

test('perfil antigo recupera a conta da resposta original e continua editável', () => {
  const { ctx, sheets, ss } = fixture();
  ctx.submitAvantePublicProfile('alice', input());
  sheets.delete('ContasPerfisPublicos');
  const responses = ctx.ensureSheet_(ss, 'Respostas', Array(8).fill(''));
  responses.appendRow(['', 'response-1', '', cnpj, '', '', '{}', 'alice']);
  assert.equal(ctx.submitAvantePublicProfile('bob', input()).ok, false);
  assert.equal(ctx.submitAvantePublicProfile('alice', input()).ok, true);
  assert.equal(sheets.get('ContasPerfisPublicos').rows[1][1], 'alice');
});

test('perfil antigo sem origem autenticada não pode ser reivindicado por outra conta', () => {
  const { ctx, sheets } = fixture();
  ctx.submitAvantePublicProfile('alice', input());
  sheets.delete('ContasPerfisPublicos');
  const before = JSON.stringify(sheets.get('PerfisPublicos').rows);
  assert.match(ctx.submitAvantePublicProfile('bob', input()).error, /perfil antigo/);
  assert.equal(JSON.stringify(sheets.get('PerfisPublicos').rows), before);
});

test('erros no catálogo retornam falha, liberam o lock e não publicam nem vinculam a conta', () => {
  const { ctx, sheets, locked } = fixture(), data = input();
  data.publicProfile.products = [{ sku: 'X', name: 'Sem descrição ou foto' }];
  assert.equal(ctx.submitAvantePublicProfile('alice', data).ok, false);
  assert.equal(locked(), false);
  assert.equal(sheets.get('PerfisPublicos').getLastRow(), 1);
  assert.equal(sheets.get('ContasPerfisPublicos').getLastRow(), 1);
});

test('edição sem novas imagens preserva capa e avatar; pesquisa sem catálogo preserva os produtos', () => {
  const { ctx, files } = fixture(), data = input();
  data.publicProfile.coverData = 'cover'; data.publicProfile.avatarData = 'avatar';
  data.publicProfile.products = [{ sku: 'CORTE', name: 'Corte', description: 'Corte de cabelo', imageData: 'photo' }];
  ctx.submitAvantePublicProfile('alice', data);
  const original = ctx.readPublicProfile_(cnpj).profile;
  const survey = input(); survey.authToken = 'alice'; delete survey.publicProfile.products;
  assert.equal(ctx.doPost({ postData: { contents: JSON.stringify(survey) } }).ok, true);
  const current = ctx.readPublicProfile_(cnpj).profile;
  assert.equal(current.coverUrl, original.coverUrl);
  assert.equal(current.avatarUrl, original.avatarUrl);
  assert.equal(current.products[0].imageUrl, original.products[0].imageUrl);
  assert([...files.values()].every(file => file.access === 'public'));
});

test('publicação automática não deixa pendência na caixa administrativa', () => {
  const { ctx } = fixture();
  ctx.getAvanteAdminProperty_ = () => 'alice';
  ctx.submitAvantePublicProfile('alice', input());
  const notifications = ctx.getAvantePendingNotifications('alice');
  assert.equal(notifications.ok, true);
  assert.equal(notifications.count, 0);
});
