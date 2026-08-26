function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var items = [];
  var rows = [];
  var trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, tr;
  while ((tr = trRe.exec(html)) !== null) {
    var cells = [], tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi, td;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(td[1]);
    if (cells.length < 2) continue;
    var texts = cells.map(function(c) { return clean(c); });
    if (texts.every(function(t) { return !t; })) continue;
    var parts = nameParts(cells[0]);
    items.push({
      name: parts.name || texts[0], spec: parts.spec,
      quantity: parts.quantity, unitPrice: texts.length > 3 ? texts[3] : '',
      amount: texts.length > 4 ? texts[4] : texts[texts.length - 1],
      packageCount: parts.packageCount
    });
  }
  if (items.length === 0) {
    var cellRe = /<div[^>]*class=["'][^"']*\bweui-cell\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, cell;
    while ((cell = cellRe.exec(html)) !== null) {
      var block = cell[1];
      var bd = /<div[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
      var ft = /<div[^>]*class=["'][^"']*\bweui-cell__ft\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
      var parts2 = bd ? nameParts(bd[1]) : { name: '', spec: '', quantity: '', packageCount: null };
      var amount2 = first(block, /<span[^>]*class=["'][^"']*fontmoney[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || (ft ? clean(ft[1]) : '');
      if (!parts2.name && !amount2) continue;
      items.push({ name: parts2.name, spec: parts2.spec, quantity: parts2.quantity, unitPrice: '', amount: amount2, packageCount: parts2.packageCount });
    }
  }
  return JSON.stringify({ schemaVersion: 1, items: items });
}
function nameParts(cellHtml) {
  var pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/i;
  var pMatch = pRe.exec(cellHtml);
  var quantityText = pMatch ? clean(pMatch[1]) : '';
  var rawText = clean(cellHtml);
  var rawName = quantityText ? rawText.replace(quantityText, '').trim() : rawText;
  var specStart = rawName.lastIndexOf('['), specEnd = rawName.lastIndexOf(']');
  var hasSpec = specStart >= 0 && specEnd > specStart;
  var name = hasSpec ? rawName.substring(0, specStart).trim() : rawName;
  var spec = hasSpec ? rawName.substring(specStart, specEnd + 1).trim() : '';
  var quantity = quantityText.replace(/^数量\s*[:：]?\s*/, '').trim();
  var total = parseInt(quantity, 10);
  if (isNaN(total)) total = null;
  var specBody = spec.length >= 2 ? spec.substring(1, spec.length - 1).trim() : spec;
  var unitMatch = /(?:\*|^)(\d+)$/.exec(specBody);
  var perPackage = unitMatch ? parseInt(unitMatch[1], 10) : null;
  var packageCount = total != null && perPackage != null && perPackage > 0 ? Math.floor(total / perPackage) : null;
  return { name: name, spec: spec, quantity: quantity === '' ? quantityText : quantity, packageCount: packageCount };
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
