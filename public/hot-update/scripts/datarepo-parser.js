function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var body = input.body || '';
  var html = extractHtml(body);
  var texts = extractTexts(html);
  var pairs = labelValuePairs(texts);
  var blob = texts.join('\n');

  var studentId = pick(pairs, blob, ['\u5b66\u53f7']);
  if (!studentId) {
    var m = blob.match(/(?<![0-9])(20\d{8,12})(?![0-9])/);
    studentId = m ? m[1] : '';
  }

  var name = pick(pairs, blob, ['\u5b66\u751f\u59d3\u540d']);
  if (!name) name = pairs['\u59d3\u540d'] || '';
  if (!name) name = guessName(texts, studentId);

  return JSON.stringify({
    studentId: studentId,
    name: name,
    college: pick(pairs, blob, ['\u5b66\u9662\u540d\u79f0', '\u5f55\u53d6\u5b66\u9662', '\u5b66\u9662']),
    major: pick(pairs, blob, ['\u4e13\u4e1a\u540d\u79f0', '\u5f55\u53d6\u4e13\u4e1a', '\u4e13\u4e1a']),
    className: pick(pairs, blob, ['\u6559\u5b66\u73ed\u7ea7', '\u73ed\u7ea7\u540d\u79f0', '\u73ed\u7ea7']),
    grade: pick(pairs, blob, ['\u5e74\u7ea7', '\u5f55\u53d6\u5e74\u4efd']),
    gender: pick(pairs, blob, ['\u6027\u522b']),
    ethnicity: pick(pairs, blob, ['\u6c11\u65cf']),
    politicalStatus: pick(pairs, blob, ['\u653f\u6cbb\u9762\u8c8c']),
    studentType: pick(pairs, blob, ['\u5b66\u751f\u7c7b\u522b']),
    educationalYears: pick(pairs, blob, ['\u5b9e\u9645\u5b66\u5236', '\u5b66\u5236']),
    shift: pick(pairs, blob, ['\u5728\u6821\u72b6\u6001', '\u5b66\u7c4d\u72b6\u6001']),
    dormRaw: pick(pairs, blob, ['\u4f4f\u5bbf\u4fe1\u606f', '\u5bbf\u820d', '\u5bbf\u820d\u4fe1\u606f'])
  });
}

function extractHtml(body) {
  var trimmed = body.trim();
  if (trimmed.charAt(0) === '{') {
    try {
      var decoded = JSON.parse(trimmed);
      if (decoded && decoded.html) return decoded.html;
    } catch (e) {}
  }
  return body;
}

function extractTexts(html) {
  var cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ');
  var result = [];
  var pattern = />([^<>{]{1,80})</g;
  var m;
  while ((m = pattern.exec(cleaned)) !== null) {
    var text = decodeEntities(m[1]).trim();
    if (!text) continue;
    if (text === 'script' || text === 'div' || text === 'table') continue;
    result.push(text);
  }
  return result;
}

function labelValuePairs(texts) {
  var pairs = {};
  for (var i = 0; i < texts.length - 1; i++) {
    var raw = texts[i];
    var label = raw.replace(/[：:]\s*$/, '').trim();
    var hadColon = raw.indexOf('\uff1a') !== -1 || raw.endsWith(':');
    if (!hadColon) continue;
    var value = texts[i + 1].trim();
    if (!value) continue;
    if (value.endsWith('\uff1a') || value.endsWith(':')) continue;
    if (!pairs[label]) pairs[label] = value;
  }
  return pairs;
}

function pick(pairs, blob, keys) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (pairs[key] && pairs[key].trim()) return pairs[key].trim();
    var inline = matchLabeled(blob, key);
    if (inline) return inline;
  }
  return '';
}

function matchLabeled(blob, label) {
  var pattern = new RegExp('(?:^|[\\n\\r])\\s*' + escapeRegExp(label) + '[：:\\s]+([^\\n\\r：:]{1,80})', 'm');
  var m = pattern.exec(blob);
  if (!m) return '';
  return m[1].trim().split(/\s{2,}/)[0].trim();
}

function guessName(texts, studentId) {
  for (var i = 0; i < texts.length - 1; i++) {
    var label = texts[i].replace(/[：:]\s*$/, '');
    if (label === '\u59d3\u540d' || label === '\u5b66\u751f\u59d3\u540d') {
      var value = texts[i + 1].trim();
      if (value && value !== studentId) return value;
    }
  }
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    if (studentId && t === studentId) continue;
    if (/^[\u4e00-\u9fff\u00b7]{2,8}$/.test(t)) return t;
  }
  return '';
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
