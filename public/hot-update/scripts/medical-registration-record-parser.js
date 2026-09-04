// Parses the registration history list into a list of records, extracting
// doctor, status, department/type, visit date/session, and fee.
function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var html = text(input.html);
  var records = [];
  var tabs = [{ id: 'tab1', pending: true }, { id: 'tab2', pending: false }];
  for (var t = 0; t < tabs.length; t++) {
    var tab = new RegExp("<div[^>]*id=[\"']" + tabs[t].id + "[\"'][^>]*>([\\s\\S]*?)(?=<div[^>]*id=[\"']tab[12][\"']|<script|$)", "i").exec(html);
    if (!tab) continue;
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
    while ((m = re.exec(tab[1])) !== null) {
      if (!/\bclass=["'][^"']*\blcount\b[^"']*["']/i.test(m[1])) continue;
      var hrefMatch = /\bhref=["']([^"']+)["']/i.exec(m[1]);
      if (!hrefMatch) continue;
      var href = hrefMatch[1], block = m[2];
    var summary = /<div[^>]*class=["'][^"']*\bpl20\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
    var summaryHtml = summary ? summary[1] : block;
    // department / registration type come from the first p with opacity90
    var firstSpans = spans(summaryHtml, /<p[^>]*class=["'][^"']*font333[^"']*\bopacity90\b[^"']*["'][^>]*>(?:[^<]*<span[^>]*>([\s\S]*?)<\/span>){0,}/i);
    // date / session come from the first p with mt10
    var dateSpans = spans(summaryHtml, /<p[^>]*class=["'][^"']*\bmt10\b[^"']*["'][^>]*>(?:[^<]*<span[^>]*>([\s\S]*?)<\/span>){0,}/i);
    var doctor = first(block, /<div[^>]*class=["'][^"']*\bweui-cell_access\b[^"']*["'][^>]*>\s*<p[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    var fee = first(block, /<p[^>]*class=["'][^"']*fontmoney[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      var rawStatus = first(block, /<div[^>]*class=["'][^"']*\bweui-cell__ft\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      var pending = rawStatus.indexOf('待就诊') >= 0;
      records.push({
      doctorName: doctor, status: pending ? '待就诊' : '已就诊', isPending: pending,
      departmentName: firstSpans[0] || '', registrationType: firstSpans[1] || '',
      visitDate: dateSpans[0] || '', session: dateSpans[1] || '',
      fee: money(fee), href: href
    });
    }
  }
  if (records.length === 0 && html.indexOf('lcount') >= 0) {
    var fallbackRe = /<a[^>]*class=["'][^"']*\blcount\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, fallback;
    while ((fallback = fallbackRe.exec(html)) !== null) {
      var fallbackBlock = fallback[2];
      var fallbackSummary = /<div[^>]*class=["'][^"']*\bpl20\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(fallbackBlock);
      var fallbackHtml = fallbackSummary ? fallbackSummary[1] : fallbackBlock;
      var fallbackFirst = spans(fallbackHtml, /<p[^>]*class=["'][^"']*font333[^"']*\bopacity90\b[^"']*["'][^>]*>(?:[^<]*<span[^>]*>([\s\S]*?)<\/span>){0,}/i);
      var fallbackDate = spans(fallbackHtml, /<p[^>]*class=["'][^"']*\bmt10\b[^"']*["'][^>]*>(?:[^<]*<span[^>]*>([\s\S]*?)<\/span>){0,}/i);
      var fallbackStatus = first(fallbackBlock, /<div[^>]*class=["'][^"']*\bweui-cell__ft\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      var fallbackDoctor = first(fallbackBlock, /<p[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      var fallbackPending = fallbackStatus.indexOf('待就诊') >= 0;
      records.push({ doctorName: fallbackDoctor, status: fallbackPending ? '待就诊' : '已就诊', isPending: fallbackPending, departmentName: fallbackFirst[0] || '', registrationType: fallbackFirst[1] || '', visitDate: fallbackDate[0] || '', session: fallbackDate[1] || '', fee: money(first(fallbackBlock, /<p[^>]*class=["'][^"']*fontmoney[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)), href: fallback[1] });
    }
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
