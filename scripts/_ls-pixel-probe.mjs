// 闪电之击回炉:像素级对照探针（5238）。
// 判别实验:悬浮期在 orb 中心采样（实体已知位置）vs 尸检期沿折线采样——
//   同 canvas(g.renderer.canvas)、同变换(worldToScreen×dpr)。
//   orb 缺=整类坐标错(实体层不在该 canvas);orb 在而 bolt 缺=drawBolt 特有错。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5238';
const browser = await puppeteer.launch({
  protocolTimeout: 400000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader', '--enable-webgl', '--use-gl=angle'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
try {
  await page.waitForSelector('.sw-vsel', { timeout: 15000 });
} catch {
  await page.click('[data-act=sp]');
  await page.waitForSelector('.sw-vsel', { timeout: 45000 });
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('LSP');
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
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

let pageShot = null;
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { fatal: null, dbg: {} };
  const p = g.player;
  const st0 = g.world.store;
  const px = Math.floor(p.x / TILE);
  // 地表语义落地
  let sy = Math.max(5, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t2 = 0; t2 < 40; t2++) {
    p.y = sy * TILE - p.h - 2;
    if (!st0.isSolid(Math.floor(p.cx / 16), Math.floor((p.y + p.h / 2) / 16))) break;
    sy -= 1;
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 150; i++) g.fixedUpdate(1 / 60);
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  const giveItem = (vid, slot) => {
    const key = items.VANILLA_ITEM_KEY_BY_ID[vid];
    const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_${vid}_`];
    p.inv.slots[slot] = { id, stack: 1 };
    return id;
  };
  giveItem(6155, 2); p.inv.selected = 2;
  for (const q of g.entities.projectiles) q.dead = true;
  p.useTime = 0; p.itemTime = 0;

  const dpr = g.renderer.dpr || 1;
  const cv = g.renderer.canvas;

  /** 世界点 → canvas 设备像素亮度采样(3×3 域最大通道) */
  function sampleWorldRGB(wx, wy) {
    const [sxw, syw] = g.camera.worldToScreen(wx, wy);
    const x0 = Math.round(sxw * dpr), y0 = Math.round(syw * dpr);
    let mx = -1, r = 0, gg = 0, b = 0;
    try {
      const cx2 = cv.getContext('2d');
      const im = cx2.getImageData(x0 - 2, y0 - 2, 5, 5);
      for (let i = 0; i < im.data.length; i += 4) {
        const lum = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
        if (lum > mx) { mx = lum; r = im.data[i]; gg = im.data[i + 1]; b = im.data[i + 2]; }
      }
    } catch (e) { return { lum: -1, r: 0, g: 0, b: 0 }; }
    return { lum: Math.round(mx), r, g: gg, b };
  }
  function sampleWorld(wx, wy) {
    const [sxw, syw] = g.camera.worldToScreen(wx, wy);
    const x0 = Math.round(sxw * dpr), y0 = Math.round(syw * dpr);
    let mx = -1;
    try {
      const cx2 = cv.getContext('2d');
      if (!cx2) return { err: 'no-2d' };
      const im = cx2.getImageData(x0 - 2, y0 - 2, 5, 5);
      for (let i = 0; i < im.data.length; i += 4) {
        const lum = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
        if (lum > mx) mx = lum;
      }
    } catch (e) { return { err: String(e.message).slice(0, 60) }; }
    return { lum: Math.round(mx) };
  }

  // 瞄准开阔天空点(右上 200px,-60px 高)
  const txw = p.cx + 200, tyw = p.cy - 60;
  {
    const [sxw, syw] = g.camera.worldToScreen(txw, tyw);
    g.input.mouseX = sxw / dpr; g.input.mouseY = syw / dpr;
  }

  // 出手
  g.input.mouseDown = true; g.input.mouseHeld = false;
  const orbSamples = [];
  let castTick = -1, ftick = 0;
  const origFixed = g.fixedUpdate.bind(g);
  g.fixedUpdate = (dt) => { ftick++; return origFixed(dt); };
  // ★GPU 模式热身可能迟——轮询至 orb 出现（≤90t）
  for (let i = 0; i < 90 && castTick < 0; i++) {
    origFixed(1 / 60); ftick++;
    if (i < 4) continue;
    const oEarly = g.entities.projectiles.find((q) => q.projId === 1117);
    if (oEarly) { castTick = ftick; spawnPos = { x: oEarly.cx, y: oEarly.cy }; }
  }
  R.dbg.castTick = castTick;
  const orb = () => g.entities.projectiles.find((q) => q.projId === 1117);
  // 悬浮期逐帧:渲染帧后采 orb 中心
  // ★headless rAF 不跑→世界从未渲染（首轮回炉实锤:orb 中心 lum≈41 全黑）。
  //   手动驱动引擎帧:origFixed 推逻辑 + g.frame() 同步渲染,随后立即采样
  for (let i = 0; i < 26; i++) {
    origFixed(1 / 60); ftick++;
    g.frame(performance.now());
    const o = orb();
    if (!o || o.dead) break;
    orbSamples.push({ t: ftick - castTick, ...sampleWorld(o.cx, o.cy) });
  }
  R.dbg.orbFlight = orbSamples;
  // 背景对照：远离 orb 的天空点（+150,+150）同帧亮度
  try {
    const oB = orb();
    if (oB) {
      const bg = sampleWorld(oB.cx + 150, oB.cy + 150);
      R.dbg.skyBgLum = bg.lum ?? -1;
    }
  } catch {}

  // 尸检期入口：推进到 bolt 生成+视觉期，返回裁剪框（Node 层截图=合成器 ground truth）
  let clip = null;
  for (let i = 0; i < 60; i++) {
    origFixed(1 / 60); ftick++;
    g.frame(performance.now());
    const o = orb();
    if (!o) break;
    if (o.bolt && o.visualT > 0 && o.bolts && o.bolts.length > 0) {
      const [cxs, cys] = g.camera.worldToScreen(o.cx, o.cy);
      clip = { x: Math.max(0, Math.round(cxs - 220)), y: Math.max(0, Math.round(cys - 300)),
        width: 440, height: 430 };
      break;
    }
    if (o.dead) break;
  }
  R.clip = clip;
  return R;
});

// ---- Node 截图（合成器 ground truth）----
let shotClip = null;
const outA = out;
if (outA.clip) {
  shotClip = outA.clip;
}

// ---- B 段:续采样（同一页面状态延续） ----
const outB = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const dpr = g.renderer.dpr || 1;
  const cv = g.renderer.canvas;
  function sampleWorldRGB(wx, wy) {
    const [sxw, syw] = g.camera.worldToScreen(wx, wy);
    const x0 = Math.round(sxw * dpr), y0 = Math.round(syw * dpr);
    let mx = -1, r = 0, gg = 0, b = 0;
    try {
      const cx2 = cv.getContext('2d');
      const im = cx2.getImageData(x0 - 2, y0 - 2, 5, 5);
      for (let i = 0; i < im.data.length; i += 4) {
        const lum = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
        if (lum > mx) { mx = lum; r = im.data[i]; gg = im.data[i + 1]; b = im.data[i + 2]; }
      }
    } catch (e) { return { lum: -1, r: 0, g: 0, b: 0 }; }
    return { lum: Math.round(mx), r, g: gg, b };
  }
  function sampleWorld(wx, wy) {
    const [sxw, syw] = g.camera.worldToScreen(wx, wy);
    const x0 = Math.round(sxw * dpr), y0 = Math.round(syw * dpr);
    let mx = -1;
    try {
      const cx2 = cv.getContext('2d');
      if (!cx2) return { err: 'no-2d' };
      const im = cx2.getImageData(x0 - 2, y0 - 2, 5, 5);
      for (let i = 0; i < im.data.length; i += 4) {
        const lum = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
        if (lum > mx) mx = lum;
      }
    } catch (e) { return { err: String(e.message).slice(0, 60) }; }
    return { lum: Math.round(mx) };
  }
  const lineSamples = [];
  const rgbAcc = [];
  let boltSeen = null;
  let tickN = 0;
  const o0 = g.entities.projectiles.find((q) => q.projId === 1117);
  while (tickN < 50) {
    tickN++;
    g.fixedUpdate(1 / 60);
    g.frame(performance.now());
    const o = g.entities.projectiles.find((q) => q.projId === 1117);
    if (!o) break;
    if (o.bolt && !boltSeen) boltSeen = { pts: o.bolt.positions.length,
      span: Math.round(o.bolt.positions[o.bolt.positions.length - 1].y - o.bolt.positions[0].y) };
    if (o.visualT > 0 && o.bolt) {
      const pts = o.bolt.positions;
      const frameVals = [];
      let sR = 0, sG = 0, sB = 0, sN = 0;
      for (let i = 0; i < pts.length; i += Math.ceil(pts.length / 12)) {
        const s2 = sampleWorldRGB(pts[i].x, pts[i].y);
        frameVals.push(s2.lum ?? -1);
        if (s2.lum > 60) { sR += s2.r; sG += s2.g; sB += s2.b; sN++; }
      }
      if (sN > 0) rgbAcc.push({ r: sR / sN, g: sG / sN, b: sB / sN });
      lineSamples.push({ vt: o.visualT, prog: +(1 - o.visualT / (o.visualTotal ?? 45)).toFixed(2),
        maxLum: Math.max(...frameVals), lit180: frameVals.filter((v) => v > 180).length });
    }
  }
  return { boltSeen, lineSamples, rgbAcc };
});
out.dbg.boltMeta = outB.boltSeen;
if (outB.lineSamples?.length) {
  const mR = outB.rgbAcc?.reduce((x, y) => x + y.r, 0) / (outB.rgbAcc?.length || 1);
  const mG = outB.rgbAcc?.reduce((x, y) => x + y.g, 0) / (outB.rgbAcc?.length || 1);
  out.dbg.edgeRatioRG = +(mR / Math.max(1, mG)).toFixed(2);   // C2:红/绿边带比（原版≈2-3,修前≈0.9）
}
out.dbg.lineSamples = outB.lineSamples;
const flightMax = Math.max(...(outA.dbg.orbFlight || []).map((x) => x.lum ?? -1));
const corpseMax = Math.max(...(outB.lineSamples || []).map((x) => x.maxLum));
out.verdict = { flightOrbMaxLum: flightMax, corpseLineMaxLum: corpseMax,
  orbVisible: flightMax > 120, boltVisible: corpseMax > 150,
  diagnosis: flightMax <= 120 ? '整类坐标错(实体层不在采样 canvas)'
    : corpseMax <= 150 ? 'drawBolt 特有错(合成/坐标/门)' : '两者均可见——探针阈值问题' };
if (shotClip) await page.screenshot({ path: '/tmp/ls-bolt-shot.png', clip: shotClip });
console.log(JSON.stringify(out, null, 1));
await browser.close();
