"""Acesso com RPC fictícia: sem credenciais reais, gravações ou rede externa."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
html=(Path(__file__).resolve().parents[1]/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__accessTest=command=>eval(command);\n})();\n</script>')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.route('**/*',lambda route:route.fulfill(body=html,content_type='text/html') if route.request.url=='http://127.0.0.1:8791/' else route.abort())
 page.goto('http://127.0.0.1:8791/');page.clock.install()
 def run(code):return page.evaluate('(code)=>__accessTest(code)',code)
 run("""window.calls=[];
 window.google={script:{get run(){
   var call={};
   return new Proxy({
     withSuccessHandler(fn){call.success=fn;return this},
     withFailureHandler(fn){call.failure=fn;return this}
   },{get(target,key){
     return key in target?target[key]:function(){call.method=key;window.calls.push(call)};
   }});
 }}};
 window.savedDraft=localStorage.getItem(STORAGE_KEY);""")
 page.locator('#loginUsername').fill('conta.ficticia');page.locator('#loginPassword').fill('senha-apenas-fixture')
 page.locator('#loginSubmit').click()
 assert run("window.calls.filter(c=>c.method==='loginAvante').length")==1
 expect(page.locator('#loginSubmit')).to_be_disabled()
 run("submitAvanteLogin('conta.ficticia','fixture')")
 assert run("window.calls.filter(c=>c.method==='loginAvante').length")==1
 page.clock.fast_forward(20001)
 expect(page.locator('#loginError')).to_contain_text('20 segundos')
 expect(page.locator('#loginSubmit')).to_be_enabled()
 assert page.locator('#loginForm').get_attribute('aria-busy') is None
 run("window.calls[0].success({ok:true,username:'atrasada',token:'fixture-atrasada'})")
 assert not run("document.body.classList.contains('authenticated')")
 assert run('localStorage.getItem(STORAGE_KEY)===window.savedDraft')
 # Recusa explícita e erro de comunicação liberam o formulário, sem repetir chamadas.
 page.locator('#loginSubmit').click();run("window.calls[1].success({ok:false,error:'Acesso recusado (fixture)'})")
 expect(page.locator('#loginError')).to_have_text('Acesso recusado (fixture)')
 page.locator('#loginSubmit').click();run('window.calls[2].failure(new Error("fixture"))')
 expect(page.locator('#loginError')).to_contain_text('comunicar')
 expect(page.locator('#loginSubmit')).to_be_enabled()
 # Recuperação sem resposta preserva token/rascunho; retorno antigo não substitui novo login.
 run("authSession={username:'sessao.ficticia',token:'fixture-antiga'};sessionStorage.setItem('avante_admin_session',JSON.stringify(authSession));validateStoredAvanteSession()")
 page.clock.fast_forward(20001)
 assert run("JSON.parse(sessionStorage.getItem('avante_admin_session')).token")=='fixture-antiga'
 page.locator('#loginSubmit').click()
 run("window.calls[3].success({ok:true})")
 assert not run("document.body.classList.contains('authenticated')")
 run("window.calls[4].success({ok:true,username:'conta.ficticia',token:'fixture-nova'})")
 assert run("document.body.classList.contains('authenticated')")
 assert run('authSession.token')=='fixture-nova'
 page.get_by_role('button',name='Fornecedores e setores',exact=True).click()
 assert run('activeProgramSection')=='network'
 page.get_by_role('button',name='Início',exact=True).click()
 assert run('activeProgramSection')=='overview'
 # Uma sessão explicitamente inválida é removida; exceção síncrona também libera o acesso.
 run("document.body.classList.remove('authenticated');validateStoredAvanteSession();window.calls[window.calls.length-1].success({ok:false})")
 assert run("sessionStorage.getItem('avante_admin_session')") is None
 expect(page.locator('#loginError')).to_contain_text('sessão expirou')
 run("window.google={script:{run:{withSuccessHandler(){throw new Error('transporte indisponível')}}}};submitAvanteLogin('fixture','fixture')")
 expect(page.locator('#loginSubmit')).to_be_enabled()
 expect(page.locator('#loginError')).to_contain_text('comunicar')
 assert not errors,errors
 print('Acesso: timeout, recusa, comunicação, exceção síncrona, descarte tardio, tentativa manual, sessão preservada e navegação após login aprovados; somente fixtures, sem rede.')
 browser.close()
