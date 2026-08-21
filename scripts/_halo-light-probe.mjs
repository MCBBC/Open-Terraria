// 光照数组矩形暗区探针:同世界同位置,读 lightR/G/B 找硬边暗矩形 + 记录 GL/2D 路径
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world)) {
    if (Date.now() - t0 > 180000) return { fatal: 'timeout' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.698;
  g.player.x = 2254 * 16; g.player.y = 235 * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  await new Promise((res) => setTimeout(res, 2500));
  // 光照引擎内部:窗口+采样方片内外(屏幕方片≈原图 x360..840 → 世界 tile ≈
  // camTile-66+((360/1.349)/16) ≈ 2222..2258, y≈228..258)
  const rd = g.renderer;
  const le = g.lighting;
  const out = {
    hasGL: !!(rd.worldLightLayer && rd.worldLightLayer()),
    engineKeys: Object.keys(le).slice(0, 14),
  };
  // 找窗口与数组
  const arrR = le.r;   // LightingEngine 字段名 r/g/b
  out.win = { rx: le.rx ?? le.winX, ry: le.ry ?? le.winY, rw: le.rw ?? le.winW, rh: le.rh ?? le.winH };
  if (arrR instanceof Uint8Array && out.win.rw > 0) {
    // 采样两块(方片内 vs 外)平均
    const avg = (x0, y0) => {
      let s = 0, n = 0;
      for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) {
        const i = (y - out.win.ry) * out.win.rw + (x - out.win.rx);
        if (i >= 0 && i < arrR.length) { s += arrR[i]; n++; }
      }
      return n ? Math.round(s / n) : -1;
    };
    // 本帧暗矩形:屏幕 (840..1512, 460..560) → 世界 tile:cam=(2254,235) 中心,
    // zoom 1.349 → tile = cam + ((screen-中心)/zoom/16)
    const z = 1.349, ts = 16;
    const toTile = (sx2, sy2) => [
      Math.round(2254 + (sx2 - 1512 / 2) / z / ts),
      Math.round(235 + (sy2 - 862 / 2) / z / ts),
    ];
    const [inx, iny] = toTile(1100, 510);   // 暗矩形内
    const [onx, ony] = toTile(700, 510);    // 暗矩形外(左)
    const [upx, upy] = toTile(1100, 380);   // 暗矩形外(上)
    out.sampleAt = { in: [inx, iny], out: [onx, ony], up: [upx, upy] };
    out.inner = avg(inx, iny);
    out.outer = avg(onx, ony);
    out.outerUp = avg(upx, upy);
    // 沿 y=iny 行扫引擎数组,找暗矩形左右硬边界(值阶跃>25)
    const rowScan = [];
    for (let x = out.win.rx; x < out.win.rx + out.win.rw - 1; x++) {
      const a = arrR[(iny - out.win.ry) * out.win.rw + (x - out.win.rx)];
      const b = arrR[(iny - out.win.ry) * out.win.rw + (x + 1 - out.win.rx)];
      if (Math.abs(a - b) > 25) rowScan.push([x, a, b]);
    }
    out.rowSteps = rowScan.slice(0, 10);
  }
  // 连续 3 帧:相机左移 200px 再回——暗块世界锚定则随世界走,屏幕锚定则不动
  const cv = g.renderer.canvas;
  const grab = () => {
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    return c.toDataURL('image/png');
  };
  const shots = [];
  const camXs = [];
  shots.push(grab()); camXs.push(Math.round(g.camera.x));
  g.camera.x -= 200 * 16 / 10; g.player.x -= 200;   // 左移 200px
  await new Promise((res) => setTimeout(res, 700));
  shots.push(grab()); camXs.push(Math.round(g.camera.x));
  g.player.x += 200; g.camera.x = g.player.cx;
  await new Promise((res) => setTimeout(res, 700));
  shots.push(grab()); camXs.push(Math.round(g.camera.x));
  out.shots = shots; out.camXs = camXs;
  return out;
}, { timeout: 300000 });
console.log('engine:', JSON.stringify({ hasGL: r.hasGL, win: r.win, inner: r.inner, outer: r.outer, outerUp: r.outerUp, camXs: r.camXs }));
if (r.shots) {
  const fs = await import('node:fs');
  r.shots.forEach((b64, i) => fs.writeFileSync(`/tmp/halo-seq-${i}.png`, Buffer.from(b64.split(',')[1], 'base64')));
  console.log('shots /tmp/halo-seq-*.png');
}
await browser.close();
