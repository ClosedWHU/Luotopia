// Parses WHU email envelope response (e.g. unread count) into a stable schema.
function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var body = input.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return JSON.stringify({ schemaVersion: 1, success: false, unreadCount: null });
  }
  var code = body.code;
  var success = code === 200 || code === '200' || code === 0 || code === '0';
  if (!success) {
    return JSON.stringify({ schemaVersion: 1, success: false, unreadCount: null });
  }
  var data = body.data && typeof body.data === 'object' ? body.data : {};
  // Unread count may be reported under several field names at two levels.
  var rawCount = data.count;
  if (rawCount === undefined) rawCount = data.unreadCount;
  if (rawCount === undefined) rawCount = data.unread;
  if (rawCount === undefined) rawCount = body.unreadCount;
  var count = Number(rawCount);
  // Only positive integers are valid; otherwise unknown.
  if (!isFinite(count) || count <= 0 || Math.floor(count) !== count) count = null;
  return JSON.stringify({ schemaVersion: 1, success: true, unreadCount: count });
}
