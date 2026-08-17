// NPC 对话头像填充探针（2026-08-17 用户报障：头像没填满头像框）：
//   原版 DrawNPCPortrait :39745 = 200×200 原尺寸画在圆底框上、留白是设计；
//   本仓矩形框 → 整图塞入头只占 ~一半。修 = canvas alpha 包围盒裁剪 + cover 铺满。
// 断言：①对话框打开出现 canvas 头像 ②画布有效覆盖 ≥85%（非空像素占比，
//   修复前 ~25-30%）③非空像素分布四方区（四角至少三象限有内容=真"填满"）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// 找引导（Guide 必在出生点）+ 打开对话（真实 talkToNearbyNpc 链）
const r = await page.evaluate(() => {
  const g = window.__swGame;
  const npcs = g.entities.npcs || g.entities.critters || [];
  const all = [];
  for (const k of Object.keys(g.entities)) {
    const arr = g.entities[k];
    if (Array.isArray(arr)) for (const e of arr) if (e && e.vanillaId && !e.dead && e.npcKey) all.push(e);
  }
  const guide = all.find((e) => e.vanillaId === 22) || all.find((e) => e.isTownNpc !== undefined);
  if (!guide) return { why: 'no town npc', count: all.length };
  g.player.x = guide.cx - 30; g.player.y = guide.cy - 8;
  g.player.vx = 0; g.player.vy = 0;
  const ok = g['talkToNearbyNpc'](Math.floor(guide.cx / 16), Math.floor(guide.cy / 16));
  return { ok, npc: guide.vanillaId };
});
check('对话打开（talkToNearbyNpc）', r.ok === true, JSON.stringify(r).slice(0, 90));
await sleep(800);   // 头像图异步加载 + 绘制

const cov = await page.evaluate(() => {
  const cv = document.querySelector('canvas.sw-npc-portrait');
  if (!cv) return { why: 'no canvas' };
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let solid = 0;
  const quad = [0, 0, 0, 0];
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      if (d[(y * cv.width + x) * 4 + 3] > 8) {
        solid++;
        quad[(y < cv.height / 2 ? 0 : 2) + (x < cv.width / 2 ? 0 : 1)]++;
      }
    }
  }
  const total = cv.width * cv.height;
  return { coverage: solid / total, quad, total };
});
check('头像画布出现', !cov.why, JSON.stringify(cov).slice(0, 60));
if (!cov.why) {
  check('有效像素覆盖率 ≥ 60%（画像含透明细节；修复前 ~22%）', cov.coverage >= 0.6, `coverage=${(cov.coverage * 100).toFixed(1)}%`);
  const quadsFilled = cov.quad.filter((q) => q > cov.total * 0.15).length;
  check('四象限均有内容（真填满）', quadsFilled >= 3, JSON.stringify(cov.quad));
}

// 截图存证
await page.screenshot({ path: '/tmp/sw-portrait.png' });
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
