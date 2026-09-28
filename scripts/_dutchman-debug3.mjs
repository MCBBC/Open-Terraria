// 491 渲染缺失取证第 3 刀:drawEnemy 每帧 vanillaId 分布 + drawDutchman 内部早退点。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'dutchman-frames');
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);
const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });
await spawnEnemy(page, 491, ppos.x - 430, ppos.y + 20);
await pump(page, 8);

const dbg = await page.evaluate(() => {
  const g = window.__swGame;
  const R = Object.getPrototypeOf(g.renderer);
  if (!window.__dd3) {
    window.__dd3 = { drawEnemy: 0, dutch: 0, ids: {}, hullNull: 0, exNull: 0 };
    const oe = R.drawEnemy;
    R.drawEnemy = function (e, w, ents) {
      window.__dd3.drawEnemy++;
      const id = e?.vanillaId ?? 'null';
      window.__dd3.ids[id] = (window.__dd3.ids[id] ?? 0) + 1;
      if (id === 491) {
        const hull = this.atlas?.ensureVImage('vanilla/NPC_491.png');
        if (!hull || !hull.width) window.__dd3.hullNull++;
      }
      return oe.call(this, e, w, ents);
    };
    const od = R.drawDutchman;
    R.drawDutchman = function (...a) { window.__dd3.dutch++; return od.apply(this, a); };
  }
  return { installed: true, shipX: (g.entities.enemies ?? []).find((e) => e.vanillaId === 491)?.cx ?? null };
});
await pump(page, 30);
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const ship = (g.entities.enemies ?? []).find((e) => e.vanillaId === 491);
  return {
    ...window.__dd3,
    shipAlive: !!ship && !ship.dead,
    shipSpawnAlpha: ship?.spawnAlpha,
    shipCx: ship?.cx, shipCy: ship?.cy,
    cam: { x: g.camera.x, y: g.camera.y },
    enemiesTotal: (g.entities.enemies ?? []).length,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
