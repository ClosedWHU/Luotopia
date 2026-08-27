// Parses a registration detail page: label/value field pairs plus the fee.
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var fields = {};
  // Each <li class="weui-flex"><p class="justifynow">label</p><span class="font333">value</span>
  var re = /<li[^>]*class=["'][^"']*\bweui-flex\b[^"']*["'][^>]*>\s*<p[^>]*class=["'][^"']*\bjustifynow\b[^"']*["'][^>]*>([\s\S]*?)<\/p>\s*<span[^>]*class=["'][^"']*font333[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var label = clean(m[1]), value = clean(m[2]);
    if (label && value) fields[label] = value;
  }
  // Locate the registration fee block and extract the highlighted amount.
  var fee = '';
  var pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi, p;
  while ((p = pRe.exec(html)) !== null) {
    if (clean(p[1]).indexOf('挂号费用') >= 0) {
      fee = first(p[1], /<span[^>]*class=["'][^"']*\bf18\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      break;
    }
  }
  return JSON.stringify({ schemaVersion: 1, fields: fields, fee: fee });
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
