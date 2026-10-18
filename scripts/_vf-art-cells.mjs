// 官方素材可疑帧格放大取证:把标注格所用源矩形从官方 Tiles_N.png 裁出,
// 以 12× 放大铺到灰底上拼图存 PNG,肉眼核对缺口形态。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = needInput(join(DOWNLOADS, 'map-FTW_V2 (6).json'));
const SAMPLES = [
  { x: 3969, y: 468, k: 'sand', sheet: 53 },
  { x: 3970, y: 469, k: 'clay', sheet: 40 },
  { x: 3969, y: 471, k: 'sand', sheet: 53 },
  { x: 3968, y: 472, k: 'clay', sheet: 40 },
  { x: 3975, y: 470, k: 'stone', sheet: 1 },
  { x: 4003, y: 465, k: 'ore_copper', sheet: 7 },
];
const OUT = join(HOME, '.claude/jobs/4a66e745/tmp/art-cells.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 90; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(3000);
const dataUrl = await p.evaluate(async (samples) => {
  const atlas = window.__swGame.renderer.atlas;
  const Z = 12;
  const cv = document.createElement('canvas');
  cv.width = samples.length * (18 * Z + 8) + 8;
  cv.height = 18 * Z * 3 + 40;
  const c = cv.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, cv.width, cv.height);
  let col = 0;
  for (const s of samples) {
    const img = atlas.ensureVImage(`vanilla/Tiles_${s.sheet}.png`);
    if (!img) continue;
    // 取该 sheet 三行代表格:(col=行? 这里用 sample 帧及其上下带) —— 先画标注帧本体
    const meta = atlas.vmeta(s.sheet);
    void meta;
    return null; // placeholder replaced below
  }
}, SAMPLES);
// 占位实现换掉:直接在页面里逐样本画
const shot = await p.evaluate(async (samples) => {
  const vf = await import('/src/render/VanillaFraming.ts');
  const tdMod = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const rock = g.world.rockLevel ?? 0;
  const atlas = g.renderer.atlas;
  const Z = 12;
  const cv = document.createElement('canvas');
  cv.width = samples.length * (20 * Z + 10) + 10;
  cv.height = 20 * Z + 30;
  const c = cv.getContext('2d');
  c.fillStyle = '#909090'; c.fillRect(0, 0, cv.width, cv.height);
  c.imageSmoothingEnabled = false;
  let col = 0;
  const labels = [];
  for (const s of samples) {
    const tIdx = st.idx(s.x, s.y);
    const t = st.flags[tIdx] ? st.type[tIdx] : -1;
    const def = tdMod.TILE_DEFS[t];
    const sheet = def?.vanilla?.sheet;
    if (sheet == null) continue;
    const img = atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
    if (!img) continue;
    const v = vf.vanillaFrameFor(st, s.x, s.y, st, ((s.x * 7) + (s.y * 11)) % 3, rock);
    const sx = Math.floor(v.fx / 18) * 18, sy = Math.floor(v.fy / 18) * 18;
    c.fillStyle = '#ffffff'; c.fillRect(col * (20 * Z) + 10, 10, 18 * Z, 18 * Z);
    c.drawImage(img, sx, sy, 18, 18, col * (20 * Z) + 10, 10, 18 * Z, 18 * Z);
    labels.push(`${s.k}@${sheet} f(${v.fx},${v.fy})`);
    col++;
  }
  const fontLayer = document.createElement('canvas');
  fontLayer.width = cv.width; fontLayer.height = cv.height;
  const fc = fontLayer.getContext('2d');
  fc.font = '13px monospace'; fc.fillStyle = '#000';
  labels.forEach((l, i) => fc.fillText(l, i * (20 * Z) + 10, 20 * Z + 25));
  fc.drawImage(cv, 0, 0);
  return { data: fontLayer.toDataURL('image/png'), labels };
}, SAMPLES);
fs.writeFileSync(join(HOME, '.claude/jobs/4a66e745/tmp/art-cells.b64'), shot.data.split(',')[1]);
console.log(JSON.stringify({ labels: shot.labels }));
await b.close();
