"""Catálogo/perfis públicos reais da versão, com rede bloqueada e RPCs simulados."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright,expect
base=Path(__file__).resolve().parents[1]
code=(base/'Apps Script/Code.js').read_text()
records=json.loads(code.split('var AVANTE_INFORMATIVE_PROFILES = ',1)[1].split(';\nfunction getAvanteInformativeProfiles',1)[0])
html=(base/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__informativeTest=command=>eval(command);\n})();\n</script>')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page()
 page.route('**/*',lambda route:route.fulfill(body=html,content_type='text/html') if route.request.url=='http://127.0.0.1:8787/' else route.abort())
 page.goto('http://127.0.0.1:8787/')
 page.evaluate('(data)=>window.profileFixtures=data',records)
 def run(command):return page.evaluate('(command)=>__informativeTest(command)',command)
 run("document.body.classList.add('authenticated');window.root=document.getElementById('platformContent');root.innerHTML='';root.style.display='block';document.getElementById('surveyWizard').style.display='none';externalInformativeProfiles=window.profileFixtures;root.appendChild(renderInformativeCompanyCatalog(externalInformativeProfiles));")
 assert page.locator('.informative-catalog-item').count()==5
 page.locator('.informative-catalog-item').nth(2).locator('summary').click()
 expect(page.locator('.informative-catalog-item').nth(2)).to_contain_text('Dois CNPJs homônimos')
 assert '20.976.947/0001-40' in page.locator('.informative-catalog-item').nth(2).inner_text()
 assert '43.626.865/0001-70' in page.locator('.informative-catalog-item').nth(2).inner_text()
 assert page.locator('.informative-company-profile img').count()==0
 for i,profile in enumerate(records):
  run('root.innerHTML="";renderInformativeCompanyProfile(root,{ok:true,informativeProfile:window.profileFixtures['+str(i)+']})')
  assert 'NÃO REIVINDICADO' in page.locator('#platformContent').inner_text()
  assert 'não foram declarados no Facebook' in page.locator('#platformContent').inner_text()
  assert 'Vínculo com CNPJ pendente' in page.locator('#platformContent').inner_text()
  assert page.locator('#platformContent button').count()==0
  assert profile['fields']['address']['value'] in page.locator('#platformContent').inner_text()
  assert page.locator('#platformContent img').count()==0
  assert page.locator('#platformContent a[href*="informativo="]').count()==1
 run("state=freshState();sharedCompanies=[{name:'FLOR DO TRIGO',cnpj:'52574125000129',city:'Descalvado - SP',catalogSource:'registry',cnae:'1091102'}];window.matches=findSupplierCandidates('pão em Descalvado')")
 matches=run('window.matches')
 informative=[c for c in matches if c.get('informativeId')]
 assert len(informative)==1
 assert informative[0]['cnpj']==''
 assert informative[0]['profilePublished'] is False
 assert informative[0]['offers']==[]
 assert any(c.get('cnpj')=='52574125000129' and not c.get('informativeId') for c in matches)
 assert run('supplierContactKey(window.matches.find(c=>c.informativeId))')=='informative:facebook-flordotrigopadariaeconfeitaria'
 # Nenhum perfil é uma seleção de CNPJ ou conta no diretório de respostas.
 assert run('surveyCompanyCatalog().some(c=>c.informativeId)') is False
 # Página compartilhável: marcador inserido no HTML recebido do servidor é lido antes do login.
 public_html=html.replace('<body','<body data-informative-profile="'+records[0]['id']+'"',1)
 public_page=browser.new_page()
 public_page.add_init_script('window.google={script:{run:{withSuccessHandler(fn){this.success=fn;return this},withFailureHandler(fn){return this},getAvanteInformativeProfile(id){this.success({ok:true,informativeProfile:'+json.dumps(records[0],ensure_ascii=False)+'})}}}};')
 public_page.route('**/*',lambda route:route.fulfill(body=public_html,content_type='text/html') if route.request.url=='http://127.0.0.1:8788/' else route.abort())
 public_page.goto('http://127.0.0.1:8788/')
 expect(public_page.locator('.informative-company-profile h1')).to_have_text(records[0]['fields']['name']['value'])
 assert public_page.locator('#loginForm').is_visible() is False
 print('Cinco perfis: fontes por campo, vínculo pendente, Tamanduá único, contatos sem envio, rota pública e ausência de vínculo/conta automática aprovados.')
 browser.close()
