import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync('/Users/vinlic/Downloads/debug-report-氙奇葩-2026-08-25T04-00-25-182Z.json', 'utf8'));
const area = report.tiles.areaCamera;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5231', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async (dump) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const bySheet = new Map();
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const sh = TILE_DEFS[id]?.vanilla?.sheet;
    if (sh !== undefined && !bySheet.has(sh)) bySheet.set(sh, id);
  }
  const decodeRow = (s) => {
    const cells = [];
    for (const seg of s.split(';')) {
      if (seg.includes('*')) { const parts = seg.split('*'); for (let i = 0; i < +parts[1]; i++) cells.push(parts[0]); }
      else cells.push(seg);
    }
    return cells;
  };
  for (let ty = dump.y0; ty < dump.y0 + dump.h; ty++) {
    const cells = decodeRow(dump.rows[ty - dump.y0]);
    for (let tx = dump.x0; tx < dump.x0 + dump.w; tx++) {
      const c = cells[tx - dump.x0];
      if (c === undefined) continue;
      const f = c.split(':').map(Number);
      const i = st.idx(tx, ty);
      st.flags[i] = 0; st.type[i] = 0; st.slope[i] = 0; st.half[i] = 0;
      st.wall[i] = f[3] || 0; st.liquid[i] = f[4] || 0;
      if (f[0] > 0) { const id = bySheet.get(f[0]); if (id !== undefined) { st.flags[i] = 1; st.type[i] = id; } }
    }
  }
  g.paused = true;
  g.player.x = 2076 * 16; g.player.y = 231 * 16 - 60; g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.0;
  const e = Enemy.fromVanilla(3, 33408, 3808);
  e.x = 33408; e.y = 3808; e.vx = 0; e.vy = 0;
  g.entities.add(e, 'enemies');
  const rows = [];
  for (let t = 0; t < 10; t++) {
    g.fixedUpdate(1 / 60);
    const buffs = e.buffs && e.buffs.active ? [...e.buffs.active.keys()].join(',') : 'none';
    rows.push(`t${t}: x=${e.x.toFixed(2)} y=${e.y.toFixed(2)} v=(${e.vx.toFixed(2)},${e.vy.toFixed(2)}) onG=${e.onGround ? 1 : 0} hitWall=${e.hitWall ? 1 : 0} face=${e.facing} ai3=${Math.round(e.ai3)} frozen=${e.frozen ? 1 : 0} buffs=${buffs} netPuppet=${e.netPuppet ? 1 : 0} tileCollide=${e.tileCollide}`);
  }
  return rows;
}, area);
console.log(out.join('\n'));
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
