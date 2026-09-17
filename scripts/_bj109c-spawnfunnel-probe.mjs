// BJ109-C 追加探针:四柱塔 Zone 自然刷怪漏斗实录(lunar ctx / spawnAnNPC 返回值)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN + '/?play=small&bj109cf' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1200));

const placed = await page.evaluate(() => {
  const g = window.__swGame;
  g.triggerLunarApocalypse();
  return true;
});
await new Promise((r) => setTimeout(r, 2000));
const geo = await page.evaluate(() => {
  const g = window.__swGame;
  const vs = g.vanillaSpawner ?? (g.vanillaSpawner = g.makeVanillaSpawner(g.world));
  window.__funnel = { anNpc: 0, returned: [], spawn: 0, trySpawn: 0 };
  const gp = Object.getPrototypeOf(g);
  if (gp.trySpawnEnemy && !gp.__bj109cW) {
    gp.__bj109cW = true;
    const ot = gp.trySpawnEnemy;
    gp.trySpawnEnemy = function () { window.__funnel.trySpawn++; return ot.apply(this, arguments); };
  }
  if (!vs.__bj109cW) {
    vs.__bj109cW = true;
    const os = vs.spawn.bind(vs);
    vs.spawn = function (px, py, rng, vw, vh) { window.__funnel.spawn++; return os(px, py, rng, vw, vh); };
    const oa = vs.spawnAnNPC.bind(vs);
    vs.spawnAnNPC = function (rng) {
      window.__funnel.anNpc++;
      const r = oa(rng);
      window.__funnel.returned.push(r ? (r.vanillaId ?? -1) : null);
      return r;
    };
  }
  const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 517);
  const st = g.world.store;
  if (!t) return { tower: null };
  const tcol = Math.floor(t.cx / 16);
  for (let dx = 0; dx <= 8; dx++) {
    for (const x of [tcol + dx, tcol - dx]) {
      for (let y = Math.floor(t.cy / 16); y < st.h - 40; y++) {
        if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
          g.player.x = x * 16 - g.player.w / 2;
          g.player.y = (y - 3) * 16 - g.player.h;
          g.player.vy = 0;
          return { tower: tcol, px: x, py: y - 3, towerCy: Math.round(t.cy / 16) };
        }
      }
    }
  }
  return { tower: tcol, placed: false };
});
console.log('漏斗落位:', JSON.stringify(geo));
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await page.evaluate(() => {
    const g = window.__swGame;
    const f = window.__funnel;
    const IDS = [402, 405, 406, 407, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 428, 429, 516, 518, 519];
    const minions = {};
    for (const e of g.entities.enemies) {
      if (e.dead || e.vanillaId == null) continue;
      if (IDS.includes(e.vanillaId)) minions[e.vanillaId] = (minions[e.vanillaId] ?? 0) + 1;
    }
    return { trySpawn: f.trySpawn, spawn: f.spawn, anNpc: f.anNpc, lastReturned: f.returned.slice(-6), minions,
      enemiesTotal: g.entities.enemies.filter((e) => !e.dead).length };
  });
  console.log('A-' + (i + 1), JSON.stringify(s));
}
console.log('errors:', errors.slice(0, 3));
await browser.close();
