// 在页内计算标注格的 blend 帧选择(与渲染同款 getUVForMasks 链),读出该帧 16x16 像素,
// 与合成 dump 对拍:灰色 2d2d2d/404040/636363 到底是帧自带还是背景。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (5).json')), 'utf8');
const cells = JSON.parse(process.env.SW_CELLS ?? '[[879,284],[846,280],[882,282]]');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile13'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async (cells) => {
  const g = window.__swGame;
  const r = g.renderer;
  const st = g.world.store;
  const atlas = r.atlas;
  const results = [];
  const img60 = new Image();
  img60.src = '/sprites/vanilla/Tiles_60.png';
  await img60.decode();
  const img2 = new Image();
  img2.src = '/sprites/vanilla/Tiles_2.png';
  await img2.decode();
  const sheetOf = (t) => t === 'v_60_jungle_grass_block' ? img60 : img2;
  for (const [x, y] of cells) {
    const i = st.idx(x, y);
    const t = st.type[i];
    const def = (await import('/src/data/tiles.ts')).TILE_DEFS[t];
    const sheet = def.vanilla.sheet;
    // 同款变体与掩码:复刻 drawVanillaCell blend 段的 same/merge 计算(简版:
    // 只算同型+家族合并,与渲染端一致性足够定位帧)
    const { frameMergesWith } = await import('/src/render/TileMergeFamily.ts');
    const sameAs = (ot) => ot === t || frameMergesWith(t, ot);
    // 位序 E=1 N=0x10 W=0x100 S=0x1000(TEdit)
    let mask = 0;
    const dirs = [[1, 0, 0x1], [0, -1, 0x10], [-1, 0, 0x100], [0, 1, 0x1000],
      [1, -1, 0x10000], [-1, -1, 0x100000], [-1, 1, 0x1000000], [1, 1, 0x10000000]];
    for (const [dx, dy, bit] of dirs) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      const j = st.idx(x + dx, y + dy);
      if (!st.flags[j]) continue;
      if (sameAs(st.type[j])) mask |= bit;
    }
    const variant = ((x * 7) + (y * 11)) % 3;
    const { getUVForMasks } = await import('/src/render/BlendFraming.ts');
    const uv = getUVForMasks(mask, 0, 2, variant);
    // 读帧像素(18px 网格)
    const img = sheet === 60 ? img60 : img2;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cc = c.getContext('2d');
    cc.drawImage(img, 0, 0);
    const fx = uv.col * 18, fy = uv.row * 18;
    const d = cc.getImageData(fx, fy, 16, 16).data;
    const rows = [];
    for (let ty = 0; ty < 16; ty++) {
      let line = '';
      const hexes = [];
      for (let tx = 0; tx < 16; tx++) {
        const k = (ty * 16 + tx) * 4;
        if (d[k + 3] < 60) { line += '.'; hexes.push('----'); }
        else {
          line += '#';
          hexes.push([d[k], d[k + 1], d[k + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
        }
      }
      rows.push({ line, hexes });
    }
    results.push({ x, y, sheet, mask: '0x' + mask.toString(16), uv: `(${uv.col},${uv.row})`, variant, rows });
  }
  return results;
}, cells);
for (const res of out) {
  console.log(`\n== (${res.x},${res.y}) sheet=${res.sheet} mask=${res.mask} uv=${res.uv} variant=${res.variant}`);
  for (let y = 0; y < 8; y++) console.log(` y${y} ${res.rows[y].line}  ${res.rows[y].hexes.slice(0, 8).join(' ')}`);
}
await browser.close();
