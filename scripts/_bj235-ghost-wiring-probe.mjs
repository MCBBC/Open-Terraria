// ★BJ235 残影接线续批探针——三弹实机截图（BJ219 续批落刀取证）。
// 载体：873 光女虹带（Arrow dispatch ai1=empressHue 喂入→幽灵 hsl 染色）/
//       1089 彩虹荧光棒（GlowstickProj disco 段带链,本体后）/
//       715 喜庆弹射器烟花（Celeb2Rocket 三帧横条第 2 帧沿段链,本体前）。
// 断言面：①各弹尾迹带内非背景像素计数 > 0;②无 pageerror;③截图存证。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5207') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); console.log('[probe] sp ok'); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
// 无角色（新 Chrome profile 零存档）→ 新建角色（ctx-storm 探针同路;UI 重渲染竞态 → 整段重试）
for (let attempt = 0; attempt < 5 && !(await page.$('.sw-vsel .sw-vitem')); attempt++) {
  try {
    if (!(await page.$('.sw-char-row input[type=text]'))) {
      await page.click('.sw-vsel [data-act=new]');
    }
    await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 6000 });
    await page.click('.sw-char-row input[type=text]');
    await page.keyboard.type('bj235probe');
    await new Promise((r) => setTimeout(r, 300));
    await page.click('[data-act=create]');
    await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
    console.log('[probe] char created');
  } catch { await new Promise((r) => setTimeout(r, 800)); }
}
// 角色条 → 世界选择 → 种子小世界（ctx-storm 同路;绕开地图文件依赖）
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(() => {});
if (!(await page.$('[data-f=seed]'))) {
  await page.click('.sw-vsel [data-act=new]').catch(() => {});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(() => {});
}
if (await page.$('[data-f=seed]')) {
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click();
  });
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => !!window.__swGame?.world?.store, { timeout: 300000, polling: 1000 });
console.log('[probe] world loaded');
await new Promise((r) => setTimeout(r, 2000));
for (const sel of ['button', '[data-act]']) {
  try {
    const done = await page.evaluate((s) => {
      const b = [...document.querySelectorAll(s)].find((x) => /我已知晓/.test(x.textContent ?? ''));
      if (b) { b.click(); return true; }
      return false;
    }, sel);
    if (done) break;
  } catch { /* next */ }
}
await new Promise((r) => setTimeout(r, 500));

// 相机稳定窗：等玩家落地/相机停稳（连续两窗 cam 不动才开始——防出生坠落拖镜）
await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  let lastX = NaN, lastY = NaN, stable = 0;
  for (let k = 0; k < 120; k++) {
    const cx = Math.round(g.camera.x), cy = Math.round(g.camera.y);
    stable = (cx === lastX && cy === lastY) ? stable + 1 : 0;
    lastX = cx; lastY = cy;
    if (stable >= 2) break;
    await wait(250);
  }
});
console.log('[probe] camera settled');

const out = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { GlowstickProj } = await import('/src/entities/WeaponProj.ts');
  const { Celeb2Rocket } = await import('/src/entities/Celeb2.ts');

  const cv0 = document.querySelector('canvas');
  const c20 = cv0.getContext('2d');
  // 以【当前视口中心】为锚（玩家可能移动/坠落）——世界坐标 = camera + 视口半宽高
  const vx0 = g.camera.x + cv0.width / 2, vy0 = g.camera.y + cv0.height / 2;
  // 该行若嵌墙找一条空气带：从中心向上扫到 ±8 tile 垂直净空（读 tile store）
  const st = g.world.store;
  let rowY = Math.floor(vy0 / 16);
  const solid = (tx, ty) => st.get(tx, ty) !== 0 && st.isSolid(tx, ty);
  for (let ty = Math.floor(vy0 / 16); ty > Math.floor(vy0 / 16) - 60; ty--) {
    let clear = true;
    for (let tx = Math.floor(vx0 / 16) - 24; tx <= Math.floor(vx0 / 16) + 24; tx++) {
      for (let dyy = -8; dyy <= 8; dyy++) {
        if (solid(tx, ty + dyy)) { clear = false; break; }
      }
      if (!clear) break;
    }
    if (clear) { rowY = ty; break; }
  }
  const anchorY = rowY * 16;
  const made = [];
  // ① 873 光女虹带：empressHue=0.25 → 幽灵色 hsl(0.75)（Arrow dispatch ai1 喂入面）
  const a873 = new Arrow(vx0 - 150, anchorY, 1.5, 0, 30, 0, 873,
    { grav: 0, life: 600, pierce: 99, empressHue: 0.25 });
  g.entities.add(a873, 'projectiles');
  made.push({ id: 873, ent: a873 });
  // ② 1089 彩虹荧光棒：缓抛——disco 段带链在本体后
  const gl = new GlowstickProj(vx0 + 30, anchorY - 20, 1.2, -1, 1089);
  g.entities.add(gl, 'projectiles');
  made.push({ id: 1089, ent: gl });
  // ③ 715 烟花弹 variant 2（Gold 摆动档）：缓飞（60 子步后才重力,短窗内存活）
  const rk = new Celeb2Rocket(715, 2, vx0 + 150, anchorY - 10, -1.0, -2.0, 30, 2, false,
    () => {});
  g.entities.add(rk, 'projectiles');
  made.push({ id: 715, ent: rk });
  await wait(220);                                       // 环展开（本仓 UNCAPPED rAF,帧率不齐 60）
  // 冻结三弹（netPuppet + 零速——puppet step 不再积分位移,环历史留在身后=稳定取证窗;
  // 环记录走 AI 子步,puppet 早退后停记=取证帧与环内容一致）
  for (const m of made) {
    m.ent.vx = 0; m.ent.vy = 0;
    m.ent.netPuppet = true;
    if ('netIt' in m.ent) m.ent.netIt = 1;               // 跳过插值段（免 netAx 拉扯）
  }
  await wait(150);                                       // 渲染沉降

  const cv = [...document.querySelectorAll('canvas')].reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const c2 = cv.getContext('2d');
  // 等世界入场黑幕淡出（中心像素非黑才采样）
  for (let k = 0; k < 100; k++) {
    const d = c2.getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data;
    if (d[0] + d[1] + d[2] > 45) break;
    await wait(100);
  }
  // 世界→backing px：screen = (world−cam)×zoom + view/2；backing = screen×dpr
  const dpr = cv.width / g.camera.viewW;
  const zoom = g.camera.zoom;
  const toB = (wx, wy) => [
    Math.round(((wx - g.camera.x) * zoom + g.camera.viewW / 2) * dpr),
    Math.round(((wy - g.camera.y) * zoom + g.camera.viewH / 2) * dpr),
  ];
  // 参照面 = 本体上方 48px 的 12×4 拉平中值（相对背景,不依赖天空角点）
  const refMedian = (bx, by) => {
    const rs = [], gs = [], bs = [];
    for (let dx = -16; dx <= 16; dx += 4) {
      for (let dy = 44; dy <= 56; dy += 4) {
        const d = c2.getImageData(bx + dx, by - dy, 1, 1).data;
        rs.push(d[0]); gs.push(d[1]); bs.push(d[2]);
      }
    }
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    return [med(rs), med(gs), med(bs)];
  };
  const rows = [];
  for (const m of made) {
    const ent = m.ent;
    const [sx, sy] = toB(ent.cx, ent.cy);
    const ref = refMedian(sx, sy);
    let ringInfo = null;
    try {
      const r2 = ent.ghostRing;
      if (r2) ringInfo = { filled: r2.filled, mode: r2.mode, cap: r2.cap };
    } catch { /* ignore */ }
    // 本体像素（中心 ±6 内非参照计数）
    let bodyPx = 0;
    for (let dx = -6; dx <= 6; dx += 3) {
      for (let dy = -6; dy <= 6; dy += 3) {
        const d = c2.getImageData(sx + dx, sy + dy, 1, 1).data;
        if (Math.abs(d[0] - ref[0]) + Math.abs(d[1] - ref[1]) + Math.abs(d[2] - ref[2]) > 40) bodyPx++;
      }
    }
    let non = 0, samples = 0;
    for (let dx = 4; dx < 56; dx += 2) {
      for (let dy = -14; dy <= 14; dy += 2) {
        const d = c2.getImageData(sx - dx, sy + dy, 1, 1).data;
        samples++;
        if (Math.abs(d[0] - ref[0]) + Math.abs(d[1] - ref[1]) + Math.abs(d[2] - ref[2]) > 40) non++;
      }
    }
    // 取证：带内原始像素采样（前 8 列 × 3 行）
    const dbg = [];
    for (let dx = 6; dx < 22; dx += 2) {
      const d = c2.getImageData(sx - dx, sy, 1, 1).data;
      dbg.push([sx - dx, d[0], d[1], d[2]]);
    }
    rows.push({ id: m.id, sx, sy, ref, bodyPx, ghostPixels: non, samples, alive: !ent.dead, ringInfo, dbg });
  }
  return { rows, dpr, canvas: [cv.width, cv.height], zoom: Math.round(zoom * 100) / 100, camX: Math.round(g.camera.x), errs: [] };
});
console.log(JSON.stringify({ out, errs: errs.slice(0, 4) }, null, 1));
await page.screenshot({ path: '/tmp/bj235-ghost-wiring-probe.png' });
// 逐弹特写（★注：本页 in-game 主画布 2D 回读黑（GL 合成页）→ 像素断言走截图裁片,
// run-diag 页内 getImageData 只在标题面有效=探针平台登记项）
if (out?.rows?.length === 3) {
  const crops = [
    { id: 873, x: out.rows[0].sx - 90, y: out.rows[0].sy - 30, w: 130, h: 60 },
    { id: 1089, x: out.rows[1].sx - 40, y: out.rows[1].sy - 40, w: 80, h: 90 },
    { id: 715, x: out.rows[2].sx - 50, y: out.rows[2].sy - 60, w: 100, h: 130 },
  ];
  for (const c of crops) {
    await page.screenshot({
      path: `/tmp/bj235-crop-${c.id}.png`,
      clip: { x: Math.max(0, c.x), y: Math.max(0, c.y), width: c.w, height: c.h },
    });
  }
  console.log('[probe] crops saved');
}
await browser.close();
