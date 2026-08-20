// drawVanillaCell 离屏复现:半砖衔接 cap 是否绘制
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/halfiso-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5204', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const K = window.__swTileByKey;
  const dirt = K('dirt');
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 2; x < sx + 34; x++) for (let y = sy - 4; y < sy + 2; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  const put = (x, y, t, half) => { st.setTile(x, y, t, 0); if (half) st.setHalfBrick(x, y, true); };
  [false, true, false, false, true, false].forEach((h, k) => put(sx + k, sy - 2, dirt, h));
  const m = await import('/src/render/VanillaTiler.ts');
  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  const atlas = g.renderer.atlas;
  // 离屏 16×16 单格 bake(与 ChunkCache 同参:px=py=0, frameX/frameY=0)
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const cc = cv.getContext('2d');
  const def = TILE_DEFS[dirt];
  m.drawVanillaCell(cc, atlas, def.vanilla.sheet, def.vanilla.frame, def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
    st, sx, sy - 2, dirt, (t) => t === dirt, 0, 0, st.frameX[st.idx(sx, sy - 2)], st.frameY[st.idx(sx, sy - 2)]);
  const d = cc.getImageData(0, 0, 16, 16).data;
  const rows = [];
  for (let y = 0; y < 16; y += 2) {
    const r = [];
    for (let x = 0; x < 16; x += 2) {
      const i = (y * 16 + x) * 4;
      r.push(d[i + 3] > 0 ? `${d[i]},${d[i+1]},${d[i+2]}` : '----');
    }
    rows.push(r.join(' '));
  }
  // k=2(lh 情形) 同样 bake
  const cv2 = document.createElement('canvas'); cv2.width = 16; cv2.height = 16;
  const c2 = cv2.getContext('2d');
  m.drawVanillaCell(c2, atlas, def.vanilla.sheet, def.vanilla.frame, def.vanilla.fw ?? 1, def.vanilla.fh ?? 1,
    st, sx + 2, sy - 2, dirt, (t) => t === dirt, 0, 0, st.frameX[st.idx(sx + 2, sy - 2)], st.frameY[st.idx(sx + 2, sy - 2)]);
  const d2 = c2.getImageData(0, 0, 16, 16).data;
  const rows2 = [];
  for (let y = 0; y < 16; y += 2) {
    const r = [];
    for (let x = 0; x < 16; x += 2) {
      const i = (y * 16 + x) * 4;
      r.push(d2[i + 3] > 0 ? `${d2[i]},${d2[i+1]},${d2[i+2]}` : '----');
    }
    rows2.push(r.join(' '));
  }
  return { k0_rh: rows, k2_lh: rows2 };
});
console.log('--- k0 (右邻半砖, rh 情形)');
out.k0_rh.forEach((r, i) => console.log(`  y${i * 2}: ${r}`));
console.log('--- k2 (左邻半砖, lh 情形)');
out.k2_lh.forEach((r, i) => console.log(`  y${i * 2}: ${r}`));
await browser.close();
