// BJ433 猫存活轨迹诊断：召唤后 30s 每拍采样猫状态/位置/被杀原因
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1200));
const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  g.setupDevMode();
  const items = window.__swItems;
  const cattivaKey = Object.keys(items).find((k) => /^vi_5663_/.test(k));
  const inv = g.player.inv;
  inv.slots[3] = { id: items[cattivaKey], stack: 1 };
  inv.selected = 3;
  const p = g.player;
  window.__pin = setInterval(() => { p.vx = 0; p.vy = 0; }, 200);
  return { ok: true };
});
console.log('[prep]', JSON.stringify(prep));
const cvBox = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.move(cvBox.x + cvBox.w / 2, cvBox.y + cvBox.h / 2);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 700));
await page.mouse.up();
const trace = await page.evaluate(async () => {
  const { BuffType } = await import('/src/stats/Buffs.ts');
  const seen = [];
  const g = window.__swGame;
  const t0 = performance.now();
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      const cats = g.entities.projectiles.filter((p) => p.projId === 1093);
      const p = g.player;
      seen.push({
        t: Math.round((performance.now() - t0) / 100) / 10,
        n: cats.length,
        cats: cats.map((c) => ({ dead: c.dead, a0: c.palA0, x: Math.round(c.cx), y: Math.round(c.cy) })),
        px: Math.round(p.cx),
        buffSec: p.buffs.active.get(BuffType.PalworldMinionCattiva) ?? null,
      });
      if (performance.now() - t0 > 15000) { clearInterval(iv); resolve(seen); }
    }, 500);
  });
});
console.log(trace.map((s) => JSON.stringify(s)).join('\n'));
await page.evaluate(() => clearInterval(window.__pin));
await browser.close();
