// Parses raw score data from the academic system into a normalized score list.
function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var items = data.items || [];
  var result = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    // The academic system uses Hanyu Pinyin abbreviations for field names.
    // xnm = 学年名 (academic year), e.g. "2024".
    var xnmStr = (item.xnm || '').toString();
    // kcmc = 课程名称 (course name).
    var kcmc = (item.kcmc || '').toString().trim();
    // jsxm = 教师姓名 / jsxmmc = 教师姓名 名称 code; teacher name.
    var jsxm = (item.jsxm || item.jsxmmc || '').toString().trim();
    // jxbmc = 教学班名称 code; teaching class id used as course id.
    var jxbmc = (item.jxbmc || '').toString().trim();
    // xf = 学分 (credit).
    var xfStr = (item.xf || '').toString();
    // kcxzmc = 课程性质名称 code; course nature (e.g. 必修/选修).
    var kcxzmc = (item.kcxzmc || '').toString().trim();
    // bfzcj = 最终成绩 (final grade) raw value.
    var bfzcjStr = (item.bfzcj || '').toString();
    // kkbmmc = 开课部门名称 code; department offering the course.
    var kkbmmc = (item.kkbmmc || '').toString().trim();
    // xqm = 学期名 (semester code, see below).
    var xqmStr = (item.xqm || '').toString();
    // cjbz = 成绩标志 (grade status); "中期退课" means midterm withdrawal.
    var cjbz = (item.cjbz || '').toString();
    // ksxz / ksxzmc = 考试性质 / 考试性质名称 (exam type).
    var examType = ((item.ksxz || item.ksxzmc || '') + '' || '正常考试').trim();

    var yearVal = parseInt(xnmStr, 10) || -1;
    var credit = parseFloat(xfStr);

    // Map the academic system's semester code to 1/2/3 (3 => 1, 12 => 2, 16 => 3).
    var rawSemester = parseInt(xqmStr, 10) || -1;
    var normalizedSemester = 1;
    if (rawSemester === 3) normalizedSemester = 1;
    else if (rawSemester === 12) normalizedSemester = 2;
    else if (rawSemester === 16) normalizedSemester = 3;

    // A midterm withdrawal is flagged either by cjbz or by cj === 'W'.
    // cj = 成绩 (grade) raw value, used here only for the 'W' case.
    var isMidtermWithdraw = cjbz === '\u4e2d\u671f\u9000\u8bfe' || (item.cj || '').toString() === 'W';
    var parsedScore = parseInt(bfzcjStr, 10);

    // Skip rows without a valid year/credit, or without a score (unless withdrawn).
    if (yearVal <= 0 || isNaN(credit)) continue;
    if (isNaN(parsedScore) && !isMidtermWithdraw) continue;

    result.push({
      year: yearVal,
      semester: normalizedSemester,
      name: kcmc,
      instructor: jsxm,
      courseId: jxbmc,
      credit: credit,
      courseType: kcxzmc,
      score: isNaN(parsedScore) ? 0 : parsedScore,
      courseCollege: kkbmmc,
      isSpoiler: isMidtermWithdraw,
      spoilerLabel: isMidtermWithdraw ? '\u4e2d\u671f\u9000\u8bfe' : null,
      examType: examType
    });
  }
  return JSON.stringify({ scores: result });
}
