// 闪电之击回炉:像素级对照探针（5238）。
// 判别实验:悬浮期在 orb 中心采样（实体已知位置）vs 尸检期沿折线采样——
//   同 canvas(g.renderer.canvas)、同变换(worldToScreen×dpr)。
//   orb 缺=整类坐标错(实体层不在该 canvas);orb 在而 bolt 缺=drawBolt 特有错。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5238';
const browser = await puppeteer.launch({
  protocolTimeout: 400000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
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
  for (let i = 0; i < 4 && castTick < 0; i++) { origFixed(1 / 60); ftick++; }
  const orb = () => g.entities.projectiles.find((q) => q.projId === 1117);
  // 悬浮期逐帧:渲染帧后采 orb 中心
  for (let i = 0; i < 26; i++) {
    origFixed(1 / 60); ftick++;
    await new Promise((r) => requestAnimationFrame(r));
    const o = orb();
    if (!o || o.dead) break;
    orbSamples.push({ t: ftick - castTick, ...sampleWorld(o.cx, o.cy) });
  }
  R.dbg.orbFlight = orbSamples;

  // 尸检期:沿折线每 40px 一点,每帧采全部点取亮值
  const lineSamples = [];
  let boltSeen = null;
  while (ftick < castTick + 90) {
    origFixed(1 / 60); ftick++;
    await new Promise((r) => requestAnimationFrame(r));
    const o = orb();
    if (!o) break;
    if (o.bolt && !boltSeen) boltSeen = { pts: o.bolt.positions.length, span: Math.round(o.bolt.positions[o.bolt.positions.length - 1].y - o.bolt.positions[0].y) };
    if (o.visualT > 0 && o.bolt) {
      const pts = o.bolt.positions;
      const frameVals = [];
      for (let i = 0; i < pts.length; i += Math.ceil(pts.length / 12)) {
        const s = sampleWorld(pts[i].x, pts[i].y);
        frameVals.push(s.lum ?? -1);
      }
      lineSamples.push({ vt: o.visualT, prog: +(1 - o.visualT / (o.visualTotal ?? 45)).toFixed(2),
        maxLum: Math.max(...frameVals), lit180: frameVals.filter((v) => v > 180).length });
    }
  }
  R.dbg.boltMeta = boltSeen;
  R.dbg.lineSamples = lineSamples.filter((x, i) => i % 2 === 0).slice(0, 14);
  const flightMax = Math.max(...orbSamples.map((s) => s.lum ?? -1));
  const corpseMax = Math.max(...lineSamples.map((s) => s.maxLum));
  R.verdict = { flightOrbMaxLum: flightMax, corpseLineMaxLum: corpseMax,
    orbVisible: flightMax > 120, boltVisible: corpseMax > 150,
    diagnosis: flightMax <= 120 ? '整类坐标错(实体层不在采样 canvas)'
      : corpseMax <= 150 ? 'drawBolt 特有错(合成/坐标/门)' : '两者均可见——探针阈值问题' };
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
