import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1024, height: 720 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERR', String(e.message).slice(0, 150)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5237') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('p0dbg', 2400, 1000, () => {}); });
await new Promise((r) => setTimeout(r, 1200));
const armed = await page.evaluate(async () => {
  const { GLShimExecutor } = await import('/src/render/glshim/GLShimExecutor.ts');
  const { Arrow, projSprite, projSpriteHealth } = await import('/src/entities/Arrow.ts');
  const g = window.__swGame;
  const P = GLShimExecutor.prototype;
  const probe = {
    attachAccN: 0, exTotalDraw: 0, exDraw14x20: 0, exStroke: 0,
    rawDraw14x20: 0, rawStrokeBig: 0, rawStrokeSmall: 0, arrowDrawN: 0, arrowImgReady: 0,
  };
  if (!P.__dbg) {
    const oAtt = P.attachAcc;
    P.attachAcc = function (...a) { probe.attachAccN++; return oAtt.apply(this, a); };
    const oDraw = P.drawImage;
    P.drawImage = function (img, ...rest) {
      probe.exTotalDraw++;
      try { if (img && img.width === 14 && img.height === 20) probe.exDraw14x20++; } catch {}
      return oDraw.apply(this, [img, ...rest]);
    };
    const oTail = P.accTailOp;
    P.accTailOp = function (op) { if (op === 'stroke') probe.exStroke++; return oTail.apply(this, arguments); };
    P.__dbg = true;
  }
  const RP = CanvasRenderingContext2D.prototype;
  if (!RP.__dbg) {
    const oRDraw = RP.drawImage;
    RP.drawImage = function (img, ...rest) {
      try { if (img && img.width === 14 && img.height === 20) probe.rawDraw14x20++; } catch {}
      return oRDraw.apply(this, [img, ...rest]);
    };
    const oRStroke = RP.stroke;
    RP.stroke = function (...a) {
      try { const w = (this.canvas && this.canvas.width) || 0; if (w >= 900) probe.rawStrokeBig++; else probe.rawStrokeSmall++; } catch {}
      return oRStroke.apply(this, a);
    };
    RP.__dbg = true;
  }
  const oAD = Arrow.prototype.draw;
  Arrow.prototype.draw = function (...a) {
    probe.arrowDrawN++;
    const img = projSprite(this.projId);
    if (img) probe.arrowImgReady++;
    return oAD.apply(this, a);
  };
  // 踢加载+等贴图就绪再放样（排除加载窗噪声）
  projSprite(618);
  for (let i = 0; i < 100 && !(projSpriteHealth([618])[0]?.cached); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const sprAtSpawn = projSpriteHealth([618])[0];
  const px = g.player.x + g.player.w / 2, py = g.player.y - 60;
  const spawned = [];
  for (let k = 0; k < 3; k++) {
    const a = new Arrow(px + k * 16, py, 0, 0, 20, 0, 618, null);
    g.entities.add(a, 'projectiles');
    spawned.push(a);
  }
  window.__dbgSpawned = spawned;
  window.__dbgProbe = probe;
  return { sprAtSpawn, attachAccN: probe.attachAccN };
});
await new Promise((r) => setTimeout(r, 2000));
const result = await page.evaluate(() => {
  const alive = (window.__dbgSpawned ?? []).filter((a) => !a.dead).length;
  return { alive, probe: window.__dbgProbe ?? null };
});
console.log('armed:', JSON.stringify(armed));
console.log('result:', JSON.stringify(result));
await browser.close();
