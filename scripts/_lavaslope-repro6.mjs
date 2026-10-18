// _lavaslope-repro6: 用户世界实际岸缘候选渲染。冻结液体,玩家瞬移到候选上方,
// fullbright 截图+逐候选裁剪。重点:slope1/2/3/4+邻液 与 半砖,水 vs 岩浆。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');
const MAP = needInput(join(DOWNLOADS, 'map-饥饿的庄园 (1).json'));

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const errs = [];
const p = await b.newPage();
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 2000));
for (let i = 0; i < 10; i++) {
  const gone = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find(x => /我已知晓|已知晓|OK|知道了/.test(x.textContent || ''));
    if (ok) { ok.click(); return false; }
    return true;
  }).catch(() => true);
  if (gone) break;
  await new Promise(r => setTimeout(r, 400));
}
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};      // 冻结液体(世界已沉降)
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0; g.world.weather.maxRaining = 0; }
  g.renderer.fullbright = true;
});

// 候选:岩浆6 + 水同类4
const cands = [
  { tag: 'lava-half-LU', x: 20, y: 899 },
  { tag: 'lava-s2-LU', x: 24, y: 858 },
  { tag: 'lava-s1-RU', x: 27, y: 944 },
  { tag: 'lava-s3-RD', x: 31, y: 968 },
  { tag: 'lava-s4-LD', x: 33, y: 934 },
  { tag: 'lava-s2-LU2', x: 31, y: 946 },
  { tag: 'water-half-LU', x: 21, y: 576 },
  { tag: 'water-s2-LU', x: 22, y: 409 },
  { tag: 'water-s1-RU', x: 24, y: 554 },
  { tag: 'water-s3-RD', x: 28, y: 552 },
];
const camAll = [];
for (const c of cands) {
  await p.evaluate(({ x, y }) => {
    const g = window.__swGame, pl = g.player;
    pl.x = x * 16 - pl.w / 2; pl.y = (y - 6) * 16;
    pl.vx = 0; pl.vy = 0; pl.fallStart = undefined;
  }, c);
  await new Promise(r => setTimeout(r, 900));
  const cam = await p.evaluate(() => {
    const g = window.__swGame;
    return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
  });
  camAll.push({ ...c, cam });
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 500));
  await p.screenshot({ path: `${OUT}/l6-${c.tag}.png` });
}

const { execSync } = await import('node:child_process');
execSync(`python3 - << 'PYEOF'
from PIL import Image
cands = ${JSON.stringify(camAll)}
import os
for c in cands:
    path = '${OUT}/l6-' + c['tag'] + '.png'
    if not os.path.exists(path): print(c['tag'], 'missing'); continue
    img = Image.open(path).convert('RGB')
    W, H = img.size
    cam = c['cam']
    cx, cy, z = cam['cx'], cam['cy'], cam['z']
    def w2s(wx, wy): return ((wx - cx) * z + W/2, (wy - cy) * z + H/2)
    ax, ay = w2s((c['x']-3)*16, (c['y']-3)*16)
    bx, by = w2s((c['x']+3)*16, (c['y']+3)*16)
    box = (int(ax), int(ay), int(bx), int(by))
    if box[0] < 0 or box[1] < 0 or box[2] > W or box[3] > H:
        print(c['tag'], 'out of view', box); continue
    crop = img.crop(box).resize(((box[2]-box[0])*5, (box[3]-box[1])*5), Image.NEAREST)
    crop.save('${OUT}/l6c-' + c['tag'] + '.png')
    print(c['tag'], box)
PYEOF`, { stdio: 'inherit' });
console.log('errs:', JSON.stringify(errs.slice(0, 3)));
await b.close();
process.exit(errs.length ? 1 : 0);
