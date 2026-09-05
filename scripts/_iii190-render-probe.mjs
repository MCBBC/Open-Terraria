// IIII190 渲染探针 v2:写面继承保真刀(平台连接码 frameX/植物蘑菇帧 144/越表继承帧保帧)渲染面验证。
// 方法=【地表日光 rig】同格先后两态像素 hash(★v2 勘误:v1/CLXIV 仪 PY=400 地下无光
//   =全黑像素 hash 恒 0=空转伪证;v2 改地表日光带,像素真非零):
//   ①平台连接码:t19 fy=234 fx∈{0,54,72} 三态 hash → 素材表逐帧互异(pngjs 离线实测
//     sum 17148/19868/19460)→ 渲染端应可分;同帧复拍=稳定性对照。
//   ②蘑菇植物帧:t3 fx=144 vs fx=0 → hash 可分(frameX 144=蘑菇变体,表内可见面)。
//   ③越表继承帧:t53 f(504,36)(继承大理石帧,越沙表)vs f(0,0) → 像素全等
//     (VanillaTiler vframeAt 越表回退 (0,0),CLXIV ③ 同判;新保帧域渲染零垃圾)。
//   ④全域 pageerror/console.error 收集=warn 风暴哨兵。
// 产物 /tmp/iii190-out/render-probe.json(+render-surface.png)。
// 用法:cd game && SW_ORIGIN=http://localhost:5249 node tools/run-diag.mjs --timeout=480000 scripts/_iii190-render-probe.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push('console: ' + m.text().slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid && window.__swGame.renderer?.minimap, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const ids = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if ((s === 19 || s === 3 || s === 53) && ids[s] === undefined) ids[s] = i;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── 地表日光 rig:先锚地表(首活性格),清出日光净空带 ──
  const p0 = Math.max(80, Math.min(st.w - 200, Math.floor(g.player.x / 16)));
  let SY = 40;
  for (let y = 40; y < st.h - 300; y++) { if (st.flags[st.idx(p0 + 26, y)]) { SY = y; break; } }
  const PY = SY;                                  // 地面线(日光带内)
  for (let x = p0; x < p0 + 60; x++) for (let y = PY - 8; y <= PY; y++) st.setTile(x, y, 0);
  for (let x = p0 - 1; x <= p0 + 60; x++) for (let y = PY + 1; y <= PY + 2; y++) st.setTile(x, y, 2);
  const px0 = p0 + 4, TOP = PY - 3;
  g.player.x = (px0 - 8) * 16; g.player.y = (PY - 6) * 16; g.player.vx = 0; g.player.vy = 0;
  await sleep(1200);

  const cam = g.camera, cv = g.renderer.canvas;
  const pxs = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const hashRect = (bx, by, wT, hT) => {
    const [scx, scy] = pxs(bx * 16, by * 16);
    const w = Math.max(4, Math.round(wT * 16 * cam.zoom)), h = Math.max(4, Math.round(hT * 16 * cam.zoom));
    const x0 = Math.max(0, Math.min(scx, cv.width - w)), y0 = Math.max(0, Math.min(scy, cv.height - h));
    const d = g.renderer.ctx.getImageData(x0, y0, Math.min(w, cv.width - x0), Math.min(h, cv.height - y0)).data;
    let hsh = 0, sum = 0, nz = 0;
    for (let i = 0; i < d.length; i += 4) { hsh = (hsh * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; sum += d[i] + d[i + 1] + d[i + 2]; if (d[i + 3] > 0 || d[i] > 0) nz++; }
    return { h: hsh, sum, nz, n: d.length >> 2 };
  };
  const res = { ids, SY, px0, plat: {}, plant: {}, stale: {} };

  // ①平台连接码三态(独立槽,fx=0/54/72,fy=234)
  const platFx = [0, 54, 72];
  for (let k = 0; k < 3; k++) {
    const bx = px0 + k * 4;
    st.setTile(bx, TOP, ids[19], platFx[k], 234);
    await sleep(400);
    const h1 = hashRect(bx, TOP, 1, 1);
    await sleep(250);
    const h2 = hashRect(bx, TOP, 1, 1);
    res.plat['fx' + platFx[k]] = { ...h1, stable: h1.h === h2.h };
    st.setTile(bx, TOP, 0);
  }
  await sleep(300);
  res.plat.fx54_differs_fx0 = res.plat.fx54.h !== res.plat.fx0.h;
  res.plat.fx72_differs_fx0 = res.plat.fx72.h !== res.plat.fx0.h;
  res.plat.nonzero = res.plat.fx0.nz > 0;

  // ②蘑菇植物帧 fx=144 vs fx=0(1×1 植物格,贴石顶)
  {
    const bx = px0 + 16;
    st.setTile(bx, TOP, ids[3], 0, 0);
    await sleep(400);
    const h0 = hashRect(bx, TOP, 1, 1);
    st.setTile(bx, TOP, ids[3], 144, 0);
    await sleep(400);
    const h144 = hashRect(bx, TOP, 1, 1);
    st.setTile(bx, TOP, 0);
    res.plant = { fx0: h0, fx144: h144, differs: h0.h !== h144.h, nonzero: h0.nz > 0 };
  }

  // ③越表继承帧保帧:t53 f(504,36) vs f(0,0) → 全等(越表回退)
  {
    const bx = px0 + 22;
    st.setTile(bx, TOP, ids[53], 504, 36);
    await sleep(400);
    const hStale = hashRect(bx, TOP, 1, 1);
    st.setTile(bx, TOP, ids[53], 0, 0);
    await sleep(400);
    const hZero = hashRect(bx, TOP, 1, 1);
    st.setTile(bx, TOP, 0);
    res.stale = { stale: hStale, zero: hZero, equal: hStale.h === hZero.h, nonzero: hStale.nz > 0 };
  }

  // ④地表截图(rig 保留石底)
  g.player.x = (p0 + 26) * 16; g.player.y = (SY - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  await sleep(700);
  res.surfacePng = (() => { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0); return c2.toDataURL('image/png'); })();
  return res;
});

writeFileSync('/tmp/iii190-out/render-surface.png', out.surfacePng.replace(/^data:image\/png;base64,/, ''), 'base64');
writeFileSync('/tmp/iii190-out/render-probe.json', JSON.stringify({ ...out, surfacePng: undefined, errors: errs }, null, 1));
console.log('[iii190 render] plat=', JSON.stringify({ fx54_differs_fx0: out.plat.fx54_differs_fx0, fx72_differs_fx0: out.plat.fx72_differs_fx0, nonzero: out.plat.nonzero, stable: out.plat.fx0.stable && out.plat.fx54.stable && out.plat.fx72.stable }));
console.log('[iii190 render] plant differs=', out.plant.differs, 'nonzero=', out.plant.nonzero, ' staleEqual=', out.stale.equal, 'staleNonzero=', out.stale.nonzero, ' errors=', errs.length);
await browser.close();
