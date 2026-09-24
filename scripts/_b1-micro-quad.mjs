// ★B1 微测:quadExact vs 2D drawImage 最近邻映射（合成 256 源;缩放相位矩阵）。
// 运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs scripts/_b1-micro-quad.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5209';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
await pump(page, 20);
await page.evaluate(() => { window.__swGame.running = false; });

const out = await page.evaluate(async () => {
  const r = window.__swGame.renderer;
  const pipe = r['swPipe'];
  const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');
  const layer = new GLSpriteLayer(pipe, false);
  if (layer.unavailable) return { err: 'layer unavailable' };
  // 合成 1024² 页:texel(x,y) = R=x mod 256, G=y mod 256, B=(x>>8)|((y>>8)<<2)×60, A=255
  const pg = document.createElement('canvas');
  pg.width = 1024; pg.height = 1024;
  const pc = pg.getContext('2d', { willReadFrequently: true });
  const img = pc.createImageData(1024, 1024);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    img.data[i] = x & 255; img.data[i + 1] = y & 255;
    img.data[i + 2] = (((x >> 8) & 3) | (((y >> 8) & 3) << 2)) * 30;
    img.data[i + 3] = 255;
  }
  pc.putImageData(img, 0, 0);
  const e = layer.texFromImage('__micro', pg, false, true);
  if (!e) return { err: 'texFromImage failed' };
  // 半透明源第二组（α 梯度:α = (x&255)）
  const pg2 = document.createElement('canvas');
  pg2.width = 1024; pg2.height = 1024;
  const pc2 = pg2.getContext('2d', { willReadFrequently: true });
  const img2 = pc2.createImageData(1024, 1024);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    img2.data[i] = 200; img2.data[i + 1] = 100; img2.data[i + 2] = 50;
    img2.data[i + 3] = x & 255;
  }
  pc2.putImageData(img2, 0, 0);
  const e2 = layer.texFromImage('__microA', pg2, false, true);

  const results = [];
  for (const [tag, W, H, entry, src, ox, oy, useTile] of [
    ['z1.25', 320, 320, e, pg, 0, 0, false], ['z1.27', 325, 325, e, pg, 0, 0, false], ['z1.5625', 400, 400, e, pg, 0, 0, false],
    ['z2', 512, 512, e, pg, 0, 0, false], ['k0.5(z1.25)', 160, 160, e, pg, 0, 0, false], ['k0.5·αgrad', 160, 160, e2, pg2, 0, 0, false],
    ['z1.27·αgrad', 325, 325, e2, pg2, 0, 0, false],
    // 大 offset（游戏实态:dst 落 1000+/500+;varying 插值误差随绝对坐标增大）
    ['tile·z1.27·off', 325, 325, e, pg, 955, 475, true], ['tile·z1.25·off', 320, 320, e, pg, 960, 480, true],
    ['tile·k0.5·off', 160, 160, e, pg, 1120, 640, true], ['tile·z1.5625·off', 400, 400, e, pg, 880, 400, true],
    ['tile·z1.27·off·α', 325, 325, e2, pg2, 955, 475, true],
  ]) {
    // GL 路径:begin→quad(Exact/Tile)→end(present)→drawImage 读回
    // （offset 案:画布加犬至 (ox+W,oy+H),quad 落 (ox,oy),读回同子矩形）
    const cw = W + ox, ch = H + oy;
    layer.resize(cw, ch);
    layer.begin('__microFbo');
    if (layer.unavailable) return { err: 'begin failed' };
    const ok = useTile
      ? layer.quadTile(entry, 0, 0, 256, 256, ox, oy, W, H)
      : (layer.quadExact(entry, 0, 0, 256, 256, ox, oy, W, H), true);
    if (!ok) return { err: 'quadTile failed' };
    layer.end();
    const glCv = document.createElement('canvas');
    glCv.width = W; glCv.height = H;
    const gx = glCv.getContext('2d', { willReadFrequently: true });
    gx.drawImage(layer.canvas, ox, oy, W, H, 0, 0, W, H);
    const gd = gx.getImageData(0, 0, W, H).data;
    // 2D 参照
    const cv2 = document.createElement('canvas');
    cv2.width = W; cv2.height = H;
    const x2 = cv2.getContext('2d', { willReadFrequently: true });
    x2.imageSmoothingEnabled = false;
    x2.drawImage(src, 0, 0, 256, 256, 0, 0, W, H);
    const dd = x2.getImageData(0, 0, W, H).data;
    let n = 0, maxd = 0, first = null;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      let d = 0;
      for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(gd[i + c] - dd[i + c]));
      if (d > 0) {
        n++; if (d > maxd) maxd = d;
        if (!first) first = { px, py, GL: [gd[i], gd[i + 1], gd[i + 2], gd[i + 3]], D2: [dd[i], dd[i + 1], dd[i + 2], dd[i + 3]] };
      }
    }
    results.push({ tag, W, H, n, maxd, first });
  }
  layer.dispose();
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
