// ★BJ606-R2 真机探针：闪电光环哨兵攻击产物普查（尘 226/光带/伤害）+截图。
// 运行: SW_PORT=5210 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5210 nohup npx vite &
//   SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs --timeout=600000 scripts/_bj606-zap-visual.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
console.log('createGame:', !!gen?.ok, gen?.why ?? '');

// 找玩家附近平地 → 放塔 → 场内放僵尸 → 泵 120 拍
const spot = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gx = px, groundY = -1;
  for (let dx = 0; dx < 40 && groundY < 0; dx++) {
    for (const x of [px + dx, px - dx]) {
      for (let y = Math.floor(g.player.cy / 16); y < Math.floor(g.player.cy / 16) + 60; y++) {
        if (st.inBounds(x, y) && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
          gx = x; groundY = y; break;
        }
      }
      if (groundY >= 0) break;
    }
  }
  if (groundY < 0) return { why: 'no-ground' };
  const cxw = gx * 16 + 8, cyw = groundY * 16;   // 地面接触点
  const m = new MinionProj(gx * 16, cyw - 16 - 8, 688, 34, 0, true, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  const z = g.spawnEnemy('zombie', cxw + 20, cyw - 40);
  return { gx, groundY, tower: m.id ?? -1, zombie: !!z, cxw, cyw };
});
console.log('spot:', JSON.stringify(spot));
if (spot?.why) { console.log('ABORT'); process.exit(2); }

// 相机对准塔
await page.evaluate((s) => {
  const g = window.__swGame;
  g.camera.x = s.cxw - 400; g.camera.y = s.cyw - 260;
}, spot);

await pump(page, 150, { step: 30 });
const census = await page.evaluate((s) => {
  const g = window.__swGame;
  const d226 = [];
  const pool = g.vanillaDust?.pool ?? [];
  for (const d of pool) if (d.active && d.type === 226) d226.push([Math.round(d.x), Math.round(d.y)]);
  const m = g.entities.projectiles.find((e) => e.projId === 688 && !e.dead);
  const ltx = Math.floor(s.cxw / 16), lty = Math.floor(s.cyw / 16);
  const light = g.lighting?.lightAt?.(ltx, lty - 3) ?? null;
  const z = g.enemies?.()[0];
  return {
    d226: d226.length, d226Sample: d226.slice(0, 6),
    tower: m ? { x: m.x, y: m.y, w: m.w, h: m.h } : null,
    lightAtField: light,
    zombieHp: z ? z.hp ?? z.hpMax ?? '?' : 'gone',
    enemies: g.enemies().length,
  };
}, spot);
console.log('census:', JSON.stringify(census));
await page.screenshot({ path: '/tmp/bj606-zap-day.png' });
// 夜版（关时钟到午夜）
try {
  const { freezeClock } = await import('../tools/probe/lib/clock.mjs');
  await freezeClock(page, { tod: 0.0 });
  await pump(page, 60, { step: 30 });
  const night = await page.evaluate((s) => {
    const g = window.__swGame;
    const d226 = [];
    for (const d of (g.vanillaDust?.pool ?? [])) if (d.active && d.type === 226) d226.push(1);
    const ltx = Math.floor(s.cxw / 16), lty = Math.floor(s.cyw / 16);
    return { d226: d226.length, lightAtField: g.lighting?.lightAt?.(ltx, lty - 3) ?? null };
  }, spot);
  console.log('night:', JSON.stringify(night));
  await page.screenshot({ path: '/tmp/bj606-zap-night.png' });
} catch (e) { console.log('night-arm skip:', String(e).slice(0, 120)); }
console.log('pageErrors:', errs.length, errs.slice(0, 3));
await browser.close();
