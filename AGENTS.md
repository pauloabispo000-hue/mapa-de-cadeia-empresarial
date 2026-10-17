# Instruções para agentes

- Use `Apps Script/Code.js`, `Apps Script/Index.html` e `Apps Script/appsscript.json` como fontes oficiais.
- Execute `npm run sync`, `npm run check` e `npm test` antes de enviar alterações.
- Preserve os recursos existentes e as restrições de privacidade em `DESENVOLVIMENTO.md`.
- Não edite cópias antigas fora deste repositório para entregar uma tarefa no GitHub.
- A publicação de produção ocorre pelo workflow em `main`, na implantação existente.
- Ao relatar publicação, confirme o resultado do workflow; push e implantação são etapas diferentes.
- Não publique dados pessoais ou comerciais privados, credenciais ou `.clasprc.json`.
- A alteração da automação deve manter verificações antes da escrita e a confirmação da versão publicada.

A continuidade do usuário é pelo ChatGPT/Codex. Consulte `CONTINUAR_NO_CHATGPT.md`.
Para preparar o ambiente Cloud, consulte `CODEX_CLOUD.md` e execute `bash scripts/cloud-setup.sh` com Node.js 22.
Ao terminar, informe claramente o resultado, a publicação e qualquer ação pendente do usuário.

## Autonomia na entrega

- Quando o usuário pedir implementar/corrigir e publicar, conclua a integração no main e acompanhe a publicação. Não encerre apenas com uma branch ou pedindo que ele abra/incorpore um PR.
- Use `npm run release` após registrar a alteração em commit. O comando valida, verifica que origin/main é ancestral do commit, envia HEAD ao main sem force e acompanha o workflow.
- Se optar por PR e sua criação falhar, registre o erro real (HTTP/mensagem, sem credenciais). Havendo autorização de publicação e permissão de push no main, use o comando acima. Não burle proteção de branch nem altere permissões de segurança.
- Se a ferramenta/API de PR falhar, não conclua que o Git também está bloqueado. Verifique as capacidades disponíveis. Se faltar acesso de escrita, informe precisamente a operação bloqueada.
- Uma tarefa que pede somente análise ou PR não autoriza publicar. Não envie credenciais Google ao ambiente Cloud; a publicação continua no GitHub Actions.
