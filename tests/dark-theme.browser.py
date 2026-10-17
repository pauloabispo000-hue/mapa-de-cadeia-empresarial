"""Regressão de contraste em Chromium, sem serviços reais.
Execute: python tests/dark-theme.browser.py
Requer Playwright para Python e Chromium (CHROMIUM_BIN pode selecionar o executável).
O servidor local injeta acesso aos renderizadores somente na cópia de teste do HTML.
"""
import json
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
AUDIT=r'''() => {
 const lum=c=>{let a=c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};
 const rgba=s=>s.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];
 const failures=[];
 for(const el of document.querySelectorAll('body *')){
  if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
  const st=getComputedStyle(el),r=el.getBoundingClientRect();
  if(!r.width||!r.height||st.visibility==='hidden'||el.closest('[hidden]')||el.closest('.sr-only')||el.disabled)continue;
  if(el.closest('svg')||el.tagName==='SCRIPT'||el.tagName==='STYLE')continue;
  let bg=[0,0,0,0],node=el,complex=false;
  while(node){const ns=getComputedStyle(node);if(ns.backgroundImage!=='none'){complex=true;break;}
   const c=rgba(ns.backgroundColor);const a=c[3]??1;
   for(let k=0;k<3;k++)bg[k]+=c[k]*a*(1-bg[3]);bg[3]+=a*(1-bg[3]);if(bg[3]>=.999)break;node=node.parentElement;
  }
  if(complex)continue;
  for(let k=0;k<3;k++)bg[k]+=255*(1-bg[3]);
  const fg=rgba(st.color);const a=fg[3]??1;for(let k=0;k<3;k++)fg[k]=fg[k]*a+bg[k]*(1-a);
  const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
  const large=parseFloat(st.fontSize)>=24||(parseFloat(st.fontSize)>=18.66&&parseInt(st.fontWeight)>=700);
  if(ratio<(large?3:4.5)) failures.push({tag:el.tagName,cls:el.className,text:el.textContent.trim().slice(0,65),ratio:Math.round(ratio*100)/100,color:st.color,bg:bg.slice(0,3).map(Math.round)});
 }
 return failures;
}'''

HTML = (ROOT / 'Apps Script/Index.html').read_text().replace(
    '})();\n</script>',
    'window.__contrastTest=function(command){return eval(command);};\n})();\n</script>'
)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(HTML.encode())
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
failures = []
checks = 0
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN', '/usr/bin/chromium'), args=['--no-sandbox'])
        for width in (1280, 390):
            page = browser.new_page(viewport={'width': width, 'height': 1000})
            page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(f'http://127.0.0.1:{server.server_port}/') else route.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            page.evaluate('document.documentElement.setAttribute("data-theme","dark")')
            def run(command):
                return page.evaluate('(command)=>__contrastTest(command)', command)
            def scan(name):
                global checks
                checks += 1
                for issue in page.evaluate(AUDIT):
                    failures.append({'viewport': width, 'screen': name, **issue})
            scan('login')
            run("setAvanteLoginMode('register')")
            scan('registration')
            run("setAvanteLoginMode('login');authSession={token:'local-test',username:'tester'};document.body.classList.add('authenticated');isAppsScriptApp=()=>false;state=freshState();state.answers.negocioNome='Empresa fictícia';state.answers.cnpj='11222333000181';state.answers.cidade='Município de teste';")
            for section in ('overview','network','workforce','settings','business-settings','profile','products','survey'):
                run('showProgramSection('+json.dumps(section)+')')
                scan(section)
            for name, command in [('password','openPasswordChangeDialog()'),('assistant','openAiSearchDialog()')]:
                run(command)
                scan(name)
                page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
            run("showProgramSection('survey')")
            count = run('activeConversationQuestions().length')
            for index in range(count+1):
                run(f'currentStepIndex={index};renderCurrentStep()')
                scan(f'survey-{index}')
            run("state.business.profileProducts=[{sku:'TESTE',name:'Produto fictício',description:'Descrição de teste'}];showProgramSection('products')")
            scan('catalog-filled')
            run('profileCatalogEditMode=true;renderProgramSection()')
            scan('catalog-edit')
            run("showProgramSection('profile');renderPublicCompanyProfile(document.getElementById('platformContent'),{ok:true,profile:{name:'Empresa fictícia',cnpj:'11222333000181',city:'Cidade de teste',country:'Brasil',areas:['Serviços'],offers:['Oferta'],description:'Apresentação de teste',products:[{sku:'TESTE',name:'Produto fictício',description:'Descrição de teste'}]}})")
            scan('public-profile')
            for button in page.locator('.company-profile-tabs button').all():
                button.click()
                scan('public-profile-tab')
            # Estados menos frequentes: seleções, etiquetas e mensagens, no contexto real da pesquisa.
            run("document.getElementById('platformContent').className='';showProgramSection('survey')")
            page.locator('#stepContent').evaluate("""element => {element.innerHTML=`
              <div class="area-card selected"><span class="area-num">1</span><span class="area-nome">Área selecionada</span></div>
              <div class="radio-row"><label class="chip checked">Alternativa selecionada</label><label class="chip">Alternativa disponível</label></div>
              <span class="tag-badge tag-cadeia">Cadeia</span><span class="tag-badge tag-complementar">Complementar</span>
              <span class="tag-badge tag-hibrida">Híbrida</span><span class="tag-badge tag-indicacao">Indicação</span>
              <span class="tag-badge tag-parceria">Parceria</span><span class="tag-badge tag-oferta-produto">Produto</span>
              <span class="tag-badge tag-oferta-servico">Serviço</span>
              <p class="error-msg show">Erro de teste</p><div class="cnpj-status-ok">CNPJ aceito</div>
              <div class="success-box"><h2>Respostas salvas</h2><p>Confirmação recebida</p></div>
              <button class="btn-primary">Continuar</button><button class="btn-outline">Voltar</button>
              <button class="cnpj-use-btn">Usar dados</button><div class="auth-demo-note">Aviso</div>
              <div class="grouped-section"><span class="grouped-summary-num">Grupo</span></div>`;}""")
            scan('states-and-messages')
            page.locator('.btn-outline').focus()
            scan('keyboard-focus')
            # Verifica também a troca de tema, sem recarregar nem gravar dados de perfil.
            run("setAvanteThemeMode('light')")
            assert page.evaluate("document.documentElement.dataset.theme") == 'light'
            run("setAvanteThemeMode('dark')")
            scan('theme-switch')
            page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
assert not failures, json.dumps(failures, ensure_ascii=False, indent=2)
print(f'{checks} cenários de contraste aprovados em desktop e celular (4,5:1; 3:1 para texto grande).')
