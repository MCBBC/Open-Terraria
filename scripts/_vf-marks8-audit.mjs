// 第三批标注终审:生产路由(diverted/unified)+ 统一帧源缺口统计(+0 对齐)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = needInput(join(DOWNLOADS, 'map-FTW_V2 (8).json'));
const MARKS = JSON.parse(fs.readFileSync(needInput(join(DOWNLOADS, 'marks-FTW_V2 (8).json')), 'utf8')).marks;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(3000);
const res = await p.evaluate(async (marks) => {
  const vfMod = await import('/src/render/VanillaFraming.ts');
  const fmMod = await import('/src/render/TileMergeFamily.ts');
  const tdMod = await import('/src/data/tiles.ts');
  const st = window.__swGame.world.store;
  const rock = window.__swGame.world.rockLevel ?? 0;
  const atlas = window.__swGame.renderer.atlas;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const rows = [];
  for (const m of marks) {
    const { x, y } = m;
    const ci = st.idx(x, y);
    const tInt = st.flags[ci] ? st.type[ci] : -1;
    const van0 = fmMod.vanillaIdOf(tInt);
    let foreign = false;
    let wireNb = st.wire[ci];
    const nbList = [];
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) { nbList.push(-2); continue; }
      const ni = st.idx(nx, ny);
      nbList.push(st.flags[ni] ? st.type[ni] : 0);
      wireNb |= st.wire[ni];
      if (!st.flags[ni]) continue;
      const nv = fmMod.vanillaIdOf(st.type[ni]);
      if (nv !== van0 && vfMod.VANILLA_FRAME_SETS.MERGE_DIRT[nv]) foreign = true;
    }
    let route, fr;
    if (foreign && !(localStorage.getItem('sw_vanilla_framing_strict') === '1')) {
      route = 'unified';
      fr = vfMod.vanillaFrameUnified(st, x, y, ((x * 7) + (y * 11)) % 3, rock);
    } else {
      route = 'chain';
      fr = vfMod.vanillaFrameFor(st, x, y, st, ((x * 7) + (y * 11)) % 3, rock);
    }
    // 帧源缺口(+0 正确对齐)
    const def = tdMod.TILE_DEFS[tInt] ?? tdMod.TILE_DEFS[fmMod.vanillaIdOf(tInt)] ?? null;
    const sheet = def?.vanilla?.sheet ?? (() => { const g = tdMod.TILE_DEFS.map(d => d?.vanilla?.sheet); return g.indexOf(van0); })();
    let holes = -1; const holeDirs = { n: 0, s: 0, w: 0, e: 0 };
    const img = atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
    if (img) {
      c.clearRect(0, 0, 64, 64);
      c.drawImage(img, Math.floor(fr.fx / 18) * 18, Math.floor(fr.fy / 18) * 18, 16, 16, 0, 0, 16, 16);
      const d = c.getImageData(0, 0, 16, 16).data;
      holes = 0;
      for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
        if (d[(py * 16 + px) * 4 + 3] === 0) {
          holes++;
          if (py <= 3) holeDirs.n++; else if (py >= 12) holeDirs.s++;
          else if (px <= 3) holeDirs.w++; else if (px >= 12) holeDirs.e++;
        }
      }
    }
    rows.push({ no: m.no, x, y, k: m.typeKey, van0, route, f: [fr.fx, fr.fy], holes, holeDirs, wire: wireNb, nb: nbList.join(',') });
  }
  return rows;
}, MARKS);
const bad = res.filter(r => r.holes > 0);
console.log(JSON.stringify({ total: res.length, holed: bad.length }));
for (const r of res) console.log(`#${r.no} (${r.x},${r.y}) ${r.k} van=${r.van0} ${r.route} f=(${r.f[0]},${r.f[1]}) holes=${r.holes}${r.holes>0?' '+JSON.stringify(r.holeDirs):''} wire=${r.wire}`);
fs.writeFileSync(join(HOME, '.claude/jobs/4a66e745/tmp/marks8-audit.json'), JSON.stringify(res, null, 1));
await b.close();
