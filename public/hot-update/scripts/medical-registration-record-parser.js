// Parses the registration history list into a list of records, extracting
// doctor, status, department/type, visit date/session, and fee.
function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var html = text(input.html);
  var records = [];
  // Each record is an <a class="lcount" href="...">...</a> block.
  var re = /<a[^>]*class=["'][^"']*\blcount\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var href = m[1], block = m[2];
    var summary = /<div[^>]*class=["'][^"']*\bpl20\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
    var summaryHtml = summary ? summary[1] : block;
    // department / registration type come from the first p with opacity90
    var firstSpans = spans(summaryHtml, /<p[^>]*class=["'][^"']*font333[^"']*\bopacity90\b[^"']*["'][^>]*>(?:[^<]*<span[^>]*>([\s\S]*?)<\/span>){0,}/i);
    // date / session come from the first p with mt10
    var dateSpans = spans(summaryHtml, /<p[^>]*class=["'][^"']*\bmt10\b[^"']*["'][^>]*>(?:[^<]*<span[^>]*>([\s\S]*?)<\/span>){0,}/i);
    var doctor = first(block, /<div[^>]*class=["'][^"']*\bweui-cell_access\b[^"']*["'][^>]*>\s*<p[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    var status = first(block, /<div[^>]*class=["'][^"']*\bweui-cell_access\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*\bweui-cell__ft\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    var fee = first(block, /<p[^>]*class=["'][^"']*fontmoney[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    records.push({
      doctorName: doctor, status: status,
      departmentName: firstSpans[0] || '', registrationType: firstSpans[1] || '',
      visitDate: dateSpans[0] || '', session: dateSpans[1] || '',
      fee: money(fee), href: href
    });
  }
  return JSON.stringify({ schemaVersion: 1, records: records });
}
// Collects span texts within the first <p> matching pRe in html.
function spans(html, pRe) {
  var m = pRe.exec(html); if (!m) return [];
  var pHtml = m[0], out = [], re = /<span[^>]*>([\s\S]*?)<\/span>/gi, s;
  while ((s = re.exec(pHtml)) !== null) out.push(clean(s[1]));
  return out;
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function money(value) { return clean(value).replace(/^[￥¥]\s*/, ''); }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
