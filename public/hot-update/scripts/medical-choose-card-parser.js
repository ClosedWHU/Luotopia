// Parses the "choose card" page, where each card is an onclick="chooseCard(...)"
// listing arguments 0 (name), 3 (encrypted id), 4 (display number).
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var cards = [];
  var re = /onclick=["'][^"']*chooseCard\(([^)]*)\)[^"']*["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    // Strip surrounding quotes from each comma-separated argument.
    var args = m[1].split(',').map(function(s) { return s.trim().replace(/^['"]|['"]$/g, ''); });
    if (args.length < 5) continue;
    // peek at the next match to bound the current card's HTML block
    var end = re.lastIndex;
    var next = re.exec(html);
    var blockEnd = next ? next.index : html.length;
    re.lastIndex = end;
    var block = html.substring(m.index, blockEnd);
    var cardType = '';
    var ct = /卡类型[\s\S]*?<span[^>]*class=["'][^"']*font333[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block);
    if (ct) cardType = clean(ct[1]);
    var isDefault = /class=["'][^"']*\bbgdefault\b/.test(block);
    cards.push({ patientName: args[0], cardDisplay: args[4], cardType: cardType, encryptedId: args[3], isDefault: isDefault });
  }
  return JSON.stringify({ schemaVersion: 1, cards: cards });
}
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
