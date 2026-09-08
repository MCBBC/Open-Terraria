// ★IIIII222 红队刃（只读复核）：218 批「zenith 3,226,065 格 mismatch 五类全 0」独立复跑
// + 原探针仪具缺口修复（vanilla PAINT 表补全 1..30——批章 §5 自报 vanillaOK 0/40 系缺 id 13）。
// 复用 _iii218-zenithbg.mjs COLOR 段逻辑；产物 /tmp/iii222-out/color-report-iii222.json。
// 运行：SW_ORIGIN=http://localhost:5281 node tools/run-diag.mjs --timeout=900000 scripts/_iii222-colorcheck.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5281';
const OUT = '/tmp/iii222-out';
const BUST = Date.now();

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });

await page.evaluate((cfg) => {
  void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {});
}, { seed: 'get fixed boi', size: 0, name: 'iii222c', difficulty: 0, evil: 0 });
const t1 = Date.now();
while (Date.now() - t1 < 300000) {
  const st = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (st) break;
  await new Promise((r) => setTimeout(r, 500));
}
await page.waitForFunction(() => !!globalThis.__swGame?.renderer?.minimap, { timeout: 120000 });

const report = await page.evaluate(async (bust) => {
  const { mapColor24 } = await import(`/src/render/MapColors.ts?t=${bust}`);
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
  const { vanillaTileMapColor } = await import(`/src/data/vanillaMapColors.ts?t=${bust}`);
  // vanilla 独立复核（MapHelper.cs:1812-1875 MapColor 逐行重抄）——★IIIII222 仪具补全：
  // PAINT = WorldGen.paintColor(:44317) 全表 1..30（深层 13-24 与浅层同 RGB;29 Shadow=(25,25,25)）
  const P = {
    1: [255, 0, 0], 2: [255, 127, 0], 3: [255, 255, 0], 4: [127, 255, 0], 5: [0, 255, 0],
    6: [0, 255, 127], 7: [0, 255, 255], 8: [0, 127, 255], 9: [0, 0, 255], 10: [127, 0, 255],
    11: [255, 0, 255], 12: [255, 0, 127],
    25: [75, 75, 75], 26: [255, 255, 255], 27: [175, 175, 175], 28: [255, 178, 125],
    29: [25, 25, 25], 30: [200, 200, 200],
  };
  for (let d = 13; d <= 24; d++) P[d] = P[d - 12];
  const vMapColor = (base, ct) => {
    let n = base[0] / 255, n2 = base[1] / 255, n3 = base[2] / 255;
    if (n2 > n) { const t = n; n = n2; n2 = t; }
    if (n3 > n) { const t = n; n = n3; n3 = t; }
    const c = P[ct] ?? [128, 128, 128];
    if (ct === 29) { const s = n3 * 0.3; return [Math.trunc(c[0] * s), Math.trunc(c[1] * s), Math.trunc(c[2] * s)]; }
    if (ct === 30) return [255 - base[0], 255 - base[1], 255 - base[2]];   // tile 支全反（wall 半反另计）
    return [Math.trunc(c[0] * n), Math.trunc(c[1] * n), Math.trunc(c[2] * n)];
  };
  const g = globalThis.__swGame;
  const world = g.world, st = world.store, mm = g.renderer.minimap;
  const bg = {
    groundLevel: world.groundLevel, rockLevel: world.rockLevel,
    underworld: world.lavaLine > 0 ? world.lavaLine : undefined,
    remix: !!world.seedFlags?.remix,
  };
  const SHEET = new Int32Array(st.type.length);
  for (let i = 0; i < st.type.length; i++) SHEET[i] = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
  const w = world.w, h = world.h;
  const DUN = new Set([41, 43, 44, 677, 678, 679, 48, 487]);
  const GLASS_WALL = new Set([21, 88, 89, 90, 91, 92, 93, 168, 241, 318]); // ★IIIII222 新增计数面
  const stats = {
    paintedCells: { dungeon: 0, temple: 0, pyramid: 0, other: 0 },
    mismatch: { dungeon: 0, temple: 0, pyramid: 0, paintedOther: 0, unpainted: 0 },
    glassWallOnlyCells: 0,   // 玻璃族墙唯一内容格（vanilla wallLookup=0 → 不上图;JS 画 def.mapColor）
    total: 0,
  };
  const clsOf = (t, wl) => (DUN.has(SHEET[t]) ? 'dungeon'
    : (SHEET[t] === 226 || SHEET[t] === 61 || wl === 87) ? 'temple'
    : (SHEET[t] === 151 || wl === 34) ? 'pyramid' : null);
  const hexOf24 = (c) => '#' + c.toString(16).padStart(6, '0');
  const vanillaChecks = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = st.idx(x, y);
      const t = st.flags[i] ? st.type[i] : 0;
      const paint = st.paint[i] > 0 ? st.paint[i] : 0;
      const wpaint = st.paintWall[i] > 0 ? st.paintWall[i] : 0;
      const active = t !== 0 && st.flags[i] !== 0;
      if (!(active || st.liquid[i] > 32 || st.wall[i] !== 0)) continue;
      stats.total++;
      const mmHex = mm.colorFor(x, y);
      const prev24 = hexOf24(mapColor24(st, x, y, bg));
      const same = mmHex !== null && mmHex.toLowerCase() === prev24.toLowerCase();
      if (paint || wpaint) {
        const cls = active ? clsOf(st.type[i], st.wall[i]) : null;
        stats.paintedCells[cls ?? 'other']++;
        if (!same) stats.mismatch[cls ?? 'paintedOther']++;
      } else if (!same) {
        stats.mismatch.unpainted++;
      }
      // ★IIIII222 玻璃族墙唯一内容格计数（tile 未激活/无 tile、无液体、墙=玻璃族）
      if (!active && st.liquid[i] <= 32 && GLASS_WALL.has(st.wall[i])) stats.glassWallOnlyCells++;
      const cls = active ? clsOf(st.type[i], st.wall[i]) : null;
      if (cls && paint > 0 && vanillaChecks.length < 120 && (x + y) % 97 === 0) {
        const base = vanillaTileMapColor(SHEET[st.type[i]]);
        if (base) {
          const expect = vMapColor(base, paint);
          const got = mmHex ? [parseInt(mmHex.slice(1, 3), 16), parseInt(mmHex.slice(3, 5), 16), parseInt(mmHex.slice(5, 7), 16)] : null;
          vanillaChecks.push({
            cls, sheet: SHEET[st.type[i]], paint, base,
            expectVanilla: expect, minimapColor: got, preview24: prev24,
            ok: !!got && Math.abs(got[0] - expect[0]) <= 2 && Math.abs(got[1] - expect[1]) <= 2 && Math.abs(got[2] - expect[2]) <= 2,
            previewMatches: same,
          });
        }
      }
    }
  }
  return { world: { w, h, groundLevel: world.groundLevel, remix: bg.remix }, stats, vanillaChecks: vanillaChecks.slice(0, 60) };
}, BUST).catch((e) => ({ error: String(e).slice(0, 300) }));

writeFileSync(`${OUT}/color-report-iii222.json`, JSON.stringify(report, null, 2));
const s = report.stats ?? {};
console.log('COLOR', JSON.stringify({
  world: report.world, stats: s,
  vanillaOK: (report.vanillaChecks ?? []).filter((v) => v.ok).length + '/' + (report.vanillaChecks ?? []).length,
  previewOK: (report.vanillaChecks ?? []).filter((v) => v.previewMatches).length + '/' + (report.vanillaChecks ?? []).length,
}, null, 1));
console.log('ERRS', JSON.stringify(errs.slice(0, 6)));
await browser.close();
