function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var resultData = data.resultData;
  if (!resultData) return JSON.stringify({ messages: [], totalCount: 0 });

  var rows = resultData.rows || [];
  var total = resultData.total || rows.length;
  var messages = [];
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i];
    var msgId = (item.msgId || '').toString().trim();
    if (!msgId) continue;
    messages.push({
      msgId: msgId,
      title: (item.msgtitle || '').toString(),
      summary: (item.summary || '').toString() || null,
      photoUrl: (item.photoUrl || '').toString() || null,
      senderName: (item.senderName || '').toString(),
      sendTime: (item.sendTime || '').toString(),
      sendMsgType: ((item.sendMsgType || '').toString() || '1'),
      isRead: (item.receiptStatus || '').toString() === '1' || (item.receiptStatus || '').toString() === '2',
      appId: (item.appId || '').toString() || null
    });
  }
  return JSON.stringify({ messages: messages, totalCount: total });
}
