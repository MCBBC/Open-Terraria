// 香蒲残影修复验证：种原版帧编码的 9 格整株 + 单格幼苗 →
// ① wrap drawImage 统计一帧内 Tiles_519 绘制次数（整株应=9：每格一次、只一段；
//    修复前 = 35 次：整株9+8段7+7段6+...+2段1 的错位顶段叠加）
// ② 中段行颜色剖面宽（残影展宽检测）
// ③ 幼苗可见（sy=1 也绘制，修复前隐形）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const ctId = Object.keys(TILE_BY_KEY).find(k => TILE_DEFS[TILE_BY_KEY[k]]?.vanilla?.sheet === 519);
  if (!ctId) return { error: 'no cattail def' };
  const ct = TILE_BY_KEY[ctId];
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  // 空中净空台 + 地板
  for (let dx = -24; dx <= 24; dx++) {
    for (let dy = -36; dy <= 0; dy++) st.setTile(bx + dx, by + dy, 0);
    st.setTile(bx + dx, by + 1, 1);
  }
  // 整株 9 格（列 bx，帧编码 1:1 原版 GrowCatTail 终态）：顶花 216 / 过渡 162 /
  // 茎 108×5 / 基座 72（frameY=0 泥土变体）
  const frames = [216, 162, 108, 108, 108, 108, 108, 72];
  // ↑ 8 格（顶 y=by-7 .. 基座 y=by）——顶花 216 与过渡 162 与 5 茎与 72 基座 = 8 格，
  //   报告实测株（216/162/108×5/72）也是 8 格高（reedInfo height 9 含基座下沿计数差）
  for (let k = 0; k < frames.length; k++) st.setTile(bx, by - (frames.length - 1 - k), ct, frames[k], 0);
  // 单格幼苗（frameX=0）在 bx+8
  st.setTile(bx + 8, by, ct, 0, 0);
  p.x = bx * 16 - 40; p.y = by * 16 - p.h; p.vx = 0; p.vy = 0;
  await new Promise(r => setTimeout(r, 800));
  // wrap drawImage：统计下一帧 Tiles_519 源绘制次数（atlas 是 ImageBitmap 无 src——
  // 经 ensureVImage 挂 Set 标记识别）
  const marked = new Set();
  const origEnsure = g.renderer.atlas.ensureVImage.bind(g.renderer.atlas);
  g.renderer.atlas.ensureVImage = (key) => {
    const img = origEnsure(key);
    if (img && String(key).includes('Tiles_519')) marked.add(img);
    return img;
  };
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  let n519 = 0, samples = [];
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (marked.has(img)) { n519++; samples.push(rest.slice(4, 8).map(Number)); }
    return orig.call(this, img, ...rest);
  };
  await new Promise(res => {           // 精确 10 帧（rAF 计数，消除 setTimeout 跳帧误差）
    let fr = 0;
    const tick = () => { if (++fr >= 10) res(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  CanvasRenderingContext2D.prototype.drawImage = orig;
  g.renderer.atlas.ensureVImage = origEnsure;
  const perFrame = n519 / 10;
  // 中段剖面（茎行）：整株单列应 ~16px 宽（1 格），残影展宽会到 24px+
  const cv = g.renderer.canvas, cam = g.camera;
  const [sx, sy] = [Math.round((bx * 16 + 8 - cam.x) * cam.zoom + cv.width / 2),
                    Math.round((by - 3) * 16 - cam.y + 0)]; // 近似——直接取格换算
  const rowY = Math.round(((by - 3) * 16 + 8 - cam.y) * cam.zoom + cv.height / 2);
  const row = g.renderer.ctx.getImageData(Math.max(0, sx - 60), rowY, 120, 1).data;
  let prof = '';
  for (let x = 0; x < 120; x++) {
    const i = x * 4;
    prof += row[i + 2] > row[i] + 20 ? '.' : '#';
  }
  const dark = prof.split('').filter(c => c === '#').length;
  return {
    stalk: { x: bx, baseY: by, cells: frames.length, perFrameDraw519: +perFrame.toFixed(1), drawsTotal: n519 },
    midRowDarkPx: dark, profile: prof,
    expectedPerFrame: frames.length + 1, // 整株 8 格 + 幼苗 1 格
    sampleRects: samples.slice(0, 3),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
