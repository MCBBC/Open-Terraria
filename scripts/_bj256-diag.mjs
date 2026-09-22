// ★BJ256 诊断:为什么 dangerNear=false
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1200);
const diag = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { canHitPoint } = await import('/src/physics/TileCollision.ts').catch(() => ({}));
  const st = g.world.store;
  const TILE = 16;
  const groundY = (px) => { const tx = Math.floor(px / TILE); for (let ty = 0; ty < st.h; ty++) { if (st.isSolid(tx, ty)) return ty * TILE; } return null; };
  const px0 = g.player.x + 40;
  const gy = groundY(px0);
  const dryad = new TownNPC('dryad', px0, gy - 56);
  g.entities.add(dryad, 'npcs');
  const z = Enemy.fromVanilla(3, px0 + 200, gy - 48);
  g.entities.add(z, 'enemies');
  z.x = px0 + 200; z.y = gy - 48;
  g.player.x = px0 - 40; g.player.y = gy - 24;
  await new Promise((r) => setTimeout(r, 1500));
  const enemies = g.enemies();
  const eList = enemies.map((e) => ({ vid: e.vanillaId, dmg: e.damage, defDmg: e.def?.damage,
    d: Math.round(Math.hypot(e.cx - dryad.cx, e.cy - dryad.cy)), dead: e.dead }));
  let los = null;
  try {
    const { canHitPoint: chp } = await import('/src/physics/TileCollision.ts');
    los = chp(st, dryad.cx, dryad.cy, z.cx, z.cy);
  } catch (err) { los = 'ERR:' + String(err).slice(0, 80); }
  return {
    enemiesCount: enemies.length, eList,
    dangerNear: dryad.dangerNear, threatRaw: dryad.threatRaw, admitWide: dryad.admitWide,
    onGround: dryad.onGround, los,
    dryadCx: Math.round(dryad.cx), dryadCy: Math.round(dryad.cy), zCx: Math.round(z.cx), zCy: Math.round(z.cy),
  };
});
console.log(JSON.stringify(diag, null, 1));
await b.close();
process.exit(0);
