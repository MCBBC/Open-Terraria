// SW-BJ44 诊断臂：岩浆浮标内部量（vy/lAI1/flag3/fishingCheck 调用计数）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await puppeteer.launch({
  protocolTimeout: 590000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const options = await import('/src/core/Options.ts');
  for (let i = 0; i < 100; i++) {
    if (options.options?.data) { options.options.data.renderMode = 'cpu'; return; }
    await new Promise((r) => setTimeout(r, 50));
  }
});
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
const clickEl = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (el) el.click(); return !!el; }, sel);
for (let i = 0; i < 5 && !(await page.$('.sw-vsel')); i++) {
  await clickEl('[data-act=sp]');
  try { await page.waitForSelector('.sw-vsel', { timeout: 8000 }); } catch { await new Promise((r) => setTimeout(r, 1200)); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickEl('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.evaluate(() => { const el = document.querySelector('.sw-char-row input[type=text]'); if (el) { el.focus(); el.value = 'BJ44D'; el.dispatchEvent(new Event('input', { bubbles: true })); } });
  await new Promise((r) => setTimeout(r, 300));
  await clickEl('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
}
await clickEl('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickEl('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.evaluate(() => { const el = document.querySelector('[data-f=seed]'); if (el) { el.focus(); el.value = '12345'; el.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await clickEl('[data-act=create]');
} else {
  await clickEl('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const itemOfVid = (vid) => items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[vid]];
  const R = { samples: [], flags: {} };
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  const measurePond = (x, y) => {
    const liquidAt = (i, j) => (st.inBounds(i, j) ? st.liquid[st.idx(i, j)] : 0);
    let minX = x, maxX = x;
    while (minX > 10 && liquidAt(minX, y) > 0 && !st.isSolid(minX, y)) minX--;
    while (maxX < st.w - 10 && liquidAt(maxX, y) > 0 && !st.isSolid(maxX, y)) maxX++;
    let n = 0, lava = false;
    for (let i = minX; i <= maxX; i++) {
      for (let j = y; st.inBounds(i, j) && liquidAt(i, j) > 0 && !st.isSolid(i, j) && j < st.h - 10; j++) {
        n++;
        if (st.liquidType[st.idx(i, j)] === 2) lava = true;
      }
    }
    return { n, lava };
  };
  let runStart = -1, surfY = -1;
  outer:
  for (let y = st.h - 320; y < st.h - 25; y++) {
    let x = 60;
    while (x < st.w - 60) {
      const liq = st.liquid[st.idx(x, y)];
      if (liq > 60 && st.liquidType[st.idx(x, y)] === 2) {
        let e = x;
        while (e < st.w - 60 && st.liquid[st.idx(e, y)] > 60 && st.liquidType[st.idx(e, y)] === 2) e++;
        if (e - x >= 20) {
          const m = measurePond(x + ((e - x) >> 1), y);
          if (m.lava && m.n >= 75) { runStart = x; surfY = y; R.flags.pond = m; break outer; }
        }
        x = e + 1;
      } else x++;
    }
  }
  if (runStart < 0) { R.flags.fatal = 'no-lava-pool'; return R; }
  let shoreX = runStart - 1;
  while (shoreX > 20 && (st.liquid[st.idx(shoreX, surfY)] > 0 || !st.isSolid(shoreX, surfY + 1))) shoreX--;
  const mid = runStart + 10;
  const place = () => { g.player.x = shoreX * TILE - 2; g.player.y = (surfY - 3) * TILE; g.player.vx = 0; g.player.vy = 0; };
  place();
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  g.player.inv.selected = 2;
  g.player.inv.slots[2] = { id: itemOfVid(2289), stack: 1 };
  g.player.inv.slots[6] = { id: itemOfVid(4845), stack: 20 };
  g.player.inv.slots[7] = null;
  const [sx, sy] = g.camera.worldToScreen(mid * TILE, (surfY + 1) * TILE);
  g.input.mouseX = sx / (g.renderer.dpr || 1);
  g.input.mouseY = sy / (g.renderer.dpr || 1);
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const isBobber = (e) => e && e.constructor && e.constructor.name === 'Bobber';
  let b = null;
  for (let i = 0; i < 900; i++) {
    g.fixedUpdate(1 / 60);
    b = g.entities.projectiles.find((e) => isBobber(e) && !e.dead);
    if (b && b.floating && b.liquidKind === 'lava') break;
    if (i % 400 === 399) place();
  }
  if (!b || !b.floating) { R.flags.fatal = 'no-float'; return R; }
  // 计数 fishingCheck 调用（包一层原型方法）
  const proto = Object.getPrototypeOf(b);
  let fcCalls = 0, fcGate = [];
  const orig = proto.fishingCheck;
  proto.fishingCheck = function (...a) { fcCalls++; return orig.apply(this, a); };
  R.flags.landedTile = { x: Math.floor(b.cx / TILE), y: Math.floor((b.y + b.h) / TILE), liquid: st.liquid[st.idx(Math.floor(b.cx / TILE), Math.floor((b.y + b.h) / TILE))] };
  for (let i = 0; i < 4000; i++) {
    g.fixedUpdate(1 / 60);
    if (i % 100 === 0) {
      const tx = Math.floor(b.cx / TILE), ty = Math.floor(b.cy / TILE);
      R.samples.push({
        i, vy: +b.vy.toFixed(3), lAI1: Math.round(b.lAI1 ?? (b.lAI1 = 0)), biteT: b.biteT,
        cy: Math.round(b.cy), info: g.player.displayedFishingInfo ?? '',
        dead: b.dead,
        pInWater: !!g.player.inWater, pInLava: !!g.player.inLava, pCy: Math.round(g.player.cy),
        level: b.currentFishingPower ? b.currentFishingPower(g) : null,
        poleVid: b.poleVid, baitVid: b.baitVid, baitPower: b.baitPower,
        pond: measurePond(tx, ty).n,
      });
    }
    if (i % 500 === 499) place();
    if (b.biteT > 0) break;
  }
  R.flags.fcCalls = fcCalls;
  R.flags.luck = g.player.luck;
  return R;
});
console.log(JSON.stringify(out, null, 1).slice(0, 9000));
await browser.close();
