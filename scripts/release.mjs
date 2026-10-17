import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

// Invoke only for a user-authorized production publication. Never force-push.
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}
async function github(path) {
  const response = await fetch(`https://api.github.com/repos/pauloabispo000-hue/mapa-de-cadeia-empresarial/${path}`, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`Consulta do workflow recusada: HTTP ${response.status}. Confira Actions; não repita a publicação automaticamente.`);
  return response.json();
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Use Node.js 22 ou superior.');
  if (git('status', '--porcelain')) throw Error('Registre as alterações em commit antes de publicar.');
  const remote = git('remote', 'get-url', 'origin');
  if (!/github\.com[:/]pauloabispo000-hue\/mapa-de-cadeia-empresarial(?:\.git)?$/.test(remote)) throw Error('Origin não corresponde ao repositório da plataforma.');
  execFileSync('npm', ['run', 'sync'], { stdio: 'inherit' });
  execFileSync('npm', ['run', 'check'], { stdio: 'inherit' });
  execFileSync('npm', ['test'], { stdio: 'inherit' });
  if (git('status', '--porcelain')) throw Error('A sincronização alterou arquivos. Registre as cópias em commit antes de publicar.');
  git('fetch', 'origin', 'main');
  try { git('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); }
  catch { throw Error('Origin/main contém alterações ausentes neste commit. Integre e valide antes de publicar.'); }
  const sha = git('rev-parse', 'HEAD');
  // Check observability before writing; this endpoint requires no Google secrets.
  await github('actions/workflows/mapeador.yml/runs?branch=main&per_page=1');
  console.log(`Enviando ${sha} ao main; nenhuma proteção será contornada.`);
  execFileSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], { stdio: 'inherit' });
  console.log('Commit enviado. Aguardando confirmação do workflow de publicação…');
  for (let attempt = 0; attempt < 80; attempt++) {
    const data = await github('actions/workflows/mapeador.yml/runs?branch=main&per_page=30');
    const run = data.workflow_runs.find(item => item.head_sha === sha && item.event === 'push');
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') throw Error(`Publicação não confirmada (${run.conclusion}): ${run.html_url}`);
      const jobs = await github(`actions/runs/${run.id}/jobs?per_page=100`);
      if (!['verificar', 'publicar'].every(name => jobs.jobs.some(job => job.name === name && job.conclusion === 'success'))) throw Error(`Verificação/publicação incompleta: ${run.html_url}`);
      console.log(`Publicação confirmada para ${sha}.\n${run.html_url}\nA versão Apps Script consta no resumo e no artefato deployment-result.json dessa execução.`);
      return;
    }
    if (attempt % 4 === 0) console.log(`Workflow: ${run ? `${run.status} — ${run.html_url}` : 'aguardando início'}`);
    await wait(15000);
  }
  throw Error(`Tempo de acompanhamento esgotado; confira Actions para ${sha}. O commit já foi enviado; não refaça o push para tentar confirmar.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
