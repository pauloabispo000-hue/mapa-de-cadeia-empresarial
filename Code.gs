/**
 * Base compartilhada do Mapa de Negócios.
 * O conteúdo de respostas e relações é privado na planilha. O GET público retorna
 * somente opções de empresas com autorização para aparecer no autocomplete e
 * indicadores agregados da rede.
 */
var SHEET_ID_PROPERTY = "MAPA_NEGOCIOS_SPREADSHEET_ID";
var RESPONSE_SHEET_NAME = "Respostas";
var OPTIONS_SHEET_NAME = "Opcoes";
var COMPANIES_SHEET_NAME = "Empresas";
var COMPANIES_HEADERS = ["Chave", "Nome principal", "CNPJ", "Nomes alternativos JSON", "Cidade", "Áreas JSON", "Ocorrências", "Primeiro registro", "Última atualização", "CNAE principal código", "CNAE principal descrição", "CNAEs secundários JSON"];
var RELATIONS_SHEET_NAME = "Relacoes";
var PUBLIC_PROFILES_SHEET_NAME = "PerfisPublicos";
var PENDING_PROFILES_SHEET_NAME = "PerfisPendentes";
var PROFILE_MEDIA_FOLDER_NAME = "Avante - imagens de perfis públicos";
var AVANTE_ADMIN_USER_PROPERTY = "AVANTE_ADMIN_USERNAME";
var AVANTE_ADMIN_SALT_PROPERTY = "AVANTE_ADMIN_PASSWORD_SALT";
var AVANTE_ADMIN_HASH_PROPERTY = "AVANTE_ADMIN_PASSWORD_HASH";
var AVANTE_SESSION_VERSION_PROPERTY = "AVANTE_SESSION_VERSION";
var AVANTE_USERS_SHEET_NAME = "ContasAvante";
var AVANTE_SETTINGS_SHEET_NAME = "ConfiguracoesPerfil";
var AREAS_12 = [
  "Alimentos/Medicamentos", "Transportes/Logísticas", "Habitações/Edificações",
  "Acompanhamentos/Assistências", "Saneamentos/Eliminações", "Educações/Pesquisas",
  "Informações/Comunicações", "Entretenimentos/Lazeres", "Políticas/Lideranças",
  "Seguranças/Confortos", "Matérias-primas/Reciclagens", "Energias/Combustíveis"
];

function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SHEET_ID_PROPERTY);
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create("Base compartilhada - Mapa de Negócios");
  props.setProperty(SHEET_ID_PROPERTY, ss.getId());
  ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON"]);
  ensureSheet_(ss, OPTIONS_SHEET_NAME, ["Campo", "Resposta", "Chave normalizada", "Área inferida", "Adicionada em", "Ocorrências"]);
  ensureCompaniesSheet_(ss);
  ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
  ensurePublicProfilesSheet_(ss);
  ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação"]);
  ensureAvanteUsersSheet_(ss);
  ensureCnaeRefreshTrigger_();
  return ss.getUrl();
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  if (String(params.app || "") === "1") {
    return HtmlService.createHtmlOutputFromFile("Index")
      .setTitle("Avante — conexões para o seu negócio")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }
  var profileCnpj = normalizeCnpj_(params.perfil || params.profile || "");
  var data = profileCnpj ? readPublicProfile_(profileCnpj) : { ok: true, options: readOptions_(), companies: readCompanies_(), network: summarizeNetwork_(), workforce: summarizeWorkforce_() };
  var callback = e && e.parameter ? String(e.parameter.callback || "") : "";
  var json = JSON.stringify(data);
  if (callback) {
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(callback)) {
      return ContentService.createTextOutput("invalid callback").setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** Consulta dados cadastrais públicos de CNPJ pela BrasilAPI, no servidor para evitar bloqueios do navegador. */
function lookupCompanyCnpj(value) {
  var cnpj = normalizeCnpj_(value);
  if (!validCnpj_(cnpj)) return { ok: false, error: "CNPJ inválido. Confira os 14 caracteres e os dígitos verificadores." };
  try {
    var response = UrlFetchApp.fetch("https://brasilapi.com.br/api/cnpj/v1/" + encodeURIComponent(cnpj), {
      method: "get", muteHttpExceptions: true, followRedirects: true,
      headers: { "Accept": "application/json" }
    });
    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      var detail = "";
      try { detail = String(JSON.parse(response.getContentText()).message || ""); } catch (ignored) {}
      return { ok: false, error: status === 404 ? "CNPJ não encontrado na base pública." : "A consulta pública falhou (HTTP " + status + "). " + detail };
    }
    var data = JSON.parse(response.getContentText());
    var result = { ok: true, dados: {
      razaoSocial: data.razao_social || "", nomeFantasia: data.nome_fantasia || "",
      municipio: data.municipio || "", uf: data.uf || "",
      situacao: data.descricao_situacao_cadastral || "", cnae: data.cnae_fiscal_descricao || "",
      cnaeCodigo: data.cnae_fiscal || "",
      cnaesSecundarios: (data.cnaes_secundarios || []).map(function(item) { return { codigo: item.codigo || "", descricao: item.descricao || "" }; }),
      fonte: "BrasilAPI (Dados Abertos do CNPJ)", consultadoEm: new Date().toISOString()
    } };
    CacheService.getScriptCache().put("MAPA_CNAE_LOOKUP_" + cnpj, JSON.stringify(result.dados), 300);
    return result;
  } catch (error) {
    return { ok: false, error: "Não foi possível acessar a consulta pública agora. " + String(error && error.message || error) };
  }
}

/** Persiste CNAEs obtidos da consulta oficial ao adicionar um fornecedor pela busca de CNPJ. */
function saveSupplierCnpjRecord(token, companyName, cnpjValue) {
  if (!getAvanteSessionUser_(String(token || ""))) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  return refreshAndSaveSupplierCnae_(companyName, cnpjValue);
}

/** Atualiza o CNAE de uma empresa já existente escolhida na lista de fornecedores. */
function refreshSupplierCnae(token, companyName, cnpjValue) {
  if (!getAvanteSessionUser_(String(token || ""))) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  return refreshAndSaveSupplierCnae_(companyName, cnpjValue);
}

/** Persiste os dados que a própria plataforma acabou de consultar na fonte pública. */
function persistSupplierCnaeLookup(token, companyName, cnpjValue) {
  if (!getAvanteSessionUser_(String(token || ""))) return { ok: false, error: "Acesso expirado." };
  var cnpj = normalizeCnpj_(cnpjValue);
  if (!validCnpj_(cnpj)) return { ok: false, error: "CNPJ inválido." };
  var cached = CacheService.getScriptCache().get("MAPA_CNAE_LOOKUP_" + cnpj);
  if (!cached) return refreshAndSaveSupplierCnae_(companyName, cnpj);
  var data;
  try { data = JSON.parse(cached); } catch (ignored) { return refreshAndSaveSupplierCnae_(companyName, cnpj); }
  if (!data.cnaeCodigo || !data.cnae) return { ok: false, error: "A consulta pública não retornou o CNAE principal." };
  var name = String(companyName || data.nomeFantasia || data.razaoSocial || "").trim();
  if (!name) return { ok: false, error: "Nome empresarial indisponível." };
  var city = [data.municipio, data.uf].filter(Boolean).join(" - "), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { saveCompanyCnaeData_(getSpreadsheet_(), name, cnpj, city, data); }
  finally { lock.releaseLock(); }
  return { ok: true, dados: data };
}

function refreshAndSaveSupplierCnae_(companyName, cnpjValue) {
  var cnpj = normalizeCnpj_(cnpjValue);
  if (!validCnpj_(cnpj)) return { ok: false, error: "CNPJ inválido." };
  var lookup = lookupCompanyCnpj(cnpj);
  if (!lookup.ok) return lookup;
  var data = lookup.dados, name = String(companyName || data.nomeFantasia || data.razaoSocial || "").trim();
  if (!name) return { ok: false, error: "A consulta não retornou o nome da empresa." };
  var city = [data.municipio, data.uf].filter(Boolean).join(" - ");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    saveCompanyCnaeData_(ss, name, cnpj, city, data);
  } finally { lock.releaseLock(); }
  return { ok: true, dados: data };
}

function saveCompanyCnaeData_(ss, name, cnpj, city, data) {
  var sheet = ensureCompaniesSheet_(ss);
  saveCompanies_(ss, { suppliers: { lista: [{ empresa: name, cnpj: cnpj, cidade: city, cnpjDados: data }] } }, new Date(), true);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var values = sheet.getRange(2, 1, last - 1, COMPANIES_HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeCnpj_(values[i][2]) !== cnpj) continue;
    sheet.getRange(i + 2, 10, 1, 3).setValues([[String(data.cnaeCodigo || ""), safeCell_(data.cnae || ""), JSON.stringify(normalizeCnaes_(data.cnaesSecundarios || []))]]);
    break;
  }
}

/** Completa até 12 CNPJs sem CNAE a cada seis horas; falhas voltam a ser tentadas no próximo ciclo. */
function refreshMissingCompanyCnaes() {
  var ss = getSpreadsheet_(), sheet = ensureCompaniesSheet_(ss), last = sheet.getLastRow();
  if (last < 2) return { checked: 0, updated: 0 };
  var values = sheet.getRange(2, 1, last - 1, COMPANIES_HEADERS.length).getValues();
  var pending = [];
  values.forEach(function(row, index) {
    var cnpj = normalizeCnpj_(row[2]);
    if (row[1] && validCnpj_(cnpj) && (!row[9] || !row[10])) pending.push({ row: index + 2, name: String(row[1]), cnpj: cnpj, city: String(row[4] || "") });
  });
  if (!pending.length) return { checked: 0, updated: 0 };
  var props = PropertiesService.getScriptProperties(), cursor = Number(props.getProperty("MAPA_NEGOCIOS_CNAE_REFRESH_CURSOR") || 0) % values.length;
  var batch = Math.min(12, pending.length), updated = 0, attempted = 0, scanned = 0;
  while (attempted < batch && scanned < values.length) {
    var rowIndex = (cursor + scanned) % values.length, row = values[rowIndex], cnpj = normalizeCnpj_(row[2]);
    scanned++;
    if (!row[1] || !validCnpj_(cnpj) || (row[9] && row[10])) continue;
    var item = { name: String(row[1]), cnpj: cnpj, city: String(row[4] || "") }, lookup = lookupCompanyCnpj(item.cnpj);
    attempted++;
    if (!lookup.ok || !lookup.dados.cnaeCodigo || !lookup.dados.cnae) continue;
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { saveCompanyCnaeData_(ss, item.name, item.cnpj, item.city, lookup.dados); updated++; }
    finally { lock.releaseLock(); }
  }
  props.setProperty("MAPA_NEGOCIOS_CNAE_REFRESH_CURSOR", String((cursor + scanned) % values.length));
  return { checked: attempted, updated: updated, remaining: pending.length - updated };
}

function ensureCnaeRefreshTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === "refreshMissingCompanyCnaes"; });
  if (!exists) ScriptApp.newTrigger("refreshMissingCompanyCnaes").timeBased().everyHours(6).create();
}

/** Executar uma vez no editor para o proprietário autorizar consultas externas da BrasilAPI. */
function authorizePublicCnpjLookup() {
  var response = UrlFetchApp.fetch("https://brasilapi.com.br/api/cnpj/v1/19131243000197", {
    method: "get", muteHttpExceptions: true, followRedirects: true,
    headers: { "Accept": "application/json" }
  });
  return "Permissão de consulta externa autorizada. Resposta da BrasilAPI: HTTP " + response.getResponseCode() + ".";
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var payload = JSON.parse(e && e.postData && e.postData.contents || "{}");
    if (!validateAvanteSession_(String(payload.authToken || ""))) {
      return jsonOutput_({ ok: false, error: "Acesso expirado. Entre novamente no Avante." });
    }
    var ss = getSpreadsheet_();
    ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON"]);
    ensureSheet_(ss, OPTIONS_SHEET_NAME, ["Campo", "Resposta", "Chave normalizada", "Área inferida", "Adicionada em", "Ocorrências"]);
    ensureCompaniesSheet_(ss);
    ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
    ensurePublicProfilesSheet_(ss);
    ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação"]);

    var responseId = Utilities.getUuid();
    var now = new Date();
    var b = payload.business || {};
    var storedPayload = JSON.parse(JSON.stringify(payload));
    delete storedPayload.authToken;
    if (storedPayload.publicProfile) { delete storedPayload.publicProfile.coverData; delete storedPayload.publicProfile.avatarData; }
    ss.getSheetByName(RESPONSE_SHEET_NAME).appendRow([
      now, responseId, safeCell_(b.nome), safeCell_(b.cnpj), safeCell_(b.cidade), safeCell_(b.areaNecessidade),
      safeCell_(JSON.stringify(storedPayload))
    ]);
    saveContributions_(ss, extractContributions_(payload));
    saveRelations_(ss, payload, responseId, now);
    // Guarda candidatos para a análise privada; readCompanies_ só expõe pares nome/CNPJ aprovados pelo administrador.
    saveCompanies_(ss, payload, now);
    savePendingPublicProfile_(ss, payload, responseId, now);
    return jsonOutput_({ ok: true, responseId: responseId });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Recebe alterações do perfil público como solicitação autenticada, sempre sujeita à revisão administrativa. */
function submitAvantePublicProfile(token, input) {
  if (!validateAvanteSession_(String(token || ""))) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  input = input || {};
  var business = input.business || {}, publicProfile = input.publicProfile || {};
  var cnpj = normalizeCnpj_(business.cnpj);
  var name = String(business.nome || "").trim();
  if (!validCnpj_(cnpj) || !name) return { ok: false, error: "O perfil precisa ter nome empresarial e CNPJ válidos." };
  if (publicProfile.consent !== true) return { ok: false, error: "Autorize a solicitação de publicação do perfil." };
  var ss = getSpreadsheet_(), now = new Date(), responseId = Utilities.getUuid();
  ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação"]);
  savePendingPublicProfile_(ss, { business: business, answers: input.answers || {}, publicProfile: publicProfile }, responseId, now);
  return { ok: true, responseId: responseId, message: "Solicitação enviada para validação administrativa." };
}

/** Persiste as respostas de pesquisa vinculadas à conta; os campos oficiais não são atualizados por esta operação. */
function saveAvanteProfileSettings(token, input) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  input = input || {};
  var cnpj = normalizeCnpj_(input.cnpj || "");
  var headers = ["Conta", "CNPJ", "Atualizado em", "Respostas JSON"];
  var sheet = ensureSheet_(getSpreadsheet_(), AVANTE_SETTINGS_SHEET_NAME, headers);
  var data = JSON.parse(JSON.stringify(input.data || {}));
  delete data.business;
  delete data.publicProfile;
  var row = [username, cnpj, new Date(), safeCell_(JSON.stringify(data))];
  var last = sheet.getLastRow(), target = 0;
  if (last > 1) {
    var keys = sheet.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === username && normalizeCnpj_(keys[i][1]) === cnpj) { target = i + 2; break; }
  }
  if (target) sheet.getRange(target, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  return { ok: true };
}

/** Executar manualmente no editor Apps Script uma única vez para criar o acesso inicial. */
function initializeAvanteAdmin() {
  assertAvanteOwner_();
  var props = PropertiesService.getScriptProperties();
  if (getAvanteAdminProperty_(AVANTE_ADMIN_HASH_PROPERTY, "AVANTE_ADMIN_HASH_PROPERTY")) {
    throw new Error("O acesso inicial já foi criado. Para trocar a senha, use resetAvanteAdminPassword no editor.");
  }
  var username = "admin.avante";
  var password = generateAvantePassword_();
  var salt = Utilities.getUuid() + Utilities.getUuid();
  var hash = hashAvantePassword_(salt, password), version = Utilities.getUuid();
  props.setProperty(AVANTE_ADMIN_USER_PROPERTY, username);
  props.setProperty(AVANTE_ADMIN_SALT_PROPERTY, salt);
  props.setProperty(AVANTE_ADMIN_HASH_PROPERTY, hash);
  props.setProperty(AVANTE_SESSION_VERSION_PROPERTY, version);
  var users = ensureAvanteUsersSheet_(getSpreadsheet_());
  if (!findAvanteUser_(users, username)) users.appendRow([username, salt, hash, version, new Date(), new Date()]);
  var credentials = { username: username, password: password, message: "Copie a senha agora. Ela não será exibida novamente." };
  console.log("Credenciais iniciais do Avante (copie agora e não compartilhe): " + JSON.stringify(credentials));
  return credentials;
}

/** Executar manualmente no editor Apps Script para invalidar acessos e gerar uma senha nova. */
function resetAvanteAdminPassword() {
  assertAvanteOwner_();
  var props = PropertiesService.getScriptProperties();
  if (!getAvanteAdminProperty_(AVANTE_ADMIN_HASH_PROPERTY, "AVANTE_ADMIN_HASH_PROPERTY")) throw new Error("O acesso inicial ainda não existe. Execute initializeAvanteAdmin.");
  var password = generateAvantePassword_();
  var salt = Utilities.getUuid() + Utilities.getUuid();
  var hash = hashAvantePassword_(salt, password), version = Utilities.getUuid();
  props.setProperty(AVANTE_ADMIN_SALT_PROPERTY, salt);
  props.setProperty(AVANTE_ADMIN_HASH_PROPERTY, hash);
  props.setProperty(AVANTE_SESSION_VERSION_PROPERTY, version);
  var adminUser = getAvanteAdminProperty_(AVANTE_ADMIN_USER_PROPERTY, "AVANTE_ADMIN_USER_PROPERTY") || "admin.avante";
  var users = ensureAvanteUsersSheet_(getSpreadsheet_()), row = findAvanteUser_(users, adminUser);
  if (row) users.getRange(row.row, 2, 1, 5).setValues([[salt, hash, version, row.createdAt || new Date(), new Date()]]);
  else users.appendRow([adminUser, salt, hash, version, new Date(), new Date()]);
  var credentials = { username: adminUser, password: password, message: "Copie a senha agora e não compartilhe." };
  console.log("Nova senha administrativa do Avante (copie agora e não compartilhe): " + JSON.stringify(credentials));
  return credentials;
}

/** Recuperação administrativa de conta quando a pessoa perdeu a senha. */
function resetAvanteUserPassword(username) {
  assertAvanteOwner_();
  var user = String(username || "").trim().toLowerCase();
  if (!user) throw new Error("Informe o nome da conta Avante.");
  var users = ensureAvanteUsersSheet_(getSpreadsheet_()), account = findAvanteUser_(users, user);
  if (!account) throw new Error("Conta Avante não encontrada.");
  var password = generateAvantePassword_(), salt = Utilities.getUuid() + Utilities.getUuid(), version = Utilities.getUuid();
  var hash = hashAvantePassword_(salt, password);
  users.getRange(account.row, 2, 1, 5).setValues([[salt, hash, version, account.createdAt || new Date(), new Date()]]);
  if (user === getAvanteAdminProperty_(AVANTE_ADMIN_USER_PROPERTY, "AVANTE_ADMIN_USER_PROPERTY")) {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(AVANTE_ADMIN_SALT_PROPERTY, salt);
    props.setProperty(AVANTE_ADMIN_HASH_PROPERTY, hash);
    props.setProperty(AVANTE_SESSION_VERSION_PROPERTY, version);
  }
  var credentials = { username: user, password: password, message: "Entregue a senha por canal privado e peça à pessoa para alterá-la ao entrar." };
  console.log("Senha temporária da conta Avante " + user + ": " + password);
  return credentials;
}

function assertAvanteOwner_() {
  var activeEmail = String(Session.getActiveUser().getEmail() || "").trim();
  var effectiveEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (!activeEmail || activeEmail !== effectiveEmail) throw new Error("Execute esta função manualmente no editor Apps Script, conectado à conta proprietária do projeto.");
}

function loginAvante(username, password) {
  var props = PropertiesService.getScriptProperties();
  var user = String(username || "").trim().toLowerCase();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var attemptsKey = "avante-login-attempts-" + hashAvanteToken_(user).slice(0, 32);
    var attempts = Number(cache.get(attemptsKey) || 0);
    if (attempts >= 8) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    var users = ensureAvanteUsersSheet_(getSpreadsheet_());
    var account = findAvanteUser_(users, user);
    // Migra a conta administrativa legada para o cadastro de contas na primeira entrada.
    var legacyUser = getAvanteAdminProperty_(AVANTE_ADMIN_USER_PROPERTY, "AVANTE_ADMIN_USER_PROPERTY");
    var legacySalt = getAvanteAdminProperty_(AVANTE_ADMIN_SALT_PROPERTY, "AVANTE_ADMIN_SALT_PROPERTY");
    var legacyHash = getAvanteAdminProperty_(AVANTE_ADMIN_HASH_PROPERTY, "AVANTE_ADMIN_HASH_PROPERTY");
    if (!account && user && user === legacyUser && legacyHash && hashAvantePassword_(legacySalt, String(password || "")) === legacyHash) {
      var legacyVersion = String(props.getProperty(AVANTE_SESSION_VERSION_PROPERTY) || Utilities.getUuid());
      users.appendRow([legacyUser, legacySalt, legacyHash, legacyVersion, new Date(), new Date()]);
      account = findAvanteUser_(users, user);
    }
    if (!account || hashAvantePassword_(account.salt, String(password || "")) !== account.hash) {
      cache.put(attemptsKey, String(attempts + 1), 600);
      return { ok: false, error: "Usuário ou senha incorretos." };
    }
    cache.remove(attemptsKey);
    return createAvanteSession_(account.username, account.version);
  } finally {
    lock.releaseLock();
  }
}

function registerAvanteUser(username, password) {
  var user = String(username || "").trim().toLowerCase(), pass = String(password || "");
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(user)) return { ok: false, error: "Use um nome de usuário de 3 a 32 caracteres: letras sem acento, números, ponto, hífen ou sublinhado." };
  if (user === "admin.avante") return { ok: false, error: "Esse nome de usuário é reservado." };
  if (pass.length < 12 || pass.length > 128) return { ok: false, error: "A senha precisa ter entre 12 e 128 caracteres." };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = ensureAvanteUsersSheet_(getSpreadsheet_());
    if (findAvanteUser_(users, user)) return { ok: false, error: "Esse nome de usuário já está em uso." };
    var salt = Utilities.getUuid() + Utilities.getUuid(), version = Utilities.getUuid();
    users.appendRow([user, salt, hashAvantePassword_(salt, pass), version, new Date(), new Date()]);
    return createAvanteSession_(user, version);
  } finally {
    lock.releaseLock();
  }
}

function changeAvantePassword(token, currentPassword, newPassword) {
  var user = getAvanteSessionUser_(String(token || ""));
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  var oldPass = String(currentPassword || ""), newPass = String(newPassword || "");
  if (newPass.length < 12 || newPass.length > 128) return { ok: false, error: "A nova senha precisa ter entre 12 e 128 caracteres." };
  if (oldPass === newPass) return { ok: false, error: "Escolha uma senha diferente da atual." };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = ensureAvanteUsersSheet_(getSpreadsheet_()), account = findAvanteUser_(users, user);
    if (!account || hashAvantePassword_(account.salt, oldPass) !== account.hash) return { ok: false, error: "A senha atual está incorreta." };
    var salt = Utilities.getUuid() + Utilities.getUuid(), version = Utilities.getUuid();
    users.getRange(account.row, 2, 1, 5).setValues([[salt, hashAvantePassword_(salt, newPass), version, account.createdAt || new Date(), new Date()]]);
    if (user === getAvanteAdminProperty_(AVANTE_ADMIN_USER_PROPERTY, "AVANTE_ADMIN_USER_PROPERTY")) {
      var props = PropertiesService.getScriptProperties();
      props.setProperty(AVANTE_ADMIN_SALT_PROPERTY, salt);
      props.setProperty(AVANTE_ADMIN_HASH_PROPERTY, hashAvantePassword_(salt, newPass));
      props.setProperty(AVANTE_SESSION_VERSION_PROPERTY, version);
    }
    return createAvanteSession_(user, version);
  } finally {
    lock.releaseLock();
  }
}

function validateAvanteSession(token) {
  var valid = validateAvanteSession_(String(token || ""));
  return { ok: valid };
}

function logoutAvante(token) {
  if (token) CacheService.getScriptCache().remove("avante-session-" + hashAvanteToken_(String(token)));
  return { ok: true };
}

function validateAvanteSession_(token) {
  if (!token || token.length < 50) return false;
  return !!getAvanteSessionUser_(token);
}

function createAvanteSession_(username, version) {
  var token = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("avante-session-" + hashAvanteToken_(token), username + "|" + version, 21600);
  return { ok: true, username: username, token: token, expiresIn: 21600 };
}

function getAvanteSessionUser_(token) {
  if (!token || token.length < 50) return "";
  var cached = CacheService.getScriptCache().get("avante-session-" + hashAvanteToken_(token));
  if (!cached) return "";
  var parts = cached.split("|"), users = ensureAvanteUsersSheet_(getSpreadsheet_()), account = findAvanteUser_(users, parts[0]);
  return account && account.version === parts[1] ? account.username : "";
}

function ensureAvanteUsersSheet_(ss) {
  return ensureSheet_(ss, AVANTE_USERS_SHEET_NAME, ["Usuário", "Sal", "Hash da senha", "Versão de sessão", "Criada em", "Atualizada em"]);
}

function getAvanteAdminProperty_(key, legacyKey) {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty(key) || props.getProperty(legacyKey) || "");
}

function findAvanteUser_(sheet, username) {
  var last = sheet.getLastRow(), normalized = String(username || "").trim().toLowerCase();
  if (last < 2) return null;
  var rows = sheet.getRange(2, 1, last - 1, 6).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0] || "").trim().toLowerCase() === normalized) {
    return { row: i + 2, username: String(rows[i][0]), salt: String(rows[i][1]), hash: String(rows[i][2]), version: String(rows[i][3]), createdAt: rows[i][4] };
  }
  return null;
}

function hashAvantePassword_(salt, password) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + password, Utilities.Charset.UTF_8));
}

function hashAvanteToken_(token) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8));
}

function generateAvantePassword_() {
  return (Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "")).slice(0, 24);
}

function extractContributions_(payload) {
  var rows = [];
  var seen = {};
  function add(field, value, area) {
    field = String(field || "").trim(); value = String(value || "").trim();
    if (!field || !value) return;
    var key = field + "::" + normalize_(value);
    if (seen[key]) return;
    seen[key] = true;
    rows.push([field, value, key, String(area || ""), new Date(), 1]);
  }
  (Array.isArray(payload.contributions) ? payload.contributions : []).forEach(function(item) {
    if (item) add(item.field, item.value, item.area);
  });
  var registry = payload.contributedOptions || {};
  Object.keys(registry).forEach(function(field) {
    (Array.isArray(registry[field]) ? registry[field] : []).forEach(function(value) { add(field, value, ""); });
  });
  return rows;
}

function saveContributions_(ss, additions) {
  if (!additions.length) return;
  var sheet = ss.getSheetByName(OPTIONS_SHEET_NAME);
  var last = sheet.getLastRow(), existing = {};
  if (last > 1) sheet.getRange(2, 1, last - 1, 6).getValues().forEach(function(row, index) { existing[String(row[2])] = index + 2; });
  additions.forEach(function(row) {
    var rowNumber = existing[row[2]];
    if (rowNumber) {
      var count = Number(sheet.getRange(rowNumber, 6).getValue() || 1);
      sheet.getRange(rowNumber, 6).setValue(count + 1);
      if (row[3] && !sheet.getRange(rowNumber, 4).getValue()) sheet.getRange(rowNumber, 4).setValue(safeCell_(row[3]));
    } else {
      row[1] = safeCell_(row[1]);
      sheet.appendRow(row);
      existing[row[2]] = sheet.getLastRow();
    }
  });
}

function readOptions_() {
  var ss = getSpreadsheet_();
  var sheet = ensureSheet_(ss, OPTIONS_SHEET_NAME, ["Campo", "Resposta", "Chave normalizada", "Área inferida", "Adicionada em", "Ocorrências"]);
  var result = {}, last = sheet.getLastRow();
  if (last < 2) return result;
  sheet.getRange(2, 1, last - 1, 6).getValues().forEach(function(row) {
    var field = String(row[0] || "").trim(), value = String(row[1] || "").trim();
    if (!field || !value) return;
    result[field] = result[field] || [];
    result[field].push({ value: value, area: String(row[3] || ""), count: Number(row[5] || 1) });
  });
  return result;
}

function saveCompanies_(ss, payload, now, skipOccurrenceCount) {
  var sheet = ensureCompaniesSheet_(ss);
  var rows = [], b = payload.business || {};
  addCompanyCandidate_(rows, b.nome, b.cnpj, b.cidade, b.areaNecessidade, b.cnpjDados);
  ["suppliers", "customers", "complementary"].forEach(function(key) {
    var group = payload[key] || {};
    (Array.isArray(group.lista) ? group.lista : []).forEach(function(entity) {
      var inferredArea = key === "suppliers" ? inferArea_(entity.categorias || entity.itens) : "";
      addCompanyCandidate_(rows, entity.empresa, entity.cnpj, entity.cidade, entity.areaNecessidade || inferredArea, entity.cnpjDados);
    });
  });
  var last = sheet.getLastRow(), existing = {};
  if (last > 1) sheet.getRange(2, 1, last - 1, COMPANIES_HEADERS.length).getValues().forEach(function(row, index) { existing[String(row[0])] = index + 2; });
  rows.forEach(function(candidate) {
    var rowNo = existing[candidate.key];
    if (rowNo) {
      var old = sheet.getRange(rowNo, 1, 1, COMPANIES_HEADERS.length).getValues()[0];
      var aliases = parseJsonArray_(old[3]);
      if (normalize_(old[1]) !== normalize_(candidate.name) && aliases.indexOf(candidate.name) < 0) aliases.push(candidate.name);
      var areas = parseJsonArray_(old[5]);
      candidate.areas.forEach(function(area) { if (areas.indexOf(area) < 0) areas.push(area); });
      var secondary = mergeCnaes_(parseJsonArray_(old[11]), candidate.secondaryCnaes);
      sheet.getRange(rowNo, 2, 1, 11).setValues([[
        safeCell_(old[1] || candidate.name), old[2] || candidate.cnpj, JSON.stringify(aliases), safeCell_(old[4] || candidate.city),
        JSON.stringify(areas), Number(old[6] || 0) + (skipOccurrenceCount ? 0 : 1), old[7] || now, now,
        old[9] || candidate.cnaeCodigo, old[10] || safeCell_(candidate.cnae), JSON.stringify(secondary)
      ]]);
    } else {
      sheet.appendRow([candidate.key, safeCell_(candidate.name), candidate.cnpj, JSON.stringify([]), safeCell_(candidate.city),
        JSON.stringify(candidate.areas), skipOccurrenceCount ? 0 : 1, now, now, candidate.cnaeCodigo, safeCell_(candidate.cnae), JSON.stringify(candidate.secondaryCnaes)]);
      existing[candidate.key] = sheet.getLastRow();
    }
  });
}

function readPublicProfile_(cnpj) {
  if (!validCnpj_(cnpj)) return { ok: false, error: "Perfil não encontrado." };
  var sheet = ensurePublicProfilesSheet_(getSpreadsheet_());
  var last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: "Perfil não encontrado." };
  var rows = sheet.getRange(2, 1, last - 1, 11).getValues();
  for (var i = 0; i < rows.length; i++) if (normalizeCnpj_(rows[i][0]) === cnpj && String(rows[i][10] || "").indexOf("APROVADO") === 0) {
    return { ok: true, profile: { cnpj: cnpj, name: String(rows[i][1] || ""), country: String(rows[i][2] || ""), city: String(rows[i][3] || ""), areas: parseJsonArray_(rows[i][4]), offers: parseJsonArray_(rows[i][5]), description: String(rows[i][6] || ""), coverUrl: String(rows[i][7] || ""), avatarUrl: String(rows[i][8] || "") } };
  }
  return { ok: false, error: "Perfil não encontrado." };
}

function ensurePublicProfilesSheet_(ss) {
  var headers = ["CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "Capa URL", "Avatar URL", "Atualizado em", "Validação administrativa"];
  var sheet = ensureSheet_(ss, PUBLIC_PROFILES_SHEET_NAME, headers);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 11).setValue(headers[10]);
  return sheet;
}

function savePendingPublicProfile_(ss, payload, responseId, now) {
  var input = payload.publicProfile || {}, b = payload.business || {};
  var sheet = ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação"]);
  var cnpj = normalizeCnpj_(b.cnpj);
  if (input.consent !== true || !validCnpj_(cnpj) || !String(b.nome || "").trim()) return;
  var coverId = input.coverData ? saveProfileImage_(input.coverData, cnpj + "-capa") : "";
  var avatarId = input.avatarData ? saveProfileImage_(input.avatarData, cnpj + "-perfil") : "";
  var offers = (payload.answers && payload.answers.produtosSelecionados) || b.produtoCategorias || [];
  offers = Array.isArray(offers) ? offers.map(function(value) { return String(value).trim(); }).filter(Boolean).slice(0, 80) : [];
  var areas = String(b.areaNecessidade || "").split(/[·,]/).map(function(value) { return value.trim(); }).filter(function(value) { return AREAS_12.indexOf(value) >= 0; });
  sheet.appendRow([now, cnpj, safeCell_(String(b.nome).trim().slice(0, 160)), safeCell_(String(b.pais || "").slice(0, 80)), safeCell_(String(b.cidade || "").slice(0, 120)), JSON.stringify(areas), JSON.stringify(offers), safeCell_(String(b.produtoDetalhe || "").slice(0, 1500)), coverId, avatarId, responseId, "AGUARDANDO REVISÃO"]);
}

function saveProfileImage_(dataUrl, filename) {
  var match = String(dataUrl || "").match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 1400000) throw new Error("Imagem inválida ou maior que 1 MB. Reduza a imagem e tente novamente.");
  var folder = getProfileMediaFolder_();
  var mime = "image/" + match[1];
  var blob = Utilities.newBlob(Utilities.base64Decode(match[2]), mime, filename + "." + match[1]);
  var file = folder.createFile(blob);
  return file.getId();
}

// Aprovação deliberada pelo administrador no editor Apps Script, após conferir a titularidade.
// Esta função não é chamada por doGet/doPost e não existe uma operação pública para aprovar.
function approvePublicProfile(cnpj) {
  cnpj = normalizeCnpj_(cnpj);
  if (!validCnpj_(cnpj)) throw new Error("Informe um CNPJ válido.");
  var ss = getSpreadsheet_();
  var pending = ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação"]);
  var pendingRows = pending.getLastRow() > 1 ? pending.getRange(2, 1, pending.getLastRow() - 1, 12).getValues() : [];
  var selected = null, selectedRow = 0;
  for (var i = pendingRows.length - 1; i >= 0; i--) if (normalizeCnpj_(pendingRows[i][1]) === cnpj && String(pendingRows[i][11]) === "AGUARDANDO REVISÃO") { selected = pendingRows[i]; selectedRow = i + 2; break; }
  if (!selected) throw new Error("Não há solicitação pendente para este CNPJ.");
  var coverUrl = publishProfileImage_(selected[8]), avatarUrl = publishProfileImage_(selected[9]);
  var profiles = ensurePublicProfilesSheet_(ss);
  var profileRow = 0, oldRows = profiles.getLastRow() > 1 ? profiles.getRange(2, 1, profiles.getLastRow() - 1, 11).getValues() : [];
  for (var j = 0; j < oldRows.length; j++) if (normalizeCnpj_(oldRows[j][0]) === cnpj) { profileRow = j + 2; break; }
  var publicRow = [cnpj, selected[2], selected[3], selected[4], selected[5], selected[6], selected[7], coverUrl, avatarUrl, new Date(), "APROVADO — " + new Date().toISOString()];
  if (profileRow) profiles.getRange(profileRow, 1, 1, 11).setValues([publicRow]); else profiles.appendRow(publicRow);
  pending.getRange(selectedRow, 12).setValue("APROVADO — " + new Date().toISOString());
  return "Perfil publicado para CNPJ " + cnpj + ".";
}

function publishProfileImage_(fileId) {
  fileId = String(fileId || "").trim();
  if (!fileId) return "";
  var file = DriveApp.getFileById(fileId);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600";
}

function unpublishPublicProfile(cnpj) {
  cnpj = normalizeCnpj_(cnpj);
  if (!validCnpj_(cnpj)) throw new Error("Informe um CNPJ válido.");
  var sheet = ensurePublicProfilesSheet_(getSpreadsheet_());
  if (sheet.getLastRow() < 2) return "Nenhum perfil publicado.";
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  for (var i = rows.length - 1; i >= 0; i--) if (normalizeCnpj_(rows[i][0]) === cnpj) {
    [rows[i][7], rows[i][8]].forEach(function(url) { var match = String(url || "").match(/[?&]id=([\w-]+)/); if (match) try { DriveApp.getFileById(match[1]).setTrashed(true); } catch (ignored) {} });
    sheet.deleteRow(i + 2); return "Perfil despublicado para CNPJ " + cnpj + ".";
  }
  return "Perfil não encontrado.";
}

function getProfileMediaFolder_() {
  var folders = DriveApp.getFoldersByName(PROFILE_MEDIA_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PROFILE_MEDIA_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
  return folder;
}

function addCompanyCandidate_(rows, name, cnpj, city, area, cnpjDados) {
  name = String(name || "").trim();
  cnpj = normalizeCnpj_(cnpj);
  if (!name) return;
  if (!validCnpj_(cnpj)) cnpj = "";
  var key = cnpj.length === 14 ? "cnpj:" + cnpj : "name:" + normalize_(name) + "|" + normalize_(city || "");
  var candidate = rows.filter(function(item) { return item.key === key; })[0];
  var data = cnpjDados || {};
  if (!candidate) { candidate = { key: key, name: name, cnpj: cnpj, city: String(city || ""), areas: [], cnaeCodigo: String(data.cnaeCodigo || ""), cnae: String(data.cnae || ""), secondaryCnaes: normalizeCnaes_(data.cnaesSecundarios || data.secondaryCnaes || []) }; rows.push(candidate); }
  else {
    if (!candidate.cnaeCodigo) candidate.cnaeCodigo = String(data.cnaeCodigo || "");
    if (!candidate.cnae) candidate.cnae = String(data.cnae || "");
    candidate.secondaryCnaes = mergeCnaes_(candidate.secondaryCnaes, data.cnaesSecundarios || data.secondaryCnaes || []);
  }
  if (area && AREAS_12.indexOf(String(area)) >= 0 && candidate.areas.indexOf(String(area)) < 0) candidate.areas.push(String(area));
}

function readCompanies_() {
  var ss = getSpreadsheet_();
  var sheet = ensureCompaniesSheet_(ss);
  var last = sheet.getLastRow(), result = [];
  if (last < 2) return result;
  sheet.getRange(2, 1, last - 1, COMPANIES_HEADERS.length).getValues().forEach(function(row) {
    if (!row[1]) return;
    var cnpj = normalizeCnpj_(row[2]);
    if (!validCnpj_(cnpj) || !isCompanyDirectoryApproved_(cnpj)) return;
    var secondary = parseJsonArray_(row[11]);
    result.push({ name: String(row[1]), cnpj: cnpj, aliases: parseJsonArray_(row[3]), city: String(row[4] || ""), areas: parseJsonArray_(row[5]), count: Number(row[6] || 1), cnaeCodigo: String(row[9] || ""), cnae: String(row[10] || ""), cnaesSecundarios: secondary, cnpjDados: { cnaeCodigo: String(row[9] || ""), cnae: String(row[10] || ""), cnaesSecundarios: secondary } });
  });
  result.sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  return result;
}

function isCompanyDirectoryApproved_(cnpj) {
  var list = PropertiesService.getScriptProperties().getProperty("MAPA_NEGOCIOS_VERIFIED_PUBLIC_CNPJS") || "[]";
  try { return JSON.parse(list).indexOf(String(cnpj)) >= 0; } catch (ignored) { return false; }
}

// Admin-only curation: call after checking the official name/CNPJ pair in a reliable registry.
function approveCompanyDirectoryEntry(cnpj) {
  cnpj = normalizeCnpj_(cnpj);
  if (!validCnpj_(cnpj)) throw new Error("Informe um CNPJ válido.");
  var sheet = ensureCompaniesSheet_(getSpreadsheet_());
  var last = sheet.getLastRow(), found = false;
  if (last > 1) sheet.getRange(2, 1, last - 1, COMPANIES_HEADERS.length).getValues().forEach(function(row) { if (normalizeCnpj_(row[2]) === cnpj && row[1]) found = true; });
  if (!found) throw new Error("CNPJ não encontrado na aba Empresas.");
  var props = PropertiesService.getScriptProperties(), key = "MAPA_NEGOCIOS_VERIFIED_PUBLIC_CNPJS", list = [];
  try { list = JSON.parse(props.getProperty(key) || "[]"); } catch (ignored) {}
  if (list.indexOf(cnpj) < 0) list.push(cnpj);
  props.setProperty(key, JSON.stringify(list));
  return "Par nome/CNPJ autorizado para o diretório público: " + cnpj;
}

function removeCompanyDirectoryEntry(cnpj) {
  cnpj = normalizeCnpj_(cnpj);
  var props = PropertiesService.getScriptProperties(), key = "MAPA_NEGOCIOS_VERIFIED_PUBLIC_CNPJS", list = [];
  try { list = JSON.parse(props.getProperty(key) || "[]"); } catch (ignored) {}
  props.setProperty(key, JSON.stringify(list.filter(function(value) { return value !== cnpj; })));
  return "CNPJ removido do diretório público: " + cnpj;
}

function saveRelations_(ss, payload, responseId, now) {
  var b = payload.business || {}, rows = [];
  function add(groupKey, relation, records) {
    var group = payload[groupKey] || {}, list = Array.isArray(group.lista) ? group.lista : [];
    list.forEach(function(entity) {
      var name = String(entity.empresa || "").trim();
      if (!name) return;
      var areas = [];
      if (relation === "fornecedor") (entity.categorias || []).forEach(function(value) {
        var area = inferArea_(value);
        if (area && areas.indexOf(area) < 0) areas.push(area);
      });
      var explicitArea = String(entity.areaNecessidade || "");
      if (AREAS_12.indexOf(explicitArea) >= 0 && areas.indexOf(explicitArea) < 0) areas.push(explicitArea);
      rows.push([responseId, now, safeCell_(b.nome), safeCell_(b.cnpj), safeCell_(name), safeCell_(entity.cnpj), relation,
        JSON.stringify(areas), safeCell_(JSON.stringify(entity))]);
    });
  }
  add("suppliers", "fornecedor", rows);
  add("customers", "cliente", rows);
  add("complementary", "complementar", rows);
  if (rows.length) ss.getSheetByName(RELATIONS_SHEET_NAME).getRange(ss.getSheetByName(RELATIONS_SHEET_NAME).getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

function summarizeNetwork_() {
  var ss = getSpreadsheet_();
  var rel = ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
  var companies = ensureCompaniesSheet_(ss);
  var last = rel.getLastRow(), areaCounts = {}, edgeKeys = {}, nodes = {}, adjacency = {};
  AREAS_12.forEach(function(area) { areaCounts[area] = 0; });
  if (last > 1) rel.getRange(2, 1, last - 1, 9).getValues().forEach(function(row) {
    var from = nodeKey_(row[3], row[2]), to = nodeKey_(row[5], row[4]);
    if (from) nodes[from] = true;
    if (to) nodes[to] = true;
    if (from && to) {
      edgeKeys[from + "->" + to + ":" + row[6]] = true;
      var sourceNode = from, relatedNode = to;
      var edgeFrom = row[6] === "fornecedor" ? relatedNode : sourceNode;
      var edgeTo = row[6] === "fornecedor" ? sourceNode : relatedNode;
      if (row[6] === "fornecedor" || row[6] === "cliente") {
        adjacency[edgeFrom] = adjacency[edgeFrom] || {};
        adjacency[edgeFrom][edgeTo] = true;
      }
    }
    if (row[6] === "fornecedor") parseJsonArray_(row[7]).forEach(function(area) { if (areaCounts.hasOwnProperty(area)) areaCounts[area]++; });
  });
  var twoStep = {}, twoStepCount = 0, closed = 0;
  Object.keys(adjacency).forEach(function(start) {
    Object.keys(adjacency[start]).forEach(function(middle) {
      Object.keys(adjacency[middle] || {}).forEach(function(end) {
        if (start === end) return;
        var key = start + "->" + end;
        if (twoStep[key]) return;
        twoStep[key] = true; twoStepCount++;
        if (adjacency[start][end]) closed++;
      });
    });
  });
  var companyCount = Math.max(0, companies.getLastRow() - 1);
  return {
    companies: companyCount,
    relationships: Object.keys(edgeKeys).length,
    mappedBusinesses: Object.keys(nodes).length,
    twoStepChains: twoStepCount,
    confirmedClosures: closed,
    potentialConnections: Math.max(0, twoStepCount - closed),
    areas: AREAS_12.map(function(area) { return { name: area, knownSupplierLinks: areaCounts[area] }; })
  };
}

// Mantém somente totais agregados da mão de obra declarada por negócio.
// Nenhum dado individual ou função/cargo é exposto pelo endpoint público.
function summarizeWorkforce_() {
  var ss = getSpreadsheet_();
  var sheet = ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON"]);
  var last = sheet.getLastRow(), active = 0, vacancies = 0, businessesReported = 0;
  if (last > 1) sheet.getRange(2, 7, last - 1, 1).getValues().forEach(function(row) {
    try {
      var payload = JSON.parse(String(row[0] || "{}"));
      var answers = payload.answers || {};
      var hasActive = answers.workforceActive !== "" && answers.workforceActive !== null && answers.workforceActive !== undefined;
      var hasVacancies = answers.workforceVacancies !== "" && answers.workforceVacancies !== null && answers.workforceVacancies !== undefined;
      if (!hasActive && !hasVacancies) return;
      active += Math.max(0, Number(answers.workforceActive) || 0);
      vacancies += Math.max(0, Number(answers.workforceVacancies) || 0);
      businessesReported++;
    } catch (ignored) {}
  });
  return { active: active, vacancies: vacancies, businessesReported: businessesReported };
}

function nodeKey_(cnpj, name) {
  var digits = normalizeCnpj_(cnpj);
  if (validCnpj_(digits)) return "cnpj:" + digits;
  return "name:" + normalize_(name);
}

function normalizeCnpj_(value) { return String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14); }

function validCnpj_(value) {
  var s = normalizeCnpj_(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(s) || /^(.)\1{13}$/.test(s)) return false;
  function digit(base, weights) {
    var sum = 0;
    for (var i = 0; i < weights.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i];
    var rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  }
  return digit(s.substring(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) === Number(s.charAt(12)) &&
    digit(s.substring(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === Number(s.charAt(13));
}

function inferArea_(values) {
  var text = normalize_(Array.isArray(values) ? values.join(" ") : values);
  var rules = [
    ["Alimentos/Medicamentos", ["alimento", "comida", "bebida", "farinha", "medicamento", "remedio", "agro"]],
    ["Transportes/Logísticas", ["frete", "entrega", "transporte", "combustivel", "embalagem", "logistica"]],
    ["Habitações/Edificações", ["obra", "construcao", "reforma", "imovel", "moveis", "pintura"]],
    ["Acompanhamentos/Assistências", ["medico", "saude", "terapia", "dentista", "veterinario", "consulta"]],
    ["Saneamentos/Eliminações", ["limpeza", "higiene", "residuo", "lixo", "saneamento"]],
    ["Educações/Pesquisas", ["curso", "aula", "ensino", "escola", "treinamento", "pesquisa"]],
    ["Informações/Comunicações", ["internet", "software", "computador", "publicidade", "marketing", "comunicacao"]],
    ["Entretenimentos/Lazeres", ["turismo", "evento", "festa", "hotel", "esporte", "lazer"]],
    ["Políticas/Lideranças", ["advogado", "contabilidade", "imposto", "consultoria", "gestao", "financeiro"]],
    ["Seguranças/Confortos", ["seguranca", "roupa", "vestuario", "beleza", "estetica", "seguro"]],
    ["Matérias-primas/Reciclagens", ["materia prima", "metal", "madeira", "reciclagem", "maquina", "quimico"]],
    ["Energias/Combustíveis", ["energia", "eletricidade", "eletrica", "gas", "solar", "combustivel"]]
  ];
  for (var i = 0; i < rules.length; i++) {
    for (var j = 0; j < rules[i][1].length; j++) if (text.indexOf(normalize_(rules[i][1][j])) >= 0) return rules[i][0];
  }
  return "";
}

/** Reprocessa relações de respostas antigas sem expor essas empresas no autocomplete. */
function rebuildPrivateNetwork() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    var response = ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON"]);
    var rel = ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
    var last = response.getLastRow();
    if (last < 2) return "Nenhuma resposta para reprocessar; a aba Relacoes não foi alterada.";

    // Valida todos os registros antes de tocar nas relações existentes.
    var responses = response.getRange(2, 1, last - 1, 7).getValues().map(function(row, index) {
      var payload;
      try { payload = JSON.parse(String(row[6] || "{}")); }
      catch (e) { throw new Error("Resposta na linha " + (index + 2) + " contém JSON inválido. Nenhuma relação foi alterada."); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Resposta na linha " + (index + 2) + " não contém um objeto JSON. Nenhuma relação foi alterada.");
      }
      return { payload: payload, id: row[1], receivedAt: row[0] };
    });

    // Guarda uma cópia da aba antes da reconstrução, caso seja preciso restaurar.
    var backupName = "";
    if (rel.getLastRow() > 1) {
      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
      backupName = "Relacoes_backup_" + stamp;
      var suffix = 2;
      while (ss.getSheetByName(backupName)) backupName = "Relacoes_backup_" + stamp + "_" + suffix++;
      rel.copyTo(ss).setName(backupName);
    }

    if (rel.getLastRow() > 1) rel.getRange(2, 1, rel.getLastRow() - 1, 9).clearContent();
    responses.forEach(function(item) { saveRelations_(ss, item.payload, item.id, item.receivedAt); });
    return "Relações reconstruídas a partir de " + responses.length + " respostas." +
      (backupName ? " Cópia anterior preservada na aba " + backupName + "." : "") +
      " Empresas antigas não foram publicadas no autocomplete sem autorização registrada.";
  } finally {
    lock.releaseLock();
  }
}

function parseJsonArray_(value) {
  try { var parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(SHEET_ID_PROPERTY);
  if (id) return SpreadsheetApp.openById(id);
  var url = setup();
  return SpreadsheetApp.openByUrl(url);
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) { sheet.appendRow(headers); sheet.setFrozenRows(1); }
  return sheet;
}

function ensureCompaniesSheet_(ss) {
  var sheet = ensureSheet_(ss, COMPANIES_SHEET_NAME, COMPANIES_HEADERS);
  if (sheet.getMaxColumns() < COMPANIES_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), COMPANIES_HEADERS.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, COMPANIES_HEADERS.length).setValues([COMPANIES_HEADERS]);
  return sheet;
}

function normalizeCnaes_(items) {
  return (Array.isArray(items) ? items : []).map(function(item) {
    if (typeof item === "string") return { codigo: "", descricao: item };
    return { codigo: String(item && (item.codigo || item.code) || ""), descricao: String(item && (item.descricao || item.description) || "") };
  }).filter(function(item) { return item.codigo || item.descricao; });
}

function mergeCnaes_(existing, incoming) {
  var result = normalizeCnaes_(existing), seen = {};
  result.forEach(function(item) { seen[item.codigo || normalize_(item.descricao)] = true; });
  normalizeCnaes_(incoming).forEach(function(item) {
    var key = item.codigo || normalize_(item.descricao);
    if (!seen[key]) { result.push(item); seen[key] = true; }
  });
  return result;
}

function normalize_(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function safeCell_(value) {
  var text = String(value == null ? "" : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
