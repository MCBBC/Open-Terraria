// 真档 E2E：用户世界（Starter_World 存档）玻璃窑/篝火基地区域，烘焙确定性取证。
// 判据：含动画件的 chunk 在连续重烘中，【静态子区域】像素哈希是否随动画 tick 变化。
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5214', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
// 不建新角色——直接 loadJson 用户存档
const mapText = readFileSync(MAP, 'utf8');
const res = await page.evaluate(async (mapText) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(400);
  const flow = window;
  if (!flow.__swLoadJson) return { fail: 'no __swLoadJson' };
  await flow.__swLoadJson(mapText);
  // 等世界就绪
  for (let i = 0; i < 300 && !(window.__swGame?.world); i++) await wait(200);
  if (!window.__swGame?.world) return { fail: 'world not ready' };
  await wait(2000);
  return { ok: true };
}, mapText);
if (!res.ok) { console.log(JSON.stringify(res)); await browser.close(); process.exit(1); }

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 瞬移到报告区域并站定
  g.player.x = 3185 * 16 + 8 - g.player.w / 2;
  g.player.y = 381 * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await wait(800);
  // 找可见大画布
  const canvases = [...document.querySelectorAll('#game-root canvas, body > canvas')];
  const cv = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!cv || cv.getContext('webgl2')) return { fail: 'no 2d canvas' };
  const scratch = document.createElement('canvas');
  const grab = (x, y, w, h) => {
    scratch.width = w; scratch.height = h;
    const sc = scratch.getContext('2d', { willReadFrequently: true });
    sc.drawImage(cv, x, y, w, h, 0, 0, w, h);
    return sc.getImageData(0, 0, w, h).data;
  };
  const meanAbsDiff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) {
      s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return s / (a.length / 4 * 3);
  };
  // 鼠标挪开采样区（防 cursor/pulse 干扰）
  void 0;
  // 采样区：世界 tile → 屏幕坐标换算用 camera；每配置动态计算
  const tilesToScreen = (tx, ty) => {
    const cam = g.renderer.camera ?? g.camera ?? window.__swCamHack?.();
    void cam;
    return null;
  };
  void tilesToScreen;
  const cam = g.camera;
  if (!cam) return { fail: 'no camera' };
  const zOf = () => cam.zoom ?? 1;
  const viewW = cv.width, viewH = cv.height;
  const worldToScreen = (wx, wy) => [
    Math.round((wx - cam.x) * zOf() + viewW / 2),
    Math.round((wy - cam.y) * zOf() + viewH / 2),
  ];
  // 实测动画件坐标（键反查类型 id，取玩家半径内的第一处）
  const TILES = window.__swTiles;
  const st2 = g.world.store;
  const wantKeys = ['v_215_campfires', 'v_302_glass_kiln', 'v_406_chimneys', 'v_301_flesh_cloning_vat'];
  const pxT = Math.floor(g.player.cx / 16), pyT = Math.floor(g.player.cy / 16);
  let f0 = null; const found = [];
  for (const k of wantKeys) {
    const id = TILES[k];
    if (id === undefined) continue;
    outer:
    for (let y = pyT - 40; y < pyT + 40; y++) {
      for (let x = pxT - 60; x < pxT + 60; x++) {
        if (!st2.inBounds(x, y)) continue;
        if (st2.type[st2.idx(x, y)] === id) { found.push({ k, x, y }); if (!f0) f0 = { k, x, y }; break outer; }
      }
    }
  }
  if (!f0) return { fail: 'no animated emitter found near player', playerTile: [pxT, pyT], idsFound: found.map(f => f.k) };
  const mkRegion = (tcx, tcy) => {
    const [sx, sy] = worldToScreen(tcx * 16 + 8, tcy * 16 + 8);
    return { x: sx - 24, y: sy - 24, w: 48, h: 48 };
  };
  const meanRgb = (d) => {
    let r = 0, g2 = 0, b2 = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g2 += d[i + 1]; b2 += d[i + 2]; }
    return [Math.round(r / n), Math.round(g2 / n), Math.round(b2 / n)];
  };
  const selfCheck = [];
  const results = [];
  for (const zoom of [1.25, 1.6, 2.0]) {
    for (const fb of [false, true]) {
      try { g.setZoom?.(zoom); } catch { cam.zoomTarget = zoom; cam.zoom = zoom; }
      g.renderer.fullbright = fb;
      await wait(900);   // 等相机/光图稳定
      // near 区：火焰左 4 格同排；ctrl 区：左 26 格
      const A = mkRegion(f0.x - 4, f0.y), B = mkRegion(f0.x - 26, f0.y);
      const rowsA = [], rowsB = [];
      for (let k = 0; k < 40; k++) {
        const pa = grab(A.x, A.y, A.w, A.h), pb = grab(B.x, B.y, B.w, B.h);
        await wait(110);
        const na = grab(A.x, A.y, A.w, A.h), nb = grab(B.x, B.y, B.w, B.h);
        rowsA.push(meanAbsDiff(pa, na));
        rowsB.push(meanAbsDiff(pb, nb));
        if (k === 0) selfCheck.push({ at: `${zoom}/${fb}`, A: meanRgb(pa), B: meanRgb(pb) });
      }
      const stat = (arr) => ({ avg: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2), max: +Math.max(...arr).toFixed(2), nonzero: arr.filter(v => v > 0.35).length });
      results.push({ zoom, fullbright: fb, nearAnim: stat(rowsA), farCtrl: stat(rowsB) });
    }
  }
  g.renderer.fullbright = false;
  try { g.setZoom?.(1.25); } catch {}
  return { ok: true, fires: found, playerTile: [pxT, pyT], selfCheck, results };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
if (!out.ok) process.exit(1);
