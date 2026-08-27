// VanillaFraming 单格求解耗时量测:冷(清缓存)与热(缓存命中)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const conv = await p.evaluate(async (b64) => {
  const m = await import('/src/wld/WldImport.ts');
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
for (let i = 0; i < 90; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await new Promise((r) => setTimeout(r, 4000));
const res = await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3964 * 16; g.player.y = 468 * 16; g.player.vx = 0; g.player.vy = 0;
  return null;
});
await sleep(5000);
const perf = await p.evaluate(() => {
  const { vanillaFrameFor } = null ?? {};
  return null;
});
// 借 diag 内部:直接 import 模块量测
const out = await p.evaluate(async () => {
  const vf = await import('/src/render/VanillaFraming.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const rock = g.world.rockLevel ?? g.world.groundLevel ?? 0;
  // 冷测:清缓存后 500 格
  vf.invalidateVanillaFramesAll?.();
  const t0 = performance.now();
  let n = 0;
  for (let y = 430; y < 460; y++) for (let x = 3940; x < 3990; x++) {
    if (!st.flags[st.idx(x, y)]) continue;
    vf.vanillaFrameFor(st, x, y, st, 0, rock);
    n++;
  }
  const cold = performance.now() - t0;
  const t1 = performance.now();
  for (let y = 430; y < 460; y++) for (let x = 3940; x < 3990; x++) {
    if (!st.flags[st.idx(x, y)]) continue;
    vf.vanillaFrameFor(st, x, y, st, 0, rock);
  }
  const warm = performance.now() - t1;
  return { tiles: n, coldMs: Math.round(cold * 10) / 10, warmMs: Math.round(warm * 10) / 10, perColdUs: Math.round(cold * 1000 / n), perWarmUs: Math.round(warm * 1000 / n) };
});
console.log(JSON.stringify(out));
await b.close();
