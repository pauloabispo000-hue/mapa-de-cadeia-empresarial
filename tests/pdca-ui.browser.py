"""PDCA local: proveniência, contraste, Markdown, modal e localidades oficiais.
Dados fictícios; todas as requisições externas são bloqueadas.
"""
from pathlib import Path
import json, os, re
from playwright.sync_api import sync_playwright, expect
src=(Path(__file__).resolve().parents[1]/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__uiTest=command=>eval(command);\n})();\n</script>')
def contrast(a,b):
 def lum(value):
  rgb=[int(x)/255 for x in re.findall(r'\d+',value)[:3]]
  rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
  return sum(x*w for x,w in zip(rgb,[.2126,.7152,.0722]))
 x,y=sorted([lum(a),lum(b)]);return (y+.05)/(x+.05)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1000,'height':800})
 page.route('**/*',lambda r:r.fulfill(body=src,content_type='text/html') if r.request.url=='http://127.0.0.1:8787/' else r.abort())
 page.goto('http://127.0.0.1:8787/')
 def run(s):return page.evaluate('(s)=>__uiTest(s)',s)
 run("document.body.classList.add('authenticated');state=freshState();state.fornecedores.lista=[{empresa:'ESTILOS FICTÍCIOS — CNPJ 11.222.333/0001-81 · DESCALVADO - SP',categorias:['Vestuário corporativo']}];sharedCompanies=[];window.root=document.getElementById('platformContent');root.innerHTML='';root.style.display='block';window.opener=document.createElement('button');opener.id='pdcaOpen';opener.textContent='Abrir pesquisa';opener.onclick=openAiSearchDialog;root.append(opener);opener.focus();openAiSearchDialog();renderKnownSupplierMatches(findKnownSupplierMatches('vestuário corporativo em Descalvado'),document.getElementById('aiSearchResult'));")
 page.wait_for_function("document.activeElement.id==='aiSearchInput'")
 assert page.locator('#aiSearchResult .platform-card strong').inner_text()=='ESTILOS FICTÍCIOS'
 note=page.locator('#aiSearchResult .platform-card .supplier-location-meta')
 assert 'Localização citada no nome/seleção: DESCALVADO - SP' in note.inner_text()
 assert 'Sem localização estruturada' in note.inner_text()
 assert 'Localização não informada' not in note.inner_text()
 for theme in ['light','dark']:
  run("setAvanteThemeMode('"+theme+"')")
  colors=note.evaluate('(e)=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e.closest(".platform-card")).backgroundColor})')
  ratio=contrast(colors['fg'],colors['bg']);assert ratio>=4.5,(theme,colors,ratio)
  close=page.locator('#aiSearchClose')
  colors=close.evaluate('(e)=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})')
  assert contrast(colors['fg'],colors['bg'])>=4.5
  assert run("getComputedStyle(document.getElementById('aiSearchDialog')).backgroundColor===getComputedStyle(document.getElementById('aiSearchForm')).backgroundColor") is True
  print(theme,'contraste dos metadados:',round(ratio,2))
 markdown='### Fornecedores\n**Descalvado (SP)**\n---\n* Primeiro item\n* Segundo item\n[site seguro](https://example.com)\n[perigoso](javascript:alert(1))\n<img src=x onerror=alert(1)>\n<script>alert(1)</script>'
 run("document.getElementById('aiSearchResult').innerHTML='';document.getElementById('aiSearchResult').appendChild(renderSafeAiMarkdown("+json.dumps(markdown)+"));")
 assert page.locator('#aiSearchResult h3').inner_text()=='Fornecedores'
 assert page.locator('#aiSearchResult strong').inner_text()=='Descalvado (SP)'
 assert page.locator('#aiSearchResult li').count()==2
 assert page.locator('#aiSearchResult hr').count()==1
 assert page.locator('#aiSearchResult img,#aiSearchResult script').count()==0
 assert page.locator('#aiSearchResult a').count()==1
 assert page.locator('#aiSearchResult a').get_attribute('href')=='https://example.com/'
 page.locator('#aiSearchInput').fill('Texto para testar Escape')
 page.locator('#aiSearchInput').press('Escape')
 page.wait_for_function("!document.getElementById('aiSearchDialog').open&&document.activeElement.id==='pdcaOpen'")
 assert run("document.body.style.overflow")!='hidden'
 page.locator('#pdcaOpen').click();page.wait_for_function("document.activeElement.id==='aiSearchInput'")
 page.locator('#aiSearchInput').press('Shift+Tab')
 assert page.evaluate('document.activeElement.id')=='aiSearchClose'
 page.keyboard.press('Enter')
 page.wait_for_function("!document.getElementById('aiSearchDialog').open&&document.activeElement.id==='pdcaOpen'")
 page.set_viewport_size({'width':360,'height':640})
 page.locator('#pdcaOpen').click();page.wait_for_function("document.activeElement.id==='aiSearchInput'")
 run("var result=document.getElementById('aiSearchResult');result.hidden=false;result.appendChild(renderSafeAiMarkdown(Array(80).fill('Parágrafo longo para testar rolagem.').join('\\n')));")
 assert run("document.getElementById('aiSearchResult').scrollHeight>document.getElementById('aiSearchResult').clientHeight")
 page.locator('#aiSearchResult').evaluate('(e)=>e.scrollTop=e.scrollHeight')
 assert page.locator('#aiSearchResult').evaluate('(e)=>e.scrollTop')>0
 assert page.get_by_role('button',name='Fechar pesquisa').is_visible()
 assert run("document.getElementById('aiSearchDialog').getBoundingClientRect().right<=window.innerWidth")
 assert run("document.body.style.overflow")=='hidden'
 page.get_by_role('button',name='Fechar pesquisa').click()
 page.set_viewport_size({'width':1000,'height':800})
 run("state=freshState();state.meta.simulation=true;state.answers.estado='São Paulo - SP';document.getElementById('platformContent').style.display='none';document.getElementById('surveyWizard').style.display='flex';currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='estado');renderCurrentStep();")
 page.locator('#stepContent summary').click()
 page.locator('#stepContent .combo-search').fill('sao paulo')
 assert 'São Paulo - SP' in page.locator('#stepContent .combo-list').inner_text()
 assert page.locator('#stepContent .combo-freetext').count()==0
 page.locator('#stepContent .combo-search').fill('SAO PAULO SP')
 assert 'São Paulo - SP' in page.locator('#stepContent .combo-list').inner_text()
 run("currentStepIndex=activeConversationQuestions().findIndex(q=>q.key==='cidade');renderCurrentStep();")
 page.locator('#stepContent summary').click()
 page.locator('#stepContent .combo-search').fill('Descalvado')
 assert 'Descalvado - SP' in page.locator('#stepContent .combo-list').inner_text()
 assert page.locator('#stepContent .combo-freetext').count()==0
 page.locator('#stepContent .combo-search').fill('Cidade inexistente fictícia')
 assert page.locator('#stepContent .combo-freetext').count()==0
 run("root.innerHTML='';root.style.display='block';document.getElementById('surveyWizard').style.display='none';root.appendChild(comboField(TIPO_FORNECEDOR_OPTS,'','Modelo do negócio',function(){},null,true));")
 page.locator('#platformContent summary').click()
 page.locator('#platformContent .combo-search').fill('Atividade fictícia inédita')
 run("document.querySelector('#platformContent details').dispatchEvent(new Event('toggle'))")
 expect(page.locator('#platformContent .combo-search')).to_have_value('Atividade fictícia inédita')
 expect(page.locator('#platformContent .combo-freetext')).to_have_count(1)
 print('PDCA: proveniência, Markdown seguro, Escape/Fechar, foco, rolagem móvel e localidades oficiais aprovados; sem gravações ou requisições externas.')
 run("closeAiSearchDialog();document.getElementById('surveyWizard').style.display='none';root.style.display='block';authSession={username:'admin.avante',token:'fake-admin-session'};isAppsScriptApp=()=>true;window.diagnosticCalls=0;window.google={script:{run:{withSuccessHandler(fn){window.diagnosticSuccess=fn;return this},withFailureHandler(fn){window.diagnosticFailure=fn;return this},getAvanteAiDiagnostics(){window.diagnosticCalls++}}}};showProgramSection('settings');")
 page.get_by_role('button',name='Diagnosticar configuração da IA').click()
 assert run('window.diagnosticCalls')==1
 run("window.diagnosticSuccess({ok:true,httpStatus:200,model:'gemini-3.8-flash',supportsGenerateContent:true})")
 assert 'não comprova disponibilidade da geração' in page.locator('#platformContent').inner_text()
 diagnostic=page.get_by_role('button',name='Diagnosticar configuração da IA')
 expect(diagnostic).to_be_enabled()
 page.clock.install()
 diagnostic.click()
 expect(diagnostic).to_be_disabled()
 run("window.oldDiagnosticSuccess=window.diagnosticSuccess;window.oldDiagnosticFailure=window.diagnosticFailure")
 page.clock.fast_forward(20001)
 expect(diagnostic).to_be_enabled()
 assert 'excedeu 20 segundos' in page.locator('#platformContent').inner_text()
 assert run('window.diagnosticCalls')==2
 run("window.oldDiagnosticSuccess({ok:true,httpStatus:200,model:'late-model'});window.oldDiagnosticFailure()")
 assert 'excedeu 20 segundos' in page.locator('#platformContent').inner_text()
 diagnostic.click()
 run("window.oldDiagnosticSuccess({ok:true,httpStatus:200,model:'late-model'})")
 expect(diagnostic).to_be_disabled()
 run("window.diagnosticSuccess({ok:false,httpStatus:403,error:'Permissão recusada (HTTP 403).'})")
 expect(diagnostic).to_be_enabled()
 assert 'Permissão recusada (HTTP 403)' in page.locator('#platformContent').inner_text()
 page.clock.fast_forward(20001)
 assert 'Permissão recusada (HTTP 403)' in page.locator('#platformContent').inner_text()
 diagnostic.click()
 run('window.diagnosticFailure()')
 expect(diagnostic).to_be_enabled()
 assert 'Falha de comunicação' in page.locator('#platformContent').inner_text()
 diagnostic.click()
 run("window.diagnosticSuccess({ok:false,httpStatus:404,error:'Modelo não encontrado (HTTP 404).'})")
 assert 'Modelo não encontrado (HTTP 404)' in page.locator('#platformContent').inner_text()
 run("window.google.script.run.getAvanteAiDiagnostics=function(){throw new Error('fixture')}")
 diagnostic.click()
 expect(diagnostic).to_be_enabled()
 assert 'Não foi possível iniciar' in page.locator('#platformContent').inner_text()
 page.clock.fast_forward(60001)
 assert run('window.diagnosticCalls')==5
 print('PDCA: timeout de metadados, limpeza de carregamento, falhas HTTP/comunicação/início, descarte tardio e ausência de retry aprovados.')
 print('PDCA: diagnóstico administrativo distingue acesso a metadados de disponibilidade da geração.')
 b.close()
