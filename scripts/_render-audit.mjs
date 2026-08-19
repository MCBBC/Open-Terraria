// 渲染侧全量审计探针:DOM 画布 + 隐藏(detached)画布家族逐个计数/面积。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/audit-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
// 移动几屏把 chunk/烘焙/天气全铺开
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 254 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 8000));
const out = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer, at = g.atlas ?? r.atlas;
  const sum = (m) => {
    if (!m) return { n: -1, mpx: 0 };
    let mpx = 0;
    for (const v of m.values()) mpx += (v.width ?? 0) * (v.height ?? 0) / 1e6;
    return { n: m.size, mpx: +mpx.toFixed(1) };
  };
  const dom = [...document.querySelectorAll('canvas')].map((c) => {
    let p = c.parentElement, chain = [];
    for (let i = 0; i < 3 && p; i++) { chain.push(p.id || (typeof p.className === 'string' && p.className ? p.className.slice(0, 20) : p.tagName)); p = p.parentElement; }
    if (c.width === 1280 && !c.id) window.__mystery = { cls: c.className, style: (c.getAttribute('style') || '').slice(0, 120), z: c.style.zIndex, disp: getComputedStyle(c).display, prev: c.previousElementSibling?.tagName, next: c.nextElementSibling?.tagName };
    return `${c.width}x${c.height}${c.id ? '#' + c.id : ''}@${chain.join('/')}|vis=${!!c.offsetParent}`;
  });
  return {
    dom: dom.length, domList: dom,
    atlas_images: (() => { let cv = 0, bm = 0, other = 0; for (const v of (at?.images ?? []).values()) { if (v instanceof HTMLCanvasElement) cv++; else if (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) bm++; else other++; } return { canvas: cv, bitmap: bm, other }; })(),
    atlas_vimages_bitmap: sum(at?.vimages),
    atlas_uiimages_bitmap: sum(at?.uiimages),
    chunkPages: g.chunks.pageCount, chunkCanvases: g.chunks.pageCount * 2,
    tintAtlas: { entries: r.tintAtlas.size, pages: r.tintAtlas.pageCount },
    glfx: { texs: r.glfx?.texs?.size ?? -1, mb: +((r.glfx?.bytes ?? 0) / 1048576).toFixed(1), glCanvas: r.glfx ? `${r.glfx.canvas.width}x${r.glfx.canvas.height}` : null },
    lightCanvas: `${r.lightCanvas.width}x${r.lightCanvas.height}`,
    mystery: window.__mystery, vuiCanvas: document.getElementById('ui-canvas') ? `${document.getElementById('ui-canvas').width}x${document.getElementById('ui-canvas').height}` : null,
    cloudTint2D: r.sky.cloudTintCache?.size ?? -1,
    biomeBgTint: r.biomeBg ? 'private(实例)' : null,
    minimap: r.minimap ? { pix: !!r.minimap.pix } : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
