# Instalar a base compartilhada

1. Acesse [script.google.com](https://script.google.com/) e crie um **Novo projeto**.
2. Abra `Code.gs`, apague o conteúdo inicial e cole o arquivo `Code.gs` deste diretório.
3. Salve. No seletor de funções, escolha `setup` e clique em **Executar**. Autorize o acesso à planilha. A função cria (ou atualiza) as abas `Respostas`, `Opcoes`, `Empresas` e `Relacoes`.
4. Abra **Implantar → Nova implantação**. Selecione **Aplicativo da Web**, configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa** e implante. Conclua a autorização se o Google solicitar.
5. Copie a URL terminada em `/exec`.
6. No HTML do programa, substitua `COLE_AQUI_A_URL_DA_NOVA_IMPLANTACAO` em `APPS_SCRIPT_URL` pela URL copiada.
7. Abra a página novamente. Ela carregará as opções de resposta e o diretório de empresas autorizadas para aparecer como sugestão. Novas respostas completas serão gravadas em `Respostas`; as contribuições de opções em `Opcoes`; empresas autorizadas em `Empresas`; e relações de fornecedores/clientes em `Relacoes`.

## Atualizar uma implantação existente

Ao substituir o `Code.gs` de uma implantação que já está em uso, salve o código e abra **Deploy → Manage deployments**. Edite a implantação ativa, escolha **New version** e clique em **Deploy**. A URL `/exec` permanece a mesma. A planilha existente será preservada; ao receber novas chamadas, o script cria as abas novas que estiverem faltando.

Depois de publicar a nova versão, execute `rebuildPrivateNetwork()` uma vez no Apps Script para reconstruir as conexões privadas a partir das respostas antigas já armazenadas. O script não publica empresas antigas no autocomplete porque as versões anteriores não registravam autorização para isso. Novas respostas serão incorporadas automaticamente.

O envio de respostas completas e relações serve à análise interna da rede. O endpoint público fornece apenas opções de resposta, nomes/CNPJs autorizados e contagens agregadas; não divulga quem compra de quem. Também fornece a soma de pessoas ativas e vagas declaradas pelas empresas, sem nomes, CPFs ou cargos individuais. Na revisão final, a pessoa pode autorizar o uso do nome/CNPJ do próprio negócio e das empresas que informou como sugestões para participantes futuros. Sem essa autorização, a pesquisa ainda entra na análise agregada. Guarde a planilha com acesso restrito e ofereça um canal para corrigir ou remover cadastros.

## Limites do cadastro de mão de obra

A página coleta apenas totais aproximados por empresa: pessoas atualmente ativas e posições abertas. CPF, currículo e classificação individual de produtividade não são coletados. O projeto atual não autentica trabalhadores nem separa permissões por organização; não use esta planilha pública para armazenar dados pessoais de trabalhadores. Um cadastro individual exigiria desenho próprio de finalidade, acesso, segurança, correção e contestação antes de ser ativado.

## Sincronizar alterações com clasp

O projeto pode ser sincronizado pela ferramenta oficial [clasp](https://github.com/google/clasp), após habilitar a API nas [configurações do Apps Script](https://script.google.com/home/usersettings) e autenticar uma conta que tenha acesso de edição ao projeto. Faça o clone em uma pasta separada, preserve o `appsscript.json` existente e confira os arquivos com `clasp status` antes de enviar, pois `clasp push` substitui o conteúdo de código do projeto pelos arquivos locais reconhecidos.

O fluxo de atualização é: copiar o `Code.gs` atualizado para o arquivo `Code.js` do clone, revisar `clasp status`, executar `clasp push` e atualizar a implantação web existente com `clasp deploy --deploymentId ID_DA_IMPLANTACAO`. Use o ID da implantação cuja URL `/exec` está configurada no HTML, para preservar a URL. As credenciais OAuth do clasp ficam no computador autenticado; não as envie ao repositório nem compartilhe.
