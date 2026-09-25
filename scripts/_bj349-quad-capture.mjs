// BJ349 quad 取证:hook bglEntShim.flush,挥砍中段收集玩家附近 quad 变换数值
// 对拍 dev(5203) vs build(4173) 的持物绘制 quad:源矩形/目标/rot/flip 逐项 diff
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4173';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  return new Promise((resolve) => {
    const g = window.__swGame;
    const shim = g.renderer?.bglEntShim;
    if (!shim) { resolve({ noShim: true, rendererKeys: Object.keys(g.renderer ?? {}).filter(k => /shim|ent/i.test(k)).join(',') }); return; }
    const frames = [];
    let capturing = false;
    const origFlush = shim.flush;
    shim.flush = function (...args) {
      if (capturing) {
        const recs = [];
        const cam = g.renderer?.camera ?? g.camera;
        const px = g.player.cx, py = g.player.cy;
        const psx = cam ? (px - cam.x) : px, psy = cam ? (py - cam.y) : py;
        for (let q = shim.head; q; q = q.next) {
          const qx = q.dx + q.dw / 2, qy = q.dy + q.dh / 2;
          if (Math.abs(qx - psx) < 64 && Math.abs(qy - psy) < 72) {
            recs.push({ t: q.tier, sx: q.sx | 0, sy: q.sy | 0, sw: q.sw | 0, sh: q.sh | 0, dx: +q.dx.toFixed(1), dy: +q.dy.toFixed(1), dw: +q.dw.toFixed(1), dh: +q.dh.toFixed(1), rot: q.rot ? +q.rot.toFixed(3) : 0, fx: q.flipX ? 1 : 0, fy: q.flipY ? 1 : 0, solid: q.solid ? 1 : 0 });
          }
        }
        frames.push({ sw: g.swing ? { t: g.swing.t, dur: g.swing.dur } : null, psx: +psx.toFixed(1), psy: +psy.toFixed(1), cam: cam ? { x: +cam.x.toFixed(1), y: +cam.y.toFixed(1) } : null, facing: g.player.facing, n: recs.length, recs: recs.slice(0, 24) });
        if (frames.length >= 10) { capturing = false; }
      }
      return origFlush.apply(this, args);
    };
    // 触发挥砍(mouse 右偏上)
    g.input.mouseX = 1360 - 200; g.input.mouseY = Math.round(860 / 2) - 60;
    g.input.mouseDown = true;
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    capturing = true;
    setTimeout(() => { shim.flush = origFlush; resolve({ frames: frames.slice(0, 10) }); }, 600);
  });
});
console.log('QUADS=' + JSON.stringify(out).slice(0, 6000));
await browser.close();
