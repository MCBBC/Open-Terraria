// 迷雾行为探针(2026-08-19,用户三报:HUD 雾闪/F4 失效/生命树贴图晚到):
//  ① 进世界后走动 40s,采样 fogFullRebuilds(应恒=1;周期增长=闪烁源)
//  ② 模拟 F4(fill(1)+dirty=null+version++),检查 HUD 雾是否清、清后是否"回弹"
//  ③ HUD 雾像素逐帧监视:40s 内出现"全亮帧"(雾覆盖骤降)的次数与时刻
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_fogwatch-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/fogwatch-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,渲染 5s…');
await sleep(5000);

// ---- ① 走动 40s + HUD 雾覆盖逐帧监视 ----
// HUD 小窗锚点(与 drawMinimap 同式):ox = canvasW-240-52, oy=90, size=240
// 每 500ms 读一次该窗口内"雾色像素"占比(FogWatch 内部轮询,避免高频 evaluate)
await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  const ctx = cv.getContext('2d');
  const ox = cv.width - 240 - 52, oy = 90;
  window.__fogSamples = [];
  window.__fogWatchTimer = setInterval(() => {
    const r = window.__swGame.renderer;
    const d = ctx.getImageData(ox, oy, 240, 240).data;
    let fogPx = 0;
    for (let i = 0; i < d.length; i += 16) {
      // 迷雾色 ≈ (8,5,5,255)(0xff080505 小端);给 ±3 容差
      if (Math.abs(d[i] - 8) <= 3 && Math.abs(d[i + 1] - 5) <= 3 && Math.abs(d[i + 2] - 5) <= 3) fogPx++;
    }
    window.__fogSamples.push({
      t: Math.round(performance.now()),
      fogPct: +(fogPx / (d.length / 16) * 100).toFixed(1),
      full: r.fogFullRebuilds, incr: r.fogIncrUpdates, why: r.fogFullWhy,
      version: window.__swGame.world.exploredVersion,
      fogVersion: r.fogVersion, rebuildRow: r.fogRebuildRow,
      dirtyNull: window.__swGame.world.exploredDirty === null,
    });
  }, 500);
});
console.log('走动 40s(雾覆盖监视中)…');
for (let i = 0; i < 20; i++) {
  await page.evaluate((k) => { const p = window.__swGame.player; p.x += 400; if (k % 3 === 0) p.y += 200; }, i);
  await sleep(2000);
}
const s1 = await page.evaluate(() => ({ arr: window.__fogSamples.splice(0), timerOn: true }));
const arr = s1.arr;
// 统计:全亮帧(fogPct 突降 >30 点)、整幅重建次数
let flashes = 0, flashAt = [];
for (let i = 1; i < arr.length; i++) {
  if (arr[i - 1].fogPct - arr[i].fogPct > 30 && arr[i].fogPct < arr[i - 1].fogPct * 0.5) { flashes++; flashAt.push(`t=${arr[i].t}ms ${arr[i - 1].fogPct}%→${arr[i].fogPct}%`); }
}
const fullCount = arr.length ? arr[arr.length - 1].full : -1;
const incrCount = arr.length ? arr[arr.length - 1].incr : -1;
console.log(`[①走动40s] 采样=${arr.length} 整幅重建=${fullCount}(应1) 增量=${incrCount}`);
// 每次整幅重建计数变化时刻的 why 快照
let lastFull = 0;
for (const a of arr) {
  if (a.full > lastFull) { console.log(`  整幅#${a.full} @t=${a.t}ms why=${a.why}`); lastFull = a.full; }
}
console.log(`  雾覆盖范围: ${Math.min(...arr.map(a => a.fogPct)).toFixed(1)}% ~ ${Math.max(...arr.map(a => a.fogPct)).toFixed(1)}%`);
console.log(`  全亮闪帧: ${flashes} ${flashAt.slice(0, 4).join(' | ')}`);
const dirtyNullSamples = arr.filter((a) => a.dirtyNull).length;
console.log(`  dirty=null 采样: ${dirtyNullSamples}/${arr.length}(探索后应恒 false)`);

// ---- ② 模拟 F4 ----
const beforeF4 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return { full: r.fogFullRebuilds, fogPct: window.__fogSamples.length ? '采样中' : '-' };
});
await page.evaluate(() => {
  const w = window.__swGame.world;
  w.explored.fill(1);
  w.exploredDirty = null;
  w.exploredVersion++;
});
await sleep(3000);
const afterF4 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const cv = window.__swGame.renderer.canvas;
  const ctx = cv.getContext('2d');
  const ox = cv.width - 240 - 52, oy = 90;
  const d = ctx.getImageData(ox, oy, 240, 240).data;
  let fogPx = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (Math.abs(d[i] - 8) <= 3 && Math.abs(d[i + 1] - 5) <= 3 && Math.abs(d[i + 2] - 5) <= 3) fogPx++;
  }
  return { full: r.fogFullRebuilds, fogPct: +(fogPx / (d.length / 16) * 100).toFixed(1),
    version: window.__swGame.world.exploredVersion, fogVersion: r.fogVersion, row: r.fogRebuildRow };
});
console.log(`[②F4] 整幅重建 ${beforeF4.full}→${afterF4.full} | HUD雾覆盖=${afterF4.fogPct}%(应≈0) | version=${afterF4.version} fogVersion=${afterF4.fogVersion} row=${afterF4.row}`);
// F4 后再走 10s 看雾是否"回弹"
await page.evaluate(() => { window.__fogSamples.length = 0; });
await page.evaluate(() => { window.__swGame.player.x += 800; });
await sleep(10000);
const s3 = await page.evaluate(() => window.__fogSamples.splice(0));
console.log(`[②F4后10s] 雾覆盖 max=${Math.max(0, ...s3.map((a) => a.fogPct)).toFixed(1)}%(回弹>5%=F4被覆盖)`);

await page.evaluate(() => clearInterval(window.__fogWatchTimer));
await browser.close();
