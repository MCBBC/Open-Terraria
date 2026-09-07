// 一次性闭环验证:tileShine2 ×1.6 通道——用户实报"生命水晶(tile 12)暗处看不见"修复
//  方法:地下暗室放 4×4 铁矿(sheet 6,tileShine2 静态 ×1.6)+ 生命水晶 2×2(sheet 12,
//        动画 ×1.6),火把给微光;同页 A/B(globalThis.__SW_SHINE_OFF 逃生门)采样画布
//        像素均值并按 lightAt 归一(mean×255/light ≈ sprite×k,与光照闪烁/绝对 L 无关),
//        ON/OFF 归一比 ≈1.6 = 通道成立;对照区(无 shine 石块)比值应 ≈1.0。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=500000 scripts/_tileshine-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
console.log('world ready, pageerrors so far:', errors.length);

// 建暗室:地下实心区挖空,左壁 4×4 铁矿 + 右侧地板生命水晶,火把在矿与晶之间偏矿侧
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = (k) => window.__swTiles[k];
  const ore = T('ore_iron'), heart = T('crystal_heart'), stone = T('stone'), torch = T('torch');
  if (ore === undefined || heart === undefined) return { err: 'tile id 缺失 ' + JSON.stringify({ ore, heart }) };
  const gy = Math.floor(g.world.groundLevel) + 120;
  let cx = -1, cy = -1;
  outer: for (let x = 200; x < st.w - 220; x += 3) {
    for (let y = gy; y < Math.min(gy + 220, st.h - 20); y += 3) {
      if (st.inBounds(x + 20, y + 12) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === stone) { cx = x; cy = y; break outer; }
    }
  }
  if (cx < 0) return { err: '未找到地下实心点 gy=' + gy };
  for (let y = cy - 8; y <= cy + 3; y++) for (let x = cx - 9; x <= cx + 9; x++) st.setTileSilent(x, y, 0, 0, 0);
  for (let x = cx - 9; x <= cx + 9; x++) { st.setTileSilent(x, cy + 4, stone, 0, 0); st.setTileSilent(x, cy + 5, stone, 0, 0); }
  // 铁矿 4×4(右邻空气,blend 取帧自然)——左壁位
  for (let y = cy - 4; y <= cy - 1; y++) for (let x = cx - 7; x <= cx - 4; x++) st.setTileSilent(x, y, ore, 0, 0);
  // 生命水晶 2×2 站地板(帧 = 2×2 style 四格)
  for (const [dx, dy, fx, fy] of [[0, 0, 0, 0], [1, 0, 18, 0], [0, 1, 0, 18], [1, 1, 18, 18]]) {
    st.setTileSilent(cx + 3 + dx, cy + 2 + dy, heart, fx, fy);
  }
  // 火把(微光源):矿右 ~4 格 / 晶左 ~6.5 格——晶区 L≈0.3 不饱和,矿区 L≈0.5
  st.setTileSilent(cx - 2, cy + 3, torch, 0, 0);
  return { cx, cy, ore, heart };
});
if (spot.err) { console.error(spot.err); await browser.close(); process.exit(1); }
console.log('spot:', JSON.stringify(spot));

// 玩家站在房间地板中央(防坠落漂移),相机随之稳定
await page.evaluate(([cx, cy]) => {
  const g = window.__swGame;
  g.player.x = cx * 16; g.player.y = (cy + 4) * 16 - 22;
  g.player.vy = 0; g.player.vx = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
}, [spot.cx, spot.cy]);
await new Promise((r) => setTimeout(r, 7000));

// 采样:区域像素均值 + 中心格 lightAt → 归一 norm = mean×255/light(≈ sprite×k)
const sample = async (label, rw) => {
  const out = await page.evaluate(([r]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const cam = g.camera; const z = cam.zoom ?? 1;
    const sx0 = Math.round((r.x0 * 16 - (cam.x - cv.width / 2 / z)) * z);
    const sy0 = Math.round((r.y0 * 16 - (cam.y - cv.height / 2 / z)) * z);
    const w = Math.round((r.x1 - r.x0) * 16 * z), h = Math.round((r.y1 - r.y0) * 16 * z);
    const d = c2.getImageData(sx0, sy0, w, h).data;
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    const li = g.renderer.lighting.lightAt(Math.floor((r.x0 + r.x1) / 2), Math.floor((r.y0 + r.y1) / 2));
    return { mean: [rr / n, gg / n, bb / n], light: li,
      norm: [rr / n * 255 / Math.max(1, li[0]), gg / n * 255 / Math.max(1, li[1]), bb / n * 255 / Math.max(1, li[2])] };
  }, [rw]);
  console.log(label, 'mean=', JSON.stringify(out.mean.map((v) => +v.toFixed(2))),
    'light=', JSON.stringify(out.light), 'norm=', JSON.stringify(out.norm.map((v) => +v.toFixed(2))));
  return out.norm;
};

const oreRect = { x0: spot.cx - 6, y0: spot.cy - 3, x1: spot.cx - 5, y1: spot.cy - 2 };
const heartRect = { x0: spot.cx + 3, y0: spot.cy + 2, x1: spot.cx + 5, y1: spot.cy + 4 };
const ctrlRect = { x0: spot.cx + 6, y0: spot.cy + 4, x1: spot.cx + 7, y1: spot.cy + 5 }; // 地板石块(无 shine 对照)

const med = (arrs) => [0, 1, 2].map((c) => {
  const v = arrs.map((a) => a[c]).sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
});
const ratio = (a, b) => a.map((v, i) => +(v / Math.max(1e-6, b[i])).toFixed(3));

const oreOn = [], heartOn = [], ctrlOn = [];
for (let k = 0; k < 7; k++) {
  oreOn.push(await sample(`ORE  ON #${k}  `, oreRect));
  heartOn.push(await sample(`HEART ON #${k}`, heartRect));
  ctrlOn.push(await sample(`CTRL  ON #${k}  `, ctrlRect));
}
await page.evaluate(() => { globalThis.__SW_SHINE_OFF = true; });
await new Promise((r) => setTimeout(r, 900));
const oreOff = [], heartOff = [], ctrlOff = [];
for (let k = 0; k < 7; k++) {
  oreOff.push(await sample(`ORE  OFF#${k}  `, oreRect));
  heartOff.push(await sample(`HEART OFF#${k}`, heartRect));
  ctrlOff.push(await sample(`CTRL  OFF#${k}  `, ctrlRect));
}
await page.screenshot({ path: '/tmp/tileshine-off.png' });
await page.evaluate(() => { globalThis.__SW_SHINE_OFF = false; });
await new Promise((r) => setTimeout(r, 900));
const oreRe = await sample('ORE  REON    ', oreRect);
await page.screenshot({ path: '/tmp/tileshine-on.png' });

console.log('=== 结论(归一 mean×255/light) ===');
console.log('ORE   ON/OFF (期望≈1.6) =', JSON.stringify(ratio(med(oreOn), med(oreOff))));
console.log('HEART ON/OFF (期望≈1.6) =', JSON.stringify(ratio(med(heartOn), med(heartOff))));
console.log('CTRL  ON/OFF (期望≈1.0) =', JSON.stringify(ratio(med(ctrlOn), med(ctrlOff))));
console.log('ORE   REON/ON sanity(期望≈1.0) =', JSON.stringify(ratio(oreRe, med(oreOn))));
console.log('pageerrors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
