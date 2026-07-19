function parse(rawJson) {
  var input = JSON.parse(rawJson), content = '' + (input.content || ''), fileName = '' + (input.fileName || '');
  return JSON.stringify(input.format === 'legacy' ? parseLegacy(content) : parseCsv(content, fileName));
}
function parseCsv(content, fileName) {
  var lines = content.split(/\r?\n/).filter(function(line) { return line.trim().length > 0; });
  if (lines.length < 2) throw new Error('CSV has no courses');
  var items = [];
  for (var i = 1; i < lines.length; i++) {
    var row = splitCsv(lines[i]);
    if (row.length < 7) throw new Error('CSV row has fewer than seven columns');
    var day = parseStrictInt(row[1]), startNode = parseStrictInt(row[2]), endNode = parseStrictInt(row[3]);
    if (day < 1 || day > 7 || startNode < 1 || endNode < startNode) throw new Error('invalid CSV slot');
    items.push({ name: row[0], day: day, startNode: startNode, endNode: endNode, teacher: row[4] === '无' ? '' : row[4], location: row[5] === '无' ? '' : row[5], weekMeta: row[6] });
  }
  return { name: fileName.replace(/\.[^.]+$/, ''), items: items };
}
function parseLegacy(content) {
  var lines = content.split(/\r?\n/);
  if (lines.length < 5) throw new Error('incomplete WakeUp file');
  var table = JSON.parse(lines[2]), base = JSON.parse(lines[3]), details = JSON.parse(lines[4]), names = {};
  for (var i = 0; i < base.length; i++) names['' + base[i].id] = base[i].courseName || '未命名课程';
  var items = [];
  for (var j = 0; j < details.length; j++) {
    var detail = details[j];
    if (!Number.isInteger(detail.day) || !Number.isInteger(detail.startNode)) continue;
    var step = Number.isInteger(detail.step) ? detail.step : 1, suffix = detail.type === 1 ? '单' : (detail.type === 2 ? '双' : '');
    items.push({ name: names['' + detail.id] || '未命名课程', day: detail.day, startNode: detail.startNode, endNode: detail.startNode + step - 1, teacher: typeof detail.teacher === 'string' ? detail.teacher : '', location: typeof detail.room === 'string' ? detail.room : '', weekMeta: (detail.startWeek || 1) + '-' + (detail.endWeek || 30) + suffix });
  }
  if (items.length === 0) throw new Error('no WakeUp courses');
  return { name: typeof table.tableName === 'string' ? table.tableName : 'WakeUp 课程表', items: items };
}
function splitCsv(line) {
  var values = [], value = '', quoted = false;
  for (var i = 0; i < line.length; i++) { var ch = line.charAt(i); if (ch === '"') { if (quoted && line.charAt(i + 1) === '"') { value += '"'; i++; } else quoted = !quoted; } else if (ch === ',' && !quoted) { values.push(value); value = ''; } else value += ch; }
  values.push(value); return values;
}
function parseStrictInt(value) { var text = ('' + value).trim(); return /^\d+$/.test(text) ? parseInt(text, 10) : -1; }
