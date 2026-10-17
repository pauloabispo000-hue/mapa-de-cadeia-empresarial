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
Quando a tarefa incluir publicar, integre a alteração no main e acompanhe o workflow até o fim.
Use `npm run release` após o commit para validar, enviar HEAD ao main sem force e
confirmar o workflow. Se a API de PR estiver indisponível, o push normal é uma alternativa
para uma publicação autorizada, desde que permitido pelas proteções do repositório. Informe o commit,
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

## Sugestões de compras por fornecedor

Priorize as ofertas declaradas no catálogo do fornecedor. Quando esse catálogo não
estiver disponível, use somente as regras de oferta compatíveis com o tipo de
negócio escolhido. Nunca use a área geral como prova de que uma empresa oferece
todos os seus itens, nem volte à lista completa quando não houver correspondência.
A lista de compras usa filtro estrito, inclusive na busca, sem “Ver todas”.

Um tipo sem regra conhecida não recebe sugestões automáticas. O participante pode
informar uma oferta real em texto livre quando não há catálogo; isso não transforma
uma inferência em oferta confirmada. Trocar o tipo não deve apagar respostas antigas.
Valide as regras com `npm test`. O teste de interface opcional é
`python tests/supplier-options.browser.py`, com Playwright para Python e Chromium;
ele usa dados fictícios e bloqueia todas as chamadas externas.

## Revenda e identificação de clientes

A pesquisa pergunta “Você revende algum produto comprado de fornecedores?”.
Somente “Sim” abre a seleção dos produtos já comprados e dos fornecedores. Não
pergunte quem compra da empresa nem o que esses compradores usam. Preserve os
dados legados, sem utilizá-los para criar novos clientes identificados.

A consulta autenticada identifica compradores pelo CNPJ do fornecedor, finalidade
de revenda e mesmo produto no catálogo da compradora. Exige consentimento
específico para compartilhar nome, CNPJ e produtos com a conta do fornecedor; a
relação permanece privada e identificada como declaração da compradora, sem
confirmação do fornecedor. A declaração/edição mais recente pode revogar esse
compartilhamento. A consulta não modifica planilhas nem perfis.
