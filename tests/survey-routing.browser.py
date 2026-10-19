"""Conclusão da pesquisa: RPCs fictícias, sem dados/contatos reais ou rede."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright,expect
src=(Path(__file__).resolve().parents[1]/'Apps Script/Index.html').read_text().replace('})();\n</script>','window.__routingTest=code=>eval(code);\n})();\n</script>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.route('**/*',lambda r:r.fulfill(body=src,content_type='text/html') if r.request.url=='http://localhost/' else r.abort());page.goto('http://localhost/');page.clock.install()
 def run(s):return page.evaluate('(s)=>__routingTest(s)',s)
 run("document.body.classList.add('authenticated');authSession={username:'fixture',token:'fixture'};state=freshState();state.business.nome='Empresa fictícia';state.answers.negocioNome='Empresa fictícia';window.calls=[];window.google={script:{get run(){var call={};return new Proxy({withSuccessHandler(fn){call.success=fn;return this},withFailureHandler(fn){call.failure=fn;return this}},{get(target,key){return key in target?target[key]:function(){call.method=key;window.calls.push(call)}}})}}};showProgramSection('survey');currentStepIndex=activeConversationQuestions().length;renderCurrentStep()")
 # Recusa e comunicação mantêm rascunho e pesquisa; nenhuma navegação de sucesso.
 run('window.pending=submitSurveyDraft();void 0');run("calls[0].success({ok:false,responsesSaved:false,profilePublished:false,error:'Recusa fictícia'})")
 page.wait_for_function("__routingTest('state.meta.sendStatus')==='error'")
 assert run('activeProgramSection')=='survey'
 run('window.pending=submitSurveyDraft();void 0');run('calls[1].failure()')
 page.wait_for_function("__routingTest('state.meta.sendStatus')==='unknown'")
 assert run('activeProgramSection')=='survey'
 # Somente recibo explícito redireciona, mesmo quando não há autorização de publicação.
 run('window.pending=submitSurveyDraft();void 0');run("calls[2].success({ok:true,responsesSaved:true,responseId:'fixture-receipt',profilePublished:false})")
 page.wait_for_function("__routingTest('activeProgramSection')==='my-business'")
 assert not page.locator('#surveyWizard').is_visible()
 expect(page.locator('.my-business-page h1')).to_have_text('Empresa fictícia')
 expect(page.locator('.my-business-page [role=status]')).to_have_text('O perfil não foi publicado neste envio.')
 run("showProgramSection('survey')");assert run('activeProgramSection')=='my-business'
 run("showProgramSection('business-settings')");assert run('activeProgramSection')=='business-settings'
 # Recibo de simulação usa o mesmo fluxo visual, sem tocar o workspace real.
 run("window.realKey=STORAGE_KEY;window.realSaved=localStorage.getItem(realKey);STORAGE_KEY='fixture-simulation';state=freshState();state.meta.simulation=true;state.business.nome='Simulação fictícia';state.business.cnpj='00000000000000';showProgramSection('survey');window.pending=submitSurveyDraft();void 0")
 run("calls[calls.length-1].success({ok:true,responsesSaved:true,responseId:'fixture-sim',profilePublished:false,simulated:true})")
 page.wait_for_function("__routingTest('activeProgramSection')==='my-business'")
 expect(page.locator('.my-business-page [role=status]')).to_contain_text('SIMULAÇÃO')
 assert run('localStorage.getItem(realKey)===realSaved')
 # Outro navegador: confirmação da própria conta preenche apenas campos vazios.
 run("STORAGE_KEY='fixture-empty-browser';state=freshState();state.answers.indicacoes='Rascunho preservado';state.meta.sharePublicProfile=false;showProgramSection('overview');loadCompletedAvanteBusiness()")
 run("showProgramSection('survey')");assert run('activeProgramSection')=='business-status'
 run("calls[calls.length-1].success({ok:true,completed:true,responseId:'fixture-server',submittedAt:'2026-10-18T20:00:00Z',business:{nome:'Empresa recuperada fictícia',cnpj:'11222333000181',cidade:'Cidade fictícia'}})")
 assert run('activeProgramSection')=='my-business'
 assert run('state.answers.indicacoes')=='Rascunho preservado'
 assert run('state.meta.sharePublicProfile') is False
 run("showProgramSection('survey')");assert run('activeProgramSection')=='my-business'
 # Resposta de uma sessão anterior não é aplicada à conta atual.
 run("state=freshState();showProgramSection('overview');loadCompletedAvanteBusiness();window.oldCall=calls[calls.length-1];authSession={username:'another-fixture',token:'another'};oldCall.success({ok:true,completed:true,responseId:'old',business:{nome:'Não aplicar'}})")
 assert run('isBusinessRegistered()') is False
 # Timeout da consulta não abre a pesquisa nem provoca repetição automática.
 run("businessCompletionLookup='idle';state=freshState();showProgramSection('overview');loadCompletedAvanteBusiness();showProgramSection('survey');window.callsBeforeTimeout=calls.length")
 page.clock.fast_forward(20001)
 expect(page.get_by_role('button',name='Tentar novamente',exact=True)).to_be_visible()
 assert run('calls.length===callsBeforeTimeout')
 assert run('activeProgramSection')=='business-status'
 page.get_by_role('button',name='Tentar novamente',exact=True).click()
 run("calls[calls.length-1].success({ok:true,completed:false})")
 assert run('activeProgramSection')=='survey'
 assert not errors,errors
 print('Pesquisa: confirmação antes do redirecionamento, recusa/comunicação preservadas, perfil privado, bloqueio de reabertura, edição nas configurações, simulação e recuperação por conta aprovados; sem rede/gravação real.')
 b.close()
