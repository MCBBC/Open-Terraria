// 端到端渲染合成(生产路径):逐格调 drawVanillaCell 本体(含跨族统一视图回落),
// 绿底判孔。样本=三簇中心。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = process.env.VFP_MAP ?? needInput(join(DOWNLOADS, 'map-FTW_V2 (7).json'));
const SAMPLES = (process.env.VFP_SAMPLES ?? '3969,469')
  .split(';').map((p)=>{const [x,y]=p.split(',').map(Number);return {x,y};});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(3000);
for (let si = 0; si < SAMPLES.length; si++) {
  const shots = await p.evaluate(async (s0) => {
    const vtMod = await import('/src/render/VanillaTiler.ts');
    const tdMod = await import('/src/data/tiles.ts');
    const g = window.__swGame;
    const st = g.world.store;
    const atlas = g.renderer.atlas;
    const Z = 6, N = 11;
    const cv = document.createElement('canvas');
    cv.width = N * 16 * Z; cv.height = N * 16 * Z;
    const c = cv.getContext('2d');
    c.fillStyle = '#00FF00'; c.fillRect(0, 0, cv.width, cv.height);
    c.imageSmoothingEnabled = false;
    c.save();
    c.scale(Z, Z);
    for (let dy = -(N >> 1); dy <= (N >> 1); dy++) {
      for (let dx = -(N >> 1); dx <= (N >> 1); dx++) {
        const x = s0.x + dx, y = s0.y + dy;
        const idx = st.idx(x, y);
        if (!st.flags[idx]) continue;
        const def = tdMod.TILE_DEFS[st.type[idx]];
        const sheet = def?.vanilla?.sheet;
        if (sheet == null) continue;
        try {
          vtMod.drawVanillaCell(c, atlas, sheet, def.vanilla.frame === 'auto' ? 'auto' : 'blend',
            def.fw ?? 1, def.fh ?? 1, st, x, y, st.type[idx],
            () => false,
            (dx + (N >> 1)) * 16, (dy + (N >> 1)) * 16, -1, -1);
        } catch (e) { void e; }
      }
    }
    c.restore();
    return [cv.toDataURL('image/png')];
  }, SAMPLES[si]);
  fs.writeFileSync(`${HOME}/.claude/jobs/4a66e745/tmp/c3-${si}.png`, Buffer.from(shots[0].split(',')[1], 'base64'));
}
console.log(JSON.stringify({ done: SAMPLES.length }));
await b.close();
