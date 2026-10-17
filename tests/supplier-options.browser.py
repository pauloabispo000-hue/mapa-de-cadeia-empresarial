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
 run("state.answers.revendeProdutos='Sim';state.business.ofertas=[{nome:'Produto fictício'}];state.fornecedores.lista[0].categorias=['Produto fictício'];window.testRoot.innerHTML='';window.testRoot.appendChild(renderResalePurchaseSelection());")
 assert page.locator('#platformContent input[type=checkbox]').count()==2
 assert page.locator('#platformContent input[type=checkbox]:checked').count()==0
 page.locator('#platformContent label').filter(has_text='Revendo: Produto fictício').click()
 page.locator('#platformContent label').filter(has_text='Autorizo informar').click()
 assert run("state.fornecedores.lista[0].purchasePurposes['Produto fictício']")=='revenda'
 assert run("state.fornecedores.lista[0].shareResaleWithSupplier") is True
 run("window.testRoot.innerHTML='';window.testRoot.appendChild(renderResalePurchaseSelection());")
 assert page.locator('#platformContent input[type=checkbox]:checked').count()==2
 page.locator('#platformContent label').filter(has_text='Autorizo informar').click()
 assert run("state.fornecedores.lista[0].shareResaleWithSupplier") is False
 assert run("activeConversationQuestions().some(q=>q.key==='revendaFornecedores')") is True
 run("state.answers.revendeProdutos='Não'")
 assert run("activeConversationQuestions().some(q=>q.key==='revendaFornecedores')") is False
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
 # Salvar e recarregar preserva as duas respostas independentes.
 run("saveState();state=loadState();syncConversationAnswers();")
 assert run("state.answers.fornecedoresBuscados.length")==2
 assert run("state.answers.clientesBuscados.length")==2
 print('Navegador: duas páginas, busca por CNPJ/nome/tipo e persistência independente aprovados.')
 print('Navegador: busca e seleção de empresa parceira, CNPJ e preservação de respostas aprovados.')
 print('Navegador: revenda, consentimento e condição Sim/Não aprovados.')
 print('Navegador: confecção, busca, tipo desconhecido, filtro estrito e catálogo cadastrado aprovados; sem requisições externas.')
 b.close()
