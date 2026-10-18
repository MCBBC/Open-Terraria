// 三树 1:1 像素剖面（新报告导入解剖台）：静止 vs 微摆，node 侧统一坐标换算。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const REPORT = process.env.REPORT ?? needInput(join(DOWNLOADS, 'debug-report-模型根基-2026-08-18T08-47-06-154Z.json'));
const full = JSON.parse(readFileSync(REPORT, 'utf8'));
const ap = full.tiles.areaPlayer;
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate((json) => { document.getElementById('importBox').value = json; },
  JSON.stringify({ tiles: { areaPlayer: ap } }));
await page.click('#doImport');
await new Promise(r => setTimeout(r, 1000));
// 三棵世界树（store 坐标 = 世界 +2 偏移），逐棵 × [静止, 无风微摆] × [×1.25, ×1.27]
const shots = await page.evaluate(async () => {
  const S = window.__treeInspect;
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const setWind = (mode) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(mode))?.click(); };
  const setZoom = (z) => { [...document.querySelectorAll('#zooms button')].find((b) => b.textContent.includes(String(z)))?.click(); };
  const out = [];
  const OX = 4563, OY = 549;   // areaPlayer 原点（世界）→ store 坐标 = 世界 − 原点 + 2
  const trees = [[4590 - OX + 2, 572 - OY + 2], [4585 - OX + 2, 573 - OY + 2], [4609 - OX + 2, 574 - OY + 2]];
  const setVia = (v) => { document.getElementById('viaChunk').checked = v; };
  for (const [sx, sy] of trees.slice(1)) {   // 树2/3（缝树）
    for (const via of [true, false]) {
     for (const mode of ['静止']) {
      for (const z of [1.25]) {
        setVia(via);
        setWind(mode); setZoom(z);
        S.tree = { x: sx, markerY: sy, grassY: sy + 8, h: 6, pieces: [] };
        for (let k = 0; k < 8; k++) await raf();
        out.push({ x: sx, y: sy, mode: (via ? 'chunk' : 'single') + '/' + mode, z, url: document.getElementById('cv').toDataURL('image/png') });
        if (true) {
          // store 取证：该树 y−1..y+7 × x±1 的 type/fx/fy
          const st2 = S.store;
          const cells = [];
          for (let dy = -1; dy <= 7; dy++) {
            const row = [];
            for (let dx = -1; dx <= 1; dx++) {
              const i = st2.idx(sx + dx, sy + dy);
              row.push(st2.type[i] + ':' + st2.frameX[i] + ',' + st2.frameY[i] + (st2.flags[i] ? '' : '!'));  // ! = inactive
            }
            cells.push(row.join(' | '));
          }
          out[out.length - 1].storeDump = cells;
        }
      }
     }
    }
  }
  return out;
});
// node 侧：解剖台 imported 模式 cam = (storeW*16/2, boundaryY)，视图宽 = importW*16
writeFileSync('/tmp/three-trees.json', JSON.stringify({ shots: shots.map((s) => ({ ...s, url: s.url.slice(0, 100) })), n: shots.length }));
for (const s of shots) {
  const buf = Buffer.from(s.url.split(',')[1], 'base64');
  writeFileSync('/tmp/tt.png', buf);
  const { PNG } = await import('pngjs');
  const img = PNG.sync.read(buf);
  const z = s.z;
  const W = ap.w * 16;
  const camX = (ap.w + 4) * 16 / 2;
  const camRX = Math.round(camX * z) / z;
  const B = (s.y + 1) * 16;                 // 局部边界（store 系）
  const camY = B;
  const camRY = Math.round(camY * z) / z;
  const wx = s.x;                           // 局部干心（store 系，与渲染同系）
  console.log(`\n=== 树@(${wx},${s.y - 2}) ${s.mode} ×${z} 交界行 ±3（列=干心±11 世界px）===`);
  if (s.mode === '静止' && s.z === 1.25) {
    // RGB 直查：干心±4 世界px × 行 B−2..B+4
    for (let dy = -2; dy <= 4; dy++) {
      const pxs = [];
      for (let dx = -4; dx <= 4; dx += 2) {
        const px = Math.round((wx * 16 + dx - camRX) * z + img.width / 2);
        const py = Math.round((B + dy - camRY) * z + img.height / 2);
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) { pxs.push('oob'); continue; }
        const i = (py * img.width + px) * 4;
        pxs.push(img.data.slice(i, i + 4).join(','));
      }
      console.log('RGB dy=' + dy + ': ' + pxs.join('  '));
    }
  }
  for (let dy = -3; dy <= 3; dy++) {
    let line = '';
    for (let dx = -11; dx <= 11; dx++) {
      const px = Math.round((wx * 16 + dx - camRX) * z + img.width / 2);
      const py = Math.round((B + dy - camRY) * z + img.height / 2);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) { line += '?'; continue; }
      const i = (py * img.width + px) * 4;
      const a = img.data[i + 3];
      const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      line += a < 60 ? '·' : l > 175 ? '.' : l > 110 ? '-' : l > 50 ? '=' : '#';
    }
    console.log(String(dy).padStart(3) + '|' + line);
  }
}
for (const s of shots.filter((x2) => x2.storeDump)) {
  console.log('store 取证 树@(' + s.x + ',' + s.y + ')（! = inactive）:');
  s.storeDump.forEach((r, i) => console.log('  dy=' + (i - 1), r));
}
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
