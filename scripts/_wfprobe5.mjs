// 瀑布贴图复现探针(第五轮 v2):载用户存档 → 传送 (1485,587) →
// 屏幕截图 + 页内 canvas 采样 ASCII 图(围绕池区 32×22 格窗口)+ falls dump
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-12345世界 (1).json';
const CX = 1485, CY = 590; // 相机中心(格)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const save = readFileSync(SAVE, 'utf8');

async function attempt() {
  await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
await page.screenshot({ path: '/tmp/wf5-1.png' });
const diag = await page.evaluate(async ([CX, CY]) => {
  const t0 = Date.now();
  while (!window.__swGame?.renderer && Date.now() - t0 < 30000) {
    await new Promise((r2) => setTimeout(r2, 300));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const out = { falls: [], waterStyle: null };
  const wf = g.renderer.waterfalls;
  const arr = wf.falls ?? [];
  for (const f of arr) out.falls.push(`${f.x},${f.y}t${f.type}`);
  // waterStyle:Renderer 侧的当前值(尽力读)
  const r = g.renderer;
  out.waterStyle = r.waterStyle ?? r._waterStyle ?? null;
  // canvas 采样:池区 x1476..1496, y583..600 → 屏幕坐标 = (tile*16 - camera)*zoom + 屏幕/2
  const zoom = r.zoom ?? 1;
  const cv = r.canvas ?? document.querySelector('canvas');
  const cctx = cv.getContext('2d');
  const toPx = (tx, ty) => [
    Math.round((tx * 16 - g.camera.x) * zoom + cv.width / 2),
    Math.round((ty * 16 - g.camera.y) * zoom + cv.height / 2),
  ];
  out.zoom = zoom; out.canvas = [cv.width, cv.height];
  // ---- 精确 RGB 采样:瀑布柱中心线(x≈1485.5/1486)+ 池面 + 对照点 ----
  const samples = [];
  const grab = (tx, ty) => {
    const [sx, sy] = toPx(tx, ty);
    const d = cctx.getImageData(Math.max(0, Math.min(cv.width - 1, sx)), Math.max(0, Math.min(cv.height - 1, sy)), 1, 1).data;
    return `rgb(${d[0]},${d[1]},${d[2]},a${d[3]})`;
  };
  samples.push(`pool-surface(1481.5,587.4)=${grab(1481.5, 587.4)}`);
  samples.push(`pool-surface(1483.5,587.4)=${grab(1483.5, 587.4)}`);
  samples.push(`lip-cell(1484.5,587.5)=${grab(1484.5, 587.5)}`);
  for (let ty = 587.5; ty <= 604; ty += 1) {
    samples.push(`col(1486,${ty})=${grab(1486, ty)}`);
  }
  out.samples = samples;
  // 每格 2×2 采样 → ASCII(每字符 0.5 格)
  const lines = [];
  for (let ty = 584; ty <= 598; ty += 0.5) {
    let row = '';
    for (let tx = 1476; tx <= 1496; tx += 0.5) {
      const [sx, sy] = toPx(tx, ty);
      const d = cctx.getImageData(Math.max(0, Math.min(cv.width - 1, sx)), Math.max(0, Math.min(cv.height - 1, sy)), 1, 1).data;
      const [rr, gg, bb] = [d[0], d[1], d[2]];
      const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
      let ch;
      if (rr < 25 && gg < 25 && bb < 25) ch = ' ';
      else if (bb > rr + 30 && bb > 70) ch = 'W';
      else if (mx > 200 && mx - mn < 45) ch = '#';
      else if (rr > 140 && gg > 60 && gg < 160 && bb < 80) ch = 'O';
      else if (mx - mn < 40 && mx > 45) ch = 'g';
      else if (mx > 110) ch = '+';
      else ch = ',';
      row += ch;
    }
    lines.push('y' + (584 + Math.round((ty - 584) * 2) / 2) + ' ' + row);
  }
  out.ascii = lines;
  return out;
}, [CX, CY]);
console.log('falls:', diag.falls.join(' '));
console.log('waterStyle:', diag.waterStyle, 'zoom:', diag.zoom, 'canvas:', diag.canvas);
console.log('x→', Array.from({ length: 41 }, (_, i) => String(1476 + i / 2).padStart(4).slice(-2)).join(''));
for (const l of diag.ascii) console.log(l);
await new Promise((r2) => setTimeout(r2, 2000));
await page.screenshot({ path: '/tmp/wf5-2.png' });
console.log('shots: /tmp/wf5-1.png /tmp/wf5-2.png');
await browser.close();
