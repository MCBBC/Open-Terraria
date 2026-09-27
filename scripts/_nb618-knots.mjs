// ★Ring3 定点取证：单发慢速段 → 对每个在场 618 的 world→screen 定点截图裁剪。
// 判据：618 的可见体=AI 尘 86 节（原版弹体贴图 α≡255 隐身,GetAlpha 缺省路径 A=0）。
// 运行：SW_ORIGIN=http://localhost:5238 node tools/run-diag.mjs scripts/_nb618-knots.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1800, height: 900 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[knots] pageerror', String(e.message).slice(0, 160)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5238', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('nb618knots', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  let col0 = -1, gy = -1;
  for (let c = 100; c < st.w - 200; c++) {
    let y0 = -1;
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c, y)) { y0 = y; break; } }
    if (y0 < 0) continue;
    let flat = true;
    for (let k = 1; k <= 24; k++) {
      let yy = -1;
      for (let y = Math.max(1, y0 - 3); y < y0 + 4; y++) { if (st.isSolid(c + k, y)) { yy = y; break; } }
      if (yy !== y0) { flat = false; break; }
    }
    if (flat) { col0 = c; gy = y0; break; }
  }
  if (col0 < 0) return { fail: 'no-flat-ground' };
  p.x = col0 * 16; p.y = gy * 16 - p.h; p.vx = 0; p.vy = 0;
  g.world.clock.timeOfDay = 0.85;
  p.baseMaxMana = 999; p.mana = 999;
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  return { col0, gy };
});
console.log('[knots] setup', JSON.stringify(setup));
if (setup.fail) { await browser.close(); process.exit(1); }

// 单发平射 → 等 ~1.9s（首枚 618 已出生且球尚在屏内 ~700px 处）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const aimX = p.cx + 240, aimY = p.cy - 6;
  const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
});
for (const [t, name] of [[1900, 'k1'], [2600, 'k2'], [3300, 'k3']]) {
  await new Promise((r) => setTimeout(r, name === 'k1' ? t : 700));
  const snap = await page.evaluate((name) => {
    const g = window.__swGame;
    const w2s = (wx, wy) => g.camera.worldToScreen(wx, wy);
    const orbs = g.entities.projectiles.filter((q) => q.projId === 617 && !q.dead);
    const subs = g.entities.projectiles.filter((q) => q.projId === 618 && !q.dead);
    const dust86 = [];
    for (const d of g.vanillaDust?.pool ?? []) {
      if (!d?.active || d.type !== 86) continue;
      const [sx, sy] = w2s(d.x, d.y);
      if (sx > 0 && sx < 1800 && sy > 0 && sy < 900) dust86.push([Math.round(sx), Math.round(sy), +Number(d.scale).toFixed(1)]);
    }
    return {
      name,
      orb: orbs[0] ? { s: w2s(orbs[0].cx, orbs[0].cy).map(Math.round), sp: +Math.hypot(orbs[0].vx, orbs[0].vy).toFixed(1), a: orbs[0].alpha, scale: +orbs[0].drawScale.toFixed(2) } : null,
      subs: subs.map((q) => ({ s: w2s(q.cx, q.cy).map(Math.round), w: worldXY(q) })),
      dust86n: dust86.length, dust86: dust86.slice(0, 60),
      // ★随动定量：屏内 d86 → 最近弹（617|618）世界距离分布（修复后应收紧）
      cohesion: (() => {
        const projs = [...orbs, ...subs];
        if (!projs.length) return null;
        const ds = [];
        for (const d of g.vanillaDust?.pool ?? []) {
          if (!d?.active || d.type !== 86) continue;
          let best = 1e9;
          for (const q of projs) {
            const dd = Math.hypot(d.x - q.cx, d.y - q.cy);
            if (dd < best) best = dd;
          }
          ds.push(best);
        }
        if (!ds.length) return null;
        ds.sort((a, b) => a - b);
        return { n: ds.length, med: Math.round(ds[Math.floor(ds.length / 2)]), p90: Math.round(ds[Math.floor(ds.length * 0.9)]), max: Math.round(ds[ds.length - 1]) };
      })(),
    };
    function worldXY(q) { return [Math.round(q.cx), Math.round(q.cy)]; }
  }, name);
  console.log(`[knots] ${name}`, JSON.stringify(snap));
  await page.screenshot({ path: `/tmp/nb618-${name}.png` });
}
console.log('[knots] saved /tmp/nb618-k1..3.png');
await browser.close().catch(() => {});
process.exit(0);
