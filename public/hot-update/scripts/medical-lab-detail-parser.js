function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html), out = [], re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var cells = [], cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi, c;
    while ((c = cellRe.exec(m[1])) !== null) cells.push(clean(c[1]));
    if (cells.length < 6 || cells[0] === '项目名称') continue;
    out.push({ itemName: cells[0], abbreviation: cells[1], result: cells[2], unit: cells[3], abnormal: cells[4], referenceRange: cells[5] });
  }
  return JSON.stringify({ schemaVersion: 1, results: out });
}
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
