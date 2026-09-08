// ★IIIII218 一次性验收探针（两靶一体）：
//   靶二 生成屏背景动效：zenith/remix/drunk/noTraps 四形态——logo 旋转/缩放矩阵、
//        logo 图源(Logo5 巨石)、昼夜面(remix 强制夜)、坠星速率(remix 白昼/drunk 每帧)、
//        云型强制(28/25-26/37-40)、云量、lockBG、remix 背景漂移、生成屏日月抓取交互。
//   靶一 预览地图色差：zenith 世界生成期截预览帧尾态 + 进世界后 M 大地图(mapColor24 系
//        双路径)同格比对——地牢 41/43/44(+677-679/48/487)/神庙 226/61+墙87/
//        金字塔 151+墙34（tenthAnniversary 全漆面）；并做 vanilla MapColor 独立公式复核。
// 运行：SW_ORIGIN=http://localhost:5275 node tools/run-diag.mjs --timeout=900000 \
//        scripts/_iii218-zenithbg.mjs
// 产物：/tmp/iii218-out/{bg-report.json,color-report.json,shot-*.png}
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5275';
const OUT = '/tmp/iii218-out';
const BUST = Date.now();
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { const t = m.text(); if (/error|ERROR|缺失/.test(t)) errs.push(t.slice(0, 160)); });
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });

// 首页兜底绕过（手势门等）：headless 手势开门（IIIIRS215b 判例）
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });
const bringToFront = async () => { try { await page.bringToFront(); } catch { /* noop */ } };

// ───────────────────────── 靶二：四形态背景动效 ─────────────────────────
const FORMS = [
  { key: 'zenith', seed: 'get fixed boi' },
  { key: 'remix', seed: 'dontdigup' },
  { key: 'drunk', seed: '05162020' },
  { key: 'notraps', seed: 'no traps' },
];
const SAMPLE_MS = 7000;

/** 采样一帧背景动效态 */
const sampleBg = () => page.evaluate(() => {
  const logo = document.querySelector('.sw-title-logo');
  const day = document.querySelector('.logo-day');
  const night = document.querySelector('.logo-night');
  const cel = document.querySelector('.sw-title-celestial');
  const mbg = globalThis.__swMenuBg;
  let rot = null, scale = null;
  if (logo) {
    const m = new DOMMatrixReadOnly(getComputedStyle(logo).transform === 'none' ? '' : getComputedStyle(logo).transform);
    if (getComputedStyle(logo).transform !== 'none') {
      scale = Math.hypot(m.a, m.b);
      rot = Math.atan2(m.b, m.a);
    }
  }
  const dbg = mbg?.genAnimDebug?.() ?? null;
  return {
    transformSet: logo ? getComputedStyle(logo).transform !== 'none' : null,
    rot, scale,
    logoDaySrc: day?.src?.split('/').pop() ?? null,
    nightOpacity: night ? Number(getComputedStyle(night).opacity) : null,
    celestialBox: cel ? (() => { const r = cel.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })() : null,
    dbg,
    inGame: !!globalThis.__swGame?.world,
  };
}).catch(() => null);

const bgReport = { forms: {}, errs, note: 'IIIII218 生成屏背景动效四形态' };
for (const { key, seed } of FORMS) {
  const entry = { seed, samples: [], interaction: null };
  bgReport.forms[key] = entry;
  const flush = () => writeFileSync(`${OUT}/bg-report.json`, JSON.stringify(bgReport, null, 2));
  try {
    await bringToFront();
    // 【火不await】（215b 判例：await=等到生成完才采样）
    await page.evaluate((cfg) => {
      void window.__swFlow.createWorldProbe(cfg)?.catch?.((e) => { globalThis.__swProbeErr = String(e).slice(0, 200); });
    }, { seed, size: 0, name: 'iii218', difficulty: 0, evil: 0 });
    const t0 = Date.now();
    let starsA = null, camXA = null, shot = false;
    while (Date.now() - t0 < SAMPLE_MS) {
      const s = await sampleBg();
      if (s && s.dbg) {
        s.t = Math.round((Date.now() - t0) / 100) / 10;
        if (starsA === null) { starsA = s.dbg.starFallCount; camXA = s.dbg.camX; }
        s.starRate = (s.dbg.starFallCount - starsA) / Math.max(0.1, s.t);
        s.camXDelta = s.dbg.camX - camXA;
        entry.samples.push(s);
        if (!shot && Date.now() - t0 > 2500) {
          await page.screenshot({ path: `${OUT}/shot-${key}-gen.png` }).catch(() => {});
          shot = true;
        }
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    // 生成屏日月抓取交互（vanilla gameMenu 门在生成期恒真——Main.cs:63944）
    const last = entry.samples[entry.samples.length - 1];
    if (last?.celestialBox && last.celestialBox.w > 4) {
      const before = await page.evaluate(() => globalThis.__swMenuBg?.clockTime?.() ?? null);
      await page.mouse.move(last.celestialBox.x, last.celestialBox.y);
      await page.mouse.down();
      await page.mouse.move(last.celestialBox.x + 200, last.celestialBox.y, { steps: 6 });
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 300));
      const after = await page.evaluate(() => globalThis.__swMenuBg?.clockTime?.() ?? null);
      entry.interaction = { grabbed: before !== null && after !== null && before !== after, before, after };
    }
    // 生成收尾快照（预览帧尾态截图=靶一佐证）
    if (key === 'zenith') {
      const t1 = Date.now();
      while (Date.now() - t1 < 300000) {
        const st = await page.evaluate(() => ({ inGame: !!globalThis.__swGame?.world, mmReady: !!globalThis.__swGame?.renderer?.minimap })).catch(() => null);
        if (st?.inGame) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      await page.screenshot({ path: `${OUT}/shot-zenith-world.png` }).catch(() => {});
    }
  } catch (e) {
    entry.error = String(e).slice(0, 200) + (globalThis.__swProbeErr ?? '');
  }
  flush();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 120000 });
}

// ───────────────────────── 靶一：预览 vs M 大地图同格色比对 ─────────────────────────
// zenith 世界已在上一轮进入（page 处于游戏内）;若被 reload 则重进一轮
let colorReport = null;
{
  const inGame = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (!inGame) {
    await bringToFront();
    await page.evaluate((cfg) => {
      void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {});
    }, { seed: 'get fixed boi', size: 0, name: 'iii218c', difficulty: 0, evil: 0 });
    const t1 = Date.now();
    while (Date.now() - t1 < 300000) {
      const st = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
      if (st) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await page.waitForFunction(() => !!globalThis.__swGame?.renderer?.minimap, { timeout: 120000 });
  colorReport = await page.evaluate(async (bust) => {
    const { mapColor24 } = await import(`/src/render/MapColors.ts?t=${bust}`);
    const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
    const { vanillaTileMapColor, vanillaWallMapColor } = await import(`/src/data/vanillaMapColors.ts?t=${bust}`);
    // vanilla 独立复核公式（Terraria.Map/MapHelper.cs:1812-1863 逐行重抄,不 import 本仓实现）
    const PAINT_RGB = { 24: [163, 116, 81], 10: [127, 66, 168], 12: [222, 153, 176], 5: [61, 112, 44], 7: [104, 167, 195] };
    const vMapColor = (base, ct) => {
      let n = base[0] / 255, n2 = base[1] / 255, n3 = base[2] / 255;
      if (n2 > n) { const t = n; n = n2; n2 = t; }
      if (n3 > n) { const t = n; n = n3; n3 = t; }
      const c = PAINT_RGB[ct] ?? [128, 128, 128];
      return [Math.round(c[0] * n), Math.round(c[1] * n), Math.round(c[2] * n)];
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
    const stats = {
      paintedCells: { dungeon: 0, temple: 0, pyramid: 0, other: 0 },   // 漆面格计数（修复前=双路径必差域）
      mismatch: { dungeon: 0, temple: 0, pyramid: 0, paintedOther: 0, unpainted: 0 }, // 修复后残差（期望全 0）
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
          stats.mismatch.unpainted++;   // 非漆面残差（期望 0——背景/幽灵/液体共享语义）
        }
        // vanilla 独立公式复核抽样（修复前预览该色=base 无漆;修复后应=minimap=vanilla）
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
    // 背景佐证：地狱底/remix 上表各取一格
    const hellY = Math.min(h - 1, Math.max(bg.underworld ?? 0, bg.underworld ? bg.underworld + 5 : 0));
    const bgProbe = {
      remixSky: bg.remix && bg.groundLevel > 0 ? hexOf24(mapColor24(st, 5, Math.max(0, bg.groundLevel - 5), bg)) : null,
      remixSkyMM: bg.remix && bg.groundLevel > 0 ? mm.colorFor(5, Math.max(0, bg.groundLevel - 5)) : null,
      hell: hellY > 0 ? hexOf24(mapColor24(st, 5, hellY, bg)) : null,
      hellMM: hellY > 0 ? mm.colorFor(5, hellY) : null,
    };
    return { world: { w, h, groundLevel: world.groundLevel, rockLevel: world.rockLevel, underworld: world.lavaLine, remix: bg.remix }, stats, vanillaChecks: vanillaChecks.slice(0, 40), bgProbe };
  }, BUST).catch((e) => ({ error: String(e).slice(0, 300) }));
  // M 大地图开屏截图（表现佐证）
  try {
    await page.keyboard.press('m');
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/shot-zenith-mmap.png` });
    await page.keyboard.press('Escape');
  } catch { /* 截图失败不阻断 */ }
  writeFileSync(`${OUT}/color-report.json`, JSON.stringify(colorReport, null, 2));
}

writeFileSync(`${OUT}/bg-report.json`, JSON.stringify(bgReport, null, 2));

// ───────────────────────── 汇总 ─────────────────────────
const sumForm = (e) => e && {
  samples: (e.samples ?? []).length,
  rot: (e.samples ?? []).slice(-3).map((s) => s.rot === null ? null : Math.round(s.rot * 1000) / 1000),
  scale: (e.samples ?? []).slice(-3).map((s) => s.scale === null ? null : Math.round(s.scale * 1000) / 1000),
  logoDaySrc: (e.samples ?? []).find((s) => s.logoDaySrc)?.logoDaySrc,
  nightOpacityMax: Math.max(0, ...(e.samples ?? []).map((s) => s.nightOpacity ?? 0)),
  starRate: (e.samples ?? []).slice(-3).map((s) => Math.round(s.starRate ?? 0)),
  cloudTypes: [...new Set((e.samples ?? []).flatMap((s) => s.dbg?.cloudTypes ?? []))].slice(0, 8),
  cloudTarget: (e.samples ?? []).slice(-3).map((s) => s.dbg?.cloudTarget),
  lockBG: (e.samples ?? []).slice(-1).map((s) => s.dbg?.lockBG)[0],
  camXDelta: (e.samples ?? []).slice(-1).map((s) => s.camXDelta)[0],
  interaction: e.interaction,
  error: e.error ?? null,
};
console.log('BG', JSON.stringify(Object.fromEntries(FORMS.map(({ key }) => [key, sumForm(bgReport.forms[key])])), null, 1));
if (colorReport) {
  console.log('COLOR', JSON.stringify({
    world: colorReport.world, stats: colorReport.stats,
    bgProbe: colorReport.bgProbe,
    vanillaOK: (colorReport.vanillaChecks ?? []).filter((v) => v.ok).length + '/' + (colorReport.vanillaChecks ?? []).length,
    previewOK: (colorReport.vanillaChecks ?? []).filter((v) => v.previewMatches).length + '/' + (colorReport.vanillaChecks ?? []).length,
    sample: (colorReport.vanillaChecks ?? [])[0] ?? null,
  }, null, 1));
}
console.log('ERRS', JSON.stringify(errs.slice(0, 6)));
await browser.close();
