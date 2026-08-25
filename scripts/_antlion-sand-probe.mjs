// 蚁狮沙球落档探针：Dart 31 与 FallingBlock 落地放置语义（Projectile.Kill aiStyle==10 等价）
// 断言：放置格=上一帧中心格；被占(草苗)→消失；裸草→贴格放置；无悬空叠放
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const g = window.__swGame;
  const st = g.world.store;
  const { Dart } = await import('/src/entities/Dart.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 场地：出生点东侧找平地，清空 8×10 工作区
  const X = g.world.spawnX + 12;
  const Y = Math.floor(g.world.groundLevel);
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -9; dy <= -1; dy++) {
      if (st.inBounds(X + dx, Y + dy) && st.get(X + dx, Y + dy) !== 0) st.setTile(X + dx, Y + dy, 0, 0, 0);
    }
  }
  // 地板：3 宽草块(2)
  for (let dx = -1; dx <= 1; dx++) st.setTile(X + dx, Y, 2, 0, 0);

  const colScan = (cx) => {
    const hits = [];
    for (let dy = -9; dy <= 0; dy++) {
      const t = st.get(cx, Y + dy);
      if (t !== 0) hits.push([Y + dy, t]);
    }
    return hits;
  };
  const spawnDart = (tx, ty, vx, vy) => {
    const d = new Dart(tx * 16 + 3, ty * 16 + 3, vx, vy, 10, 31);
    d.hostile = true;
    g.entities.add(d, 'projectiles');
    return d;
  };
  const clearCol = (cx) => { for (let dy = -9; dy <= -1; dy++) if (st.get(cx, Y + dy) !== 0) st.setTile(cx, Y + dy, 0, 0, 0); };

  const res = {};
  // A) 裸草：沙球垂直落在草上 → 沙应占据草上方那格（贴格,不悬空）
  clearCol(X);
  spawnDart(X, Y - 6, 0, 5);
  await sleep(1200);
  res.A_bareGrass = { col: colScan(X), pass: st.get(X, Y - 1) === 53 };

  // B) 草苗：草上方格是草苗(3) → 沙球落档格被占 → 消失（原版 num18=0 纯消失）
  clearCol(X);
  st.setTile(X, Y - 1, 3, 0, 0);
  spawnDart(X, Y - 7, 0, 5);
  await sleep(1200);
  res.B_plant = { col: colScan(X), pass: st.get(X, Y - 2) !== 53 && st.get(X, Y - 1) === 3 };

  // C) 仙人掌：沙落在仙人掌顶 → 贴格放置在顶上,不顶进臂位
  clearCol(X);
  st.setTile(X, Y, 80, 0, 0);          // 草块换仙人掌(实心)
  spawnDart(X, Y - 6, 0, 5);
  await sleep(1200);
  res.C_cactus = { col: colScan(X), pass: st.get(X, Y - 1) === 53 && st.get(X, Y) === 80 };
  st.setTile(X, Y, 2, 0, 0);           // 还原草

  // D) 下落沙回归：悬空沙块失支撑 → 落回裸草上方贴格（FallingBlock 路径,修"永不落格"回归）
  clearCol(X);
  st.setTile(X, Y - 5, 53, 0, 0);      // 悬空沙 → 触发下落
  await sleep(1500);
  res.D_falling = { col: colScan(X), pass: st.get(X, Y - 1) === 53 };

  // E) 下落沙 × 草苗：落档格被占 → 消失
  clearCol(X);
  st.setTile(X, Y - 1, 3, 0, 0);
  st.setTile(X, Y - 5, 53, 0, 0);
  await sleep(1500);
  res.E_fallingPlant = { col: colScan(X), pass: st.get(X, Y - 2) !== 53 && st.get(X, Y - 1) === 3 };

  clearCol(X);
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
