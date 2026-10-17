#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

node_ready() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'
}

if ! node_ready; then
  for nvm_script in "${NVM_DIR:-}/nvm.sh" "$HOME/.nvm/nvm.sh" /usr/local/share/nvm/nvm.sh /opt/nvm/nvm.sh; do
    if [[ -s "$nvm_script" ]]; then
      set +u
      source "$nvm_script"
      nvm install 22
      nvm use 22
      set -u
      break
    fi
  done
fi

if ! node_ready; then
  echo 'O ambiente precisa de Node.js 22 ou superior e npm. Configure o runtime e execute novamente.' >&2
  exit 1
fi

echo "Node.js $(node --version) / npm $(npm --version)"
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
echo 'Preparação do repositório concluída. Nenhuma implantação ou alteração de dados foi executada.'
