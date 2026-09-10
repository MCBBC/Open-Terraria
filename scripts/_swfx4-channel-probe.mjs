// SW-FX4 浏览器探针：channel 持械工具链（3098 屠夫链锯→弹 509）E2E + 溶液 5392 装填链 E2E +
// 绘制层真实 drawImage 源矩形采样（projFrames 权威切片在实机的落地验证）。
// 注：主画布可能是 OffscreenCanvas（另一原型链），两条原型都挂；rAF 渲染拍在 evaluate 之外
// ——持链弹必须活着跨 evaluate 返回,渲染帧才采得到 drawImage。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break;
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2000));

// ---- A. 屠夫链锯 3098 → 509：channel E2E（持链跨 evaluate 存活）----
const outA = await page.evaluate(async () => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const items = await import('/src/data/items.ts');
  const DEFS = items.ITEM_DEFS;
  const findId = (vid) => DEFS.findIndex((d) => d && (d.vid ?? (() => { const m = /^vi_(\d+)/.exec(d.key ?? ''); return m ? +m[1] : -1; })()) === vid);
  const diag = {};
  const sawId = findId(3098);
  diag.sawDef = DEFS[sawId]?.key ?? null;
  inv.slots[0] = { id: sawId, stack: 1 };
  g.player.selectedSlot = 0;
  const samples = [];
  window.__swfx4Samples = samples;
  const origs = [];
  for (const P of [CanvasRenderingContext2D.prototype,
    globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    const origDraw = P.drawImage;
    origs.push(origDraw);
    P.drawImage = function (img, a, b, c, d, e, f, gw, gh) {
      try {
        // ImageBitmap 无 .src（createImageBitmap 升级面）——按 509 原生 28×140 尺寸判
        if (img && (String(img.src ?? '').includes('Projectile_509')
          || (img.width === 28 && img.height === 140))) {
          samples.push({ sx: a, sy: b, sw: c, sh: d, dw: gw, dh: gh, iw: img.width, ih: img.height });
        }
      } catch { /* 忽略 */ }
      return origDraw.call(this, img, a, b, c, d, e, f, gw, gh);
    };
  }
  window.__swfx4Restore = () => {
    for (const [i, P] of [CanvasRenderingContext2D.prototype,
      globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean).entries()) {
      P.drawImage = origs[i];
    }
  };
  const { ChainsawProj } = await import('/src/entities/ChainsawProj.ts');
  window.__swfx4Refs = { ChainsawProj };
  const countSaws = () => {
    let n = 0, s = null;
    for (const e of (g.entities.projectiles ?? [])) {
      if (e instanceof ChainsawProj && !e.dead) { n++; s = s ?? e; }
    }
    return { n, s };
  };
  g.input.mouseX = 900; g.input.mouseY = 430;
  g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const held = countSaws();
  diag.heldAlive = held.n;
  diag.heldPosNearPlayer = held.s ? Math.abs(held.s.cx - g.player.cx) < 40 && Math.abs(held.s.cy - g.player.cy) < 40 : false;
  diag.heldVxPositive = held.s ? held.s.vx > 0 : false;
  diag.swingUseStyle5 = g.swing?.useStyle === 5;
  diag.swingNoGraphic = g.swing?.noGraphic === true;
  return diag;   // 【保持持链返回】
});
await new Promise((r) => setTimeout(r, 800));   // 等数个 rAF 渲染帧（弹体活着）

// ---- A2. 采样读取 + 松链 Kill + 再按重发 ----
const outA2 = await page.evaluate(() => {
  const g = window.__swGame;
  const diag = {};
  diag.drawSamples = (window.__swfx4Samples ?? []).slice(0, 6);
  const { ChainsawProj } = window.__swfx4Refs;
  const countSaws = () => {
    let n = 0;
    for (const e of (g.entities.projectiles ?? [])) if (e instanceof ChainsawProj && !e.dead) n++;
    return n;
  };
  g.input.mouseDown = false; g.input.mouseHeld = false;
  for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
  diag.releasedDead = countSaws() === 0;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
  diag.respawned = countSaws() === 1;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
  window.__swfx4Restore?.();
  return diag;
});

// ---- B. 溶液 5392 + Clentaminator 779（5307=ReefWall 墙皮,勿混）:弹药链 E2E ----
const outB = await page.evaluate(async () => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const items = await import('/src/data/items.ts');
  const DEFS = items.ITEM_DEFS;
  const findId = (vid) => DEFS.findIndex((d) => d && (d.vid ?? (() => { const m = /^vi_(\d+)/.exec(d.key ?? ''); return m ? +m[1] : -1; })()) === vid);
  const diag = {};
  const clId = findId(779), solId = findId(5392);
  diag.clDef = DEFS[clId]?.key ?? null; diag.solDef = DEFS[solId]?.key ?? null;
  if (clId >= 0 && solId >= 0) {
    inv.slots[0] = { id: clId, stack: 1 };
    inv.slots[5] = { id: solId, stack: 999 };
    g.player.selectedSlot = 0;
    const before = inv.slots[5].stack;
    g.input.mouseX = 900; g.input.mouseY = 430;
    g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const projs = [];
    let n1015 = 0;
    for (const e of (g.entities.projectiles ?? [])) {
      projs.push(e.projId);
      if (e.projId === 1015) n1015++;
    }
    diag.solutionUsed = before - inv.slots[5].stack;
    diag.projIdsSeen = [...new Set(projs)];
    diag.n1015 = n1015;
  } else {
    diag.solutionSkipped = true;
  }
  return diag;
});
console.log(JSON.stringify({ ...outA, ...outA2, ...outB }, null, 1));
await browser.close();
