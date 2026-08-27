// Parses campus notification/messages list data into a normalized message list.
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
      // msgtitle = 消息标题 (message title).
      title: (item.msgtitle || '').toString(),
      summary: (item.summary || '').toString() || null,
      photoUrl: (item.photoUrl || '').toString() || null,
      senderName: (item.senderName || '').toString(),
      sendTime: (item.sendTime || '').toString(),
      sendMsgType: ((item.sendMsgType || '').toString() || '1'),
      // receiptStatus "1" or "2" means the message has been read.
      isRead: (item.receiptStatus || '').toString() === '1' || (item.receiptStatus || '').toString() === '2',
      appId: (item.appId || '').toString() || null
    });
  }
  return JSON.stringify({ messages: messages, totalCount: total });
}
