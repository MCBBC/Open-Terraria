// 404 名单定向审计(2026-09-04):暖 profile 等全量完成后,逐个实测用户 404 名单:
// ①cache.match(键在?) ②fetch(URL)(经 SW,应命中) ③网络直取(对照)
// 判定:①②全 200 → 用户场景为窗口期 miss(已自愈);①在②404 → SW match 层 bug
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'sandboxworld.online';
const dir = '/tmp/cdn-404audit-' + (Date.now() % 100000);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: dir,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等 warm 完成(phase=done 且 done>=total)
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const st = await page.evaluate(() => {
    const h = globalThis.__swAssetCache;
    const s = h && typeof h.state === 'function' ? h.state() : null;
    return s ? `${s.phase} ${s.done}/${s.total} failed=${s.failed}` : 'nohandle';
  });
  console.log(`t=${(i + 1) * 5}s`, st);
  if (/done 12034\/12034/.test(st) || /failed=\d+/.test(st) && !/done 0/.test(st) && /phase=done/.test(st)) break;
}
// 名单实测(cache 直查 + fetch 经 SW + fetch no-sw 对照)
const r = await page.evaluate(async (names) => {
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  const out = [];
  for (const n of names) {
    const u = 'https://sandboxworld.online/' + n;
    const inCache = !!(await c.match(u));
    const viaSw = await fetch(u).then((x) => x.status).catch((e) => 'ERR:' + String(e).slice(0, 30));
    out.push({ n: n.split('/').pop(), inCache, viaSw });
  }
  return out;
}, [
  'sprites/vanilla/Trash.png', 'sprites/vanilla/Ambience_AirBalloons_Small.png',
  'sprites/vanilla/Ambience_AirBalloons_Large.png', 'sprites/vanilla/Tiles_213.png',
  'sprites/vanilla/Tiles_234.png', 'sprites/vanilla/Cloud_0.png', 'sprites/vanilla/Cloud_19.png',
  'sprites/vanilla/Cloud_20.png', 'sprites/vanilla/Cloud_21.png', 'sprites/vanilla/Cloud_18.png',
  'sprites/vanilla/Background_112.png', 'sprites/vanilla/Background_113.png',
  'sprites/vanilla/Backgrounds_Underworld 0.png', 'sprites/vanilla/Projectile_29.png',
  'sprites/vanilla/Gore_61.png', 'sprites/vanilla/Sun.png', 'sprites/vanilla/Moon_0.png',
  'sprites/vanilla/Player_11_0.png', 'sounds/Fuse.opus', 'sounds/Fuse.mp3',
]);
console.log('\n== 名单实测(cache 键在? / 经 SW fetch)==');
for (const x of r) console.log(`  ${String(x.inCache).padEnd(6)} ${x.viaSw}  ${x.n}`);
await browser.close();
process.exit(0);
