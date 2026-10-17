import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../scripts/deploy.mjs';
import { validateSources } from '../scripts/check.mjs';

const config = { scriptId: 'project', deploymentId: 'existing-deployment' };
const revision = 'a'.repeat(40);
const files = [{ name: 'Code', type: 'SERVER_JS', source: 'function doGet() {}' }];

function fakeApi({ corruptUpload = false, failVersion = false, staleDeployment = false } = {}) {
  const calls = [];
  let updated = false;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.startsWith('/content?')) return { files };
    if (method === 'GET') return { deploymentConfig: { scriptId: 'project', versionNumber: updated && !staleDeployment ? 80 : 79, description: updated && !staleDeployment ? `GitHub ${revision}` : 'old' } };
    if (path === '/content') return { files: corruptUpload ? [{ ...files[0], source: 'wrong code' }] : files };
    if (path === '/versions') {
      if (failVersion) throw Error('Google version failure');
      return { versionNumber: 80 };
    }
    updated = true;
    return {};
  };
  return { api, calls };
}

test('publica no mesmo ID, confere commit e conteúdo da versão imutável', async () => {
  const { api, calls } = fakeApi();
  const result = await publish({ api, files, revision, config });
  assert.equal(result.previousVersion, 79);
  assert.equal(result.version, 80);
  assert.equal(result.deploymentId, config.deploymentId);
  assert.equal(calls.find(c => c.method === 'PUT' && c.path.includes('deployments')).body.deploymentConfig.description, `GitHub ${revision}`);
  assert.equal(calls.at(-1).path, '/content?versionNumber=80');
  assert(!calls.some(c => c.method === 'POST' && c.path === '/deployments'));
});

test('conteúdo recebido divergente impede nova versão e atualização da implantação', async () => {
  const { api, calls } = fakeApi({ corruptUpload: true });
  await assert.rejects(publish({ api, files, revision, config }), /Conteúdo divergente/);
  assert(!calls.some(c => c.path === '/versions'));
  assert(!calls.some(c => c.method === 'PUT' && c.path.includes('deployments')));
});

test('falha ao criar versão mantém a implantação anterior', async () => {
  const { api, calls } = fakeApi({ failVersion: true });
  await assert.rejects(publish({ api, files, revision, config }), /Google version failure/);
  assert(!calls.some(c => c.method === 'PUT' && c.path.includes('deployments')));
});

test('não informa sucesso quando Google mantém a implantação antiga', async () => {
  const { api } = fakeApi({ staleDeployment: true });
  await assert.rejects(publish({ api, files, revision, config }), /outra versão/);
});

test('commit inválido é rejeitado antes de qualquer chamada ao Google', async () => {
  const { api, calls } = fakeApi();
  await assert.rejects(publish({ api, files, revision: 'invalid', config }), /Commit inválido/);
  assert.equal(calls.length, 0);
});

test('verificação detecta erro no JavaScript da página antes da publicação', () => {
  const manifest = { runtimeVersion: 'V8', webapp: { executeAs: 'USER_DEPLOYING' }, oauthScopes: [] };
  assert.throws(() => validateSources('function doGet(){} function doPost(){}', '<script>const broken = ;</script>', manifest), SyntaxError);
});
