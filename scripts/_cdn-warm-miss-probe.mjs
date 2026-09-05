// warm 窗口 404 静默探针(2026-09-04):真实浏览器冷启动验证 SW 204 静默链。
// 步骤:①首访装 SW(允许裸奔 404)②reload 后 SW 控制页面、Cache Storage 全空
// = warm 窗口 → SkyRenderer 拉天空族应得 204(x-sw-warm-miss:1)而非 404
// ③warm 全量完成后 Sun.png 应 200(cache 命中)。p0 已含天空族(2026-09-04
// BOOT_FIRST v3)——若 p0 下载先于菜单揭开,窗口内甚至不该出现天空族请求。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'https://ab575621.sandboxworld.pages.dev';
const dir = '/tmp/cdn-warmmiss-' + (Date.now() % 100000);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: dir,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();

const skyReqs = [];
page.on('response', (r) => {
  const u = r.url();
  if (/\/sprites\/vanilla\/(Sun|Moon_0|Cloud_)\S*\.png/.test(u)) {
    skyReqs.push({
      t: Date.now(), st: r.status(),
      miss: r.headers()['x-sw-warm-miss'] ?? '',
      f: u.split('/').pop(),
    });
  }
});
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('404') || t.includes('204')) console.log('[console]', t.slice(0, 140));
});

// ① 首访:装 SW
await page.goto(host + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
const ctl1 = await page.evaluate(() => !!navigator.serviceWorker?.controller);
console.log('① 首访 SW 控制页面:', ctl1, '| 天空族请求:', skyReqs.map((x) => `${x.f}:${x.st}`).join(',') || '无');

// ② reload:SW 控制 + 空 cache = warm 窗口
skyReqs.length = 0;
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));
console.log('② warm 窗口 4s 内天空族请求:', skyReqs.map((x) => `${x.f}:${x.st}`).join(',') || '无(p0 提前=菜单揭开前天空族已随 p0 就位)');
// ★直接验证 204 静默:窗口期 fetch 尾部片文件(p2+ 的 Tiles_200,此刻必 miss)
//  ——204+x-sw-warm-miss=静默链生效;404=旗链断裂。对照 HEAD(应真 404 直通)
const probe = await page.evaluate(async () => {
  const g = await fetch('/sprites/vanilla/Tiles_200.png');
  const h = await fetch('/sprites/vanilla/Tiles_200.png', { method: 'HEAD' }).then((r) => r.status).catch(() => 'ERR');
  // 音频族(2026-09-05 生产实报 hit.opus 404 收口):窗口期应同款 204 静默
  const a = await fetch('/sounds/hit.opus');
  const am = a.headers.get('x-sw-warm-miss') ?? '';
  // 消费方语义实测:204 空体 decodeAudioData 必失败(Sfx/Audio 的失败归宿前提)
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  let decodeFail = false;
  if (AC) {
    try { await new AC().decodeAudioData(await a.arrayBuffer()); } catch { decodeFail = true; }
  }
  return { get: g.status, getMiss: g.headers.get('x-sw-warm-miss') ?? '', head: h, audio: a.status, audioMiss: am, decodeFail };
});
console.log('②b 窗口期 GET Tiles_200.png:', probe.get, probe.getMiss ? '(x-sw-warm-miss:' + probe.getMiss + ')' : '', '| HEAD 直通:', probe.head, '(应 404)');
console.log('②c 窗口期 GET sounds/hit.opus:', probe.audio, probe.audioMiss ? '(x-sw-warm-miss:' + probe.audioMiss + ')' : '', '| 204空体 decodeAudioData 失败:', probe.decodeFail, '(应 true=失败归宿链成立)');

// ③ 等 warm 终态(最长 8 分钟)
let final = '';
for (let i = 0; i < 96; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  final = await page.evaluate(() => {
    const h = globalThis.__swAssetCache;
    const s = h && typeof h.state === 'function' ? h.state() : null;
    return s ? `${s.phase} ${s.done}/${s.total} failed=${s.failed}` : 'nohandle';
  });
  if (i % 4 === 0 || /done|failed/.test(final.split(' ')[0])) console.log(`   t=${(i + 1) * 5}s`, final);
  if (/^done|^done /.test(final) || /failed=\d+/.test(final) && !/ done 0\//.test(final)) {
    if (final.startsWith('done') || / failed=[1-9]/.test(final)) break;
  }
}
console.log('③ warm 终态:', final);

// ④ 终态后 Sun.png 实测(经 SW fetch)
const sun = await page.evaluate(async () => {
  const r = await fetch('/sprites/vanilla/Sun.png');
  return { st: r.status, ct: r.headers.get('content-type') ?? '' };
});
console.log('④ warm 终态后 fetch Sun.png:', sun.st, sun.ct);

// 判定
const window404 = skyReqs.filter((x) => x.st === 404);
console.log('== 判定 ==');
console.log(`窗口天空族 404: ${window404.length}(应 0)| 窗口期 GET 静默: ${probe.get === 204 ? '✓204' : '✗' + probe.get} ${probe.getMiss ? '(带 x-sw-warm-miss)' : '(无头!)'} | HEAD 直通 404: ${probe.head === 404 ? '✓' : '✗' + probe.head}`);
console.log(`窗口期音频静默: ${probe.audio === 204 ? '✓204' : '✗' + probe.audio} ${probe.audioMiss ? '(带头)' : '(无头!)'} | 空体 decode 失败: ${probe.decodeFail ? '✓' : '✗'}`);
console.log(`终态后 Sun: ${sun.st}(应 200)`);
await browser.close();
const ok = window404.length === 0 && probe.get === 204 && !!probe.getMiss && probe.head === 404 && probe.audio === 204 && !!probe.audioMiss && probe.decodeFail && sun.st === 200;
process.exit(ok ? 0 : 1);
