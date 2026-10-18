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
var COMPANIES_HEADERS = ["Chave", "Nome principal", "CNPJ", "Nomes alternativos JSON", "Cidade", "Áreas JSON", "Ocorrências", "Primeiro registro", "Última atualização", "CNAE principal código", "CNAE principal descrição", "CNAEs secundários JSON", "Ofertas JSON"];
var RELATIONS_SHEET_NAME = "Relacoes";
var PUBLIC_PROFILES_SHEET_NAME = "PerfisPublicos";
var PENDING_PROFILES_SHEET_NAME = "PerfisPendentes";
var PROFILE_ACCOUNTS_SHEET_NAME = "ContasPerfisPublicos";
var PROFILE_MEDIA_FOLDER_NAME = "Avante - imagens de perfis públicos";
var AVANTE_ADMIN_USER_PROPERTY = "AVANTE_ADMIN_USERNAME";
var AVANTE_ADMIN_SALT_PROPERTY = "AVANTE_ADMIN_PASSWORD_SALT";
var AVANTE_ADMIN_HASH_PROPERTY = "AVANTE_ADMIN_PASSWORD_HASH";
var AVANTE_SESSION_VERSION_PROPERTY = "AVANTE_SESSION_VERSION";
var AVANTE_USERS_SHEET_NAME = "ContasAvante";
var AVANTE_PERSON_PROFILES_SHEET_NAME = "PerfisPessoas";
var AVANTE_CPF_HASH_SECRET_PROPERTY = "AVANTE_CPF_HASH_SECRET";
var AVANTE_SETTINGS_SHEET_NAME = "ConfiguracoesPerfil";
var AVANTE_MATCH_NOTIFICATIONS_SHEET_NAME = "NotificacoesMatch";
var AVANTE_MATCH_NOTIFICATIONS_HEADERS = ["ID", "Chave do match", "Criada em", "Conta", "Mensagem", "Lida em"];
var GEMINI_API_KEY_PROPERTY = "GEMINI_API_KEY";
var GOOGLE_MAPS_BROWSER_KEY_PROPERTY = "MAPS_BROWSER_API_KEY";
var GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY = "MAPS_MONTHLY_USAGE";
var GOOGLE_MAPS_MONTHLY_EVENT_LIMIT = 8000;
var AVANTE_GEMINI_MONTHLY_REQUEST_LIMIT = 500;
var AVANTE_GEMINI_DAILY_REQUEST_LIMIT = 20;
var PLATFORM_BACKUP_FOLDER_PROPERTY = "AVANTE_PLATFORM_BACKUP_FOLDER_ID";
var PLATFORM_BACKUP_RETENTION_DAYS = 30;
var PLATFORM_BACKUP_FOLDER_NAME = "Avante - backups da plataforma";
var PLATFORM_BACKUP_TRIGGER_HANDLER = "backupPlatformDaily";
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
  removeCnaeRefreshTriggers_();
  return ss.getUrl();
}

/** Cria uma cópia privada imediata e agenda backups diários. Execute uma vez no Apps Script. */
function installPlatformBackup() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === PLATFORM_BACKUP_TRIGGER_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(PLATFORM_BACKUP_TRIGGER_HANDLER).timeBased().everyDays(1).atHour(2).create();
  return backupPlatformNow();
}

/** Gatilho diário; mantém dados e imagens em uma pasta privada do Drive. */
function backupPlatformDaily() {
  return backupPlatformNow();
}

function backupPlatformNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Já existe um backup em andamento.");
  try {
    var props = PropertiesService.getScriptProperties();
    var spreadsheetId = props.getProperty(SHEET_ID_PROPERTY);
    if (!spreadsheetId) throw new Error("A planilha da plataforma ainda não foi configurada. Execute setup primeiro.");
    var backupRoot = getPlatformBackupFolder_();
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Sao_Paulo", "yyyyMMdd_HHmmss");
    var snapshotFolder = backupRoot.createFolder("Avante_Backup_" + stamp);
    snapshotFolder.setDescription("Backup automático privado do Avante. Contém cópia da base e mídias armazenadas no Drive.");

    DriveApp.getFileById(spreadsheetId).makeCopy("Base da plataforma - " + stamp, snapshotFolder);
    var mediaFolders = DriveApp.getFoldersByName(PROFILE_MEDIA_FOLDER_NAME);
    if (mediaFolders.hasNext()) {
      var mediaSnapshot = snapshotFolder.createFolder("Imagens de perfis");
      copyPlatformFolder_(mediaFolders.next(), mediaSnapshot);
    }

    var safeProperties = {};
    Object.keys(props.getProperties()).sort().forEach(function(key) {
      if (!/(API.?KEY|PASSWORD|HASH|SALT|TOKEN|SECRET|CREDENTIAL)/i.test(key)) safeProperties[key] = props.getProperty(key);
    });
    var backupInfo = {
      createdAt: new Date().toISOString(),
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: SpreadsheetApp.openById(spreadsheetId).getUrl(),
      scriptId: ScriptApp.getScriptId(),
      trigger: "Diário, aproximadamente às 02:00 no fuso do projeto",
      retentionDays: PLATFORM_BACKUP_RETENTION_DAYS,
      omittedProperties: "Chaves de API, senhas, hashes, salts, tokens e credenciais são omitidos; devem ser configurados novamente ao restaurar.",
      scriptProperties: safeProperties
    };
    snapshotFolder.createFile("manifesto.json", JSON.stringify(backupInfo, null, 2), MimeType.PLAIN_TEXT);
    prunePlatformBackups_(backupRoot, new Date());
    return { ok: true, name: snapshotFolder.getName(), url: snapshotFolder.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function getPlatformBackupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PLATFORM_BACKUP_FOLDER_PROPERTY);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (ignored) { props.deleteProperty(PLATFORM_BACKUP_FOLDER_PROPERTY); }
  }
  var folder = DriveApp.createFolder(PLATFORM_BACKUP_FOLDER_NAME);
  folder.setDescription("Backups privados automáticos do Avante. Não compartilhe esta pasta publicamente.");
  props.setProperty(PLATFORM_BACKUP_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function copyPlatformFolder_(source, destination) {
  var files = source.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) file.makeCopy(file.getName(), destination);
  }
  var folders = source.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (!folder.isTrashed()) copyPlatformFolder_(folder, destination.createFolder(folder.getName()));
  }
}

function prunePlatformBackups_(root, now) {
  var folders = root.getFolders();
  var cutoff = now.getTime() - PLATFORM_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  while (folders.hasNext()) {
    var folder = folders.next();
    if (/^Avante_Backup_\d{8}_\d{6}$/.test(folder.getName()) && folder.getDateCreated().getTime() < cutoff) folder.setTrashed(true);
  }
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  if (String(params.app || "") === "1") {
    return HtmlService.createHtmlOutputFromFile("Index")
      .setTitle("Avante — conexões para o seu negócio")
      .setFaviconUrl("https://raw.githubusercontent.com/pauloabispo000-hue/mapa-de-cadeia-empresarial/main/favicon.png")
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

/** Chave pública do Maps JavaScript API, servida somente à interface do Web App. */
function getMapsBrowserApiKey() {
  return String(PropertiesService.getScriptProperties().getProperty(GOOGLE_MAPS_BROWSER_KEY_PROPERTY) || "").trim();
}

/** Reserva eventos antes de carregar o mapa, mantendo margem abaixo do limite gratuito do Google. */
function reserveGoogleMapsMonthlyUsage(geocodingEvents) {
  var requestedGeocodingEvents = Number(geocodingEvents);
  if (!isFinite(requestedGeocodingEvents) || Math.floor(requestedGeocodingEvents) !== requestedGeocodingEvents || requestedGeocodingEvents < 0 || requestedGeocodingEvents > 31) {
    return { ok: false, message: "Não foi possível validar o consumo previsto do mapa." };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, message: "Não foi possível conferir o limite mensal do mapa. Tente novamente." };
  try {
    var month = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM");
    var properties = PropertiesService.getScriptProperties();
    var saved = properties.getProperty(GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY);
    var usage = saved ? JSON.parse(saved) : {};
    if (usage.month !== month) usage = { month: month, mapLoads: 0, geocoding: 0 };
    var nextMapLoads = Number(usage.mapLoads || 0) + 1;
    var nextGeocoding = Number(usage.geocoding || 0) + requestedGeocodingEvents;
    if (nextMapLoads > GOOGLE_MAPS_MONTHLY_EVENT_LIMIT || nextGeocoding > GOOGLE_MAPS_MONTHLY_EVENT_LIMIT) {
      return {
        ok: false,
        message: "Limite mensal de segurança atingido: " + Number(usage.mapLoads || 0) + "/" + GOOGLE_MAPS_MONTHLY_EVENT_LIMIT + " mapas e " + Number(usage.geocoding || 0) + "/" + GOOGLE_MAPS_MONTHLY_EVENT_LIMIT + " consultas de endereço. O mapa ficará pausado até o próximo mês.",
        mapLoads: Number(usage.mapLoads || 0),
        geocoding: Number(usage.geocoding || 0),
        limit: GOOGLE_MAPS_MONTHLY_EVENT_LIMIT
      };
    }
    usage.mapLoads = nextMapLoads;
    usage.geocoding = nextGeocoding;
    properties.setProperty(GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY, JSON.stringify(usage));
    return { ok: true, mapLoads: nextMapLoads, geocoding: nextGeocoding, limit: GOOGLE_MAPS_MONTHLY_EVENT_LIMIT };
  } catch (error) {
    console.error("Falha ao reservar uso mensal do Google Maps: " + error);
    return { ok: false, message: "Não foi possível conferir o limite mensal do mapa. Tente novamente." };
  } finally {
    lock.releaseLock();
  }
}

/** Reserva cada consulta de autocompletar endereço antes de chamar Places API. */
function reserveGooglePlacesAutocompleteUsage() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, message: "Não foi possível conferir o limite mensal da busca de endereço. Tente novamente." };
  try {
    var month = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM");
    var properties = PropertiesService.getScriptProperties();
    var saved = properties.getProperty(GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY);
    var usage = saved ? JSON.parse(saved) : {};
    if (usage.month !== month) usage = { month: month, mapLoads: 0, geocoding: 0, placesAutocomplete: 0 };
    var next = Number(usage.placesAutocomplete || 0) + 1;
    if (next > GOOGLE_MAPS_MONTHLY_EVENT_LIMIT) {
      return { ok: false, message: "Limite mensal de buscas de endereço atingido: " + Number(usage.placesAutocomplete || 0) + "/" + GOOGLE_MAPS_MONTHLY_EVENT_LIMIT + ". A busca será reativada no próximo mês." };
    }
    usage.placesAutocomplete = next;
    properties.setProperty(GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY, JSON.stringify(usage));
    return { ok: true, placesAutocomplete: next, limit: GOOGLE_MAPS_MONTHLY_EVENT_LIMIT };
  } catch (error) {
    console.error("Falha ao reservar uso mensal do Places: " + error);
    return { ok: false, message: "Não foi possível conferir o limite mensal da busca de endereço. Tente novamente." };
  } finally {
    lock.releaseLock();
  }
}

/** Reserva consultas Place Details usadas para confirmar logradouro, município e CEP. */
function reserveGooglePlacesDetailsUsage() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, message: "Não foi possível conferir o limite mensal da confirmação de endereço." };
  try {
    var month = Utilities.formatDate(new Date(), "America/Los_Angeles", "yyyy-MM");
    var properties = PropertiesService.getScriptProperties();
    var saved = properties.getProperty(GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY);
    var usage = saved ? JSON.parse(saved) : {};
    if (usage.month !== month) usage = { month: month, mapLoads: 0, geocoding: 0, placesAutocomplete: 0, placesDetails: 0 };
    var next = Number(usage.placesDetails || 0) + 1;
    if (next > GOOGLE_MAPS_MONTHLY_EVENT_LIMIT) {
      return { ok: false, message: "Limite mensal de confirmações de endereço atingido. Você ainda pode informar o endereço manualmente." };
    }
    usage.placesDetails = next;
    properties.setProperty(GOOGLE_MAPS_MONTHLY_USAGE_PROPERTY, JSON.stringify(usage));
    return { ok: true, placesDetails: next, limit: GOOGLE_MAPS_MONTHLY_EVENT_LIMIT };
  } catch (error) {
    console.error("Falha ao reservar uso mensal do Place Details: " + error);
    return { ok: false, message: "Não foi possível conferir o limite mensal da confirmação de endereço." };
  } finally {
    lock.releaseLock();
  }
}

/** Consulta dados cadastrais da empresa pelo CNPJ; os campos de CNAE não são usados pela plataforma. */
function lookupCompanyCnpj(value) {
  var cnpj = normalizeCnpj_(value);
  if (!validCnpj_(cnpj)) return { ok: false, error: "CNPJ inválido. Confira os 14 caracteres e os dígitos verificadores." };
  var providers = [
    { url: "https://brasilapi.com.br/api/cnpj/v1/" + encodeURIComponent(cnpj), name: "BrasilAPI" },
    { url: "https://minhareceita.org/" + encodeURIComponent(cnpj), name: "Minha Receita" }
  ];
  var failures = [];
  for (var i = 0; i < providers.length; i++) {
    try {
      var response = UrlFetchApp.fetch(providers[i].url, {
        method: "get", muteHttpExceptions: true, followRedirects: true,
        headers: { "Accept": "application/json" }
      });
      var status = response.getResponseCode();
      if (status < 200 || status >= 300) { failures.push(providers[i].name + " HTTP " + status); continue; }
      var data = JSON.parse(response.getContentText());
      var result = { ok: true, dados: {
        razaoSocial: data.razao_social || data.razaoSocial || "",
        nomeFantasia: data.nome_fantasia || data.nomeFantasia || "",
        municipio: data.municipio || "", uf: data.uf || "",
        logradouro: data.logradouro || "", descricaoTipoLogradouro: data.descricao_tipo_de_logradouro || data.tipo_logradouro || "",
        numero: data.numero || "", complemento: data.complemento || "", bairro: data.bairro || "", cep: data.cep || "",
        situacao: data.descricao_situacao_cadastral || data.situacao || "",
        fonte: providers[i].name + " (Dados Abertos do CNPJ)"
      } };
      if (result.dados.razaoSocial || result.dados.nomeFantasia) return result;
      failures.push(providers[i].name + " não retornou os dados da empresa");
    } catch (error) { failures.push(providers[i].name + ": " + String(error && error.message || error)); }
  }
  return { ok: false, error: "Não foi possível consultar os dados deste CNPJ. " + failures.join("; ") };
}

/** Pesquisa e orientação empresarial com Gemini e Grounding na Busca Google.
 * Não grava nem altera cadastros; devolve resposta e fontes para revisão do usuário.
 */
function runAvanteAiAssistant(token, input) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  input = input || {};
  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty(GEMINI_API_KEY_PROPERTY) || "").trim();
  if (!apiKey) return { ok: false, error: "A pesquisa com IA ainda não foi configurada. O administrador precisa adicionar a chave Gemini nas propriedades do projeto Apps Script." };

  var mode = String(input.mode || "research");
  if (mode !== "research" && mode !== "review") return { ok: false, error: "Tipo de solicitação inválido." };
  var question = String(input.question || "").trim().slice(0, 1000);
  if (mode === "research" && !question) return { ok: false, error: "Descreva o que deseja pesquisar." };

  var business = input.business || {};
  var context = {
    name: String(business.name || "").trim().slice(0, 160),
    cnpj: (function(value) { var normalized = normalizeCnpj_(value || ""); return validCnpj_(normalized) ? normalized : ""; })(business.cnpj),
    city: String(business.city || "").trim().slice(0, 100),
    types: (Array.isArray(business.types) ? business.types : []).map(function(value) { return String(value || "").trim().slice(0, 100); }).filter(Boolean).slice(0, 8),
    offers: (Array.isArray(business.offers) ? business.offers : []).map(function(value) { return String(value || "").trim().slice(0, 140); }).filter(Boolean).slice(0, 20),
    description: String(business.description || "").trim().slice(0, 1200)
  };
  if (mode === "review" && !context.name && !context.description && !context.offers.length) {
    return { ok: false, error: "Preencha primeiro o nome e a oferta do negócio no cadastro." };
  }
  var aiQuota = consumeAvanteAiQuota_(username);
  if (aiQuota === "user") return { ok: false, error: "Você atingiu o limite temporário de pesquisas com IA. Aguarde 10 minutos e tente novamente." };
  if (aiQuota === "daily") return { ok: false, error: "A plataforma atingiu o limite de 20 consultas gratuitas de IA hoje. Tente novamente amanhã." };
  if (aiQuota === "monthly") return { ok: false, error: "A plataforma atingiu o limite mensal de 500 consultas gratuitas de IA. O uso será liberado no próximo mês." };

  var systemInstruction, prompt;
  if (mode === "review") {
    systemInstruction = "Você é o assistente de pesquisa empresarial do Avante. Revise apenas os dados fornecidos e seu conhecimento geral; não afirme que consultou a internet nem invente fontes ou fatos. Distinga claramente sugestões de informações verificadas. Responda em português conciso, nas seções Pontos coerentes; Pontos que merecem conferência; Sugestões de melhoria do cadastro. Não trate CNAE como prova de produto vendido, não altere cadastro e nunca solicite ou exponha relações privadas, senhas ou dados pessoais.";
    prompt = "Revise estes dados declarados, que podem conter erros e não estão verificados:\n" + JSON.stringify(context);
  } else {
    systemInstruction = "Você é o assistente do Avante. Responda com seu conhecimento geral, sem afirmar que consultou a internet ou fontes atuais. Avise quando a resposta precisar de confirmação em fonte oficial. Não invente produtos, serviços, endereços, situação cadastral ou relações comerciais. Responda em português do Brasil, de forma útil e concisa. Não altere cadastros; apresente descobertas como sugestões para conferência.";
    prompt = question;
  }

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "post", muteHttpExceptions: true,
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey, "Accept": "application/json" },
      payload: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1200 }
      })
    });
    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      if (status === 401 || status === 403) return { ok: false, error: "A chave Gemini não foi aceita ou não tem acesso à API. Confira a configuração do projeto." };
      if (status === 429) return { ok: false, error: "A cota de pesquisas do Gemini foi atingida. Tente novamente mais tarde." };
      console.warn("Gemini respondeu com HTTP " + status + "; o conteúdo da consulta não foi registrado.");
      return { ok: false, error: "O serviço de pesquisa com IA não respondeu corretamente (HTTP " + status + "). Tente novamente." };
    }
    var data = JSON.parse(response.getContentText() || "{}");
    var candidate = (data.candidates || [])[0] || {};
    var parts = candidate.content && candidate.content.parts || [];
    var answer = parts.map(function(part) { return String(part.text || ""); }).filter(Boolean).join("\n").trim();
    if (!answer) return { ok: false, error: "A pesquisa não retornou uma resposta. Reformule a consulta e tente novamente." };
    var metadata = candidate.groundingMetadata || {};
    var seen = {}, sources = [];
    (metadata.groundingChunks || []).forEach(function(chunk) {
      var web = chunk && chunk.web || {}, uri = String(web.uri || "");
      if (!/^https?:\/\//i.test(uri) || seen[uri]) return;
      seen[uri] = true;
      sources.push({ title: String(web.title || uri).slice(0, 240), url: uri });
    });
    return {
      ok: true, answer: answer.slice(0, 12000),
      sources: sources.slice(0, 12),
      searchQueries: (metadata.webSearchQueries || []).map(function(value) { return String(value || "").slice(0, 240); }).slice(0, 8),
      reviewedAt: new Date().toISOString(), mode: mode
    };
  } catch (error) {
    console.warn("Falha na pesquisa do Gemini; consulta omitida dos registros.");
    return { ok: false, error: "Não foi possível concluir a pesquisa agora. Verifique a conexão e tente novamente." };
  }
}

/** Limita cada conta e mantém cotas diária e mensal globais abaixo dos limites gratuitos. */
function consumeAvanteAiQuota_(username) {
  var cache = CacheService.getScriptCache();
  var key = "avante-gemini-quota-" + hashAvanteToken_(String(username || "")).slice(0, 32);
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var count = Number(cache.get(key) || 0);
    if (count >= 5) return "user";
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyyMMdd");
    var month = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyyMM");
    if (props.getProperty("AVANTE_GEMINI_QUOTA_DATE") !== today) {
      props.setProperty("AVANTE_GEMINI_QUOTA_DATE", today);
      props.setProperty("AVANTE_GEMINI_DAILY_CALLS", "0");
    }
    if (props.getProperty("AVANTE_GEMINI_QUOTA_MONTH") !== month) {
      props.setProperty("AVANTE_GEMINI_QUOTA_MONTH", month);
      props.setProperty("AVANTE_GEMINI_MONTHLY_CALLS", "0");
    }
    var daily = Number(props.getProperty("AVANTE_GEMINI_DAILY_CALLS") || 0);
    var monthly = Number(props.getProperty("AVANTE_GEMINI_MONTHLY_CALLS") || 0);
    if (monthly >= AVANTE_GEMINI_MONTHLY_REQUEST_LIMIT) return "monthly";
    if (daily >= AVANTE_GEMINI_DAILY_REQUEST_LIMIT) return "daily";
    cache.put(key, String(count + 1), 600);
    props.setProperty("AVANTE_GEMINI_DAILY_CALLS", String(daily + 1));
    props.setProperty("AVANTE_GEMINI_MONTHLY_CALLS", String(monthly + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Remove os gatilhos antigos que faziam consultas periódicas de CNAE. */
function removeCnaeRefreshTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "refreshMissingCompanyCnaes") ScriptApp.deleteTrigger(trigger);
  });
}

function doPost(e) {
  try {
    var payload = JSON.parse(e && e.postData && e.postData.contents || "{}");
    return jsonOutput_(submitAvanteSurvey(String(payload.authToken || ""), payload));
  } catch (err) {
    return jsonOutput_({ ok: false, responsesSaved: false, profilePublished: false, error: String(err && err.message || err) });
  }
}

/** Mesmo processamento para HTTP e RPC autenticado, com confirmação das etapas persistidas. */
function canonicalSurveyValue_(value){
    if(Array.isArray(value))return value.map(canonicalSurveyValue_);
    if(value&&typeof value==="object"){
      var result={};Object.keys(value).sort().forEach(function(key){
        if(key==="id")return; // IDs locais de controles não mudam as respostas.
        var next=canonicalSurveyValue_(value[key]);
        if(next===null||next===undefined||next===""||next===false||(typeof next==="object"&&Object.keys(next).length===0))return;
        result[key]=next;
      });return result;
    }
    return value;
  }

function surveyReceiptSignature_(payload){return JSON.stringify(canonicalSurveyValue_({answers:payload.answers,business:payload.business,suppliers:payload.suppliers,complementary:payload.complementary,opportunities:payload.opportunities,publicProfile:{consent:payload.publicProfile&&payload.publicProfile.consent===true,products:payload.publicProfile&&payload.publicProfile.products}}));}

/** Consulta autenticada e somente leitura; nunca reenvia nem publica o perfil. */
function getAvanteSurveyReceipt(token, expected) {
  var account=getAvanteSessionUser_(String(token||""));
  if(!account)return {ok:false,error:"Sessão expirada. Entre novamente na sua conta para consultar o recibo."};
  expected=expected||{};
  var started=String(expected.meta&&expected.meta.startedAt||"");
  if(!started)return {ok:false,error:"Este rascunho não tem identificador de início. Não é possível confirmar automaticamente; preserve o rascunho e solicite suporte."};
  var ss=getSpreadsheet_(),sheet=ss.getSheetByName(RESPONSE_SHEET_NAME),matches=[],candidates=[];
  if(sheet&&sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues().forEach(function(row){
    if(String(row[7]||"").toLowerCase()!==String(account).toLowerCase())return;
    var stored;try{stored=JSON.parse(String(row[6]||""));}catch(ignored){return;}
    var requestedId=String(expected.meta&&expected.meta.submissionId||"");
    var sameAttempt=requestedId?String(stored.meta&&stored.meta.submissionId||"")===requestedId:String(stored.meta&&stored.meta.startedAt||"")===started;
    if(!sameAttempt||!String(row[1]||""))return;
    if(normalizeCnpj_(stored.business&&stored.business.cnpj)!==normalizeCnpj_(expected.business&&expected.business.cnpj))return;
    candidates.push(String(row[1]));
    if(surveyReceiptSignature_(stored)===surveyReceiptSignature_(expected))matches.push(String(row[1]));
  });
  if(matches.length===0&&candidates.length===1)return {ok:false,code:"DRAFT_CHANGED",previousResponseId:candidates[0],error:"Encontramos o recebimento anterior, mas o rascunho atual tem alterações. Revise essas alterações antes de decidir enviá-las. Nada será reenviado automaticamente."};
  if(matches.length!==1)return {ok:false,code:"RECEIPT_UNCONFIRMED",error:matches.length?"Há mais de um recibo correspondente. Não reenvie; preserve o rascunho e solicite suporte.":"Não foi localizado um recibo correspondente a estas respostas nesta conta. Isso não comprova que o envio falhou. Preserve o rascunho e não reenvie enquanto o resultado for desconhecido."};
  return {ok:true,responsesSaved:true,responseId:matches[0],profilePublished:null};
}

function submitAvanteSurvey(token, payload) {
  var account = getAvanteSessionUser_(String(token || ""));
  if (!account) return { ok: false, responsesSaved: false, profilePublished: false, error: "Acesso expirado. Entre novamente no Avante." };
  payload = payload || {};
  var profileRequested = !!(payload.publicProfile && payload.publicProfile.consent === true);
  var responsesSaved = false, profilePublished = false, responseId = "";
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var ss = getSpreadsheet_();
    var responseSheet = ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON", "Conta Avante"]);
    if (responseSheet.getMaxColumns() < 8) responseSheet.insertColumnsAfter(responseSheet.getMaxColumns(), 8 - responseSheet.getMaxColumns());
    responseSheet.getRange(1, 1, 1, 8).setValues([["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON", "Conta Avante"]]);
    var attemptId=String(payload.meta&&payload.meta.submissionId||""), started=String(payload.meta&&payload.meta.startedAt||"");
    if(attemptId&&responseSheet.getLastRow()>1){
      var priorRows=responseSheet.getRange(2,1,responseSheet.getLastRow()-1,8).getValues();
      for(var attemptIndex=0;attemptIndex<priorRows.length;attemptIndex++){
        var prior=priorRows[attemptIndex];
        if(String(prior[7]||"").toLowerCase()!==String(account).toLowerCase())continue;
        var stored;try{stored=JSON.parse(String(prior[6]||""));}catch(ignored){continue;}
        var storedId=String(stored.meta&&stored.meta.submissionId||""),sameId=storedId===attemptId;
        var legacy=!storedId&&started&&String(stored.meta&&stored.meta.startedAt||"")===started;
        if(!sameId&&!legacy)continue;
        if(surveyReceiptSignature_(stored)===surveyReceiptSignature_(payload)&&String(prior[1]||""))return {ok:true,responsesSaved:true,responseId:String(prior[1]),profilePublished:null,reused:true};
        if(sameId)return {ok:false,responsesSaved:false,profilePublished:false,error:"Esta tentativa já recebeu outras respostas. O rascunho atual foi preservado. Atualize os dados do negócio nas configurações para salvar alterações posteriores."};
      }
    }
    ensureSheet_(ss, OPTIONS_SHEET_NAME, ["Campo", "Resposta", "Chave normalizada", "Área inferida", "Adicionada em", "Ocorrências"]);
    ensureCompaniesSheet_(ss);
    ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
    ensurePublicProfilesSheet_(ss);
    ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação"]);

    responseId = Utilities.getUuid();
    var now = new Date();
    var b = payload.business || {};
    if (profileRequested) {
      if (!validCnpj_(normalizeCnpj_(b.cnpj)) || !String(b.nome || "").trim()) throw new Error("O perfil precisa ter nome empresarial e CNPJ válidos.");
      assertPublicProfileAccount_(ss, b.cnpj, account);
    }
    var storedPayload = JSON.parse(JSON.stringify(payload));
    delete storedPayload.authToken;
    if (storedPayload.publicProfile) { delete storedPayload.publicProfile.coverData; delete storedPayload.publicProfile.avatarData; }
    // Uma falha de escrita/flush pode deixar o resultado desconhecido. Não repetir automaticamente.
    responsesSaved = null;
    responseSheet.appendRow([
      now, responseId, safeCell_(b.nome), safeCell_(b.cnpj), safeCell_(b.cidade), safeCell_(b.areaNecessidade),
      safeCell_(JSON.stringify(storedPayload)), safeCell_(account)
    ]);
    SpreadsheetApp.flush();
    responsesSaved = true;
    saveContributions_(ss, extractContributions_(payload));
    saveRelations_(ss, payload, responseId, now);
    // Guarda candidatos para a análise privada; readCompanies_ só expõe pares nome/CNPJ aprovados pelo administrador.
    saveCompanies_(ss, payload, now);
    if (profileRequested) {
      profilePublished = null;
      savePublicProfile_(ss, payload, responseId, now, account);
      SpreadsheetApp.flush();
      profilePublished = true;
    }
    createAvanteMatchNotifications_(ss, payload, account, now);
    return { ok: true, responseId: responseId, responsesSaved: true, profileRequested: profileRequested, profilePublished: profilePublished, profileCnpj: profilePublished ? normalizeCnpj_(b.cnpj) : "" };
  } catch (err) {
    return { ok: false, responseId: responseId, responsesSaved: responsesSaved, profileRequested: profileRequested,
      profilePublished: profilePublished, profileCnpj: profilePublished ? normalizeCnpj_((payload.business || {}).cnpj) : "",
      error: String(err && err.message || err) };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/** Publica o perfil com consentimento e sessão válida, sem aprovação administrativa. */
function submitAvantePublicProfile(token, input) {
  var account = getAvanteSessionUser_(String(token || ""));
  if (!account) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  input = input || {};
  var business = input.business || {}, publicProfile = input.publicProfile || {};
  var cnpj = normalizeCnpj_(business.cnpj);
  if (!validCnpj_(cnpj) || !String(business.nome || "").trim()) return { ok: false, error: "O perfil precisa ter nome empresarial e CNPJ válidos." };
  if (publicProfile.consent !== true) return { ok: false, error: "Autorize a publicação do perfil." };
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var ss = getSpreadsheet_(), now = new Date(), responseId = Utilities.getUuid();
    savePublicProfile_(ss, { business: business, answers: input.answers || {}, publicProfile: publicProfile }, responseId, now, account);
    return { ok: true, responseId: responseId, message: "Perfil e catálogo publicados.", cnpj: cnpj };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
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

/** Lê o catálogo já publicado para carregar a edição do perfil autenticado. */
function getAvantePublicProducts(token, cnpj) {
  if (!validateAvanteSession_(String(token || ""))) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  var profile = readPublicProfile_(normalizeCnpj_(cnpj));
  return profile.ok ? { ok: true, products: profile.profile.products || [] } : { ok: true, products: [] };
}

/** Compartilha somente a declaração de revenda consentida pela própria compradora. */
function resaleProductsForSupplier_(payload, supplierCnpj) {
  var answers = payload.answers || {}, business = payload.business || {};
  if (answers.revendeProdutos !== "Sim") return [];
  var offers = Object.create(null), products = [];
  (Array.isArray(business.ofertas) ? business.ofertas : []).forEach(function(offer) {
    var name = String(offer && offer.nome || "").trim();
    if (name) offers[normalize_(name)] = true;
  });
  var suppliers = payload.suppliers && Array.isArray(payload.suppliers.lista) ? payload.suppliers.lista : [];
  suppliers.forEach(function(supplier) {
    if (normalizeCnpj_(supplier.cnpj) !== supplierCnpj || supplier.shareResaleWithSupplier !== true) return;
    var purposes = supplier.purchasePurposes || {};
    (Array.isArray(supplier.categorias) ? supplier.categorias : []).forEach(function(product) {
      var name = String(product || "").trim();
      if (purposes[name] === "revenda" && offers[normalize_(name)] && products.indexOf(name) < 0) products.push(name);
    });
  });
  return products;
}

/** Consulta privada: clientes são identificados pela declaração da compradora, não por indicação do vendedor. */
function getAvanteResaleCustomers(token, cnpj) {
  var account = getAvanteSessionUser_(String(token || ""));
  if (!account) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  cnpj = normalizeCnpj_(cnpj);
  if (!validCnpj_(cnpj)) return { ok: false, error: "Informe o CNPJ do seu negócio para consultar seus clientes revendedores." };
  var ss = getSpreadsheet_(), owners = Object.create(null), snapshots = Object.create(null);
  var bindings = ss.getSheetByName(PROFILE_ACCOUNTS_SHEET_NAME);
  var boundRows = bindings && bindings.getLastRow() > 1 ? bindings.getRange(2, 1, bindings.getLastRow() - 1, 2).getValues() : [];
  boundRows.forEach(function(row) {
    var key = normalizeCnpj_(row[0]);
    if (key && row[1] && !owners[key]) owners[key] = String(row[1]).toLowerCase();
  });
  var responses = ss.getSheetByName(RESPONSE_SHEET_NAME);
  var rows = responses && responses.getLastRow() > 1 ? responses.getRange(2, 1, responses.getLastRow() - 1, 8).getValues() : [];
  rows.forEach(function(row) {
    var buyerCnpj = normalizeCnpj_(row[3]), author = String(row[7] || "").toLowerCase(), payload;
    if (!validCnpj_(buyerCnpj) || !author) return;
    try { payload = JSON.parse(String(row[6] || "{}")); } catch (ignored) { return; }
    if (normalizeCnpj_((payload.business || {}).cnpj) !== buyerCnpj) return;
    // Na ausência de vínculo público, preserva a conta da primeira resposta autenticada.
    if (!owners[buyerCnpj]) owners[buyerCnpj] = author;
    if (owners[buyerCnpj] !== author) return;
    var received = new Date(row[0]).getTime() || 0;
    if (!snapshots[buyerCnpj] || received >= snapshots[buyerCnpj].date) snapshots[buyerCnpj] = { payload: payload, author: author, date: received };
  });
  if (owners[cnpj] !== account.toLowerCase()) return { ok: false, error: "Esta consulta é privada para a conta vinculada ao negócio." };
  // Edições da pesquisa e revogações posteriores prevalecem sobre a resposta original.
  var settings = ss.getSheetByName(AVANTE_SETTINGS_SHEET_NAME);
  var settingsRows = settings && settings.getLastRow() > 1 ? settings.getRange(2, 1, settings.getLastRow() - 1, 4).getValues() : [];
  settingsRows.forEach(function(row) {
    var key = normalizeCnpj_(row[1]), current = snapshots[key], date = new Date(row[2]).getTime() || 0, data;
    if (!current || String(row[0] || "").toLowerCase() !== current.author || date < current.date) return;
    try { data = JSON.parse(String(row[3] || "{}")); } catch (ignored) { return; }
    if (data.suppliers && Array.isArray(data.suppliers.lista)) current.payload.suppliers = data.suppliers;
    if (data.answers) {
      current.payload.answers = data.answers;
      if (Array.isArray(data.answers.produtosSelecionados)) current.payload.business.ofertas = data.answers.produtosSelecionados.map(function(name) { return { nome: name }; });
    }
    current.date = date;
  });
  var customers = [];
  Object.keys(snapshots).forEach(function(buyerCnpj) {
    if (buyerCnpj === cnpj) return;
    var snapshot = snapshots[buyerCnpj], products = resaleProductsForSupplier_(snapshot.payload, cnpj);
    if (!products.length) return;
    customers.push({ name: String(snapshot.payload.business.nome || "Empresa"), cnpj: buyerCnpj, products: products,
      source: "Declarado pela empresa compradora", confirmedBySupplier: false });
  });
  customers.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { ok: true, customers: customers };
}

/** Lista solicitações pendentes somente para a conta administrativa autenticada. */
function getAvantePendingNotifications(token) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  var adminUsername = (getAvanteAdminProperty_(AVANTE_ADMIN_USER_PROPERTY, "AVANTE_ADMIN_USER_PROPERTY") || "admin.avante").toLowerCase();
  if (username.toLowerCase() !== adminUsername) return { ok: true, isAdmin: false, count: 0, items: [] };
  var headers = ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação", "Produtos JSON"];
  var sheet = ensureSheet_(getSpreadsheet_(), PENDING_PROFILES_SHEET_NAME, headers);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var last = sheet.getLastRow(), rows = last > 1 ? sheet.getRange(2, 1, last - 1, 13).getValues() : [], seen = {}, items = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i], cnpj = normalizeCnpj_(row[1]);
    if (!cnpj || String(row[11] || "") !== "AGUARDANDO REVISÃO" || seen[cnpj]) continue;
    seen[cnpj] = true;
    var products = parseJsonArray_(row[12]), received = row[0];
    items.push({ cnpj: cnpj, name: String(row[2] || "Empresa sem nome"), productCount: products.length,
      receivedAt: received instanceof Date ? received.toISOString() : String(received || "") });
  }
  return { ok: true, isAdmin: true, count: items.length, items: items.slice(0, 30) };
}

/** Notificações privadas de compatibilidade entre as ofertas e as necessidades registradas. */
function getAvanteUserNotifications(token) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  var sheet = ensureSheet_(getSpreadsheet_(), AVANTE_MATCH_NOTIFICATIONS_SHEET_NAME, AVANTE_MATCH_NOTIFICATIONS_HEADERS);
  var last = sheet.getLastRow(), items = [], unread = 0;
  if (last > 1) {
    var rows = sheet.getRange(2, 1, last - 1, AVANTE_MATCH_NOTIFICATIONS_HEADERS.length).getValues();
    for (var i = rows.length - 1; i >= 0 && items.length < 50; i--) {
      var row = rows[i];
      if (String(row[3] || "").toLowerCase() !== username.toLowerCase()) continue;
      var read = !!row[5];
      if (!read) unread++;
      var created = row[2];
      items.push({ id: String(row[0]), message: String(row[4] || "Novo match entre empresas."), read: read,
        createdAt: created instanceof Date ? created.toISOString() : String(created || "") });
    }
  }
  return { ok: true, count: unread, items: items };
}

/** Marca como lido somente um aviso pertencente à conta autenticada. */
function markAvanteMatchNotificationRead(token, notificationId) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  var id = String(notificationId || ""), sheet = ensureSheet_(getSpreadsheet_(), AVANTE_MATCH_NOTIFICATIONS_SHEET_NAME, AVANTE_MATCH_NOTIFICATIONS_HEADERS);
  if (!id || sheet.getLastRow() < 2) return { ok: false };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, AVANTE_MATCH_NOTIFICATIONS_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === id && String(rows[i][3] || "").toLowerCase() === username.toLowerCase()) {
    if (!rows[i][5]) sheet.getRange(i + 2, 6).setValue(new Date());
    return { ok: true };
  }
  return { ok: false };
}

/** Cruza cada nova resposta com os cadastros anteriores e avisa as duas contas do par. */
function createAvanteMatchNotifications_(ss, payload, account, now) {
  if (!account) return;
  var business = payload.business || {}, currentCnpj = normalizeCnpj_(business.cnpj);
  var currentName = String(business.nome || "Empresa").trim();
  var currentOffers = extractAvanteOffers_(payload);
  var currentNeeds = extractAvanteNeeds_(payload);
  if (!validCnpj_(currentCnpj) || (!currentOffers.length && !currentNeeds.length)) return;
  var responseSheet = ss.getSheetByName(RESPONSE_SHEET_NAME), last = responseSheet ? responseSheet.getLastRow() : 0;
  if (last < 3) return;
  var oldRows = responseSheet.getRange(2, 1, last - 1, 8).getValues(), notifications = [], accountsByCnpj = getAvanteAccountMap_(ss);
  for (var i = 0; i < oldRows.length - 1; i++) {
    var row = oldRows[i], otherCnpj = normalizeCnpj_(row[3]);
    var otherAccount = String(row[7] || "") || accountsByCnpj[otherCnpj] || "";
    if (!otherAccount || otherAccount.toLowerCase() === account.toLowerCase() || !validCnpj_(otherCnpj) || otherCnpj === currentCnpj) continue;
    var oldPayload;
    try { oldPayload = JSON.parse(String(row[6] || "{}")); } catch (ignored) { continue; }
    var otherName = String(row[2] || oldPayload.business && oldPayload.business.nome || "Outra empresa").trim();
    var otherOffers = extractAvanteOffers_(oldPayload), otherNeeds = extractAvanteNeeds_(oldPayload);
    appendAvanteOfferNeedMatches_(notifications, currentOffers, otherNeeds, currentName, otherName, account, otherAccount, currentCnpj, otherCnpj);
    appendAvanteOfferNeedMatches_(notifications, otherOffers, currentNeeds, otherName, currentName, otherAccount, account, otherCnpj, currentCnpj);
  }
  if (!notifications.length) return;
  var sheet = ensureSheet_(ss, AVANTE_MATCH_NOTIFICATIONS_SHEET_NAME, AVANTE_MATCH_NOTIFICATIONS_HEADERS);
  var existing = {}, nlast = sheet.getLastRow();
  if (nlast > 1) sheet.getRange(2, 1, nlast - 1, 2).getValues().forEach(function(row) { existing[String(row[1])] = true; });
  var rows = [];
  notifications.forEach(function(item) {
    if (existing[item.key]) return;
    existing[item.key] = true;
    rows.push([Utilities.getUuid(), item.key, now, item.account, safeCell_(item.message), ""]);
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, AVANTE_MATCH_NOTIFICATIONS_HEADERS.length).setValues(rows);
}

function getAvanteAccountMap_(ss) {
  var sheet = ss.getSheetByName(AVANTE_SETTINGS_SHEET_NAME);
  var result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = rows.length - 1; i >= 0; i--) { var cnpj = normalizeCnpj_(rows[i][1]); if (validCnpj_(cnpj) && rows[i][0] && !result[cnpj]) result[cnpj] = String(rows[i][0]); }
  return result;
}

function extractAvanteOffers_(payload) {
  var offers = payload && payload.business && Array.isArray(payload.business.ofertas) ? payload.business.ofertas : [];
  return offers.map(function(item) { return String(item && (item.nome || item.name) || "").trim(); }).filter(Boolean);
}

function extractAvanteNeeds_(payload) {
  var suppliers = payload && payload.suppliers && Array.isArray(payload.suppliers.lista) ? payload.suppliers.lista : [];
  var needs = [];
  suppliers.forEach(function(supplier) {
    var values = (Array.isArray(supplier.categorias) ? supplier.categorias : []).concat(String(supplier.itens || "").split(/[,;\n]/));
    values.forEach(function(value) { var item = String(value || "").trim(); if (item && needs.indexOf(item) < 0) needs.push(item); });
  });
  return needs;
}

function appendAvanteOfferNeedMatches_(out, offers, needs, supplierName, buyerName, supplierAccount, buyerAccount, supplierCnpj, buyerCnpj) {
  var needIndex = {};
  needs.forEach(function(need) { var key = normalize_(need); if (key) needIndex[key] = need; });
  offers.forEach(function(offer) {
    var key = normalize_(offer), matchingNeed = needIndex[key];
    if (!key || !matchingNeed) return;
    var matchKey = [supplierCnpj, buyerCnpj].sort().join(":") + "|" + key;
    out.push({ key: matchKey + "|" + supplierAccount.toLowerCase(), account: supplierAccount,
      message: "Match: " + buyerName + " procura " + matchingNeed + ", uma solução oferecida pela sua empresa " + supplierName + "." });
    out.push({ key: matchKey + "|" + buyerAccount.toLowerCase(), account: buyerAccount,
      message: "Match: " + supplierName + " oferece " + offer + ", uma solução que sua empresa procura." });
  });
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

function registerAvanteUser(username, password, profileInput) {
  var user = String(username || "").trim().toLowerCase(), pass = String(password || "");
  profileInput = profileInput || {};
  var person = sanitizeAvantePersonProfile_(profileInput), cpf = normalizeCpf_(profileInput.cpf);
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(user)) return { ok: false, error: "Use um nome de usuário de 3 a 32 caracteres: letras sem acento, números, ponto, hífen ou sublinhado." };
  if (user === "admin.avante") return { ok: false, error: "Esse nome de usuário é reservado." };
  if (pass.length < 12 || pass.length > 128) return { ok: false, error: "A senha precisa ter entre 12 e 128 caracteres." };
  if (!validCpf_(cpf)) return { ok: false, error: "Informe um CPF válido." };
  if (!person.ok) return { ok: false, error: person.error };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = ensureAvanteUsersSheet_(getSpreadsheet_());
    if (findAvanteUser_(users, user)) return { ok: false, error: "Esse nome de usuário já está em uso." };
    var cpfHash = hashAvanteCpf_(cpf), last = users.getLastRow();
    if (last > 1 && users.getRange(2, 7, last - 1, 1).getValues().some(function(row) { return String(row[0] || "") === cpfHash; })) return { ok: false, error: "Este CPF já está vinculado a uma conta. Entre nessa conta para atualizar seu perfil." };
    var salt = Utilities.getUuid() + Utilities.getUuid(), version = Utilities.getUuid();
    var now = new Date();
    users.appendRow([user, salt, hashAvantePassword_(salt, pass), version, now, now, cpfHash, person.profile.type, person.profile.name, cpf.slice(-4)]);
    saveAvantePersonProfile_(getSpreadsheet_(), user, cpfHash, person.profile, now);
    return createAvanteSession_(user, version);
  } finally {
    lock.releaseLock();
  }
}

/** Perfil privado da pessoa autenticada; o CPF completo nunca é devolvido à interface. */
function getAvantePersonProfile(token) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  var users = ensureAvanteUsersSheet_(getSpreadsheet_()), account = findAvanteUser_(users, username);
  if (!account || !account.cpfHash) return { ok: true, registered: false };
  var sheet = ensureAvantePersonProfilesSheet_(getSpreadsheet_()), last = sheet.getLastRow(), profile = null;
  if (last > 1) {
    var rows = sheet.getRange(2, 1, last - 1, 7).getValues();
    for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === username) {
      try { profile = JSON.parse(String(rows[i][6] || "{}")); } catch (ignored) { profile = {}; }
      break;
    }
  }
  return { ok: true, registered: true, profile: { type: account.profileType || "cliente", name: account.fullName || "", cpfLast4: account.cpfLast4 || "", data: profile || {} } };
}

/** Atualiza os campos do currículo ou do perfil de cliente sem permitir trocar o CPF/tipo da conta. */
function saveAvantePersonProfile(token, input) {
  var username = getAvanteSessionUser_(String(token || ""));
  if (!username) return { ok: false, error: "Acesso expirado. Entre novamente no Avante." };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return saveAvantePersonProfileForAccount_(username, input || {}); }
  finally { lock.releaseLock(); }
}

function saveAvantePersonProfileForAccount_(username, input) {
  input = input || {};
  var ss = getSpreadsheet_(), users = ensureAvanteUsersSheet_(ss), account = findAvanteUser_(users, username);
  if (!account) return { ok: false, error: "Conta não encontrada." };
  var cpfHash = account.cpfHash, cpfLast4 = account.cpfLast4, profileType = account.profileType;
  if (!cpfHash) {
    var cpf = normalizeCpf_(input.cpf);
    if (!validCpf_(cpf)) return { ok: false, error: "Informe um CPF válido para vincular esta conta." };
    cpfHash = hashAvanteCpf_(cpf); var last = users.getLastRow();
    if (last > 1 && users.getRange(2, 7, last - 1, 1).getValues().some(function(row, index) { return index + 2 !== account.row && String(row[0] || "") === cpfHash; })) return { ok: false, error: "Este CPF já está vinculado a outra conta." };
    profileType = String(input.type || "").toLowerCase(); cpfLast4 = cpf.slice(-4);
  }
  var cleaned = sanitizeAvantePersonProfile_(input, profileType);
  if (!cleaned.ok) return { ok: false, error: cleaned.error };
  var now = new Date();
  users.getRange(account.row, 7, 1, 4).setValues([[cpfHash, cleaned.profile.type, safeCell_(cleaned.profile.name), cpfLast4]]);
  users.getRange(account.row, 6).setValue(now);
  saveAvantePersonProfile_(ss, username, cpfHash, cleaned.profile, now);
  return { ok: true, profile: { type: cleaned.profile.type, name: cleaned.profile.name, cpfLast4: cpfLast4, data: cleaned.profile } };
}

function sanitizeAvantePersonProfile_(input, fixedType) {
  input = input || {};
  var type = String(fixedType || input.type || "").trim().toLowerCase();
  if (["profissional", "cliente"].indexOf(type) < 0) return { ok: false, error: "Escolha se o cadastro é de profissional ou de cliente." };
  function field(key, max) { return String(input[key] || "").trim().slice(0, max); }
  var profile = { type: type, name: field("name", 120), email: field("email", 254), phone: field("phone", 40), city: field("city", 120),
    profession: field("profession", 120), summary: field("summary", 2000), skills: field("skills", 2000), experience: field("experience", 4000), education: field("education", 3000), clientNeeds: field("clientNeeds", 2000) };
  if (!profile.name) return { ok: false, error: "Informe seu nome completo." };
  if (type === "profissional" && !profile.profession) return { ok: false, error: "Informe sua profissão ou o serviço que oferece." };
  if (type === "cliente" && !profile.clientNeeds) return { ok: false, error: "Descreva o produto ou serviço que procura." };
  return { ok: true, profile: profile };
}

function saveAvantePersonProfile_(ss, username, cpfHash, profile, now) {
  var sheet = ensureAvantePersonProfilesSheet_(ss), last = sheet.getLastRow(), target = 0;
  if (last > 1) {
    var users = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = users.length - 1; i >= 0; i--) if (String(users[i][0]) === username) { target = i + 2; break; }
  }
  var row = [username, cpfHash, profile.type, safeCell_(profile.name), target ? sheet.getRange(target, 5).getValue() : now, now, safeCell_(JSON.stringify(profile))];
  if (target) sheet.getRange(target, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
}

function ensureAvantePersonProfilesSheet_(ss) {
  return ensureSheet_(ss, AVANTE_PERSON_PROFILES_SHEET_NAME, ["Conta", "CPF hash", "Tipo de perfil", "Nome", "Criado em", "Atualizado em", "Perfil privado JSON"]);
}

function normalizeCpf_(value) { return String(value || "").replace(/\D/g, ""); }

function validCpf_(value) {
  var cpf = normalizeCpf_(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (var digit = 9; digit <= 10; digit++) {
    var sum = 0;
    for (var i = 0; i < digit; i++) sum += Number(cpf.charAt(i)) * (digit + 1 - i);
    var check = (sum * 10) % 11; if (check === 10) check = 0;
    if (check !== Number(cpf.charAt(digit))) return false;
  }
  return true;
}

function hashAvanteCpf_(cpf) {
  var props = PropertiesService.getScriptProperties(), secret = props.getProperty(AVANTE_CPF_HASH_SECRET_PROPERTY);
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty(AVANTE_CPF_HASH_SECRET_PROPERTY, secret); }
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(normalizeCpf_(cpf), secret, Utilities.Charset.UTF_8));
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
  var headers = ["Usuário", "Sal", "Hash da senha", "Versão de sessão", "Criada em", "Atualizada em", "CPF hash", "Tipo de perfil", "Nome completo", "CPF final"];
  var sheet = ensureSheet_(ss, AVANTE_USERS_SHEET_NAME, headers);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function getAvanteAdminProperty_(key, legacyKey) {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty(key) || props.getProperty(legacyKey) || "");
}

function findAvanteUser_(sheet, username) {
  var last = sheet.getLastRow(), normalized = String(username || "").trim().toLowerCase();
  if (last < 2) return null;
  var rows = sheet.getRange(2, 1, last - 1, 10).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0] || "").trim().toLowerCase() === normalized) {
    return { row: i + 2, username: String(rows[i][0]), salt: String(rows[i][1]), hash: String(rows[i][2]), version: String(rows[i][3]), createdAt: rows[i][4], cpfHash: String(rows[i][6] || ""), profileType: String(rows[i][7] || ""), fullName: String(rows[i][8] || ""), cpfLast4: String(rows[i][9] || "") };
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
  addCompanyCandidate_(rows, b.nome, b.cnpj, b.cidade, b.areaNecessidade, b.cnpjDados, b.ofertas, true);
  ["suppliers", "customers", "complementary"].forEach(function(key) {
    var group = payload[key] || {};
    (Array.isArray(group.lista) ? group.lista : []).forEach(function(entity) {
      var inferredArea = key === "suppliers" ? inferArea_(entity.categorias || entity.itens) : "";
      addCompanyCandidate_(rows, entity.empresa, entity.cnpj, entity.cidade, entity.areaNecessidade || inferredArea, entity.cnpjDados, entity.ofertas);
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
      var offers = mergeCompanyOffers_(parseJsonArray_(old[12]), candidate.offers);
      sheet.getRange(rowNo, 2, 1, 11).setValues([[
        safeCell_(old[1] || candidate.name), old[2] || candidate.cnpj, JSON.stringify(aliases), safeCell_(old[4] || candidate.city),
        JSON.stringify(areas), Number(old[6] || 0) + (skipOccurrenceCount ? 0 : 1), old[7] || now, now,
        old[9] || candidate.cnaeCodigo, old[10] || safeCell_(candidate.cnae), JSON.stringify(secondary)
      ]]);
      sheet.getRange(rowNo, 13).setValue(JSON.stringify(offers));
    } else {
      sheet.appendRow([candidate.key, safeCell_(candidate.name), candidate.cnpj, JSON.stringify([]), safeCell_(candidate.city),
        JSON.stringify(candidate.areas), skipOccurrenceCount ? 0 : 1, now, now, candidate.cnaeCodigo, safeCell_(candidate.cnae), JSON.stringify(candidate.secondaryCnaes), JSON.stringify(candidate.offers)]);
      existing[candidate.key] = sheet.getLastRow();
    }
  });
}

function readPublicProfile_(cnpj) {
  if (!validCnpj_(cnpj)) return { ok: false, error: "Perfil não encontrado." };
  var sheet = ensurePublicProfilesSheet_(getSpreadsheet_());
  var last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: "Perfil não encontrado." };
  var rows = sheet.getRange(2, 1, last - 1, 12).getValues();
  for (var i = 0; i < rows.length; i++) if (normalizeCnpj_(rows[i][0]) === cnpj && String(rows[i][10] || "").indexOf("APROVADO") === 0) {
    return { ok: true, profile: { cnpj: cnpj, name: String(rows[i][1] || ""), country: String(rows[i][2] || ""), city: String(rows[i][3] || ""), areas: parseJsonArray_(rows[i][4]), offers: parseJsonArray_(rows[i][5]), description: String(rows[i][6] || ""), coverUrl: String(rows[i][7] || ""), avatarUrl: String(rows[i][8] || ""), products: parseJsonArray_(rows[i][11]) } };
  }
  return { ok: false, error: "Perfil não encontrado." };
}

function ensurePublicProfilesSheet_(ss) {
  var headers = ["CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "Capa URL", "Avatar URL", "Atualizado em", "Publicação", "Produtos JSON"];
  var sheet = ensureSheet_(ss, PUBLIC_PROFILES_SHEET_NAME, headers);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

/** A vinculação protege a edição; não certifica a titularidade legal do CNPJ. */
function assertPublicProfileAccount_(ss, cnpj, account) {
  cnpj = normalizeCnpj_(cnpj);
  if (!account || !validCnpj_(cnpj)) throw new Error("Informe uma conta autenticada e um CNPJ válido.");
  var sheet = ensureSheet_(ss, PROFILE_ACCOUNTS_SHEET_NAME, ["CNPJ", "Conta", "Vinculado em"]);
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  var owner = "";
  for (var i = 0; i < rows.length; i++) if (normalizeCnpj_(rows[i][0]) === cnpj) { owner = String(rows[i][1] || ""); break; }
  var profiles = ensurePublicProfilesSheet_(ss);
  var existing = profiles.getLastRow() > 1 ? profiles.getRange(2, 1, profiles.getLastRow() - 1, 1).getValues().some(function(row) { return normalizeCnpj_(row[0]) === cnpj; }) : false;
  // Perfis antigos podem ser associados pela resposta autenticada que originou a publicação.
  if (!owner && existing) {
    var pending = ss.getSheetByName(PENDING_PROFILES_SHEET_NAME), responseId = "";
    var pendingRows = pending && pending.getLastRow() > 1 ? pending.getRange(2, 1, pending.getLastRow() - 1, 12).getValues() : [];
    for (var j = pendingRows.length - 1; j >= 0; j--) if (normalizeCnpj_(pendingRows[j][1]) === cnpj && String(pendingRows[j][11]).indexOf("APROVADO") === 0) { responseId = String(pendingRows[j][10] || ""); break; }
    var responses = ss.getSheetByName(RESPONSE_SHEET_NAME);
    var responseRows = responseId && responses && responses.getLastRow() > 1 ? responses.getRange(2, 1, responses.getLastRow() - 1, 8).getValues() : [];
    for (var k = 0; k < responseRows.length; k++) if (String(responseRows[k][1]) === responseId && normalizeCnpj_(responseRows[k][3]) === cnpj) { owner = String(responseRows[k][7] || ""); break; }
    if (!owner) throw new Error("Este perfil antigo ainda não está vinculado a uma conta. Solicite a vinculação ao suporte para editá-lo.");
  }
  if (owner && owner.toLowerCase() !== String(account).toLowerCase()) throw new Error("Este perfil pertence a outra conta. Entre com a conta que o criou.");
  return { sheet: sheet, linked: rows.some(function(row) { return normalizeCnpj_(row[0]) === cnpj; }) };
}

/** Chamado apenas com o lock adquirido pelo envio ou pela edição autenticada. */
function savePublicProfile_(ss, payload, responseId, now, account) {
  if (!payload.publicProfile || payload.publicProfile.consent !== true) return;
  var business = payload.business || {}, cnpj = normalizeCnpj_(business.cnpj);
  if (!validCnpj_(cnpj) || !String(business.nome || "").trim()) throw new Error("O perfil precisa ter nome empresarial e CNPJ válidos.");
  var binding = assertPublicProfileAccount_(ss, cnpj, account);
  // A pesquisa pode atualizar a apresentação sem enviar o catálogo já publicado.
  if (payload.publicProfile.products === undefined) {
    var current = readPublicProfile_(cnpj);
    payload.publicProfile.products = current.ok ? current.profile.products : [];
  }
  savePendingPublicProfile_(ss, payload, responseId, now);
  if (!binding.linked) binding.sheet.appendRow([cnpj, account, now]);
  publishPendingPublicProfile_(ss, cnpj, true);
}

function savePendingPublicProfile_(ss, payload, responseId, now) {
  var input = payload.publicProfile || {}, b = payload.business || {};
  var pendingHeaders = ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação", "Produtos JSON"];
  var sheet = ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, pendingHeaders);
  if (sheet.getMaxColumns() < pendingHeaders.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), pendingHeaders.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, pendingHeaders.length).setValues([pendingHeaders]);
  var cnpj = normalizeCnpj_(b.cnpj);
  if (input.consent !== true || !validCnpj_(cnpj) || !String(b.nome || "").trim()) return;
  var coverId = input.coverData ? saveProfileImage_(input.coverData, cnpj + "-capa") : "";
  var avatarId = input.avatarData ? saveProfileImage_(input.avatarData, cnpj + "-perfil") : "";
  var offers = (payload.answers && payload.answers.produtosSelecionados) || b.produtoCategorias || [];
  offers = Array.isArray(offers) ? offers.map(function(value) { return String(value).trim(); }).filter(Boolean).slice(0, 80) : [];
  var areas = String(b.areaNecessidade || "").split(/[·,]/).map(function(value) { return value.trim(); }).filter(function(value) { return AREAS_12.indexOf(value) >= 0; });
  var products = normalizePublicProducts_(input.products || [], cnpj, true);
  sheet.appendRow([now, cnpj, safeCell_(String(b.nome).trim().slice(0, 160)), safeCell_(String(b.pais || "").slice(0, 80)), safeCell_(String(b.cidade || "").slice(0, 120)), JSON.stringify(areas), JSON.stringify(offers), safeCell_(String(b.produtoDetalhe || "").slice(0, 1500)), coverId, avatarId, responseId, "AGUARDANDO REVISÃO", JSON.stringify(products)]);
}

function normalizePublicProducts_(items, cnpj, saveImages) {
  if (!Array.isArray(items) || items.length > 40) throw new Error("O catálogo pode conter até 40 produtos.");
  var seen = {}, products = [], imagePayloadSize = 0;
  items.forEach(function(item) {
    item = item || {};
    var sku = String(item.sku || "").trim().slice(0, 64);
    var name = String(item.name || item.nome || "").trim().slice(0, 160);
    var description = String(item.description || item.descricao || "").trim().slice(0, 1500);
    var key = normalize_(sku);
    if (!sku && !name && !description && !item.imageData && !item.imageUrl) return;
    if (!sku || !name || !description) throw new Error("Cada produto precisa de SKU, nome e descrição.");
    if (!item.imageData && !item.imageUrl) throw new Error("Adicione uma foto para cada produto.");
    if (seen[key]) throw new Error("Cada produto deve ter um SKU diferente.");
    seen[key] = true;
    var imageId = "", imageUrl = "";
    if (item.imageData) {
      if (!saveImages) throw new Error("Não foi possível validar a imagem do produto.");
      if (String(item.imageData).length > 470000) throw new Error("Cada foto deve ter no máximo 350 KB depois da compressão.");
      imagePayloadSize += String(item.imageData).length;
      if (imagePayloadSize > 1500000) throw new Error("O total das fotos do catálogo deve ter até 1,1 MB por envio.");
      imageId = saveProfileImage_(item.imageData, cnpj + "-produto-" + sku.replace(/[^a-z0-9_-]/gi, "_"));
    } else if (/^https:\/\/drive\.google\.com\/thumbnail\?id=[\w-]+&sz=w1600$/.test(String(item.imageUrl || ""))) {
      imageUrl = String(item.imageUrl);
    }
    products.push({ sku: sku, name: name, description: description, imageId: imageId, imageUrl: imageUrl });
  });
  return products;
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

// Compatibilidade para solicitações antigas; novos envios são publicados automaticamente.
function approvePublicProfile(cnpj) {
  assertAvanteOwner_();
  cnpj = normalizeCnpj_(cnpj);
  if (!validCnpj_(cnpj)) throw new Error("Informe um CNPJ válido.");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return publishPendingPublicProfile_(getSpreadsheet_(), cnpj, false);
  } finally {
    lock.releaseLock();
  }
}

function publishPendingPublicProfile_(ss, cnpj, automatic) {
  var pendingHeaders = ["Recebido em", "CNPJ", "Nome", "País", "Cidade", "Áreas JSON", "Ofertas JSON", "Descrição", "ID da capa privada", "ID do avatar privado", "Resposta", "Situação", "Produtos JSON"];
  var pending = ensureSheet_(ss, PENDING_PROFILES_SHEET_NAME, pendingHeaders);
  if (pending.getMaxColumns() < pendingHeaders.length) pending.insertColumnsAfter(pending.getMaxColumns(), pendingHeaders.length - pending.getMaxColumns());
  pending.getRange(1, 1, 1, pendingHeaders.length).setValues([pendingHeaders]);
  var pendingRows = pending.getLastRow() > 1 ? pending.getRange(2, 1, pending.getLastRow() - 1, 13).getValues() : [];
  var selected = null, selectedRow = 0;
  for (var i = pendingRows.length - 1; i >= 0; i--) if (normalizeCnpj_(pendingRows[i][1]) === cnpj && String(pendingRows[i][11]) === "AGUARDANDO REVISÃO") { selected = pendingRows[i]; selectedRow = i + 2; break; }
  if (!selected) throw new Error("Não há solicitação pendente para este CNPJ.");
  var coverUrl = publishProfileImage_(selected[8]), avatarUrl = publishProfileImage_(selected[9]);
  var profiles = ensurePublicProfilesSheet_(ss);
  var profileRow = 0, oldRows = profiles.getLastRow() > 1 ? profiles.getRange(2, 1, profiles.getLastRow() - 1, 12).getValues() : [];
  for (var j = 0; j < oldRows.length; j++) if (normalizeCnpj_(oldRows[j][0]) === cnpj) { profileRow = j + 2; break; }
  var products = parseJsonArray_(selected[12]).map(function(product) {
    var imageUrl = product.imageUrl || publishProfileImage_(product.imageId);
    return { sku: product.sku, name: product.name, description: product.description, imageUrl: imageUrl };
  });
  if (profileRow) {
    var oldProducts = parseJsonArray_(oldRows[profileRow - 2][11]);
    var retainedImages = {};
    products.forEach(function(product) { if (product.imageUrl) retainedImages[product.imageUrl] = true; });
    oldProducts.forEach(function(product) {
      var oldUrl = product && String(product.imageUrl || "");
      if (oldUrl && !retainedImages[oldUrl]) {
        var match = oldUrl.match(/[?&]id=([\w-]+)/);
        if (match) try { DriveApp.getFileById(match[1]).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT); } catch (ignored) {}
      }
    });
  }
  if (profileRow) {
    coverUrl = coverUrl || String(oldRows[profileRow - 2][7] || "");
    avatarUrl = avatarUrl || String(oldRows[profileRow - 2][8] || "");
  }
  var publicationStatus = automatic ? "APROVADO AUTOMATICAMENTE — " : "APROVADO — ";
  var publicRow = [cnpj, selected[2], selected[3], selected[4], selected[5], selected[6], selected[7], coverUrl, avatarUrl, new Date(), publicationStatus + new Date().toISOString(), JSON.stringify(products)];
  if (profileRow) profiles.getRange(profileRow, 1, 1, 12).setValues([publicRow]); else profiles.appendRow(publicRow);
  var approvedAt = new Date().toISOString();
  pendingRows.forEach(function(row, index) {
    if (normalizeCnpj_(row[1]) !== cnpj || String(row[11] || "") !== "AGUARDANDO REVISÃO") return;
    pending.getRange(index + 2, 12).setValue(index + 2 === selectedRow ? publicationStatus + approvedAt : "SUBSTITUÍDO — " + approvedAt);
  });
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
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  for (var i = rows.length - 1; i >= 0; i--) if (normalizeCnpj_(rows[i][0]) === cnpj) {
    [rows[i][7], rows[i][8]].forEach(function(url) { var match = String(url || "").match(/[?&]id=([\w-]+)/); if (match) try { DriveApp.getFileById(match[1]).setTrashed(true); } catch (ignored) {} });
    parseJsonArray_(rows[i][11]).forEach(function(product) { var match = String(product.imageUrl || "").match(/[?&]id=([\w-]+)/); if (match) try { DriveApp.getFileById(match[1]).setTrashed(true); } catch (ignored) {} });
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

function addCompanyCandidate_(rows, name, cnpj, city, area, cnpjDados, offers, replaceOffers) {
  name = String(name || "").trim();
  cnpj = normalizeCnpj_(cnpj);
  if (!name) return;
  if (!validCnpj_(cnpj)) cnpj = "";
  var key = cnpj.length === 14 ? "cnpj:" + cnpj : "name:" + normalize_(name) + "|" + normalize_(city || "");
  var candidate = rows.filter(function(item) { return item.key === key; })[0];
  var data = cnpjDados || {};
  if (!candidate) { candidate = { key: key, name: name, cnpj: cnpj, city: String(city || ""), areas: [], offers: [], cnaeCodigo: String(data.cnaeCodigo || ""), cnae: String(data.cnae || ""), secondaryCnaes: normalizeCnaes_(data.cnaesSecundarios || data.secondaryCnaes || []) }; rows.push(candidate); }
  else {
    if (!candidate.cnaeCodigo) candidate.cnaeCodigo = String(data.cnaeCodigo || "");
    if (!candidate.cnae) candidate.cnae = String(data.cnae || "");
    candidate.secondaryCnaes = mergeCnaes_(candidate.secondaryCnaes, data.cnaesSecundarios || data.secondaryCnaes || []);
  }
  if (area && AREAS_12.indexOf(String(area)) >= 0 && candidate.areas.indexOf(String(area)) < 0) candidate.areas.push(String(area));
  candidate.offers = replaceOffers ? mergeCompanyOffers_([], offers) : mergeCompanyOffers_(candidate.offers, offers);
}

function mergeCompanyOffers_(current, incoming) {
  var merged = Array.isArray(current) ? current.slice() : [];
  (Array.isArray(incoming) ? incoming : []).forEach(function(item) {
    if (!item || !String(item.nome || "").trim()) return;
    var name = String(item.nome).trim(), key = normalize_(name);
    var existing = merged.filter(function(value) { return normalize_(value && value.nome) === key; })[0];
    var normalized = { id: String(item.id || ""), nome: name.slice(0, 160), tipo: String(item.tipo || "Produto"), descricao: String(item.descricao || "").slice(0, 500), areas: (Array.isArray(item.areas) ? item.areas : []).filter(function(area) { return AREAS_12.indexOf(String(area)) >= 0; }) };
    if (existing) {
      if (!existing.id && normalized.id) existing.id = normalized.id;
      existing.tipo = normalized.tipo || existing.tipo;
      existing.descricao = normalized.descricao || existing.descricao;
      existing.areas = Array.from(new Set((existing.areas || []).concat(normalized.areas)));
    } else merged.push(normalized);
  });
  return merged.slice(0, 300);
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
    result.push({ name: String(row[1]), cnpj: cnpj, aliases: parseJsonArray_(row[3]), city: String(row[4] || ""), areas: parseJsonArray_(row[5]), offers: parseJsonArray_(row[12]), count: Number(row[6] || 1), cnaeCodigo: String(row[9] || ""), cnae: String(row[10] || ""), cnaesSecundarios: secondary, cnpjDados: { cnaeCodigo: String(row[9] || ""), cnae: String(row[10] || ""), cnaesSecundarios: secondary } });
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
  var areaOfferCompanies = {}, areaOfferCounts = {};
  AREAS_12.forEach(function(area) { areaCounts[area] = 0; areaOfferCompanies[area] = {}; areaOfferCounts[area] = 0; });
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
  var companyLast = companies.getLastRow();
  if (companyLast > 1) companies.getRange(2, 1, companyLast - 1, COMPANIES_HEADERS.length).getValues().forEach(function(row) {
    var cnpj = normalizeCnpj_(row[2]);
    if (!validCnpj_(cnpj) || !isCompanyDirectoryApproved_(cnpj)) return;
    var companyKey = "cnpj:" + cnpj;
    parseJsonArray_(row[12]).forEach(function(offer) {
      if (!offer || !String(offer.nome || "").trim()) return;
      (Array.isArray(offer.areas) ? offer.areas : []).forEach(function(area) {
        if (!areaOfferCompanies.hasOwnProperty(area)) return;
        areaOfferCompanies[area][companyKey] = true;
        areaOfferCounts[area]++;
      });
    });
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
    areas: AREAS_12.map(function(area) { return { name: area, knownSupplierLinks: areaCounts[area], registeredOfferCompanies: Object.keys(areaOfferCompanies[area]).length, registeredOffers: areaOfferCounts[area] }; })
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
