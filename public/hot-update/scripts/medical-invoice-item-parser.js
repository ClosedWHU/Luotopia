// Parses invoice line items from either a <table> layout or a weui-cell
// fallback layout. Each item includes name, spec, quantity, unit price,
// amount, and an optional package count derived from the spec.
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var items = [];
  var rows = [];
  // Primary layout: table rows where columns are name/spec/quantity/price/amount.
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
  // Fallback layout: weui-cell body/footer pairs when no table rows matched.
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
// Splits a cell's HTML into name, spec (in brackets), quantity (from <p>), and
// a package count (derived from total quantity and spec's trailing "*N").
function nameParts(cellHtml) {
  var pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/i;
  var pMatch = pRe.exec(cellHtml);
  // quantityText comes from a <p> child (often "数量: 10").
  var quantityText = pMatch ? clean(pMatch[1]) : '';
  // rawName is the cell text without the quantity portion.
  var rawText = clean(cellHtml);
  var rawName = quantityText ? rawText.replace(quantityText, '').trim() : rawText;
  // spec is the last bracketed token in the name (e.g. "[10*5]").
  var specStart = rawName.lastIndexOf('['), specEnd = rawName.lastIndexOf(']');
  var hasSpec = specStart >= 0 && specEnd > specStart;
  var name = hasSpec ? rawName.substring(0, specStart).trim() : rawName;
  var spec = hasSpec ? rawName.substring(specStart, specEnd + 1).trim() : '';
  var quantity = quantityText.replace(/^数量\s*[:：]?\s*/, '').trim();
  var total = parseInt(quantity, 10);
  if (isNaN(total)) total = null;
  // perPackage comes from a trailing "*N" in the spec body.
  var specBody = spec.length >= 2 ? spec.substring(1, spec.length - 1).trim() : spec;
  var unitMatch = /(?:\*|^)(\d+)$/.exec(specBody);
  var perPackage = unitMatch ? parseInt(unitMatch[1], 10) : null;
  var packageCount = total != null && perPackage != null && perPackage > 0 ? Math.floor(total / perPackage) : null;
  return { name: name, spec: spec, quantity: quantity === '' ? quantityText : quantity, packageCount: packageCount };
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
