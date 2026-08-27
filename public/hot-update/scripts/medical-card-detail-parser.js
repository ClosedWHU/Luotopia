// Parses a medical card detail page: label/value field pairs plus the
// encrypted card id (extracted from the deleteCard script call).
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var fields = {};
  // Each row is a weui-cell with body (label) and foot (value) divs.
  var re = /<div[^>]*class=["'][^"']*\bweui-cell\b[^"']*["'][^>]*>\s*<div[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*\bweui-cell__ft\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var label = clean(m[1]), value = clean(m[2]);
    if (label && value) fields[label] = value;
  }
  // The encrypted id for the card is embedded in a deleteCard("...") call.
  var encryptedId = '';
  var sRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi, s;
  while ((s = sRe.exec(html)) !== null) {
    var d = /deleteCard\(['"]([^'"]+)['"]\)/.exec(s[1]);
    if (d) { encryptedId = d[1]; break; }
  }
  return JSON.stringify({ schemaVersion: 1, fields: fields, encryptedId: encryptedId });
}
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
