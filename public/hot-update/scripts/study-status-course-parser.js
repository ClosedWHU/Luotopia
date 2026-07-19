function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var items = data.items || data;
  if (!Array.isArray(items)) items = [];
  var result = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var xdzt = (item.XDZT || '').toString();
    var status = parseStatus(xdzt);
    var score = (item.CJ || '').toString();
    var retakeScoreStr = (item.CXCJ1 || '').toString();
    var maxScoreStr = (item.MAXCJ || '').toString();
    var jd = (item.JD || '').toString();
    var xf = (item.XF || '').toString();

    var hasRetake = item.hasOwnProperty('CXCJ1');
    var originalScore = parseInt(score, 10);
    var retakeScore = parseInt(retakeScoreStr, 10);
    var maxScore = parseInt(maxScoreStr, 10);
    var effectiveScore = !isNaN(maxScore) ? maxScore : (hasRetake ? retakeScore : originalScore);

    result.push({
      name: (item.KCMC || '').toString(),
      category: (item.KCXZMC || '').toString(),
      credit: parseFloat(xf) || 0,
      score: isNaN(effectiveScore) ? null : effectiveScore,
      gradePoint: parseFloat(jd) || null,
      maxScore: isNaN(maxScore) ? null : maxScore,
      status: status,
      hours: (item.XSXXXX || '').toString() || null,
      courseNature: (item.KCLBMC || '').toString() || null,
      suggestedYear: (item.JYXDXNMC || '').toString() || null,
      suggestedSemester: (item.JYXDXQMC || '').toString() || null,
      importance: parseFloat((item.KCZYXXS || '').toString()) || null,
      englishName: (item.KCYWMC || '').toString() || null,
      courseCode: (item.KCH || '').toString() || null,
      academicYear: (item.XNMC || '').toString() || null,
      semester: (item.XQMMC || '').toString() || null,
      hasMakeupExam: item.hasOwnProperty('CXCJ'),
      hasRetake: hasRetake,
      originalScore: isNaN(originalScore) ? null : originalScore,
      retakeScore: isNaN(retakeScore) ? null : retakeScore
    });
  }
  return JSON.stringify({ courses: result });
}

function parseStatus(xdzt) {
  if (xdzt === '4') return 'passed';
  if (xdzt === '2') return 'failed';
  if (xdzt === '1') return 'studying';
  return 'notTaken';
}
