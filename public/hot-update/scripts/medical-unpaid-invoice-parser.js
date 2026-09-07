// Parses the unpaid (owed) outpatient bill list into a list of invoices,
// extracting invoice number, charged time, department, visit time, amount, and
// the payment href. An owed bill links to the order/payment page
// (`opbillorderlist`), not to an invoice detail page, and its labels are
// separated from the value by `&nbsp;:&nbsp;` with the currency symbol nested
// in its own span.
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html), invoices = [];
  var re = /<div[^>]*class=["'][^"']*\bbgw\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']*\/payment\/(?:opbillorderlist|opbilldetail|opbilledinvdetail)[^"']*)["'][\s\S]*?<\/div>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var block = m[0];
    invoices.push({ invoiceNumber: field(block, ['发票号', '账单号', '订单号']), chargedAt: field(block, ['收费时间', '缴费时间', '创建时间']), departmentName: field(block, ['就诊科室', '科室']), visitedAt: field(block, ['就诊时间', '就诊日期']), amount: moneyAt(block), href: m[1], isPaid: false });
  }
  return JSON.stringify({ schemaVersion: 1, invoices: invoices });
}
function field(html, labels) { for (var i = 0; i < labels.length; i++) { var re = new RegExp('<(?:p|div|span)[^>]*>[\\s\\S]*?' + labels[i] + '[^<]*<span[^>]*>([\\s\\S]*?)<\\/span>', 'i'), m = re.exec(html); if (m) return clean(m[1]); } return ''; }
function moneyAt(html) { var re = /<(p|div|span)[^>]*class=["'][^"']*\bfontmoney\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i, m = re.exec(html); return m ? money(m[2]) : ''; }
function money(value) { return clean(value).replace(/^[￥¥]\s*/, ''); }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
