// ★BJ367 记录面自检——CPU 模式下 drawImage/fillRect 是否可拦截、世界是否真绘
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR', String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', 'cpu');
  await new Promise((r) => setTimeout(r, 600));
  const stats = { draw: 0, fill: 0, ctxNames: new Set(), clear: 0 };
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__bj367sanity) {
    proto.__bj367sanity = true;
    const od = proto.drawImage, of = proto.fillRect, oc = proto.clearRect;
    proto.drawImage = function (...a) { stats.draw++; try { stats.ctxNames.add(Object.prototype.toString.call(this)); } catch { } return od.apply(this, a); };
    proto.fillRect = function (...a) { stats.fill++; return of.apply(this, a); };
    proto.clearRect = function (...a) { stats.clear++; return oc.apply(this, a); };
  }
  // 采样 5 个 rAF
  for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
  const snap1 = { draw: stats.draw, fill: stats.fill, clear: stats.clear };
  for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
  const snap2 = { draw: stats.draw, fill: stats.fill, clear: stats.clear };
  // 主 ctx 身份
  const r = g.renderer;
  return {
    cpu: r.cpuRender, snap1, snap2,
    ctxCtor: r.ctx && r.ctx.constructor && r.ctx.constructor.name,
    canvasId: r.canvas && r.canvas.id,
    ctxIsMainCanvas: r.canvas && r.ctx && r.ctx.canvas === r.canvas,
    ctxNames: [...stats.ctxNames],
    paused: g.paused,
  };
});
console.log('SANITY=' + JSON.stringify(out, null, 1));
await browser.close();
