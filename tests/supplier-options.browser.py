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
 run("document.body.classList.add('authenticated');authSession={username:'teste',token:'local-test'};isAppsScriptApp=()=>false;state=freshState();state.fornecedores.lista=[{empresa:'Fornecedor fictício',tipoEmpresa:'Confecção de roupas',categorias:[],itens:''}];findSharedCompanyBySelection=()=>null;window.testRoot=document.getElementById('platformContent');window.testRoot.innerHTML='';window.testRoot.appendChild(renderSupplierPurchases({options:CATEGORIA_INSUMOS_OPTS}));")
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
 print('Navegador: confecção, busca, tipo desconhecido, filtro estrito e catálogo cadastrado aprovados; sem requisições externas.')
 b.close()
