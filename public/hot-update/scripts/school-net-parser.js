function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var operation = input.operation;
  var html = typeof input.html === 'string' ? input.html : '';
  if (operation === 'landing') return JSON.stringify(parseLanding(html));
  if (operation === 'plan') return JSON.stringify(parsePlan(html));
  if (operation === 'devices') return JSON.stringify(parseDevices(html));
  return JSON.stringify({ operation: 'invalid' });
}

function parseLanding(html) {
  if (/\bid=["']resume["']/i.test(html)) {
    return { operation: 'landing', status: 'suspended' };
  }
  if (/\bid=["']suspend["']/i.test(html)) {
    return { operation: 'landing', status: 'active' };
  }
  var text = visibleText(html);
  if (/(^|\s)恢复($|\s)/.test(text)) {
    return { operation: 'landing', status: 'suspended' };
  }
  if (/(^|\s)暂停($|\s)/.test(text)) {
    return { operation: 'landing', status: 'active' };
  }
  return { operation: 'landing', status: null };
}

function parsePlan(html) {
  var text = visibleText(html);
  var rawStatus = field(text, '当前状态');
  return {
    operation: 'plan',
    status: rawStatus === '正常' ? 'active' : rawStatus === '暂停' ? 'suspended' : null,
    planName: field(text, '当前套餐'),
    planEndDate: field(text, '套餐截止日'),
    suspendedSince: field(text, '上次自助暂停时间')
  };
}

function parseDevices(html) {
  var devices = [];
  var ipPattern = /<input\b[^>]*\bid=["']userIp([^"']*)["'][^>]*>/gi;
  var match;
  while ((match = ipPattern.exec(html)) !== null) {
    var recordId = match[1];
    if (!recordId) continue;
    var rowStart = html.toLowerCase().lastIndexOf('<tr', match.index);
    var rowEnd = html.toLowerCase().indexOf('</tr>', match.index);
    var container = rowStart >= 0 && rowEnd >= 0
      ? html.substring(rowStart, rowEnd + 5)
      : html.substring(Math.max(0, match.index - 2000), Math.min(html.length, match.index + 2000));
    var ipAddress = attribute(match[0], 'value');
    var cancelTag = findInputByValue(container, '取消无感认证');
    devices.push({
      name: hiddenValue(container, 'inputrow') || labelTitle(container) || '我的设备',
      onlineSince: hiddenValue(container, 'createTimeStr'),
      ipAddress: ipAddress,
      macAddress: hiddenValue(container, 'usermac'),
      cancelId: cancelTag ? actionArgument(attribute(cancelTag, 'onclick')) : null
    });
  }
  var text = visibleText(html);
  var title = firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return {
    operation: 'devices',
    recognized: devices.length > 0 || text.indexOf('我的设备') !== -1 || visibleText(title || '').indexOf('校园网自助服务系统') !== -1,
    devices: devices
  };
}

function visibleText(html) {
  return decodeEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function field(text, label) {
  var labels = ['当前状态', '上次自助暂停时间', '当前套餐', '套餐截止日', '暂停后效果', '恢复后效果'];
  var following = labels.filter(function(value) { return value !== label; }).join('|');
  var match = new RegExp(label + '\\s*[：:]\\s*(.*?)(?=\\s*(?:(?:' + following + ')\\s*[：:]|$))').exec(text);
  return match && match[1].trim() ? match[1].trim() : null;
}

function hiddenValue(container, prefix) {
  var pattern = new RegExp("<input\\b[^>]*\\bid=[\"']" + prefix + "[^\"']*[\"'][^>]*>", 'i');
  var match = pattern.exec(container);
  return match ? clean(attribute(match[0], 'value')) : null;
}

function findInputByValue(container, value) {
  var inputs = container.match(/<input\b[^>]*>/gi) || [];
  for (var i = 0; i < inputs.length; i++) {
    if (attribute(inputs[i], 'value') === value) return inputs[i];
  }
  return null;
}

function labelTitle(container) {
  var match = /<label\b[^>]*\btitle=(["'])(.*?)\1/i.exec(container);
  return match ? clean(match[2]) : null;
}

function actionArgument(onclick) {
  if (!onclick) return null;
  var pattern = /["']([^"']+)["']/g;
  var match;
  var value = null;
  while ((match = pattern.exec(onclick)) !== null) value = match[1];
  return clean(value);
}

function attribute(tag, name) {
  var match = new RegExp("\\b" + name + "=([\"'])(.*?)\\1", 'i').exec(tag);
  return match ? decodeEntities(match[2]) : null;
}

function firstMatch(value, pattern) {
  var match = pattern.exec(value);
  return match ? match[1] : null;
}

function clean(value) {
  if (value === null || value === undefined) return null;
  value = decodeEntities(('' + value).trim());
  return value ? value : null;
}

function decodeEntities(value) {
  return (value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
