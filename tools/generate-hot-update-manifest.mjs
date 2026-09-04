import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const scriptsDir = path.join(root, 'public', 'hot-update', 'scripts');
const manifestPath = path.join(root, 'public', 'hot-update', 'manifest.json');
const envPath = path.join(root, '.env.hot-update');
const verifierPath = path.resolve(root, '..', 'app', 'lib', 'features', 'hot_update', 'data', 'hot_update_manifest_verifier.dart');
const keyId = 'luotopia-hot-update-2026-01';

const tests = {
  'course-parser': { input: { kbList: [{ kcmc: '高等数学', xqj: '1', jcs: '1-2', zcd: '1-2周', jxbmc: '001', cdmc: '教室A', xm: '张三', kcxz: '必修', xf: '4.0', kssj: '08:00', jssj: '09:35' }] }, expect: { courses: [{ title: '高等数学', weekday: 1, classFrom: 1, classTo: 2 }] } },
  'score-parser': { input: { items: [{ xnm: '2024', xqm: '3', kcmc: '高等数学', jsxmmc: '张三', jxbmc: '001', xf: '4.0', kcxzmc: '必修', bfzcj: '92', kkbmmc: '数学学院', cjbz: '', ksxz: '正常考试' }] }, expect: { scores: [{ year: 2024, semester: 1, name: '高等数学', score: 92 }] } },
  'study-status-course-parser': { input: { items: [{ KCMC: '高等数学', KCXZMC: '必修', XF: '4.0', CJ: '92', JD: '4.0', MAXCJ: '92', XDZT: '4', KCLBMC: '基础课' }] }, expect: { courses: [{ name: '高等数学', credit: 4, score: 92, status: 'passed' }] } },
  'study-status-index-parser': { input: { html: "<p class='title1' id='pABC123DEF456ABC123DEF456ABC123DE'>必修课程&nbsp;</p>" }, expect: { names: { ABC123DEF456ABC123DEF456ABC123DE: '必修课程' } } },
  'school-net-parser': { input: { operation: 'landing', html: '<button id="suspend">暂停</button>' }, expect: { operation: 'landing', status: 'active' } },
  'datarepo-parser': { input: { body: '<p>学号：</p><p>2021001234</p><p>学生姓名：</p><p>张三</p>' }, expect: { studentId: '2021001234', name: '张三' } },
  'empty-room-parser': { input: { data: [{ cdmc: '教室101', jxl: '理科楼', zws: '60', kszws: '45', jc: '1,2', lh: '1' }] }, expect: { rooms: [{ name: '教室101', totalSeats: 60 }] } },
  'messages-parser': { input: { resultData: { total: 1, rows: [{ msgId: 'test123', msgtitle: 'Test', senderName: 'Admin', sendTime: '2026-01-01', receiptStatus: '0' }] } }, expect: { messages: [{ msgId: 'test123', title: 'Test', isRead: false }], totalCount: 1 } },
  'transcript-score-parser': { input: { lines: ['武汉大学学生成绩单', '2024学年1学期', '高等数学', '必修', '正常考试', '4.0', '92'] }, expect: { scores: [{ year: 2024, semester: 1, name: '高等数学', credit: 4, score: 92 }] } },
  'wakeup-parser': { input: { format: 'csv', content: '课程名称,星期,开始节数,结束节数,教师,地点,周次\n高等数学,1,1,2,张三,教室A,1-16', fileName: 'test.csv' }, expect: { name: 'test', items: [{ name: '高等数学', day: 1, startNode: 1, endNode: 2 }] } },
  'third-party-timetable-parser': { input: { source: 'shiguang', data: { name: '测试课表', courses: [{ name: '高等数学', day: 1, startSection: 1, endSection: 2, startTime: '08:00', endTime: '09:35' }] } }, expect: { normalized: true, name: '测试课表', courses: [{ name: '高等数学', day: 1 }] } },
  'sports-reservation-parser': { input: { decoded: { Success: true, Code: 0, Data: { Items: [] } } }, expect: { normalized: { success: true, status: 0 } } },
  'campus-bus-parser': { input: { kind: 'vehicles', vehicles: ['1|x|2|1|114.3|30.5'] }, expect: { schemaVersion: 1, kind: 'vehicles', vehicles: [{ num: '1', stationIndex: 2, arrive: true }] } },
  'ai-structured-output-parser': { input: { kind: 'extract', text: '```json\n{"intent":"create"}\n```' }, expect: { schemaVersion: 1 } },
  'whu-email-envelope-parser': { input: { body: { code: 200, data: { unreadCount: 3 } } }, expect: { schemaVersion: 1, success: true, unreadCount: 3 } },
  'medical-report-list-parser': { input: { kind: 'page', html: '<div id="lisId"><div class="f14 mt10"><p>血常规</p><a onclick="lisReportDetail(\'adm&sign=s\',\'item\',\'lab\')"><p>2026-01-01</p><div class="weui-cell__ft">报告已出</div></a></div></div><div id="risId"></div><script>var lisLoadEnd=!!(\'\');var risLoadEnd=!!(\'1\');</script>' }, expect: { schemaVersion: 1, laboratoryReports: [{ title: '血常规', status: '报告已出', detail: { path: 'lisreportdetail' } }], examinationIsLast: true } },
  'medical-lab-detail-parser': { input: { html: '<table><tr><td>项目名称</td><td>缩写</td><td>结果</td><td>单位</td><td>异常</td><td>参考范围</td></tr><tr><td>白细胞</td><td>WBC</td><td>6.66</td><td>10^9/L</td><td></td><td>3.5-9.5</td></tr></table>' }, expect: { schemaVersion: 1, results: [{ itemName: '白细胞', result: '6.66', referenceRange: '3.5-9.5' }] } },
  'medical-exam-detail-parser': { input: { html: '<p class="font6 f18">胸部检查</p><div class="p10 bgw borderBottom"><p>放射科</p><p>发布时间: 2026-01-01</p></div><p class="font333 opacity90">检查所见:</p><p>未见异常</p>' }, expect: { schemaVersion: 1, title: '胸部检查', fields: { '检查科室': '放射科' }, sections: [{ title: '检查所见', content: '未见异常' }] } },
  'medical-patient-card-parser': { input: { html: '<div class="cardlist"><p>姓名<span class="font333">张三</span></p><p>常用卡<span class="font333">001</span></p><p>卡类型<span class="font333">普通卡</span></p><input name="cardlist" value="enc123" checked></div>' }, expect: { schemaVersion: 1, cards: [{ patientName: '张三', cardDisplay: '001', cardType: '普通卡', encryptedId: 'enc123', isDefault: true }] } },
  'medical-choose-card-parser': { input: { html: '<div onclick="chooseCard(\'张三\',\'\',\'\',\'enc456\',\'002\')"><div class="weui-cell"><div class="weui-cell__bd">卡类型</div><span class="font333">普通卡</span></div></div><div class="weui-cell bgdefault"></div>' }, expect: { schemaVersion: 1, cards: [{ patientName: '张三', cardDisplay: '002', cardType: '普通卡', encryptedId: 'enc456' }] } },
  'medical-card-detail-parser': { input: { html: '<div class="carddetail"><div class="weui-cell"><div class="weui-cell__bd">真实姓名</div><div class="weui-cell__ft">张三</div></div><div class="weui-cell"><div class="weui-cell__bd">身份证号</div><div class="weui-cell__ft">420100199001010001</div></div></div><script>deleteCard("enc789")</script>' }, expect: { schemaVersion: 1, fields: { '真实姓名': '张三' }, encryptedId: 'enc789' } },
  'medical-invoice-detail-parser': { input: { html: '<p id="prtId">PRT001</p><div class="weui-cell bgw" style="display:block"><div class="weui-cell__bd">就诊人: 张三</div><div class="weui-cell__bd">登记号: REG001</div></div><li id="cat1"><div class="bgtitleyellow">西药 <span class="font-yellow">10.00</span></div></li><div class="postFix"><div class="weui-cell__bd">总计 <span class="font-yellow">10.00</span></div></div>' }, expect: { schemaVersion: 1, patientName: '张三', registrationNumber: 'REG001', totalAmount: '10.00', prtId: 'PRT001', categories: [{ id: 'cat1', title: '西药', amount: '10.00' }] } },
  'medical-invoice-item-parser': { input: { html: '<table><tr><td>阿莫西林胶囊[10*5]<p>数量: 10</p></td><td></td><td></td><td>2.00</td><td>20.00</td></tr></table>' }, expect: { schemaVersion: 1, items: [{ name: '阿莫西林胶囊', spec: '[10*5]', quantity: '10', amount: '20.00', packageCount: 2 }] } },
  'medical-registration-record-parser': { input: { html: '<a class="lcount" href="/detail/123"><div class="weui-cell_access"><p class="weui-cell__bd">张医生</p><div class="weui-cell__ft">已就诊</div></div><div class="pl20"><p class="font333 opacity90"><span>内科</span><span>普通号</span></p><p class="mt10"><span>2026-01-01</span><span>上午</span></p><p class="fontmoney">￥10.00</p></div></a>' }, expect: { schemaVersion: 1, records: [{ doctorName: '张医生', status: '已就诊', departmentName: '内科', registrationType: '普通号', visitDate: '2026-01-01', session: '上午', fee: '10.00', href: '/detail/123' }] } },
  'medical-registration-detail-parser': { input: { html: '<li class="weui-flex"><p class="justifynow">科室</p><span class="font333">内科</span></li><p>挂号费用<span class="f18">10.00</span></p>' }, expect: { schemaVersion: 1, fields: { '科室': '内科' }, fee: '10.00' } },
  'medical-paid-invoice-parser': { input: { html: '<div class="f14 mt10 bgw" id="inv1"><div class="pl20"><p class="mt5">发票号<span>INV001</span></p><p class="mt5">收费时间<span>2026-01-01</span></p><p class="mt5">就诊科室<span>内科</span></p><p class="mt5">就诊时间<span>2026-01-01</span></p></div><a href="/payment/opbilledinvdetail?id=1">详情</a><p class="fontmoney">￥10.00</p></div>' }, expect: { schemaVersion: 1, invoices: [{ invoiceNumber: 'INV001', chargedAt: '2026-01-01', departmentName: '内科', visitedAt: '2026-01-01', amount: '10.00', href: '/payment/opbilledinvdetail?id=1' }] } },
  'medical-unpaid-invoice-parser': { input: { html: '<div class="weui-cell bgw"><p>就诊科室：<span>内科</span></p><p>就诊时间：<span>2026-01-01</span></p><p class="fontmoney">￥10.00</p><a href="/payment/opbilldetail?id=1">待缴费</a></div>' }, expect: { schemaVersion: 1, invoices: [{ departmentName: '内科', visitedAt: '2026-01-01', amount: '10.00', href: '/payment/opbilldetail?id=1', isPaid: false }] } },
};

const labels = {
  'course-parser': '课程表解析器', 'score-parser': '成绩解析器',
  'study-status-course-parser': '学习状态-课程解析器', 'study-status-index-parser': '学习状态-首页解析器',
  'school-net-parser': '校园网解析器', 'datarepo-parser': '学生信息解析器',
  'empty-room-parser': '空教室解析器', 'messages-parser': '消息解析器',
  'transcript-score-parser': '成绩单解析器', 'wakeup-parser': 'WakeUp 课程表解析器',
  'third-party-timetable-parser': '第三方课程表解析器', 'sports-reservation-parser': '体育场馆预约解析器',
  'campus-bus-parser': '校园巴士解析器', 'ai-structured-output-parser': 'AI 结构化输出解析器',
  'whu-email-envelope-parser': '武大邮箱响应解析器',
  'medical-report-list-parser': '校医院报告列表解析器', 'medical-lab-detail-parser': '校医院检验详情解析器', 'medical-exam-detail-parser': '校医院检查详情解析器',
  'medical-patient-card-parser': '校医院就诊卡解析器', 'medical-choose-card-parser': '校医院选卡解析器', 'medical-card-detail-parser': '校医院卡详情解析器',
  'medical-invoice-detail-parser': '校医院发票详情解析器', 'medical-invoice-item-parser': '校医院发票明细解析器', 'medical-registration-record-parser': '校医院挂号记录解析器',
  'medical-registration-detail-parser': '校医院挂号详情解析器', 'medical-paid-invoice-parser': '校医院已缴费发票解析器', 'medical-unpaid-invoice-parser': '校医院未缴费账单解析器',
};

const versions = {
  'course-parser': 4,
  'score-parser': 4,
  'study-status-course-parser': 2,
  'study-status-index-parser': 2,
  'school-net-parser': 2,
  'transcript-score-parser': 5,
  'medical-report-list-parser': 2,
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function loadPrivateKey() {
  let encoded = process.env.HOT_UPDATE_ED25519_PRIVATE_KEY?.trim();
  if (!encoded) {
    try {
      const env = await readFile(envPath, 'utf8');
      encoded = env.match(/^HOT_UPDATE_ED25519_PRIVATE_KEY=(.+)$/m)?.[1]?.trim();
    } catch {}
  }
  if (!encoded) throw new Error('Missing HOT_UPDATE_ED25519_PRIVATE_KEY; run npm run hot-update:init-key');
  return createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8' });
}

async function initKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateBase64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const publicRaw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64');
  await writeFile(envPath, `HOT_UPDATE_ED25519_PRIVATE_KEY=${privateBase64}\n`, { flag: 'wx' });
  const dart = await readFile(verifierPath, 'utf8');
  await writeFile(verifierPath, dart.replace(/static const publicKeyBase64 =\s*'[^']*';/, `static const publicKeyBase64 =\n      '${publicRaw}';`));
  console.log(`Generated ${envPath} and installed public key ${publicRaw}`);
}

async function generate() {
  const privateKey = await loadPrivateKey();
  const existing = JSON.parse(await readFile(manifestPath, 'utf8'));
  const existingScripts = Object.fromEntries((existing.scripts || []).map((item) => [item.name, item]));
  const files = (await readdir(scriptsDir)).filter((name) => name.endsWith('.js')).sort();
  for (const file of files) if (!tests[file.slice(0, -3)]) throw new Error(`Missing test vector for ${file}`);
  const scripts = await Promise.all(files.map(async (file) => {
    const name = file.slice(0, -3);
    const bytes = await readFile(path.join(scriptsDir, file));
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    // Bump the script version whenever its content (checksum) changed, so
    // clients re-download it. The `versions` map acts as a manual minimum.
    const prev = existingScripts[name];
    const changed = !prev || prev.checksum !== checksum;
    const version = Math.max(versions[name] || 0, (prev?.version || 0) + (changed ? 1 : 0), 1);
    return {
      name, label: labels[name] || name, version,
      url: `/hot-update/scripts/${file}`,
      checksum,
      minAppVersion: '1.0.0', apiVersion: 1,
      testInput: tests[name].input, testExpect: tests[name].expect,
    };
  }));
  const now = new Date();
  const changed = existing.schemaVersion !== 1 ||
    existing.keyId !== keyId ||
    canonical(existing.scripts || []) !== canonical(scripts);
  const payload = {
    schemaVersion: 1,
    version: changed ? Math.max(existing.version || 0, 6) + 1 : Math.max(existing.version || 0, 7),
    updatedAt: changed ? now.toISOString() : existing.updatedAt,
    expiresAt: changed ? new Date(now.getTime() + 180 * 86400000).toISOString() : existing.expiresAt,
    keyId,
    scripts,
  };
  const signature = sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64');
  await writeFile(manifestPath, `${JSON.stringify({ ...payload, signature }, null, 2)}\n`);
  console.log(`Generated signed manifest with ${scripts.length} scripts`);
}

async function verifyManifest() {
  const privateKey = await loadPrivateKey();
  const publicKey = createPublicKey(privateKey);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const signature = Buffer.from(manifest.signature || '', 'base64');
  delete manifest.signature;
  if (!verify(null, Buffer.from(canonical(manifest)), publicKey, signature)) throw new Error('Manifest signature verification failed');
  for (const script of manifest.scripts || []) {
    try {
      const source = await readFile(path.join(scriptsDir, `${script.name}.js`), 'utf8');
      const context = vm.createContext({ JSON, Math, Number, String, Object, Array, RegExp, parseInt, parseFloat, isFinite, isNaN });
      new vm.Script(source).runInContext(context, { timeout: 1000 });
      const outputText = new vm.Script(`parse(${JSON.stringify(JSON.stringify(script.testInput))})`).runInContext(context, { timeout: 1000 });
      const output = JSON.parse(outputText);
      if (!matchesExpected(output, script.testExpect)) throw new Error('output mismatch');
    } catch (error) {
      throw new Error(`Test vector failed for ${script.name}: ${error.message}`);
    }
  }
  console.log(`Manifest signature and ${manifest.scripts.length} script tests verified`);
}

function matchesExpected(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length >= expected.length && expected.every((value, index) => matchesExpected(actual[index], value));
  if (expected && typeof expected === 'object') return actual && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && matchesExpected(actual[key], value));
  return Object.is(actual, expected);
}

if (process.argv.includes('--init-key')) await initKey();
else if (process.argv.includes('--verify')) await verifyManifest();
else await generate();
