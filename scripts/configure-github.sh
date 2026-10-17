#!/usr/bin/env bash
set -euo pipefail
repo='pauloabispo000-hue/mapa-de-cadeia-empresarial'
gh_bin="${GH_BIN:-gh}"
credential_file="${CLASP_CREDENTIAL_FILE:-$HOME/.clasprc.json}"
if [[ ! -f "$credential_file" ]]; then
  echo 'Autentique o clasp antes de configurar a publicação.' >&2
  exit 1
fi
"$gh_bin" auth status >/dev/null 2>&1 || "$gh_bin" auth login --hostname github.com --git-protocol https --web --scopes repo,workflow
# O conteúdo é transmitido pelo stdin e não aparece no terminal nem no Git.
"$gh_bin" secret set CLASPRC_JSON --repo "$repo" < "$credential_file"
echo 'Secret de publicação configurado no GitHub.'
