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
};

const versions = {
  'course-parser': 2,
  'score-parser': 3,
  'study-status-course-parser': 2,
  'study-status-index-parser': 2,
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
  const existingVersions = Object.fromEntries((existing.scripts || []).map((item) => [item.name, item.version]));
  const files = (await readdir(scriptsDir)).filter((name) => name.endsWith('.js')).sort();
  for (const file of files) if (!tests[file.slice(0, -3)]) throw new Error(`Missing test vector for ${file}`);
  const scripts = await Promise.all(files.map(async (file) => {
    const name = file.slice(0, -3);
    const bytes = await readFile(path.join(scriptsDir, file));
    return {
      name, label: labels[name] || name, version: versions[name] || existingVersions[name] || 1,
      url: `/hot-update/scripts/${file}`,
      checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
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
