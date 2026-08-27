// Parses an invoice detail page: patient info, registration number, parsed
// charge categories, total amount, prtId, and an optional barcode image.
function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html);
  var prtId = first(html, /<[^>]*id=["']prtId["'][^>]*>([\s\S]*?)<\/\w+>/i);
  var patientName = '', registrationNumber = '', barcodeBase64 = null;
  // Patient info block: a weui-cell bgw with display:block style.
  var infoMatch = /<div[^>]*class=["'][^"']*\bweui-cell\b[^"']*\bbgw\b[^"']*["'][^>]*style=["'][^"']*display:block[^"']*["'][^>]*/i.exec(html);
  if (infoMatch) {
    var infoStart = infoMatch.index + infoMatch[0].length + 1;
    var infoEnd = html.indexOf('<li', infoStart);
    if (infoEnd < 0) infoEnd = html.length;
    var infoBlock = html.substring(infoStart, infoEnd);
    var bdRe = /<div[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, bd;
    while ((bd = bdRe.exec(infoBlock)) !== null) {
      var t = clean(bd[1]);
      if (t.indexOf('就诊人') >= 0) patientName = t.replace(/^.*就诊人[:：]\s*/, '');
      if (t.indexOf('登记号') >= 0) registrationNumber = t.replace(/^.*登记号[:：]\s*/, '');
    }
    // Optional barcode image (data: URI).
    var imgRe = /<img[^>]*src=["'](data:image[^"']*)["']/i, img;
    if ((img = imgRe.exec(infoBlock)) !== null) barcodeBase64 = img[1];
  }
  // Charge categories: each <li id="..."> has a header with title and amount.
  var categories = [];
  var catRe = /<li[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi, c;
  while ((c = catRe.exec(html)) !== null) {
    var header = /<div[^>]*class=["'][^"']*\bbgtitleyellow\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(c[2]);
    if (!header) continue;
    var amount = first(header[1], /<span[^>]*class=["'][^"']*font-yellow[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    var titleText = clean(header[1]);
    var title = amount ? titleText.replace(amount, '').trim() : titleText;
    categories.push({ id: c[1], title: title, amount: amount });
  }
  // Total amount: located in the postFix block after "总计".
  var totalAmount = '';
  var totMatch = /<div[^>]*class=["'][^"']*\bpostFix\b[^"']*["'][^>]*/i.exec(html);
  if (totMatch) {
    var totStart = totMatch.index + totMatch[0].length + 1;
    var totBlock = html.substring(totStart);
    var bdRe2 = /<div[^>]*class=["'][^"']*\bweui-cell__bd\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, bd2;
    while ((bd2 = bdRe2.exec(totBlock)) !== null) {
      var t2 = clean(bd2[1]);
      if (t2.indexOf('总计') >= 0) {
        var amt = /<span[^>]*class=["'][^"']*font-yellow[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(bd2[1]);
        totalAmount = amt ? clean(amt[1]) : t2.replace(/^.*总计[:：]\s*/, '');
        break;
      }
    }
  }
  return JSON.stringify({ schemaVersion: 1, patientName: patientName, registrationNumber: registrationNumber, totalAmount: totalAmount, prtId: prtId, categories: categories, barcodeBase64: barcodeBase64 });
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
