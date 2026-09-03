// _lavaslope-repro15: monkey-patch drawImage 计数——半砖格 (2101,411) 位置是否真的有
// Liquid_1/Liquid_0 贴图的 drawImage 调用;以及该格最终像素。对照 slope 格 (2107,411)。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
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
const rig = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  let gsurf = 0;
  for (let y = Math.max(5, sy - 80); y < st.h - 10; y++) if (st.isSolid(sx, y)) { gsurf = y; break; }
  const RY = w.groundLevel + 80;
  const X0 = sx + 6;
  for (let x = X0 - 4; x <= X0 + 30; x++)
    for (let y = RY - 5; y <= RY + 5; y++) st.setTile(x, y, 0);
  const mk = (key, tile, shape, lt, off, clearWall) => {
    const x = X0 + off * 3, y = RY;
    st.setTile(x, y, tile);
    if (clearWall) st.wall[st.idx(x, y)] = 0;
    if (shape === 'hf') st.setHalfBrick(x, y, true); else st.setSlope(x, y, shape === 's1' ? 1 : 2);
    const sides = off === 0 || off === 1 ? [[-1, 0], [1, 0], [0, -1]] : [[1, 0]];
    for (const [dx, dy] of sides) { const j = st.idx(x + dx, y + dy); st.liquid[j] = 255; st.liquidType[j] = lt; }
    return { key, x, y, lt, wall: st.wall[st.idx(x, y)] };
  };
  const cells = [
    mk('hf-LRU-lava-有墙', 1, 'hf', 2, 0, false),
    mk('hf-LRU-lava-无墙', 1, 'hf', 2, 1, true),
    mk('hf-LRU-water-无墙', 1, 'hf', 1, 2, true),
    mk('s1-R-lava-无墙', 1, 's1', 2, 3, true),
  ];
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X0 + 4) * 16 - pl.w / 2; pl.y = (RY - 3) * 16;
  pl.vx = 0; pl.vy = 0;
  return { X0, RY, gl: w.groundLevel, cells };
});
console.log('rig:', JSON.stringify(rig));
await p.bringToFront();
await new Promise(r => setTimeout(r, 2000));

// 挂计数器:统计一帧内 Liquid_*/Misc_water_* 源的 drawImage,记录目标矩形
await p.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__origDrawImage) {
    proto.__origDrawImage = proto.drawImage;
    window.__liqCalls = [];
    proto.drawImage = function (img, ...rest) {
      try {
        // 记录全部 drawImage(源类型+尺寸指纹);测试格过滤在读取侧做
        const src = img ? (img.src ? String(img.src).split('/').pop()
          : `bmp${img.width}x${img.height}`) : 'null';
        if (rest.length >= 8) {
          window.__liqCalls.push({ src, a: rest.slice(0, 8).map(v => Math.round(v * 10) / 10) });
        }
      } catch (e) { /* ignore */ }
      return proto.__origDrawImage.call(this, img, ...rest);
    };
  }
  window.__liqCalls.length = 0;
});
await new Promise(r => setTimeout(r, 300));
const calls = await p.evaluate(() => window.__liqCalls.slice(0, 400));
console.log('liquid drawImage 调用数(300ms 窗口):', calls.length);
const bySrc = {};
for (const c of calls) bySrc[c.src] = (bySrc[c.src] || 0) + 1;
console.log('按源:', JSON.stringify(bySrc));
const rigX = rig.X0, rigY = rig.RY;
// 过滤落在三个测试格附近的调用(世界像素 ±24)
for (const c of rig.cells) {
  const near = calls.filter(cl => {
    const rest = cl.a;
    const dx = rest[4], dy = rest[5];   // drawImage(img, sx,sy,sw,sh, dx,dy,dw,dh)
    return Math.abs(dx - c.x * 16) < 40 && Math.abs(dy - c.y * 16) < 40;
  });
  console.log(`cell ${c.key} (${c.x},${c.y}): 近旁调用 ${near.length}`);
  for (const n of near.slice(0, 6)) console.log('   ', JSON.stringify(n));
}
await b.close();
process.exit(0);
