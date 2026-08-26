// 修齐批终口探针：QueenSlime 全幅洗染（5245）。
// (p1) SM2 洗染像素差分：washed cell vs 素切片——差异像素比 >5%（pass 真生效）
// (p2) 时变方差：静态 boss 下体域亮度逐帧变化（swirl/uTime 动画在跑）
// (p3) 洗染 cell 就绪率（连续 30 帧非 null）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5245';
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
  await page.keyboard.type('QS');
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
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [], dbg: {} };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  const p = g.player;
  const st0 = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(5, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st0.isSolid(Math.floor(p.cx / 16), Math.floor((p.y + p.h / 2) / 16))) break;
    sy -= 1;
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 100; i++) g.fixedUpdate(1 / 60);
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;

  // Queen Slime 657 生成于开阔处
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const boss = Enemy.fromVanilla(657, (px + 10) * TILE, (sy - 8) * TILE);
  g.entities.add(boss, 'enemies');
  boss.hpMax = 999999; boss.hp = 999999;
  for (let i = 0; i < 160; i++) { g.fixedUpdate(1 / 60); }   // 相机 lerp 沉降

  const rc = g.renderer;
  const { NPC_GRIDS } = await import('/src/remaster/NpcGridLayouts.ts');
  const gcfg = NPC_GRIDS[657];
  let img = rc.atlas.ensureVImage('vanilla/NPC_657.png');
  for (let i = 0; i < 60 && !(img && img.width > 0); i++) {
    await new Promise((r) => setTimeout(r, 50));
    img = rc.atlas.ensureVImage('vanilla/NPC_657.png');
  }
  ck('(p0) NPC_657 表加载', !!img && img.width > 0, `w=${img ? img.width : 'null'}`);
  if (!img || !(img.width > 0)) return R;

  const perRow = gcfg.perRow ?? 16;
  const idx = (boss.ai3 ?? 0) % 16 || 0;
  const col = Math.floor(idx / perRow), row = idx % perRow;
  const sx = Math.max(0, Math.min(col * gcfg.cellW, img.width - 1));
  const sy2 = Math.max(0, Math.min(row * gcfg.cellH + ((gcfg.inflateY ?? 0) >> 1), img.height - 1));
  const sw = Math.max(1, Math.min(gcfg.cellW, img.width - sx));
  const sh = Math.max(1, Math.min(gcfg.cellH - (gcfg.inflateY ?? 0), img.height - sy2));

  // 素切片栅格
  const cvP = document.createElement('canvas'); cvP.width = sw; cvP.height = sh;
  const cxP = cvP.getContext('2d', { willReadFrequently: true });
  cxP.drawImage(img, sx, sy2, sw, sh, 0, 0, sw, sh);
  const plain = cxP.getImageData(0, 0, sw, sh).data;

  // 洗染 cell（私有方法括号访问）
  const washedCv = rc['queenSlimeWashedCell']
    ? rc['queenSlimeWashedCell'].call(rc, boss, img, gcfg, idx)
    : null;
  ck('(p1) 洗染 cell 产出（SM2 pass 执行）', !!washedCv, `type=${washedCv ? 'cv' : 'null'}`);
  if (washedCv) {
    const wx = washedCv.getContext('2d', { willReadFrequently: true });
    const washed = wx.getImageData(0, 0, washedCv.width, washedCv.height).data;
    let diff = 0, opaque = 0;
    const n = Math.min(plain.length, washed.length);
    for (let i = 0; i < n; i += 4) {
      if (plain[i + 3] > 24 || washed[i + 3] > 24) opaque++;
      if (Math.abs(plain[i] - washed[i]) + Math.abs(plain[i + 1] - washed[i + 1])
        + Math.abs(plain[i + 2] - washed[i + 2]) > 24) diff++;
    }
    const ratio = opaque > 0 ? diff / opaque : 0;
    ck('(p2) 洗染像素差分比 >5%（pass 非恒等变换）', ratio > 0.05,
      `diff/opaque=${(ratio * 100).toFixed(1)}% opaque=${opaque}`);
    R.dbg.ratio = +(ratio * 100).toFixed(1);
  }

  // (p3) 时变：两次 wash（uTime 相位差）→ 差异像素比>3%（swirl 动画在跑;
  //   主画布 2D ctx 为代理对象,readback 不可用——cell 直测绕开）
  const w1 = rc['queenSlimeWashedCell'].call(rc, boss, img, gcfg, idx);
  await new Promise((r) => setTimeout(r, 120));
  const w2 = rc['queenSlimeWashedCell'].call(rc, boss, img, gcfg, idx);
  if (!w1 || !w2) { ck('(p3) 时变 wash 双产出', false, 'null'); return R; }
  const d1 = w1.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w1.width, w1.height).data;
  const d2 = w2.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w2.width, w2.height).data;
  let diffT = 0, n2 = 0;
  for (let i = 0; i < d1.length; i += 4) {
    n2++;
    if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 20) diffT++;
  }
  const tRatio = diffT / n2;
  ck('(p3) 洗染时变：双相位 wash 差异比 >3%（swirl 动画在跑）', tRatio > 0.03,
    `tRatio=${(tRatio * 100).toFixed(1)}%`);
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== QS PROBE: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
