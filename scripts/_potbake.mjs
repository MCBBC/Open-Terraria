// 终审:包裹 ChunkCache.renderChunk → 每次重建 (211,11) 后立即读陶罐 4 格
// 返回即对 = 后续有覆盖;返回即错 = 烘焙本身错
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const SAVE_TEXT = readFileSync('/Users/vinlic/Downloads/map-12345世界 (2).json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), SAVE_TEXT);
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.chunks, { timeout: 600000, polling: 2000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3385 * 16 - 100; g.player.y = 185 * 16; g.player.vx = 0; g.player.vy = 0;
});
await page.waitForFunction(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/Tiles_28.png'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

await page.evaluate(() => {
  const g = window.__swGame;
  const cc = g.chunks;
  window.__bakeLog = [];
  window.__inBake = false;
  window.__bake28 = [];
  // 烘焙期间记录所有 sheet-28 取帧
  window.__atlasSame = g.chunks.autotiler.atlas === g.renderer.atlas;
  const atlas = g.chunks.autotiler.atlas;  // 补丁 ChunkCache 实际使用的图集
  const origVF = atlas.vframeAt.bind(atlas);
  atlas.vframeAt = (sheet, fx, fy) => {
    if (window.__inBake && sheet === 28) window.__bake28.push([fx, fy]);
    return origVF(sheet, fx, fy);
  };
  const orig = cc.renderChunk.bind(cc);
  cc.renderChunk = function (cx, cy) {
    window.__inBake = true;
    const pair = orig(cx, cy);
    window.__inBake = false;
    if (cx === 211 && cy === 11) {
      const ctx = pair.tile.getContext('2d');
      const cells = [];
      for (const [x, y] of [[3385,189],[3386,189],[3385,190],[3386,190]]) {
        const d = ctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
        let op = 0;
        for (let k = 3; k < d.length; k += 4) if (d[k] > 40) op++;
        cells.push(op);
      }
      window.__bakeLog.push(cells);
      window.__bakeLog[window.__bakeLog.length - 1].q28 = window.__bake28.slice();
      window.__bake28.length = 0;
    }
    return pair;
  };
});

// 直接验证 swayBakeSkip 对陶罐的判定
const skip = await page.evaluate(async () => {
  const g = window.__swGame;
  // 模块函数不在全局——通过动态 import 拿(E2E 环境 vite 可解析)
  try {
    const m = await import('/src/render/WindSway.ts');
    const potId = window.__swTileByKey('pot');
    return { potId, skip: m.swayBakeSkip(potId, 72), sheet: g.world.store.type[g.world.store.idx(3385, 189)] };
  } catch (e) { return { err: e.message }; }
});
console.log('swayBakeSkip(陶罐,72) =', JSON.stringify(skip));
const ccState = await page.evaluate(() => {
  const g = window.__swGame;
  const cc = g.chunks;
  const potId = window.__swTileByKey('pot');
  return {
    autotiler: !!cc.autotiler,
    atlasOnAutotiler: !!(cc.autotiler && cc.autotiler.atlas),
    sheetsHasPot: cc.sheets ? cc.sheets.has(potId) : 'no sheets',
    rendererAtlas: !!g.renderer.atlas,
  };
});
console.log('ChunkCache 状态:', JSON.stringify(ccState));
console.log('图集同一性(autotiler.atlas === renderer.atlas):', await page.evaluate(() => window.__atlasSame));
await page.evaluate(() => window.__swGame.chunks.invalidateAll());
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => ({ bakes: window.__bakeLog, expected: [112, 48, 172, 140] }));
console.log('每次 renderChunk(211,11) 返回时的陶罐像素:');
out.bakes.forEach((b, i) => console.log(`  烘焙#${i}:`, JSON.stringify(b), JSON.stringify(b) === JSON.stringify(out.expected) ? '✓正确' : '✗'));
console.log('期望:', JSON.stringify(out.expected));
out.bakes.forEach((b, i) => console.log(`  烘焙#${i} 内 sheet-28 查询:`, b.q28 ? b.q28.length + ' 次' + JSON.stringify(b.q28.slice(0, 6)) : '无'));
await browser.close();
