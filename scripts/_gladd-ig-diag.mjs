// ★itemGlow 空队列诊断（2026-10-14,面② 地表相位 empty=+3 定位）:
//   逐帧读 {门条件,队列长,掉落存活数,held 去重集,6978位消费者} ——区分
//   夹具蒸发(拾取)/收集位时序/门条件翻转三假设。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?gladd=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false; m.options.data.waveQuality = 0;
}));
await pump(page, 30);
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  // 钩 6978 位消费面:flushItemGlowGL 入口读队列
  const proto = Object.getPrototypeOf(r);
  window.__qprobe = [];
  const orig = proto.flushItemGlowGL;
  proto.flushItemGlowGL = function (...a) {
    window.__qprobe.push({
      qlen: this.itemGlowQueue.reduce((n, e) => n + e.ops.length, 0),
      qEntries: this.itemGlowQueue.length,
      gate: !!(r.constructor.gladd && r._c10eFrame && !r._c10eWorldToHud && !r._c10eComposited && r.swPipe?.screenStackMode),
      drops: g.entities?.drops?.length ?? -1,
    });
    return orig.apply(this, a);
  };
});
async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) await page.evaluate(() => {
    const g = window.__swGame;
    window.__vnow = (window.__vnow || performance.now()) + 16.6667;
    g.frame(window.__vnow);
  });
}
// 地表夹具复现
await page.evaluate((zz) => { window.__swGame.camera.setZoomTarget(zz); }, 1.0);
await page.evaluate(() => window.__pause(false));
await pump(page, 80);
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, (window.__swGame.world.groundLevel ?? 300) * 16 - 80); });
await pump(page, 20);
const fx = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const flow = window.__swFlow;
  const held = flow.itemByVid(46), drop = flow.itemByVid(2772);
  g.player.inv.slots[5] = { id: held, stack: 1 };
  g.player.inv.selected = 5;
  const px = g.player.x, py = g.player.y;
  const key = items.ITEM_DEFS[drop]?.key;
  const out = [];
  for (const [dx, dy, vy] of [[-80, -4, 0], [70, -6, 0], [-8, -60, 2]]) {
    const d = key ? g.spawnDrop(px + dx, py + dy, key, 1, 0, vy) : null;
    out.push(d ? { x: Math.round(d.x), y: Math.round(d.y), vy: d.vy ?? '?' } : null);
  }
  return { key, out };
});
console.log('fixture:', JSON.stringify(fx));
for (let i = 0; i < 10; i++) {
  await waitFrame(4);
  const s = await page.evaluate(() => ({
    probe: window.__qprobe.splice(0).slice(-4),
    drops: window.__swGame.entities?.drops?.length ?? -1,
    dropPos: (window.__swGame.entities?.drops ?? []).slice(0, 3).map((d) => `${Math.round(d.x)},${Math.round(d.y)}`),
    held: window.__swGame.player.inv.selected,
  }));
  console.log(`t${i}:`, JSON.stringify(s));
}
await browser.close();
console.log('DONE');
