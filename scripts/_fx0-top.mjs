// fx=0 稀有顶验证：种植一棵 fx=0 树 → 断言（a）静止（不随相位移动）
// （b）渲染 20×20 小顶（Tiles_5 (0,198) 帧）而非 80×80 大冠
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 240000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const S = window.__treeInspect;
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const setWind = (m) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(m))?.click(); };
  // 自建 store：一棵 fx=0 树（marker (0,198)，干高 5）
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = new (await import('/src/world/TileStore.ts')).TileStore(26, 44);
  const GRASS = TILE_BY_KEY['grass'], DIRT = TILE_BY_KEY['dirt'], TREE = TILE_BY_KEY['tree'];
  for (let x = 0; x < 26; x++) { st.setTile(x, 38, GRASS); for (let y = 39; y < 44; y++) st.setTile(x, y, DIRT); }
  const tx = 13;
  st.setTileSilent(tx, 32, TREE, 0, 198);      // fx=0 marker
  const pieces = [[0,0],[22,22],[0,44],[22,66],[66,176]];
  for (let k = 0; k < 5; k++) st.setTileSilent(tx, 33 + k, TREE, pieces[k][0], pieces[k][1]);
  S.store = st;
  S.tree = { x: tx, markerY: 32, grassY: 38, h: 5, pieces: [] };
  S.zoom = 4;
  const B = 33 * 16;
  const grabColumn = async () => {
    await raf(); await raf();
    const camY = B, camX = st.w * 16 / 2;
    const camRX = Math.round(camX * 4) / 4, camRY = Math.round(camY * 4) / 4;
    const rows = [];
    for (let dy = -24; dy <= 4; dy++) {
      const sx = Math.round((tx * 16 - 8 - camRX) * 4 + cv.width / 2);
      const sy = Math.round((B + dy - camRY) * 4 + cv.height / 2);
      if (sx < 0 || sy < 0 || sx + 16 >= cv.width || sy >= cv.height) { rows.push(-1); continue; }
      const d = ctx.getImageData(sx, sy, 16, 1).data;
      let op = 0;
      for (let j = 3; j < d.length; j += 4) if (d[j] > 60) op++;
      rows.push(op);
    }
    return rows;
  };
  setWind('强风');
  const a = await grabColumn();
  S.phaseOverride = 0; const b = await grabColumn();
  S.phaseOverride = 0.5; const c = await grabColumn();
  S.phaseOverride = null;
  // fx=0 应静态：三相位同列 α 剖面全同
  const same = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c);
  // 顶帧高度：marker 格（行 B−16..B）以上不应有大冠（80px=行 B−80..B 一直有 α）
  // 小顶 20px → marker 格上方 ~4px 内开始有内容，再往上为空
  setWind('静止');
  const col = await grabColumn();   // dy −24..+4，marker 底 B
  const firstOpaque = col.findIndex((v) => v > 2);
  return { same, col, firstOpaque, bRel: -24 + firstOpaque, a: a.join(','), b: b.join(','), c: c.join(',') };
});
console.log('静止(三相位恒同):', res.same, ' 首个非空行(相对 marker 底):', res.bRel, '（小顶 20px 预期 ≈ −20 上下；大冠 80px 则 ≈ −80）');
console.log('a:', res.a);
console.log('b:', res.b);
console.log('c:', res.c);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
