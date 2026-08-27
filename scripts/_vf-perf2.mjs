// 链性能严测:①冷解(全新缓存,真实地形 500 格) ②热解 ③chunk 烘焙增量(链开 vs 关)
// ④分配压力(每格 new Map + env spread 计数)。全部在页面内 performance.now 量测。
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
const out = await p.evaluate(async () => {
  const vf = await import('/src/render/VanillaFraming.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const rock = g.world.rockLevel ?? 0;
  // 真实地形样本:沙漠(3940-3990)+ 主城东(4020-4070) 各 25×10
  const spots = [];
  for (let y = 455; y < 465; y++) for (let x = 3945; x < 3990; x++) if (st.flags[st.idx(x, y)]) spots.push([x, y]);
  for (let y = 468; y < 478; y++) for (let x = 4025; x < 4070; x++) if (st.flags[st.idx(x, y)]) spots.push([x, y]);
  // ①冷解:先全清(vanillaFrameCache 模块内——用 world 切换技巧不行;直接测热+翻倍差)
  const t0 = performance.now();
  for (const [x, y] of spots) vf.vanillaFrameFor(st, x, y, st, 0, rock);
  const pass1 = performance.now() - t0;
  const t1 = performance.now();
  for (const [x, y] of spots) vf.vanillaFrameFor(st, x, y, st, 0, rock);
  const pass2 = performance.now() - t1;
  // ②更深样本:地下石/土混合 500 格
  const spots2 = [];
  for (let y = 700; y < 730; y++) for (let x = 4000; x < 4060; x++) if (st.flags[st.idx(x, y)]) spots2.push([x, y]);
  const t2 = performance.now();
  for (const [x, y] of spots2) vf.vanillaFrameFor(st, x, y, st, 0, rock);
  const deep1 = performance.now() - t2;
  const t3 = performance.now();
  for (const [x, y] of spots2) vf.vanillaFrameFor(st, x, y, st, 0, rock);
  const deep2 = performance.now() - t3;
  // ③chunk 烘焙增量:markDirty 后量 renderChunk 单 chunk 时长(取 chunks 内部?不可见)
  //   改为:量 bakeChunkInto 独立画布 调用时长(链开),再 localStorage 关链 reload 对照由外部做
  return { spots: spots.length, pass1Ms: +pass1.toFixed(1), pass2Ms: +pass2.toFixed(1),
    perColdUs: Math.round(pass1 * 1000 / spots.length), perWarmUs: Math.round(pass2 * 1000 / spots.length),
    deep: spots2.length, deep1Ms: +deep1.toFixed(1), deep2Ms: +deep2.toFixed(1),
    perDeepColdUs: Math.round(deep1 * 1000 / spots2.length), perDeepWarmUs: Math.round(deep2 * 1000 / spots2.length),
    memMB: null };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
