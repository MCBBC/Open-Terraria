// 浸润带隔离测试:对指定格直接调用 drawLiquidBehindTilesOnly(黑底 scratch canvas),
// 看带是否画/画在哪。同时画两次 pass(solidLayer true/false)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (5).json')), 'utf8');
const cells = JSON.parse(process.env.SW_CELLS ?? '[[879,284],[846,280],[882,282]]');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile11'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async (cells) => {
  const g = window.__swGame;
  const r = g.renderer;
  const m = await import('/src/render/VanillaLiquidRenderer.ts');
  const st = g.world.store;
  const atlas = r.atlas;
  const results = [];
  for (const [x, y] of cells) {
    const res = { x, y, bg: [], solid: [], store: {} };
    const i0 = st.idx(x, y);
    // 逐步门控复算
    const { TILE_DEFS } = await import('/src/data/tiles.ts');
    const def = TILE_DEFS[st.type[i0]];
    const upI = st.idx(x, y - 1);
    res.gates = {
      defKey: def?.key, solid: !!def?.solid, platform: !!def?.platform,
      wire32: (st.wire[i0] & 32) !== 0,
      upLq: st.liquid[upI] ?? -1, upLt: st.liquidType[upI] || 0,
      waterStyle: r.waterStyle,
      texReady: !!atlas.ensureVImage(`vanilla/Liquid_${Math.max(0, Math.min(13, r.waterStyle ?? 0))}.png`),
    };
    const i = st.idx(x, y);
    res.store = {
      type: st.type[i], act: !!st.flags[i], slope: st.slope[i], half: !!st.half[i],
      lq: st.liquid[i], wall: st.wall[i],
      up: (() => { const j = st.idx(x, y - 1); return { lq: st.liquid[j], t: st.type[j] }; })(),
    };
    // 预热:手动拉起 Liquid_0/LiquidSlope_0(页面相机在出生点,不会自动加载标记区贴图)
    const ws = r.waterStyle ?? 0;
    res.waterStyle = ws;
    const need = [`vanilla/Liquid_${Math.max(0, Math.min(13, ws))}.png`, `vanilla/LiquidSlope_${Math.max(0, Math.min(14, ws))}.png`];
    for (let k = 0; k < 20; k++) {
      const ok = need.every((f) => { const im = atlas.ensureVImage(f); return im && im.width > 0; });
      if (ok) break;
      await new Promise((rr) => setTimeout(rr, 200));
    }
    for (const layer of [false, true]) {
      const cv = document.createElement('canvas');
      cv.width = 112; cv.height = 112;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.fillStyle = '#000'; c2.fillRect(0, 0, 112, 112);
      c2.translate(-(x - 3) * 16, -(y - 3) * 16);
      try {
        m.drawLiquidBehindTilesOnly(c2, atlas, st, g.world.groundLevel, x - 3, y - 3, x + 3, y + 3, r.waterStyle ?? 0, undefined, layer);
      } catch (e) { res.err = String(e.message); }
      const d = c2.getImageData(0, 0, 112, 112).data;
      const rows = [];
      for (let ty = 48; ty < 64; ty++) {
        let line = '';
        for (let tx = 48; tx < 64; tx++) {
          const k = (ty * 16 + tx) * 4;
          line += (d[k] > 20 || d[k + 1] > 20 || d[k + 2] > 20) ? '#' : '.';
        }
        rows.push(line);
      }
      (layer ? res.solid : res.bg).push(rows.join('\n'));
    }
    results.push(res);
  }
  return results;
}, cells);
for (const r of out) {
  console.log(`\n== (${r.x},${r.y}) store=${JSON.stringify(r.store)} gates=${JSON.stringify(r.gates)}${r.err ? ' ERR=' + r.err : ''}`);
  console.log('-- bg pass (solidLayer=false):');
  console.log(r.bg[0].split('\n').map((l) => '   ' + l).join('\n'));
  console.log('-- solid pass (solidLayer=true):');
  console.log(r.solid[0].split('\n').map((l) => '   ' + l).join('\n'));
}
await browser.close();
