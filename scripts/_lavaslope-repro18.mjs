// _lavaslope-repro18: 半砖浸润终极 A/B——水/岩浆 × 有墙/无墙 × LRU/R-only,
// + atlas 内 Liquid 贴图装载清单。全部格带 bringToFront 保证渲染活着。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) { booted = true; break; }
  }
}
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
await p.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
    && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 1500));
for (let i = 0; i < 10; i++) {
  const gone = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find(x => /我已知晓|已知晓|OK|知道了/.test(x.textContent || ''));
    if (ok) { ok.click(); return false; }
    return true;
  }).catch(() => true);
  if (gone) break;
  await new Promise(r => setTimeout(r, 400));
}
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.debugGod = true;
});
const rig = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  let gsurf = 0;
  for (let y = Math.max(5, sy - 80); y < st.h - 10; y++) if (st.isSolid(sx, y)) { gsurf = y; break; }
  const RY = w.groundLevel + 80;
  const X0 = sx + 6;
  for (let x = X0 - 4; x <= X0 + 40; x++)
    for (let y = RY - 5; y <= RY + 5; y++) { st.setTile(x, y, 0); st.wall[st.idx(x, y)] = 0; }
  const cells = [];
  let off = 0;
  const mk = (key, shape, lt, sides, keepWall) => {
    const x = X0 + off * 3, y = RY;
    off++;
    st.setTile(x, y, 1);
    st.wall[st.idx(x, y)] = keepWall ? 10 : 0;
    if (shape === 'hf') st.setHalfBrick(x, y, true); else st.setSlope(x, y, 1);
    for (const [dx, dy] of sides) { const j = st.idx(x + dx, y + dy); st.liquid[j] = 255; st.liquidType[j] = lt; }
    cells.push({ key, x, y, lt, wall: st.wall[st.idx(x, y)] });
  };
  const LRU = [[-1, 0], [1, 0], [0, -1]], Ronly = [[1, 0]];
  mk('water-hf-LRU-nowall', 'hf', 1, LRU, false);
  mk('water-hf-R-nowall', 'hf', 1, Ronly, false);
  mk('lava-hf-LRU-nowall', 'hf', 2, LRU, false);
  mk('lava-hf-LRU-wall', 'hf', 2, LRU, true);
  mk('lava-s1-R-nowall', 's1', 2, Ronly, false);
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X0 + 6) * 16 - pl.w / 2; pl.y = (RY - 3) * 16;
  pl.vx = 0; pl.vy = 0;
  return { X0, RY, gl: w.groundLevel, cells, waterStyle: g.world.waterStyle ?? g.renderer.waterStyle };
});
console.log('rig:', JSON.stringify(rig));
await p.bringToFront();
await new Promise(r => setTimeout(r, 2500));
await p.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__origDrawImage) {
    proto.__origDrawImage = proto.drawImage;
    window.__liqCalls = [];
    proto.drawImage = function (img, ...rest) {
      try {
        if (rest.length >= 8) {
          const src = img ? (img.src ? String(img.src).split('/').pop() : `bmp${img.width}x${img.height}`) : 'null';
          window.__liqCalls.push({ src, a: rest.slice(0, 8).map(v => Math.round(v * 10) / 10) });
        }
      } catch (e) { /* ignore */ }
      return proto.__origDrawImage.call(this, img, ...rest);
    };
  }
  window.__liqCalls.length = 0;
});
await new Promise(r => setTimeout(r, 500));
const calls = await p.evaluate(() => window.__liqCalls);
console.log('总调用:', calls.length);
for (const c of rig.cells) {
  const near = calls.filter(cl => Math.abs(cl.a[4] - c.x * 16) < 30 && Math.abs(cl.a[5] - c.y * 16) < 40);
  console.log(`${c.key} (${c.x},${c.y}) wall=${c.wall}: ${near.length} 次调用`, near.slice(0, 3).map(n => `${n.src}@${n.a[0]},${n.a[1]}→${n.a[4]},${n.a[5]}`).join(' | '));
}
const atlasInfo = await p.evaluate(() => {
  const a = window.__swGame.renderer.atlas;
  const keys = [...a.vimages.keys()].filter(k => /Liquid|Misc_water|LiquidSlope/.test(k));
  return { liquidKeys: keys, waterStyle: a.waterStyle ?? null };
});
console.log('atlas 已装载:', JSON.stringify(atlasInfo));
await b.close();
process.exit(0);
