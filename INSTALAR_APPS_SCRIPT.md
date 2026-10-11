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

Opcionalmente, execute `rebuildPrivateNetwork()` uma vez para reconstruir as conexões privadas a partir das respostas antigas já armazenadas. O script não publica empresas antigas no autocomplete porque as versões anteriores não registravam autorização para isso.

O envio de respostas completas e relações serve à análise interna da rede. O endpoint público fornece apenas opções de resposta, nomes/CNPJs autorizados e contagens agregadas; não divulga quem compra de quem. Na revisão final, a pessoa pode autorizar o uso do nome/CNPJ do próprio negócio e das empresas que informou como sugestões para participantes futuros. Sem essa autorização, a pesquisa ainda entra na análise agregada. Guarde a planilha com acesso restrito e ofereça um canal para corrigir ou remover cadastros.
