// BGM 群系诊断：逐列统计 腐化/丛林 tile 计数（SceneMetrics 窗口），看腐化区是否丛林计数≥140 而邪恶<300
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const s2i = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !s2i.has(d.vanilla.sheet)) s2i.set(d.vanilla.sheet, i); });
  const ids = (arr) => arr.map((n) => s2i.get(n)).filter((v) => v != null);
  const EVIL = ids([23, 661, 24, 25, 32, 112, 163, 400, 398]);
  const JUNGLE = ids([60, 61, 62, 74, 226, 225]);
  const st = g.world.store;
  const w = st.w, h = st.h;
  const gl = Math.floor(g.world.groundLevel);
  const rock = Math.floor(g.world.rockLevel);
  const setEvil = new Set(EVIL), setJun = new Set(JUNGLE);

  // 逐列窗口统计（地表窗口 gl±62，地下窗口 rock±62）
  function countWin(cx, cy) {
    let e = 0, j = 0;
    const x0 = Math.max(0, cx - 84), x1 = Math.min(w - 1, cx + 84);
    const y0 = Math.max(0, cy - 62), y1 = Math.min(h - 1, cy + 62);
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        if (!st.flags[i]) continue;
        const t = st.type[i];
        if (setEvil.has(t)) e++;
        else if (setJun.has(t)) j++;
      }
    }
    return { e, j };
  }
  const surf = [], deep = [];
  for (let cx = 120; cx < w - 120; cx += 80) {
    surf.push({ x: cx, ...countWin(cx, gl) });
    deep.push({ x: cx, ...countWin(cx, rock) });
  }
  // 逐 tile 细分：在“腐化区(jungle≥140)”的窗口里，jungle 计数都来自哪些 tile
  const suspicious = surf.filter((s) => s.j >= 140 && s.e < 300);
  const detail = [];
  for (const s of suspicious.slice(0, 3)) {
    const per = {};
    const x0 = Math.max(0, s.x - 84), x1 = Math.min(w - 1, s.x + 84);
    const y0 = Math.max(0, gl - 62), y1 = Math.min(h - 1, gl + 62);
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        if (!st.flags[i]) continue;
        const t = st.type[i];
        if (setJun.has(t)) {
          const key = TILE_DEFS[t]?.key ?? String(t);
          per[key] = (per[key] ?? 0) + 1;
        }
      }
    }
    detail.push({ x: s.x, e: s.e, j: s.j, per });
  }
  return {
    world: { w, h, gl, rock, name: g.world.name },
    surfRanges: {
      corrupt: surf.filter((s) => s.e >= 300).map((s) => s.x),
      jungle: surf.filter((s) => s.j >= 140).map((s) => s.x),
      both: surf.filter((s) => s.e >= 300 && s.j >= 140).map((s) => s.x),
      jungleOnly: suspicious.map((s) => ({ x: s.x, e: s.e, j: s.j })),
    },
    detail,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
