// R32 钓竿案探针（用户实报：钓鱼时竿贴图不画、鱼线凭空出现；浮漂被拖走）：
// 装备钓竿→抛竿→浮漂落水后断言
//   (a) 手部区域存在竿贴图像素（canvas 差分采样：竿在场 vs 撤竿全消）
//   (b) 线首段起点坐标 ≈ 竿尖（fishingPoleTipStart 计算值，沿段采样差分掩码，误差<16px）
//   (c) 收线中竿仍持握显示；浮漂到达后消失（HackHoldStyles 原版语义）
//   (d) 玩家走远超 900px → 自动收线断线，钓鱼态结束
//   (e) 小范围走动浮漂不跟随、不触发收线
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5226';
const SHOT = '/tmp/recon/r32-shots/fishing-rod-fixed.png';
fs.mkdirSync('/tmp/recon/r32-shots', { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
// CPU 软渲染先行（headless swiftshader 下 GL 上下文易丢失 → GPU 熔断 → render()
// 整帧跳过 = 世界层全黑，像素断言失效；CPU 模式无 GL 上下文不受熔断影响）
await page.evaluate(async () => {
  const options = await import('/src/core/Options.ts');
  for (let i = 0; i < 100; i++) {
    if (options.options?.data) { options.options.data.renderMode = "cpu"; return; }
    await new Promise((r) => setTimeout(r, 50));
  }
});
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R32');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // 小世界
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

// ---------- 场景搭建 + 断言主体 ----------
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const tiles = await import('/src/data/tiles.ts');
  const bobMod = await import('/src/entities/Bobber.ts');
  const isBobber = (e) => e && e.constructor && e.constructor.name === 'Bobber';
  const liveBobber = () => g.entities.projectiles.find((e) => isBobber(e) && !e.dead);
  const ticks = async (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); await new Promise((r) => requestAnimationFrame(r)); };
  const R = { fatal: null, dbg: {} };

  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  // 白天：世界默认 8:30 开局即昼——不手动改 clock（此前置 0.5 伴生世界层全黑，弃用）

  // ---- 自建石砌水池（出生点右侧地表，保证露天+白天光照）----
  const stone = tiles.TILE_BY_KEY['stone'];   // 石块（键名无 _block 后缀）
  const bx = Math.floor(g.player.x / TILE) + 4;
  const sy = g.world.groundLevel;         // 地表行
  for (let dx = 0; dx < 36; dx++) {
    for (let dy = -6; dy <= 0; dy++) st.setTileSilent(bx + dx, sy + dy, 0);      // 开挖露天
    for (let dy = 1; dy <= 4; dy++) st.setTileSilent(bx + dx, sy + dy, stone);   // 填石
  }
  for (let dy = 1; dy <= 3; dy++) {
    for (let dx = 2; dx <= 33; dx++) st.setLiquid(bx + dx, sy + dy, 200, 1);     // 水 32×3
  }
  const waterCX = (bx + 6) * TILE, waterCY = (sy + 1) * TILE;   // 近岸水面（屏幕点居中，避开小地图）

  // ---- 装备木竿+鱼饵；站池左壁顶 ----
  const rodId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[2289]];
  const baitId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[2674]];
  const p = g.player;
  p.inv.selected = 2;
  p.inv.slots[2] = { id: rodId, stack: 1 };
  if (!p.inv.slots.some((s) => s && s.id === baitId)) p.inv.slots[6] = { id: baitId, stack: 5 };
  p.x = (bx + 1) * TILE; p.y = (sy + 1) * TILE - p.h; p.vx = 0; p.vy = 0;
  await ticks(30);

  const w2s = (wx, wy) => {
    const [sx, syp] = g.camera.worldToScreen(wx, wy);
    return [sx * (g.renderer.dpr || 1), syp * (g.renderer.dpr || 1)];
  };
  const aim = () => {
    const [sx, syp] = g.camera.worldToScreen(waterCX, waterCY);
    g.input.mouseX = sx / (g.renderer.dpr || 1);
    g.input.mouseY = syp / (g.renderer.dpr || 1);
  };
  const cast = async (tag) => {
    let attempts = 0, pre = null, post = null;
    // 施法前补水（液面模拟可能沉降）+ 玩家归位池左壁顶
    const refill = () => {
      for (let dy = 1; dy <= 3; dy++) {
        for (let dx = 2; dx <= 33; dx++) st.setLiquid(bx + dx, sy + dy, 200, 1);
      }
      p.x = (bx + 1) * TILE; p.y = (sy + 1) * TILE - p.h; p.vx = 0; p.vy = 0;
      for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
    };
    while (attempts < 6) {
      attempts++;
      refill();
      g.player.inv.selected = 2;   // 撤竿空手后游戏会自动跳选中格——每次施法强制回竿格
      aim();
      const elAt = document.elementFromPoint(g.input.mouseX, g.input.mouseY);
      const elInfo = elAt ? `${elAt.tagName}.${String(elAt.className).slice(0, 40)}` : 'null';
      if (attempts === 1) {
        pre = {
          held: g.player.inv.heldItem()?.id ?? null,
          selected: g.player.inv.selected,
          useTime: g.player.useTime,
          itemAnim: g.player.itemAnimTicks,
          bait: g.player.inv.slots.some((s) => s && s.id === baitId),
          uiBlocking: g.input.uiBlocking ?? null,
          dead: g.player.dead,
          fullMap: g.renderer.fullMap?.open ?? null,
          timeUiHover: g.renderer.timeUiHover ?? null,
          weatherUiHover: g.renderer.weatherUiHover ?? null,
          paused: g.paused ?? g._worldPaused ?? null,
        };
      }
      g.input.mouseDown = true;
      g.fixedUpdate(1 / 60);
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
      if (attempts === 1) {
        post = {
          swing: !!g.swing, useTime: g.player.useTime,
          projs: g.entities.projectiles.length,
          bobbersAll: g.entities.projectiles.filter(isBobber).length,
          elInfo, mouseX: Math.round(g.input.mouseX), mouseY: Math.round(g.input.mouseY),
          uiBlockingPost: g.input.uiBlocking ?? null,
          cam: { x: Math.round(g.camera.x), y: Math.round(g.camera.y), zoom: g.camera.zoom },
        };
      }
      // 等浮漂落水漂浮（整窗等待；中途见非漂浮弹不中断——避免下次点击误触收线）
      let fb = null;
      for (let i = 0; i < 160; i++) {
        await ticks(1);
        const b = liveBobber();
        if (b && b.floating) { fb = b; break; }
      }
      if (fb) { R.dbg['cast_' + tag] = { attempts, pre, post }; return fb; }
    }
    R.dbg['cast_' + tag] = {
      attempts, pre, post,
      sawBobber: false,
      waterLeft: st.liquid[st.idx(bx + 18, sy + 1)],
      held: g.player.inv.heldItem()?.id ?? null,
      toast: (g.toasts ?? []).slice(-1)[0] ?? null,
    };
    return null;
  };

  // ================= A 态：竿+线+浮漂 =================
  const bobber = await cast(1);
  if (!bobber) { R.fatal = 'cast-failed'; return R; }
  await ticks(30);
  // 场景诊断：玩家位置/地表关系 + 玩家格光照 + 屏中心格
  {
    const ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE);
    const lightOf = (tx, tyy) => {
      const L = g.lighting ?? g.renderer.lighting;
      try { return L?.light?.[L.light ? (tyy * st.w + tx) : 0] ?? null; } catch { return null; }
    };
    R.scene = {
      groundLevel: g.world.groundLevel,
      playerTile: [ptx, pty],
      camY: Math.round(g.camera.y),
      tileAtPlayer: st.type[st.idx(ptx, pty)],
      tileBelowPlayer: st.type[st.idx(ptx, pty + 1)],
      liquidAtPlayer: st.liquid[st.idx(ptx, pty)],
      skyVisible: !st.isSolid(ptx, pty - 3),
    };
  }
  const tip = bobMod.fishingPoleTipStart(p, 2289);       // 线起点计算值（竿尖）
  const bbC = { x: bobber.cx, y: bobber.cy };
  R.gateActiveA = g.renderer.bobberOwners.has(p);        // HackHoldStyles 渲染门快照
  R.tip = tip; R.bobberCenter = bbC; R.playerXY = { x: p.x, y: p.y, cx: p.cx, facing: p.facing };

  const dpr = g.renderer.dpr || 1;
  const cv = g.renderer.canvas;
  const W = cv.width, H = cv.height;
  R.gpuDegraded = g.renderer.gpuDegraded ?? null;
  // 渲染循环活性：animTick 每 render() +1，500ms 两次采样
  const at0 = g.renderer.animTick;
  await new Promise((r) => setTimeout(r, 500));
  R.renderAlive = g.renderer.animTick > at0;
  R.animTickDelta = g.renderer.animTick - at0;
  R.renderMode = (await import('/src/core/Options.ts')).options.data.renderMode;
  // 区域快照（只读小窗，降低 canvas 读回压力；CPU 渲染模式下 getImageData 稳定）
  const snapRegion = ([x0, y0, x1, y1]) => ({
    x0, y0, w: x1 - x0, h: y1 - y0,
    d: cv.getContext('2d').getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data.slice(),
  });
  const diffRegion = (a, b) => {
    if (a.w !== b.w || a.h !== b.h) return -1;
    let n = 0;
    for (let px = 0, i = 0; px < a.w * a.h; px++, i += 4) {
      const d = Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]);
      if (d > 24) n++;
    }
    return n;
  };

  // 手部/竿体差分窗（静持锚 offX=trunc(fw*0.18)、offY=28；±8px 放宽贴图框误差）
  const fw = 40, fh = 28, offX = Math.trunc(fw * 0.18);
  const [bx0, by0] = w2s(p.cx + p.facing * offX - 8, p.y + 28 - fh - 8);
  const [bx1, by1] = w2s(p.cx + p.facing * (offX + fw) + 8, p.y + 28 + 8);
  const box = [
    Math.max(0, Math.round(Math.min(bx0, bx1))),
    Math.max(0, Math.round(Math.min(by0, by1))),
    Math.min(W, Math.round(Math.max(bx0, bx1))),
    Math.min(H, Math.round(Math.max(by0, by1))),
  ];
  R.box = box;
  // 线走廊窗（tip→浮漂 包围盒 + 24px 余量）
  const cx0 = Math.min(tip.x, bbC.x) - 24, cy0 = Math.min(tip.y, bbC.y) - 24;
  const cx1 = Math.max(tip.x, bbC.x) + 24, cy1 = Math.max(tip.y, bbC.y) + 24;
  const [lx0, ly0] = w2s(cx0, cy0);
  const [lx1, ly1] = w2s(cx1, cy1);
  const corr = [
    Math.max(0, Math.round(Math.min(lx0, lx1))),
    Math.max(0, Math.round(Math.min(ly0, ly1))),
    Math.min(W, Math.round(Math.max(lx0, lx1))),
    Math.min(H, Math.round(Math.max(ly0, ly1))),
  ];

  const shotA = { hand: snapRegion(box), corr: snapRegion(corr) };
  R.pngDataURL = cv.toDataURL('image/png');              // 用户要求截图（A 态全景）

  // ---- B 态：撤竿（存活门杀浮漂 → 竿/线/浮漂全消）----
  p.inv.slots[2] = null;
  for (let i = 0; i < 120; i++) { await ticks(1); if (!liveBobber()) break; }
  await ticks(10);
  R.gateActiveB = g.renderer.bobberOwners.has(p);
  const shotB = { hand: snapRegion(box), corr: snapRegion(corr) };

  // (a) 竿贴图像素（差分窗内变化像素数）
  R.rodPixels = diffRegion(shotA.hand, shotB.hand);

  // (b) 线首段起点 ≈ 竿尖：tip→浮漂前 16px 每 2px 步进查走廊差分命中
  const corrDiff = (wx, wy, r) => {
    const [scx, scy] = w2s(wx, wy);
    const px = Math.round(scx) - corr[0], py = Math.round(scy) - corr[1];
    const rr = Math.round(r * dpr);
    for (let yy = Math.max(0, py - rr); yy <= Math.min(corr[3] - corr[1] - 1, py + rr); yy++)
      for (let xx = Math.max(0, px - rr); xx <= Math.min(corr[2] - corr[0] - 1, px + rr); xx++) {
        const i = (yy * (corr[2] - corr[0]) + xx) * 4;
        const d = Math.abs(shotA.corr.d[i] - shotB.corr.d[i])
          + Math.abs(shotA.corr.d[i + 1] - shotB.corr.d[i + 1])
          + Math.abs(shotA.corr.d[i + 2] - shotB.corr.d[i + 2]);
        if (d > 24) return true;
      }
    return false;
  };
  const segLen = Math.hypot(bbC.x - tip.x, bbC.y - tip.y) || 1;
  const ux = (bbC.x - tip.x) / segLen, uy = (bbC.y - tip.y) / segLen;
  let hits = 0, samples = 0;
  for (let s = 0; s <= 16; s += 2) {
    samples++;
    if (corrDiff(tip.x + ux * s, tip.y + uy * s, 3)) hits++;
  }
  R.lineHits = `${hits}/${samples}`;

  // ================= C 态：重新装备+抛竿→收线中 =================
  p.inv.slots[2] = { id: rodId, stack: 1 };
  const bob2 = await cast(2);
  if (!bob2) { R.fatal = 'recast-failed'; return R; }
  await ticks(30);
  aim();
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  R.reelRetracting = !!bob2.retracting;                  // 收线态生效
  await ticks(1);
  R.dbg.afterReel = { dead: bob2.dead, retract: bob2.retract, live: !!liveBobber() };
  R.reelGateActive = g.renderer.bobberOwners.has(p);
  const shotC = snapRegion(box);
  R.reelRodPixels = diffRegion(shotC, shotB.hand);       // 收线飞行中手部仍有竿像素
  let arrived = false;
  for (let i = 0; i < 600; i++) { await ticks(1); if (!liveBobber()) { arrived = true; break; } }
  await ticks(10);
  const shotD = snapRegion(box);
  R.reelArrived = arrived;
  R.afterArrivalRodPixels = diffRegion(shotD, shotB.hand);  // 到达后竿消失（原版 HackHoldStyles）

  // ================= E/D 态：锚定 + 距离断线 =================
  p.inv.slots[2] = { id: rodId, stack: 1 };
  const bob3 = await cast(3);
  if (!bob3) { R.fatal = 'recast2-failed'; return R; }
  await ticks(30);
  // (e) 小范围踱步：浮漂钉在落水点
  const ax = bob3.x, ay = bob3.y;
  const px0 = p.x;
  for (let s = 0; s < 4; s++) {
    const dir = s % 2 ? 1 : -1;
    for (let k = 0; k < 30; k++) { p.x = px0 + dir * (k + 1); p.vx = 0; await ticks(1); }
  }
  p.x = px0; p.vx = 0;
  R.anchorDx = Math.abs(bob3.x - ax);
  R.anchorDy = Math.abs(bob3.y - ay);
  R.anchorRetract = bob3.retracting;
  // (d) 走远 1200px → 自动收线断线
  p.x = px0 + 1200; p.vx = 0;
  await ticks(2);
  R.farRetracting = bob3.retracting || !liveBobber();    // >900px 门触发
  let gone = false;
  for (let i = 0; i < 600; i++) { await ticks(1); if (!liveBobber()) { gone = true; break; } }
  R.farGone = gone;                                       // 断线=浮漂消失钓鱼结束

  return R;
});

// ---------- 结果 ----------
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

if (out.fatal) {
  console.log('FATAL:', out.fatal, JSON.stringify(out.dbg ?? {}));
} else if (out.pngDataURL) {
  fs.writeFileSync(SHOT, Buffer.from(out.pngDataURL.split(',')[1], 'base64'));
  console.log('shot saved:', SHOT);
  console.log('dbg:', JSON.stringify(out.dbg ?? {}));
  check('(a) 手部区域存在竿贴图像素', out.rodPixels >= 120 && out.gateActiveA, `rodPx=${out.rodPixels} gate=${out.gateActiveA}`);
  check('(b) 线首段起点≈竿尖(<16px)', (() => {
    const [h, s] = out.lineHits.split('/').map(Number);
    return h >= Math.ceil(s * 0.7);
  })(), `hits=${out.lineHits}`);
  check('(c1) 收线中竿仍持握显示', out.reelRetracting && out.reelGateActive && out.reelRodPixels >= 120,
    `retract=${out.reelRetracting} gate=${out.reelGateActive} rodPx=${out.reelRodPixels}`);
  check('(c2) 浮漂到达后竿消失(原版 HackHoldStyles)', out.reelArrived && out.afterArrivalRodPixels < Math.max(40, out.rodPixels * 0.25),
    `arrived=${out.reelArrived} rodPx=${out.afterArrivalRodPixels}`);
  check('(d) 走远>900px 自动收线断线', out.farRetracting && out.farGone, `retract=${out.farRetracting} gone=${out.farGone}`);
  check('(e) 小范围走动浮漂不跟随', !out.anchorRetract && out.anchorDx < 1.5 && out.anchorDy < 1.5,
    `dx=${out.anchorDx.toFixed(2)} dy=${out.anchorDy.toFixed(2)} retract=${out.anchorRetract}`);
}
console.log(`gateActiveA=${out.gateActiveA} gateActiveB=${out.gateActiveB} gpuDegraded=${out.gpuDegraded} renderAlive=${out.renderAlive}(${out.animTickDelta}) renderMode=${out.renderMode} scene=${JSON.stringify(out.scene ?? null)}`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exitCode = fail === 0 && !out.fatal ? 0 : 1;
await browser.close();
