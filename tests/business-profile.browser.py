"""Perfil empresarial sem feed, com dados fictícios e toda rede bloqueada."""
from pathlib import Path
import json,os,re
from playwright.sync_api import sync_playwright,expect
base=Path(__file__).resolve().parents[1]
html=(base/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__profileTest=code=>eval(code);\n})();\n</script>')
records=json.loads((base/'Apps Script/Code.js').read_text().split('var AVANTE_INFORMATIVE_PROFILES = ',1)[1].split(';\nfunction getAvanteInformativeProfiles',1)[0])
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.route('**/*',lambda route:route.fulfill(body=html,content_type='text/html') if route.request.url=='http://localhost/' else route.abort())
 page.goto('http://localhost/')
 def run(code):return page.evaluate('(code)=>__profileTest(code)',code)
 page.evaluate('(data)=>window.informativeFixture=data',records[0])
 run("document.body.classList.remove('authenticated');document.getElementById('loginForm').style.display='none';window.profileRoot=createPublicProfileView();renderInformativeCompanyProfile(profileRoot,{ok:true,informativeProfile:window.informativeFixture})")
 expect(page.locator('.business-profile-hero h1')).to_have_text(records[0]['fields']['name']['value'])
 assert page.locator('.business-profile-hero img').count()==0
 assert page.get_by_role('link',name='Ligar',exact=True).get_attribute('href').startswith('tel:')
 assert page.get_by_role('button',name='Planejar contato',exact=True).count()==0
 page.get_by_role('button',name='Produtos e serviços',exact=True).click()
 expect(page.get_by_text('Ofertas ainda não informadas',exact=True)).to_be_visible()
 assert not page.locator('.informative-fields-grid').is_visible()
 page.get_by_role('button',name='Contato',exact=True).click()
 expect(page.get_by_role('heading',name='Telefone público',exact=True)).to_be_visible()
 page.get_by_role('button',name='Sobre',exact=True).click()
 for width in [1366,360]:
  page.set_viewport_size({'width':width,'height':900})
  for theme in ['light','dark']:
   run("setAvanteThemeMode('"+theme+"')")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme)
   assert page.locator('.company-profile-cover').evaluate('(e)=>e.getBoundingClientRect().width')>width*.7
   for button in page.locator('.social-business-profile .company-profile-tabs button').all():
    button.hover()
    colors=button.evaluate('(e)=>{let b=e;while(b.parentElement&&["transparent","rgba(0, 0, 0, 0)"].includes(getComputedStyle(b).backgroundColor))b=b.parentElement;return [getComputedStyle(e).color,getComputedStyle(b).backgroundColor]}')
    def luminance(color):
     values=[float(v)/255 for v in re.findall(r'[0-9.]+',color)[:3]]
     return sum((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)*w for v,w in zip(values,[.2126,.7152,.0722]))
    lo,hi=sorted(map(luminance,colors));assert (hi+.05)/(lo+.05)>=4.5,(theme,colors)
   if theme=='dark':page.screenshot(path='/tmp/avante-perfil-social-'+str(width)+'.png')
 # Perfil publicado preserva catálogo; não acrescenta feed ou ações de publicação.
 run("profileRoot.innerHTML='';window.publishedFixture={name:'Empresa publicada fictícia',cnpj:'11222333000181',city:'Cidade fictícia - SP',country:'Brasil',areas:[],offers:['Produto declarado'],description:'Apresentação pública fictícia',products:[{sku:'F01',name:'Produto fictício',description:'Descrição fictícia',imageUrl:''}]};renderPublicCompanyProfile(profileRoot,{ok:true,profile:window.publishedFixture})")
 expect(page.locator('.business-profile-hero h1')).to_have_text('Empresa publicada fictícia')
 assert page.get_by_role('button',name='Publicar',exact=True).count()==0
 assert page.locator('video,input[type=file],textarea').filter(visible=True).count()==0
 page.get_by_role('button',name='Produtos (1)',exact=True).click()
 expect(page.locator('.marketplace-product-card')).to_contain_text('Produto fictício')
 page.get_by_role('button',name='Sobre',exact=True).click()
 expect(page.locator('.business-profile-overview')).to_contain_text('Produto declarado')
 # Somente sessão autenticada oferece plano local. Não há envio ao abrir o perfil.
 run("document.body.classList.add('authenticated');authSession={username:'fixture',token:'fixture'};state=freshState();document.getElementById('platformContent').innerHTML='';window.localRoot=document.getElementById('platformContent');renderPublicCompanyProfile(localRoot,{ok:true,profile:window.publishedFixture})")
 page.get_by_role('button',name='Planejar contato',exact=True).click()
 expect(page.locator('#platformContent .supplier-contact-plan summary').first).to_have_text('Plano de contato — 1 resultados incluídos')
 assert not errors,errors
 print('Perfis: capa, identidade circular, abas, contatos públicos, plano autenticado, catálogo preservado, sem feed/upload de posts, temas e celular aprovados; sem rede ou gravação real.')
 b.close()
