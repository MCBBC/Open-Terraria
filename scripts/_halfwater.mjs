// _halfwater:半砖水体渲染调查(用户实报"水体大量空洞,透明透出背景,疑似水渲染不到半砖上")。
// 在确定性水潭里搭半砖测试架,逐构型测水体覆盖率,双路径对拍(默认 GL 果冻 / ?wwarp=0 旧路径):
//   构型:水线半砖 / 水下半砖(满液) / 水下半砖(部分液 100) / 满砖对照 / 池底半砖 /
//         上邻有液的半砖(IsVisible 跳过门)
// fullbright 免光照 + 常规两套截图;覆盖率以 fullbright 判(免光照暗误判)。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1200, height: 800 },
});

async function runPage(query, tag) {
  const errs = [];
  const p = await b.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`${ORIGIN}/?play=small${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
  }
  await p.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
      && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
  }
  await new Promise(r => setTimeout(r, 2000));
  // 找水潭 + 搭测试架
  const rig = await p.evaluate(() => {
    const g = window.__swGame, w = g.world, st = w.store;
    g.world.clock.timeOfDay = 0.5;
    if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
    const sx = w.spawnX, sy = w.spawnY;
    let pool = null;
    for (let dx = -220; dx <= 220; dx++) {
      const x = sx + dx;
      if (x < 20 || x >= st.w - 20) continue;
      for (let y = Math.max(10, sy - 60); y < Math.min(st.h - 40, sy + 120); y++) {
        const i = st.idx(x, y);
        if (st.liquid[st.idx(x, y - 1)] === 0 && st.liquid[i] > 200 && !st.isSolid(x, y)
          && st.liquid[st.idx(x + 1, y)] > 200 && st.liquid[st.idx(x - 1, y)] > 200
          && st.liquid[st.idx(x, y + 1)] > 200 && st.liquid[st.idx(x, y + 2)] > 200) {
          pool = { x, y }; break;
        }
      }
      if (pool) break;
    }
    if (!pool) return null;
    // 深挖保证 6+ 格深(就地清底再灌满,液面固定在 pool.y)
    const STONE = 1;
    for (let dx = -2; dx <= 14; dx++) {
      for (let dy = 0; dy <= 7; dy++) {
        const x = pool.x + dx, y = pool.y + dy;
        st.setTile(x, y, 0);
      }
      // 底
      st.setTile(pool.x + dx, pool.y + 8, STONE);
      st.setTile(pool.x + dx, pool.y + 9, STONE);
    }
    // 侧壁
    for (let dy = 0; dy <= 9; dy++) {
      st.setTile(pool.x - 3, pool.y + dy, STONE);
      st.setTile(pool.x + 15, pool.y + dy, STONE);
    }
    // 灌满:pool.y 行起 8 行满液
    for (let dx = -2; dx <= 14; dx++) {
      for (let dy = 0; dy <= 7; dy++) {
        const i = st.idx(pool.x + dx, pool.y + dy);
        st.liquid[i] = 255; st.liquidType[i] = 1;
      }
    }
    g.liquid.updateLiquid = () => {};   // 冻结:液面钉住
    const rig_ = [];
    // 构型(x 相对 pool.x, y 相对 pool.y): [label, dx, dy, half, liquid]
    const cases = [
      ['surface-half', 0, 0, 1, 255],
      ['sub-full-half', 2, 1, 1, 255],
      ['sub-partial-half', 4, 1, 1, 100],
      ['deep-half', 6, 3, 1, 255],
      ['deep-full-stone', 8, 3, 0, 255],
      ['bottom-half', 10, 7, 1, 255],
      ['upper-liq-half', 12, 2, 1, 255],
    ];
    for (const [label, dx, dy, half, liq] of cases) {
      const x = pool.x + dx, y = pool.y + dy;
      st.setTile(x, y, STONE);
      if (half) st.setHalfBrick(x, y, true);
      st.liquid[st.idx(x, y)] = liq;
      rig_.push({ label, x, y, half, liq });
    }
    // 玩家钉在架上方看全貌
    const pl = g.player;
    pl.x = (pool.x + 6) * 16 - pl.w / 2; pl.y = (pool.y + 2) * 16;
    pl.vx = 0; pl.vy = 0;
    return { pool, rig: rig_ };
  });
  if (!rig) { console.log('FAIL: no pool'); await b.close(); process.exit(1); }
  console.log(`${tag} rig:`, JSON.stringify(rig.rig.map(r => `${r.label}@(${r.x},${r.y})`)));
  await new Promise(r => setTimeout(r, 2500));
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: `${OUT}/halfwater-${tag}-normal.png` });
  await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
  await new Promise(r => setTimeout(r, 500));
  await p.screenshot({ path: `${OUT}/halfwater-${tag}-bright.png` });
  await p.evaluate(() => { window.__swGame.renderer.fullbright = false; });
  // 相机中心返回供像素分析
  const cam = await p.evaluate(() => {
    const g = window.__swGame;
    return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, w: g.renderer.canvas.width, h: g.renderer.canvas.height };
  });
  await p.close();
  return { errs, rig, cam };
}

const A = await runPage('', 'warp');
const B = await runPage('&wwarp=0', 'legacy');
console.log('cam A:', JSON.stringify(A.cam), ' B:', JSON.stringify(B.cam));
console.log('pageerrors:', JSON.stringify({ A: A.errs, B: B.errs }));

// ---- 像素分析(fullbright 判水体覆盖) ----
const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
import json
rigA = ${JSON.stringify(A.rig.rig)}
cam = ${JSON.stringify(A.cam)}
img = Image.open('${OUT}/halfwater-warp-bright.png').convert('RGB')
leg = Image.open('${OUT}/halfwater-legacy-bright.png').convert('RGB')
W, H = img.size
pw, pl = img.load(), leg.load()
def w2s(wx, wy):
    return (wx - cam['cx']) * cam['z'] + W/2, (wy - cam['cy']) * cam['z'] + H/2
def is_water(r, g, b):
    return b > r + 20 and b > 40
print("(fullbright) label           tile        warpFrac legacyFrac")
for r in rigA:
    tx, ty = r['x'], r['y']
    sx0, sy0 = w2s(tx*16, ty*16)
    x0, y0 = int(sx0), int(sy0)
    x1, y1 = int(sx0 + 16*cam['z'])+1, int(sy0 + 16*cam['z'])+1
    fw = fl = tot = 0
    for y in range(max(0,y0), min(H,y1)):
        for x in range(max(0,x0), min(W,x1)):
            tot += 1
            if is_water(*pw[x,y]): fw += 1
            if is_water(*pl[x,y]): fl += 1
    print(f"  {r['label']:<16} ({tx},{ty})   {fw/tot:.2f}     {fl/tot:.2f}")
PYEOF`, { stdio: 'inherit' });
await b.close();
process.exit(A.errs.length || B.errs.length ? 1 : 0);
