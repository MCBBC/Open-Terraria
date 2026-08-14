// 一次性:水体浸润效果像素取证——
// 场景:水平地面上一池水,左壁泥土/右侧依次 石头/雪/沙/半砖泥/坡面泥;
// 在"固体格邻水边缘"采样三组像素:
//   A. 固体格内贴边 2px(浸润带是否存在:期望=水体色系而非纯土色)
//   B. 固体格朝水的顶角 2×2(圆角镂空:期望=水色/背景,非土色)
//   C. 水格自身顶行(水面波:期望≠整格同色)
// SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_water-wrap.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  // 舞台:把玩家移到空中平台区域,在玩家附近搭场景
  const cx = Math.floor(p.cx / 16), cy = Math.floor(p.y / 16) - 8;
  const dirtId = window.__swFlow ? null : null;
  // 内部 tile id 直查（TILE_BY_KEY 走页面模块）
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const T = {
    dirt: TILE_BY_KEY['dirt'],
    stone: TILE_BY_KEY['stone'],
    snow: TILE_BY_KEY['snow_block'] ?? TILE_BY_KEY['snow'] ?? TILE_BY_KEY['v_147_snow_block'],
    sand: TILE_BY_KEY['sand'],
  };
  // 清出 24×10 空腔（含墙清空）+ 底板
  for (let dx = 0; dx < 24; dx++) for (let dy = 0; dy < 10; dy++) {
    const x = cx + dx, y = cy + dy, i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0);
    st.wall[i] = 0; st.liquid[i] = 0;
  }
  // 底板（y=cy+7 一行实心泥）
  for (let dx = 0; dx < 24; dx++) st.setTileSilent(cx + dx, cy + 7, T.dirt, 0, 0);
  // 五组壁列（x=cx..cx+4 各一列,高度 y=cy+3..cy+6）:泥/石/雪/沙/半砖泥
  const cols = [
    { name: 'dirt', id: T.dirt, half: false, slope: 0 },
    { name: 'stone', id: T.stone, half: false, slope: 0 },
    { name: 'snow', id: T.snow, half: false, slope: 0 },
    { name: 'sand', id: T.sand, half: false, slope: 0 },
    { name: 'dirtHalf', id: T.dirt, half: true, slope: 0 },
  ];
  for (let k = 0; k < cols.length; k++) {
    for (let dy = 3; dy <= 6; dy++) {
      const x = cx + k * 3, y = cy + dy;
      st.setTileSilent(x, y, cols[k].id, 0, 0);
      const i = st.idx(x, y);
      st.half[i] = cols[k].half;
      st.slope[i] = cols[k].slope;
    }
  }
  // 水池：每壁左侧两列灌满水（液位 255）
  for (let k = 0; k < cols.length; k++) {
    const wx0 = cx + k * 3 - 2;
    for (let dx = 0; dx < 2; dx++) {
      const x = wx0 + dx;
      if (x <= cx || x > cx + 23) continue;
      for (let dy = 5; dy <= 6; dy++) {
        const i = st.idx(x, cy + dy);
        st.liquid[i] = 255; st.liquidType[i] = 1;
      }
    }
  }
  // 整块标脏（setTileSilent 不触发烘焙钩子）+ 玩家/相机就位
  g.chunks.markDirtyArea(cx - 1, cy - 1, cx + 24, cy + 9);
  p.x = (cx + 6) * 16; p.y = (cy + 1) * 16; p.vx = 0; p.vy = 0;
  g.camera.x = p.cx; g.camera.y = p.cy;
  // 相机硬同步 + 手动渲染（headless rAF 不可靠→直接 g.render()）
  for (let t = 0; t < 6; t++) { g.fixedUpdate(1 / 60); g.render(); await new Promise((r) => setTimeout(r, 20)); }
  // 像素采样
  const cv = g.renderer.canvas;
  const shot = document.createElement('canvas');
  shot.width = cv.width; shot.height = cv.height;
  shot.getContext('2d').drawImage(cv, 0, 0);
  const sc = shot.getContext('2d');
  const cam = g.camera;
  // 世界→屏幕（含 zoom）
  const zoom = cam?.zoom ?? 1;
  const toScreen = (wx, wy) => ({
    x: Math.round((wx - cam.x) * zoom + cv.width / 2),
    y: Math.round((wy - cam.y) * zoom + cv.height / 2),
  });
  const px = (sx, sy) => {
    const d = sc.getImageData(sx, sy, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  const sample = () => {
    const rows = [];
    for (let k = 0; k < cols.length; k++) {
      const c = cols[k];
      const x = cx + k * 3;
      const solidX = x * 16, waterX = (x - 1) * 16 + 8;
      const surfY = (cy + 5) * 16;
      const a = toScreen(solidX + 2, surfY + 8);   // 壁内贴水边 2px
      const b = toScreen(solidX + 1, surfY + 1);   // 朝水顶角
      const core = toScreen(solidX + 8, surfY + 8); // 壁中心(本底色)
      const w1 = toScreen(waterX, surfY + 1);      // 水列顶行
      const w2 = toScreen(waterX, surfY + 9);
      rows.push({ col: c.name, half: c.half,
        A_edge: px(a.x, a.y), B_corner: px(b.x, b.y), core: px(core.x, core.y),
        C_top: px(w1.x, w1.y), C_below: px(w2.x, w2.y) });
    }
    return rows;
  };
  const withWater = sample();
  // 帧取证:autoFrameAt 输出 + 图集帧内顶角 alpha 扫描
  const { autoFrameAt } = await import('/src/render/VanillaTiler.ts');
  const atlas = g.renderer.atlas;
  const frameInfo = [];
  for (let k = 0; k < cols.length; k++) {
    const c = cols[k];
    const x = cx + k * 3, y = cy + 5;
    const uv = autoFrameAt(st, x, y, c.id);
    const sheet = TILE_DEFS[c.id]?.vanilla?.sheet;
    const r = atlas.vframe(sheet, uv.col, uv.row);
    let cornerAlphaSum = 0, n = 0;
    if (r) {
      const c2 = document.createElement('canvas');
      c2.width = 18; c2.height = 18;
      const cx2 = c2.getContext('2d');
      cx2.imageSmoothingEnabled = false;
      cx2.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
      const dd = cx2.getImageData(0, 0, 18, 18).data;
      // 左上角 3×3 alpha 求和（圆角镂空 → 低值）
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) { cornerAlphaSum += dd[(yy * 18 + xx) * 4 + 3]; n++; }
    }
    frameInfo.push({ col: c.name, sheet, col_: uv.col, row: uv.row, cornerAlphaAvg: n ? Math.round(cornerAlphaSum / n) : -1 });
  }
  // 对照:抽干水再采样
  for (let k = 0; k < cols.length; k++) {
    const wx0 = cx + k * 3 - 2;
    for (let dx = 0; dx < 2; dx++) {
      const x = wx0 + dx;
      if (x <= cx || x > cx + 23) continue;
      for (let dy = 5; dy <= 6; dy++) st.liquid[st.idx(x, cy + dy)] = 0;
    }
  }
  g.chunks.markDirtyArea(cx - 1, cy - 1, cx + 24, cy + 9);
  for (let t = 0; t < 6; t++) { g.fixedUpdate(1 / 60); g.render(); await new Promise((r) => setTimeout(r, 20)); }
  const noWater = sample();
  return { withWater, noWater, frameInfo, T, cam: { x: cam?.x, y: cam?.y, zoom } };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
