// BJ211 补充聚焦探针：单只 541 / 661 近距快拍（120ms 间隔×4,免玩家交互噪声）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/bj211-probe';
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await b.newPage();
const errors = [];
page.on('pageerror', (e) => {
  const s = String(e && e.stack ? e.stack : e);
  if (!s.includes('prefetchInvProjectiles')) errors.push(s.slice(0, 200));
});
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ } });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1200));

for (const vid of [541, 661]) {
  const meta = await page.evaluate(async (vid) => {
    const g = window.__swGame;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const p = g.player;
    if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
    p.hp = p.maxHp;
    // 清掉上一轮残怪
    for (const en of g.enemies()) if (!en.dead) en.dead = true;
    g.renderer.atlas.ensureVImage('vanilla/NPC_' + vid + '.png');
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (g.renderer.atlas.ensureVImage('vanilla/NPC_' + vid + '.png')) break;
    }
    const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
    let floorY = py;
    for (let y = py; y < py + 40; y++) if (g.world.store.isSolid(px, y)) { floorY = y; break; }
    const e = Enemy.fromVanilla(vid, p.cx, (floorY - 4) * 16);
    e.id = g.entities.nextId++;
    try { e.def.damage = 0; } catch { /* noop */ }
    g.entities.add(e, 'enemies');
    return true;
  }, vid);
  for (let k = 1; k <= 4; k++) {
    await page.evaluate((vid) => {
      const g = window.__swGame;
      const p = g.player;
      for (const en of g.enemies()) {
        if (en.vanillaId === vid && !en.dead) {
          en.x = p.cx - en.w / 2; en.y = p.cy - 60 - en.h / 2;
          en.vx = 0; en.vy = 0;
          en.hp = en.maxHp;
          try { en.def.damage = 0; } catch { /* noop */ }
        }
      }
      if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
    }, vid);
    await new Promise((r) => setTimeout(r, 120));
    await page.screenshot({ path: `${OUT}/focus-${vid}-${k}.png` });
  }
}
fs.writeFileSync(OUT + '/focus-errors.json', JSON.stringify(errors));
console.log('done', errors.length);
await b.close();
