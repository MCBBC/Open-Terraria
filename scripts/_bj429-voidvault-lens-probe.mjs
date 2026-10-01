// ★BJ429 虚空保险库悬浮透镜实机探针：放置库体 → 截图 → 像素判定（悬浮体回归+底座不回退）。
// 场景：正午地表（freezeClock tod=0.5）、关欢迎弹窗、玩家就位物品射程内。
// SW_ORIGIN=http://localhost:5690 node tools/run-diag.mjs scripts/_bj429-voidvault-lens-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');   // game/ → 项目根
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'bj429');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
// 关欢迎弹窗 + 正午冻结
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await freezeClock(page, { tod: 0.5 });
await new Promise((r) => setTimeout(r, 600));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// ---- A. 地表放置虚空保险库（物品路径优先,store 直写兜底）----
const place = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const VAULT = TILE_BY_KEY['v_491_void_vault'];
  const solidAt = (x, y) => {
    const i = st.idx(x, y);
    return st.type[i] !== 0 && (st.flags[i] & 1) !== 0;
  };
  // 玩家挪到目标列左侧,目标=玩家右 3 格地表（物品射程内）
  const px0 = Math.floor(p.cx / 16) + 3;
  let gy = 4;                                    // 自天而降找首个实心=地表顶
  for (let yy = 4; yy < 600; yy++) { if (solidAt(px0 + 1, yy)) { gy = yy; break; } }
  const top = gy - 3;                            // 库体顶行（底行 gy-1 坐在实心 gy 上）
  p.x = (px0 - 3) * 16; p.y = (gy - 4) * 16 - 50; p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 700));  // 相机/落地 settle
  // 清出库体+透镜外溢空域（不含参照域:参照域取库顶上方 3 格处,一并清）
  for (let yy = gy - 9; yy <= gy - 1; yy++) {
    for (let xx = px0 - 2; xx <= px0 + 4; xx++) st.setTileSilent(xx, yy, 0);
  }
  // A1 物品路径：给 4076 → 瞄准底行中格 → use
  const key = Object.keys(window.__swItems).find((k) => /^vi_4076_/.test(k));
  let itemPlaced = false;
  if (key) {
    p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
    p.inv.selected = 0; p.useTime = 0;
    const [sx, sy] = g.camera.worldToScreen((px0 + 1) * 16 + 8, (gy - 1) * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.mouseDown = true;
    await new Promise((r) => setTimeout(r, 400));
    g.input.mouseDown = false;
    await new Promise((r) => setTimeout(r, 150));
    itemPlaced = st.type[st.idx(px0 + 1, top)] === VAULT;
  }
  // A2 store 直写兜底/补齐（帧面=TileObjectData Style3x3 placeStyle0）
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      st.setTileSilent(px0 + dx, top + dy, VAULT, dx * 18, dy * 18);
    }
  }
  let framesOk = true;
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const i = st.idx(px0 + dx, top + dy);
      if (st.type[i] !== VAULT || st.frameX[i] !== dx * 18 || st.frameY[i] !== dy * 18) framesOk = false;
    }
  }
  await new Promise((r) => setTimeout(r, 800));  // 相机 settle
  const [lsx, lsy] = g.camera.worldToScreen((px0 + 1) * 16 + 8, (top + 1) * 16 + 6);   // 透镜心
  const [bsx, bsy] = g.camera.worldToScreen((px0 + 1) * 16 + 8, (top + 2) * 16 + 10);  // 底座带
  const [skx, sky] = g.camera.worldToScreen((px0 + 1) * 16 + 8, (top - 3) * 16);       // 上方参照域
  return { itemPlaced, framesOk, lsx, lsy, bsx, bsy, skx, sky, gy, top };
});
check('放置:库体 3×3 帧面正确（fx/fy=18 格距）', place.framesOk, `item路径=${place.itemPlaced} gy=${place.gy}`);

// ---- B. 截图 + 像素判定 ----
await new Promise((r) => setTimeout(r, 400));
writeFileSync(join(OUT, 'bj429-voidvault-live-full.png'), await page.screenshot({ encoding: 'binary' }));
const clip = async (name, x, y, w, h) => {
  const buf = await page.screenshot({ encoding: 'binary', clip: { x, y, width: w, height: h } });
  writeFileSync(join(OUT, name), buf);
  return PNG.sync.read(buf);
};
const lensPng = await clip('bj429-lens-clip.png', place.lsx - 40, place.lsy - 45, 80, 80);
const basePng = await clip('bj429-base-clip.png', place.bsx - 30, place.bsy - 16, 60, 32);
const skyPng = await clip('bj429-sky-ref-clip.png', place.skx - 30, place.sky - 16, 60, 32);
const countWarm = (img) => {
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 4], g2 = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    if (r > 180 && g2 > 120 && b > 110 && r > g2 + 15) n++;   // 透镜奶白/粉心（247,198,212 域）
  }
  return n;
};
const countPurple = (img) => {
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 4], g2 = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    if (b > 70 && b > g2 + 25 && r < b + 40) n++;             // 底座紫（indigo 族）
  }
  return n;
};
const warm = countWarm(lensPng);
const purple = countPurple(basePng);
const warmSky = countWarm(skyPng);   // 参照域应无暖色（防背景误判）
check('悬浮透镜可见（心域暖色像素≥25）', warm >= 25, `warm=${warm} skyRef=${warmSky}`);
check('底座仍在（紫像素≥10,无回退）', purple >= 10, `purple=${purple}`);
check('参照域干净（上方无暖色,非背景误判）', warmSky <= 2, `warmSky=${warmSky}`);

// ---- C. 时钟推进证据 ----
const phase = await page.evaluate(async () => {
  const { tileAnim } = await import('/src/render/TileAnim.ts');
  const t1 = tileAnim.tick;
  await new Promise((r) => setTimeout(r, 120));
  const t2 = tileAnim.tick;
  return { t1, t2, advancing: t2 > t1 };
});
check('tileAnim.tick 推进（tileFrameCounter[491] 同拍钟活着）', phase.advancing, JSON.stringify(phase));
check('零页面错误', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(`PASS ${pass} / FAIL ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
