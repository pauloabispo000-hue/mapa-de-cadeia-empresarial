# Continuar o Mapeador pelo ChatGPT

Repositório: https://github.com/pauloabispo000-hue/mapa-de-cadeia-empresarial

## Preparar o acesso uma vez

A publicação no Apps Script já está configurada no GitHub. Para editar o repositório
pelo ChatGPT no smartphone, use uma sessão com acesso de escrita e execução, como
Codex Cloud dentro do ChatGPT. Uma conversa que ofereça apenas consulta ao GitHub
não consegue executar os testes nem enviar alterações.

1. No ChatGPT na web ou no aplicativo desktop, abra uma tarefa e escolha
   **Work in > Cloud > Select environment > Create environment**.
2. Conecte o GitHub, se solicitado, e escolha este repositório.
3. Prepare o ambiente com Node.js 22. Peça para executar `npm ci --ignore-scripts`,
   `npm run check` e `npm test`. Revise a preparação e selecione **Publish**.
4. No aplicativo ChatGPT do smartphone, abra **Codex** e selecione esse ambiente.
   A criação do ambiente é feita pela web/desktop; a seleção depende da disponibilidade
   e das permissões da sua conta.

Documentação oficial: https://learn.chatgpt.com/docs/environments/cloud-environments

## Fazer uma alteração pelo smartphone

1. Comece a partir do `main` atualizado e descreva a alteração desejada.
2. O Codex lê `AGENTS.md`; o guia técnico completo está em `DESENVOLVIMENTO.md`.
3. Ao terminar a alteração, execute `npm run sync`, `npm run check` e `npm test`.
4. Faça commit e envie uma branch/PR. Incorpore a alteração em `main` quando desejar publicá-la.
5. Confira o workflow **Mapeador - verificar e publicar** em **Actions**. O resumo
   informa commit, versão e link do aplicativo. Push sozinho não confirma publicação.
6. Termine a resposta informando o resultado e se o usuário precisa intervir.

Mensagem sugerida para começar:

> Trabalhe no repositório pauloabispo000-hue/mapa-de-cadeia-empresarial, a partir de main.
> Leia AGENTS.md, DESENVOLVIMENTO.md e VISAO_DO_PROGRAMA.md. Faça esta alteração: [descrever].
> Preserve os recursos atuais e a privacidade. Execute npm run sync, npm run check e npm test.
> Faça commit, envie uma branch e abra um PR. Informe o resultado e qualquer ação pendente.
> Quando a tarefa incluir publicar, acompanhe o workflow até confirmar a versão do Apps Script.

O trabalho em Codex Cloud pode continuar com o Chromebook desligado. Se preferir
continuar esta sessão local pela ponte, o Chromebook, o Codex e a ponte precisam
permanecer em execução. Os dois caminhos usam o mesmo fluxo de publicação pelo GitHub.
Não copie a credencial Google para o chat nem para o ambiente de desenvolvimento:
ela já está no Secret privado do GitHub Actions.

## Configuração única da publicação

- O projeto e a implantação existentes estão em `config/apps-script.json`.
  Esses IDs identificam o destino; não são credenciais de acesso.
- A conta Google precisa ter acesso de edição ao projeto e a Apps Script API habilitada.
- Em **Settings → Secrets and variables → Actions**, configure o secret de repositório
  `CLASPRC_JSON` com o conteúdo completo da credencial OAuth do clasp autenticado.
  Faça isso somente na interface privada do GitHub ou pelo script local de configuração.
  Nunca cole a credencial na conversa ou em um arquivo versionado.
- Execute o workflow manualmente em `main` para conferir a configuração inicial.
- Se Google recusar a autenticação, refaça `clasp login` e atualize o secret.

## Como a publicação funciona

PRs verificam sintaxe, sincronização das cópias e os testes da automação, sem receber
credenciais. Pushes em `main` que passam nas verificações publicam automaticamente.
Há uma fila única de publicação para evitar sobrescritas simultâneas.

O publicador usa a API oficial do Apps Script com a mesma credencial OAuth utilizada
pelo clasp. Envia somente os três arquivos oficiais, cria uma versão imutável e
atualiza o ID de implantação existente, mantendo a URL `/exec`. Confere tanto os
arquivos recebidos quanto o conteúdo da versão publicada e grava o commit na descrição.

Esse processo não recria a planilha, não modifica Script Properties e não executa
funções de cadastro, migração ou backup. Uma falha após enviar o código pode alterar
o HEAD usado pelo editor e por gatilhos; o workflow só informa sucesso após confirmar
a versão da implantação. Verifique o resultado antes de repetir uma publicação.

## Reverter

Para reverter uma alteração de código, faça um novo commit que reverta a mudança em
`main` e confira a publicação. Também é possível selecionar a versão anterior na
implantação existente pelo editor Apps Script; depois alinhe o repositório para que
a próxima publicação automática não reintroduza o código anterior.

## Origem da base

Em 16/10/2026, a base foi alinhada ao código da versão @79 da implantação existente,
consultado pela API do Google. Essa versão inclui recursos que ainda não estavam no
GitHub, como perfis de pessoas, backups e ajustes de interface. O conteúdo de dados
e as credenciais do aplicativo não foram copiados.
