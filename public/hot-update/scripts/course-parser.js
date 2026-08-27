// Parses the academic system timetable (kbList) into a normalized course list.
function parse(rawJson) {
  var data = JSON.parse(rawJson);
  // kbList = 课表列表 (timetable list); courses from the academic system.
  var kbList = data.kbList || [];
  var result = [];

  for (var i = 0; i < kbList.length; i++) {
    var item = kbList[i];
    // kcmc = 课程名称 (course name).
    var title = sanitizeDisplay(item.kcmc || '');
    if (!title) continue;

    var weekday = parseWeekday(item.xqj, item.xqjmc);
    if (weekday < 1 || weekday > 7) continue;

    var classPeriod = parseClassPeriod(pickFirst(item, ['jcs', 'jc', 'jcsm']));
    if (!classPeriod) continue;

    var weeks = parseWeeks(pickFirst(item, ['zcd', 'zcmc', 'zc']));
    if (weeks.length === 0) continue;

    result.push({
      title: title,
      titleRaw: '' + (item.kcmc || ''),
      weekday: weekday,
      classFrom: classPeriod.from,
      classTo: classPeriod.to,
      weeks: weeks,
      // jxbmc = 教学班名称 code; teaching class id used as course id.
      courseId: (item.jxbmc || '').trim(),
      courseNature: sanitizeDisplay(pickFirst(item, ['kcxz', 'kcxzmc', 'kclbmc', 'kclb'])),
      // xm = 姓名 (teacher name).
      instructor: sanitizeDisplay(item.xm || ''),
      instructorRaw: '' + (item.xm || ''),
      // cdmc = 场地名称 (venue/room name).
      location: sanitizeDisplay(item.cdmc || ''),
      // zcd = 周次段 code; raw week-range string (e.g. "1-16周").
      weekMeta: (item.zcd || '').trim(),
      // kssj / jssj = 开始时间 / 结束时间 (start/end time).
      // sksj_kssj / sksj_jssj / kssj_hhmm are alternative field names.
      startText: pickFirst(item, ['kssj', 'sksj_kssj', 'kssj_hhmm']),
      endText: pickFirst(item, ['jssj', 'sksj_jssj', 'jssj_hhmm'])
    });
  }
  return JSON.stringify({ courses: result });
}

// Returns the first non-empty trimmed value among the given keys.
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

// Removes control/format/whitespace Unicode characters and collapses spaces.
function sanitizeDisplay(value) {
  return ('' + value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f]/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .trim();
}

// Converts a weekday value to 1-7; falls back to matching Chinese day labels.
// xqj = 星期几 (weekday number), xqjmc = 星期几名称 code (weekday label).
function parseWeekday(raw, label) {
  if (raw !== undefined && raw !== null) {
    var n = parseInt(raw, 10);
    if (n >= 1 && n <= 7) return n;
  }
  var text = '' + (label || raw || '');
  if (text.indexOf('\u4e00') !== -1) return 1; // 一 (Mon)
  if (text.indexOf('\u4e8c') !== -1) return 2; // 二 (Tue)
  if (text.indexOf('\u4e09') !== -1) return 3; // 三 (Wed)
  if (text.indexOf('\u56db') !== -1) return 4; // 四 (Thu)
  if (text.indexOf('\u4e94') !== -1) return 5; // 五 (Fri)
  if (text.indexOf('\u516d') !== -1) return 6; // 六 (Sat)
  if (text.indexOf('\u65e5') !== -1 || text.indexOf('\u5929') !== -1 || text.indexOf('\u4e03') !== -1) return 7; // 日/天/七 (Sun)
  return -1;
}

// Parses a class period range like "1-2" into {from,to}; normalizes dashes.
// jc / jcs / jcsm = 节次 / 节次段 / 节次说明 (class period range).
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

// Parses a week string like "1-16周,18周,单周" into a sorted unique week list.
// zcd / zcmc / zc = 周次段 code / 周次名称 code / 周次 (week range).
function parseWeeks(weekStr) {
  if (!weekStr) return [];
  var result = [];
  var parts = weekStr.split(/[,，;；、]/);
  for (var p = 0; p < parts.length; p++) {
    var seg = parts[p].trim();
    if (!seg) continue;
    var odd = seg.indexOf('\u5355') !== -1; // 单 (odd-week only)
    var even = seg.indexOf('\u53cc') !== -1; // 双 (even-week only)
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
