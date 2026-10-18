"""Teste local do filtro integrado à lista de compras.
Execute: python tests/supplier-options.browser.py (Playwright e Chromium).
A página é inteiramente simulada; nenhuma chamada externa é permitida.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
src=(Path(__file__).resolve().parents[1]/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__filterTest=command=>eval(command);\n})();\n</script>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox']);page=b.new_page()
 page.route('**/*',lambda route:route.fulfill(body=src,content_type='text/html') if route.request.url=='http://127.0.0.1:8787/' else route.abort())
 page.goto('http://127.0.0.1:8787/')
 def run(s):return page.evaluate('(s)=>__filterTest(s)',s)
 run("document.body.classList.add('authenticated');authSession={username:'teste',token:'local-test'};isAppsScriptApp=()=>false;state=freshState();window.__originalCompanyLookup=findSharedCompanyBySelection;state.fornecedores.lista=[{empresa:'Fornecedor fictício',tipoEmpresa:'Confecção de roupas',categorias:[],itens:''}];findSharedCompanyBySelection=()=>null;window.testRoot=document.getElementById('platformContent');window.testRoot.innerHTML='';window.testRoot.appendChild(renderSupplierPurchases({options:CATEGORIA_INSUMOS_OPTS}));")
 page.locator('.supplier-purchases-card .combo-multi .combo-toggle').click()
 actual=page.locator('.supplier-purchases-card .combo-multi .combo-option').all_text_contents()
 assert actual==['Uniformes e equipamentos de proteção (EPIs)','Vestuário corporativo'],actual
 assert page.locator('.supplier-purchases-card .combo-toggle-all').count()==0
 page.locator('.supplier-purchases-card .combo-multi .combo-search').fill('Seguros')
 assert page.locator('.supplier-purchases-card .combo-multi .combo-option').count()==0
 run("state.fornecedores.lista[0].tipoEmpresa='Tipo desconhecido';window.testRoot.innerHTML='';window.testRoot.appendChild(renderSupplierPurchases({options:CATEGORIA_INSUMOS_OPTS}));")
 page.locator('.supplier-purchases-card .combo-multi .combo-toggle').click()
 assert page.locator('.supplier-purchases-card .combo-multi .combo-option').count()==0
 # Uma oferta declarada no catálogo não se confunde com inferência pela área.
 run("findSharedCompanyBySelection=()=>({offers:[{nome:'Ajuste de roupas sob medida'}]});window.testRoot.innerHTML='';window.testRoot.appendChild(renderSupplierPurchases({options:CATEGORIA_INSUMOS_OPTS}));")
 page.locator('.supplier-purchases-card .combo-multi .combo-toggle').click()
 assert page.locator('.supplier-purchases-card .combo-multi .combo-option').all_text_contents()==['Ajuste de roupas sob medida']
 page.locator('.supplier-purchases-card .combo-multi .combo-search').fill('Sistemas de alarme e câmeras')
 assert page.locator('.supplier-purchases-card .combo-multi .combo-option').count()==0
 run("state.answers.revendeProdutos='';state.business.ofertas=[{nome:'Produto fictício'}];state.fornecedores.lista[0].categorias=['Produto fictício'];state.fornecedores.lista.push({empresa:'Outra fornecedora',categorias:['Outro produto']});window.testRoot.innerHTML='';window.testRoot.appendChild(renderResalePurchaseSelection());")
 assert page.locator('.resale-supplier-field .combo-multi').count()==0
 page.locator('.resale-purchases-fields summary').click()
 page.locator('.resale-purchases-fields details .combo-search').fill('Produto fictício')
 page.locator('.resale-purchases-fields details .combo-option').filter(has_text='Produto fictício').click()
 page.locator('.resale-supplier-field .combo-toggle').click()
 page.locator('.resale-supplier-field .combo-search').fill('Fornecedor fictício')
 assert page.locator('.resale-supplier-field .combo-option').all_text_contents()==['Fornecedor fictício']
 page.locator('.resale-supplier-field .combo-option').click()
 assert run("state.fornecedores.lista[0].purchasePurposes['Produto fictício']")=='revenda'
 assert run("state.answers.revendeProdutos")=='Sim'
 assert page.locator('.resale-supplier-field input[type=checkbox]:checked').count()==0
 page.locator('.resale-supplier-field label').filter(has_text='Autorizo informar').click()
 assert run("state.fornecedores.lista[0].shareResaleWithSupplier") is True
 run("saveState();state=loadState();window.testRoot.innerHTML='';window.testRoot.appendChild(renderResalePurchaseSelection());")
 assert 'Produto fictício' in page.locator('.resale-selected-summary').inner_text()
 page.locator('.resale-selected-summary button').click()
 assert run("state.fornecedores.lista[0].purchasePurposes['Produto fictício']")==''
 # A promoção usa o catálogo de empresas, preservando respostas de clientes e o legado.
 run("state=freshState();state.answers.vendaConjunta='Sim';state.answers.clientes='Cliente legado';sharedCompanies=[{name:'Parceira fictícia',aliases:[],cnpj:'11222333000181',city:'Cidade teste',areas:[],offers:[]}];findSharedCompanyBySelection=window.__originalCompanyLookup;window.testRoot.innerHTML='';window.testRoot.appendChild(buildCompanySettingsEditor('empresasVendaConjunta'));")
 page.locator('#platformContent .combo-toggle').click()
 page.locator('#platformContent .combo-search').fill('Parceira fictícia')
 page.locator('#platformContent .combo-option').filter(has_text='Parceira fictícia').click()
 assert run("state.answers.empresasVendaConjunta.length")==1
 assert run("state.complementares.empresasVendaConjunta[0].empresa")=='Parceira fictícia'
 assert run("state.complementares.empresasVendaConjunta[0].cnpj")=='11222333000181'
 assert run("state.answers.clientes")=='Cliente legado'
 assert run("state.answers.vendaConjunta")=='Sim'
 assert run("businessSettingSummary({key:'empresasVendaConjunta'}).includes('Parceira fictícia')") is True
 # Duas páginas distintas, com seleção de empresa por nome/CNPJ e de tipo.
 for key,prompt in [('fornecedoresBuscados','Que tipo de negócio você busca como fornecedor?'),('clientesBuscados','Que tipo de negócio você busca para se tornar um fornecedor dele?')]:
  run("currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='"+key+"');window.testRoot.innerHTML='';renderConversation(window.testRoot);")
  assert page.locator('#platformContent h2').inner_text()==prompt
  page.locator('#platformContent .combo-toggle').click()
  page.locator('#platformContent .combo-search').fill('11222333000181')
  page.locator('#platformContent .combo-option').filter(has_text='Parceira fictícia').click()
  page.locator('#platformContent .combo-search').fill('Tipo de negócio:')
  type_label=page.locator('#platformContent .combo-option').first.inner_text()
  page.locator('#platformContent .combo-option').first.click()
  assert run("state.answers."+key+".length")==2
  assert run("state.oportunidades."+key+"Empresas[0].cnpj")=='11222333000181'
  assert run("state.oportunidades."+key+"Categorias[0]")==type_label.removeprefix('Tipo de negócio: ')
  assert run("buildExportObject().answers."+key+".length")==2
 # Tipo novo deve ser categorizado, preservado e não duplicado nem virar empresa.
 for key in ['fornecedoresBuscados','clientesBuscados']:
  run("currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='"+key+"');window.testRoot.innerHTML='';renderConversation(window.testRoot);")
  page.locator('#platformContent .combo-toggle').click()
  page.locator('#platformContent .combo-search').fill('Tipo fictício inédito')
  page.locator('#platformContent .combo-freetext').click()
  assert run("state.oportunidades."+key+"Categorias.includes('Tipo fictício inédito')") is True
  assert run("state.oportunidades."+key+"Empresas.length")==1
  page.locator('#platformContent .combo-search').fill('TIPO FICTÍCIO INÉDITO')
  assert page.locator('#platformContent .combo-freetext').count()==0
  page.locator('#platformContent .combo-search').fill('11222333000181')
  assert page.locator('#platformContent .combo-freetext').count()==0
 # Salvar e recarregar preserva as duas respostas independentes.
 run("saveState();state=loadState();syncConversationAnswers();")
 assert run("state.answers.fornecedoresBuscados.length")==3
 assert run("state.answers.clientesBuscados.length")==3
 run("state=freshState();state.answers.indicacoes='Texto antigo sem direção definida';currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='indicacoes');window.testRoot.innerHTML='';renderConversation(window.testRoot);")
 for key in ['empresasQueIndico','empresasQueMeIndicam']:
  field=page.locator('[data-referral='+key+']')
  field.locator('.combo-toggle').click()
  field.locator('.combo-search').fill('Parceira fictícia' if key=='empresasQueIndico' else '11222333000181')
  field.locator('.combo-option').filter(has_text='Parceira fictícia').click()
  field.locator('.combo-toggle').click()
  assert run("state.answers."+key+".length")==1
  if key=='empresasQueIndico':
   assert run("state.complementares.lista[0].indico") is True
   assert run("state.complementares.lista[0].meIndica") is False
 assert run("state.complementares.lista.length")==1
 assert run("state.complementares.lista[0].meIndica") is True
 # Remover uma direção não remove a outra.
 page.locator('[data-referral=empresasQueIndico] .combo-tag-remove').click()
 assert run("state.complementares.lista[0].indico") is False
 assert run("state.complementares.lista[0].meIndica") is True
 run("saveState();state=loadState();syncConversationAnswers();")
 assert run("state.answers.empresasQueMeIndicam.length")==1
 assert run("state.answers.indicacoes")=='Texto antigo sem direção definida'
 assert run("state.complementares.lista[0].cnpj")=='11222333000181'
 assert run("buildExportObject().complementary.lista[0].meIndica") is True
 # Empresa cadastrada antes só no rascunho, ausente do diretório público.
 run("state=freshState();state.answers.fornecedoresSelecionados=['Fornecedor do rascunho — CNPJ 11.444.777/0001-61'];saveState();state=loadState();currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='indicacoes');window.testRoot.innerHTML='';renderConversation(window.testRoot);")
 for key in ['empresasQueIndico','empresasQueMeIndicam']:
  field=page.locator('[data-referral='+key+']')
  field.locator('.combo-toggle').click()
  field.locator('.combo-search').fill('Fornecedor do rascunho' if key=='empresasQueIndico' else '11444777000161')
  assert field.locator('.combo-option').count()==1
  field.locator('.combo-option').click()
  field.locator('.combo-toggle').click()
 assert run("state.complementares.lista[0].cnpj")=='11444777000161'
 assert run("sharedCompanies.some(c=>c.name==='Fornecedor do rascunho')") is False
 # Trocar o rascunho remove a empresa local dos resultados e não vaza para outro usuário.
 run("state=freshState();window.testRoot.innerHTML='';renderConversation(window.testRoot);")
 field=page.locator('[data-referral=empresasQueIndico]')
 field.locator('.combo-toggle').click()
 field.locator('.combo-search').fill('Fornecedor do rascunho')
 assert field.locator('.combo-option').count()==0
 print('Navegador: empresa do rascunho aparece por nome/CNPJ nas indicações, sem publicação nem vazamento entre rascunhos.')
 print('Navegador: dois campos de indicação, nome/CNPJ, direções independentes, remoção e persistência aprovados.')
 print('Navegador: duas páginas, busca por CNPJ/nome/tipo e persistência independente aprovados.')
 print('Navegador: busca e seleção de empresa parceira, CNPJ e preservação de respostas aprovados.')
 print('Navegador: dois campos de revenda, fornecedores compatíveis, consentimento, recarga e remoção aprovados.')
 print('Navegador: confecção, busca, tipo desconhecido, filtro estrito e catálogo cadastrado aprovados; sem requisições externas.')
 run("state=freshState();state.meta.sendStatus='unknown';state.meta.sendError='Sem recibo';isAppsScriptApp=()=>true;window.sendCalls=0;window.google={script:{run:{withSuccessHandler(fn){window.sendSuccess=fn;return this},withFailureHandler(fn){return this},submitAvanteSurvey(token,payload){window.sendCalls++;window.sentAttempt=payload.meta.submissionId}}}};currentStepIndex=activeConversationQuestions().length;document.body.classList.add('authenticated');renderCurrentStep();document.getElementById('surveyWizard').style.display='flex';document.getElementById('platformContent').style.display='none';")
 assert page.get_by_role('link',name='Verificar recebimento').count()==0
 assert page.get_by_role('link',name='Revisar alterações do rascunho').count()==0
 assert page.locator('#stepContent [role=alert]').count()==0
 run("state.meta.sendFailureObserved=true;renderCurrentStep();")
 assert 'Não conseguimos verificar se suas respostas foram recebidas. Tente novamente.' in page.locator('#stepContent').inner_text()
 assert page.locator('#btnNext').inner_text()=='Enviar respostas'
 page.locator('#btnNext').click()
 assert run('window.sendCalls')==1
 assert page.locator('#btnNext').is_disabled()
 run("window.sendSuccess({ok:true,responsesSaved:true,responseId:'receipt-local',profilePublished:null})")
 assert run("state.meta.responsesSaved") is True
 assert page.locator('#btnNext').inner_text()=='Respostas salvas ✓'
 print('Navegador: um botão Enviar respostas, confirmação explícita e nenhuma etapa manual de recibo.')
 run("state=freshState();state.fornecedores.lista=[{empresa:'PADARIA FICTICIA',cidade:'Descalvado',categorias:['Pão francês','Bolo','Biscoito','Salgado']}];state.fornecedores.lista[0].categorias.forEach(p=>CATEGORIA_INSUMO_AREA[p]='Alimentos/Medicamentos');document.getElementById('surveyWizard').style.display='none';window.testRoot.style.display='block';window.testRoot.innerHTML='';renderNetworkPage(window.testRoot,{companies:1,relationships:1,areas:[]},{},false);")
 assert page.locator('#selectedAreaTitle').inner_text()=='Alimentos/Medicamentos'
 initial=page.locator('#selectedAreaCount').inner_text()
 assert '1 fornecedores' in initial and '4 soluções' in initial,initial
 assert 'PADARIA FICTICIA' in page.locator('#selectedAreaDetails').inner_text()
 page.locator('.platform-area-row').filter(has_text='Alimentos/Medicamentos').click()
 assert page.locator('#selectedAreaCount').inner_text()==initial
 run("window.testRoot.innerHTML='';window.aiInput=document.createElement('input');window.aiStatus=document.createElement('p');window.aiResult=document.createElement('div');window.testRoot.append(aiInput,aiStatus,aiResult);window.google={script:{run:{withSuccessHandler(){throw Error('A busca local não deve chamar IA externa');}}}};submitAiSearch('Encontre fornecedores de pão em Descalvado',aiInput,aiStatus,aiResult);")
 assert 'PADARIA FICTICIA' in page.locator('#platformContent').inner_text()
 assert 'Pão francês' in page.locator('#platformContent').inner_text()
 print('Navegador: contadores e fornecedores corretos desde a abertura e busca local sem chamada externa de IA.')
 run("state=freshState();state.answers.negocioNome='Cadastro original preservado';authSession={username:'admin.avante',token:'admin-local'};STORAGE_KEY='avante_workspace_admin.avante';saveState();window.originalWorkspace=localStorage.getItem(STORAGE_KEY);window.google={script:{run:{withSuccessHandler(fn){window.demoSuccess=fn;return this},withFailureHandler(){return this},getAvanteSimulation(){}}}};toggleAvanteSimulation(document.createElement('button'),document.createElement('p'));window.demoSuccess({ok:true,cnpj:'00000000000000',name:'EMPRESA FICTÍCIA DE TESTE'});currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='cnpj');renderCurrentStep();")
 assert run("state.meta.simulation") is True
 assert run("state.answers.cnpj")=='00000000000000'
 assert run("buildExportObject().publicProfile.consent") is False
 assert 'identificador fictício exclusivo da simulação' in page.locator('#stepContent').inner_text()
 assert run("localStorage.getItem('avante_workspace_admin.avante')===window.originalWorkspace") is True
 run("applySurveySubmissionResult(state.meta,{ok:true,responsesSaved:true,responseId:'simulation-test',profilePublished:false,simulated:true});saveState();showProgramSection('overview');")
 assert run("surveySubmissionSummary(state.meta).title")=='Respostas de simulação salvas ✓'
 run("showProgramSection('profile');")
 assert 'Prévia do perfil fictício' in page.locator('#platformContent').inner_text()
 assert page.get_by_role('button',name='Publicar perfil',exact=True).count()==0
 run("showProgramSection('products');")
 assert 'Prévia do perfil fictício' in page.locator('#platformContent').inner_text()


 run("toggleAvanteSimulation(document.createElement('button'),document.createElement('p'));")
 assert run("state.answers.negocioNome")=='Cadastro original preservado'
 assert run("state.meta.simulation===true") is False
 print('Navegador: simulação administrativa usa CNPJ fictício sem consulta pública e restaura o cadastro original.')
 b.close()
