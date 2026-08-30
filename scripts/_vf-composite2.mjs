// 校正版合成(+0,+0 取样,16×16,栅距18):同标注代表格 9×9 邻域 ×3 变体。
// ⚠️本探针绕过 vanillaChainFrame 直画链帧 ⇒ 反映不了回落/统一视图路由!端到端判定必须用 _vf-composite3(经 drawVanillaCell)。保留仅作帧级取证。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = '/Users/vinlic/Downloads/map-FTW_V2 (6).json';
const SAMPLES = [{ x: 3969, y: 469 }, { x: 3975, y: 470 }, { x: 4003, y: 465 }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(3000);
const shots = await p.evaluate(async (samples) => {
  const vf = await import('/src/render/VanillaFraming.ts');
  const tdMod = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const rock = g.world.rockLevel ?? 0;
  const atlas = g.renderer.atlas;
  const Z = 6, N = 11;
  const out = [];
  for (const s of samples) {
    for (const variant of [0]) {
      const cv = document.createElement('canvas');
      cv.width = N * 16 * Z; cv.height = N * 16 * Z;
      const c = cv.getContext('2d');
      c.fillStyle = '#00FF00'; c.fillRect(0, 0, cv.width, cv.height);
      c.imageSmoothingEnabled = false;
      for (let dy = -(N >> 1); dy <= (N >> 1); dy++) {
        for (let dx = -(N >> 1); dx <= (N >> 1); dx++) {
          const x = s.x + dx, y = s.y + dy;
          const idx = st.idx(x, y);
          if (!st.flags[idx]) continue;
          const def = tdMod.TILE_DEFS[st.type[idx]];
          const sheet = def?.vanilla?.sheet;
          if (sheet == null) continue;
          const img = atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
          if (!img) continue;
          const v = vf.vanillaFrameFor(st, x, y, st, variant, rock);
          c.drawImage(img, Math.floor(v.fx / 18) * 18, Math.floor(v.fy / 18) * 18, 16, 16,
            (dx + (N >> 1)) * 16 * Z, (dy + (N >> 1)) * 16 * Z, 16 * Z, 16 * Z);
        }
      }
      out.push(cv.toDataURL('image/png'));
    }
  }
  return out;
}, SAMPLES);
for (let i = 0; i < shots.length; i++) {
  fs.writeFileSync(`/Users/vinlic/.claude/jobs/4a66e745/tmp/c2g-${i}-v0.png`, Buffer.from(shots[i].split(',')[1], 'base64'));
}
console.log(JSON.stringify({ count: shots.length }));
await b.close();
