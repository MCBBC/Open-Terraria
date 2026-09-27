// BJ375 残影像素隔离实验：页内直调 drawProjGhosts 合成环画 666 残影，
// 与「整图旋转参照」「本体缺省支」并排，dataURL 读回拼图。
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 900, height: 640 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 60000 });
const data = await page.evaluate(async () => {
  const GT = await import('/src/entities/projGhostTrail.ts');
  const A = await import('/src/entities/Arrow.ts');
  const spr = A.projSprite(666);
  if (!spr) {
    // 等懒加载
    for (let i = 0; i < 50 && !A.projSprite(666); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const tex = A.projSprite(666);
  const info = { tex: tex ? { w: tex.width, h: tex.height } : null, frames: A.projFrameCount(666) };
  // 画布：三行
  const cv = document.createElement('canvas');
  cv.width = 860; cv.height = 600;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#204a87;';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#204a87'; ctx.fillRect(0, 0, 860, 600);
  ctx.imageSmoothingEnabled = false;

  const label = (t, y) => { ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(t, 10, y); };

  // ---- 行1：参照=整图直画（不旋转）+ 整图旋转 π/2（本体缺省支姿态）
  ctx.save(); ctx.translate(80, 90); ctx.scale(4, 4); ctx.drawImage(tex, -7, -14); ctx.restore();
  label('ref: raw 14x28 x4', 160);
  ctx.save(); ctx.translate(260, 90); ctx.scale(4, 4); ctx.rotate(Math.PI / 2); ctx.drawImage(tex, -7, -14); ctx.restore();
  label('ref: rot+PI/2 x4', 160);

  // ---- 行2：drawProjGhosts 合成环（水平向右飞，模拟 6 拍）
  const ring = new GT.ProjGhostRing(666);   // TrailCacheLength 缺省 10
  for (let t = 0; t <= 6; t++) ring.record(200 + t * 15, 260, Math.atan2(0, 15), 1, false);
  ctx.save();
  GT.drawProjGhosts(ctx, {
    ring,
    id: 666,
    tex,
    frames: 1,
    frame: 0,
    bodyW: 16, bodyH: 16,
    bodyRot: Math.atan2(0, 15) + Math.PI / 2,
    bodyScale: 1,
    bodyAlpha: 200 / 255,
    ai0: 0, ai1: 0,
    timeLeft: 3600,
    opacity: 1,
    vxLen: 15,
    spriteDirection: 1,
  });
  ctx.restore();
  label('drawProjGhosts id=666 ring6 vx15', 420);

  // ---- 行3：drawProjGhosts 但只画 slot=1（大档）放大 4x 看形
  const ring2 = new GT.ProjGhostRing(666);
  for (let t = 0; t <= 6; t++) ring2.record(500 + t * 15, 260, 0, 1, false);
  ctx.save(); ctx.translate(0, 420); ctx.scale(4, 4); ctx.translate(0, 0);
  GT.drawProjGhosts(ctx, {
    ring: ring2,
    id: 666,
    tex,
    frames: 1,
    frame: 0,
    bodyW: 16, bodyH: 16,
    bodyRot: Math.PI / 2,
    bodyScale: 1,
    bodyAlpha: 200 / 255,
    ai0: 0, ai1: 0,
    timeLeft: 3600,
    opacity: 1,
    vxLen: 15,
    spriteDirection: 1,
  });
  ctx.restore();
  label('drawProjGhosts x4 zoom', 580);
  return { info, url: cv.toDataURL('image/png') };
});
const img = Buffer.from(data.url.split(',')[1], 'base64');
writeFileSync('/tmp/bj375-ghost-lab.png', img);
console.log(JSON.stringify(data.info));
await browser.close();
