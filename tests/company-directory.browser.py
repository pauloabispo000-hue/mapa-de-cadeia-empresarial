"""Diretório visual com empresas fictícias; sem rede, mensagens ou gravações reais."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright,expect
base=Path(__file__).resolve().parents[1]
html=(base/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__directoryTest=code=>eval(code);\n})();\n</script>')
records=json.loads((base/'Apps Script/Code.js').read_text().split('var AVANTE_INFORMATIVE_PROFILES = ',1)[1].split(';\nfunction getAvanteInformativeProfiles',1)[0])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda route:route.fulfill(body=html,content_type='text/html') if route.request.url=='http://127.0.0.1:8792/' else route.abort())
 page.goto('http://127.0.0.1:8792/')
 def run(s):return page.evaluate('(s)=>__directoryTest(s)',s)
 page.evaluate('(data)=>window.informativeFixture=data',records[0])
 run("document.body.classList.add('authenticated');authSession={username:'fixture',token:'fixture'};state=freshState();state.fornecedores.lista=[{empresa:'Empresa fictícia 2',cnpj:'11222333000181'}];sharedCompanies=Array.from({length:55},(_,i)=>({name:'Empresa fictícia '+i,cnpj:String(i+10000000000000),city:'Cidade fictícia - SP',cnae:'Atividade cadastral'}));sharedCompanies[2].cnpj='11222333000181';publishedSupplierCompanies=[{name:'Perfil publicado fictício',cnpj:'11222333000181',city:'Cidade fictícia - SP',profilePublished:true,offers:[{nome:'Produto declarado fictício'}]}];externalInformativeProfiles=[window.informativeFixture];companyDirectoryView={query:'',filter:'all',limit:24};showProgramSection('overview');")
 expect(page.locator('.company-directory-count')).to_have_text('24 de 56 empresas')
 assert page.locator('.company-directory-card').count()==24
 assert page.locator('.company-directory-card').first.locator('h2').inner_text()=='Perfil publicado fictício'
 assert run('companyDirectoryEntries().filter(c=>c.cnpj==="11222333000181").length')==1
 page.get_by_role('button',name='Mostrar mais empresas',exact=True).click()
 assert page.locator('.company-directory-card').count()==48
 page.get_by_role('searchbox').fill('Produto declarado fictício')
 expect(page.locator('.company-directory-count')).to_have_text('1 de 1 empresas')
 page.get_by_role('button',name='Ver empresa',exact=True).click()
 expect(page.get_by_role('dialog')).to_contain_text('Produto declarado fictício')
 assert page.get_by_role('link',name='Abrir perfil público completo').get_attribute('href').endswith('&perfil=11222333000181')
 page.keyboard.press('Escape');assert page.get_by_role('dialog').count()==0
 assert page.evaluate('document.activeElement.textContent')=='Ver empresa'
 page.get_by_role('searchbox').fill('11.222.333/0001-81')
 expect(page.locator('.company-directory-count')).to_have_text('1 de 1 empresas')
 page.get_by_role('searchbox').fill('')
 page.get_by_role('button',name='Meus fornecedores',exact=True).click()
 expect(page.locator('.company-directory-count')).to_have_text('1 de 1 empresas')
 page.get_by_role('button',name='Clientes revendedores',exact=True).click()
 expect(page.locator('.company-directory-empty')).to_have_text('Nenhuma empresa encontrada')
 assert page.get_by_role('button',name='Explorar setores',exact=True).count()==0
 assert page.get_by_role('button',name='Perfis no Avante',exact=True).count()==0
 assert page.get_by_role('button',name='Perfis informativos',exact=True).count()==0
 page.get_by_role('button',name='Todas as empresas',exact=True).click()
 page.get_by_role('searchbox').fill(records[0]['fields']['name']['value'])
 expect(page.locator('.company-directory-count')).to_have_text('1 de 1 empresas')
 page.get_by_role('button',name='Ver empresa',exact=True).click()
 expect(page.get_by_role('dialog')).to_contain_text('Vínculo com CNPJ pendente')
 assert page.locator('dialog img').count()==0
 page.get_by_role('button',name='Fechar perfil',exact=True).click()
 page.get_by_role('button',name='Planejar contato',exact=True).click()
 expect(page.locator('.supplier-contact-plan')).to_contain_text('1 resultados incluídos')
 page.locator('.supplier-contact-plan details summary').first.click()
 assert page.get_by_role('button',name='Preparar mensagem de cotação').is_disabled()
 page.get_by_role('button',name='Todas as empresas',exact=True).click()
 page.get_by_role('searchbox').fill('')
 page.get_by_role('button',name='Planejar contato com os resultados',exact=True).click()
 expect(page.locator('.supplier-contact-plan summary').first).to_have_text('Plano de contato — 56 resultados incluídos')
 for theme in ['light','dark']:
  for width in [1366,768,360]:
   page.set_viewport_size({'width':width,'height':900})
   run("setAvanteThemeMode('"+theme+"');companyDirectoryView={query:'',filter:'all',limit:24};showProgramSection('overview')")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width)
   for selector in ['.company-directory-sidebar','.company-directory-card h2','.company-directory-card p','.company-directory-badge']:
    assert page.locator(selector).first.is_visible()
   if width==1366 and theme=='dark':page.screenshot(path='/tmp/avante-empresas-desktop.png',full_page=True)
   if width==360 and theme=='dark':page.screenshot(path='/tmp/avante-empresas-mobile.png',full_page=True)
 assert not errors,errors
 print('Diretório: busca nome/produto/CNPJ, filtros privados, deduplicação, paginação, perfis, Escape/foco, plano completo sem envio e layout em 3 larguras/2 temas aprovados.')
 b.close()
