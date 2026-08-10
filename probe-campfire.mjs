// 篝火修复验证：animYOffset(215) 语义 → campfireYOffset；
// 断言 ①frameY<36 行 offset=36k 对齐帧块 ②frameY>=36 行恒 252 ③渲染行采样对齐
import puppeteer from 'puppeteer-core';
import { copyFileSync } from 'fs';

copyFileSync('/Users/vinlic/Downloads/map-Starter_World (8).json', 'public/tmp-map.json');

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/blank', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swAtlas && window.__swAtlas.vanilla, { timeout: 120000 });

const out = await p.evaluate(async () => {
  const { campfireYOffset, tileAnim } = await import('/src/render/TileAnim.ts');
  const res = {};
  // ① 帧块对齐：每个动画帧索引下，顶部行(fy=0)采样 y=36k 处应是帧块起点（不透明行）
  const atlas = window.__swAtlas;
  await atlas.preloadFiles(['vanilla/Tiles_215.png']);
  const img = atlas.vimages.get('vanilla/Tiles_215.png');
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const opaque = (x, y) => ctx.getImageData(x, y, 1, 1).data[3] > 40;
  res.frames = [];
  for (let k = 0; k < 8; k++) {
    tileAnim.tick = k * 4; // 每帧 4 tick
    const off = campfireYOffset(0);
    // 帧块内火焰行（样式12 列 x=648..702 中间）应有内容；块间隙行(y+16)应透明
    const flameRow = 0, gapRow = 16, logRow = 18;
    res.frames.push({
      k, off,
      flame: opaque(660, off + flameRow + 8) || opaque(665, off + flameRow + 8),
      log: opaque(660, off + logRow + 8) || opaque(665, off + logRow + 8),
    });
  }
  // ② 熄灭行
  tileAnim.tick = 100;
  res.extinguished = campfireYOffset(36) === 252 && campfireYOffset(54) === 252;
  // ③ 实际渲染：加载存档，烘焙篝火所在 chunk，取中心 3×2 格像素比对"顶部行=火焰色、
  //    底部行=木柴棕"粗判（不再漂移到错误内容）
  const saveTxt = await (await fetch('/tmp-map.json')).text();
  const { loadSaveData } = await import('/src/save/SaveFile.ts');
  const { world } = loadSaveData(JSON.parse(saveTxt));
  const { AutoTiler } = await import('/src/render/AutoTiler.ts');
  const { VanillaWallTiler } = await import('/src/render/VanillaWallTiler.ts');
  const { ChunkCache } = await import('/src/render/ChunkCache.ts');
  await atlas.preloadFiles(['vanilla/Tiles_215.png']);
  const chunks = new ChunkCache(world, new Map(), new AutoTiler(atlas), new VanillaWallTiler(atlas));
  const cx = Math.floor(3229 / 16), cy = Math.floor(330 / 16);
  tileAnim.tick = 0;
  const pair = chunks.get(cx, cy);
  const tctx = pair.tile.getContext('2d');
  const px0 = (3229 - cx * 16) * 16, py0 = (330 - cy * 16) * 16;
  const d = tctx.getImageData(px0, py0, 48, 32).data;
  // 统计 3×2 格内的非透明像素占比（修复前漂移采样会抓到帧间隙 → 大量空白）
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  res.renderCoverage = +(n / (48 * 32)).toFixed(2);
  res.renderPass = res.renderCoverage > 0.25;
  return res;
});
console.log(JSON.stringify(out));
await b.close();
