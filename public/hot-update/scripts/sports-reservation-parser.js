function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var source = input.decoded;
  if (!isObject(source)) return JSON.stringify({ normalized: null });

  var success = pick(source, ['success', 'Success', 'ok', 'Ok', 'isSuccess', 'IsSuccess']);
  var status = pick(source, ['status', 'Status', 'code', 'Code', 'statusCode', 'StatusCode']);
  var message = pick(source, ['msg', 'Msg', 'message', 'Message', 'errorMessage', 'ErrorMessage']);
  var response = pick(source, ['response', 'Response', 'result', 'Result', 'payload', 'Payload', 'data', 'Data']);

  return JSON.stringify({
    normalized: {
      success: normalizeBool(success),
      status: normalizeInteger(status),
      msg: message == null ? '' : String(message).trim(),
      response: normalizeValue(response)
    }
  });
}

var canonicalKeys = [
  'Id', 'Title', 'ImageUrl', 'AreaType', 'Sort', 'Address', 'CampusTitle',
  'Status', 'Content', 'Images', 'SportsTypes', 'SportsTypeTitle',
  'StadiumsAreaId', 'SportsTypeChargeRange', 'AppointmentTimes', 'LowPrice',
  'HighPrice', 'AreaNo', 'Capacity', 'StartTime', 'EndTime',
  'IsCanAppointment', 'Duration', 'AdvanceAppointmentDayCount',
  'AdvanceAppointmentStartTime', 'OrderNo', 'OrderId', 'StadiumsId',
  'StadiumsAreaConfigNo', 'StadiumsTitle', 'VenueTitle', 'Stadiums',
  'AppointmentStartTime', 'AppointmentEndTime', 'AppointmentDate', 'UseDate',
  'Date', 'StatusText', 'StatusDesc', 'PayStatus', 'RefundStatus', 'CreateTime',
  'PaymentStartTime', 'PaymentDeadlineTime', 'PaymentTime',
  'RefundDeadlineTime', 'CancelTime', 'RefundTime', 'Amount', 'RealAmount',
  'TotalAmount', 'DiscountAmount', 'RefundAmount', 'RealName',
  'StudentWorkNo', 'CancelRemark', 'IsBackList', 'IsBlackList',
  'isRestricted', 'Msg', 'Message', 'PublishTime', 'IsRead', 'TotalCount',
  'UnreadCount', 'Count', 'PageSize', 'page', 'pageCount', 'dataCount',
  'data', 'items', 'list', 'rows', 'Rules'
];

var canonicalByToken = {};
for (var canonicalIndex = 0; canonicalIndex < canonicalKeys.length; canonicalIndex++) {
  canonicalByToken[keyToken(canonicalKeys[canonicalIndex])] = canonicalKeys[canonicalIndex];
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    var list = [];
    for (var i = 0; i < value.length; i++) list.push(normalizeValue(value[i]));
    return list;
  }
  if (!isObject(value)) return value;

  var result = {};
  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j++) {
    var key = keys[j];
    var canonical = canonicalByToken[keyToken(key)] || key;
    if (result.hasOwnProperty(canonical) && canonical !== key) continue;
    var normalized = normalizeValue(value[key]);
    if (canonical === 'Status' || canonical === 'PayStatus' || canonical === 'RefundStatus') {
      normalized = normalizeInteger(normalized);
    }
    result[canonical] = normalized;
  }
  return result;
}

function pick(object, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (object.hasOwnProperty(keys[i])) return object[keys[i]];
  }
  return null;
}

function normalizeBool(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  var text = value == null ? '' : String(value).trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return null;
}

function normalizeInteger(value) {
  if (typeof value === 'number' && isFinite(value) && Math.floor(value) === value) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value, 10);
  return value;
}

function keyToken(value) {
  return String(value).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
