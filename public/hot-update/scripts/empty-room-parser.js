function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var result = data.data || [];
  if (!Array.isArray(result)) result = [];
  var rooms = [];
  for (var i = 0; i < result.length; i++) {
    var item = result[i];
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
      name: (item.cdmc || '').toString(),
      building: (item.jxl || '').toString(),
      type: (item.cdlb || '').toString(),
      totalSeats: parseInt((item.zws || '').toString(), 10) || 0,
      availableSeats: parseInt((item.kszws || '').toString(), 10) || 0,
      availableSections: sections,
      floor: (item.lh || '').toString()
    });
  }
  return JSON.stringify({ rooms: rooms });
}
