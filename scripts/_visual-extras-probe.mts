// 视觉三件套闭环探针：火把火苗 / LiquidSlope 斜面贴合 / Glow 覆层冒烟。
// 运行：SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs --timeout=500000 scripts/_visual-extras-probe.mts
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('20260813', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未就绪'); process.exit(1); }

// ---- 布置试验场：出生点附近清空一块，搭 石台+火把 / 坡面格+水 ----
const site = await page.evaluate(() => {
  const g = window.__swGame as any;
  const st = g.world.store;
  const T = (window as any).__swTiles as Record<string, number>;
  const torch = T['torch'], stone = T['stone'] ?? 1;
  const cx = Math.floor(g.world.spawnX) + 40, cy = Math.floor(g.world.groundLevel) - 6;
  const floorY = cy + 2;
  // 清空 22×14 并搭台
  for (let y = cy - 8; y <= cy + 5; y++) {
    for (let x = cx - 11; x <= cx + 11; x++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0);
      st.setLiquid(x, y, 0, 1);
      st.wall[i] = 0;
    }
  }
  for (let x = cx - 8; x <= cx + 8; x++) st.setTile(x, floorY, stone);
  // 火把（点燃 frameX=0 / 熄灭 frameX=66 各一）
  st.setTile(cx - 3, floorY - 1, torch, 0, 0);
  st.setTile(cx + 3, floorY - 1, torch, 66, 0);
  // 坡面格 + 水池：坡面石紧贴满水格（slope=1 开放侧 = 右/上）
  const wy = floorY - 1;
  st.setTile(cx + 6, wy, stone); st.setSlope(cx + 6, wy, 1);
  for (let dx = 7; dx <= 9; dx++) for (let dy = 0; dy <= 2; dy++) st.setTile(cx + dx, wy + dy, 0);
  for (let dx = 7; dx <= 9; dx++) for (let dy = 0; dy <= 2; dy++) st.setLiquid(cx + dx, wy + dy, 255, 1);
  return { cx, cy, floorY, torch, stone, lit: { x: cx - 3, y: floorY - 1 }, unlit: { x: cx + 3, y: floorY - 1 }, slope: { x: cx + 6, y: wy } };
});
console.log('site:', JSON.stringify(site));

// 相机就位 + 等烘焙
await page.evaluate(([x, y]) => {
  const g = window.__swGame as any;
  g.player.x = x * 16; g.player.y = (y - 4) * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
}, [site.cx, site.cy]);
await new Promise((r) => setTimeout(r, 5000));

/** 采样一个 tile 格的中心 12×12 区域像素分类 */
const sampleTile = (tx: number, ty: number, label: string) => page.evaluate(([x, y, label2]) => {
  const g = window.__swGame as any;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera; const z = cam.zoom ?? 1;
  const toS = (wx: number, wy: number) => [(wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z];
  let orange = 0, blue = 0, bright = 0, dark = 0, total = 0;
  for (let py = 0; py < 16; py += 2) {
    for (let px = 0; px < 16; px += 2) {
      const [sx, sy] = toS(x * 16 + px, y * 16 + py);
      if (sx < 0 || sy < 0 || sx >= cv.width || sy >= cv.height) continue;
      const d = ctx2.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
      total++;
      const [r, gg, b] = [d[0], d[1], d[2]];
      if (r > 150 && gg > 40 && gg < 190 && b < 90 && r > gg) orange++;          // 火苗橙
      else if (b > 90 && b > r + 20 && gg < 160) blue++;                          // 水
      else if (r + gg + b > 420) bright++;
      else if (r + gg + b < 90) dark++;
    }
  }
  return { label: label2, total, orange, blue, bright, dark };
}, [tx, ty, label]);

// ---- ① 火把火苗：点燃格上部应有橙火苗像素；熄灭格不应有 ----
const lit = await sampleTile(site.lit.x, site.lit.y, 'lit-torch');
const unlit = await sampleTile(site.unlit.x, site.unlit.y, 'unlit-torch');
console.log('torch:', JSON.stringify(lit), JSON.stringify(unlit));
console.log(`  火苗判定: lit.orange=${lit.orange} > 0 → ${lit.orange > 0 ? 'PASS' : 'FAIL'}` +
  `；unlit.orange=${unlit.orange} == 0 → ${unlit.orange === 0 ? 'PASS' : 'FAIL'}`);

// ---- ② LiquidSlope：slope=1 格 + 右邻满水 → 格内应出现水色像素（斜面带） ----
const slopeCell = await sampleTile(site.slope.x, site.slope.y, 'slope-cell');
const waterCell = await sampleTile(site.slope.x + 2, site.slope.y, 'water-cell');
console.log('liquidSlope:', JSON.stringify(slopeCell), JSON.stringify(waterCell));
console.log(`  斜面判定: slope-cell blue=${slopeCell.blue} > 0 → ${slopeCell.blue > 0 ? 'PASS' : 'FAIL'}` +
  `（水格对照 blue=${waterCell.blue}）`);

// ---- ③ Glow 冒烟：召唤 24 火焰小鬼（Glow_360, a=opacity）+ 160 松露人（Glow_128a2），
//         断言无 pageerror 且表项可从页面模块图取到 ----
const glow = await page.evaluate(async () => {
  const g = window.__swGame as any;
  const mod = await import('/src/render/Renderer.ts');
  const entries = mod.Renderer.npcGlowEntries();
  const r1 = g.debugSpawnNpc(24, 1, false);
  const r2 = g.debugSpawnNpc(160, 1, false);
  await new Promise((r) => setTimeout(r, 1500));
  const npcs = g.entities.enemies.filter((e: any) => e.vanillaId === 24 || e.vanillaId === 160).length;
  return { entries: entries.length, has360: entries.some((e: any) => e[0] === 24), has160: entries.some((e: any) => e[0] === 160), spawnErr: [r1, r2], npcs };
});
console.log('glow:', JSON.stringify(glow));
console.log(`  表判定: entries>=50 → ${glow.entries >= 50 ? 'PASS' : 'FAIL'}；24/160 在表 → ${glow.has360 && glow.has160 ? 'PASS' : 'FAIL'}；` +
  `实体渲染 ${glow.npcs} 个；pageerror ${errors.length} 条`);
if (errors.length) console.log('pageerrors:', errors.slice(0, 5));
await browser.close();
