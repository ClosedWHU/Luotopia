function parse(rawJson) {
  var input = JSON.parse(rawJson), source = input.source, data = input.data || {}, shiguang = source === 'shiguang', rawCourses = data.courses;
  if (!Array.isArray(rawCourses) || rawCourses.length === 0) throw new Error('no courses');
  var slots = {}, rawSlots = Array.isArray(data.timeSlots) ? data.timeSlots : [];
  for (var i = 0; i < rawSlots.length; i++) { var slot = rawSlots[i], section = asInt(slot[shiguang ? 'number' : 'section']); if (section !== null && typeof slot.startTime === 'string' && typeof slot.endTime === 'string') slots[section] = { start: slot.startTime, end: slot.endTime }; }
  var courses = [];
  for (var j = 0; j < rawCourses.length; j++) {
    var raw = rawCourses[j], day = asInt(raw[shiguang ? 'day' : 'weekday']), startSection = asInt(raw.startSection), endSection = asInt(raw.endSection);
    var startTime = stringOrNull(raw.customStartTime) || stringOrNull(raw.startTime) || (startSection !== null && slots[startSection] ? slots[startSection].start : null);
    var endTime = stringOrNull(raw.customEndTime) || stringOrNull(raw.endTime) || (endSection !== null && slots[endSection] ? slots[endSection].end : null);
    if (day === null || startTime === null || endTime === null) continue;
    var location = typeof raw[shiguang ? 'position' : 'location'] === 'string' ? raw[shiguang ? 'position' : 'location'] : '';
    courses.push({ name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : '未命名课程', day: day, startTime: startTime, endTime: endTime, teacher: typeof raw.teacher === 'string' ? raw.teacher : '', location: location.replace(/^@/, '').trim(), weekMeta: weekMeta(raw.weeks) });
  }
  if (courses.length === 0) throw new Error('no valid course times');
  var defaultName = shiguang ? '拾光课程表' : '星链课程表';
  var name = typeof data.tableName === 'string' ? data.tableName : (typeof data.name === 'string' ? data.name : defaultName);
  return JSON.stringify({ normalized: true, name: name, courses: courses });
}
function asInt(value) { if (typeof value === 'number' && Number.isInteger(value)) return value; if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value, 10); return null; }
function stringOrNull(value) { return typeof value === 'string' && value.length > 0 ? value : null; }
function weekMeta(value) { if (Array.isArray(value)) return value.filter(function(v) { return typeof v === 'number'; }).map(function(v) { return Math.trunc(v); }).join('、'); return value === undefined || value === null ? '' : '' + value; }
