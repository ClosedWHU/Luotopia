function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var cards = [];
  var re = /class=["'][^"']*cardlist[^"']*["'][^>]*>([\s\S]*?)(?=class=["'][^"']*cardlist[^"']*["']|$)/gi, m;
  while ((m = re.exec(html)) !== null) {
    var block = m[1];
    if (block.indexOf('font333') < 0) continue;
    var name = spanField(block, '姓名'), card = spanField(block, '常用卡'), cardType = spanField(block, '卡类型');
    var encMatch = /<input[^>]*name=["']cardlist["'][^>]*>/i.exec(block);
    var encryptedId = '', isDefault = false;
    if (encMatch) { var v = /value=["']([^"']*)["']/i.exec(encMatch[0]); encryptedId = v ? v[1] : ''; isDefault = /\bchecked\b/i.test(encMatch[0]); }
    if (name || card) cards.push({ patientName: name, cardDisplay: card, cardType: cardType, encryptedId: encryptedId, isDefault: isDefault });
  }
  return JSON.stringify({ schemaVersion: 1, cards: cards });
}
function spanField(block, label) {
  var re = new RegExp(label + '[\\s\\S]*?<span[^>]*class=["\'][^"\']*font333[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/span>', 'i');
  var m = re.exec(block); return m ? clean(m[1]) : '';
}
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
