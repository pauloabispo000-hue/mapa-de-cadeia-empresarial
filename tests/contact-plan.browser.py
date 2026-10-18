"""Planos/mensagens com dados fictícios, RPC simulado e nenhuma requisição externa."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
src=(Path(__file__).resolve().parents[1]/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__contactTest=command=>eval(command);\n})();\n</script>')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page()
 page.route('**/*',lambda route:route.fulfill(body=src,content_type='text/html') if route.request.url=='http://127.0.0.1:8787/' else route.abort())
 page.goto('http://127.0.0.1:8787/')
 def run(command): return page.evaluate('(command)=>__contactTest(command)',command)
 run("document.body.classList.add('authenticated');state=freshState();state.business.cidade='São Carlos - SP';state.business.cnpj='11222333000181';authSession={username:'buyer-fixture',token:'fake-token'};isAppsScriptApp=()=>true;window.root=document.getElementById('platformContent');root.innerHTML='';root.style.display='block';document.getElementById('surveyWizard').style.display='none';window.communicationsCalls=[];window.sentPayloads=[];window.failSending=false;window.google={script:{run:{withSuccessHandler(fn){this.success=fn;return this},withFailureHandler(fn){this.failure=fn;return this},getAvanteCommunications(){window.communicationsCalls.push('read');this.success({ok:true,enabled:false,total:0,messages:[],companies:[{cnpj:'11222333000181',name:'Compradora fictícia'}]})},sendAvanteBusinessMessage(token,payload){window.communicationsCalls.push('send');window.sentPayloads.push(payload);if(window.failSending)this.failure();else this.success({ok:true,id:'fake-message'})},setAvanteCommunicationPreference(token,enabled){window.communicationsCalls.push('preference');this.success({ok:true,enabled})}}}};window.plan={id:'plan-fixture',query:'Pão francês',companies:[{name:'A regional sem canal',cnpj:'1',city:'Descalvado - SP'},{name:'B local com canal',cnpj:'11444777000161',city:'São Carlos - SP',profilePublished:true}],quotes:{},need:{product:'Pão francês 50g',quantity:100,unit:'unidade',destination:'São Carlos - SP'}};root.appendChild(renderSupplierContactPlan(window.plan));")
 if not page.locator('.supplier-contact-plan').evaluate('(e)=>e.open'): page.locator('.supplier-contact-plan > summary').click()
 assert '2 resultados incluídos' in page.locator('.supplier-contact-plan > summary').inner_text()
 expect(page.get_by_text('1. B local com canal',exact=True)).to_be_visible()
 assert 'mesmo município empatam' in page.locator('.supplier-contact-plan').inner_text()
 assert run('window.communicationsCalls.length')==0
 page.get_by_text('1. B local com canal',exact=True).click()
 expect(page.locator('.supplier-contact-plan')).to_contain_text('distância entre endereços desconhecida')
 page.get_by_role('button',name='Preparar mensagem de cotação').click()
 assert run('window.communicationsCalls.join()')=='read'
 page.get_by_role('button',name='Enviar mensagem interna').click()
 assert run('window.sentPayloads.length')==0
 page.get_by_label('Autorizo enviar esta mensagem',exact=False).check()
 run('window.failSending=true')
 page.get_by_role('button',name='Enviar mensagem interna').click()
 assert run('window.sentPayloads.length')==1
 assert 'rascunho foi preservado' in page.locator('.supplier-message-composer').inner_text()
 expect(page.get_by_role('textbox',name='Mensagem de cotação')).to_have_attribute('readonly','')
 first=run('JSON.stringify(window.sentPayloads[0])')
 run('window.failSending=false')
 page.get_by_role('button',name='Confirmar envio com a mesma tentativa').click()
 assert run('JSON.stringify(window.sentPayloads[1])')==first
 assert 'não confirma leitura' in page.locator('.supplier-message-composer').inner_text()
 assert run('supplierMessageDraft(window.plan.companies[1])') is None
 # Cotação sem frete não se torna custo zero ou ganha ranking.
 page.get_by_text('Registrar cotação recebida (privada)',exact=True).click()
 page.get_by_role('spinbutton',name='Preço unitário (R$)',exact=True).fill('1')
 page.get_by_role('button',name='Aplicar cotação ao plano').click()
 assert 'Não entrou no ranking financeiro' in page.locator('.supplier-contact-plan').inner_text()
 page.get_by_role('spinbutton',name='Frete total (R$; informe 0 se incluso)',exact=True).fill('0')
 page.get_by_role('spinbutton',name='Outros encargos (R$)',exact=True).fill('0')
 page.get_by_role('spinbutton',name='Desconto total (R$)',exact=True).fill('0')
 page.get_by_label('Validade da cotação',exact=True).fill('2099-12-31')
 page.get_by_label('Confirmo mesmo produto',exact=False).check()
 page.get_by_role('button',name='Aplicar cotação ao plano').click()
 assert 'custo total entregue das cotações comparáveis' in page.locator('.supplier-contact-plan').inner_text()
 page.get_by_role('button',name='Salvar plano privado neste navegador').click()
 assert run('readSupplierContactPlans().length')==1
 run("authSession={username:'other-fixture',token:'other-token'}")
 assert run('readSupplierContactPlans().length')==0
 run("authSession={username:'buyer-fixture',token:'fake-token'};state.meta.simulation=true")
 assert run('readSupplierContactPlans().length')==0
 run("root.innerHTML='';renderSupplierCommunications(root)")
 assert 'Simulação não envia' not in page.locator('#platformContent').inner_text() # No composer/sends here.
 assert 'Mensagens reais indisponíveis' in page.locator('#platformContent').inner_text()
 assert run('window.sentPayloads.length')==2
 # Nenhum canal é inventado para empresa sem conta.
 run("state.meta.simulation=false;root.innerHTML='';root.appendChild(renderSupplierContactPlan(window.plan))")
 if not page.locator('.supplier-contact-plan').evaluate('(e)=>e.open'): page.locator('.supplier-contact-plan > summary').click()
 page.get_by_text('2. A regional sem canal',exact=True).click()
 expect(page.get_by_role('button',name='Preparar mensagem de cotação')).to_be_disabled()
 assert 'Sem canal interno confirmado' in page.locator('.supplier-contact-plan').inner_text()
 # Caixa privada usa texto literal e opt-in separado; nenhuma leitura envia mensagem.
 run("window.google.script.run.getAvanteCommunications=function(){window.communicationsCalls.push('read');this.success({ok:true,enabled:false,total:1,companies:[],messages:[{id:'x',direction:'received',fromName:'Empresa fictícia',fromCnpj:'11444777000161',createdAt:'2026-10-18',body:'<img src=x onerror=alert(1)>'}]})};root.innerHTML='';renderSupplierCommunications(root)")
 assert page.locator('#platformContent img').count()==0
 assert '<img src=x' in page.locator('#platformContent').inner_text()
 page.get_by_label('Permitir que empresas me enviem mensagens',exact=False).check()
 assert 'Recebimento habilitado' in page.locator('#platformContent').inner_text()
 assert run('window.sentPayloads.length')==2
 # A falha da IA não apaga um plano que já está sendo preenchido.
 run("root.innerHTML='';window.searchInput=h('input',{});window.searchStatus=h('p',{});window.searchResult=h('div',{});root.append(searchInput,searchStatus,searchResult);state.fornecedores.lista=[];sharedCompanies=[{name:'PADARIA CADASTRAL FICTÍCIA',cnpj:'11444777000161',city:'Descalvado',catalogSource:'registry',cnae:'1091102',profilePublished:true}];aiRemoteRetryAt=0;window.google.script.run.runAvanteAiAssistant=function(){window.searchSuccess=this.success};submitAiSearch('pão em Descalvado',searchInput,searchStatus,searchResult)")
 page.locator('.supplier-contact-plan > summary').click()
 page.get_by_role('textbox',name='Produto e especificação',exact=True).fill('Pão francês 50g para cotação')
 page.get_by_text('1. PADARIA CADASTRAL FICTÍCIA',exact=True).click()
 page.get_by_text('Registrar cotação recebida (privada)',exact=True).click()
 page.get_by_role('spinbutton',name='Preço unitário (R$)',exact=True).fill('1.23')
 run("window.searchSuccess({ok:false,httpStatus:429,error:'Cota atingida (HTTP 429)'})")
 expect(page.get_by_role('textbox',name='Produto e especificação',exact=True)).to_have_value('Pão francês 50g para cotação')
 page.get_by_text('1. PADARIA CADASTRAL FICTÍCIA',exact=True).click()
 page.get_by_text('Registrar cotação recebida (privada)',exact=True).click()
 expect(page.get_by_role('spinbutton',name='Preço unitário (R$)',exact=True)).to_have_value('1.23')
 page.get_by_role('button',name='Atualizar pedido e recalcular prioridade').click()
 assert run('supplierContactContext.plan.need.product')=='Pão francês 50g para cotação'
 assert run('supplierContactContext.plan.needDraft===undefined') is True
 # Timeout não deixa carregamento infinito nem dispara outro envio; rascunho sobrevive à reabertura.
 run("window.google.script.run.getAvanteCommunications=function(){this.success({ok:true,enabled:false,total:0,messages:[],companies:[{cnpj:'11222333000181',name:'Compradora fictícia'}]})};window.google.script.run.sendAvanteBusinessMessage=function(token,payload){window.sentPayloads.push(payload);window.lateMessageSuccess=this.success};root.innerHTML='';renderSupplierMessageComposer(root,{name:'Destinatária fictícia',cnpj:'11444777000161'},'Cotação fictícia com frete')")
 page.get_by_label('Autorizo enviar esta mensagem',exact=False).check()
 page.clock.install()
 page.get_by_role('button',name='Enviar mensagem interna').click()
 page.clock.fast_forward(20001)
 expect(page.locator('.supplier-message-composer')).to_contain_text('espera excedeu 20 segundos')
 assert run('window.sentPayloads.length')==3
 run("window.lateMessageSuccess({ok:true,id:'late-id'})")
 expect(page.locator('.supplier-message-composer')).to_contain_text('rascunho foi preservado')
 page.clock.fast_forward(60001)
 assert run('window.sentPayloads.length')==3
 run("root.innerHTML='';renderSupplierMessageComposer(root,{name:'Destinatária fictícia',cnpj:'11444777000161'},'Texto novo que não pode substituir o pendente')")
 expect(page.get_by_role('textbox',name='Mensagem de cotação')).to_have_value('Cotação fictícia com frete')
 expect(page.get_by_role('button',name='Confirmar envio com a mesma tentativa')).to_be_enabled()
 assert run('window.sentPayloads.length')==3
 print('Plano: todos os resultados, priorização pela compradora, cotação com frete, pendências e isolamento por conta/simulação aprovados.')
 print('Mensagens: consentimento, rascunho, mesma tentativa após falha, caixa segura e opt-in aprovados; nenhum envio real.')
 browser.close()
