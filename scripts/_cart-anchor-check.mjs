/**
 * 矿车车身锚 Y 交叉校验（模型外推验证，不动刀）：
 * vanilla 净式（PlayerDrawSet.cs:429-430 PlayerOffset 预减 × Mount.Draw num2 相消）
 *   = mountedCenter + yOffset = feetY − 26 + 13 = feetY − 13；
 * 本仓矿车支（Renderer 矿车车身块）= p.y(=cart top) + cart.h/2 + 13 + 8 = feetY − 5。
 * 手段 = patch drawImage 捕 Mount_Minecart 行（50×38）dest y（世界系实参）。
 * 运行：SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_cart-anchor-check.mjs
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, godMode, clearEnemies, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
mkdirSync(process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_cart-anchor', { recursive: true });

const browser = await launchBrowser();
const page = await openPage(browser, { errors: L.fails });
page.__probeOrigin = process.env.SW_ORIGIN;
const boot = await bootstrap(page, process.env.SW_ORIGIN);
L.chk('bootstrap', boot.ok, boot.why ?? '');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('createGame', gen.ok, gen.why ?? '');
await godMode(page, true);
await clearEnemies(page);
await pump(page, 30, { clearEnemies: true });

const prep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  const surf = Math.ceil(g.world.groundLevel);
  for (let x = px - 40; x <= px + 40; x++) {
    for (let y = surf - 8; y <= surf + 2; y++) st.setTile(x, y, 0);
    for (let y = surf; y <= surf + 1; y++) st.setTile(x, y, 1);
    st.setLiquid(x, surf - 1, 0, 0);
  }
  for (let x = px - 20; x <= px + 20; x++) st.setTile(x, surf - 1, 314);  // 轨道
  g.player.x = px * 16; g.player.y = (surf - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  return { px, surf };
});
await pump(page, 20, { clearEnemies: true });
L.say(`prep @ tile(${prep.px}, surf=${prep.surf}, track y=${prep.surf - 1})`);

await page.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__cartPatched) return;
  proto.__cartPatched = true;
  const oDraw = proto.drawImage;
  window.__cart = [];
  proto.drawImage = function (img, sx, sy, sw, sh, dx, dy) {
    try {
      if (sw === 50 && sh === 34) {
        const g = window.__swGame, p = g && g.player;
        if (p && p.ridingCart && p.cart) {
          window.__cart.push({ anchorY: +(dy + sh / 2).toFixed(2), feetY: +(p.y + p.h).toFixed(2) });
        }
      }
    } catch {}
    return oDraw.apply(this, arguments);
  };
});

const ride = await page.evaluate((px, trackY) => {
  const g = window.__swGame;
  return g.mountMinecartAt(px - 5, trackY, -1);
}, prep.px, prep.surf - 1);
L.say(`tryQuickMinecart → ${ride}`);
await pump(page, 40, { clearEnemies: true });
const st = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { ridingCart: p.ridingCart, onTrack: p.cart?.onTrackNow, h: p.cart?.h };
});
L.chk('矿车骑乘态', st.ridingCart === true, JSON.stringify(st));

const draws = await page.evaluate(() => window.__cart.slice(0, 10));
L.say(`cart draws n=${draws.length}`);
if (draws.length) {
  const dys = [...new Set(draws.map((d) => +(d.anchorY - d.feetY).toFixed(1)))];
  L.say(`锚Y−feetY 实测 = [${dys.join(',')}]（vanilla 净式=−13；本仓现行公式=−5）`);
  const { screenshot } = await import('../tools/probe/lib/index.mjs');
  await screenshot(page, 'cart-anchor-eyeball', { time: 'day', wx: prep.px * 16, wy: prep.surf * 16 - 40, w: 40, h: 26, zoom: 4 });
}

console.log('\n==== done (测量性探针,无判门) ====');
