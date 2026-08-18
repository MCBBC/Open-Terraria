// 晚到贴图自愈链复现(2026-08-19,用户实报"生命树贴图不及时,手动破坏才渲染"):
// 拦截延迟 Tiles_191/192(生命木/生命叶)15s → 进世界传送到生命树烘焙(缺表
// fallback+note)→ 表到达后验证精确重烘链:onBakeAssetArrived → markDirty →
// flushDirty 重烘 → 屏幕像素出现木质色(自愈)或仍透明(链断=bug 复现)。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_latetex-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const DELAY_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/latetex-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
// 拦截:目标表延迟 DELAY_MS(悬着不回 → ensureVImage 挂起/miss)
const TARGETS = [/Tiles_191\.png/, /Tiles_192\.png/];
const t0 = Date.now();
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (TARGETS.some((re) => re.test(req.url()))) {
    setTimeout(() => req.continue().catch(() => {}), DELAY_MS);
    return;
  }
  req.continue().catch(() => {});
});
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,扫描生命树(tile 191/383)位置…');
const tree = await page.evaluate(() => {
  // ★内部 id 换算(st.type 是 TILE_DEFS 索引,与 vanilla vid 无关)
  const ids = ['v_191_living_wood_block', 'v_192_living_leaf_block', 'v_383_living_mahogany_block', 'v_384_living_mahogany_leaves_block']
    .map((k) => window.__swTileByKey?.(k) ?? -1).filter((v) => v >= 0);
  if (!ids.length) return null;
  const set = new Set(ids);
  const st = window.__swGame.world.store;
  let found = null;
  for (let y = 40; y < st.h - 40 && !found; y += 3) {
    for (let x = 10; x < st.w - 10 && !found; x += 3) {
      const i = y * st.w + x;
      if (set.has(st.type[i]) && st.flags[i]) found = { x, y, t: st.type[i] };
    }
  }
  return found;
});
if (!tree) { console.log('FAIL: 未找到生命树 tile'); await browser.close(); process.exit(1); }
console.log(`生命树 tile=${tree.t} @(${tree.x},${tree.y}),传送玩家…`);
await page.evaluate((x, y) => {
  const p = window.__swGame.player;
  p.x = x * 16; p.y = (y - 6) * 16;
}, tree.x, tree.y);
// 烘焙缺表 chunk(等 6s:HUD 路径 get → bake → miss → note)
await sleep(6000);
const noted = await page.evaluate(() => ({
  arrive: window.__swGame.chunks.arriveInvalidateChunks,
  vimg191: !!window.__swGame.renderer.atlas?.vimages?.get?.('vanilla/Tiles_191.png')
    || [...(window.__swGame.renderer.atlas?.vimages?.keys?.() ?? [])].some((k) => k.includes('Tiles_191')),
  cached: window.__swGame.chunks.chunks.size,
}));
console.log(`[缺表期] arrive=${noted.arrive} Tiles_191就绪=${noted.vimg191} chunks=${noted.cached}`);
// 屏幕中心像素采样(生命树区域)——缺表期应为透明/天空色
const sampleCenter = () => page.evaluate(() => {
  const r = window.__swGame.renderer;
  const cv = r.canvas, ctx = cv.getContext('2d');
  const d = ctx.getImageData(cv.width / 2 - 60, cv.height / 2 - 60, 120, 120).data;
  let brown = 0, total = 0;
  for (let i = 0; i < d.length; i += 16) {
    total++;
    const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
    if (A > 200 && R > 90 && R < 190 && G > 55 && G < 130 && B < 95 && R > G && G >= B) brown++;
  }
  return +(brown / total * 100).toFixed(1);
});
const before = await sampleCenter();
console.log(`[缺表期] 屏幕中心木质色占比=${before}%`);
// 等表到达(15s 延迟)+ 自愈窗口 8s
console.log(`等待拦截释放(共 ${DELAY_MS}ms)+ 自愈 8s…`);
await sleep(Math.max(0, DELAY_MS - 6000) + 8000);
const after = await page.evaluate(() => ({
  arrive: window.__swGame.chunks.arriveInvalidateChunks,
  dirty: window.__swGame.chunks.dirtyQueue.length,
  flush: window.__swGame.chunks.lastFlushCount,
}));
const afterPx = await sampleCenter();
console.log(`[表到达后] arrive=${after.arrive}(>0=精确重烘触发) dirty=${after.dirty} 木质色占比=${afterPx}%`);
const healed = afterPx - before > 3 || afterPx > 5;
console.log(healed ? 'PASS: 晚到贴图自愈(无需手动破坏)' : 'FAIL: 自愈链断——需手动破坏才渲染(用户报告复现)');
await browser.close();
process.exit(healed ? 0 : 1);
