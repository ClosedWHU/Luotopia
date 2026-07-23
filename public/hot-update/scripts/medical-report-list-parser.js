function parse(rawJson) {
  var input = JSON.parse(rawJson), html = text(input.html), kind = text(input.kind) || 'page';
  if (kind === 'fragment') return JSON.stringify({ schemaVersion: 1, reports: reports(html, text(input.type)), isLast: false });
  var laboratoryReports = reports(block(html, 'lisId'), 'laboratory');
  var examinationReports = reports(block(html, 'risId'), 'examination');
  return JSON.stringify({
    schemaVersion: 1,
    laboratoryReports: laboratoryReports,
    examinationReports: examinationReports,
    laboratoryIsLast: laboratoryReports.length === 0 || loadEnd(html, 'lis'),
    examinationIsLast: examinationReports.length === 0 || loadEnd(html, 'ris')
  });
}
function reports(html, type) {
  var fn = type === 'examination' ? 'risReportDetail' : 'lisReportDetail', path = type === 'examination' ? 'risreportdetail' : 'lisreportdetail';
  var pattern = "<div[^>]*class=[\"'][^\"']*\\bf14\\b[^\"']*\\bmt10\\b[^\"']*[\"'][^>]*>[\\s\\S]*?<a[^>]*onclick=[\"']" + fn + "\\(([^)]*)\\)[\"'][^>]*>[\\s\\S]*?</a>[\\s\\S]*?</div>\\s*</div>";
  var out = [], re = new RegExp(pattern, 'gi'), m;
  while ((m = re.exec(html)) !== null) { var card=m[0], args=quoted(m[1]); if(args.length<3)continue; var headings=texts(card.substring(0,card.indexOf('<a'))), linkText=texts(card.substring(card.indexOf('<a'))); out.push({title:headings[0]||'',metadata:headings.slice(1),reportedAt:linkText[0]||'',status:cellFooter(card),detail:{path:path,admId:args[0],ordItemId:args[1],thirdId:args[2]}}); }
  return out;
}
function block(html,id){var pattern="<div[^>]*id=[\"']"+id+"[\"'][^>]*>([\\s\\S]*?)(?=<div[^>]*id=[\"']|<div[^>]*class=[\"'][^\"']*weui-loadmore|$)";var m=new RegExp(pattern,'i').exec(html);return m?m[1]:'';}
function loadEnd(html,prefix){var m=new RegExp(prefix+"LoadEnd\\s*=\\s*!!\\(\\s*['\"]([^'\"]*)['\"]\\s*\\)",'i').exec(html);if(m)return m[1]!==''&&m[1]!=='0'&&m[1].toLowerCase()!=='false';m=new RegExp(prefix+'LoadEnd\\s*=\\s*(true|false)','i').exec(html);return!!m&&m[1]==='true';}
function quoted(value){var out=[],re=/["']([^"']*)["']/g,m;while((m=re.exec(value))!==null)out.push(decode(m[1]));return out;}
function texts(html){var out=[],re=/<p\b[^>]*>([\s\S]*?)<\/p>/gi,m;while((m=re.exec(html))!==null){var t=clean(m[1]);if(t)out.push(t);}return out;}
function cellFooter(html){var m=/<(?:div|span|p)\b[^>]*class=["'][^"']*weui-cell__ft[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/i.exec(html);return m?clean(m[1]):'';}
function clean(value){return decode(text(value).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function decode(value){return text(value).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').trim();}
function text(value){return value===undefined||value===null?'':String(value);}
