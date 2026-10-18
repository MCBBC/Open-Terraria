// 运行时 store 网格 dump:对齐表格 + 瀑布柱 RGB 采样
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = needInput(join(DOWNLOADS, 'map-12345世界 (1).json'));
const CX = 1485, CY = 590;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const save = readFileSync(SAVE, 'utf8');

async function attempt() {
  await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return await page.evaluate(async ([saveTxt, CX, CY]) => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 60000) {
      await new Promise((r2) => setTimeout(r2, 500));
    }
    const g = window.__swGame;
    if (!g?.player) return 'no game';
    const { loadSave } = await import('/src/save/SaveFile.ts');
    const { world, player } = loadSave(saveTxt);
    g.world = world;
    Object.assign(g.player, player);
    g.player.x = (CX + 8) * 16; g.player.y = (CY + 8) * 16;
    world.explored.fill(1); world.exploredVersion++;
    g.camera.x = CX * 16; g.camera.y = CY * 16;
    g.renderer.fullbright = true;
    g.lighting.liquidDirty = true;
    return 'ok';
  }, [save, CX, CY]);
}

let ok = null;
for (let att = 0; att < 12; att++) {
  try { ok = await attempt(); break; }
  catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log('load:', ok);
if (ok !== 'ok') { console.log('GAVE UP'); await browser.close(); process.exit(1); }

await new Promise((r2) => setTimeout(r2, 2500));
const diag = await page.evaluate(async ([CX, CY]) => {
  const t0 = Date.now();
  while (!window.__swGame?.renderer && Date.now() - t0 < 30000) {
    await new Promise((r2) => setTimeout(r2, 300));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const out = {};
  const wf = g.renderer.waterfalls;
  out.falls = (wf.falls ?? []).map((f) => `${f.x},${f.y}t${f.type}`);
  // 对齐网格:x 每格一列,紧凑编码 T=tile内部id h=half s=slope L=液量 y=液类
  const x0 = 1474, x1 = 1496, y0 = 583, y1 = 606;
  const head = ['     '];
  for (let x = x0; x <= x1; x++) head.push(String(x).slice(-3).padStart(4));
  out.grid = [head.join('')];
  for (let y = y0; y <= y1; y++) {
    const row = ['y' + String(y).padStart(4)];
    for (let x = x0; x <= x1; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      let cell = '';
      if (t) cell += 'T' + (t < 100 ? '0' + (t < 10 ? '0' + t : t) : t);
      else cell += '...';
      if (st.half[i]) cell += 'H';
      else if (st.slope[i]) cell += 'S' + st.slope[i];
      else cell += '.';
      if (st.liquid[i]) cell += 'L' + String(st.liquid[i]).padStart(3, '0');
      row.push(cell.padStart(4).slice(-4));
    }
    out.grid.push(row.join(''));
  }
  // RGB 采样沿瀑布柱
  const r = g.renderer;
  const zoom = r.zoom ?? 1;
  const cv = r.canvas ?? document.querySelector('canvas');
  const cctx = cv.getContext('2d');
  const toPx = (tx, ty) => [
    Math.round((tx * 16 - g.camera.x) * zoom + cv.width / 2),
    Math.round((ty * 16 - g.camera.y) * zoom + cv.height / 2),
  ];
  const grab = (tx, ty) => {
    const [sx, sy] = toPx(tx, ty);
    const d = cctx.getImageData(Math.max(0, Math.min(cv.width - 1, sx)), Math.max(0, Math.min(cv.height - 1, sy)), 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  };
  out.cam = { x: g.camera.x, y: g.camera.y, px: g.player.x, py: g.player.y, zoom };
  // 全屏 64×40 粗粒度图(步长 20px),量化颜色
  const q = (v) => (v < 32 ? '0' : v < 64 ? '1' : v < 96 ? '2' : v < 128 ? '3' : v < 160 ? '4' : v < 192 ? '5' : v < 224 ? '6' : '7');
  out.screen = [];
  for (let sy = 0; sy < cv.height; sy += 20) {
    let row = '';
    for (let sx = 0; sx < cv.width; sx += 20) {
      const d = cctx.getImageData(sx, sy, 1, 1).data;
      row += q(d[0]) + q(d[1]) + q(d[2]) + ' ';
    }
    out.screen.push(row);
  }
  out.rgb = {
    pool: [grab(1481.5, 587.4), grab(1483.5, 587.4)],
    lip: grab(1484.5, 587.5),
    colW: [], colE: [],
  };
  for (let ty = 588; ty <= 604; ty++) {
    out.rgb.colW.push(`${ty}:${grab(1485.2, ty + 0.5)}`);
    out.rgb.colE.push(`${ty}:${grab(1486.8, ty + 0.5)}`);
  }
  return out;
}, [CX, CY]);
console.log('falls:', diag.falls.join(' '));
console.log('cam:', JSON.stringify(diag.cam));
for (const l of diag.screen) console.log('SCR ' + l);
for (const l of diag.grid) console.log(l);
console.log('rgb pool:', diag.rgb.pool.join(' | '), ' lip:', diag.rgb.lip);
console.log('colW(x1485.2):', diag.rgb.colW.join(' '));
console.log('colE(x1486.8):', diag.rgb.colE.join(' '));
await page.screenshot({ path: '/tmp/wf6-1.png' });
console.log('shot: /tmp/wf6-1.png');
await browser.close();
