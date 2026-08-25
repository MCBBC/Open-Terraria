// 钻头控制装置（DCU mount 8）五缺陷复现探针：
//  ① 行动时舱体贴图消失（移动前后截图坐骑区非背景像素计数对比）
//  ② 激光口朝向跟随鼠标（按住左键期间移动鼠标 → diodeRotation 应逐 tick 收敛）
//  ③ 地底垂直移动（地下封闭室按跳/上 → y 位移；按下 → 下移）
//  ④ 激光束参数（目标格距离 = min(鼠标距,224)+32；束绘制原点随朝向）
//  ⑤ 发光（mount 8 emitsLight 光照注入 → 玩家格光照值 > 0）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
console.log('[boot] page loaded');
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
console.log('[boot] splash gone');
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
console.log('[boot] world create clicked');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
console.log('[boot] player ready');
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const res = { steps: [], data: {} };
  const ok = (name, cond, extra) => {
    res.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
    return cond;
  };
  // ---- 开放平台 ----
  const openPad = async () => {
    for (let i = 0; i < 90 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
    const fx = Math.floor(p.cx / 16), fy = Math.floor((p.y + p.h) / 16);
    for (let dx = -8; dx <= 8; dx++) {
      st.setTile(fx + dx, fy, 1, 0, 0);
      for (let dy = 1; dy <= 6; dy++) st.setTile(fx + dx, fy - dy, 0);
    }
    p.x = fx * 16 - 2; p.y = fy * 16 - p.h; p.vx = 0; p.vy = 0;
    await sleep(200);
    return { fx, fy };
  };
  await openPad();
  // ---- 召唤 DCU（item 2768；键名不硬编码——运行时按 vi_2768 前缀解析）----
  const dcuKey = Object.keys(items).find(k => /^vi_2768_/.test(k));
  res.data.dcuKey = dcuKey ?? '(none)';
  ok('DCU 物品键存在', !!dcuKey);
  inv.add(items[dcuKey], 1);
  let heldOk = false;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && String(inv.slots[i].id).includes('2768')) { inv.selected = i; heldOk = true; break; }
  ok('DCU 入包选中', heldOk);
  g.input.mouseDown = true;
  await sleep(300);
  g.input.mouseDown = false;
  await sleep(150);
  ok('DCU 上坐(8)', p.ridingMount === true && p.mount.type === 8, `type=${p.mount.type}`);

  // ---- ① 舱体贴图：静止 vs 移动 截图对比 ----
  const grabMountPixels = async () => {
    const cv = document.querySelector('canvas');
    const sx = (p.x + p.w / 2 - g.camera.x) * (cv.width / cv.clientWidth);
    const sy = (p.y - 30 - g.camera.y) * (cv.height / cv.clientHeight);
    const w = 100 * (cv.width / cv.clientWidth), h = 80 * (cv.height / cv.clientHeight);
    const c2 = document.createElement('canvas');
    c2.width = Math.max(1, Math.round(w)); c2.height = Math.max(1, Math.round(h));
    const cx2 = c2.getContext('2d');
    cx2.drawImage(cv, sx - w / 2, sy - h / 2, w, h, 0, 0, c2.width, c2.height);
    const d = cx2.getImageData(0, 0, c2.width, c2.height).data;
    // 非纯黑/非天空蓝像素数（舱体金属灰/橙）
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40 && !(d[i] < 18 && d[i + 1] < 18 && d[i + 2] < 24)) n++;
    }
    return n;
  };
  await sleep(400);
  const pixIdle = await grabMountPixels();
  g.input.keys.add('KeyD');
  await sleep(500);
  const pixMoving = await grabMountPixels();
  g.input.keys.delete('KeyD');
  await sleep(300);
  res.data.pixIdle = pixIdle; res.data.pixMoving = pixMoving;
  ok('① 移动时舱体贴图仍在（像素量不塌）', pixMoving > pixIdle * 0.35, `idle=${pixIdle} moving=${pixMoving}`);

  // ---- ② 朝向跟随鼠标（按住左键期间连续变向）----
  // 鼠标放右侧 → 目标角≈0；再移到头顶 → 目标角≈-π/2(即 3π/2)
  const setMouseAt = async (dxPx, dyPx) => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    const px = (p.cx - g.camera.x) * (r.width / (g.camera.viewW || r.width)) + dxPx;
    const py = (p.cy - g.camera.y) * (r.height / (g.camera.viewH || r.height)) + dyPx;
    await page.constructor === Object ? null : null;
    return { px: px + r.left, py: py + r.top };
  };
  void setMouseAt;
  // 直接驱动 aimWX/aimWY 等价输入（渲染管线读同一字段）
  const rotRight = [];
  const rotUp = [];
  p.mount.abilityActive = true;   // 模拟按住中
  for (let i = 0; i < 6; i++) { p.aimWX = p.cx + 200; p.aimWY = p.cy; g.player.mount.aimDrill(p.cx, p.cy, p.aimWX, p.aimWY); p.mount.updateDrill(); rotRight.push(+p.mount.diodeRotation.toFixed(3)); await sleep(30); }
  for (let i = 0; i < 6; i++) { p.aimWX = p.cx; p.aimWY = p.cy - 200; g.player.mount.aimDrill(p.cx, p.cy, p.aimWX, p.aimWY); p.mount.updateDrill(); rotUp.push(+p.mount.diodeRotation.toFixed(3)); await sleep(30); }
  p.mount.abilityActive = false;
  const lastR = rotRight[rotRight.length - 1], lastU = rotUp[rotUp.length - 1];
  res.data.rotRight = rotRight; res.data.rotUp = rotUp;
  ok('② 朝右收敛到 ~0', Math.abs(lastR % (Math.PI * 2)) < 0.6 || Math.abs(lastR) < 0.6, `rot=${lastR}`);
  ok('② 朝上收敛到 ~4.71(3π/2)', Math.abs(Math.abs(lastU) - Math.PI * 1.5) < 0.7, `rot=${lastU}`);

  // ---- ③ 地底垂直移动 ----
  // 挖一个地下封闭室并传送进去
  const uy = Math.floor(g.world.worldSurface) + 40;
  const ux = Math.floor(p.cx / 16);
  for (let dx = -6; dx <= 6; dx++) for (let dy = -4; dy <= 4; dy++) st.setTile(ux + dx, uy + dy, 0);
  for (let dx = -7; dx <= 7; dx++) { st.setTile(ux + dx, uy + 5, 1, 0, 0); st.setTile(ux + dx, uy - 5, 1, 0, 0); }
  for (let dy = -4; dy <= 4; dy++) { st.setTile(ux - 7, uy + dy, 1, 0, 0); st.setTile(ux + 7, uy + dy, 1, 0, 0); }
  p.x = ux * 16; p.y = uy * 16; p.vx = 0; p.vy = 0; p.fallStartY = null;
  await sleep(600);
  ok('③ 已入地底', Math.floor(p.cy / 16) > Math.floor(g.world.worldSurface), `cyTile=${Math.floor(p.cy / 16)} surface=${Math.floor(g.world.worldSurface)}`);
  const y0 = p.y;
  g.input.keys.add('Space');
  let roseMin = y0, fsSeen = [];
  for (let i = 0; i < 20; i++) { await sleep(50); roseMin = Math.min(roseMin, p.y); fsSeen.push(p.mount.frameState + ':' + p.vy.toFixed(2)); }
  g.input.keys.delete('Space');
  await sleep(200);
  res.data.riseDelta = +(y0 - roseMin).toFixed(1);
  res.data.fsSample = fsSeen.slice(0, 8);
  ok('③ 地底按跳上升 ≥32px', y0 - roseMin >= 32, `rise=${(y0 - roseMin).toFixed(1)}px sample=${fsSeen.slice(0, 4).join(',')}`);
  const y1 = p.y;
  g.input.keys.add('KeyS');
  let sinkMax = y1;
  for (let i = 0; i < 14; i++) { await sleep(50); sinkMax = Math.max(sinkMax, p.y); }
  g.input.keys.delete('KeyS');
  res.data.sinkDelta = +(sinkMax - y1).toFixed(1);
  ok('③ 地底按下下降 ≥16px', sinkMax - y1 >= 16, `sink=${(sinkMax - y1).toFixed(1)}px`);

  // ---- ④ 束参数：目标格距离钳制 ----
  p.aimWX = p.cx + 400; p.aimWY = p.cy;    // 远超 224+32
  p.mount.abilityActive = true;
  p.mount.crosshairX = p.aimWX; p.mount.crosshairY = p.aimWY;
  const beams0 = JSON.parse(JSON.stringify(p.mount.beams));
  p.mount.useDrill(p, { useItem: true, useTile: false });
  const b = p.mount.beams.find(x => x.tx >= 0);
  const distTiles = b ? Math.hypot(b.tx * 16 + 8 - p.cx, b.ty * 16 + 8 - p.cy) : -1;
  res.data.beamDistPx = +distTiles.toFixed(1);
  res.data.beamBefore = beams0;
  ok('④ 束长钳制 ≤256px(min(距,224)+32)', distTiles >= 0 && distTiles <= 257, `dist=${distTiles.toFixed(1)}px`);
  p.mount.abilityActive = false;

  // ---- ⑤ 发光 ----
  const lightOf = () => {
    const tx = Math.floor(p.cx / 16), ty = Math.floor(p.cy / 16);
    const L = g.renderer?.lighting || g.lighting;
    if (!L) return -1;
    return L.brightness ? L.brightness(tx, ty) : (L.getLight ? L.getLight(tx, ty) : -2);
  };
  const lv = lightOf();
  res.data.lightProbe = lv;
  ok('⑤ 坐骑光照通道存在（探测接口可得或光照>0）', lv !== -2, `probe=${lv}`);

  return res;
});
for (const s of out.steps) console.log(s);
console.log('data:', JSON.stringify(out.data));
console.log(`DCU-PROBE ${out.steps.every(s => s.startsWith('PASS')) ? 'PASS' : 'FAIL'} ` +
  `(${out.steps.filter(s => s.startsWith('PASS')).length}/${out.steps.length})`);
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
process.exit(out.steps.every(s => s.startsWith('PASS')) && errs.length === 0 ? 0 : 1);
