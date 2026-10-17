# Instalar a base compartilhada

1. Acesse [script.google.com](https://script.google.com/) e crie um **Novo projeto**.
2. Abra `Code.gs`, apague o conteúdo inicial e cole o arquivo `Code.gs` deste diretório.
3. Salve. No seletor de funções, escolha `setup` e clique em **Executar**. Autorize o acesso à planilha e ao Drive. A função cria (ou atualiza) as abas `Respostas`, `Opcoes`, `Empresas`, `Relacoes`, `PerfisPendentes`, `PerfisPublicos` e `ContasAvante`.
4. Abra **Implantar → Nova implantação**. Selecione **Aplicativo da Web**, configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa** e implante. Conclua a autorização se o Google solicitar.
5. Copie a URL terminada em `/exec`.
6. No HTML do programa, substitua `COLE_AQUI_A_URL_DA_NOVA_IMPLANTACAO` em `APPS_SCRIPT_URL` pela URL copiada.
7. Abra a página novamente. Ela carregará as opções de resposta e o diretório de empresas autorizadas para aparecer como sugestão. Novas respostas completas serão gravadas em `Respostas`; as contribuições de opções em `Opcoes`; empresas autorizadas em `Empresas`; e relações de fornecedores/clientes em `Relacoes`.

## Backup online automático

Depois de publicar o código que inclui o backup, execute `installPlatformBackup` uma vez no editor Apps Script e autorize o acesso ao Drive se solicitado. A função cria o primeiro backup e instala um gatilho diário para aproximadamente 02:00, no fuso do projeto. Cada cópia fica na pasta privada `Avante - backups da plataforma`, com uma cópia integral da planilha (incluindo contas e hashes de senha), uma cópia das imagens armazenadas no Drive e um manifesto com metadados não secretos. São mantidos 30 dias de backups; cópias mais antigas são movidas para a lixeira.

Para criar uma cópia fora do horário automático, execute `backupPlatformNow`. Confira regularmente se a pasta contém backups recentes e se há espaço disponível no Drive. Chaves de API, senhas e tokens não entram no manifesto; ao restaurar um projeto, configure novamente essas credenciais nas propriedades do Apps Script. O código-fonte permanece versionado no repositório GitHub. A restauração dos dados é manual: copie a planilha de volta, revise os dados e atualize `MAPA_NEGOCIOS_SPREADSHEET_ID` nas propriedades do script antes de reabrir o Web App. Mantenha a pasta de backup privada, pois a planilha contém contas e hashes de senha.

## Contas e acesso ao Avante

O aplicativo deve ser aberto pela URL da implantação com `?app=1` no final. Essa versão é servida pelo Apps Script e valida a senha no servidor; a página estática do GitHub encaminha para ela. Depois de publicar o código atualizado, o proprietário inicializa a conta administrativa executando `initializeAvanteAdmin` no editor Apps Script. A função cria a conta `admin.avante`; guarde a senha mostrada no registro da execução em local privado.

## Catálogo público de produtos

Na página inicial do perfil da empresa, abra a aba **Produtos** para cadastrar SKU, nome, descrição e foto. São aceitos até 40 produtos por empresa. Cada SKU deve ser único; cada produto precisa de foto, e as fotos são comprimidas no navegador (350 KB por arquivo; até 1,1 MB no total por envio). O catálogo é publicado junto com o perfil após o envio autenticado e o consentimento explícito. As imagens enviadas passam a ser públicas por link no Drive, sem aprovação administrativa.

Participantes podem criar suas próprias contas na tela de entrada, usando um nome de usuário de 3 a 32 caracteres e uma senha de 12 a 128 caracteres. Depois de entrar, podem trocar a própria senha pelo botão **Senha**, informando a senha atual. A troca invalida as outras sessões daquela conta. As contas e hashes com sal ficam na aba privada `ContasAvante`; nenhuma senha em texto é gravada. Sessões expiram após seis horas, e o endpoint de envio exige uma sessão válida.

Não há recuperação automática por e-mail porque o cadastro não verifica endereço nem identidade. Se alguém esquecer a senha, o proprietário do projeto pode executar `resetAvanteUserPassword("nome.de.usuario")` no editor Apps Script e entregar a senha temporária por canal privado. `resetAvanteAdminPassword()` continua disponível para a conta `admin.avante`. As trocas feitas na plataforma não exigem acesso de administrador.

## Atualizar uma implantação existente

Ao substituir o `Code.gs` de uma implantação que já está em uso, salve o código e abra **Deploy → Manage deployments**. Edite a implantação ativa, escolha **New version** e clique em **Deploy**. A URL `/exec` permanece a mesma. A planilha existente será preservada; ao receber novas chamadas, o script cria as abas novas que estiverem faltando.

Depois de publicar a nova versão, execute `rebuildPrivateNetwork()` uma vez no Apps Script para reconstruir as conexões privadas a partir das respostas antigas já armazenadas. A função valida todas as respostas antes de alterar relações, impede o reprocessamento concorrente com novos envios e cria uma cópia da aba `Relacoes` antes de reconstruí-la. Se houver JSON inválido, ela interrompe sem alterar as relações. O script não publica empresas antigas no autocomplete porque as versões anteriores não registravam autorização para isso. Novas respostas serão incorporadas automaticamente.

O envio de respostas completas e relações serve à análise interna da rede. O endpoint geral fornece opções, diretório e contagens agregadas; não divulga quem compra de quem. Também fornece totais de mão de obra, sem nomes, CPFs ou cargos individuais. As respostas alimentam a aba privada `Empresas`; um par nome/CNPJ só aparece no diretório público após conferência e execução administrativa de `approveCompanyDirectoryEntry(CNPJ)`. Para retirá-lo, execute `removeCompanyDirectoryEntry(CNPJ)`. O perfil empresarial público (nome, CNPJ, localidade, áreas, ofertas, descrição e imagens) é publicado automaticamente quando uma conta autenticada autoriza sua exibição. Tanto o envio das respostas quanto a edição em **Publicar perfil** usam esse fluxo; sem consentimento, as respostas continuam privadas e não publicam um perfil. A URL `?perfil=CNPJ` retorna o perfil publicado imediatamente. Não há conferência administrativa para novos perfis.

A aba privada `ContasPerfisPublicos` vincula cada CNPJ à conta criadora, impedindo que outra conta sobrescreva o perfil. O vínculo é mantido mesmo após retirada do perfil. Perfis antigos recuperam a conta a partir da resposta autenticada que originou a aprovação. Quando não há esse histórico, o suporte precisa vincular o CNPJ à conta correta nessa aba privada antes de permitir a edição; outra conta não pode reivindicar o perfil existente automaticamente. Isso não exige aprovar novos cadastros. `PerfisPendentes` preserva o histórico de envios e registra a publicação automática. Solicitações antigas não são publicadas em massa; o administrador ainda pode usar `approvePublicProfile` para tratar esse legado.

**Identidade:** o perfil é autodeclarado, como em uma rede social. Autenticação, CNPJ válido e publicação não comprovam titularidade legal da empresa. O diretório de sugestões mantém sua curadoria independente; publicar um perfil não autoriza divulgar relações comerciais, respostas completas, CPF ou dados da conta. Para retirar um perfil, o administrador pode executar `unpublishPublicProfile(CNPJ)`. O Drive precisa do escopo OAuth `https://www.googleapis.com/auth/drive`, além do escopo de planilhas. Restrinja o acesso à planilha e ao projeto Apps Script a administradores confiáveis.

## Limites do cadastro de mão de obra

A página coleta apenas totais aproximados por empresa: pessoas atualmente ativas e posições abertas. CPF, currículo e classificação individual de produtividade não são coletados. O projeto atual não autentica trabalhadores nem separa permissões por organização; não use esta planilha pública para armazenar dados pessoais de trabalhadores. Um cadastro individual exigiria desenho próprio de finalidade, acesso, segurança, correção e contestação antes de ser ativado.

## Sincronizar alterações com clasp

O projeto pode ser sincronizado pela ferramenta oficial [clasp](https://github.com/google/clasp), após habilitar a API nas [configurações do Apps Script](https://script.google.com/home/usersettings) e autenticar uma conta que tenha acesso de edição ao projeto. Faça o clone em uma pasta separada, preserve o `appsscript.json` existente e confira os arquivos com `clasp status` antes de enviar, pois `clasp push` substitui o conteúdo de código do projeto pelos arquivos locais reconhecidos.

O fluxo de atualização é: copiar o `Code.gs` atualizado para o arquivo `Code.js` do clone, revisar `clasp status`, executar `clasp push` e atualizar a implantação web existente com `clasp deploy --deploymentId ID_DA_IMPLANTACAO`. Use o ID da implantação cuja URL `/exec` está configurada no HTML, para preservar a URL. As credenciais OAuth do clasp ficam no computador autenticado; não as envie ao repositório nem compartilhe.

## Ativar o assistente de IA

O Avante inclui um assistente Gemini para responder perguntas e revisar informações declaradas. As chamadas passam pelo Apps Script; a chave não é enviada ao navegador. Para manter o recurso dentro do uso gratuito, a plataforma não ativa Grounding na Busca Google: a documentação atual informa que esse recurso não está disponível no nível gratuito do Gemini 3.8 Flash e pode gerar cobrança separada em projetos pagos.

1. Crie uma chave da Gemini API no Google AI Studio: https://aistudio.google.com/app/apikey. Confira as condições de uso e faturamento antes de habilitar o serviço.
2. No projeto Apps Script, abra **Configurações do projeto** (ícone de engrenagem) e, em **Propriedades do script**, adicione `GEMINI_API_KEY` com o valor da chave. Não coloque a chave no HTML, no GitHub, na planilha nem em mensagens.
3. Recarregue o Avante e acesse o ícone **Pesquisa com inteligência artificial**. O serviço limita cada conta a cinco chamadas por dez minutos, a plataforma a vinte chamadas por dia e quinhentas por mês. As chamadas são bloqueadas antes de chegar ao Gemini ao atingir esses limites; o contador mensal é compartilhado pelas contas e reinicia no primeiro dia do mês, no fuso de São Paulo.

A pesquisa envia ao Gemini a consulta escrita pela pessoa. A opção **Revisar os dados do meu negócio** envia também nome, CNPJ, cidade, tipos e ofertas declaradas. O sistema não envia automaticamente a lista de fornecedores/clientes, relações comerciais, senha ou token de sessão. Sem Busca Google, a resposta não equivale a pesquisa atual na internet nem apresenta fontes verificadas; a pessoa deve conferir informações factuais em fontes oficiais. O resultado nunca altera o cadastro automaticamente.

O Gemini 3.8 Flash oferece entrada e saída de texto gratuitas na tabela atual, mas acesso e limites variam conforme projeto e podem mudar. O limite interno contabiliza chamadas feitas pelo Avante; não mede uso da mesma chave fora da plataforma. Confira as cotas efetivas no Google AI Studio: https://ai.google.dev/gemini-api/docs/rate-limits.

## Testar o mapa geográfico com Google Maps

O painel **Mapa geográfico (teste)** usa a Maps JavaScript API e tenta localizar o negócio e até 30 fornecedores já cadastrados. Para mostrar distâncias, o CNPJ precisa fornecer endereço de logradouro, número e o geocodificador precisa reconhecer o ponto com precisão de endereço. Localizações por município aparecem como aproximações e não participam da ordenação por distância. Os cálculos são em linha reta; não são rotas de carro. As coordenadas são mantidas apenas em memória durante a sessão.

1. No Google Cloud Console, selecione o projeto e associe faturamento. Ative **Maps JavaScript API**, **Geocoding API** e **Places API (New)**. A chave `GEMINI_API_KEY` não habilita mapas.
2. Crie uma chave própria para o mapa. Restrinja-a às APIs **Maps JavaScript API**, **Geocoding API** e **Places API (New)** e às referências HTTP do Web App Apps Script (`https://script.google.com/*` e `https://*.googleusercontent.com/*`). O segundo padrão cobre o subdomínio dinâmico usado pelo painel do Apps Script. Confira as recomendações vigentes para restringir chaves às APIs e origens necessárias.
3. Em **Configurações do projeto → Propriedades do script**, adicione `MAPS_BROWSER_API_KEY` com essa chave. A chave é entregue à interface do mapa e, por isso, precisa das restrições de API e origem descritas acima. Não a salve no HTML ou no repositório.
4. Recarregue o Avante, abra **Mapa geográfico (teste)** e confira os marcadores. O Google Maps Platform cobra por SKU depois dos limites gratuitos aplicáveis; configure alertas e cotas no Google Cloud antes de compartilhar o teste.

O Web App reserva os eventos antes das chamadas e limita este Apps Script a **8.000 carregamentos de mapa, 8.000 consultas de geocodificação, 8.000 consultas de autocompletar e 8.000 confirmações de endereço (Place Details) por mês**, cada contador separadamente. O autocompletar usa Places API (New), é limitado ao Brasil e só pesquisa após três caracteres e uma pausa de digitação. Ao escolher uma sugestão, o Place Details busca o logradouro, município e CEP para separar e confirmar os campos do endereço. Os contadores deixam margem abaixo do limite gratuito anunciado por evento/SKU; são compartilhados pelos usuários deste Web App e reiniciam no mês de faturamento do Google (fuso `America/Los_Angeles`). Quando qualquer contador atinge o teto, novas chamadas daquele recurso são bloqueadas até o próximo mês. Como eventos são reservados antes das chamadas, falhas posteriores podem fazer o contador interno ficar acima do total faturado pelo Google. O Google agrega o uso de todos os projetos associados à mesma conta de faturamento; os tetos internos não contabilizam outros projetos nem chamadas feitas diretamente com a chave. Monitore o faturamento/cotas da conta se ela for compartilhada.

O mapa cobre somente o negócio e os fornecedores que o participante já cadastrou. Não pesquisa automaticamente todas as empresas da base por proximidade. Dados de endereço vêm da consulta pública do CNPJ e podem estar ausentes ou desatualizados; confira a precisão apresentada antes de usar a distância como critério.
