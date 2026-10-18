// drawImage 追踪:标记格屏幕矩形内一帧内所有 drawImage 调用(带贴图身份+源/目标矩形),
// 判定每一像素由哪层画(浸润带 Liquid_N / 水体 Misc_water_N / 贴图 Tiles_N)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (5).json')), 'utf8');
const cells = JSON.parse(process.env.SW_CELLS ?? '[[879,284],[846,280]]');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile12'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

for (const [mx, my] of cells) {
  const trace = await page.evaluate(async (mx, my) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = mx * 16 + 8; g.player.y = (my + 10) * 16 + 8;
    g.camera.setZoomTarget(2); g.camera.zoom = 2;
    g.camera.follow = function () {};
    g.camera.x = mx * 16 + 8; g.camera.y = my * 16 + 8;
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
    await new Promise((r) => setTimeout(r, 1800));
    // 标记格屏幕矩形(世界层画布坐标系 = viewW/viewH CSS px,无 DPR——按 worldToScreen)
    const [cx0, cy0] = g.camera.worldToScreen(mx * 16, my * 16);
    const [cx1, cy1] = g.camera.worldToScreen(mx * 16 + 16, my * 16 + 16);
    const logs = [];
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    let seq = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      try {
        // 9 参形态:sx,sy,sw,sh,dx,dy,dw,dh;3 参:dx,dy;5 参:dx,dy,dw,dh
        let dx, dy, dw, dh, sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (rest.length >= 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = rest; }
        else if (rest.length === 4) { [dx, dy, dw, dh] = rest; }
        else { [dx, dy] = rest; dw = img.width; dh = img.height; }
        const t = this.getTransform();
        const rx = t.a * dx + t.c * dy + t.e, ry = t.b * dx + t.d * dy + t.f;
        const rw2 = t.a * dw, rh2 = t.d * dh;
        // 命中条件二选一:屏幕矩形(主画布)或世界矩形(chunk 烘焙画布,恒等变换)
        const wx0 = mx * 16, wy0 = my * 16, wx1 = wx0 + 16, wy1 = wy0 + 16;
        const hitScreen = rx < cx1 && rx + rw2 > cx0 && ry < cy1 && ry + rh2 > cy0;
        const small = this.canvas.width <= 1024 && this.canvas.height <= 1024;
        const rdx = dx, rdy = dy;
        const hitWorld = small && rdx < wx1 + 64 && rdx + dw > wx0 - 64 && rdy < wy1 + 64 && rdy + dh > wy0 - 64;
        if (hitScreen || hitWorld) {
          const id = img.src ? img.src.split('/').pop().replace(/\?.*$/, '')
            : (img._swId || (img._swId = 'canvas_' + (++seq)));
          const dworld = hitWorld && !hitScreen;
          logs.push({ id, s: [sx, sy, sw, sh], d: dworld ? [Math.round(dx - wx0), Math.round(dy - wy0), Math.round(dw), Math.round(dh)] : [Math.round(rx), Math.round(ry), Math.round(rw2), Math.round(rh2)], raw: [Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh)], w: dworld ? 1 : 0, cv: this.canvas.width + 'x' + this.canvas.height });
        }
      } catch { }
      return orig.apply(this, [img, ...rest]);
    };
    // 先武装补丁,再赶走相机逼 chunk 重烘,回来后继续捕获
    const cX = g.camera.x, cY = g.camera.y;
    g.camera.x = cX + 6000; g.camera.y = cY + 2000;
    await new Promise((r) => setTimeout(r, 1200));
    g.camera.x = cX; g.camera.y = cY;
    await new Promise((r) => setTimeout(r, 700));
    CanvasRenderingContext2D.prototype.drawImage = orig;
    // 去重(每帧重复的同一调用只留一次)
    const seen = new Set();
    const uniq = logs.filter((l) => { const k = JSON.stringify(l); if (seen.has(k)) return false; seen.add(k); return true; });
    return { cell: [mx, my], screen: [cx0, cy0, cx1, cy1], draws: uniq };
  }, mx, my);
  console.log(`\n== cell (${trace.cell[0]},${trace.cell[1]}) screen=[${trace.screen.map((v) => Math.round(v)).join(',')}] draws=${trace.draws.length}`);
  for (const d of trace.draws) {
    console.log(`  ${d.w ? '[world]' : '[screen]'} ${String(d.id).padEnd(16)} src=${JSON.stringify(d.s)} dst=${JSON.stringify(d.d)} raw=${JSON.stringify(d.raw)} cv=${d.cv}`);
  }
}
await browser.close();
