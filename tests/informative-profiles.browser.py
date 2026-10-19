"""Catálogo/perfis públicos reais da versão, com rede bloqueada e RPCs simulados."""
from pathlib import Path
import json,os,re
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
  assert page.locator('#platformContent input[type=checkbox],#platformContent form').count()==0
  assert page.get_by_role('button',name='Produtos e serviços',exact=True).count()==1
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
 public_page.evaluate('(data)=>window.profileFixtures=data',records)
 def channel(value):
  v=value/255
  return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
 def contrast(fg,bg):
  def lum(color):
   parts=[float(v) for v in re.findall(r'[0-9.]+',color)[:3]]
   return sum(channel(v)*w for v,w in zip(parts,[0.2126,0.7152,0.0722]))
  a,b=sorted([lum(fg),lum(bg)])
  return (b+0.05)/(a+0.05)
 for width,height in [(1366,600),(360,640)]:
  public_page.set_viewport_size({'width':width,'height':height})
  for theme in ['light','dark']:
   for index in range(len(records)):
    public_page.evaluate('(command)=>__informativeTest(command)',"setAvanteThemeMode('"+theme+"');renderInformativeCompanyProfile(document.querySelector('.informative-public-content'),{ok:true,informativeProfile:window.profileFixtures["+str(index)+"]});window.scrollTo(0,0)")
    expect(public_page.get_by_role('link',name='Voltar ao Avante',exact=True)).to_be_visible()
    assert public_page.get_by_role('link',name='Voltar ao Avante',exact=True).get_attribute('target')=='_top'
    assert 'informativo=' not in public_page.get_by_role('link',name='Voltar ao Avante',exact=True).get_attribute('href')
    metrics=public_page.locator('.informative-public-content').evaluate('(e)=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,maxHeight:getComputedStyle(e).maxHeight,overflow:getComputedStyle(e).overflowY,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth})')
    assert metrics['width']>=width*0.75,(theme,width,metrics)
    assert metrics['maxHeight']=='none'
    assert metrics['overflow']=='visible'
    assert metrics['height']>height
    assert metrics['documentWidth']<=metrics['viewport'],(theme,width,metrics)
    columns=public_page.locator('.informative-fields-grid').evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length')
    assert columns==(1 if width==360 else 2)
    assert public_page.locator('.informative-public-header').evaluate('(e)=>e.getBoundingClientRect().width')==width
    colors=public_page.locator('.informative-company-profile').evaluate('(root)=>Array.from(root.querySelectorAll("h1,h2,h3,p,a")).map(e=>{let b=e;while(b.parentElement&&["rgba(0, 0, 0, 0)","transparent"].includes(getComputedStyle(b).backgroundColor))b=b.parentElement;return {text:e.textContent.slice(0,40),fg:getComputedStyle(e).color,bg:getComputedStyle(b).backgroundColor}})')
    for color in colors:assert contrast(color['fg'],color['bg'])>=4.5,(theme,width,color)
    public_page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
    expect(public_page.get_by_role('link',name='Link deste perfil informativo no Avante',exact=True)).to_be_in_viewport()
 print('Layout: cinco perfis em desktop/móvel e temas claro/escuro, contraste ≥4,5, navegação, grade e rolagem até o final aprovados.')
 print('Cinco perfis: fontes por campo, vínculo pendente, Tamanduá único, contatos sem envio, rota pública e ausência de vínculo/conta automática aprovados.')
 browser.close()
