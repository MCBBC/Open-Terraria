// 水体|泥土衔接漏光定位探针:泥土池(无墙,黎明亮背景)在水面线角落逐像素审计。
// 三层数据齐采:①主画布合成(找"亮背景"像素) ②chunk tile 层(泥土帧透明像素)
// ③对照浸润带几何(哪条带该盖住)。输出漏光像素的世界px坐标 + 所在层。
// 用法: SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs --timeout=300000 scripts/_dirtwater-leak-probe.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dirtwater-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.38;
  const K = window.__swTileByKey;
  const dirt = K('dirt');
  const sx = 2082, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 16; x < sx + 34; x++) for (let y = sy - 12; y < sy + 8; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  // 泥土池:左壁 sx+0..2? 用单格厚壁:左壁 x=sx, 底 sy+4, 右壁 sx+10;内部水 sx+1..9
  for (let j = 0; j < 5; j++) { st.setTile(sx, sy + j, dirt, 0); st.setTile(sx + 10, sy + j, dirt, 0); }
  for (let k = 0; k < 11; k++) st.setTile(sx + k, sy + 5, dirt, 0);
  for (let x = sx + 1; x <= sx + 9; x++) {
    st.setLiquid(x, sy + 3, 255, 1);
    st.setLiquid(x, sy + 4, 255, 1);
  }
  g.player.x = (sx + 5) * 16; g.player.y = (sy - 6) * 16;
  window.__sx = sx; window.__sy = sy;
});
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 4; g.camera.zoomTarget = 4; });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom, sx = window.__sx, sy = window.__sy;
  const W = cv.width, H = cv.height;
  const w2sx = (wx) => Math.round(W / 2 + (wx - cam.x) * z);
  const w2sy = (wy) => Math.round(H / 2 + (wy - cam.y) * z);
  // 审计区:左壁 3 格(sy+2..sy+4) 与水面线行 sy+3;参考天空=同屏幕行左侧远空
  const rows = [];
  const refAt = (devY) => {
    const d = ctx.getImageData(w2sx((sx - 12) * 16), devY, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  // 逐世界px: 左壁格 (sx, sy+2..4) 的 16×16 + 水面格第一列
  for (const ty of [sy + 2, sy + 3, sy + 4]) {
    const line = [];
    for (let wy = 0; wy < 16; wy++) {
      const devY = w2sy(ty * 16 + wy);
      const ref = refAt(devY);
      let mark = '';
      for (let wx = 0; wx < 18; wx++) {
        const d = ctx.getImageData(w2sx(sx * 16 + wx), devY, 1, 1).data;
        const isSky = Math.abs(d[0] - ref[0]) <= 16 && Math.abs(d[1] - ref[1]) <= 16 && Math.abs(d[2] - ref[2]) <= 16;
        mark += isSky ? 'X' : (d[2] > 150 && d[2] > d[0] ? '~' : '#');
      }
      line.push(mark);
    }
    rows.push({ ty, y0: sy, lines: line.filter((l) => l.includes('X')).slice(0, 16) });
  }
  // 帧定位:该泥土格选的帧(col,row)——用与渲染同源的 autoFrameAt
  const frames = [];
  for (const ty of [sy + 1, sy + 2, sy + 3, sy + 4]) {
    const st = g.world.store;
    const i = st.idx(sx, ty);
    frames.push({ ty, type: st.type[i], liquid: st.liquid[i] });
  }
  return { rows, frames, cam: [cam.x, cam.y, z] };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/dirtwater-z4.png' });
await browser.close();
