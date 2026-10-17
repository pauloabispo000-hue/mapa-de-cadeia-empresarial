# Mapeador de Negócios / Avante

Leia `VISAO_DO_PROGRAMA.md`, `CONTINUAR_NO_CHATGPT.md` e `AGENTS.md` antes de alterar o programa.

## Código oficial

- Servidor: `Apps Script/Code.js`.
- Interface: `Apps Script/Index.html`.
- Manifesto: `Apps Script/appsscript.json`.
- `Code.gs` e `index.html` na raiz são cópias de compatibilidade. Nunca altere só uma cópia.
- Depois de editar, execute `npm run sync`, `npm run check` e `npm test`.
- Node.js 22 ou superior; não há dependências npm externas neste projeto.

## Entrega e publicação

Trabalhe a partir do `main` atualizado. Registre somente os arquivos da tarefa em
um commit e envie a branch ao GitHub. Uma branch de trabalho/PR não publica em produção.
Quando a alteração aprovada chegar a `main`, o workflow “Mapeador - verificar e publicar”
faz a publicação na implantação Apps Script existente e confirma versão, commit e conteúdo.
Quando a tarefa incluir publicar, acompanhe o workflow até o fim. Informe o commit,
a versão Apps Script e o resultado. Um `git push` bem-sucedido não confirma publicação.
Não declare publicação concluída se o workflow falhar ou faltar autenticação.

Não crie outro projeto Apps Script nem outra implantação. Não altere os IDs de
`config/apps-script.json` sem uma solicitação explícita de migração. Não execute
setup, reconstruções de dados, migrações, cadastros ou autorizações administrativas
como parte de uma publicação de código.

## Dados e credenciais

Respostas completas, relações comerciais, CPF, contas e hashes são privados.
Preserve autenticação, consentimento explícito e vínculo do perfil à conta criadora.
Perfis públicos são publicados automaticamente; não exigem aprovação administrativa.
A publicação não certifica titularidade do CNPJ nem divulga respostas e relações privadas.
A IA sugere alterações em dados; não publica nem corrige cadastros automaticamente.
Use Script Properties para chaves do aplicativo. Nunca grave `.clasprc.json`, tokens,
senhas ou conteúdo de planilhas no Git. A credencial de implantação existe apenas no
secret `CLASPRC_JSON` do GitHub Actions. Não tente imprimi-la ou obtê-la pelo chat.

## Recursos externos

O aplicativo usa Apps Script, Sheets e Drive. Mapas e Gemini exigem chaves já
configuradas pelo proprietário; preservá-las não exige copiá-las para o repositório.
Consulte `INSTALAR_APPS_SCRIPT.md` para o funcionamento e a manutenção do ambiente.
