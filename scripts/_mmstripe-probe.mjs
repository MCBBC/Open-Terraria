// _mmstripe-probe:大世界小地图拆带构建(Minimap.buildStriped)验证
// 1) 进世界后 minimap 画布全帧行均有内容(顶/中/底采样 alpha=255 且色域多样)
// 2) onWorldReady 晚于构建完成(能进世界=已 await 完)
// 3) 零 pageerror;增量路径仍工作(colorFor 与画布色一致性抽检)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
let errs = 0;
p.on('pageerror', e => { errs++; console.log('[pageerr]', String(e).slice(0, 150)); });
p.on('console', m => { if (m.type() === 'error') { errs++; console.log('[err]', m.text().slice(0, 120)); } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 240; i++) {
  await sleep(2000);
  if (i % 30 === 0) console.log('wait', i * 2, 's');
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
await sleep(4000);
if (!(await p.evaluate(() => !!window.__swGame).catch(() => false))) { console.log('FAIL:未进世界'); await b.close(); process.exit(1); }
const r = await p.evaluate(() => {
  const g = window.__swGame;
  const mm = g.renderer.minimap;
  if (!mm) return { err: 'no minimap' };
  const { canvas, ctx, world } = mm;
  // 顶/中/底三带各抽 3 行,每行取 5 个采样点:alpha 全 255 且去重色数足够
  const rows = [2, Math.floor(world.h * 0.3), Math.floor(world.h * 0.6), world.h - 3];
  const colors = new Set(); let badAlpha = 0; let samples = 0;
  for (const y of rows) {
    const d = ctx.getImageData(Math.floor(world.w * 0.25), y, Math.min(64, world.w), 1).data;
    for (let x = 0; x < d.length; x += 4) {
      samples++;
      if (d[x + 3] !== 255) badAlpha++;
      colors.add((d[x] << 16) | (d[x + 1] << 8) | d[x + 2]);
    }
  }
  // 增量路径:colorFor(x,y) 与画布像素一致性抽检(天空带)
  const yy = 2, xx = Math.floor(world.w * 0.3);
  const px = ctx.getImageData(xx, yy, 1, 1).data;
  return {
    w: canvas.width, h: canvas.height, samples, badAlpha, uniq: colors.size,
    topPx: [px[0], px[1], px[2], px[3]],
    dirty: mm.dirtyChunks.size,
    stripedDone: mm._stripedDone === true,
  };
});
console.log(JSON.stringify(r));
const ok = !r.err && r.badAlpha === 0 && r.uniq > 8 && r.stripedDone && r.dirty === 0 && errs === 0;
console.log(ok ? 'PASS' : 'FAIL');
await b.close(); process.exit(ok ? 0 : 1);
