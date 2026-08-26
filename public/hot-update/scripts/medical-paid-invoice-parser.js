function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var invoices = [];
  var re = /<div[^>]*class=["'][^"']*\bf14\b[^"']*\bmt10\b[^"']*\bbgw\b[^"']*["'][^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*\bf14\b[^"']*\bmt10\b[^"']*\bbgw\b|\s*$)/gi, m;
  while ((m = re.exec(html)) !== null) {
    var block = m[2];
    var values = {};
    var summary = /<div[^>]*class=["'][^"']*\bpl20\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
    var summaryHtml = summary ? summary[1] : block;
    var pRe = /<p[^>]*class=["'][^"']*\bmt5\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi, p;
    while ((p = pRe.exec(summaryHtml)) !== null) {
      var sp = /<span[^>]*>([\s\S]*?)<\/span>/i.exec(p[1]);
      var value = sp ? clean(sp[1]) : '';
      var raw = clean(p[1]);
      if (raw.indexOf('发票号') >= 0) values['发票号'] = value;
      if (raw.indexOf('收费时间') >= 0) values['收费时间'] = value;
      if (raw.indexOf('就诊科室') >= 0) values['就诊科室'] = value;
      if (raw.indexOf('就诊时间') >= 0) values['就诊时间'] = value;
    }
    var href = first(block, /<a[^>]*href=["']([^"']*\/payment\/opbilledinvdetail[^"']*)["']/i);
    if (!href) continue;
    var amount = first(block, /<p[^>]*class=["'][^"']*fontmoney[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    invoices.push({
      invoiceNumber: values['发票号'] || '', chargedAt: values['收费时间'] || '',
      departmentName: values['就诊科室'] || '', visitedAt: values['就诊时间'] || '',
      amount: money(amount), href: href
    });
  }
  return JSON.stringify({ schemaVersion: 1, invoices: invoices });
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function money(value) { return clean(value).replace(/^[￥¥]\s*/, ''); }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
