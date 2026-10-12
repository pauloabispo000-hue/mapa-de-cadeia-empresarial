# Instalar a base compartilhada

1. Acesse [script.google.com](https://script.google.com/) e crie um **Novo projeto**.
2. Abra `Code.gs`, apague o conteúdo inicial e cole o arquivo `Code.gs` deste diretório.
3. Salve. No seletor de funções, escolha `setup` e clique em **Executar**. Autorize o acesso à planilha e ao Drive. A função cria (ou atualiza) as abas `Respostas`, `Opcoes`, `Empresas`, `Relacoes`, `PerfisPendentes`, `PerfisPublicos` e `ContasAvante`.
4. Abra **Implantar → Nova implantação**. Selecione **Aplicativo da Web**, configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa** e implante. Conclua a autorização se o Google solicitar.
5. Copie a URL terminada em `/exec`.
6. No HTML do programa, substitua `COLE_AQUI_A_URL_DA_NOVA_IMPLANTACAO` em `APPS_SCRIPT_URL` pela URL copiada.
7. Abra a página novamente. Ela carregará as opções de resposta e o diretório de empresas autorizadas para aparecer como sugestão. Novas respostas completas serão gravadas em `Respostas`; as contribuições de opções em `Opcoes`; empresas autorizadas em `Empresas`; e relações de fornecedores/clientes em `Relacoes`.

## Contas e acesso ao Avante

O aplicativo deve ser aberto pela URL da implantação com `?app=1` no final. Essa versão é servida pelo Apps Script e valida a senha no servidor; a página estática do GitHub encaminha para ela. Depois de publicar o código atualizado, o proprietário inicializa a conta administrativa executando `initializeAvanteAdmin` no editor Apps Script. A função cria a conta `admin.avante`; guarde a senha mostrada no registro da execução em local privado.

A pesquisa de empresa pelo CNPJ consulta a BrasilAPI no servidor Apps Script e aceita CNPJs numéricos ou alfanuméricos. O Apps Script precisa do escopo OAuth `https://www.googleapis.com/auth/script.external_request`; o proprietário deve autorizá-lo antes que a primeira consulta pública seja executada. O formato alfanumérico passou a ser emitido pela Receita Federal em julho de 2026.

A pesquisa de empresa pelo CNPJ consulta a BrasilAPI no servidor Apps Script e aceita CNPJs numéricos ou alfanuméricos. O Apps Script precisa do escopo OAuth `https://www.googleapis.com/auth/script.external_request`; o proprietário deve autorizá-lo antes que a primeira consulta pública seja executada. O formato alfanumérico passou a ser emitido pela Receita Federal em julho de 2026.

Participantes podem criar suas próprias contas na tela de entrada, usando um nome de usuário de 3 a 32 caracteres e uma senha de 12 a 128 caracteres. Depois de entrar, podem trocar a própria senha pelo botão **Senha**, informando a senha atual. A troca invalida as outras sessões daquela conta. As contas e hashes com sal ficam na aba privada `ContasAvante`; nenhuma senha em texto é gravada. Sessões expiram após seis horas, e o endpoint de envio exige uma sessão válida.

Não há recuperação automática por e-mail porque o cadastro não verifica endereço nem identidade. Se alguém esquecer a senha, o proprietário do projeto pode executar `resetAvanteUserPassword("nome.de.usuario")` no editor Apps Script e entregar a senha temporária por canal privado. `resetAvanteAdminPassword()` continua disponível para a conta `admin.avante`. As trocas feitas na plataforma não exigem acesso de administrador.

## Atualizar uma implantação existente

Ao substituir o `Code.gs` de uma implantação que já está em uso, salve o código e abra **Deploy → Manage deployments**. Edite a implantação ativa, escolha **New version** e clique em **Deploy**. A URL `/exec` permanece a mesma. A planilha existente será preservada; ao receber novas chamadas, o script cria as abas novas que estiverem faltando.

Depois de publicar a nova versão, execute `rebuildPrivateNetwork()` uma vez no Apps Script para reconstruir as conexões privadas a partir das respostas antigas já armazenadas. A função valida todas as respostas antes de alterar relações, impede o reprocessamento concorrente com novos envios e cria uma cópia da aba `Relacoes` antes de reconstruí-la. Se houver JSON inválido, ela interrompe sem alterar as relações. O script não publica empresas antigas no autocomplete porque as versões anteriores não registravam autorização para isso. Novas respostas serão incorporadas automaticamente.

O envio de respostas completas e relações serve à análise interna da rede. O endpoint geral fornece opções, diretório e contagens agregadas; não divulga quem compra de quem. Também fornece totais de mão de obra, sem nomes, CPFs ou cargos individuais. As respostas alimentam a aba privada `Empresas`; um par nome/CNPJ só aparece no diretório público após conferência e execução administrativa de `approveCompanyDirectoryEntry(CNPJ)`. Para retirá-lo, execute `removeCompanyDirectoryEntry(CNPJ)`. Um pedido separado autoriza a análise de perfil empresarial público (nome, CNPJ, localidade, áreas, ofertas, descrição e imagens). Todo pedido entra em `PerfisPendentes`; imagens ficam privadas no Drive. O endereço `?perfil=CNPJ` só encontra registros aprovados em `PerfisPublicos`. Depois de conferir a titularidade por canal/documento empresarial confiável, um administrador seleciona `approvePublicProfile` no editor Apps Script, informa o CNPJ e executa. Somente essa função compartilha as imagens por link e publica o perfil. Para retirar um perfil, o administrador executa `unpublishPublicProfile` com o CNPJ. O Drive precisa do escopo OAuth `https://www.googleapis.com/auth/drive` além do escopo de planilhas. A inicialização e a identificação do administrador também requerem `https://www.googleapis.com/auth/userinfo.email`. Sem pedido de perfil, as respostas ainda entram na análise agregada. Restrinja o acesso à planilha e ao projeto Apps Script a administradores confiáveis.

**Verificação de titularidade:** o login atual do programa é apenas uma demonstração e não comprova titularidade do CNPJ. Por isso, `doPost` não publica nem atualiza perfis; exige-se conferência humana antes de executar a função administrativa. Nunca aprove um pedido apenas porque o CNPJ é válido ou está ativo. A checagem de propriedade ocorre fora do fluxo automatizado, e os perfis aprovados ainda não são uma credencial de identidade emitida por autoridade pública.

## Limites do cadastro de mão de obra

A página coleta apenas totais aproximados por empresa: pessoas atualmente ativas e posições abertas. CPF, currículo e classificação individual de produtividade não são coletados. O projeto atual não autentica trabalhadores nem separa permissões por organização; não use esta planilha pública para armazenar dados pessoais de trabalhadores. Um cadastro individual exigiria desenho próprio de finalidade, acesso, segurança, correção e contestação antes de ser ativado.

## Sincronizar alterações com clasp

O projeto pode ser sincronizado pela ferramenta oficial [clasp](https://github.com/google/clasp), após habilitar a API nas [configurações do Apps Script](https://script.google.com/home/usersettings) e autenticar uma conta que tenha acesso de edição ao projeto. Faça o clone em uma pasta separada, preserve o `appsscript.json` existente e confira os arquivos com `clasp status` antes de enviar, pois `clasp push` substitui o conteúdo de código do projeto pelos arquivos locais reconhecidos.

O fluxo de atualização é: copiar o `Code.gs` atualizado para o arquivo `Code.js` do clone, revisar `clasp status`, executar `clasp push` e atualizar a implantação web existente com `clasp deploy --deploymentId ID_DA_IMPLANTACAO`. Use o ID da implantação cuja URL `/exec` está configurada no HTML, para preservar a URL. As credenciais OAuth do clasp ficam no computador autenticado; não as envie ao repositório nem compartilhe.
