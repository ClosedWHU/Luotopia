function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html), invoices = [];
  var re = /<div[^>]*class=["'][^"']*\bbgw\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']*\/payment\/(?:opbilldetail|opbilledinvdetail)[^"']*)["'][\s\S]*?<\/div>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var block = m[0];
    var amount = first(block, /<(?:p|div|span)[^>]*class=["'][^"']*\bfontmoney\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    invoices.push({ invoiceNumber: field(block, ['发票号', '账单号', '订单号']), chargedAt: field(block, ['收费时间', '缴费时间', '创建时间']), departmentName: field(block, ['就诊科室', '科室']), visitedAt: field(block, ['就诊时间', '就诊日期']), amount: money(amount), href: m[1], isPaid: false });
  }
  return JSON.stringify({ schemaVersion: 1, invoices: invoices });
}
function field(html, labels) { for (var i = 0; i < labels.length; i++) { var re = new RegExp('<(?:p|div|span)[^>]*>[\\s\\S]*?' + labels[i] + '\\s*[:：]?\\s*<span[^>]*>([\\s\\S]*?)<\\/span>', 'i'), m = re.exec(html); if (m) return clean(m[1]); } return ''; }
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function money(value) { return clean(value).replace(/^[￥¥]\s*/, ''); }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
