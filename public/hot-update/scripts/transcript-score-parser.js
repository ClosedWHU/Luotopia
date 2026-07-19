function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var lines = Array.isArray(input.lines) ? input.lines : [];
  if (lines.indexOf('武汉大学学生成绩单') === -1) throw new Error('not a WHU transcript');
  var scores = [], year = null, semester = null;
  for (var i = 0; i < lines.length; i++) {
    var line = ('' + lines[i]).trim();
    var term = /^(\d{4})学年([123])学期$/.exec(line);
    if (term) { year = parseInt(term[1], 10); semester = parseInt(term[2], 10); continue; }
    if (line.indexOf('以') !== -1 && line.indexOf('下') !== -1 && line.indexOf('空') !== -1 && line.indexOf('白') !== -1) break;
    if (year === null || semester === null || i + 4 >= lines.length) continue;
    var creditText = ('' + lines[i + 3]).trim(), gradeText = ('' + lines[i + 4]).trim();
    if (!/^\d+(?:\.\d+)?$/.test(creditText) || !/^(?:\d{1,3}|W)$/.test(gradeText)) continue;
    var withdrawn = gradeText === 'W';
    scores.push({ year: year, semester: semester, name: line, courseType: ('' + lines[i + 1]).trim(), examType: ('' + lines[i + 2]).trim(), credit: parseFloat(creditText), score: withdrawn ? 0 : parseInt(gradeText, 10), isWithdrawn: withdrawn });
    i += 4;
  }
  if (scores.length === 0) throw new Error('no transcript scores');
  return JSON.stringify({ scores: scores });
}
