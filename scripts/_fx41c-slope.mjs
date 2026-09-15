// _fx41c-slope: 斜面浸润盲区构造探针(FX41c,精简版——纯构造台,不载用户存档)。
// 构型 = 用户实报标记格邻接 1:1:
//   slope2 格(mark1-5 型): T slope2, W=液255/N=液255, E/S=T 整砖, wall=0
//   slope1 格(mark6-7 型): T slope1, E=液255/N=液255, W/S=T 整砖, wall=0
// 类型普查定位"缺失类型清单"。断言器 = drawImage 源指纹(世界坐标匹配格矩形):
//   slope 表(72x16=LiquidSlope_N) / 平面 Liquid(h%80==0 且 w∈{16,80})。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5242';
const TYPES = [
  'stone', 'dirt', 'wood',
  'v_152_ebonstone_brick', 'v_273_stone_slab', 'v_118_pearlstone_brick',
  'v_274_sandstone_slab', 'v_369_smooth_granite_block', 'v_41_blue_brick', 'v_229_honey_block',
];
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=IntensiveWakeUpThrottling'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 180000 });
console.log('[t] flow ready, createWorldProbe(1200x400)');
await p.evaluate(() => window.__swFlow.createWorldProbe({ seed: 'fx41c', w: 1200, h: 400 }));
await p.waitForFunction(() => !!globalThis.__swGame?.world?.store?.w, { timeout: 240000 });
console.log('[t] world up');
// 冻结液体+环境
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0; g.world.weather.maxRaining = 0; }
  g.player.debugGod = true;
  g.player.hp = g.player.maxHp; g.player.dead = false;
});
// 构造实验台
const bench = await p.evaluate((types) => {
  const g = window.__swGame, st = g.world.store;
  const tid = (k) => window.__swTileByKey(k);
  const cells = [];
  const COLS = 4; // [lava-s2, water-s2, lava-s1, water-s1]
  const CW = 6, CH = 5, GAP = 2;
  const pl = g.player;
  const px0 = Math.floor((pl.x + pl.w / 2) / 16), py0 = Math.floor((pl.y + pl.h / 2) / 16);
  const x0 = px0 - Math.floor((COLS * (CW + GAP)) / 2);
  const y0 = py0 - 8 - types.length * (CH + GAP);
  for (let x = x0 - 3; x < x0 + COLS * (CW + GAP) + 3; x++) {
    for (let y = y0 - 3; y < y0 + types.length * (CH + GAP) + 3; y++) {
      if (!st.inBounds(x, y)) continue;
      st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); st.setWallSilent(x, y, 0);
      st.setSlope(x, y, 0); st.half[st.idx(x, y)] = 0;
    }
  }
  types.forEach((key, r) => {
    const T = tid(key);
    if (!T || T < 0) { cells.push({ key, err: 'badkey' }); return; }
    for (let c = 0; c < COLS; c++) {
      const lt = c < 2 ? 2 : 1;                 // store 编码 2=岩浆 1=水
      const slope = c % 2 === 0 ? 2 : 1;        // 0,2 列 slope2;1,3 列 slope1
      const cx = x0 + c * (CW + GAP) + 3;
      const cy = y0 + r * (CH + GAP) + 3;
      const poolXs = slope === 2 ? [cx - 3, cx - 2, cx - 1] : [cx + 1, cx + 2, cx + 3];
      for (const qx of poolXs) {
        st.setTileSilent(qx, cy - 1, 0); st.setLiquid(qx, cy - 1, 255, lt);
        st.setTileSilent(qx, cy, 0); st.setLiquid(qx, cy, 255, lt);
        st.setTileSilent(qx, cy + 1, T); st.setLiquid(qx, cy + 1, 0, 0);
      }
      st.setTileSilent(cx, cy, T); st.setLiquid(cx, cy, 0, 0); st.setSlope(cx, cy, slope);
      const solids = slope === 2
        ? [[cx + 1, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1], [cx - 3, cy - 2], [cx - 2, cy - 2], [cx - 1, cy - 2], [cx, cy - 2]]
        : [[cx - 1, cy - 1], [cx - 1, cy], [cx, cy + 1], [cx - 1, cy + 1], [cx + 3, cy - 2], [cx + 2, cy - 2], [cx + 1, cy - 2], [cx, cy - 2]];
      for (const [sx, sy] of solids) { st.setTileSilent(sx, sy, T); st.setLiquid(sx, sy, 0, 0); st.setSlope(sx, sy, 0); }
      st.setTileSilent(cx, cy - 1, 0); st.setLiquid(cx, cy - 1, 255, lt);
      const i = st.idx(cx, cy);
      cells.push({
        key, slope, lt, cx, cy,
        slopeStored: st.slope[i], tStored: st.type[i], lq: st.liquid[i], wall: st.wall[i],
        W: { t: st.type[st.idx(cx - 1, cy)], lq: st.liquid[st.idx(cx - 1, cy)], lt: st.liquidType[st.idx(cx - 1, cy)] },
        N: { t: st.type[st.idx(cx, cy - 1)], lq: st.liquid[st.idx(cx, cy - 1)], lt: st.liquidType[st.idx(cx, cy - 1)] },
        E: { lq: st.liquid[st.idx(cx + 1, cy)] }, S: { lq: st.liquid[st.idx(cx, cy + 1)] },
      });
    }
  });
  return { cells, px0, py0, x0, y0 };
}, TYPES);
console.log('[t] bench built:', bench.cells.filter(c => !c.err).length, 'cells');
// 相机就位(bench 中心)
for (let k = 0; k < 10; k++) {
  await p.evaluate((bn) => {
    const g = window.__swGame, pl = g.player;
    const cx = (bn.x0 + 16) * 16, cy = (bn.y0 + 20) * 16;
    pl.x = cx - pl.w / 2; pl.y = cy - pl.h / 2 - 24;
    pl.vx = 0; pl.vy = 0;
    g.camera.x = cx; g.camera.y = cy;
    try { g.camera.targetZoom = 1.2; } catch (e) {}
    g.camera.zoom = 1.2;
  }, bench);
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 180));
}
await new Promise(r => setTimeout(r, 2500));   // LiquidSlope_* 懒加载自愈窗
// drawImage 指纹采集
await p.evaluate(() => {
  window.__fx41c = { recs: [], on: true };
  const patch = (proto) => {
    if (!proto || proto.__fx41c) return;
    proto.__fx41c = true;
    const orig = proto.drawImage;
    proto.drawImage = function (...rest) {
      try {
        if (window.__fx41c.on) {
          const src = rest[0];
          if (src && src.width && src.height) {
            const w = src.width, h = src.height;
            const kind = (w === 72 && h === 16) ? 'slope'
              : (h % 80 === 0 && h >= 80 && (w === 16 || w === 80)) ? 'plane' : null;
            if (kind) {
              window.__fx41c.recs.push({ k: kind, sx: rest[1], sy: rest[2], sw: rest[3], sh: rest[4], dx: rest[5], dy: rest[6] });
              if (window.__fx41c.recs.length > 8000) window.__fx41c.recs.shift();
            }
          }
        }
      } catch (e) {}
      return orig.apply(this, rest);
    };
  };
  patch(window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype);
  patch(window.OffscreenCanvasRenderingContext2D && window.OffscreenCanvasRenderingContext2D.prototype);
});
await new Promise(r => setTimeout(r, 800));
await p.evaluate(() => { window.__fx41c.on = false; });
const fp = await p.evaluate((cells) => {
  const R = window.__fx41c.recs;
  const g2 = window.__swGame;
  window.__fx41cEnv = {
    warp: !!(g2.waterWarp && g2.waterWarp.active && g2.waterWarp.active()),
    quality: (g2.renderer && g2.renderer._waveCss !== undefined) ? 'wcss-set' : 'wcss-null',
    zoom: g2.camera.zoom,
    fullbright: !!g2.renderer.fullbright,
  };
  return cells.map((c) => {
    if (c.err) return c;
    const wx = c.cx * 16, wy = c.cy * 16;
    const hits = R.filter(r => r.dx < wx + 16 && r.dx + 16 > wx && r.dy < wy + 16 && r.dy + 16 > wy);
    const slopeHits = hits.filter(r => r.k === 'slope');
    const planeHits = hits.filter(r => r.k === 'plane');
    return {
      key: c.key, slope: c.slope, lt: c.lt, cx: c.cx, cy: c.cy,
      slopeN: slopeHits.length, planeN: planeHits.length,
      slopeFirst: slopeHits[0] || null,
    };
  });
}, bench.cells);
console.log('env printed below');
console.log('=== 构造实验台指纹(类型普查) ===');
const envState = await p.evaluate(() => window.__fx41cEnv || {});
console.log('=== env ===', JSON.stringify(envState));
const missing = [];
for (const q of fp.filter(Boolean)) {
  const dry = q.slopeN === 0 && q.planeN === 0;
  if (dry) missing.push(`${q.key}(s${q.slope},lt${q.lt})`);
  console.log(`${q.key} s${q.slope} lt${q.lt} @(${q.cx},${q.cy}) slope表=${q.slopeN} plane=${q.planeN}${q.slopeFirst ? ` {sx${q.slopeFirst.sx},sy${q.slopeFirst.sy},${q.slopeFirst.sw}x${q.slopeFirst.sh}}` : ''}${dry ? '  <<DRY' : ''}`);
}
console.log('=== 缺浸润格 ===', missing.length ? missing.join(' ; ') : '(无——全格均出浸润)');
// 像素读回(worldToScreen)
const px2 = await p.evaluate((cells) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const t = document.createElement('canvas');
  t.width = cv.width; t.height = cv.height;
  const c2 = t.getContext('2d');
  c2.drawImage(cv, 0, 0);
  return cells.filter(c => !c.err).map((c) => {
    const [sx, sy] = g.camera.worldToScreen(c.cx * 16, c.cy * 16);
    const s = Math.max(2, Math.round(16 * (g.camera.zoom ?? 1)));
    const x0c = Math.max(0, Math.round(sx)), y0c = Math.max(0, Math.round(sy));
    const w2 = Math.min(s, cv.width - x0c), h2 = Math.min(s, cv.height - y0c);
    if (w2 <= 0 || h2 <= 0) return { key: c.key, s: c.slope, lt: c.lt, err: 'offscreen' };
    const d = c2.getImageData(x0c, y0c, w2, h2).data;
    let lava = 0, brick = 0, other = 0, n = w2 * h2;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (r > 140 && gg >= 30 && gg <= 170 && bb < 90) lava++;
      else if (bb > 90 && bb > r) brick++;
      else other++;
    }
    return { key: c.key, s: c.slope, lt: c.lt, lavaPct: +(lava / n * 100).toFixed(1), brickPct: +(brick / n * 100).toFixed(1) };
  });
}, bench.cells);
console.log('=== 像素读回 ===');
for (const q of px2) console.log(`${q.key} s${q.s} lt${q.lt}: lava=${q.lavaPct}% brick=${q.brickPct}%${q.err ? ' ' + q.err : ''}`);
await p.screenshot({ path: '/tmp/fx41c-slope.png' });
console.log('screenshot /tmp/fx41c-slope.png');
await b.close();
process.exit(0);
