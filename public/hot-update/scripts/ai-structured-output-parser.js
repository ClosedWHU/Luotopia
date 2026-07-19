function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var content = typeof input.content === 'string' ? input.content : '';
  var dataMatch = /<data>\s*([\s\S]*?)\s*<\/data>/i.exec(content);
  var reply = dataMatch ? content.substring(0, dataMatch.index).trim() : '';
  var candidate = dataMatch ? dataMatch[1] : content;
  var fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(candidate);
  if (fenced) candidate = fenced[1];
  var payload = extractObject(candidate);
  if (!payload) {
    return JSON.stringify({ schemaVersion: 1, reply: content.trim(), payload: null });
  }
  payload = normalizePayload(payload);
  if (!reply) reply = text(payload.assistant_reply || payload.reply || payload.message);
  return JSON.stringify({ schemaVersion: 1, reply: reply, payload: payload });
}

function extractObject(value) {
  var first = value.indexOf('{');
  var last = value.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    var decoded = JSON.parse(value.substring(first, last + 1));
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : null;
  } catch (e) {
    return null;
  }
}

function normalizePayload(payload) {
  var intent = text(payload.intent || payload.action || payload.intent_type).toLowerCase();
  if (intent === 'create' || intent === 'createitem' || intent === 'create-item' || intent === 'add_item') intent = 'create_item';
  if (intent === 'query' || intent === 'qa' || intent === 'respond') intent = 'answer';
  if (intent !== 'create_item' && intent !== 'answer') intent = 'fallback';
  var createItem = payload.create_item || payload.createItem || payload.item || null;
  var citations = Array.isArray(payload.citations) ? payload.citations : [];
  return {
    intent: intent,
    assistant_reply: text(payload.assistant_reply || payload.assistantReply || payload.reply || payload.message),
    create_item: createItem && typeof createItem === 'object' && !Array.isArray(createItem) ? createItem : null,
    citations: citations
  };
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}
