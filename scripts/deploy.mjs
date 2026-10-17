import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { checkProject } from './check.mjs';

export const sourceFiles = [
  ['appsscript', 'JSON', 'Apps Script/appsscript.json'],
  ['Code', 'SERVER_JS', 'Apps Script/Code.js'],
  ['Index', 'HTML', 'Apps Script/Index.html'],
];

export async function verifyDeployment({ api, files, revision, config }) {
  assert.match(revision, /^[a-f0-9]{40}$/i, 'Commit inválido');
  const current = await api('GET', `/deployments/${encodeURIComponent(config.deploymentId)}`);
  const deployed = current.deploymentConfig;
  assert.equal(deployed.scriptId, config.scriptId, 'A implantação pertence a outro projeto');
  assert.equal(deployed.description, `GitHub ${revision}`, 'O commit não corresponde à implantação');
  assert(Number.isInteger(deployed.versionNumber), 'Versão numérica ausente');
  const content = await api('GET', `/content?versionNumber=${deployed.versionNumber}`);
  const actual = new Map(content.files.map(file => [file.name, file]));
  assert.equal(actual.size, files.length, 'Arquivos da versão publicada divergem');
  for (const file of files) {
    assert.equal(actual.get(file.name)?.type, file.type, `Tipo divergente: ${file.name}`);
    assert(actual.get(file.name)?.source === file.source, `Versão publicada diverge: ${file.name}`);
  }
  return { commit: revision, version: deployed.versionNumber, verifiedOnly: true,
    deploymentId: config.deploymentId, url: `https://script.google.com/macros/s/${config.deploymentId}/exec?app=1` };
}

export function actionAnnotation(message) {
  return String(message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export async function publish({ api, files, revision, config }) {
  assert.match(revision, /^[a-f0-9]{40}$/i, 'Commit inválido');
  assert(config.scriptId && config.deploymentId, 'Projeto ou implantação ausente');
  const deploymentPath = `/deployments/${encodeURIComponent(config.deploymentId)}`;
  const previous = await api('GET', deploymentPath);
  assert.equal(previous.deploymentConfig.scriptId, config.scriptId, 'A implantação pertence a outro projeto');
  const previousVersion = previous.deploymentConfig.versionNumber;
  const description = `GitHub ${revision}`;
  const uploaded = await api('PUT', '/content', { files });
  const actual = new Map(uploaded.files.map(f => [f.name, f]));
  assert.equal(actual.size, files.length, 'Quantidade de arquivos enviados diverge');
  for (const file of files) {
    assert.equal(actual.get(file.name)?.type, file.type, `Tipo divergente: ${file.name}`);
    assert(actual.get(file.name)?.source === file.source, `Conteúdo divergente: ${file.name}`);
  }
  const version = await api('POST', '/versions', { description });
  assert(Number.isInteger(version.versionNumber), 'Versão não foi criada');
  await api('PUT', deploymentPath, { deploymentConfig: {
    scriptId: config.scriptId,
    versionNumber: version.versionNumber,
    manifestFileName: 'appsscript',
    description,
  } });
  const verified = await api('GET', deploymentPath);
  assert.equal(verified.deploymentConfig.versionNumber, version.versionNumber, 'A implantação ainda aponta para outra versão');
  assert.equal(verified.deploymentConfig.description, description, 'O commit não corresponde à implantação');
  const deployed = await api('GET', `/content?versionNumber=${version.versionNumber}`);
  const verifiedFiles = new Map(deployed.files.map(f => [f.name, f]));
  assert.equal(verifiedFiles.size, files.length, 'Arquivos da versão publicada divergem');
  for (const file of files) assert(verifiedFiles.get(file.name)?.source === file.source, `Versão publicada diverge: ${file.name}`);
  return { commit: revision, version: version.versionNumber, previousVersion,
    deploymentId: config.deploymentId, url: `https://script.google.com/macros/s/${config.deploymentId}/exec?app=1` };
}

async function main() {
  checkProject();
  const config = JSON.parse(readFileSync('config/apps-script.json', 'utf8'));
  const files = sourceFiles.map(([name, type, path]) => ({ name, type, source: readFileSync(path, 'utf8') }));
  const verifyOnly = process.env.AVANTE_VERIFY_ONLY === 'true';
  const revision = (verifyOnly && process.env.AVANTE_EXPECTED_REVISION) || process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (process.env.GITHUB_ACTIONS === 'true' && !verifyOnly) assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Publicação permitida somente a partir de main');
  assert(process.env.CLASPRC_JSON, 'Configure o secret CLASPRC_JSON no GitHub Actions');
  const credentials = JSON.parse(process.env.CLASPRC_JSON);
  const token = credentials.tokens?.default;
  assert(token?.client_id && token?.client_secret && token?.refresh_token, 'CLASPRC_JSON sem credenciais OAuth do clasp');
  const auth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({ client_id: token.client_id, client_secret: token.client_secret,
      refresh_token: token.refresh_token, grant_type: 'refresh_token' }),
  });
  assert(auth.ok, `Autenticação Google recusada (HTTP ${auth.status}); renove o secret CLASPRC_JSON`);
  const { access_token: accessToken } = await auth.json();
  assert(accessToken, 'Google não retornou token de acesso');
  const api = async (method, path, body) => {
    const response = await fetch(`https://script.googleapis.com/v1/projects/${encodeURIComponent(config.scriptId)}${path}`, {
      method, signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Apps Script: ${method} ${path} falhou (HTTP ${response.status}). Consulte o acesso ao projeto e a API habilitada.`);
    const data = await response.json();
    if (method === 'GET' && path.startsWith('/deployments/') && data.deploymentConfig) {
      const deployed = data.deploymentConfig;
      const commit = /^GitHub ([a-f0-9]{40})$/i.exec(deployed.description || '')?.[1] || 'não identificado';
      console.log(`::notice title=Implantação observada::Versão @${Number(deployed.versionNumber)}, commit ${commit}`);
    }
    return data;
  };
  const result = await (verifyOnly ? verifyDeployment : publish)({ api, files, revision, config });
  console.log(`::notice title=Implantação confirmada::Commit ${result.commit}, versão @${result.version}, somente leitura: ${verifyOnly}`);
  writeFileSync('deployment-result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(`Publicado commit ${result.commit}, versão @${result.version}, implantação existente preservada.`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Mapeador publicado\n\nCommit: \`${result.commit}\`\n\nVersão: @${result.version} (anterior: @${result.previousVersion})\n\n[Abrir aplicativo](${result.url})\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => {
    const message = error.message;
    console.error(message);
    console.log(`::error title=Falha na publicação ou verificação::${actionAnnotation(message)}`);
    writeFileSync('deployment-error.json', JSON.stringify({ message, commit: process.env.GITHUB_SHA || null }, null, 2) + '\n');
    process.exitCode = 1;
  });
}
