// Parses study-status course data (credit/score/status) into a course list.
// Handles retake scores (CXCJ1) and makeup exams (CXCJ) by choosing the max.
function parse(rawJson) {
  var data = JSON.parse(rawJson);
  var items = data.items || data;
  if (!Array.isArray(items)) items = [];
  var result = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    // The study-status API uses UPPERCASE Pinyin abbreviations for fields.
    // XDZT = 学位状态 (status code, see parseStatus).
    var xdzt = (item.XDZT || '').toString();
    var status = parseStatus(xdzt);
    // CJ = 成绩 (grade raw value).
    var score = (item.CJ || '').toString();
    // CXCJ1 = 重修成绩 (retake grade, if any).
    var retakeScoreStr = (item.CXCJ1 || '').toString();
    var maxScoreStr = (item.MAXCJ || '').toString();
    // JD = 绩点 (grade point).
    var jd = (item.JD || '').toString();
    // XF = 学分 (credit).
    var xf = (item.XF || '').toString();

    var hasRetake = item.hasOwnProperty('CXCJ1');
    var originalScore = parseInt(score, 10);
    var retakeScore = parseInt(retakeScoreStr, 10);
    var maxScore = parseInt(maxScoreStr, 10);
    // Prefer the max score if available; otherwise retake, otherwise original.
    var effectiveScore = !isNaN(maxScore) ? maxScore : (hasRetake ? retakeScore : originalScore);

    result.push({
      // KCMC = 课程名称 (course name).
      name: (item.KCMC || '').toString(),
      // KCXZMC = 课程性质名称 code (course nature, e.g. 必修/选修).
      category: (item.KCXZMC || '').toString(),
      credit: parseFloat(xf) || 0,
      score: isNaN(effectiveScore) ? null : effectiveScore,
      gradePoint: parseFloat(jd) || null,
      maxScore: isNaN(maxScore) ? null : maxScore,
      status: status,
      // XSXXXX = 学时信息 (class hours).
      hours: (item.XSXXXX || '').toString() || null,
      // KCLBMC = 课程类别名称 code (course category).
      courseNature: (item.KCLBMC || '').toString() || null,
      // JYXDXNMC = 培养方案学年名称 code (suggested academic year).
      suggestedYear: (item.JYXDXNMC || '').toString() || null,
      // JYXDXQMC = 培养方案学期名称 code (suggested semester).
      suggestedSemester: (item.JYXDXQMC || '').toString() || null,
      // KCZYXXS = 课程专业信息数 (importance, a numeric weight).
      importance: parseFloat((item.KCZYXXS || '').toString()) || null,
      // KCYWMC = 课程英文名称 code (course English name).
      englishName: (item.KCYWMC || '').toString() || null,
      // KCH = 课程号 (course code).
      courseCode: (item.KCH || '').toString() || null,
      // XNMC = 学年名称 code (academic year of the row).
      academicYear: (item.XNMC || '').toString() || null,
      // XQMMC = 学期名称 code (semester of the row).
      semester: (item.XQMMC || '').toString() || null,
      // CXCJ = 重修成绩 (makeup/retake exam presence flag).
      hasMakeupExam: item.hasOwnProperty('CXCJ'),
      hasRetake: hasRetake,
      originalScore: isNaN(originalScore) ? null : originalScore,
      retakeScore: isNaN(retakeScore) ? null : retakeScore
    });
  }
  return JSON.stringify({ courses: result });
}

// Maps the academic system status code to a readable status.
function parseStatus(xdzt) {
  if (xdzt === '4') return 'passed';
  if (xdzt === '2') return 'failed';
  if (xdzt === '1') return 'studying';
  return 'notTaken';
}
