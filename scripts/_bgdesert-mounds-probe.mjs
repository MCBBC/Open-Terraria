// 沙漠样式4背景"锯齿丘+粗树"来源定位探针(2026-09-03 用户实报"饥饿的庄园"远景锯齿)
// 流程:5203 私有实例 → 同 seed(1247539775) 新建小世界 → 传送沙漠 → 截图
// → 逐层关 248/249/250 二分 + 整体关 biomeBg,找出异常层绘制源
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const OUT = process.env.SW_OUT ?? '/Users/vinlic/.claude/jobs/4a66e745/tmp';
const SEED = '1247539775';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.mouse.click(8, 8);
for (let i = 0; i < 6 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
if (!(await page.$('.sw-vsel'))) throw new Error('世界/角色面板未出现');
// 建角色(若无)
if (!(await page.$('.sw-char-row input[type=text]'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('bgprobe');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(() => {});
await new Promise((r) => setTimeout(r, 600));
// 建世界(小尺寸+指定 seed)
await page.click('.sw-vsel [data-act=new]').catch(() => {});
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await page.click('[data-f=seed]');
await page.keyboard.type(SEED);
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
await page.click('[data-act=create]');
console.log('世界生成中…');
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 420000, polling: 1000 });
// 轮询等沙漠生成(地表附近沙柱 >120 才算成形,防半生成世界误扫)
let loc = null;
for (let t = 0; t < 280 && !loc; t++) {
  await new Promise((r) => setTimeout(r, 1500));
  loc = await page.evaluate(() => {
    const g = window.__swGame;
    if (!g?.world?.store) return null;
    const st = g.world.store;
    const w = st.w, h = st.h;
    const ty = st.type;
    let best = -1, bestN = -1;
    for (let x = 60; x < w - 60; x += 4) {
      let n = 0;
      for (let y = 60; y < (g.world.groundLevel | 0) + 80 && y < h; y++) if (ty[x + y * w] === 53) n++;
      if (n > bestN) { bestN = n; best = x; }
    }
    if (bestN < 120) return null;
    let gy = 0; while (gy < h - 10 && !st.isSolid(best, gy)) gy++;
    g.player.x = best * 16 + 8; g.player.y = (gy - 6) * 16;
    g.player.vx = 0; g.player.vy = 0;
    if (g.world.clock) g.world.clock.timeOfDay = 0.5;
    return { x: best, gy, bestN, groundLevel: g.world.groundLevel, treeX: g.world.treeX ?? null };
  });
}
if (!loc) throw new Error('等待 7 分钟仍未见沙漠(半生成?)');
console.log('沙漠列:', JSON.stringify(loc));
// 等背景过渡(bgDelay 30 帧 + alpha 0.05/帧爬满)+贴图预热
for (let i = 0; i < 240; i++) await new Promise((r) => setTimeout(r, 16.7));
const state = await page.evaluate(() => {
  const g = window.__swGame;
  const bg = g.renderer.biomeBg;
  return {
    bgStyle: bg.bgStyle, desertStyle: bg.desertStyle,
    triple: bg.activeDesertTriple(),
    scene: g.scene ? { desert: g.scene.zoneDesert } : null,
    playerX: Math.round(g.player.x), playerY: Math.round(g.player.y),
    cam: g.renderer.cam ? { x: Math.round(g.renderer.cam.x), y: Math.round(g.renderer.cam.y), zoom: g.renderer.cam.zoom } : null,
  };
});
console.log('bg状态:', JSON.stringify(state));
const canvasRect = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.w, height: canvasRect.h } });
  console.log('shot:', name);
};
await shot('probe-baseline');

// ---- 二分:逐层关闭 ----
const bisect = async (label, fn) => {
  await page.evaluate(fn);
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 16.7));
  await shot(label);
};
await bisect('probe-no248', () => {
  const bg = window.__swGame.renderer.biomeBg;
  if (!bg.__origImg) bg.__origImg = bg.img.bind(bg);
  bg.img = (n) => (n === 248 ? null : bg.__origImg(n));
});
await bisect('probe-no249', () => {
  const bg = window.__swGame.renderer.biomeBg;
  bg.img = (n) => (n === 249 ? null : bg.__origImg(n));
});
await bisect('probe-no250', () => {
  const bg = window.__swGame.renderer.biomeBg;
  bg.img = (n) => (n === 250 ? null : bg.__origImg(n));
});
await bisect('probe-noAll3', () => {
  const bg = window.__swGame.renderer.biomeBg;
  bg.img = (n) => ([248, 249, 250].includes(n) ? null : bg.__origImg(n));
});
await bisect('probe-noBgDraw', () => {
  const r = window.__swGame.renderer;
  if (!r.__origBgDraw) r.__origBgDraw = r.biomeBg.draw.bind(r.biomeBg);
  r.biomeBg.draw = () => {};
});
await bisect('probe-restore', () => {
  const r = window.__swGame.renderer;
  if (r.__origBgDraw) { r.biomeBg.draw = r.__origBgDraw; delete r.__origBgDraw; }
  const bg = r.biomeBg;
  if (bg.__origImg) { bg.img = bg.__origImg; delete bg.__origImg; }
});

console.log('页面错误数:', errors.length);
for (const e of errors.slice(0, 5)) console.log('ERR:', e.slice(0, 200));
await browser.close();
console.log('PROBE DONE');
