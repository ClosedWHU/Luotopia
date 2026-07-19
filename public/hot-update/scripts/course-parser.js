function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var kbList = data.kbList || [];
  var result = [];
  for (var i = 0; i < kbList.length; i++) {
    var item = kbList[i];
    var title = (item.kcmc || '').trim();
    if (!title) continue;

    var weekday = parseWeekday(item.xqj, item.xqjmc);
    if (weekday < 1 || weekday > 7) continue;

    var classPeriod = parseClassPeriod(pickFirst(item, ['jcs', 'jc', 'jcsm']));
    if (!classPeriod) continue;

    var weeks = parseWeeks(pickFirst(item, ['zcd', 'zcmc', 'zc']));
    if (weeks.length === 0) continue;

    result.push({
      title: title,
      weekday: weekday,
      classFrom: classPeriod.from,
      classTo: classPeriod.to,
      weeks: weeks,
      courseId: (item.jxbmc || '').trim(),
      courseNature: pickFirst(item, ['kcxz', 'kcxzmc', 'kclbmc', 'kclb']),
      instructor: (item.xm || '').trim(),
      location: (item.cdmc || '').trim(),
      weekMeta: (item.zcd || '').trim(),
      startText: pickFirst(item, ['kssj', 'sksj_kssj', 'kssj_hhmm']),
      endText: pickFirst(item, ['jssj', 'sksj_jssj', 'jssj_hhmm'])
    });
  }
  return JSON.stringify({ courses: result });
}

function pickFirst(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v !== undefined && v !== null) {
      var s = ('' + v).trim();
      if (s.length > 0) return s;
    }
  }
  return '';
}

function parseWeekday(raw, label) {
  if (raw !== undefined && raw !== null) {
    var n = parseInt(raw, 10);
    if (n >= 1 && n <= 7) return n;
  }
  var text = '' + (label || raw || '');
  if (text.indexOf('\u4e00') !== -1) return 1;
  if (text.indexOf('\u4e8c') !== -1) return 2;
  if (text.indexOf('\u4e09') !== -1) return 3;
  if (text.indexOf('\u56db') !== -1) return 4;
  if (text.indexOf('\u4e94') !== -1) return 5;
  if (text.indexOf('\u516d') !== -1) return 6;
  if (text.indexOf('\u65e5') !== -1 || text.indexOf('\u5929') !== -1 || text.indexOf('\u4e03') !== -1) return 7;
  return -1;
}

function parseClassPeriod(text) {
  if (!text) return null;
  var raw = text.trim().replace(/\s+/g, '')
    .replace(/～/g, '-').replace(/~/g, '-').replace(/—/g, '-').replace(/－/g, '-');
  var nums = raw.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  var from = parseInt(nums[0], 10);
  var to = nums.length >= 2 ? parseInt(nums[1], 10) : from;
  if (from <= 0 || to < from) return null;
  return { from: from, to: to };
}

function parseWeeks(weekStr) {
  if (!weekStr) return [];
  var result = [];
  var parts = weekStr.split(/[,，;；、]/);
  for (var p = 0; p < parts.length; p++) {
    var seg = parts[p].trim();
    if (!seg) continue;
    var odd = seg.indexOf('\u5355') !== -1;
    var even = seg.indexOf('\u53cc') !== -1;
    var nums = seg.match(/\d+/g);
    if (!nums) continue;
    var start = parseInt(nums[0], 10);
    var end = nums.length > 1 ? parseInt(nums[1], 10) : start;
    for (var w = start; w <= end; w++) {
      if (odd && w % 2 === 0) continue;
      if (even && w % 2 === 1) continue;
      if (result.indexOf(w) === -1) result.push(w);
    }
  }
  result.sort(function(a, b) { return a - b; });
  return result;
}
