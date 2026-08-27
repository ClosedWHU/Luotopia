// Parses empty-classroom availability data into a normalized room list.
function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var result = data.data || [];
  if (!Array.isArray(result)) result = [];
  var rooms = [];
  for (var i = 0; i < result.length; i++) {
    var item = result[i];
    // jc = 节次 (class period), comma-separated section numbers like "1,2".
    var rawSections = (item.jc || '').toString();
    var sections = [];
    if (rawSections) {
      var parts = rawSections.split(',');
      for (var j = 0; j < parts.length; j++) {
        var n = parseInt(parts[j].trim(), 10);
        if (n > 0) sections.push(n);
      }
      sections.sort(function(a, b) { return a - b; });
    }
    rooms.push({
      // cdmc = 场地名称 (venue/room name).
      name: (item.cdmc || '').toString(),
      // jxl = 教学楼 (building).
      building: (item.jxl || '').toString(),
      // cdlb = 场地类别 (room type).
      type: (item.cdlb || '').toString(),
      // zws = 座位数 (total seat count).
      totalSeats: parseInt((item.zws || '').toString(), 10) || 0,
      // kszws = 可用座位数 (available seat count).
      availableSeats: parseInt((item.kszws || '').toString(), 10) || 0,
      availableSections: sections,
      // lh = 楼层 (floor).
      floor: (item.lh || '').toString()
    });
  }
  return JSON.stringify({ rooms: rooms });
}
