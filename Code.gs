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
var RELATIONS_SHEET_NAME = "Relacoes";
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
  ensureSheet_(ss, COMPANIES_SHEET_NAME, ["Chave", "Nome principal", "CNPJ", "Nomes alternativos JSON", "Cidade", "Áreas JSON", "Ocorrências", "Primeiro registro", "Última atualização"]);
  ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
  return ss.getUrl();
}

function doGet(e) {
  var data = { ok: true, options: readOptions_(), companies: readCompanies_(), network: summarizeNetwork_(), workforce: summarizeWorkforce_() };
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

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var payload = JSON.parse(e && e.postData && e.postData.contents || "{}");
    var ss = getSpreadsheet_();
    ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON"]);
    ensureSheet_(ss, OPTIONS_SHEET_NAME, ["Campo", "Resposta", "Chave normalizada", "Área inferida", "Adicionada em", "Ocorrências"]);
    ensureSheet_(ss, COMPANIES_SHEET_NAME, ["Chave", "Nome principal", "CNPJ", "Nomes alternativos JSON", "Cidade", "Áreas JSON", "Ocorrências", "Primeiro registro", "Última atualização"]);
    ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);

    var responseId = Utilities.getUuid();
    var now = new Date();
    var b = payload.business || {};
    ss.getSheetByName(RESPONSE_SHEET_NAME).appendRow([
      now, responseId, safeCell_(b.nome), safeCell_(b.cnpj), safeCell_(b.cidade), safeCell_(b.areaNecessidade),
      safeCell_(JSON.stringify(payload))
    ]);
    saveContributions_(ss, extractContributions_(payload));
    saveRelations_(ss, payload, responseId, now);
    if (payload.meta && payload.meta.shareDirectory === true) saveCompanies_(ss, payload, now);
    return jsonOutput_({ ok: true, responseId: responseId });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
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

function saveCompanies_(ss, payload, now) {
  var sheet = ss.getSheetByName(COMPANIES_SHEET_NAME);
  var rows = [], b = payload.business || {};
  addCompanyCandidate_(rows, b.nome, b.cnpj, b.cidade, b.areaNecessidade);
  ["suppliers", "customers", "complementary"].forEach(function(key) {
    var group = payload[key] || {};
    (Array.isArray(group.lista) ? group.lista : []).forEach(function(entity) {
      var inferredArea = key === "suppliers" ? inferArea_(entity.categorias || entity.itens) : "";
      addCompanyCandidate_(rows, entity.empresa, entity.cnpj, entity.cidade, entity.areaNecessidade || inferredArea);
    });
  });
  var last = sheet.getLastRow(), existing = {};
  if (last > 1) sheet.getRange(2, 1, last - 1, 9).getValues().forEach(function(row, index) { existing[String(row[0])] = index + 2; });
  rows.forEach(function(candidate) {
    var rowNo = existing[candidate.key];
    if (rowNo) {
      var old = sheet.getRange(rowNo, 1, 1, 9).getValues()[0];
      var aliases = parseJsonArray_(old[3]);
      if (normalize_(old[1]) !== normalize_(candidate.name) && aliases.indexOf(candidate.name) < 0) aliases.push(candidate.name);
      var areas = parseJsonArray_(old[5]);
      candidate.areas.forEach(function(area) { if (areas.indexOf(area) < 0) areas.push(area); });
      sheet.getRange(rowNo, 2, 1, 8).setValues([[
        safeCell_(old[1] || candidate.name), old[2] || candidate.cnpj, JSON.stringify(aliases), safeCell_(old[4] || candidate.city),
        JSON.stringify(areas), Number(old[6] || 0) + 1, old[7] || now, now
      ]]);
    } else {
      sheet.appendRow([candidate.key, safeCell_(candidate.name), candidate.cnpj, JSON.stringify([]), safeCell_(candidate.city),
        JSON.stringify(candidate.areas), 1, now, now]);
      existing[candidate.key] = sheet.getLastRow();
    }
  });
}

function addCompanyCandidate_(rows, name, cnpj, city, area) {
  name = String(name || "").trim();
  cnpj = String(cnpj || "").replace(/\D/g, "");
  if (!name) return;
  if (!validCnpj_(cnpj)) cnpj = "";
  var key = cnpj.length === 14 ? "cnpj:" + cnpj : "name:" + normalize_(name) + "|" + normalize_(city || "");
  var candidate = rows.filter(function(item) { return item.key === key; })[0];
  if (!candidate) { candidate = { key: key, name: name, cnpj: cnpj, city: String(city || ""), areas: [] }; rows.push(candidate); }
  if (area && AREAS_12.indexOf(String(area)) >= 0 && candidate.areas.indexOf(String(area)) < 0) candidate.areas.push(String(area));
}

function readCompanies_() {
  var ss = getSpreadsheet_();
  var sheet = ensureSheet_(ss, COMPANIES_SHEET_NAME, ["Chave", "Nome principal", "CNPJ", "Nomes alternativos JSON", "Cidade", "Áreas JSON", "Ocorrências", "Primeiro registro", "Última atualização"]);
  var last = sheet.getLastRow(), result = [];
  if (last < 2) return result;
  sheet.getRange(2, 1, last - 1, 9).getValues().forEach(function(row) {
    if (!row[1]) return;
    result.push({ name: String(row[1]), cnpj: String(row[2] || ""), aliases: parseJsonArray_(row[3]), city: String(row[4] || ""), areas: parseJsonArray_(row[5]), count: Number(row[6] || 1) });
  });
  result.sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  return result.slice(0, 2000);
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
  var companies = ensureSheet_(ss, COMPANIES_SHEET_NAME, ["Chave", "Nome principal", "CNPJ", "Nomes alternativos JSON", "Cidade", "Áreas JSON", "Ocorrências", "Primeiro registro", "Última atualização"]);
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
  var digits = String(cnpj || "").replace(/\D/g, "");
  if (validCnpj_(digits)) return "cnpj:" + digits;
  return "name:" + normalize_(name);
}

function validCnpj_(value) {
  var s = String(value || "").replace(/\D/g, "");
  if (s.length !== 14 || /^(\d)\1{13}$/.test(s)) return false;
  function digit(base, weights) {
    var sum = 0;
    for (var i = 0; i < weights.length; i++) sum += Number(base.charAt(i)) * weights[i];
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
  var ss = getSpreadsheet_();
  var response = ensureSheet_(ss, RESPONSE_SHEET_NAME, ["Recebido em", "ID da resposta", "Negócio", "CNPJ", "Cidade", "Área inferida", "Dados JSON"]);
  var rel = ensureSheet_(ss, RELATIONS_SHEET_NAME, ["Resposta", "Registrada em", "Empresa de origem", "CNPJ de origem", "Empresa relacionada", "CNPJ relacionado", "Relação", "Áreas relacionadas JSON", "Detalhes JSON"]);
  if (rel.getLastRow() > 1) rel.deleteRows(2, rel.getLastRow() - 1);
  var last = response.getLastRow();
  if (last < 2) return "Nenhuma resposta para reprocessar.";
  response.getRange(2, 1, last - 1, 7).getValues().forEach(function(row) {
    try { saveRelations_(ss, JSON.parse(row[6] || "{}"), row[1], row[0]); } catch (e) {}
  });
  return "Relações antigas reprocessadas. Empresas antigas não foram publicadas no autocomplete sem autorização registrada.";
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
