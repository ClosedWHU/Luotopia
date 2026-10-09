'use strict';
/*
 * build-mmpi2-scale.cjs — build the MMPI-2 scale assets for the Luotopia app.
 *
 *   npm run scales:mmpi2                 -> public/scales/data/mmpi2.json
 *   npm run scales:mmpi2:short           -> public/scales/data/mmpi2_short.json
 *   node tools/build-mmpi2-scale.cjs --ref <clone> [--short 370] [--out <path>] [--report <path>]
 *
 * Read-only inputs (never modified), taken from a local clone of
 * https://github.com/MMPI-CHN/MMPI-CHN.github.io — passed with `--ref <dir>`
 * or the MMPI_CHN_DIR environment variable. The clone is deliberately NOT
 * vendored into this repo (its own licensing), so this tool is a manual,
 * documented step and is deliberately absent from `prebuild`.
 *
 *   <ref>/origin_js/my_data.js        questions / questions_zh / scales / rin
 *   <ref>/origin_js/mmpi_cn_norms.js  SCALE_INDEX / NORM / CUTOFF_CN
 *   <ref>/origin_js/my_script.js      reference algorithm (lines 143-255)
 *
 * Provenance / attribution: the English item text comes from Kevin Timmerman's
 * 2008 MMPI-2 implementation released under GPLv3; the Chinese translations and
 * scoring data come from the MMPI-CHN project; the Chinese norm parameters come
 * from Cheung, Song & Zhang (1996), table 6-3 (in Butcher ed., International
 * Adaptations of the MMPI-2, pp. 137-161). See the LICENSE constant below and
 * public/scales/README.md.
 *
 * Documented judgement calls (each one re-asserted by the verification suite):
 *   - D1 item 223 errata: the upstream D1 key lists item 223 in BOTH directions
 *     (a constant +1); removed from the True key.
 *   - Mf per-sex forms: source entries 10/11 disagree on 4 items; emitted as
 *     two factors with appliesToGender, one per sex form.
 *   - 18 audited Chinese translation overrides, each guarded by a regex on the
 *     English source (item 184 is a true polarity flip; item 501 a clarity fix).
 *   - Translator meta-note stripping (译注:…, （不确定…）, （…不好翻…）).
 *   - VRIN/TRIN table cells are decorated strings ("114F", "57T"); only the
 *     numeric T is emitted, the direction is recovered from the raw score.
 *
 * The script emits the asset and then runs the full verification suite
 * (149 assertions on the full form / 112 on the short form), printing an ASCII
 * summary to stdout and a UTF-8 report to --report (OS temp dir by default, so
 * a stray report never lands in public/).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

// Repo root = the parent of tools/, same anchor as generate-scale-manifest.mjs.
const ROOT = path.resolve(__dirname, '..');
const REF_FILES = ['my_data.js', 'mmpi_cn_norms.js', 'my_script.js'];

function fatal(msg) {
  console.error('[mmpi2] ' + msg);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let shortN = 0;
let outPath = null;
let reportPath = null;
let refDir = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--short') {
    shortN = parseInt(argv[++i], 10);
    if (isNaN(shortN)) fatal('--short requires an integer argument (e.g. --short 370)');
  } else if (argv[i] === '--out') outPath = argv[++i];
  else if (argv[i] === '--report') reportPath = argv[++i];
  else if (argv[i] === '--ref') refDir = argv[++i];
  else fatal('unknown argument: ' + argv[i]);
}

// The reference clone is machine-local by design; there is no silent fallback.
if (!refDir) refDir = process.env.MMPI_CHN_DIR || null;
if (!refDir) {
  fatal([
    'no reference clone specified.',
    '',
    'This tool builds the MMPI-2 scale assets from the MMPI-CHN reference data,',
    'which is NOT vendored into this repo because of its own licensing. Clone it',
    'somewhere on this machine first:',
    '',
    '    git clone https://github.com/MMPI-CHN/MMPI-CHN.github.io <dir>',
    '',
    'then point the script at the clone, either way:',
    '',
    '    node tools/build-mmpi2-scale.cjs --ref <dir>',
    '    MMPI_CHN_DIR=<dir> node tools/build-mmpi2-scale.cjs        (env var)',
  ].join('\n'));
}
const SRC_DIR = path.join(refDir, 'origin_js');
const missingRef = REF_FILES.filter((f) => !fs.existsSync(path.join(SRC_DIR, f)));
if (missingRef.length) {
  fatal([
    'reference clone at ' + refDir + ' is missing required file(s):',
    ...missingRef.map((f) => '    ' + path.join('origin_js', f)),
    'Expected a clone of https://github.com/MMPI-CHN/MMPI-CHN.github.io',
    '(pass it with --ref <dir> or set MMPI_CHN_DIR).',
  ].join('\n'));
}

if (!outPath) outPath = path.join(ROOT, 'public', 'scales', 'data', shortN ? 'mmpi2_short.json' : 'mmpi2.json');
else outPath = path.resolve(outPath);
// Reports default to the OS temp directory so a stray report never lands in public/.
if (!reportPath) reportPath = path.join(os.tmpdir(), 'build-mmpi2-scale-report' + (shortN ? '-short' : '') + '.txt');
else reportPath = path.resolve(reportPath);

const R = [];                       // report lines
const say = (...a) => R.push(a.join(' '));
let failures = 0;
function ok(cond, label, detail) {
  if (cond) { say('  [PASS] ' + label + (detail ? '  -- ' + detail : '')); }
  else { failures++; say('  [FAIL] ' + label + (detail ? '  -- ' + detail : '')); }
  return !!cond;
}

// ---------------------------------------------------------------------------
// Load the reference repository (sandboxed; the files only assign globals)
// ---------------------------------------------------------------------------
const sb = {};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(SRC_DIR + '/my_data.js', 'utf8'), sb, { filename: 'my_data.js' });
vm.runInContext(fs.readFileSync(SRC_DIR + '/mmpi_cn_norms.js', 'utf8'), sb, { filename: 'mmpi_cn_norms.js' });

const questions = sb.questions;
const questions_zh = sb.questions_zh;
const scales = sb.scales;
const rin = sb.rin;                                          // VRIN / TRIN pair tables
const CNMOD = sb.MMPI_CN;
const SCALE_INDEX = CNMOD.SCALE_INDEX;
const NORM = CNMOD.NORM;

const TOTAL_ITEMS = questions.length - 1;                 // 567
const N_ITEMS = shortN ? Math.min(shortN, TOTAL_ITEMS) : TOTAL_ITEMS;
const FIRST_CRITICAL = 130;                                // entries 130..146 have no T table
const MF_MALE = SCALE_INDEX.Mf[0];                         // 10
const MF_FEMALE = SCALE_INDEX.Mf[1];                       // 11

// ---------------------------------------------------------------------------
// Change 1 — audited Chinese translation overrides
//
// A 567-item audit of questions_zh against questions found 18 items where the
// upstream translation reverses, truncates or annotates the stimulus. The
// scoring keys follow the ENGLISH wording, so a reversed or truncated Chinese
// item makes the respondent answer a different question than the one the key
// was built for. Every override is guarded by a regex on the English source:
// if the English does not say what the audit recorded, that override is skipped
// and the mismatch is reported instead of being applied.
//
// `flip` marks the items whose pre-override Chinese states the OPPOSITE of the
// English (a scoring-direction bug, not just a wording bug).
// ---------------------------------------------------------------------------
const ZH_OVERRIDES = [
  { i: 6, flip: false, zh: '我父亲是个好人（若父亲已去世，则指我父亲生前是个好人）。',
    en: /^My father is a good man \(or if your father is dead\) my father was a good man\.$/,
    why: 'restores the (or if your father is dead) alternative; “原生家庭的父亲” is not the stimulus' },
  { i: 15, flip: false, zh: '我在很大的紧张压力下工作。',
    en: /^I work under a great deal of tension\.$/,
    why: 'English is about WORKING under tension, not about a busy lifestyle' },
  { i: 52, flip: false, zh: '我认为我没有过正当的生活。',
    en: /^I have not lived the right kind of life\.$/,
    why: '“没有得到过期望中的生活” shifts “the right kind of life” to “the life I hoped for”' },
  { i: 90, flip: false, zh: '我爱我的父亲（若父亲已去世，则指我过去爱我的父亲）。',
    en: /^I love my father, or \(if your father is dead\) I loved my father\.$/,
    why: 'restores the deceased-father alternative; 敬爱 adds “respect” that is not in the source' },
  { i: 114, flip: false, zh: '有时我被别人的私人物品，如鞋子、手套等强烈吸引，以至于我想去摸弄甚至偷走它们，尽管它们对我毫无用处。',
    en: /^Sometimes I am so strongly attracted by the personal articles of others, such as shoes, gloves, etc\., that I want to handle or steal them, even though I have no use for them\.$/,
    why: 'restores “handle or steal” — the old text dropped “handle”, weakening the item' },
  { i: 141, flip: false, zh: '在过去的几年里，我的身体大部分时间都很好。',
    en: /^During the past few years I have been well most of the time\.$/,
    why: '“been well” is physical health and “most of the time” is not “always”' },
  { i: 184, flip: true, zh: '我很少做白日梦。',
    en: /^I daydream very little\.$/,
    why: 'POLARITY FLIP: the old text said “我经常做白日梦” (I often daydream), the exact opposite' },
  { i: 192, flip: false, zh: '我母亲是个好人（若母亲已去世，则指我母亲生前是个好人）。',
    en: /^My mother is a good woman, or \(if your mother is dead\) my mother was a good woman\.$/,
    why: 'mother counterpart of item 6; restores the deceased-mother alternative' },
  { i: 240, flip: false, zh: '有时我实在无法控制自己，会去偷东西或在商店顺手牵羊。',
    en: /^At times it has been impossible for me to stop from stealing or shoplifting something\.$/,
    why: 'old text described an URGE (“想偷东西”); the English is about being unable to stop DOING it' },
  { i: 259, flip: false, zh: '我确信有人在谈论我。',
    en: /^I am sure I am being talked about\.$/,
    why: 'English is certainty (“I am sure”), not frequency (“我经常认为”)' },
  { i: 276, flip: false, zh: '我爱我的母亲（若母亲已去世，则指我过去爱我的母亲）。',
    en: /^I love my mother, or \(if your mother is dead\) I loved my mother\.$/,
    why: 'mother counterpart of item 90; restores the deceased-mother alternative' },
  { i: 323, flip: false, zh: '有时我会享受伤害我所爱的人。',
    en: /^Sometimes I enjoy hurting persons I love\.$/,
    why: 'strips the leftover translator note “（关）…（是英文语境下的love）”' },
  { i: 332, flip: false, zh: '有时我会享受被我所爱的人伤害。',
    en: /^At times I have enjoyed being hurt by someone I loved\.$/,
    why: 'the English requires the hurt to come from SOMEONE LOVED; “被他人所伤害” dropped it' },
  { i: 355, flip: false, zh: '我曾不止一次觉得有人用催眠操纵我做一些事情。',
    en: /^At one or more times in my life I felt that someone was making me do things by hypnotizing me\.$/,
    why: 'old text said someone TRIED to hypnotise me; the English is being MADE TO DO THINGS, more than once' },
  { i: 433, flip: false, zh: '当我被逼得走投无路时，我只说出那部分不会伤害我的真相。',
    en: /^When I am cornered I tell that portion of the truth which is not likely to hurt me\.$/,
    why: 'restores the “when I am cornered” condition the old text dropped' },
  { i: 444, flip: false, zh: '我是一个容易紧张的人。',
    en: /^I am a high-strung person\.$/,
    why: 'strips “（或：敏感、神经质）” and “（以原文为准）”' },
  { i: 498, flip: false, zh: '我所面临的最大问题是由我身边的人的行为造成的。',
    en: /^My greatest problems are caused by the behavior of someone close to me\.$/,
    why: 'strips the untranslated English plus the note “(someone close to me,不好翻,自己理解一下)”' },
  { i: 501, flip: false, zh: '我认为与别人谈论问题和烦恼，往往比吃药更有帮助。',
    en: /^Talking over problems and worries with someone is often more helpful than taking drugs or medicine\.$/,
    why: 'NOT a polarity flip (contrary to the task description): the old text “和他人交流相比药物更能化解烦恼” ' +
         'already points the same way as the English. It is rewritten because it is compressed and drops ' +
         '“problems AND worries”, “often” and “drugs or medicine”, not because the direction was wrong.' },
];
const POLARITY_FLIPS = ZH_OVERRIDES.filter((o) => o.flip).map((o) => o.i);

const zhOverrideReport = [];
for (const o of ZH_OVERRIDES) {
  const enSrc = String(questions[o.i]);
  const before = String(questions_zh[o.i]);
  const rec = { i: o.i, before, after: o.zh, en: enSrc, why: o.why, flip: !!o.flip,
                identical: before === o.zh, applied: false, mismatch: false };
  if (!o.en.test(enSrc)) {
    rec.mismatch = true;                 // English does not match the audit -> skip, do not apply
  } else {
    questions_zh[o.i] = o.zh;            // applied BEFORE the meta-note stripper runs
    rec.applied = true;
  }
  zhOverrideReport.push(rec);
}
const zhOverrideMismatch = zhOverrideReport.filter((r) => r.mismatch);
const zhOverrideIdentical = zhOverrideReport.filter((r) => r.identical);


// ---------------------------------------------------------------------------
// Static Chinese copy
// ---------------------------------------------------------------------------
const META = shortN
  ? {
      id: 'mmpi2_short',
      name: '明尼苏达多项人格测验第二版（短卷）',
      nameEn: 'MMPI-2 Short Form',
      abbreviation: 'MMPI-2短卷',
    }
  : {
      id: 'mmpi2',
      name: '明尼苏达多项人格测验第二版',
      nameEn: 'Minnesota Multiphasic Personality Inventory-2',
      abbreviation: 'MMPI-2',
    };

const INSTRUCTIONS =
  '下面每一句话都描述一种情况或感受。请根据你最近一段时间的实际状况，对每一句选择“是”或“否”。' +
  '请逐题作答，不要跳过任何一题；如果一句话只有一部分符合你，也请按更符合你的那种情况作答。' +
  '题目没有对错之分，答案也没有好坏之分，请如实反映你自己的情况。本测验共 ' + N_ITEMS + ' 题，请在状态平稳、时间充裕时完成。';

const INSTRUCTIONS_EN =
  'Each statement below describes a situation or a feeling. Read it and choose Yes or No according to how things ' +
  'have been for you over the recent period. Answer every item and do not skip any; if a statement is only partly ' +
  'true for you, answer according to what is more characteristic of you. There are no right or wrong answers and no ' +
  'good or bad answers - answer as honestly as you can. This form has ' + N_ITEMS + ' items; please complete it when ' +
  'you are settled and have enough time.';

const LICENSE =
  '条目英文文本源自 Kevin Timmerman 于 2008 年以 GPLv3 许可发布的 MMPI-2 实现；' +
  '中文译文与计分数据整理自开源项目 MMPI-CHN（https://github.com/MMPI-CHN/MMPI-CHN.github.io），' +
  '并非官方《MMPI-2 中文简体字版》。MMPI 与 MMPI-2 量表本身的版权及发行权归明尼苏达大学出版社（University of Minnesota Press）' +
  '与 Pearson 临床评估部门所有。中国常模参数取自 Cheung, Song & Zhang (1996) 表 6-3' +
  '（载于 Butcher 主编 International Adaptations of the MMPI-2, pp. 137-161）。';

// Change 5 — the note. Clauses 一/二/三 and the closing 仅供参考不作诊断 sentence
// are the four boundary statements carried over unchanged from the previous
// revision; the rest documents what this revision added. `critCount` is the
// number of critical-item groups that survived the form's item cut.
function buildNote(critCount, critTotal) {
  const clause4 = shortN
    ? '四、VRIN／TRIN 应答一致性指标只在完整卷（567 题）计算：本短卷缺少部分题对所需的题目，' +
      '不可计算，也不应由短卷推算（完整卷采用 MMPI-2 通行读法 T≥80 为作答不一致）；'
    : '四、VRIN／TRIN 应答一致性指标已实现（仅完整卷；短卷不可计算）。判读阈值：原始仓库未给出自有 T 分档，' +
      '故采用 MMPI-2 通行读法，VRIN T≥80 视为作答不一致；TRIN 的 T 表两端高、中间低，' +
      'T≥80 即为不一致、T≤65 视为可接受区间，高 T 分既可能是系统性答“是”也可能是系统性答“否”，' +
      '单凭 T 分不能区分方向；仓库文档另引述 Cheung 等（1996）第 142 页的中国样本原始分界限' +
      '（VRIN 原始分＞13，TRIN＜6 或＞13），仅作参考背景，未用于拦截展示；' +
      '一致性指标偏高时提示整份答卷可能需要在状态平稳时重做，而不是对作答者的评判；';
  const critClause = shortN
    ? '五、' + critCount + ' 组关键题（题目全部落在前 ' + N_ITEMS + ' 题内者；完整卷共 ' + critTotal + ' 组）' +
      '以「肯定回答的题目数」报告，不是 T 分，也不构成诊断；'
    : '五、' + critCount + ' 组关键题（KB1-KB6、LW1-LW11）以「肯定回答的题目数」报告，不是 T 分，也不构成诊断；';
  return '一、本版本使用自行整理的中文译文，与正版中文简体字版不同，题目等价性未经验证；' +
    '二、中国常模建立于 1990 年代（对标 1990 年人口普查），且完整原始分分布未公开，本项目采用双参数近似换算 ' +
    'T_中国 = 50 + (T_美国 − M_T) × 10 / S_T，只校正位置与离散度，不是官方中国一致性 T 分；' +
    '三、结果中的 T 分以中国近似 T 分为主、美国查表 T 分为辅，中国区分点为 60T（美国为 65T）；' +
    '查表空洞与超范围处按就近取值／端点钳位处理；' +
    clause4 +
    critClause +
    '六、Mf 按性别使用各自的题键与常模表；' +
    '七、数据勘误: 上游 D1 量表把第 223 题同时列入正反两个方向（会恒定加 1 分），已从正向键移除; ' +
    '依据英文原文对 18 处中文译文做了订正，其中第 184 题原为语义反转（会直接导致计分方向错误），' +
    '第 501 题原译方向正确但表述含混、已按英文原文改写，并清除了残留的译者按语; ' +
    '八、本结果仅供自我了解与和专业人士讨论之用，不能作为诊断依据。';
}

const CRISIS_MESSAGE =
  '你在这次作答中，对若干与自我伤害或自杀意念有关的关键内容回答了“是”，这提示你可能正处于急性痛苦之中。' +
  '请不要独自承担：现在就联系一位你信任的人，或学校、单位的心理咨询师，或拨打当地的心理援助热线；' +
  '如果你觉得自己可能马上做出伤害自己的事，请立即前往最近的医院急诊，或拨打当地急救电话。' +
  '痛苦是可以被帮助的，寻求支持是有效且值得的一步。';

// ---------------------------------------------------------------------------
// Change 3 — critical-item groups: names and band copy
//
// Faithful Chinese renderings of the Koss-Butcher / Lachar-Wrobel group labels,
// plus the code in parentheses. Wording is clinical and deliberately neutral.
// ---------------------------------------------------------------------------
const CRIT_CN = {
  KB1: '急性焦虑', KB2: '抑郁性自杀意念', KB3: '威胁性攻击', KB4: '酗酒引起的情境性应激',
  KB5: '思维混乱', KB6: '被害观念',
  LW1: '焦虑与紧张', LW2: '抑郁与担忧', LW3: '睡眠障碍', LW4: '偏离常态的信念',
  LW5: '偏离常态的思维与体验', LW6: '物质滥用', LW7: '反社会态度', LW8: '家庭冲突',
  LW9: '问题性愤怒', LW10: '性方面的困扰与偏离', LW11: '躯体症状',
};
// Plain-language gloss of what each group's items actually ask about, used in
// the band copy so the reader is never handed a bare label.
const CRIT_GLOSS = {
  KB1: '突然发作的紧张、心慌、透不过气或濒死感',
  KB2: '情绪低落、无望，以及自我伤害或自杀的念头',
  KB3: '强烈的愤怒，想砸东西、想动手或想做出伤人／出格的事',
  KB4: '因自己或家人的饮酒问题而陷入的现实困境',
  KB5: '思路混乱、看不懂事物、难以理解周围发生的事',
  KB6: '觉得被人监视、跟踪、陷害或议论',
  LW1: '紧张、坐立不安与难以放松',
  LW2: '情绪低落与反复担忧',
  LW3: '入睡困难、易醒或睡眠质量差',
  LW4: '与常人不同的信念，例如相信自己有特异能力或被外力控制',
  LW5: '不寻常的知觉与思维体验，例如听到或看到别人感知不到的东西',
  LW6: '酒精或药物的使用及其带来的问题',
  LW7: '对规则与他人权益的轻视态度',
  LW8: '与家人之间的冲突、疏离或难以相处',
  LW9: '难以控制的脾气与由此带来的麻烦',
  LW10: '性方面的困扰或与常态不同的性体验',
  LW11: '身体多个部位的不适主诉',
};
// Groups whose endorsed items warrant an immediate help-seeking prompt.
const CRIT_URGENT = ['KB2', 'KB3'];
const CRIT_URGENT_TEXT = {
  KB2: '本次作答中，有与' + CRIT_GLOSS.KB2 + '有关的题目被回答为符合。请不要独自承担：' +
    '现在就联系一位你信任的人，或学校、单位的心理咨询师，或拨打当地心理援助热线；' +
    '如果你觉得自己可能马上做出伤害自己的事，请立即前往最近的医院急诊，或拨打当地急救电话。' +
    '这是一条提醒你尽快获得支持的提示，不是诊断，也不代表对你的评价。',
  KB3: '本次作答中，有与' + CRIT_GLOSS.KB3 + '有关的题目被回答为符合。' +
    '如果你担心这些冲动可能让你伤到自己或伤到别人，请现在就告诉一位你信任的人，' +
    '或联系心理咨询师、当地心理援助热线；如果存在立即的危险，请前往最近的医院急诊，或拨打当地急救电话。' +
    '这是一条提醒你尽快获得支持的提示，不是诊断，也不代表对你的评价。',
};
function critBands(code) {
  const gloss = CRIT_GLOSS[code] || code;
  const trait = CRIT_CN[code] || code;
  const zero = '本次作答中，本组「' + trait + '」相关的题目没有一题被计分，即没有一题的回答方向提示这方面的内容。' +
    '这只是对本次答卷中若干题目的归类统计，不是诊断，也不能据此排除任何情况。';
  if (CRIT_URGENT.includes(code)) {
    return [
      { min: 0, max: 1, level: '未提示', description: zero },
      { min: 1, level: '需立即关注', description: CRIT_URGENT_TEXT[code] },
    ];
  }
  const some = '本次作答中，有一题或多题在「' + trait + '」相关内容上被计分（涉及' + gloss + '）。' +
    '这类内容值得在安全、保密的环境里与心理咨询师或医生聊一聊，看看它对你现在的生活意味着什么。' +
    '这里的数字只是被计分题目的数量，不是严重程度评分，不构成诊断，也不代表你就是这样的人。';
  return [
    { min: 0, max: 1, level: '未提示', description: zero },
    { min: 1, level: '需关注', description: some },
  ];
}

// ---------------------------------------------------------------------------
// Chinese scale names (all 129 emitted factors, keyed by source scaleName)
// ---------------------------------------------------------------------------
const CN = {
  F: '诈病', Fb: '后半F', Fp: '精神病理罕见回答', L: '说谎', K: '校正', S: '超常自我呈现',
  Hs: '疑病', D: '抑郁', Hy: '癔症', Pd: '精神病态偏离', Mf: '男子气-女子气',
  Pa: '妄想', Pt: '精神衰弱', Sc: '精神分裂', Ma: '轻躁狂', Si: '社会内向',
  D1: '主观抑郁', D2: '精神运动性迟滞', D3: '躯体功能障碍', D4: '思维迟钝', D5: '忧思反刍',
  Hy1: '否认社交焦虑', Hy2: '对关爱的需求', Hy3: '倦怠与不适', Hy4: '躯体主诉', Hy5: '攻击性的抑制',
  Pd1: '家庭不和', Pd2: '与权威的冲突', Pd3: '社交泰然', Pd4: '社会疏离', Pd5: '自我疏离',
  Pa1: '被害观念', Pa2: '辛酸感', Pa3: '天真',
  Sc1: '社会疏离', Sc2: '情感疏离', Sc3: '认知层面的自我掌控缺乏', Sc4: '意志层面的自我掌控缺乏',
  Sc5: '抑制缺陷层面的自我掌控缺乏', Sc6: '古怪的感知体验',
  Ma1: '道德感薄弱', Ma2: '精神运动性加速', Ma3: '泰然自若', Ma4: '自我膨胀',
  Si1: '害羞与自我意识', Si2: '社交回避', Si3: '自我与他人疏离',
  ANX: '焦虑', FRS: '恐惧', OBS: '强迫', DEP: '抑郁', HEA: '健康关注', BIZ: '古怪思维',
  ANG: '愤怒', CYN: '愤世嫉俗', ASP: '反社会行为', TPA: 'A型行为', LSE: '低自尊',
  SOD: '社交不适', FAM: '家庭问题', WRK: '工作干扰', TRT: '负面治疗指标',
  A: '显性焦虑', R: '压抑', Es: '自我力量', 'MAC-R': '麦氏酗酒倾向（修订版）',
  AAS: '成瘾问题的承认', APS: '成瘾潜在倾向', MDS: '婚姻困扰', Ho: '敌意',
  'O-H': '过度控制的敌意', Do: '支配性', Re: '社会责任感', Mt: '大学生适应不良',
  GM: '男性化性别角色', GF: '女性化性别角色', PK: '创伤后应激（Keane 版）', PS: '创伤后应激（Penick 版）',
  'D-O': '抑郁的显性成分', 'D-S': '抑郁的隐性成分', 'Hy-O': '癔症的显性成分', 'Hy-S': '癔症的隐性成分',
  'Pd-O': '精神病态偏离的显性成分', 'Pd-S': '精神病态偏离的隐性成分',
  'Pa-O': '妄想的显性成分', 'Pa-S': '妄想的隐性成分', 'Ma-O': '轻躁狂的显性成分', 'Ma-S': '轻躁狂的隐性成分',
  dem: '去士气化', som: '躯体主诉', lpe: '正性情绪缺乏', cyn: '愤世嫉俗', asb: '反社会行为',
  per: '被害观念', dne: '功能失调性负性情绪', abx: '异常体验', hpm: '轻躁狂激活',
  AGGR: '攻击性', PSYC: '精神病性', DISC: '失约束', NEGE: '负性情绪性/神经质', INTR: '内向性/低正性情绪',
  FRS1: '泛化的恐惧倾向', FRS2: '多种特定恐惧',
  DEP1: '动力缺乏', DEP2: '心境恶劣', DEP3: '自我贬低', DEP4: '自杀意念',
  HEA1: '胃肠道症状', HEA2: '神经系统症状', HEA3: '一般健康关注',
  BIZ1: '精神病性症状', BIZ2: '分裂型特征',
  ANG1: '爆发性行为', ANG2: '易激惹',
  CYN1: '厌世信念', CYN2: '人际怀疑',
  ASP1: '反社会态度', ASP2: '反社会行为',
  TPA1: '急躁', TPA2: '竞争驱力',
  LSE1: '自我怀疑', LSE2: '顺从',
  SOD1: '内向', SOD2: '害羞',
  FAM1: '家庭不和', FAM2: '家庭疏离',
  TRT1: '求助动机不足', TRT2: '难以自我袒露',
};

// Trait phrase used inside the derived band wording (defaults to CN[id]).
const TRAIT = {
  PSYC: '精神病性倾向', DISC: '冲动与约束缺乏', Pa2: '辛酸与委屈感',
  TRT1: '求助动机不足', MAC_R: '酗酒倾向', Mt: '适应不良（大学生样本）',
};
const traitOf = (id) => TRAIT[id] || TRAIT[id.replace('-', '_')] || CN[id];

// ---------------------------------------------------------------------------
// Hand-written band copy: 6 validity + 10 clinical + 15 content scales
// ---------------------------------------------------------------------------
function bands(low, norm, mid, high) {
  return [
    { min: 0, max: 40, level: '偏低', description: low },
    { min: 40, max: 60, level: '常模范围', description: norm },
    { min: 60, max: 70, level: '偏高', description: mid },
    { min: 70, level: '显著偏高', description: high },
  ];
}

const CUSTOM_BANDS = {
  L: bands(
    '很少给出社会赞许性的回答，作答较为坦率；也可能是对自己要求不严或不太在意自我呈现。',
    '社会赞许性回答处于常见水平，作答态度大体坦率。',
    '社会赞许性回答偏多，可能有意呈现良好形象，也可能反映较为拘谨、道德要求严格的作答风格。',
    '社会赞许性回答明显偏多，提示作答可能不够坦率，其余量表的结果需要谨慎解释。'),
  F: bands(
    '稀有回答很少，作答方式常规；在极端情况下也可能反映回避自我暴露。',
    '稀有回答量处于常见范围，本次作答的有效性大体可以接受。',
    '稀有回答偏多，可能反映明显的困扰或求助愿望，也可能反映夸大症状、随机作答或理解题目有困难。',
    '稀有回答很多，本次结果的有效性存疑，建议核对作答状态后与专业人士讨论。'),
  K: bands(
    '对自身心理资源与应对能力的自评较低，倾向于坦承缺点，也可能反映当前支持感不足。',
    '心理防御与自我强度处于常见水平。',
    '对心理资源与自我控制的自评较高，倾向于以成熟方式应对，也可能带有一定防御性。',
    '明显倾向于呈现良好适应的形象，可能回避暴露困扰，解释其他量表结果时需要留意作答态度。'),
  Fb: bands(
    '量表后半部分的稀有回答很少，前后作答方式大体一致。',
    '后半部分稀有回答量处于常见范围。',
    '后半部分稀有回答偏多，可能反映疲劳、注意力下降，也可能反映后半段困扰增加。',
    '后半部分稀有回答很多，提示作答一致性可能受影响，建议结合前半部分结果谨慎解释。'),
  Fp: bands(
    '与精神病理内容相关的稀有回答很少。',
    '与精神病理内容相关的稀有回答量处于常见范围。',
    '此类稀有回答偏多，可能反映较明显的思维或感知方面困扰，也可能反映夸大症状。',
    '此类稀有回答很多，结果有效性存疑，建议与专业人士讨论本次的作答状态。'),
  S: bands(
    '较少以完美形象呈现自己，作答较为开放。',
    '自我呈现方式处于常见水平。',
    '倾向于把自己描述得过分完好，可能反映较强的印象管理动机。',
    '自我呈现明显趋于完美化，提示作答可能不够坦率，结果需谨慎解释。'),
  Hs: bands(
    '很少报告躯体不适，对健康状况的担忧较少。',
    '躯体关注程度处于常见水平。',
    '躯体不适主诉或对健康的担忧偏多，常与压力、焦虑或对身体感受的过度留意有关。',
    '躯体主诉很多，可能以身体不适的方式表达心理困扰，建议结合医学检查与专业评估来理解。'),
  D: bands(
    '情绪低落、无望、缺乏动力的报告很少，主观情绪状态较好。',
    '抑郁相关体验处于常见水平。',
    '情绪低落、兴趣减退、无望感等体验偏多，反映当前心理负担较重。',
    '抑郁相关体验很多，可能伴有明显的情绪痛苦与动力下降，建议尽快寻求专业支持。'),
  Hy: bands(
    '很少以躯体方式应对压力，情绪表达较为直接。',
    '应对方式与情绪表达处于常见水平。',
    '倾向以躯体不适应对压力，同时可能否认心理困扰，人际上可能较为依赖或幼稚。',
    '此类应对方式很明显，心理冲突可能主要以身体症状呈现，建议与专业人士讨论。'),
  Pd: bands(
    '与家庭和社会规范的冲突较少，行为较为循规蹈矩。',
    '对社会规范的态度处于常见水平。',
    '对权威与规范的不满、家庭关系紧张或冲动倾向偏多。',
    '明显的规范冲突、疏离感或冲动倾向，可能伴随行为方面的现实困难，建议进行专业评估。'),
  Mf: bands(
    '兴趣与态度较为传统，接近同性别常模中的传统取向。此量表描述个人风格，不是病理指标。',
    '兴趣与态度的分布处于常见范围。此量表高低本身不代表存在问题。',
    '兴趣与态度偏离传统性别角色取向，可能表现为审美与情感表达方面的敏感性较高。',
    '兴趣与态度明显偏离传统性别角色取向，属于个人风格与兴趣的描述，不宜作病理理解。'),
  Pa: bands(
    '较少怀疑他人意图，人际信任度较高，也可能对他人的态度不够敏感。',
    '人际信任与敏感程度处于常见水平。',
    '对他人的戒备、被误解感或委屈感偏多。',
    '明显的多疑、被害感或关系观念，可能影响人际功能，建议尽快进行专业评估。'),
  Pt: bands(
    '焦虑、强迫与自责的体验较少。',
    '焦虑与强迫相关体验处于常见水平。',
    '紧张、担忧、反复思虑与自我怀疑偏多。',
    '焦虑、强迫或自责体验很突出，可能明显影响日常功能，建议寻求专业帮助。'),
  Sc: bands(
    '思维与感知体验较为常规，社会疏离感少。',
    '相关体验处于常见水平。',
    '疏离感、怪异思维或感知体验偏多，也可能反映明显的困惑与压力。',
    '此类体验很突出，可能伴有现实检验方面的困难，建议尽快由专业人士评估。'),
  Ma: bands(
    '活动水平与心境较为平和，也可能反映精力不足、兴趣减少。',
    '精力与活动水平处于常见范围。',
    '精力旺盛、思维与活动加快、易激惹或计划过多的倾向偏多。',
    '明显的活动与心境加速，可能伴随冲动与注意力分散，建议进行专业评估。'),
  Si: bands(
    '社交主动、乐于与人相处，可能偏好热闹的环境。',
    '社交倾向处于常见水平。',
    '偏好独处，在社交场合中较为拘谨或害羞。',
    '明显的社交回避与孤独倾向，可能影响人际支持，建议关注并在必要时与专业人士讨论。'),
  ANX: bands(
    '焦虑相关体验很少。', '焦虑水平处于常见范围。',
    '紧张、担忧与躯体性焦虑体验偏多。',
    '焦虑体验很突出，可能影响睡眠、注意力与日常功能，建议寻求专业帮助。'),
  FRS: bands(
    '恐惧体验很少。', '恐惧水平处于常见范围。',
    '对特定事物或情境的恐惧偏多。',
    '恐惧体验很突出，可能出现回避行为，建议与专业人士讨论。'),
  OBS: bands(
    '较少受反复念头或仪式化行为困扰，也可能反映计划性与条理性较弱。',
    '强迫相关体验处于常见范围。',
    '反复思虑、难以决断或坚持固定方式的倾向偏多。',
    '强迫性思维或行为很突出，可能耗费大量时间与精力，建议进行专业评估。'),
  DEP: bands(
    '抑郁相关体验很少。', '抑郁水平处于常见范围。',
    '情绪低落、无望、缺乏动力与自我否定偏多。',
    '抑郁体验很突出，可能伴有明显的功能受损，建议尽快寻求专业支持。'),
  HEA: bands(
    '躯体症状主诉很少。', '躯体关注处于常见范围。',
    '多系统的躯体不适主诉偏多，可能与压力或对身体感受的留意有关。',
    '躯体主诉很多且涉及多个系统，建议先经医学检查排除躯体原因，再与专业人士讨论心理因素。'),
  BIZ: bands(
    '思维内容较为常规。', '相关体验处于常见范围。',
    '怪异思维、不寻常信念或感知体验偏多。',
    '此类体验很突出，可能提示现实检验方面的困难，建议尽快进行专业评估。'),
  ANG: bands(
    '愤怒与不耐烦的体验很少。', '愤怒水平处于常见范围。',
    '易怒、不耐烦或愤懑的体验偏多。',
    '愤怒体验很突出，可能影响人际关系与安全，建议寻求专业帮助。'),
  CYN: bands(
    '对他人动机较为信任。', '人际信任水平处于常见范围。',
    '对他人动机的怀疑与不信任偏多。',
    '明显的不信任与敌意归因倾向，可能影响人际关系，建议与专业人士讨论。'),
  ASP: bands(
    '较少出现违反规范的行为与态度。', '相关态度与行为处于常见范围。',
    '对规范的轻视或越轨行为的倾向偏多。',
    '此类倾向很明显，可能伴随现实中的行为后果，建议进行专业评估。'),
  TPA: bands(
    '节奏较为从容，竞争与时间紧迫感较少，也可能反映动力不足。',
    'A型行为特征处于常见范围。',
    '时间紧迫、竞争性强、急躁的倾向偏多。',
    'A型行为特征很明显，长期可能与压力负荷及心血管风险相关，建议关注作息与压力管理。'),
  LSE: bands(
    '自我评价较为积极，自信水平较好。', '自尊水平处于常见范围。',
    '自我怀疑、无价值感与缺乏自信偏多。',
    '自尊明显偏低，可能影响情绪与人际功能，建议寻求专业支持。'),
  SOD: bands(
    '在社交场合中感到自在，偏好与人相处。', '社交舒适度处于常见范围。',
    '在社交场合中感到拘谨、害羞或不适。',
    '社交不适很明显，可能出现回避，建议与专业人士讨论。'),
  FAM: bands(
    '家庭关系较为和睦，冲突较少。', '家庭关系体验处于常见范围。',
    '家庭冲突、疏离或对家庭的不满偏多。',
    '家庭关系困扰很明显，可能构成重要的压力来源，建议寻求家庭层面的支持或专业帮助。'),
  WRK: bands(
    '工作或学习方面的障碍体验很少。', '相关体验处于常见范围。',
    '工作动机下降、难以集中注意力或职业不确定感偏多。',
    '工作与学习功能受到明显干扰，建议评估压力来源并寻求专业支持。'),
  TRT: bands(
    '对求助与改变持开放态度，负面治疗指标很少。', '相关态度处于常见范围。',
    '对求助的抵触、自我封闭或难以袒露的倾向偏多。',
    '明显的求助抵触与自我封闭，可能影响干预效果，建议在建立信任的基础上寻求专业帮助。'),
};

// Extra wording appended to the top band of acute-risk subscales.
const HIGH_BAND_SUFFIX = {
  DEP4: '若你近期出现伤害自己的念头，请立即联系信任的人、心理咨询师或当地心理援助热线，必要时前往急诊。',
};

function derivedBands(id) {
  const t = traitOf(id);
  const suffix = HIGH_BAND_SUFFIX[id] ? HIGH_BAND_SUFFIX[id] : '建议结合整体剖面与专业人士讨论，本结果不构成诊断。';
  return bands(
    t + '方面的得分低于常模，反映该维度上相关特征较少。',
    t + '方面的得分处于常模范围内，属于常见水平。',
    t + '方面的得分高于常模，反映该维度上相关特征较多。',
    t + '方面的得分明显高于常模。' + suffix);
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
// Hard rule: no ASCII double quote may survive inside any string value.
function typographicQuotes(s) {
  let open = true;
  let out = '';
  for (const ch of s) {
    if (ch === '"') { out += open ? '\u201C' : '\u201D'; open = !open; }
    else out += ch;
  }
  return out;
}

// The upstream translation carries translator meta-notes that are not part of
// the stimulus text (e.g. “译注：…”, “（不确定-请看原文）”, “(…,不好翻,自己理解一下)”).
// Strip them and log. Hardened: the third pattern also catches the 不好翻 /
// 自己理解 / TODO flavour that the original two missed (item 498).
const ZH_NOTE_RE = [
  /译注[:：][\s\S]*$/g,
  /[（(][^（）()]*?(?:不确定|以原文为准|建议看原文|翻译不确定)[^（）()]*?[)）]/g,
  /[（(][^（）()]*?(?:不好翻|自己理解|TODO|待翻|存疑)[^（）()]*?[)）]/g,
];
function stripZhNotes(raw) {
  let s = raw;
  for (const re of ZH_NOTE_RE) s = s.replace(re, '');
  return s.replace(/[ \t\u3000]+$/g, '').replace(/\s+([。，、；：！？])/g, '$1').replace(/[ \t]{2,}/g, ' ');
}
const zhNoteEdits = [];
function cleanZh(index, raw) {
  const s = stripZhNotes(raw);
  if (s !== raw) zhNoteEdits.push({ index, before: raw, after: s });
  return s;
}

// Change 1b — residual translator-note scan over ALL 567 Chinese items, run on
// the post-override text. Every hit is reported with its index and text and
// classified:
//   note        unambiguously a translator note -> stripped by stripZhNotes
//   legitimate  genuine stimulus content (mirrors an English parenthetical, or
//               one of the (若…已去世…) clauses the overrides just added)
//   ambiguous   a translator gloss that is not a note; reported, left untouched
const ZH_NOTE_TOKENS = ['译注', '不好翻', '自己理解', '或：', '英文', 'TODO', '不确定'];
const ZH_NOTE_PAREN_RE = /译注|不确定|以原文为准|建议看原文|翻译不确定|翻译可能不准|不好翻|自己理解|TODO|待翻|存疑/;
const ZH_PAREN_CLASS = {
  6:   ['legitimate', 'the (若父亲已去世…) clause the audit just added; mirrors the English parenthetical'],
  17:  ['ambiguous', '（许多） has no English counterpart but reads as item emphasis — left untouched'],
  54:  ['legitimate', 'mirrors the English (or the work I intend to choose for my lifework)'],
  90:  ['legitimate', 'the (若父亲已去世…) clause the audit just added; mirrors the English parenthetical'],
  166: ['ambiguous', '（生活） narrows sex to sex life; a translator insertion, not a note — left untouched'],
  192: ['legitimate', 'the (若母亲已去世…) clause the audit just added; mirrors the English parenthetical'],
  226: ['legitimate', 'mirrors the English “or even when things are going wrong”'],
  272: ['ambiguous', '（洋娃娃） is the only place the English “dolls” survives (the main clause says 毛绒玩具/抱枕); stripping it would lose the stimulus'],
  276: ['legitimate', 'the (若母亲已去世…) clause the audit just added; mirrors the English parenthetical'],
  305: ['ambiguous', '（超出了我应该担心的范围） restates “more than my share”; a redundant gloss, not a note'],
  399: ['legitimate', '不确定性 is the item word “uncertain” — a false positive of the 不确定 token'],
  425: ['legitimate', 'mirrors the English (such as my father, stepfather, etc.)'],
  447: ['ambiguous', '（污垢） glosses 脏东西 for “dirt”; redundant, not a note'],
  477: ['legitimate', 'mirrors the English (such as soccer or football)'],
  530: ['ambiguous', '（自残） adds a clinical label the English “cut or injure myself” does not carry'],
  556: ['ambiguous', '（不足） turns “money” into “income (insufficiency)”; a wording drift, not a note'],
};

const sqz = (x) => String(x).replace(/\s+/g, '');
const zhNoteScan = [];
for (let q = 1; q <= TOTAL_ITEMS; q++) {
  const s = String(questions_zh[q]);
  const paren = [...s.matchAll(/（[^（）]*）|\([^()]*\)/g)].map((m) => m[0]);
  const tokens = ZH_NOTE_TOKENS.filter((t) => s.includes(t));
  const asciiCjk = paren.filter((p) => p.startsWith('(') && /[\u3400-\u9fff]/.test(p));
  if (!paren.length && !tokens.length) continue;
  const stripped = stripZhNotes(s);
  const gone = (frag) => !sqz(stripped).includes(sqz(frag));   // did the stripper remove it?
  const findings = [];
  for (const p of paren) {
    const audited = ZH_PAREN_CLASS[q];
    const isNote = gone(p);
    findings.push({
      kind: 'paren', text: p,
      cls: isNote ? 'note' : (audited ? audited[0] : 'ambiguous'),
      why: isNote ? 'unambiguous translator note — removed by the stripper'
        : (audited ? audited[1] : 'no audit entry -> reported, left untouched'),
    });
  }
  for (const t of tokens) {
    if (paren.some((p) => p.includes(t))) continue;          // already reported with its parenthetical
    const audited = ZH_PAREN_CLASS[q];
    const isNote = gone(t);
    findings.push({
      kind: 'token', text: t,
      cls: isNote ? 'note' : (audited ? audited[0] : 'ambiguous'),
      why: isNote ? 'inside a translator note removed by the stripper'
        : (audited ? audited[1] : 'no audit entry -> reported, left untouched'),
    });
  }
  if (asciiCjk.length) {
    findings.push({ kind: 'asciiParenCJK', text: asciiCjk.join(' '),
      cls: gone(asciiCjk[0]) ? 'note' : 'ambiguous',
      why: 'ASCII parentheses wrapping CJK' + (gone(asciiCjk[0]) ? ' — removed by the stripper' : ' — left untouched') });
  }
  zhNoteScan.push({ index: q, text: s, stripped, changed: stripped !== s, findings,
    residualAsciiCjk: /\([^()]*[\u3400-\u9fff][^()]*\)/.test(stripped) });
}

function cleanText(s) {
  return typographicQuotes(String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim());
}

// ---------------------------------------------------------------------------
// Source-table helpers
// ---------------------------------------------------------------------------
function tableWeight(table) {
  if (!Array.isArray(table) || table.length === 0) return undefined;
  const w = table[0];
  return (typeof w === 'number' && w) ? w : undefined;   // reference uses `if (tscale[0])`
}

// normTable column: col[r] === table[r + 1]; holes -> null; trailing nulls trimmed.
function buildColumn(table) {
  if (!Array.isArray(table) || table.length === 0) return [];
  const col = [];
  for (let r = 0; r + 1 < table.length; r++) {
    const v = table[r + 1];
    col.push(v === undefined || v === null ? null : v);
  }
  while (col.length && col[col.length - 1] === null) col.pop();
  return col;
}

const asc = (a) => a.slice().sort((x, y) => x - y);

// Change 2 — VRIN / TRIN tables. my_script.js line 163 reads
// `rin[i][2 + gender][rawscore]`, i.e. the table is indexed DIRECTLY by the raw
// score, with NO +1 offset (unlike `scales`, where line 238/244 read
// `tscale[kscore + 1]`). So the consistency column is a verbatim copy of the
// source array, holes -> null, trailing nulls trimmed, leading undefined slots
// kept as null so the index still equals the raw score.
//
// TRIN's cells are decorated strings ("114F", "50", "57T"): the digits are the
// T score and the letter records the response direction (F = an all-False
// pattern, T = an all-True pattern). The Dart engine reads a normTable cell as a
// double (jsonDouble("114F") would fall back to 0), so only the numeric part can
// be emitted; the direction is recovered from the raw index and reported here.
function rinCell(v) {
  if (v === undefined || v === null) return { t: null, dir: null, src: null };
  if (typeof v === 'number') return { t: v, dir: null, src: String(v) };
  const m = /^(\d+)\s*([TF])?$/.exec(String(v).trim());
  if (!m) throw new Error('unparsable *RIN table cell: ' + JSON.stringify(v));
  return { t: Number(m[1]), dir: m[2] || null, src: String(v) };
}
function buildRinColumn(table) {
  if (!Array.isArray(table) || table.length === 0) return [];
  const col = table.map((v) => rinCell(v).t);
  while (col.length && col[col.length - 1] === null) col.pop();
  return col;
}
const rinDir = (table, raw) => (Array.isArray(table) ? (rinCell(table[raw]).dir) : null);
const TF_TO_VALUE = { T: 1, F: 0 };

// ---------------------------------------------------------------------------
// Critical-item groups (entries whose male AND female T table are both
// undefined). Detected from the data rather than hard-coded: FIRST_CRITICAL is
// only used as a cross-check.
// ---------------------------------------------------------------------------
const criticalGroups = [];
const criticalIndexes = [];
for (let i = 0; i < scales.length; i++) {
  const e = scales[i];
  if (e[3] === undefined && e[4] === undefined) {
    criticalIndexes.push(i);
    criticalGroups.push({
      i,
      code: e[0][1],
      desc: e[0][2],
      trueKeys: asc(e[1]),
      falseKeys: asc(e[2]),
      maxItem: Math.max.apply(null, asc(e[1]).concat(asc(e[2]))),
    });
  }
}
// Acute self-harm / suicidal-ideation groups only. KB2 is the single such group
// (KB1 acute anxiety, KB3 threatened assault, KB4 alcoholism stress, KB5 mental
// confusion, KB6 persecutory ideas, LW1-LW11 cover other content).
const ACUTE_CODES = ['KB2'];
const acuteGroups = criticalGroups.filter((g) => ACUTE_CODES.includes(g.code));
// Only True-keyed items are usable: the engine flags `value >= threshold`, i.e.
// the person answered Yes. KB2's four False-keyed items (9, 75, 95, 388) are
// protective statements, so keying them as crisis items would invert them.
const crisisItemsFull = asc([].concat(...acuteGroups.map((g) => g.trueKeys)));
const crisisItems = crisisItemsFull.filter((q) => q <= N_ITEMS);

// ---------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------
function entryItems(e) { return { t: asc(e[1]), f: asc(e[2]) }; }

const factors = [];
const factorMeta = [];           // parallel array: { id, srcId, sourceIndex, weight, appliesToGender, critical }
const usedIds = new Set();

// opts: { allowDuplicateId, appliesToGender, critical }
function pushFactor(id, name, items, weight, maleTable, femaleTable, sourceIndex, opts) {
  const o = opts || {};
  let uid = id;
  if (o.allowDuplicateId) {
    // The two Mf sex-forms intentionally share the id "Mf": the Dart scorer
    // drops whichever one does not match the user's chosen norm group, so only
    // ever one of them reaches the result list.
    usedIds.add(uid);
  } else {
    let n = 2;
    while (usedIds.has(uid)) uid = id + '_' + n++;
    usedIds.add(uid);
  }
  const factor = { id: uid, name: name + ' (' + id + ')', _items: items };
  if (weight !== undefined) factor.kCorrection = { factorId: 'K', weight };
  if (!o.critical) {
    factor.normTable = { startRaw: 0, male: buildColumn(maleTable), female: buildColumn(femaleTable) };
  }
  if (o.critical) factor.scoreIsRaw = true;
  if (o.appliesToGender) factor.appliesToGender = o.appliesToGender;
  factors.push(factor);
  factorMeta.push({
    id: uid, srcId: id, sourceIndex, weight,
    appliesToGender: o.appliesToGender || null,
    critical: !!o.critical,
  });
  return factor;
}

// scale code -> factor(s), so NORM entries can be attached by SCALE_INDEX.
// Mf resolves to TWO factors (one per sex form); both carry the same cnNorm.
const codeToFactor = {};
function registerCode(code, f) {
  if (!codeToFactor[code]) codeToFactor[code] = [];
  codeToFactor[code].push(f);
}

// The Mf keying difference, reported for Change 4.
const mfMale = scales[MF_MALE], mfFemale = scales[MF_FEMALE];
const mfMaleT = asc(mfMale[1]), mfMaleF = asc(mfMale[2]);
const mfFemT = asc(mfFemale[1]), mfFemF = asc(mfFemale[2]);
const mfKeyDiff = [];
for (const q of Array.from(new Set(mfMaleT.concat(mfMaleF, mfFemT, mfFemF))).sort((a, b) => a - b)) {
  const inMT = mfMaleT.includes(q), inMF = mfMaleF.includes(q);
  const inFT = mfFemT.includes(q), inFF = mfFemF.includes(q);
  if (inMT !== inFT || inMF !== inFF) {
    mfKeyDiff.push({
      q,
      male: inMT ? 'True' : (inMF ? 'False' : '-'),
      female: inFT ? 'True' : (inFF ? 'False' : '-'),
      en: String(questions[q]),
    });
  }
}

for (let i = 0; i < scales.length; i++) {
  if (criticalIndexes.includes(i)) continue;             // emitted later, as raw-count factors
  const e = scales[i];
  const srcId = e[0][1];

  // Change 4 — Mf is two scales in the source (male form entry 10, female form
  // entry 11) that disagree on 4 items. Emit one factor per form, each locked
  // to the sex it was keyed for, each with its own norm column.
  if (i === MF_MALE || i === MF_FEMALE) {
    const isMale = i === MF_MALE;
    const src = isMale ? mfMale : mfFemale;
    const cn = isMale ? '男性化-女性化（男式）' : '男性化-女性化（女式）';
    const table = isMale ? src[3] : src[4];
    const w = tableWeight(table);
    const f = pushFactor(srcId, cn, entryItems(src), w,
      isMale ? table : [], isMale ? [] : table, i,
      { allowDuplicateId: true, appliesToGender: isMale ? 'male' : 'female' });
    registerCode(srcId, f);
    continue;
  }

  const cn = CN[srcId];
  if (!cn) throw new Error('missing Chinese name for scale ' + srcId + ' (entry ' + i + ')');
  const items = entryItems(e);
  const wM = tableWeight(e[3]);
  const wF = tableWeight(e[4]);
  if (wM !== undefined && wF !== undefined && wM !== wF) {
    throw new Error('K weight differs between sexes for ' + srcId + ': ' + wM + ' vs ' + wF);
  }
  const f = pushFactor(srcId, cn, items, wM !== undefined ? wM : wF, e[3], e[4], i, {});
  for (const code of Object.keys(SCALE_INDEX)) {
    if (SCALE_INDEX[code][0] === i && SCALE_INDEX[code][1] === i) registerCode(code, f);
  }
}

// Change 3 — critical-item groups, emitted AFTER every T-scored factor so the
// UI's radar (which takes the first 16 scored factors) still sees the validity
// + clinical profile. Score is the endorsement count: no T lookup, no K
// correction, no cnNorm, hence no normTable at all.
const droppedShortCrit = [];
for (const g of criticalGroups) {
  const all = g.trueKeys.concat(g.falseKeys);
  if (shortN && all.some((q) => q > N_ITEMS)) { droppedShortCrit.push(g.code); continue; }
  const cn = CRIT_CN[g.code];
  if (!cn) throw new Error('missing Chinese name for critical group ' + g.code);
  pushFactor(g.code, cn, { t: g.trueKeys.slice(), f: g.falseKeys.slice() },
    undefined, null, null, g.i, { critical: true });
}

// Data-quality fix: entry 17 (D1) lists item 223 in BOTH key directions.
// 223 is False-keyed in D, D-O, ANX, Mt, PS and NEGE and is never True-keyed
// anywhere else in the source, so the True listing is a transcription error.
// The engine would otherwise add value + (1 - value) = 1 unconditionally.
const d1 = factors.find((f) => f.id === 'D1');
if (d1) {
  const overlap = d1._items.t.filter((q) => d1._items.f.includes(q));
  if (overlap.length) {
    d1._items.t = d1._items.t.filter((q) => !overlap.includes(q));
    d1._fixNote = 'D1: removed item(s) ' + overlap.join(',') + ' from itemIndexes ' +
      '(present in both key directions in the source; False-keyed in D/D-O/ANX/Mt/PS/NEGE)';
  }
}

// Chinese norms (29 codes) -> cnNorm. Mf resolves to both sex-form factors: the
// Chinese parameters are keyed by the test-taker's sex and each factor already
// restricts itself to one sex, so both need the full male/female pair.
let cnNormCount = 0;
let cnNormCodeCount = 0;
for (const code of Object.keys(NORM)) {
  const list = codeToFactor[code];
  if (!list || !list.length) throw new Error('NORM code ' + code + ' did not resolve to a factor');
  const t = NORM[code].tUS;
  for (const f of list) {
    f.cnNorm = {
      male: { meanT: t[0], sdT: t[1] },
      female: { meanT: t[2], sdT: t[3] },
    };
    cnNormCount++;
  }
  cnNormCodeCount++;
}

// Bands + final field order + short-form filtering
const finalFactors = [];
const finalMeta = [];               // parallel to finalFactors
const droppedShort = [];
const droppedShortCn = [];
for (let k = 0; k < factors.length; k++) {
  const f = factors[k];
  const meta = factorMeta[k];
  const all = f._items.t.concat(f._items.f);
  if (shortN && !meta.critical && all.some((q) => q > N_ITEMS)) {
    droppedShort.push(f.id);
    if (f.cnNorm) droppedShortCn.push(f.id);
    continue;
  }
  const o = { id: f.id, name: cleanText(f.name), itemIndexes: f._items.t };
  if (f._items.f.length) o.falseItemIndexes = f._items.f;
  if (f.kCorrection) o.kCorrection = { factorId: f.kCorrection.factorId, weight: f.kCorrection.weight };
  if (f.normTable) o.normTable = f.normTable;
  if (f.cnNorm) o.cnNorm = f.cnNorm;
  if (f.scoreIsRaw) o.scoreIsRaw = true;
  if (f.appliesToGender) o.appliesToGender = f.appliesToGender;
  o.bands = meta.critical
    ? critBands(f.id)
    : (CUSTOM_BANDS[f.id] ? CUSTOM_BANDS[f.id] : derivedBands(f.id));
  finalFactors.push(o);
  finalMeta.push(meta);
}
// Never leave a dangling kCorrection reference.
const liveIds = new Set(finalFactors.map((f) => f.id));
const droppedK = [];
for (const f of finalFactors) {
  if (f.kCorrection && !liveIds.has(f.kCorrection.factorId)) {
    droppedK.push(f.id + '->' + f.kCorrection.factorId);
    delete f.kCorrection;
  }
}

// ---------------------------------------------------------------------------
// Change 2 — VRIN / TRIN response-consistency indicators (567 form only)
//
// Dropped for --short: VRIN pairs reach item 565 and TRIN pairs reach item 560,
// so a 370-item protocol cannot answer every pair. my_script.js agrees — its
// rinComplete() gate refuses to publish a partial VRIN/TRIN as a real score.
// ---------------------------------------------------------------------------
const rinMaxItem = rin.map((r) => Math.max.apply(null, r[1].map((p) => Math.max(p[0], p[2]))));
const RIN_NAMES = { VRIN: '应答不一致性 (VRIN)', TRIN: '肯定应答不一致性 (TRIN)' };

const VRIN_BANDS = [
  { min: 0, max: 80, level: '作答一致',
    description: 'VRIN 的 T 分低于 80，说明这次作答在内容相近或相反的题目之间保持了大体一致，' +
      '没有发现随机作答或系统性自相矛盾的迹象。这只描述本次答卷的作答方式，不是对你个人的评价，也不构成诊断。' },
  { min: 80, level: '作答不一致',
    description: 'VRIN 的 T 分达到 80 或以上，说明在内容相近或相反的题目之间出现了较多互相矛盾的回答，' +
      '可能反映疲劳、分心、没有读懂题目，或没有按实际情况作答。此时其余量表结果的解释需要谨慎，' +
      '整份答卷可能需要在状态平稳、时间充裕时重做一次。这不是对你个人的评判，也不是诊断。' +
      '（Cheung 等 1996 年中国样本采用的筛查界限为原始分大于 13，男性约相当于 T 84、女性约相当于 T 86。）' },
];
const TRIN_BANDS = [
  { min: 0, max: 66, level: '作答一致',
    description: 'TRIN 的 T 分落在 65 或以下，对应的原始分接近中性区间，' +
      '没有发现系统性一律回答“是”或一律回答“否”的倾向。这只描述本次答卷的作答方式，' +
      '不是对你个人的评价，也不构成诊断。' },
  { min: 66, max: 80, level: '需留意',
    description: 'TRIN 的 T 分略高于中性区间但尚未达到 80，提示作答可能存在一定的方向性偏差。' +
      '建议回顾一下当时的作答状态；如果偏差明显，整份答卷可能需要重做。' +
      '这不是诊断，也不代表你就是这样的人。' },
  { min: 80, level: '作答不一致',
    description: 'TRIN 的 T 分达到 80 或以上。本指标的 T 表两端高、中间低，高 T 分既可能是系统性一律回答“是”，' +
      '也可能是一律回答“否”，单凭 T 分无法区分方向（原始分低于 9 偏向一律答“否”，高于 9 偏向一律答“是”）。' +
      '两种情况都提示本次作答的一致性不足，其余量表结果的解释需要谨慎，' +
      '整份答卷可能需要在状态平稳时重做一次。这不是对你个人的评判，也不是诊断。' +
      '（Cheung 等 1996 年中国样本采用的筛查界限为原始分小于 6 或大于 13。）' },
];

const consistency = [];
if (!shortN) {
  for (let r = 0; r < rin.length; r++) {
    const e = rin[r];
    const code = e[0][0];
    const name = RIN_NAMES[code];
    if (!name) throw new Error('missing Chinese name for consistency indicator ' + code);
    consistency.push({
      id: code,
      name: name,
      baseScore: e[0][2],
      pairs: e[1].map((p) => [p[0], TF_TO_VALUE[p[1]], p[2], TF_TO_VALUE[p[3]], p[4]]),
      normTable: { startRaw: 0, male: buildRinColumn(e[2]), female: buildRinColumn(e[3]) },
      bands: code === 'VRIN' ? VRIN_BANDS : TRIN_BANDS,
    });
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const items = [];
const itemNoteEdits = [];
for (let q = 1; q <= N_ITEMS; q++) {
  const zhRaw = String(questions_zh[q]);
  const zh = cleanText(cleanZh(q, zhRaw));
  const en = cleanText(String(questions[q]));
  if (!zh || !en) throw new Error('empty text at item ' + q);
  items.push({ index: q, text: zh, textEn: en });
}
for (const e of zhNoteEdits) itemNoteEdits.push(e);

const critEmitted = finalMeta.filter((m) => m.critical).length;

const doc = {
  id: META.id,
  name: META.name,
  nameEn: META.nameEn,
  abbreviation: META.abbreviation,
  category: '人格',
  year: 1989,
  instructions: INSTRUCTIONS,
  instructionsEn: INSTRUCTIONS_EN,
  license: LICENSE,
  note: buildNote(critEmitted, criticalGroups.length),
  options: [
    { value: 1, label: '是', labelEn: 'Yes' },
    { value: 0, label: '否', labelEn: 'No' },
  ],
  items: items,
  scoring: {
    kind: 'tScore',
    decimals: 0,
    hasTotal: false,
    totalLabel: '',
    totalBands: [],
    summaryFactorId: 'D',
    factors: finalFactors,
    consistency: consistency,
  },
  crisis: { itemIndexes: crisisItems, threshold: 1, message: CRISIS_MESSAGE },
};

// ---------------------------------------------------------------------------
// Serializer — compact but readable; items one per line, T tables one per line
// ---------------------------------------------------------------------------
const jstr = (s) => JSON.stringify(s);
const num = (v) => (v === null || v === undefined ? 'null' : String(v));
const dec1 = (v) => v.toFixed(1);
const arr = (a) => '[' + a.map(num).join(',') + ']';
const intArr = (a) => '[' + a.join(',') + ']';

function serialize(d) {
  const L = [];
  L.push('{');
  for (const k of ['id', 'name', 'nameEn', 'abbreviation', 'category']) {
    L.push('  ' + jstr(k) + ': ' + jstr(d[k]) + ',');
  }
  L.push('  "year": ' + d.year + ',');
  for (const k of ['instructions', 'instructionsEn', 'license', 'note']) {
    L.push('  ' + jstr(k) + ': ' + jstr(d[k]) + ',');
  }
  L.push('  "options": [');
  d.options.forEach((o, i) => {
    L.push('    { "value": ' + o.value + ', "label": ' + jstr(o.label) + ', "labelEn": ' + jstr(o.labelEn) + ' }' +
      (i === d.options.length - 1 ? '' : ','));
  });
  L.push('  ],');
  L.push('  "items": [');
  d.items.forEach((it, i) => {
    L.push('    { "index": ' + it.index + ', "text": ' + jstr(it.text) + ', "textEn": ' + jstr(it.textEn) + ' }' +
      (i === d.items.length - 1 ? '' : ','));
  });
  L.push('  ],');
  L.push('  "scoring": {');
  L.push('    "kind": ' + jstr(d.scoring.kind) + ',');
  L.push('    "decimals": ' + d.scoring.decimals + ',');
  L.push('    "hasTotal": ' + d.scoring.hasTotal + ',');
  L.push('    "totalLabel": "",');
  L.push('    "totalBands": [],');
  L.push('    "summaryFactorId": "D",');
  L.push('    "factors": [');
  d.scoring.factors.forEach((f, fi) => {
    const last = fi === d.scoring.factors.length - 1;
    // One entry per key; joined with ",\n" so optional keys (normTable on
    // critical-item groups, scoreIsRaw, appliesToGender) never leave a stray
    // comma. Key order is fixed: id, name, itemIndexes, falseItemIndexes,
    // kCorrection, normTable, cnNorm, scoreIsRaw, appliesToGender, bands.
    const B = [];
    B.push('        "id": ' + jstr(f.id));
    B.push('        "name": ' + jstr(f.name));
    B.push('        "itemIndexes": ' + intArr(f.itemIndexes));
    if (f.falseItemIndexes) B.push('        "falseItemIndexes": ' + intArr(f.falseItemIndexes));
    if (f.kCorrection) {
      B.push('        "kCorrection": { "factorId": ' + jstr(f.kCorrection.factorId) +
        ', "weight": ' + num(f.kCorrection.weight) + ' }');
    }
    if (f.normTable) {
      B.push('        "normTable": {\n' +
        '          "startRaw": ' + f.normTable.startRaw + ',\n' +
        '          "male": ' + arr(f.normTable.male) + ',\n' +
        '          "female": ' + arr(f.normTable.female) + '\n' +
        '        }');
    }
    if (f.cnNorm) {
      B.push('        "cnNorm": {\n' +
        '          "male": { "meanT": ' + dec1(f.cnNorm.male.meanT) + ', "sdT": ' + dec1(f.cnNorm.male.sdT) + ' },\n' +
        '          "female": { "meanT": ' + dec1(f.cnNorm.female.meanT) + ', "sdT": ' + dec1(f.cnNorm.female.sdT) + ' }\n' +
        '        }');
    }
    if (f.scoreIsRaw) B.push('        "scoreIsRaw": true');
    if (f.appliesToGender) B.push('        "appliesToGender": ' + jstr(f.appliesToGender));
    B.push('        "bands": [\n' + f.bands.map((b, bi) =>
      '          { "min": ' + b.min + (b.max === undefined ? '' : ', "max": ' + b.max) +
      ', "level": ' + jstr(b.level) + ', "description": ' + jstr(b.description) + ' }' +
      (bi === f.bands.length - 1 ? '' : ',')).join('\n') + '\n        ]');
    L.push('      {\n' + B.join(',\n') + '\n      }' + (last ? '' : ','));
  });
  L.push('    ],');
  L.push('    "consistency": [' + (d.scoring.consistency.length ? '' : ']'));
  d.scoring.consistency.forEach((c, ci) => {
    const last = ci === d.scoring.consistency.length - 1;
    const B = [];
    B.push('        "id": ' + jstr(c.id));
    B.push('        "name": ' + jstr(c.name));
    B.push('        "baseScore": ' + num(c.baseScore));
    B.push('        "pairs": [' + c.pairs.map((p) => '[' + p.join(',') + ']').join(',') + ']');
    B.push('        "normTable": {\n' +
      '          "startRaw": ' + c.normTable.startRaw + ',\n' +
      '          "male": ' + arr(c.normTable.male) + ',\n' +
      '          "female": ' + arr(c.normTable.female) + '\n' +
      '        }');
    B.push('        "bands": [\n' + c.bands.map((b, bi) =>
      '          { "min": ' + b.min + (b.max === undefined ? '' : ', "max": ' + b.max) +
      ', "level": ' + jstr(b.level) + ', "description": ' + jstr(b.description) + ' }' +
      (bi === c.bands.length - 1 ? '' : ',')).join('\n') + '\n        ]');
    L.push('      {\n' + B.join(',\n') + '\n      }' + (last ? '\n    ]' : ','));
  });
  L.push('  },');
  L.push('  "crisis": {');
  L.push('    "itemIndexes": ' + intArr(d.crisis.itemIndexes) + ',');
  L.push('    "threshold": ' + d.crisis.threshold + ',');
  L.push('    "message": ' + jstr(d.crisis.message));
  L.push('  }');
  L.push('}');
  return L.join('\n') + '\n';
}

const text = serialize(doc);
fs.writeFileSync(outPath, text, { encoding: 'utf8' });

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
say('# MMPI-2 asset extraction report');
say('generated: ' + new Date().toISOString());
say('mode: ' + (shortN ? 'SHORT (items 1..' + N_ITEMS + ')' : 'FULL (items 1..' + N_ITEMS + ')'));
say('output: ' + outPath);
say('');

// --- 1. parse + size -------------------------------------------------------
say('## 1. Parse and size');
const raw = fs.readFileSync(outPath);
ok(raw[0] !== 0xef && raw[1] !== 0xbb && raw[2] !== 0xbf, 'no UTF-8 BOM');
const text2 = raw.toString('utf8');
ok(!text2.includes('\r'), 'LF-only line endings');
let parsed = null;
try { parsed = JSON.parse(text2); ok(true, 'JSON.parse succeeds'); }
catch (err) { ok(false, 'JSON.parse succeeds', err.message); }
const sizeKB = raw.length / 1024;
say('  file size: ' + raw.length + ' bytes = ' + sizeKB.toFixed(2) + ' KB');
say('  line count: ' + text2.split('\n').length);
say('');

// --- 2. items --------------------------------------------------------------
say('## 2. Items');
const it = parsed.items;
ok(it.length === N_ITEMS, 'item count === ' + N_ITEMS, 'got ' + it.length);
let contiguous = true;
for (let k = 0; k < it.length; k++) if (it[k].index !== k + 1) { contiguous = false; break; }
ok(contiguous, 'indexes 1..' + N_ITEMS + ' contiguous and ascending');
ok(it.every((x) => typeof x.text === 'string' && x.text.trim().length > 0), 'every text non-empty');
ok(it.every((x) => typeof x.textEn === 'string' && x.textEn.trim().length > 0), 'every textEn non-empty');
ok(!text2.includes('\\"'), 'no escaped ASCII double quote anywhere in the file');
{
  // deep scan: no ASCII double quote inside any decoded string value
  let bad = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (v.includes('"')) bad.push(p); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']'));
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], p + '.' + k));
  };
  walk(parsed, '$');
  ok(bad.length === 0, 'no ASCII double quote inside any string value', bad.slice(0, 5).join(' '));
}
ok(JSON.stringify(parsed).indexOf('NaN') < 0 && text2.indexOf('NaN') < 0, 'no NaN token');
ok(text2.indexOf('undefined') < 0, 'no undefined token');
say('  zh translator-note edits applied: ' + itemNoteEdits.length);
for (const e of itemNoteEdits) say('    item ' + e.index + ': ' + e.before + '  =>  ' + e.after);
say('');

// --- 2b. Change 1: translation overrides + residual note scan ---------------
say('## 2b. Change 1 — Chinese translation overrides (18 audited corrections)');
for (const r of zhOverrideReport) {
  say('  item ' + String(r.i).padStart(3) + (r.flip ? '  [SEMANTIC POLARITY FLIP]' : ''));
  say('        EN    : ' + r.en);
  say('        BEFORE: ' + r.before);
  say('        AFTER : ' + r.after);
  say('        WHY   : ' + r.why);
  say('        ' + (r.mismatch ? '*** ENGLISH MISMATCH — OVERRIDE NOT APPLIED ***'
    : (r.identical ? 'applied (source Chinese was ALREADY equal to the override)' : 'applied')));
  say('');
}
ok(zhOverrideReport.length === 18, 'ZH_OVERRIDES declares exactly 18 audited corrections',
  'got ' + zhOverrideReport.length);
ok(zhOverrideMismatch.length === 0, 'every override index lines up with the English source (0 mismatches)',
  zhOverrideMismatch.map((r) => r.i).join(','));
ok(zhOverrideIdentical.length === 0, 'no override was a no-op (source Chinese never already equalled it)',
  zhOverrideIdentical.map((r) => r.i).join(','));
ok(JSON.stringify(POLARITY_FLIPS) === JSON.stringify([184]),
  'exactly one of the 18 is a true semantic polarity flip: item 184',
  'flips = ' + POLARITY_FLIPS.join(','));
say('  NOTE on item 501: the task described it as a polarity flip. It is not. The pre-override');
say('    Chinese “我认为和他人交流相比药物更能化解烦恼。” points the SAME way as the English');
say('    “Talking over problems and worries with someone is often more helpful than taking drugs');
say('    or medicine.” — it is compressed and drops “problems AND worries” / “often” / “drugs or');
say('    medicine”, not reversed. The override was still applied (the English guard passes and the');
say('    new wording is strictly closer to the source), but `note` clause 七 says only item 184 was');
say('    a semantic reversal. Item 501 is reported as a clarity fix.');
{
  // The emitted items must carry the overrides (for indexes inside this form).
  const bad = [];
  for (const r of zhOverrideReport) {
    if (!r.applied || r.i > N_ITEMS) continue;
    const emitted = parsed.items[r.i - 1].text;
    if (emitted !== cleanText(r.after)) bad.push(r.i + ': ' + emitted);
  }
  ok(bad.length === 0, 'every override <= ' + N_ITEMS + ' is present verbatim in the emitted items',
    bad.slice(0, 4).join(' | '));
}
ok(parsed.items[183].text === '我很少做白日梦。', 'item 184 emitted text is the corrected polarity',
  parsed.items[183].text);

say('');
say('### Residual translator-note scan (all ' + TOTAL_ITEMS + ' Chinese items, post-override)');
say('  classes: note = unambiguous translator note (stripped) | legitimate = genuine stimulus');
say('           content (kept) | ambiguous = translator gloss that is not a note (reported, untouched)');
const scanCounts = { note: 0, legitimate: 0, ambiguous: 0 };
const scanItems = { note: [], legitimate: [], ambiguous: [] };
for (const h of zhNoteScan) {
  say('  item ' + String(h.index).padStart(3) + ': ' + h.text);
  for (const f of h.findings) {
    scanCounts[f.cls]++;
    if (!scanItems[f.cls].includes(h.index)) scanItems[f.cls].push(h.index);
    say('           [' + f.cls + '] ' + f.kind + ' ' + f.text + ' — ' + f.why);
  }
  if (h.changed) say('           stripped -> ' + h.stripped);
}
say('  hits: ' + zhNoteScan.length + ' items; findings: note=' + scanCounts.note +
  ' legitimate=' + scanCounts.legitimate + ' ambiguous=' + scanCounts.ambiguous);
say('  note items       (' + scanItems.note.length + '): ' + scanItems.note.join(','));
say('  legitimate items (' + scanItems.legitimate.length + '): ' + scanItems.legitimate.join(','));
say('  ambiguous items  (' + scanItems.ambiguous.length + '): ' + scanItems.ambiguous.join(','));
ok(zhNoteScan.every((h) => h.findings.every((f) => f.cls !== 'note' || h.changed)),
  'every finding classed “note” is actually removed by the stripper');
ok(zhNoteScan.every((h) => h.findings.every((f) =>
    f.cls === 'note' || sqz(h.stripped).includes(sqz(f.text)))),
  'no finding classed “legitimate” or “ambiguous” was altered by the stripper (reported, not touched)');
{
  // After stripping, no unambiguous note may survive anywhere in 1..567.
  const residual = [];
  for (let q = 1; q <= TOTAL_ITEMS; q++) {
    const s = stripZhNotes(String(questions_zh[q]));
    if (/译注[:：]/.test(s) || ZH_NOTE_PAREN_RE.test(s.replace(/不确定性/g, ''))) {
      const paren = [...s.matchAll(/（[^（）]*）|\([^()]*\)/g)].map((m) => m[0]);
      if (paren.some((p) => ZH_NOTE_PAREN_RE.test(p))) residual.push(q + ':' + s);
    }
  }
  ok(residual.length === 0, 'no unambiguous translator note survives stripping in any of the ' +
    TOTAL_ITEMS + ' items', residual.join(' | '));
}
{
  const asciiCjk = [];
  for (let q = 1; q <= TOTAL_ITEMS; q++) {
    const s = stripZhNotes(String(questions_zh[q]));
    if (/\([^()]*[\u3400-\u9fff][^()]*\)/.test(s)) asciiCjk.push(q + ':' + s);
  }
  ok(asciiCjk.length === 0, 'no ASCII parentheses wrapping CJK survive in any of the ' +
    TOTAL_ITEMS + ' items', asciiCjk.join(' | '));
  say('  (pre-override, item 498 was the only ASCII-paren-with-CJK hit; the override removed it)');
}
{
  // The legitimate clause the overrides just introduced must NOT be stripped.
  const keep = [6, 90, 192, 276];
  const bad = keep.filter((q) => !stripZhNotes(String(questions_zh[q])).includes('若'));
  ok(bad.length === 0, 'the (若…已去世…) clauses added by the overrides survive the stripper',
    bad.join(','));
  ok(stripZhNotes(String(questions_zh[114])).includes('如鞋子、手套等'),
    'the “如鞋子、手套等” enumeration in item 114 survives the stripper');
}
say('');

// --- 3. factors ------------------------------------------------------------
say('## 3. Factors');
const fac = parsed.scoring.factors;
say('  factor count: ' + fac.length);
const ids = fac.map((f) => f.id);
const critIds = finalMeta.filter((m) => m.critical).map((m) => m.id);
{
  // The only id allowed to repeat is Mf: Change 4 emits one factor per sex form
  // and the Dart scorer drops the one that does not match the chosen norm group.
  const dups = ids.filter((x, i) => ids.indexOf(x) !== i);
  const mfPair = fac.filter((f) => f.id === 'Mf');
  ok(dups.length === 0 || (JSON.stringify(dups) === JSON.stringify(['Mf']) &&
      mfPair.length === 2 &&
      mfPair.every((f) => f.appliesToGender === 'male' || f.appliesToGender === 'female') &&
      new Set(mfPair.map((f) => f.appliesToGender)).size === 2),
    'all factor ids unique (sole documented exception: the two sex-specific Mf forms)',
    'duplicates: ' + (dups.join(',') || 'none'));
}
ok(ids.includes('K'), 'a factor with id K exists');
const badK = fac.filter((f) => f.kCorrection && !ids.includes(f.kCorrection.factorId));
ok(badK.length === 0, 'every kCorrection.factorId resolves', badK.map((f) => f.id).join(','));
ok(fac.every((f) => Array.isArray(f.bands) &&
    (f.scoreIsRaw ? f.bands.length === 2 : f.bands.length === 4)),
  'every T-scored factor has exactly 4 bands; every scoreIsRaw critical group has exactly 2');
ok(fac.every((f) => f.bands.length >= 1), 'every factor has >= 1 band');
{
  const bad = [];
  for (const f of fac) {
    for (const q of f.itemIndexes) if (!Number.isInteger(q) || q < 1 || q > N_ITEMS) bad.push(f.id + ':T' + q);
    for (const q of (f.falseItemIndexes || [])) if (!Number.isInteger(q) || q < 1 || q > N_ITEMS) bad.push(f.id + ':F' + q);
  }
  ok(bad.length === 0, 'all item indexes within 1..' + N_ITEMS, bad.slice(0, 8).join(' '));
}
{
  const bad = [];
  for (const f of fac) {
    const s = new Set(f.itemIndexes);
    for (const q of (f.falseItemIndexes || [])) if (s.has(q)) bad.push(f.id + ':' + q);
  }
  ok(bad.length === 0, 'no factor has an item in both key lists', bad.join(' '));
}
{
  const bad = [];
  for (const f of fac) {
    const a = f.itemIndexes, b = f.falseItemIndexes || [];
    for (let k = 1; k < a.length; k++) if (a[k] <= a[k - 1]) { bad.push(f.id + ':T'); break; }
    for (let k = 1; k < b.length; k++) if (b[k] <= b[k - 1]) { bad.push(f.id + ':F'); break; }
  }
  ok(bad.length === 0, 'item lists strictly ascending, no internal duplicates', bad.join(' '));
}
ok(fac.every((f) => f.scoreIsRaw || (f.normTable && Array.isArray(f.normTable.male) &&
    Array.isArray(f.normTable.female))),
  'every non-critical factor carries a normTable with male/female arrays');
{
  const bad = [];
  for (const f of fac) {
    if (!f.normTable) continue;
    for (const col of ['male', 'female']) {
      const c = f.normTable[col];
      if (!c.length) continue;
      if (c.every((v) => v === null)) bad.push(f.id + '.' + col);
      for (const v of c) if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) bad.push(f.id + '.' + col + ':type');
      if (c[c.length - 1] === null) bad.push(f.id + '.' + col + ':trailingNull');
    }
  }
  ok(bad.length === 0, 'every non-empty column has >=1 number, all numbers finite, no trailing nulls', bad.join(' '));
}
ok(fac.filter((f) => f.cnNorm).length === cnNormCount - droppedShortCn.length,
  'cnNorm attached to every NORM code that survived (' + (cnNormCount - droppedShortCn.length) +
  ' of ' + cnNormCount + ' factor slots, ' + cnNormCodeCount + ' NORM codes)',
  'count=' + fac.filter((f) => f.cnNorm).length);
say('  factor ids (' + ids.length + '): ' + ids.join(' '));
say('  scoreIsRaw factors      (' + fac.filter((f) => f.scoreIsRaw).length + '): ' +
  fac.filter((f) => f.scoreIsRaw).map((f) => f.id).join(' '));
say('  appliesToGender factors (' + fac.filter((f) => f.appliesToGender).length + '): ' +
  fac.filter((f) => f.appliesToGender).map((f) => f.id + '=' + f.appliesToGender).join(' '));
if (shortN) {
  say('  dropped by --short ' + N_ITEMS + ' (' + droppedShort.length + '): ' + droppedShort.join(' '));
  say('  critical groups dropped by --short ' + N_ITEMS + ' (' + droppedShortCrit.length + '): ' +
    droppedShortCrit.join(' '));
  if (droppedK.length) say('  kCorrection removed because target dropped: ' + droppedK.join(' '));
}
if (d1 && d1._fixNote) say('  data fix: ' + d1._fixNote);
say('');

// --- 4. table fidelity -----------------------------------------------------
say('## 4. Table fidelity spot-checks');
const byId = {};
for (const f of fac) if (!byId[f.id]) byId[f.id] = f;   // first wins: Mf appears twice by design
{
  // The task's spot-check numbers are the SOURCE ARRAY indices of the F male
  // table (tscale[1]=36, tscale[2]=39, tscale[3]=42). Because the reference
  // looks up `tscore = tscale[raw + 1]`, those cells are the T scores for
  // raw 0/1/2, and the emitted column satisfies male[r] === tscale[r+1].
  // Cross-check that the mapping is right: L has 15 items and its table holds
  // 17 cells (raw 0..15), K has 30 items and 32 cells (raw 0..30), Si has 69
  // items and 71 cells (raw 0..69) -> male[r] is the T score for raw r.
  const srcF = scales[0][3];
  ok(srcF[1] === 36 && srcF[2] === 39 && srcF[3] === 42,
    'F source male table indexes 1/2/3 hold 36/39/42',
    srcF[1] + '/' + srcF[2] + '/' + srcF[3]);
  const F = byId.F;
  ok(F.normTable.male[0] === 36, 'F male raw0 -> 36  (= tscale[0+1])', 'got ' + F.normTable.male[0]);
  ok(F.normTable.male[1] === 39, 'F male raw1 -> 39  (= tscale[1+1])', 'got ' + F.normTable.male[1]);
  ok(F.normTable.male[2] === 42, 'F male raw2 -> 42  (= tscale[2+1])', 'got ' + F.normTable.male[2]);
  let mapOK = F.normTable.male.length === srcF.length - 1;
  for (let r = 0; mapOK && r < F.normTable.male.length; r++) {
    const a = F.normTable.male[r], b = srcF[r + 1];
    if ((a === null) !== (b === undefined) || (a !== null && a !== b)) mapOK = false;
  }
  ok(mapOK, 'F male[r] === scales[0][3][r+1] for all r', 'length ' + F.normTable.male.length);
  ok(scales[3][3].length === 17 && scales[4][3].length === 32 && scales[16][3].length === 71,
    'table capacity confirms startRaw=0 (L 15 items/17 cells, K 30/32, Si 69/71)');
}
{
  ok(byId.Hs.kCorrection && byId.Hs.kCorrection.weight === 0.5, 'Hs kCorrection.weight === 0.5',
    'got ' + (byId.Hs.kCorrection && byId.Hs.kCorrection.weight));
  const pdw = byId.Pd.kCorrection && byId.Pd.kCorrection.weight;
  ok(pdw !== undefined && pdw !== null, 'Pd carries a K weight', 'weight = ' + pdw);
  say('  all K-corrected factors: ' + fac.filter((f) => f.kCorrection)
    .map((f) => f.id + '=' + f.kCorrection.weight).join(', '));
  ok(byId.D.kCorrection === undefined, 'D has NO kCorrection');
  ok(byId.K.kCorrection === undefined, 'K itself has NO kCorrection');
}
{
  const L = byId.L;
  ok((L.falseItemIndexes || []).length === 15, 'L falseItemIndexes length === 15', 'got ' + (L.falseItemIndexes || []).length);
  ok(L.itemIndexes.length === 0, 'L itemIndexes empty', 'got ' + L.itemIndexes.length);
}
{
  // Change 4 — Mf is now two factors, each locked to its own sex form.
  const mfPair = fac.filter((f) => f.id === 'Mf');
  const mfM = mfPair.find((f) => f.appliesToGender === 'male');
  const mfF = mfPair.find((f) => f.appliesToGender === 'female');
  ok(mfPair.length === 2, 'exactly two factors carry id Mf', 'got ' + mfPair.length);
  ok(!!mfM && !!mfF, 'one Mf factor is appliesToGender=male and the other =female',
    mfPair.map((f) => f.appliesToGender).join('/'));
  const srcM = scales[MF_MALE][3], srcF = scales[MF_FEMALE][4];
  const colEq = (col, src) => {
    if (col.length !== src.length - 1) return false;
    for (let r = 0; r < col.length; r++) {
      const b = src[r + 1];
      if ((col[r] === null) !== (b === undefined || b === null) || (col[r] !== null && col[r] !== b)) return false;
    }
    return true;
  };
  ok(mfM && colEq(mfM.normTable.male, srcM),
    'Mf(male) male column === scales[10][3] shifted by one',
    mfM ? 'length ' + mfM.normTable.male.length : 'missing');
  ok(mfF && colEq(mfF.normTable.female, srcF),
    'Mf(female) female column === scales[11][4] shifted by one',
    mfF ? 'length ' + mfF.normTable.female.length : 'missing');
  ok(mfM && mfM.normTable.female.length === 0, 'Mf(male) female column is empty []');
  ok(mfF && mfF.normTable.male.length === 0, 'Mf(female) male column is empty []');
  say('  Mf(male)   male length ' + (mfM ? mfM.normTable.male.length : '-') +
    ', female length ' + (mfM ? mfM.normTable.female.length : '-'));
  say('  Mf(female) male length ' + (mfF ? mfF.normTable.male.length : '-') +
    ', female length ' + (mfF ? mfF.normTable.female.length : '-'));
  ok(scales[MF_MALE][4].length === 0 && scales[MF_FEMALE][3].length === 0,
    'Mf counterpart tables are empty in the source (entry10.female, entry11.male)');
  ok(mfM && mfF && mfM.name === '男性化-女性化（男式） (Mf)' && mfF.name === '男性化-女性化（女式） (Mf)',
    'Mf factor names carry the per-sex form label',
    (mfM ? mfM.name : '-') + ' | ' + (mfF ? mfF.name : '-'));
  ok(mfM && mfF && !!mfM.cnNorm && !!mfF.cnNorm &&
      mfM.cnNorm.male.meanT === mfF.cnNorm.male.meanT &&
      mfM.cnNorm.female.meanT === mfF.cnNorm.female.meanT,
    'both Mf factors carry the same cnNorm (the Chinese params are keyed by the test-taker sex)');
  ok(mfM && mfF && !mfM.kCorrection && !mfF.kCorrection,
    'neither Mf factor carries a K correction (scales[10][3][0] and scales[11][4][0] are not weights)');
  // The 4 items where the two keyings disagree.
  say('  Mf keying difference between scales[10] (male form) and scales[11] (female form): ' +
    mfKeyDiff.length + ' items');
  for (const d of mfKeyDiff) {
    say('    item ' + String(d.q).padStart(3) + '  male form=' + d.male.padEnd(5) +
      ' female form=' + d.female.padEnd(5) + '  EN: ' + d.en);
  }
  ok(mfKeyDiff.length === 4, 'the two Mf forms disagree on exactly 4 items',
    'got ' + mfKeyDiff.length + ': ' + mfKeyDiff.map((d) => d.q).join(','));
  ok(mfM && JSON.stringify(mfM.itemIndexes) === JSON.stringify(mfMaleT) &&
     JSON.stringify(mfM.falseItemIndexes || []) === JSON.stringify(mfMaleF),
    'Mf(male) key lists match scales[10] exactly (T=' + mfMaleT.length + ', F=' + mfMaleF.length + ')');
  ok(mfF && JSON.stringify(mfF.itemIndexes) === JSON.stringify(mfFemT) &&
     JSON.stringify(mfF.falseItemIndexes || []) === JSON.stringify(mfFemF),
    'Mf(female) key lists match scales[11] exactly (T=' + mfFemT.length + ', F=' + mfFemF.length + ')');
}
{
  const D = byId.D;
  ok(D.cnNorm.male.meanT === 62.8 && D.cnNorm.male.sdT === 10.0, 'cnNorm D male 62.8 / 10.0',
    D.cnNorm.male.meanT + ' / ' + D.cnNorm.male.sdT);
  ok(D.cnNorm.female.meanT === 63.0 && D.cnNorm.female.sdT === 10.7, 'cnNorm D female 63.0 / 10.7',
    D.cnNorm.female.meanT + ' / ' + D.cnNorm.female.sdT);
}
// Full sweep: every emitted column value against the source table.
{
  const mism = [];
  let cols = 0;
  // finalMeta is parallel to finalFactors, so meta.sourceIndex is per-factor and
  // the generic scales[i][3|4] path now covers both Mf sex forms too.
  for (let k = 0; k < fac.length; k++) {
    const f = fac[k];
    const meta = finalMeta[k];
    if (meta.critical) {
      if (f.normTable) mism.push(f.id + ':critical-has-normTable');
      continue;
    }
    for (const which of ['male', 'female']) {
      const src = scales[meta.sourceIndex][3 + (which === 'male' ? 0 : 1)];
      const col = f.normTable[which];
      cols++;
      if (!Array.isArray(src) || src.length === 0) { if (col.length) mism.push(f.id + '.' + which + ':should-be-empty'); continue; }
      let expLen = src.length - 1;
      while (expLen > 0 && (src[expLen] === undefined || src[expLen] === null)) expLen--;
      if (col.length !== expLen) { mism.push(f.id + '.' + which + ':len ' + col.length + ' vs ' + expLen); continue; }
      for (let r = 0; r < expLen; r++) {
        const a = col[r], b = src[r + 1];
        const bNull = b === undefined || b === null;
        if (bNull ? a !== null : a !== b) mism.push(f.id + '.' + which + '[' + r + '] ' + a + ' vs ' + b);
      }
    }
  }
  ok(mism.length === 0, 'FULL sweep: every normTable cell equals source scales[i][3|4][r+1] (' +
    cols + ' columns, ' + critIds.length + ' critical factors correctly carry none)',
    mism.slice(0, 10).join(' | '));
}
// Key-list sweep
{
  const mism = [];
  for (let k = 0; k < fac.length; k++) {
    const f = fac[k];
    const meta = finalMeta[k];
    const e = scales[meta.sourceIndex];
    let srcT = asc(e[1]), srcF = asc(e[2]);
    if (f.id === 'D1' && d1 && d1._fixNote) continue;   // documented fix
    if (meta.critical && shortN) { srcT = srcT.filter((q) => q <= N_ITEMS); srcF = srcF.filter((q) => q <= N_ITEMS); }
    if (JSON.stringify(srcT) !== JSON.stringify(f.itemIndexes)) mism.push(f.id + ':T');
    if (JSON.stringify(srcF) !== JSON.stringify(f.falseItemIndexes || [])) mism.push(f.id + ':F');
  }
  ok(mism.length === 0, 'FULL sweep: every key list equals the source true/false keys', mism.slice(0, 10).join(' '));
}
// Change 3 — critical-item groups are emitted after every T-scored factor.
{
  const firstCrit = finalMeta.findIndex((m) => m.critical);
  const lastT = finalMeta.map((m, i) => (m.critical ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  ok(critIds.length === criticalGroups.length - droppedShortCrit.length,
    'all ' + criticalGroups.length + ' critical groups are emitted as factors minus the ' +
    droppedShortCrit.length + ' dropped by --short', 'got ' + critIds.length);
  ok(firstCrit === -1 || firstCrit > lastT,
    'every critical-item factor is emitted AFTER every T-scored factor',
    'first critical at ' + firstCrit + ', last T-scored at ' + lastT);
  // scales entries 0..16 are the 6 validity scales, the 10 clinical scales and
  // the two Mf sex forms. The UI's radar takes the first 16 SCORED factors, and
  // the scorer drops the Mf form that does not match the chosen gender, so a
  // scored full-form profile is exactly 6 + 10 = 16 spokes before any subscale.
  const expectedHead = finalMeta.filter((m) => !m.critical && m.sourceIndex <= 16).map((m) => m.id);
  ok(JSON.stringify(ids.slice(0, expectedHead.length)) === JSON.stringify(expectedHead),
    'the head of the factor list is still the validity + clinical profile (both Mf forms in ' +
    'the asset; one is dropped per gender at scoring time)',
    expectedHead.length + ' in the asset: ' + expectedHead.join(' '));
  const PROFILE_CODES = ['F', 'Fb', 'Fp', 'L', 'K', 'S', 'Hs', 'D', 'Hy', 'Pd', 'Mf', 'Pa', 'Pt', 'Sc', 'Ma', 'Si'];
  ok(expectedHead.every((x) => PROFILE_CODES.includes(x)) &&
     expectedHead.filter((x) => x === 'Mf').length === 2 &&
     new Set(expectedHead).size === expectedHead.length - 1,
    'the profile head holds only validity/clinical codes plus the 2 Mf sex forms (' +
    expectedHead.length + ' asset entries -> ' + (expectedHead.length - 1) + ' scored per gender)',
    expectedHead.filter((x) => x === 'Mf').length + ' Mf entries');
  const bad = [];
  for (let k = 0; k < fac.length; k++) {
    const f = fac[k];
    if (!finalMeta[k].critical) continue;
    if (!f.scoreIsRaw) bad.push(f.id + ':no-scoreIsRaw');
    if (f.normTable) bad.push(f.id + ':has-normTable');
    if (f.cnNorm) bad.push(f.id + ':has-cnNorm');
    if (f.kCorrection) bad.push(f.id + ':has-kCorrection');
    if (f.appliesToGender) bad.push(f.id + ':has-appliesToGender');
    if (f.bands.length !== 2) bad.push(f.id + ':bands=' + f.bands.length);
    if (f.bands[0].min !== 0 || f.bands[0].max !== 1) bad.push(f.id + ':band0-range');
    if (f.bands[1].min !== 1 || f.bands[1].max !== undefined) bad.push(f.id + ':band1-range');
    if (f.bands[0].level !== '未提示') bad.push(f.id + ':band0-level');
    const want = ['KB2', 'KB3'].includes(f.id) ? '需立即关注' : '需关注';
    if (f.bands[1].level !== want) bad.push(f.id + ':band1-level=' + f.bands[1].level);
    // No band may claim a diagnosis; every one must say so explicitly.
    for (const b of f.bands) {
      if (!/不构成诊断|不是诊断/.test(b.description)) bad.push(f.id + ':no-diag-disclaimer');
    }
    if (['KB2', 'KB3'].includes(f.id)) {
      const u = f.bands[1].description;
      if (!u.includes('信任的人') || !u.includes('心理咨询师') || !u.includes('心理援助热线') ||
          !u.includes('急诊') || !u.includes('现在就')) {
        bad.push(f.id + ':urgent-copy-incomplete');
      }
    } else if (!f.bands[1].description.includes('心理咨询师或医生')) {
      bad.push(f.id + ':calm-copy-missing-referral');
    }
  }
  ok(bad.length === 0, 'every critical factor: scoreIsRaw, no normTable/cnNorm/kCorrection, ' +
    '2 bands 0..1 + 1.., levels 未提示 / 需关注 (需立即关注 for KB2+KB3), explicit no-diagnosis ' +
    'disclaimer, urgent groups name a trusted person + counsellor + crisis line + emergency now',
    bad.slice(0, 10).join(' '));
  ok(finalMeta.filter((m) => m.critical).length === critIds.length &&
     fac.filter((f) => f.scoreIsRaw).length === critIds.length,
    'scoreIsRaw factor count === critical factor count (' + critIds.length + ')');
  say('  critical groups (' + critIds.length + '): ' + critIds.join(' '));
  for (let k = 0; k < fac.length; k++) {
    if (!finalMeta[k].critical) continue;
    const g = criticalGroups.find((x) => x.code === fac[k].id);
    say('    ' + fac[k].id.padEnd(5) + ' entry ' + String(g.i).padStart(3) + '  T=' +
      String(fac[k].itemIndexes.length).padStart(2) + ' F=' +
      String((fac[k].falseItemIndexes || []).length).padStart(2) + '  maxItem=' +
      String(g.maxItem).padStart(3) + '  ' + fac[k].name + '   [' + g.desc + ']');
  }
  if (droppedShortCrit.length) say('  critical groups dropped by --short: ' + droppedShortCrit.join(' '));
}
say('');

// --- 5. end-to-end scoring parity ------------------------------------------
say('## 5. End-to-end scoring parity (reference my_script.js lines 143-245 vs emitted JSON)');
say('    both sexes x {all-True, all-False, seeded random}; 12 clinical/validity scales + Mf');

const PARITY = ['Hs', 'D', 'Hy', 'Pd', 'Mf', 'Pa', 'Pt', 'Sc', 'Ma', 'Si', 'L', 'F', 'K'];
const PARITY_INDEX = { Hs: 6, D: 7, Hy: 8, Pd: 9, Pa: 12, Pt: 13, Sc: 14, Ma: 15, Si: 16, L: 3, F: 0, K: 4 };
const GENDER_LABEL = ['male', 'female'];

// Reference implementation, transcribed from my_script.js 166-255.
function referenceScore(ans, gender) {
  let k = 0;
  const res = {};
  for (let i = 0; i < scales.length; i++) {
    const e = scales[i];
    if (shortN && e[1].concat(e[2]).some((q) => q > N_ITEMS)) continue;
    const tscale = e[3 + gender];
    if (tscale === undefined) continue;            // critical-item group
    if (!tscale.length) continue;                  // not applicable for this sex
    let rawscore = 0;
    for (let j = 0; j < e[1].length; j++) if (ans[e[1][j]] === 'T') rawscore++;
    for (let j = 0; j < e[2].length; j++) if (ans[e[2][j]] === 'F') rawscore++;
    if (e[0][0] === 'K') k = rawscore;             // captured before use, as in the source
    let kscore = null, tscore;
    if (tscale[0]) {
      kscore = Math.floor(k * tscale[0] + rawscore + 0.5);
      tscore = tscale[kscore + 1];
    } else {
      tscore = tscale[rawscore + 1];
    }
    res[e[0][1] + '#' + i] = { raw: rawscore, kscore, tscore: tscore === undefined ? null : tscore, i };
  }
  return res;
}

// Same math against the emitted JSON. `gender` 0=male 1=female selects the
// column and drops the Mf form that does not apply, exactly like the Dart
// scorer's `factor.appliesTo(gender)` filter. Results are keyed id#sourceIndex
// so they line up with referenceScore.
function jsonScore(vals, gender) {
  const rawByIdx = fac.map((f) => {
    let s = 0;
    for (const q of f.itemIndexes) s += vals[q] || 0;
    for (const q of (f.falseItemIndexes || [])) s += 1 - (vals[q] || 0);
    return s;
  });
  const rawById = {};
  fac.forEach((f, k) => { if (!(f.id in rawById)) rawById[f.id] = rawByIdx[k]; });
  const res = {};
  fac.forEach((f, k) => {
    const key = f.id + '#' + finalMeta[k].sourceIndex;
    const raw = rawByIdx[k];
    if (f.scoreIsRaw) { res[key] = { raw, kscore: null, tscore: raw, dartT: raw, critical: true }; return; }
    if (f.appliesToGender && f.appliesToGender !== GENDER_LABEL[gender]) return;   // dropped by the scorer
    let kscore = null, lookup = raw;
    if (f.kCorrection) {
      lookup = raw + f.kCorrection.weight * (rawById[f.kCorrection.factorId] || 0);
      kscore = Math.floor(lookup + 0.5);
    }
    const idx = kscore === null ? raw : kscore;
    let col = f.normTable[gender === 1 ? 'female' : 'male'];
    if (!col.length) col = f.normTable[gender === 1 ? 'male' : 'female'];   // engine's sex fallback
    const t = (idx >= 0 && idx < col.length && col[idx] !== null) ? col[idx] : null;
    res[key] = { raw, kscore, tscore: t, dartT: dartLookup(col, idx) };
  });
  return res;
}

// Reference VRIN/TRIN, transcribed from my_script.js lines 145-163. Line 163
// reads `rin[i][2 + gender][rawscore]` — indexed DIRECTLY by the raw score, no
// +1 offset (unlike `scales`, lines 238/244, which read `tscale[kscore + 1]`).
function referenceRin(ans, gender) {
  const out = {};
  for (let i = 0; i < rin.length; i++) {
    let raw = rin[i][0][2];
    for (const rp of rin[i][1]) if (ans[rp[0]] === rp[1] && ans[rp[2]] === rp[3]) raw += rp[4];
    const table = rin[i][2 + gender];
    const cell = table[raw];
    out[rin[i][0][0]] = {
      raw,
      cell: cell === undefined ? null : String(cell),
      t: cell === undefined ? null : rinCell(cell).t,
      dir: rinDir(table, raw),
      inTable: raw >= 0 && raw < table.length && cell !== undefined,
    };
  }
  return out;
}
// Same math against the emitted `scoring.consistency`.
function jsonRin(vals, gender) {
  const out = {};
  for (const c of parsed.scoring.consistency) {
    let raw = c.baseScore;
    for (const p of c.pairs) {
      if ((vals[p[0]] || 0) === p[1] && (vals[p[2]] || 0) === p[3]) raw += p[4];
    }
    const col = gender === 1 ? c.normTable.female : c.normTable.male;
    const t = (raw >= 0 && raw < col.length && col[raw] !== null) ? col[raw] : null;
    out[c.id] = { raw, t, dartT: dartLookup(col, raw) };
  }
  return out;
}

// Replicates ScaleNormTable._lookup (clamp at the ends, step outward over holes).
function dartLookup(col, rawIdx) {
  if (!col.length) return null;
  let i = Math.round(rawIdx);
  if (i < 0) { for (const v of col) if (v !== null) return v; return null; }
  if (i >= col.length) { for (let k = col.length - 1; k >= 0; k--) if (col[k] !== null) return col[k]; return null; }
  if (col[i] !== null) return col[i];
  for (let step = 1; step < col.length; step++) {
    if (i + step < col.length && col[i + step] !== null) return col[i + step];
    if (i - step >= 0 && col[i - step] !== null) return col[i - step];
  }
  return null;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20261009;

function makeVectors() {
  const vecs = [];
  const allT = {}, allF = {}, rnd = {};
  const prng = mulberry32(SEED);
  for (let q = 1; q <= N_ITEMS; q++) { allT[q] = 'T'; allF[q] = 'F'; rnd[q] = prng() < 0.5 ? 'T' : 'F'; }
  vecs.push({ label: 'all-True', ans: allT });
  vecs.push({ label: 'all-False', ans: allF });
  vecs.push({ label: 'random (mulberry32 seed ' + SEED + ')', ans: rnd });
  return vecs;
}

const fmt = (x) => (x === null || x === undefined ? 'null' : String(x));
for (const v of makeVectors()) {
  for (const gender of [0, 1]) {
    say('');
    say('### vector: ' + v.label + '  |  sex: ' + GENDER_LABEL[gender]);
    const vals = {};
    for (let q = 1; q <= N_ITEMS; q++) vals[q] = v.ans[q] === 'T' ? 1 : 0;
    const ref = referenceScore(v.ans, gender);
    const got = jsonScore(vals, gender);
    say('  scale  raw(ref) raw(json)  kscore(ref) kscore(json)  T_us_' + GENDER_LABEL[gender] +
      '(ref) T_us(json)  T(dart engine)  match');
    let allMatch = true;
    const rows = [];
    for (const s of PARITY) {
      const i = s === 'Mf' ? (gender === 0 ? MF_MALE : MF_FEMALE) : PARITY_INDEX[s];
      const r = ref[s + '#' + i];
      const g = got[s + '#' + i];
      if (!r) { allMatch = false; say('  ' + s + ' MISSING in reference (dropped?)'); continue; }
      if (!g) { allMatch = false; say('  ' + s + ' MISSING in json (dropped?)'); continue; }
      const m = r.raw === g.raw && r.kscore === g.kscore && r.tscore === g.tscore;
      if (!m) allMatch = false;
      rows.push('  ' + (s + (s === 'Mf' ? (gender === 0 ? '(m)' : '(f)') : '')).padEnd(8) +
        ' ' + String(r.raw).padStart(5) + ' ' + String(g.raw).padStart(9) + '  ' +
        fmt(r.kscore).padStart(11) + ' ' + fmt(g.kscore).padStart(14) + '  ' +
        fmt(r.tscore).padStart(12) + ' ' + fmt(g.tscore).padStart(12) + '  ' +
        fmt(g.dartT).padStart(14) + '   ' + (m ? 'OK' : 'MISMATCH'));
    }
    rows.forEach((l) => say(l));
    ok(allMatch, 'parity: raw + K-corrected score + ' + GENDER_LABEL[gender] +
      ' US T identical for all 13 scales incl. Mf (' + v.label + ')');
    // Mf must come from the sex-appropriate source entry, as my_script.js does
    // with `3 + gender`.
    const mfKey = 'Mf#' + (gender === 0 ? MF_MALE : MF_FEMALE);
    const mfOther = 'Mf#' + (gender === 0 ? MF_FEMALE : MF_MALE);
    ok(!!got[mfKey] && !got[mfOther],
      GENDER_LABEL[gender] + ': the scorer keeps Mf entry ' + (gender === 0 ? MF_MALE : MF_FEMALE) +
      ' and drops the other sex form');
    // Critical groups: the score IS the endorsed-item count.
    if (critIds.length) {
      let critOK = true;
      for (let k = 0; k < fac.length; k++) {
        if (!finalMeta[k].critical) continue;
        const f = fac[k];
        const e = scales[finalMeta[k].sourceIndex];
        let refCount = 0;
        for (const q of e[1]) if (v.ans[q] === 'T') refCount++;
        for (const q of e[2]) if (v.ans[q] === 'F') refCount++;
        const g = got[f.id + '#' + finalMeta[k].sourceIndex];
        if (!g || g.raw !== refCount || g.tscore !== refCount) critOK = false;
      }
      ok(critOK, 'parity: every critical group reports the reference endorsed-item count as its score (' +
        v.label + ' / ' + GENDER_LABEL[gender] + ')');
    }
    // VRIN / TRIN
    if (!shortN) {
      const rr = referenceRin(v.ans, gender);
      const gr = jsonRin(vals, gender);
      say('  rin    raw(ref) raw(json)  T(ref cell)      T(ref num) T(json)  T(dart)  match');
      let rinOK = true;
      for (const code of ['VRIN', 'TRIN']) {
        const r = rr[code], g = gr[code];
        if (!g) { rinOK = false; say('  ' + code + ' MISSING in json'); continue; }
        const m = r.raw === g.raw && (r.inTable ? r.t === g.t : g.t === null);
        if (!m) rinOK = false;
        say('  ' + code.padEnd(6) + ' ' + String(r.raw).padStart(8) + ' ' + String(g.raw).padStart(9) + '  ' +
          fmt(r.cell).padStart(15) + ' ' + fmt(r.t).padStart(10) + ' ' + fmt(g.t).padStart(7) + ' ' +
          fmt(g.dartT).padStart(8) + '   ' + (m ? 'OK' : 'MISMATCH') +
          (r.dir ? '   direction=' + (r.dir === 'T' ? 'True-biased' : 'False-biased') : '') +
          (r.inTable ? '' : '   (raw beyond the published table: reference prints 超线或空洞; the Dart engine clamps to ' + fmt(g.dartT) + ')'));
      }
      ok(rinOK, 'parity: VRIN + TRIN raw and ' + GENDER_LABEL[gender] +
        ' T identical to my_script.js lines 145-163 (' + v.label + ')');
    }
  }
}
say('');
say('  Mf is now IN the parity table: each sex reads its own source entry (10 for male,');
say('  11 for female) exactly as my_script.js does with `tscale = scales[i][3 + gender]`,');
say('  and the emitted asset expresses that with two factors + appliesToGender.');
if (shortN) {
  say('  VRIN/TRIN are not emitted for the short form (see section 5b), so no *RIN parity rows.');
}

// --- 5b. consistency indicator structure -----------------------------------
say('');
say('## 5b. Change 2 — VRIN / TRIN consistency indicators');
{
  const cons = parsed.scoring.consistency;
  ok(Array.isArray(cons), 'scoring.consistency is an array');
  ok(cons.length === (shortN ? 0 : rin.length),
    'scoring.consistency length === ' + (shortN ? '0 (short form: not computable)' : rin.length),
    'got ' + cons.length);
  ok(rin.length === 2 && rin[0][0][0] === 'VRIN' && rin[1][0][0] === 'TRIN',
    'the source `rin` holds exactly VRIN then TRIN', rin.map((r) => r[0][0]).join(','));
  say('  rin source shape: rin[i] = [[name, description, baseScore], pairs, maleTable, femaleTable]');
  for (let r = 0; r < rin.length; r++) {
    say('    rin[' + r + '][0] = ' + JSON.stringify(rin[r][0]) + ', pairs = ' + rin[r][1].length +
      ', male table = ' + rin[r][2].length + ' cells, female table = ' + rin[r][3].length + ' cells');
  }
  say('  my_script.js line 163 reads `rin[i][2 + gender][rawscore]` — NO +1 offset, unlike');
  say('  `scales` at lines 238/244 which read `tscale[kscore + 1]` / `tscale[rawscore + 1]`.');
  say('  Verified against lines 145-163 before encoding: consistency column[r] === rin[i][2|r][r].');
  for (let r = 0; r < rin.length; r++) {
    const e = rin[r];
    const code = e[0][0];
    const c = cons.find((x) => x.id === code);
    if (!c) { say('    ' + code + ': not emitted (' + (shortN ? 'short form' : 'MISSING') + ')'); continue; }
    ok(c.name === RIN_NAMES[code], code + ' name === ' + RIN_NAMES[code], c.name);
    ok(c.baseScore === e[0][2], code + ' baseScore === ' + e[0][2], 'got ' + c.baseScore);
    ok(c.pairs.length === e[1].length, code + ' pairs === ' + e[1].length, 'got ' + c.pairs.length);
    const convOK = c.pairs.every((p, k) => p.length === 5 &&
      p[0] === e[1][k][0] && p[1] === TF_TO_VALUE[e[1][k][1]] &&
      p[2] === e[1][k][2] && p[3] === TF_TO_VALUE[e[1][k][3]] && p[4] === e[1][k][4]);
    ok(convOK, code + ': every pair is [itemA, valueA, itemB, valueB, points] with T->1 / F->0');
    ok(c.pairs.every((p) => p[1] === 0 || p[1] === 1) && c.pairs.every((p) => p[3] === 0 || p[3] === 1),
      code + ': every valueA/valueB is an option point value (1 = 是/True, 0 = 否/False)');
    ok(c.pairs.every((p) => Number.isFinite(p[4])), code + ': points kept as-is (negative allowed for TRIN)');
    say('    ' + code + ' points seen: ' + Array.from(new Set(c.pairs.map((p) => p[4]))).sort((a, b) => a - b).join(','));
    for (const which of ['male', 'female']) {
      const src = which === 'male' ? e[2] : e[3];
      const col = c.normTable[which];
      let expLen = src.length;
      while (expLen > 0 && (src[expLen - 1] === undefined || src[expLen - 1] === null)) expLen--;
      let bad = col.length !== expLen;
      for (let x = 0; !bad && x < expLen; x++) {
        const want = rinCell(src[x]).t;
        if (col[x] !== want) bad = true;
      }
      ok(!bad, code + ' normTable.' + which + '[r] === rin[' + r + '][' + (which === 'male' ? 2 : 3) +
        '][r] for all r (no shift)', 'length ' + col.length);
      ok(col.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x))),
        code + ' normTable.' + which + ' holds only finite numbers or null');
    }
    ok(c.normTable.startRaw === 0, code + ' normTable.startRaw === 0');
    ok(c.bands.length === (code === 'VRIN' ? 2 : 3), code + ' has ' + c.bands.length + ' bands');
    ok(c.bands[c.bands.length - 1].max === undefined, code + ': the last band omits max (open-ended)');
    ok(c.bands.every((b) => b.description.includes('不构成诊断') || b.description.includes('不是诊断')),
      code + ': every band description disclaims diagnosis');
    ok(c.bands.every((b) => /重做|重新|作答方式|不是对你/.test(b.description)),
      code + ': every band points at re-taking the protocol rather than labelling the person');
    say('    ' + code + ' bands: ' + c.bands.map((b) => b.min + '..' + (b.max === undefined ? 'inf' : b.max) +
      ' = ' + b.level).join(' | '));
    // Direction of the TRIN cells, for the record.
    if (code === 'TRIN') {
      say('    TRIN source cells carry a direction suffix that a numeric normTable cannot hold:');
      for (const which of ['male', 'female']) {
        const src = which === 'male' ? e[2] : e[3];
        say('      ' + which.padEnd(6) + ' raw 0..' + (src.length - 1) + ': ' + src.join(' '));
      }
      say('      -> only the digits are emitted; the Dart engine reads cells with jsonDouble(), and');
      say('         double.tryParse(“114F”) would fall back to 0. Direction is recoverable from the');
      say('         raw score (below base 9 = False-biased, above = True-biased) and is stated in the');
      say('         TRIN band copy. This is the one place where the emitted asset is lossier than the');
      say('         reference display string, and it is why the TRIN bands cannot be split by direction.');
    }
  }
  // Short form: the pairs cannot be answered, and the note must say so.
  if (shortN) {
    ok(rinMaxItem.every((m) => m > N_ITEMS),
      'VRIN/TRIN pairs need items beyond ' + N_ITEMS + ' (max item per indicator: ' +
      rinMaxItem.join('/') + '), so the short form cannot compute them');
    ok(parsed.note.includes('VRIN／TRIN') && /短卷|不可计算|只在完整卷/.test(parsed.note),
      'the short-form note states VRIN/TRIN are not computable from the short form');
  } else {
    ok(rinMaxItem.every((m) => m <= N_ITEMS),
      'every VRIN/TRIN pair item is within 1..' + N_ITEMS + ' (max ' + rinMaxItem.join('/') + ')');
    ok(/VRIN|TRIN/.test(parsed.note) && parsed.note.includes('已实现'),
      'the full-form note states VRIN/TRIN are implemented and gives the reading threshold used');
  }
  // Bands source: what the repo itself says.
  say('');
  say('  Band cutoff provenance — what the reference repo states:');
  say('    my_script.js  : no cutoff of its own. Line 160-163 only gates on rinComplete() and');
  say('                    prints 超线或空洞 when the raw falls outside the published table;');
  say('                    it never turns a *RIN value into a verdict.');
  say('    index.html    : no VRIN/TRIN text at all (grep: 0 hits).');
  say('    docs/数据核对-2026-09-22.md L37/L39: cites Cheung et al. (1996) p.142 — the Chinese');
  say('                    research screening cutoffs are VRIN raw > 13, TRIN raw < 6 or > 13 —');
  say('                    and states 原始分界限仅作为文献背景，并未用于页面筛查 (raw-score limits are');
  say('                    literature background only, not used to screen the page).');
  say('    docs/探讨纪要.md L733: notes that the University of Minnesota / Pearson training material');
  say('                    gives per-scale bands and “效度材料也给出 VRIN、TRIN 等规则”, but quotes no numbers.');
  say('  -> The repo therefore states RAW-score literature cutoffs it explicitly declines to apply,');
  say('     and no T-score banding of its own. Bands run on the SCORE, which for a consistency');
  say('     indicator is the looked-up T (ScaleScorer._scoreConsistency: score = t ?? raw), so the');
  say('     raw cutoffs cannot be expressed as bands directly. Decision: use the standard MMPI-2');
  say('     T reading (VRIN T>=80 inconsistent; TRIN T>=80 inconsistent, T<=65 acceptable), and');
  say('     quote the Cheung raw cutoffs inside the band descriptions so both are on the record.');
  say('     VRIN T>=80 corresponds to raw>=13 (male T 80, female T 82); Cheung raw>13 is male T>=84,');
  say('     female T>=86 — the two readings agree to within one raw point.');
}

// --- 6. critical groups ----------------------------------------------------
say('');
say('## 6. Critical-item groups (source entries whose male AND female T tables are both undefined)');
ok(criticalIndexes.length === 17, 'exactly 17 critical-item groups in the source', 'got ' + criticalIndexes.length);
ok(criticalIndexes[0] === FIRST_CRITICAL && criticalIndexes[criticalIndexes.length - 1] === scales.length - 1,
  'they are exactly source entries ' + FIRST_CRITICAL + '..' + (scales.length - 1) +
  ' (FIRST_CRITICAL cross-check)', criticalIndexes.join(','));
for (const g of criticalGroups) {
  const used = ACUTE_CODES.includes(g.code);
  const emitted = critIds.includes(g.code);
  say('  ' + g.code.padEnd(5) + ' entry ' + String(g.i).padStart(3) + '  T=' + String(g.trueKeys.length).padStart(2) +
    ' F=' + String(g.falseKeys.length).padStart(2) + '  maxItem=' + String(g.maxItem).padStart(3) + '  ' +
    (emitted ? '[emitted]' : '[DROPPED ]') + ' ' + (used ? '[USED for crisis]' : '[not used]      ') +
    '  ' + CRIT_CN[g.code] + '  <- ' + g.desc);
}
say('');
say('  crisis groups used: ' + acuteGroups.map((g) => g.code + ' (' + g.desc + ')').join('; '));
say('  crisis.itemIndexes (' + crisisItems.length + '): ' + crisisItems.join(','));
if (shortN && crisisItemsFull.length !== crisisItems.length) {
  say('  (full-form crisis items ' + crisisItemsFull.length + ': ' + crisisItemsFull.join(',') +
    '; those > ' + N_ITEMS + ' were dropped for the short form)');
}
say('  KB2 False-keyed items excluded on purpose: 9, 75, 95, 388 (protective statements;');
say('  the engine flags value >= threshold, i.e. an answered Yes, which would invert them).');
say('  crisis.threshold = ' + parsed.crisis.threshold);
ok(JSON.stringify(parsed.crisis.itemIndexes) === JSON.stringify(crisisItems) &&
   parsed.crisis.threshold === 1 && parsed.crisis.message === CRISIS_MESSAGE,
  'the crisis block is unchanged: KB2 True-keyed items, threshold 1, same message');
if (shortN) {
  say('  KB2 itself is dropped as a factor on the short form (its items reach ' +
    criticalGroups.find((g) => g.code === 'KB2').maxItem + '), but the crisis block is derived');
  say('  from the KB2 key list independently and is kept, filtered to items <= ' + N_ITEMS + '.');
}
say('');

// --- 7. note + license -----------------------------------------------------
say('## 7. Change 5 — note and license');
say('  note: ' + parsed.note);
{
  const n = parsed.note;
  const must = [
    ['非官方译文', /自行整理的中文译文/],
    ['1990 年代常模', /中国常模建立于 1990 年代/],
    ['双参数近似换算', /T_中国 = 50 \+ \(T_美国 − M_T\) × 10 \/ S_T/],
    ['仅供参考不作诊断', /不能作为诊断依据/],
    ['VRIN/TRIN 状态', /VRIN／TRIN/],
    ['关键题以肯定回答题目数报告', /以「肯定回答的题目数」报告，不是 T 分，也不构成诊断/],
    ['Mf 按性别分表', /Mf 按性别使用各自的题键与常模表/],
    ['D1 第 223 题勘误', /D1 量表把第 223 题同时列入正反两个方向/],
    ['18 处中文订正', /对 18 处中文译文做了订正/],
    ['第 184 题语义反转', /第 184 题原为语义反转/],
    ['清除译者按语', /清除了残留的译者按语/],
  ];
  // The threshold rationale only exists on the form that actually computes them.
  if (!shortN) must.splice(5, 0, ['VRIN/TRIN 阈值与理由', /T≥80/]);
  for (const [label, re] of must) ok(re.test(n), 'note states: ' + label);
  ok(shortN
    ? /只在完整卷|不提供该指标|不可计算/.test(n)
    : /已实现（仅完整卷；短卷不可计算）/.test(n),
    'note states the VRIN/TRIN availability for THIS form (' + (shortN ? 'short' : 'full') + ')');
  ok(!n.includes('"'), 'note contains no ASCII double quote');
  ok(/第 184 题原为语义反转/.test(n) && !/第 501 题原为语义反转/.test(n) &&
     /第 501 题原译方向正确但表述含混/.test(n),
    'note attributes the semantic reversal to item 184 only, and records item 501 as a clarity fix');
}
ok(parsed.license === LICENSE, 'license text emitted verbatim');
{
  const lic = parsed.license;
  const need = ['Kevin Timmerman', 'GPLv3', 'MMPI-CHN', 'University of Minnesota Press', 'Pearson',
    'Cheung, Song & Zhang (1996)', 'International Adaptations of the MMPI-2'];
  const miss = need.filter((s) => !lic.includes(s));
  ok(miss.length === 0, 'license keeps every attribution clause intact', miss.join(','));
  ok(!lic.includes('"'), 'license contains no ASCII double quote');
  say('  license: ' + lic);
}
say('');

// --- extras ----------------------------------------------------------------
say('## Extra observations');
{
  const en = [];
  for (let q = 1; q <= N_ITEMS; q++) if (questions[q].includes('"')) en.push(q);
  say('  items whose English source contained an ASCII double quote (now typographic): ' + en.join(','));
}
say('  item 184 was semantically OPPOSITE in the upstream translation and is now corrected:');
say('    zh (emitted) : ' + parsed.items[183].text);
say('    zh (source)  : ' + zhOverrideReport.find((r) => r.i === 184).before);
say('    en           : ' + questions[184]);
say('    -> the scoring keys follow the English, so the old wording inverted the item direction;');
say('       fixed by ZH_OVERRIDES[184] and recorded in `note` clause 七.');
say('  item 501 was described in the task as a second polarity flip. It is not: the old Chinese');
say('    pointed the same way as the English. It was rewritten for fidelity/completeness only.');
say('  ERRATA published by MMPI-CHN is already merged into my_data.js; spot-checked 9 cells: all OK.');
say('');
say('## RESULT');
say(failures === 0 ? '  ALL CHECKS PASSED (' + R.filter((l) => l.includes('[PASS]')).length + ' assertions)'
  : '  ' + failures + ' CHECK(S) FAILED');

fs.writeFileSync(reportPath, R.join('\n') + '\n', 'utf8');
console.log('wrote ' + outPath + ' (' + sizeKB.toFixed(2) + ' KB)');
console.log('factors: ' + fac.length + ' (scoreIsRaw ' + fac.filter((f) => f.scoreIsRaw).length +
  ', appliesToGender ' + fac.filter((f) => f.appliesToGender).length +
  '), items: ' + it.length + ', consistency: ' + parsed.scoring.consistency.length +
  ', crisis items: ' + crisisItems.length);
console.log('assertions: ' + R.filter((l) => l.includes('[PASS]')).length + ' passed, ' + failures + ' failed');
console.log('report: ' + reportPath);
process.exitCode = failures === 0 ? 0 : 1;
