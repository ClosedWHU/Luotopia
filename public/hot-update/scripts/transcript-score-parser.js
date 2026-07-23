function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var lines = Array.isArray(input.lines) ? input.lines : [];
  if (lines.indexOf('武汉大学学生成绩单') === -1) throw new Error('not a WHU transcript');

  var scores = [], year = null, semester = null;
  var header = /^课程\s+课程类型\s+学习类型\s+学分\s+成绩\s*/;
  var fullRow = /^(.*?)\s+(通识教育|公共基础|专业教育)\s*(必修|选修)\s+(普通|重修)\s+(\d+(?:\.\d+)?)\s+(\d{1,3}|W)$/;
  var reversedRow = /^(.*?)\s*(通识教育|公共基础|专业教育)\s*(必修|选修)\s+(\d+(?:\.\d+)?)\s+(\d{1,3}|W)$/;
  var courseWithStudyType = /^(.*)\s+(普通|重修)$/;

  function addScore(name, courseType, examType, credit, grade) {
    var withdrawn = grade === 'W';
    scores.push({
      year: year,
      semester: semester,
      name: name.trim(),
      courseType: courseType,
      examType: examType,
      credit: parseFloat(credit),
      score: withdrawn ? 0 : parseInt(grade, 10),
      isWithdrawn: withdrawn
    });
  }

  for (var i = 0; i < lines.length; i++) {
    var line = ('' + lines[i]).trim().replace(header, '');
    var term = /^(\d{4})学年([123])学期$/.exec(line);
    if (term) {
      year = parseInt(term[1], 10);
      semester = parseInt(term[2], 10);
      continue;
    }
    if (year === null || semester === null) continue;

    var full = fullRow.exec(line);
    if (full) {
      addScore(full[1], full[2] + full[3], full[4], full[5], full[6]);
      continue;
    }

    var nextLine = i + 1 < lines.length ? ('' + lines[i + 1]).trim() : '';
    var reversed = reversedRow.exec(line);
    var course = courseWithStudyType.exec(nextLine);
    if (reversed && course) {
      addScore(reversed[1] + course[1], reversed[2] + reversed[3], course[2], reversed[4], reversed[5]);
      i++;
      continue;
    }

    if (reversed && (nextLine === '普通' || nextLine === '重修')) {
      addScore(reversed[1], reversed[2] + reversed[3], nextLine, reversed[4], reversed[5]);
      i++;
      continue;
    }

    if (i + 4 >= lines.length) continue;
    var courseType = ('' + lines[i + 1]).trim();
    var examType = ('' + lines[i + 2]).trim();
    var credit = ('' + lines[i + 3]).trim();
    var grade = ('' + lines[i + 4]).trim();
    if (/^\d+(?:\.\d+)?$/.test(credit) && /^(?:\d{1,3}|W)$/.test(grade)) {
      addScore(line, courseType, examType, credit, grade);
      i += 4;
    }
  }
  if (scores.length === 0) throw new Error('no transcript scores');
  return JSON.stringify({ scores: scores });
}
