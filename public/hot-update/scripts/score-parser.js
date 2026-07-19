function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var items = data.items || [];
  var result = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    var xnmStr = (item.xnm || '').toString();
    var kcmc = (item.kcmc || '').toString();
    var jsxm = (item.jsxm || '').toString();
    var jxbmc = (item.jxbmc || '').toString();
    var xfStr = (item.xf || '').toString();
    var kcxzmc = (item.kcxzmc || '').toString();
    var bfzcjStr = (item.bfzcj || '').toString();
    var kkbmmc = (item.kkbmmc || '').toString();
    var xqmStr = (item.xqm || '').toString();
    var cjbz = (item.cjbz || '').toString();
    var examType = ((item.ksxz || item.ksxzmc || '') + '' || '正常考试').trim();

    var yearVal = parseInt(xnmStr, 10) || -1;
    var credit = parseFloat(xfStr);

    var rawSemester = parseInt(xqmStr, 10) || -1;
    var normalizedSemester = 1;
    if (rawSemester === 3) normalizedSemester = 1;
    else if (rawSemester === 12) normalizedSemester = 2;
    else if (rawSemester === 16) normalizedSemester = 3;

    var isMidtermWithdraw = cjbz === '\u4e2d\u671f\u9000\u8bfe' || (item.cj || '').toString() === 'W';
    var parsedScore = parseInt(bfzcjStr, 10);

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
