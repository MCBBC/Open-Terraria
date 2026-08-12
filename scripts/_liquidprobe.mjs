// 液体系统一比一移植验证：沉降稳定性 / 挖掘流动 / 水岩浆交互 / 地狱蒸发
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForSelector('select', { timeout: 120000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ========== 0) 海洋回归：沉降后地表仍是大片 1 类型水（防黑曜石化灾难） ==========
const ocean = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const gl = Math.floor(g.world.groundLevel);
  let best = 0;
  for (let y = gl + 5; y < gl + 80; y++) {
    let run = 0;
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 200 && st.liquidType[i] === 1) { run++; best = Math.max(best, run); }
      else run = 0;
    }
  }
  // 统计全图 type-1 水格总数（海洋主体应在数十万级）
  let water = 0;
  for (let i = 0; i < st.liquid.length; i++) if (st.liquid[i] > 0 && st.liquidType[i] === 1) water++;
  return { maxRun: best, water };
});
check('海洋仍是水（未被黑曜石化）', ocean.maxRun > 30 && ocean.water > 50000, JSON.stringify(ocean));

// ========== 1) 沉降后岩浆池稳定：传送主角到岩浆旁，观察液体总量不变 ==========
const lava = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16);
  let best = null;
  for (let y = 400; y < st.h - 10; y++) {
    let run = 0;
    for (let x = Math.max(10, cx - 300); x < Math.min(st.w - 10, cx + 300); x++) {
      const i = st.idx(x, y);
      if (st.liquidType[i] === 2 && st.liquid[i] > 200) run++;
      else { if (run >= 8 && (!best || run > best.run)) best = { run, x: x - (run >> 1), y }; run = 0; }
    }
  }
  return best;
});
check('找到岩浆池', !!lava, JSON.stringify(lava));
if (lava) {
  await page.evaluate((l) => {
    const g = window.__swGame;
    g.player.x = l.x * 16 - 8;
    g.player.y = (l.y - 4) * 16;
  }, lava);
  await new Promise((r) => setTimeout(r, 500));
  const before = await page.evaluate((l) => {
    const g = window.__swGame;
    const st = g.world.store;
    let sum = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -20; dx <= 20; dx++) sum += st.liquid[st.idx(l.x + dx, l.y + dy)];
    return { sum, active: g.liquid.numLiquid };
  }, lava);
  await new Promise((r) => setTimeout(r, 3000)); // 主角在旁边待 3 秒
  const after = await page.evaluate((l) => {
    const g = window.__swGame;
    const st = g.world.store;
    let sum = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -20; dx <= 20; dx++) sum += st.liquid[st.idx(l.x + dx, l.y + dy)];
    return { sum, active: g.liquid.numLiquid };
  }, lava);
  check('沉降后岩浆池稳定（靠近不排空）', after.sum >= before.sum - 40 && after.sum <= before.sum + 40,
    `before=${before.sum} after=${after.sum} active=${after.active}`);
}

// ========== 2) 挖掘流动：平地上挖坑注水 → 水下落且分布到坑底 ==========
const flow = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 出生点附近找地表：找一列从上往下第一个实心
  const cx = Math.floor(g.player.cx / 16);
  let gy = 0;
  while (gy < st.h - 10 && !st.isSolid(cx, gy)) gy++;
  // 在地下 30 格处人工挖一个 3 宽 8 高空腔（四周石壁密封，防撞洞穴漏水），顶部注一格水
  const x0 = cx, y0 = gy + 20;
  for (let dy = -1; dy <= 9; dy++) for (let dx = -1; dx <= 4; dx++) {
    st.setTile(x0 + dx, y0 + dy, 2);  // 石壁
    st.liquid[st.idx(x0 + dx, y0 + dy)] = 0;
    st.liquidType[st.idx(x0 + dx, y0 + dy)] = 0;
  }
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(x0 + dx, y0 + dy, 0);
  st.setLiquid(x0 + 1, y0 - 1, 255, 1);   // 腔上方水（会先落进腔）
  st.setTile(x0 + 1, y0 - 1, 0);
  for (let i = 0; i < 300; i++) g.liquid.updateLiquid();
  // 结果：水应集中在腔底几格，腔上方不再有悬空水
  let bottom = 0, floating = 0;
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 3; dx++) {
    const q = st.liquid[st.idx(x0 + dx, y0 + dy)];
    if (dy >= 6 && q > 0) bottom += q;
    if (dy < 5 && q > 200) floating++;
  }
  return { bottom, floating };
});
check('挖掘后水下落聚集坑底', flow.bottom > 200 && flow.floating === 0, JSON.stringify(flow));

// ========== 3) 水+岩浆 → 黑曜石 ==========
const obs = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE_BY_KEY = {}; // 用 tile type 反查名字
  // 找 obsidian 的 type id：遍历 TILE_DEFS
  const defs = window.__TILE_DEFS__ || null;
  // 简易：直接读 g.world.store 无法拿到 TILE_DEFS → 用渲染器已知 id：从 UI 不可用，
  // 改为对比"生成前后 type 变化"
  const cx = Math.floor(g.player.cx / 16);
  let gy = 0;
  while (gy < st.h - 10 && !st.isSolid(cx, gy)) gy++;
  const x = cx + 10, y = gy + 30;
  // 造密封石腔：左岩浆右水，中间隔墙（外圈石壁防撞洞穴漏液）
  for (let dy = -1; dy <= 4; dy++) for (let dx = -2; dx <= 4; dx++) {
    st.setTile(x + dx, y + dy, 2);
    st.liquid[st.idx(x + dx, y + dy)] = 0;
    st.liquidType[st.idx(x + dx, y + dy)] = 0;
  }
  for (let dy = 0; dy < 3; dy++) {
    st.setTile(x, y + dy, 0); st.setTile(x + 2, y + dy, 0); st.setTile(x + 1, y + dy, 0);
    st.setTile(x - 1, y + dy, 0);
  }
  st.setLiquid(x, y + 1, 200, 2);      // 岩浆
  st.setLiquid(x + 2, y + 1, 200, 1);  // 水
  st.setTile(x + 1, y + 1, 0);         // 打通中间
  const before = st.get(x, y + 1);
  for (let i = 0; i < 200; i++) g.liquid.updateLiquid();
  const lavaLeft = st.liquid[st.idx(x, y + 1)];
  const waterLeft = st.liquid[st.idx(x + 2, y + 1)];
  // 扫 3×3 找新生成的实心方块（黑曜石）
  let placed = 0;
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 3; dx++) {
    if (st.isSolid(x + dx, y + 1 + dy)) placed++;
  }
  return { before, lavaLeft, waterLeft, placed, typeAtLava: st.get(x, y + 1), typeAtMid: st.get(x + 1, y + 1) };
});
check('水+岩浆 → 黑曜石（液体消耗+生成实心块）', obs.lavaLeft === 0 && obs.waterLeft === 0 && obs.placed > 0, JSON.stringify(obs));

// ========== 4) 地狱蒸发：水放地狱层 ==========
const hell = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const y = st.h - 100; // > h-200 地狱层
  const x = Math.floor(g.player.cx / 16) + 20;
  // 封闭石腔：四壁实心、内部清空（tile 和液体都清），只放水
  for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) {
    st.setTile(x + dx, y + dy, 2);           // 石壁
    st.liquid[st.idx(x + dx, y + dy)] = 0;
    st.liquidType[st.idx(x + dx, y + dy)] = 0;
  }
  for (let dy = 0; dy <= 2; dy++) st.setTile(x, y + dy, 0); // 内腔 1×3
  st.liquid[st.idx(x, y)] = 200;
  st.liquidType[st.idx(x, y)] = 1;
  g.liquid.waterCheck();
  for (let i = 0; i < 200; i++) g.liquid.updateLiquid();
  let total = 0;
  for (let dy = 0; dy <= 2; dy++) total += st.liquid[st.idx(x, y + dy)];
  return { total };
});
check('地狱水蒸发（原版每 tick -2）', hell.total < 200, JSON.stringify(hell));

// ========== 5) 渲染颜色复检：稳定世界的岩浆远近都是橙色 ==========
if (lava) {
  await page.evaluate((l) => {
    const g = window.__swGame;
    g.renderer.fullbright = true;
    g.camera.zoom = 1.0; g.camera.zoomTarget = 1.0;
    // 主角放岩浆正上方 12 格，让 follow 自然对准（强设相机会被每帧 follow 覆盖）
    g.player.x = l.x * 16 - 8;
    g.player.y = (l.y - 12) * 16;
  }, lava);
  await new Promise((r) => setTimeout(r, 700));
  const c = await page.evaluate((l) => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(l.x * 16 + 8, l.y * 16 + 8);
    const d = g.renderer.ctx.getImageData(Math.round(sx) - 8, Math.round(sy) - 8, 16, 16).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return [r / n | 0, gg / n | 0, b / n | 0];
  }, lava);
  check('岩浆渲染为橙色（远处俯视）', c[0] > c[2] + 40, JSON.stringify(c));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(fail ? 1 : 0);
