import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../Apps Script/Index.html', import.meta.url), 'utf8');
const client = html.slice(html.indexOf('function surveySendError('), html.indexOf('function loadMunicipalDirectory('));
const draft = () => ({ answers: { produtos: 'Serviço fictício' }, business: { nome: 'EMPRESA FICTICIA' }, publicProfile: { consent: false } });

function fixture({ official = true, token = 'test-session' } = {}) {
  const calls = [], saved = [], routes = [], timers = new Map();
  let success, failure, timerId = 0;
  const run = {
    withSuccessHandler(fn) { success = fn; return this; },
    withFailureHandler(fn) { failure = fn; return this; },
    submitAvanteSurvey(auth, payload) { calls.push({ auth, payload }); }
  };
  const state = { ...draft(), meta: { sendStatus: 'idle', submittedAt: null } };
  const ctx = vm.createContext({
    uid:()=>"test-attempt-id", state, authSession: token ? { token } : null,
    isAppsScriptApp: () => official, google: { script: { run } },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    buildExportObject: () => JSON.parse(JSON.stringify({ meta:state.meta, answers: state.answers, business: state.business, publicProfile: state.publicProfile })),
    saveState: () => saved.push(JSON.stringify(state)), renderCurrentStep() {}, showProgramSection(section){routes.push(section);}
  });
  vm.runInContext(client, ctx);
  return { ctx, state, calls, saved, routes, success: data => success(data), failure: () => failure({ message: 'simulated transport failure' }), timeout: () => [...timers.values()][0]() };
}
const receipt = overrides => ({ ok: true, responseId: 'test-response', responsesSaved: true, profilePublished: false, ...overrides });

test('só confirma sucesso depois da resposta autenticada do servidor', async () => {
  const f = fixture(), original = JSON.stringify(f.state.answers);
  const pending = f.ctx.submitSurveyDraft();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].auth, 'test-session');
  assert.equal('authToken' in f.calls[0].payload, false);
  assert.equal(f.state.meta.submittedAt, null);
  assert.deepEqual(f.routes,[]);
  assert.equal(JSON.parse(f.saved[0]).meta.sendStatus, 'sending');
  f.success(receipt()); await pending;
  assert.equal(f.state.meta.sendStatus, 'ok');
  assert.equal(f.state.meta.sendFailureObserved,false);
  assert.equal(f.state.meta.responsesSaved, true);
  assert.deepEqual(f.routes,['my-business']);
  assert(f.state.meta.submittedAt);
  assert.equal(f.ctx.surveySubmissionSummary(f.state.meta).profile, 'O perfil não foi publicado neste envio.');
  assert.equal(JSON.stringify(f.state.answers), original);
});

test('perfil publicado depende de confirmação do servidor, não da caixa de consentimento', async () => {
  const f = fixture(); f.state.publicProfile.consent = true;
  const pending = f.ctx.submitSurveyDraft();
  f.success(receipt({ profilePublished: true, profileCnpj: '11222333000181' })); await pending;
  assert.equal(f.ctx.surveySubmissionSummary(f.state.meta).profile, 'Perfil publicado.');
  assert.equal(f.state.meta.publishedProfileCnpj, '11222333000181');
});

test('recusa explícita preserva o rascunho, exibe o erro e não repete o envio', async () => {
  const f = fixture(), original = JSON.stringify(f.state.answers);
  const pending = f.ctx.submitSurveyDraft();
  f.success({ ok: false, responsesSaved: false, profilePublished: false, error: 'Sessão expirada' }); await pending;
  assert.equal(f.state.meta.sendStatus, 'error');
  assert.equal(f.state.meta.sendError, 'Sessão expirada');
  assert.equal(f.state.meta.submittedAt, null);
  assert.equal(JSON.stringify(f.state.answers), original);
  assert.equal(f.calls.length, 1);
});

test('falha de comunicação preserva rascunho sem repetir envio automaticamente', async () => {
  const f = fixture(), original = JSON.stringify(f.state.answers);
  const pending = f.ctx.submitSurveyDraft(); f.failure(); await pending;
  assert.equal(f.state.meta.sendStatus, 'unknown');
  assert.equal(f.state.meta.sendFailureObserved,true);
  assert.equal(f.state.meta.submittedAt, null);
  assert.equal(JSON.stringify(f.state.answers), original);
  assert.equal(f.calls.length, 1);
  assert.match(f.state.meta.sendError, /sem confirmação/);
});

test('timeout não repete o envio e ignora retorno tardio após marcar resultado desconhecido', async () => {
  const f = fixture(), pending = f.ctx.submitSurveyDraft();
  await f.ctx.submitSurveyDraft(); // Double click during the in-flight call.
  assert.equal(f.calls.length, 1);
  f.timeout(); await pending;
  f.success(receipt());
  assert.equal(f.state.meta.sendStatus, 'unknown');
  assert.equal(f.state.meta.sendFailureObserved,true);
  assert.equal(f.state.meta.submittedAt, null);
  assert.equal(f.calls.length, 1);
});

test('retorno incompleto ou resultado de escrita desconhecido não produz falso sucesso', async () => {
  for (const result of [{ ok: true }, { ok: false, responsesSaved: null, profilePublished: false }, receipt({ responseId: '' })]) {
    const f = fixture(), pending = f.ctx.submitSurveyDraft();
    f.success(result); await pending;
    assert.equal(f.state.meta.sendStatus, 'unknown');
  assert.equal(f.state.meta.sendFailureObserved,true);
    assert.equal(f.state.meta.submittedAt, null);
    assert.equal(f.calls.length, 1);
  }
});

test('respostas salvas com falha parcial não são reenviadas nem confundidas com perfil publicado', async () => {
  const f = fixture(), pending = f.ctx.submitSurveyDraft();
  f.success(receipt({ ok: false, profilePublished: null, error: 'Publicação não confirmada' })); await pending;
  assert.equal(f.state.meta.sendStatus, 'partial');
  assert(f.state.meta.submittedAt);
  assert.equal(f.ctx.surveySubmissionSummary(f.state.meta).title, 'Respostas salvas ✓');
  assert.match(f.ctx.surveySubmissionSummary(f.state.meta).profile, /não foi confirmada/);
  await f.ctx.submitSurveyDraft(); assert.equal(f.calls.length, 1);
});

test('fora do Apps Script ou sem sessão não envia requisição opaca nem perde o rascunho', async () => {
  for (const options of [{ official: false }, { token: null }]) {
    const f = fixture(options), original = JSON.stringify(f.state.answers);
    await f.ctx.submitSurveyDraft();
    assert.equal(f.calls.length, 0);
    assert.equal(f.state.meta.sendStatus, 'error');
    assert.equal(JSON.stringify(f.state.answers), original);
  }
});

test('recarga preserva o rascunho sem gerar reenvio automático', async () => {
  for (const meta of [{ sendStatus: 'sending' }, { submittedAt: '2026-01-01', sendStatus: 'ok' }]) {
    const f = fixture(); Object.assign(f.state.meta, meta);
    f.ctx.normalizeSurveySubmissionState(f.state.meta);
    assert.equal(f.state.meta.sendStatus, 'unknown');
    assert.equal(f.state.meta.sendFailureObserved,false);
    assert.equal(f.state.meta.submittedAt, null);
    assert.equal(f.calls.length, 0);
  }
});

test('loadState também normaliza o rascunho carregado após login na conta', () => {
  const stored = { answers: { produtos: 'Preservado' }, meta: { sendStatus: 'sending' } };
  const ctx = vm.createContext({
    localStorage: { getItem: () => JSON.stringify(stored) }, STORAGE_KEY: 'test-account',
    freshState: () => ({}), deepMergeDefaults: data => data
  });
  vm.runInContext(client + html.slice(html.indexOf('function loadState(){'), html.indexOf('function saveState(){')), ctx);
  const loaded = ctx.loadState();
  assert.equal(loaded.meta.sendStatus, 'unknown');
  assert.equal(loaded.answers.produtos, 'Preservado');
});


test('nova tentativa explícita conserva a chave do envio para o servidor impedir duplicatas',async()=>{
 const f=fixture(),first=f.ctx.submitSurveyDraft();f.failure();await first;
 const key=f.calls[0].payload.meta.submissionId;
 const retry=f.ctx.submitSurveyDraft();assert.equal(f.calls.length,2);
 assert.equal(f.calls[1].payload.meta.submissionId,key);
 f.success(receipt({reused:true}));await retry;
 assert.equal(f.state.meta.responsesSaved,true);
});
