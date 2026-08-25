// R34-LS 诊断:march 阻挡点定位 + (e) 节奏阻塞源
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5231';
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
  await page.keyboard.type('LSD');
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
  const R = {};
  const p = g.player;
  const sy = g.world.groundLevel;
  const px = Math.floor(p.x / TILE);
  p.x = px * TILE; p.y = sy * TILE - p.h; p.vx = 0; p.vy = 0;
  const key = items.VANILLA_ITEM_KEY_BY_ID[6155];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_6155_`];
  p.inv.slots[2] = { id, stack: 1 };
  p.inv.selected = 2;
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  for (const q of g.entities.projectiles) q.dead = true;
  p.useTime = 0; p.itemTime = 0;

  // 目标点：右方 240px、与玩家同高（水平瞄准，排除地形起伏）
  const txw = p.cx + 240, tyw = p.cy;
  // 相机偏移诊断
  const [scx, scy] = g.camera.worldToScreen(p.cx, p.cy);
  R.camOffset = { px: Math.round(scx - g.renderer.canvas.width / 2 / (g.renderer.dpr || 1)),
    py: Math.round(scy - g.renderer.canvas.height / 2 / (g.renderer.dpr || 1)) };
  const [msx, msy] = g.camera.worldToScreen(txw, tyw);
  g.input.mouseX = msx / (g.renderer.dpr || 1);
  g.input.mouseY = msy / (g.renderer.dpr || 1);

  // 复刻 march 并记录每步 LOS
  const st = g.store ?? null;
  const los = (x, y) => {
    // 经 Game 实例的私有方法不可达——用 LineOfSight.canHitLine 直连同语义
    return import('/src/physics/LineOfSight.ts').then((m) => m.canHitLine(g.world.store,
      p.cx, p.cy, 0, 0, x, y, 0, 0));
  };
  const steps = [];
  let sx = p.cx, syy = p.cy;
  const dxm = txw - p.cx, dym = tyw - p.cy;
  const dl = Math.hypot(dxm, dym) || 1;
  const stepX = dxm / dl * 8, stepY = dym / dl * 8;
  for (let k = 1; k <= 60; k++) {
    sx += stepX; syy += stepY;
    const ok = await los(sx, syy);
    steps.push({ k, x: Math.round(sx), y: Math.round(syy), ok });
    if (!ok) break;
  }
  R.march = steps.slice(-3);
  // 阻挡格详情
  const lastBad = steps.find((x) => !x.ok);
  if (lastBad) {
    const txx = Math.floor(lastBad.x / 16), tyy = Math.floor(lastBad.y / 16);
    const sto = g.world.store;
    R.blockTile = { tx: txx, ty: tyy, type: sto.type[sto.idx(txx, tyy)],
      solid: sto.isSolid(txx, tyy) };
  }
  // 玩家中心格状态
  R.playerTile = { tx: Math.floor(p.cx / 16), ty: Math.floor(p.cy / 16),
    solid: g.world.store.isSolid(Math.floor(p.cx / 16), Math.floor(p.cy / 16)) };

  // ---- (e) 节奏阻塞源:清 swing 后持按 260t,记录全部 add ----
  for (const q of g.entities.projectiles) q.dead = true;
  p.useTime = 0; p.itemTime = 0;
  if ('swing' in g) g.swing = null;
  const adds = [];
  const oa = g.entities.add.bind(g.entities);
  g.entities.add = (e, b) => { adds.push({ pid: e?.projId ?? e?.constructor?.name, t: adds.length }); return oa(e, b); };
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.input.mouseX = msx / (g.renderer.dpr || 1);
  g.input.mouseY = msy / (g.renderer.dpr || 1);
  const marks = [];
  for (let t = 0; t < 260; t++) {
    g.fixedUpdate(1 / 60);
    if (adds.some((a) => a.pid === 1117) && marks.length === adds.filter((a) => a.pid === 1117).length - 0) {
      marks.push(t);
    }
  }
  g.entities.add = oa;
  release: {}
  R.e = { addsTotal: adds.length,
    n1117: adds.filter((a) => a.pid === 1117).length,
    mana: p.mana, ut: p.useTime, slow: !!p.slowMagicUse };
  void marks;
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
