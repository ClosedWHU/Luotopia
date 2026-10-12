// Parses the unpaid outpatient bill page (`payment/opbillorderlist`) into the
// invoice-detail shape the app already renders.
//
// This is a different document from the paid invoice detail
// (`payment/opbilledinvdetail`) and shares none of its markers: there is no
// `#prtId`, no `display:block` info cell and no `<li id>` charge categories.
// What it has instead is a `就诊人` banner, one `<a class="lcount">` block per
// owed line, and a `postFix` footer carrying 总计/折后.
//
// The owed lines arrive fully rendered, so unlike the paid page there is no
// second request per category: the items are attached to their category here.
// 医嘱分类 plays the role the paid page's category headers do, so lines are
// grouped by it.
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var items = [];
  var blockRe = /<a\b[^>]*class=["'][^"']*\blcount\b[^"']*["'][\s\S]*?<\/a>/gi;
  var block;
  while ((block = blockRe.exec(html)) !== null) {
    var chunk = block[0];
    var nameCell = /<p[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(chunk);
    var amountCell = /<div[^>]*class=["'][^"']*\bfont-blue\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(chunk);
    var fields = labelFields(chunk);
    var parts = nameParts(nameCell ? nameCell[1] : '');
    var quantity = fields['数量'] || '';
    var amount = amountCell ? clean(amountCell[1]) : '';
    if (!parts.name && !amount) continue;
    items.push({
      category: fields['医嘱分类'] || '',
      item: {
        name: parts.name,
        spec: parts.spec,
        quantity: quantity,
        unitPrice: fields['单价'] || '',
        amount: amount,
        // 数量 is already counted in packages ("4盒(21)"), so its leading
        // integer is the package count; the paid page derives the same number
        // by dividing a total quantity by the spec's per-package factor.
        packageCount: leadingInt(quantity)
      }
    });
  }
  var categories = [];
  var byTitle = {};
  for (var i = 0; i < items.length; i++) {
    var title = items[i].category;
    if (!has(byTitle, title)) {
      byTitle[title] = categories.length;
      categories.push({ id: '', title: title, amount: '', items: [] });
    }
    categories[byTitle[title]].items.push(items[i].item);
  }
  return JSON.stringify({
    schemaVersion: 1,
    patientName: patientName(html),
    totalAmount: labelledAmount(html, '总计'),
    discountAmount: labelledAmount(html, '折后'),
    categories: categories
  });
}
// The banner reads "就诊人: &nbsp;*旭祺"; the name is masked at the source, so
// it is passed through verbatim.
function patientName(html) {
  var m = /<p[^>]*class=["'][^"']*\bbgyellow\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!m) return '';
  var label = clean(m[1]);
  var at = label.indexOf('就诊人');
  if (at < 0) return '';
  return label.substring(at + 3).replace(/^[\s:：]*/, '').trim();
}
// Reads a "<span>总计：</span><span>247.62元</span>" pair out of the footer.
// A bill with nothing owed still renders the footer, with the bare currency
// symbol where the number would be; that is not an amount.
function labelledAmount(html, label) {
  var re = new RegExp('<span[^>]*>\\s*' + label + '\\s*[:：]?\\s*<\\/span>(?:\\s|&nbsp;)*<span[^>]*>([\\s\\S]*?)<\\/span>', 'i');
  var m = re.exec(html);
  if (!m) return '';
  var value = clean(m[1]);
  return /\d/.test(value) ? value : '';
}
// Collects the "<span>label:</span>&nbsp;<span>value</span>" rows that follow
// each owed line (医嘱分类 / 单价 / 数量).
function labelFields(chunk) {
  var out = {};
  var re = /<span[^>]*>([\s\S]*?)<\/span>(?:\s|&nbsp;)*<span[^>]*>([\s\S]*?)<\/span>/gi;
  var m;
  while ((m = re.exec(chunk)) !== null) {
    var label = clean(m[1]).replace(/[\s:：]+$/, '');
    if (label && !has(out, label)) out[label] = clean(m[2]);
  }
  return out;
}
// Splits "枸橼酸坦度螺酮片(希德)[10mg*21]" into name and bracketed spec.
function nameParts(cellHtml) {
  var raw = clean(cellHtml);
  var start = raw.lastIndexOf('[');
  var end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return { name: raw, spec: '' };
  return {
    name: raw.substring(0, start).trim(),
    spec: raw.substring(start, end + 1).trim()
  };
}
function leadingInt(value) {
  var m = /^(\d+)/.exec(clean(value));
  return m ? parseInt(m[1], 10) : null;
}
function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
