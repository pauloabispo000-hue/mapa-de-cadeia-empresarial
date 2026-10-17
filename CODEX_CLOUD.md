# Ambiente Codex Cloud do Mapeador

Este arquivo descreve a configuração a criar na conta ChatGPT. Os arquivos no
GitHub preparam o projeto; eles não criam nem publicam o ambiente da conta sozinhos.

| Campo | Configuração |
| --- | --- |
| Nome | Mapeador de Negócios |
| Repositório | `pauloabispo000-hue/mapa-de-cadeia-empresarial` |
| Branch inicial | `main` atualizado |
| Runtime | Node.js 22 e npm |
| Install script | `bash scripts/cloud-setup.sh` |
| Visibilidade | Privado / Only me |
| Secrets de desenvolvimento | Nenhum |
| Publicação em produção | GitHub Actions após alteração chegar ao `main` |

O script usa o Node instalado quando compatível. Quando há nvm no ambiente,
seleciona/instala o Node 22 se necessário. Sem runtime compatível nem nvm,
interrompe com uma instrução clara em vez de validar com a versão errada.
Instala a configuração npm e verifica código, cópias e testes. Não executa
`npm run deploy`, não chama o Google e não acessa dados reais.

## Mensagem para a preparação do ambiente

Cole esta mensagem na conversa de criação do ambiente:

> Prepare um ambiente privado chamado Mapeador de Negócios com o repositório
> pauloabispo000-hue/mapa-de-cadeia-empresarial, branch main atualizada.
> Leia AGENTS.md, DESENVOLVIMENTO.md e CODEX_CLOUD.md. Configure Node.js 22 e npm.
> Execute bash scripts/cloud-setup.sh e registre esse comando como Install script.
> Não configure credenciais Google, Gemini, Maps ou CLASPRC_JSON neste ambiente:
> a publicação já usa o Secret privado do GitHub Actions. Não publique no Apps Script
> durante a preparação. Confira os resultados e deixe o ambiente pronto para Publish.

## Finalizar na conta ChatGPT

1. Na web ou no aplicativo desktop, escolha **Work in → Cloud → Select environment → Create environment**.
2. Selecione o repositório indicado e autorize a conexão GitHub se necessário.
3. Envie a mensagem acima e confira o relatório de preparação.
4. Selecione **Publish**. O ambiente só estará publicado após aparecer **Environment published**.
5. No smartphone, abra Codex no aplicativo ChatGPT e selecione **Mapeador de Negócios**.

Fonte: https://learn.chatgpt.com/docs/environments/cloud-environments

## Primeira tarefa de confirmação

> Leia AGENTS.md e execute npm run check e npm test. Informe a branch, o commit e
> o resultado. Não altere arquivos nem publique no Apps Script neste teste.

O resultado esperado é a verificação sintática aprovada e seis testes passando.
Tarefas seguintes podem alterar o código, executar `npm run sync`, verificar e
enviar uma branch/PR. Uma alteração incorporada ao `main` dispara a publicação
automática; acompanhe Actions antes de informar que o aplicativo foi publicado.
