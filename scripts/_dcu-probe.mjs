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
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[dcu]')) console.log(t); });
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
  const mainCanvas = () => [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const res = { steps: [], data: {} };
  const ok = (name, cond, extra) => {
    res.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
    console.log(`[dcu] ${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
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
  const dcuId = items[dcuKey];
  let heldOk = false;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === dcuId) { inv.selected = i; heldOk = true; break; }
  ok('DCU 入包选中', heldOk, `id=${dcuId}`);
  g.input.mouseDown = true;
  await sleep(300);
  g.input.mouseDown = false;
  await sleep(150);
  ok('DCU 上坐(8)', p.ridingMount === true && p.mount.type === 8, `type=${p.mount.type}`);

  // ---- ① 舱体贴图：静止 vs 移动 截图对比 ----
  const grabMountPixels = async () => {
    const cv = mainCanvas();
    const [sxCss, syCss] = g.camera.worldToScreen(p.cx, p.y - 10);
    const kx = cv.width / cv.clientWidth, ky = cv.height / cv.clientHeight;
    const sx = sxCss * kx, sy = syCss * ky;
    const w = 60 * kx, h = 50 * ky;
    const c2 = document.createElement('canvas');
    c2.width = Math.max(1, Math.round(w)); c2.height = Math.max(1, Math.round(h));
    const cx2 = c2.getContext('2d');
    cx2.drawImage(cv, sx - w / 2, sy - h / 2, w, h, 0, 0, c2.width, c2.height);
    const d = cx2.getImageData(0, 0, c2.width, c2.height).data;
    // 非近黑像素数（地下/夜晚舱体金属灰与发光件均亮于阈值）
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40 && (d[i] + d[i + 1] + d[i + 2]) > 90) n++;
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
  // ①b 开火态（按住左键挖地）：舱体贴图同样不得消失
  g.input.mouseDown = true;
  await sleep(600);
  const pixFiring = await grabMountPixels();
  const firingActive = p.mount.abilityActive;
  g.input.mouseDown = false;
  await sleep(250);
  res.data.pixFiring = pixFiring; res.data.firingActive = firingActive;
  ok('①b 开火态激光激活', firingActive === true);
  ok('①b 开火时舱体贴图仍在', pixFiring > pixIdle * 0.35, `idle=${pixIdle} firing=${pixFiring}`);

  // ---- ② 朝向跟随鼠标（真实输入链：mouseDown 电平 + 鼠标位移 → 每 tick AimAbility）----
  // 原版 = 453 存活期每 tick AimAbility（Projectile.cs:31183-31190）——按住期间
  // 移动鼠标，diodeRotationTarget 应连续跟随（而非仅点击瞬间更新一次）
  const mouseTo = (dxWorld, dyWorld) => {
    const cv = mainCanvas();
    const [sxCss, syCss] = g.camera.worldToScreen(p.cx + dxWorld, p.cy + dyWorld);
    const r = cv.getBoundingClientRect();
    g.input.mouseX = Math.round(sxCss * (r.width / cv.clientWidth));
    g.input.mouseY = Math.round(syCss * (r.height / cv.clientHeight));
  };
  g.input.mouseDown = true;
  mouseTo(200, 0);
  await sleep(500);
  const tRight = p.mount.diodeRotationTarget;
  const actRight = p.mount.abilityActive;
  const targets = [];
  for (const [dx, dy] of [[200, -160], [-200, 0], [0, 200]]) {
    mouseTo(dx, dy);
    await sleep(400);
    targets.push(+p.mount.diodeRotationTarget.toFixed(2));
  }
  g.input.mouseDown = false;
  await sleep(200);
  res.data.tRight = +tRight.toFixed(3); res.data.actRight = actRight; res.data.targets = targets;
  ok('② 按住期间 abilityActive 常驻', actRight === true);
  ok('② 目标角跟随鼠标（右≈0）', Math.abs(tRight) < 0.5 || Math.abs(tRight - Math.PI * 2) < 0.5, `t=${tRight.toFixed(3)}`);
  ok('② 连续移动鼠标目标角逐段变化', Math.abs(targets[0] - tRight) > 0.5 && Math.abs(targets[1] - targets[0]) > 0.5,
    `targets=${targets.join(',')} t0=${tRight.toFixed(2)}`);

  // ---- ③ 地底垂直移动 ----
  // 挖一个地下封闭室并传送进去
  const uy = Math.floor(g.world.groundLevel) + 40;
  const ux = Math.floor(p.cx / 16);
  for (let dx = -6; dx <= 6; dx++) for (let dy = -4; dy <= 4; dy++) st.setTile(ux + dx, uy + dy, 0);
  for (let dx = -7; dx <= 7; dx++) { st.setTile(ux + dx, uy + 5, 1, 0, 0); st.setTile(ux + dx, uy - 5, 1, 0, 0); }
  for (let dy = -4; dy <= 4; dy++) { st.setTile(ux - 7, uy + dy, 1, 0, 0); st.setTile(ux + 7, uy + dy, 1, 0, 0); }
  p.x = ux * 16; p.y = uy * 16; p.vx = 0; p.vy = 0; p.fallStartY = null;
  await sleep(600);
  ok('③ 已入地底', Math.floor(p.cy / 16) > Math.floor(g.world.groundLevel), `cyTile=${Math.floor(p.cy / 16)} surface=${Math.floor(g.world.groundLevel)}`);
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
  // ③b 实战复合态：按住左键（钻掘中）同时按跳——地底作业时的真实操控
  const y2 = p.y;
  g.input.mouseDown = true;
  g.input.keys.add('Space');
  let rose2 = y2;
  for (let i = 0; i < 20; i++) { await sleep(50); rose2 = Math.min(rose2, p.y); }
  g.input.keys.delete('Space');
  g.input.mouseDown = false;
  await sleep(200);
  res.data.riseDrilling = +(y2 - rose2).toFixed(1);
  ok('③b 钻掘中按跳仍可上升 ≥32px', y2 - rose2 >= 32, `rise=${(y2 - rose2).toFixed(1)}px`);

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

  // ---- ⑤ 发光（mount 8 emitsLight 0.3/0.3/0.4 → 骑乘时中心格光照显著高于下坐后）----
  const lightOf = () => {
    const L = g.renderer?.lighting;
    if (!L) return -1;
    const [r, gg, bb] = L.lightAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16));
    return Math.round(Math.max(r, gg, bb));
  };
  for (let i = 0; i < 30; i++) await sleep(50);   // 等光照引擎数周期收敛
  const lvMounted = lightOf();
  g.input.keys.add('KeyR');
  await sleep(280);
  g.input.keys.delete('KeyR');
  await sleep(300);
  const dismounted = !p.ridingMount;
  for (let i = 0; i < 30; i++) await sleep(50);
  const lvBare = lightOf();
  res.data.lightMounted = lvMounted; res.data.lightBare = lvBare;
  ok('⑤ 下坐成功（对照可用）', dismounted);
  ok('⑤ 骑乘自带光照（骑乘亮度 > 下坐后 +20）', lvMounted > lvBare + 20, `mounted=${lvMounted} bare=${lvBare}`);

  return res;
});
for (const s of out.steps) console.log(s);
console.log('data:', JSON.stringify(out.data));
console.log(`DCU-PROBE ${out.steps.every(s => s.startsWith('PASS')) ? 'PASS' : 'FAIL'} ` +
  `(${out.steps.filter(s => s.startsWith('PASS')).length}/${out.steps.length})`);
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
process.exit(out.steps.every(s => s.startsWith('PASS')) && errs.length === 0 ? 0 : 1);
