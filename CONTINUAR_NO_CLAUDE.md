# Continuar o Mapeador pelo aplicativo Claude

Repositório: https://github.com/pauloabispo000-hue/mapa-de-cadeia-empresarial

## No smartphone

1. Use a área **Code / Claude Code** do aplicativo, com acesso ao repositório.
   Anexar arquivos do GitHub a um chat comum não configura uma sessão de desenvolvimento com escrita.
2. Escolha este repositório e comece a partir do `main` atualizado.
3. Peça a alteração desejada. O arquivo `CLAUDE.md` orienta os arquivos a editar,
   as verificações e a entrega por commit/branch.
4. Revise o resultado e incorpore o PR em `main` quando quiser publicá-lo.
5. Confira o workflow **Mapeador - verificar e publicar** em **Actions**.
   O resumo informa commit, versão e link do aplicativo; falha significa publicação não confirmada.

Sugestão de mensagem inicial:

> Trabalhe no repositório pauloabispo000-hue/mapa-de-cadeia-empresarial, a partir de main.
> Leia CLAUDE.md, AGENTS.md e VISAO_DO_PROGRAMA.md. Faça a seguinte alteração: [descrever].
> Preserve os recursos atuais e a privacidade. Execute npm run sync, npm run check e npm test.
> Faça commit, envie uma branch e abra um PR. Explique o que mudou e como foi verificado.

O trabalho na nuvem não depende deste Chromebook ligado. A publicação depende da
autenticação Google configurada no GitHub e do acesso do Claude ao repositório.

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
