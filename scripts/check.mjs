import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

export function validateSources(code, html, manifest) {
  new Script(code, { filename: 'Apps Script/Code.js' });
  assert.match(code, /function\s+doGet\s*\(/, 'Falta o endpoint doGet');
  assert.match(code, /function\s+doPost\s*\(/, 'Falta o endpoint doPost');
  let scripts = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || /type\s*=\s*["'](?:application\/ld\+json|application\/json|importmap)["']/i.test(match[1])) continue;
    new Script(match[2], { filename: `Apps Script/Index.html:script-${++scripts}` });
  }
  assert(scripts > 0, 'Nenhum JavaScript encontrado na página');
  assert.equal(manifest.runtimeVersion, 'V8');
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  assert(Array.isArray(manifest.oauthScopes), 'Manifesto sem escopos explícitos');
  return scripts;
}

export function checkProject() {
  const code = readFileSync('Apps Script/Code.js', 'utf8');
  const html = readFileSync('Apps Script/Index.html', 'utf8');
  const manifest = JSON.parse(readFileSync('Apps Script/appsscript.json', 'utf8'));
  const scripts = validateSources(code, html, manifest);
  assert.equal(readFileSync('Code.gs', 'utf8'), code, 'Code.gs diverge: execute npm run sync');
  assert.equal(readFileSync('index.html', 'utf8'), html, 'index.html diverge: execute npm run sync');
  console.log(`Sintaxe do servidor e de ${scripts} scripts da página válida; cópias sincronizadas.`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) checkProject();
