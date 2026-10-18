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
A resposta tem dois campos de busca: produto comprado e empresa fornecedora
daquele produto. A seleção da empresa registra a finalidade de revenda, sem uma
etapa intermediária de Sim/Não. Os vínculos anteriores são preservados e podem
ser removidos individualmente. Não pergunte quem compra da empresa nem o que
esses compradores usam. Preserve os
dados legados, sem utilizá-los para criar novos clientes identificados.

A consulta autenticada identifica compradores pelo CNPJ do fornecedor, finalidade
de revenda e mesmo produto no catálogo da compradora. Exige consentimento
específico para compartilhar nome, CNPJ e produtos com a conta do fornecedor; a
relação permanece privada e identificada como declaração da compradora, sem
confirmação do fornecedor. A declaração/edição mais recente pode revogar esse
compartilhamento. A consulta não modifica planilhas nem perfis.

A pergunta sobre oferta ou promoção conjunta usa busca e seleção múltipla de
empresas por nome/CNPJ, na pesquisa e nas configurações. As empresas selecionadas
ficam em `answers.empresasVendaConjunta` e, com nome/CNPJ resolvidos, em
`complementary.empresasVendaConjunta`. O campo legado `vendaConjunta` é preservado;
respostas antigas “Sim/Não/Não lembro” não são nomes de empresas nem são migradas
para a seleção. Essa resposta permanece privada.

A busca de oportunidades tem duas etapas independentes: fornecedores procurados
(`answers.fornecedoresBuscados`) e negócios aos quais o participante quer fornecer
(`answers.clientesBuscados`). Ambas permitem buscar por CNPJ, nome da empresa ou
tipo de negócio e selecionar várias opções. Tipos aparecem com o prefixo
“Tipo de negócio:”; empresas usam o diretório compartilhado e consulta pública de
CNPJ. Em `opportunities`, cada direção separa categorias e empresas com nome/CNPJ.
As respostas da antiga pergunta ampla (`oportunidadeSelecionada`) são preservadas
sem atribuir automaticamente uma direção comercial. As intenções não confirmam
relações comerciais e permanecem privadas.

## Diagnóstico de publicação

O workflow aceita `verify_only=true` e `expected_revision` para conferir a versão
atual por operações GET, sem enviar código nem criar versão ou atualizar a
implantação. A consulta confere projeto, commit e conteúdo dos arquivos. A
credencial Google continua exclusivamente no Secret do GitHub Actions.

Versão observada e confirmação ficam nas anotações do job, acessíveis pela API de
check-runs, mesmo quando o proxy bloqueia o download dos logs. Falhas também geram
anotação e `deployment-error.json`; o upload dos artefatos roda com `always()`.
Uma consulta bem-sucedida não muda a conclusão histórica de um workflow anterior.

Nos dois campos de busca de oportunidades, texto livre pode ser adicionado como
“Tipo de negócio: …”. O valor permanece na resposta privada como categoria, sem
criar empresa no diretório nem consolidar automaticamente uma sugestão global.
A busca por CNPJ continua usando a consulta própria e não adiciona um CNPJ válido
como tipo de negócio. Comparação normalizada evita tipos selecionados duplicados.

## Indicações comerciais

A pergunta de indicações contém dois seletores de empresas: “Indico”
(`answers.empresasQueIndico`) e “Sou indicado por” (`answers.empresasQueMeIndicam`).
Ambos pesquisam nome/CNPJ, sem aceitar tipos de negócio como empresas. A lista
privada de complementares usa `indico` e `meIndica` independentemente e une as duas
direções somente quando a empresa é selecionada nos dois campos.

O texto legado `answers.indicacoes` é preservado e exibido para consulta, sem
inferir empresas nem marcar automaticamente os dois sentidos. As respostas
continuam privadas; nenhuma confirmação pela outra empresa é presumida.

## Empresas nas opções de resposta

O catálogo usado pelos seletores combina o diretório compartilhado com empresas
presentes nas listas e seleções do rascunho atual. Essa combinação é local: não
publica candidatos privados nem modifica `sharedCompanies`. Nome e CNPJ são
preservados nas seleções posteriores; tipos de negócio não viram empresas. A
busca inclui aliases do diretório, com índice criado uma vez por seletor.

O envio confirmado salva o JSON completo em Respostas e candidatos do negócio,
fornecedores, clientes e complementares na aba Empresas. O diretório público
retornado por `readCompanies_` exige CNPJ válido e inclusão na propriedade
`MAPA_NEGOCIOS_VERIFIED_PUBLIC_CNPJS`. Isso é separado da publicação automática
de perfis públicos. O campo `shareDirectory` sozinho não libera candidatos.

Limitações: empresas apenas em promoções ou intenções ficam no JSON completo, mas
não são todas extraídas pelo indexador `saveCompanies_`. Edições em
ConfiguracoesPerfil não atualizam esse índice. A busca de opções compartilhadas
não confirma gravação de um registro específico: isso exige consultar a planilha
privada com autorização. Não ampliar a exposição pública para corrigir buscas do
próprio rascunho.

## Envio das respostas

Na última página, o usuário clica em “Enviar respostas”. Não existe etapa manual
de consulta de recibo nem botão técnico de download JSON na mensagem de erro.
O aplicativo só informa sucesso após retorno explícito do servidor. Falhas
preservam o rascunho; uma nova tentativa depende de outro clique do usuário.

Cada tentativa tem `meta.submissionId` persistido antes da chamada. Sob o mesmo
lock da gravação, o servidor procura uma resposta da mesma conta e chave. Se o
conteúdo corresponde, devolve o recibo sem duplicar linhas, contagens, relações
ou publicação de perfil. Se a chave corresponde a outro conteúdo, recusa a
escrita. Respostas legadas sem chave podem ser reconhecidas pela mesma conta,
início do rascunho e conteúdo equivalente. IDs locais e valores vazios de
campos novos não impedem o reconhecimento; mudanças reais e consentimento são
considerados. A confirmação reaproveitada não presume publicação do perfil.

O aviso de envio só aparece quando `meta.sendFailureObserved` registra uma falha
observada durante uma tentativa. Estados antigos sem esse indicador não geram
alerta só por serem desconhecidos. O rascunho e a chave de tentativa permanecem
preservados, sem declarar sucesso. Iniciar nova tentativa ou receber confirmação
limpa o indicador. Uma falha real usa linguagem simples, sem etapa de recibo.

## Busca de fornecedores e cobertura municipal

A pesquisa consulta primeiro fornecedores do rascunho e ofertas disponíveis no
catálogo compartilhado, sem enviar relações privadas à IA. Resultados locais
mostram sua origem; CNAE sem oferta declarada não comprova produto vendido.
Na ausência de correspondência local, a resposta de IA é identificada como
orientação geral. Disponibilidade deve ser confirmada com a empresa.

O painel de setores seleciona inicialmente uma área com fornecedores, quando
existir, e preenche contadores e detalhes após inserir o painel na página.

O índice municipal lista apenas fragmentos existentes e informa separadamente
os indisponíveis. Em 18/10/2026, o arquivo empresas-descalvado-07.json não existe
no histórico do checkout, com lacuna de 500 registros: 6.787 disponíveis dos
7.287 previstos. A fonte pública retornou CONNECT 403 nesta execução. Não gerar
registros substitutos. O carregador tolera falhas individuais e informa cobertura
parcial, mantendo os demais dados. O teste de integridade confere existência e
contagens dos arquivos anunciados.

## Simulação administrativa

A conta admin.avante pode iniciar a simulação em Configurações → Simulação
administrativa. O backend autentica a conta administrativa configurada. O
identificador 00.000.000/0000-00 é deliberadamente fictício e não consulta o CNPJ
público nem flexibiliza a validação dos cadastros reais.

O rascunho de teste usa chave local própria. Envio e configurações ficam somente
nas abas SimulacoesAvante e SimulacoesConfiguracoesAvante, sem alimentar Respostas,
Empresas, relações, indicadores ou perfis públicos. O envio simulado confirma
explicitamente seu caráter de teste. Repetir a mesma tentativa não duplica a
simulação; conteúdo diferente com a mesma chave é recusado. O botão Voltar ao
cadastro original restaura o rascunho anterior; uma nova sessão abre o cadastro
original por padrão. A simulação permanece disponível para retomada pelo botão.

As páginas Perfil e Produtos, durante a simulação, mostram uma prévia fictícia e
atalhos para editar o cadastro, sem chamar APIs de publicação ou carregar catálogo
real para o identificador de teste. O publicador também recusa explicitamente esse
identificador e orienta usar o cadastro de demonstração, antes de gravar dados.

## PDCA — busca local e inicialização pública

A busca mantém fornecedores com produto informado e cidade ausente, identificando
que a localização precisa ser confirmada. Cidades explicitamente diferentes são
filtradas; sufixos de UF são normalizados. A lista local é consultada novamente
se a IA retornar erro, falhar na comunicação ou exceder 30 segundos, aproveitando
dados carregados durante a chamada sem inventar ofertas. Relações privadas do
rascunho não são enviadas ao serviço externo.

No Apps Script, a inicialização das opções públicas usa getAvanteSharedOptions
via google.script.run. O fallback JSONP mantém callback inofensivo após timeout,
ignora respostas tardias e o servidor só chama funções existentes. Perfis públicos
também ignoram respostas tardias para não sobrescrever a interface após timeout.

Totais não carregados aparecem como Carregando/Indisponível, não zero. Os totais
agregados vêm do cadastro e relações persistidos no servidor, enquanto setores
empresariais usam o rascunho atual. Em consulta pública durante este ciclo, o
endpoint retornou 10 empresas indexadas, 5 relações, 0 opções públicas de empresas
e 0 ofertas autorizadas por área. Não foram alteradas as autorizações do diretório,
nem inferido defeito nos indicadores com zero. A pluralização distingue fornecedor,
fornecedores, solução e soluções.

## PDCA — localização, modal e localidades oficiais

A seleção de empresa pode conter um rótulo composto com nome, CNPJ e cidade. O
parser separa a identidade, preserva a cidade citada como `citedCity`/`cidadeCitada`
e não a transforma em localização estruturada. A busca distingue cidade informada
no cadastro, cidade apenas citada na seleção e localização desconhecida; todas
continuam sujeitas à confirmação de atendimento pela empresa.

O modal de pesquisa usa cores próprias consistentes por tema, botão Fechar com
nome acessível, Escape na fase de captura (inclusive em input type=search), foco
inicial no campo, retorno ao acionador e rolagem interna móvel. A resposta da IA
é convertida em elementos DOM de uma sintaxe limitada de Markdown (títulos,
listas, negrito, ênfase, código e links HTTP/HTTPS), sem inserir HTML remoto.
Fechar/iniciar uma pesquisa invalida respostas pendentes da pesquisa anterior.

Estado, cidade brasileira e dropdowns da pesquisa usam opções fechadas. Localidades
normalizam acentos, caixa, espaços e UF para a busca, evitando uma cópia livre da
opção oficial. Tipos de negócio explicitamente abertos continuam permitindo valor
personalizado. Teste visual e de acessibilidade:
`python tests/pdca-ui.browser.py` (dados fictícios, todas as requisições bloqueadas).
O teste confere contraste, conteúdo malicioso, teclado/foco, rolagem a 360px e
localidades oficiais. Nenhum teste de falha 503 deste ciclo foi forçado online.

O evento assíncrono de abertura dos combos preserva a busca já digitada, em vez
de apagá-la. Ajustes/foco agendados só atuam em controles abertos e conectados ao
DOM. O fechamento do modal restaura foco e rolagem de forma imediata e idempotente,
sem depender da ordem do evento nativo close. O teste PDCA reproduz a abertura
tardia do combo com uma busca personalizada já preenchida.

## PDCA — recorrência de HTTP 503 na IA

Evidências fornecidas pelo usuário: a documentação oficial de
https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash confirma a existência
e estabilidade do código do modelo, com atualização em setembro/2026. Isso não
confirma acesso desta chave/projeto nem disponibilidade do generateContent.
https://ai.google.dev/gemini-api/docs/troubleshooting orienta backoff exponencial
com jitter e máximo de tentativas para falhas transitórias. Estas páginas e a
página pública de status retornaram CONNECT 403 neste ambiente; não houve validação
independente das condições atuais do serviço nem consulta real de geração.

O modelo padrão é mantido. A propriedade opcional GEMINI_MODEL permite configuração
explícita pelo administrador, com validação de formato, sem mudar permissões ou
expor a chave. Configurações → Simulação administrativa → Diagnosticar configuração
da IA consulta somente os metadados do modelo pelo servidor, exige autenticação
administrativa e não executa geração. Retorna presença da chave, modelo, HTTP e
suporte declarado ao método; nunca retorna chave, headers ou corpo bruto de erro.
HTTP 200 nos metadados não comprova disponibilidade da geração.

O tratamento diferencia HTTP remoto, autorização, modelo, cota, JSON ilegível,
contrato inválido, resposta vazia e falha de transporte. O estado do provedor é
restrito a enumerações permitidas; mensagens brutas que podem conter dados privados
não são retornadas. HTTP 503 reportado é anterior ao parser de resposta e não
prova falha de Markdown ou ausência de credencial.

Há no máximo duas tentativas de geração por ação, somente para 500/502/503/504,
com backoff exponencial e jitter (primeira espera entre 500 e 750 ms, respeitando
Retry-After). A segunda chamada não ocorre se a primeira levou mais de 5 segundos,
Retry-After supera 2 segundos ou a cota se esgotou. Cada chamada consome cota. Não
há retry de 400/401/403/404/429, contrato inválido ou erro de transporte de resultado
incerto. A tela aplica pausa de 30 segundos após 503 ou timeout, mantendo busca
local disponível. A espera interativa de 30 segundos não cancela UrlFetchApp já em
execução; a segunda chamada ainda pode ultrapassar esse prazo. Retry é resiliência,
não evidência de resolução da indisponibilidade.

Validação de acesso real ao modelo e disponibilidade de geração depende da conta
administrativa autenticada no Apps Script, usando a chave que já permanece nas
Script Properties. Não solicitar ou copiar a chave, CLASPRC_JSON ou credenciais
para o ambiente de desenvolvimento. Testes usam serviços e dados fictícios, sem
chamadas reais ao Gemini ou gravações em cadastros reais.

O diagnóstico de metadados encerra a espera na interface após 20 segundos, libera
o botão e descarta callbacks tardios, inclusive durante uma nova consulta manual.
Timeout não valida nem invalida chave, permissões ou modelo; a chamada UrlFetchApp
pode continuar no servidor. Não há repetição automática de metadados. Falha de
comunicação/início e erros HTTP recebidos encerram o carregamento separadamente.
O teste PDCA usa relógio e RPC simulados, sem consultar a chave/projeto reais.

## PDCA — conclusão da resposta de IA

O parser verifica finishReason: STOP confirma conclusão normal; MAX_TOKENS mostra
texto disponível com aviso de resposta parcial; motivo ausente/desconhecido ou
corte pelo limite local de caracteres também exige aviso. Bloqueios de conteúdo
não exibem o texto do candidato. Respostas sem candidates ou sem texto visível
são falhas explícitas. Partes marcadas thought não são exibidas. Não há continuação
automática. A renderização Markdown segura e o fallback local são preservados.

maxOutputTokens permanece 1200; os prompts pedem até 180 palavras e itens curtos.
Não há thinkingConfig explícito: sem contrato confirmado para o modelo, não se
inventa um parâmetro nem se amplia o orçamento. Contagens numéricas de uso,
inclusive thoughtsTokenCount quando recebido, são retornadas sem texto de
raciocínio ou logs privados. A resposta online anterior não preservou finishReason
ou contagens: sua causa concreta de truncamento não pode ser reconstruída pelo
tamanho do texto. Sucesso de uma geração não confirma estabilidade do serviço.
