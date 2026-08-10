// 樱花树渲染复现：读入标注的地图存档（fetch public/tmp-map.json）→ loadSaveData →
// 构造 ChunkCache 烘焙标注树区域 → 与"原版语义参考图"（Tiles_596 直拷 + Tree_Tops_29 118×96）对照
import puppeteer from 'puppeteer-core';
import { readFileSync, copyFileSync } from 'fs';

copyFileSync('/Users/vinlic/Downloads/map-Starter_World (7).json', 'public/tmp-map.json');

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 900, height: 700 });
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/blank', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swAtlas, { timeout: 120000 }).catch(() => {});
const out = await p.evaluate(async () => {
  const res = {};
  const saveTxt = await (await fetch('/tmp-map.json')).text();
  const { loadSaveData } = await import('/src/save/SaveFile.ts');
  const { world } = loadSaveData(JSON.parse(saveTxt));
  const { World: W } = await import('/src/world/World.ts');
  const st = world.store;
  res.treeTiles = [];
  for (let y = 380; y < 410; y++) {
    for (let x = 3210; x < 3228; x++) {
      const i = st.idx(x, y);
      if (st.type[i] !== 0) res.treeTiles.push({ x, y, t: st.type[i], fx: st.frameX[i], fy: st.frameY[i] });
    }
  }
  // 标注树的 key
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const i0 = st.idx(3218, 390);
  res.key = TILE_DEFS[st.type[i0]]?.key;
  res.sheet = TILE_DEFS[st.type[i0]]?.vanilla?.sheet;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
