// _lavaslope-repro9: 渲染用户世界的宽岩浆池坡岸 (647,1080)/(3986,980)/(3030,826),
// 每处等待光照稳定 2.5s,裁剪岸缘区,并 dump 岸区 tile 终态。
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
const p = await b.newPage();
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
  g.liquid.updateLiquid = () => {};
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0; g.world.weather.maxRaining = 0; }
  g.renderer.fullbright = true;
});

const cands = [
  { tag: 'pool647', x: 647, y: 1080 },
  { tag: 'pool3986', x: 3986, y: 980 },
  { tag: 'pool3030', x: 3030, y: 826 },
];
for (const c of cands) {
  await p.evaluate(({ x, y }) => {
    const g = window.__swGame, pl = g.player;
    pl.x = x * 16 - pl.w / 2; pl.y = (y - 8) * 16;
    pl.vx = 0; pl.vy = 0;
  }, c);
  await new Promise(r => setTimeout(r, 2500));
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 500));
  const cam = await p.evaluate(() => {
    const g = window.__swGame;
    return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
  });
  await p.screenshot({ path: `${OUT}/l9-${c.tag}.png` });
  const dump = await p.evaluate(({ x, y }) => {
    const st = window.__swGame.world.store;
    const rows = [];
    for (let tx = x - 5; tx <= x + 4; tx++)
      for (let ty = y - 5; ty <= y + 3; ty++) {
        const i = st.idx(tx, ty);
        if (st.slope[i] || st.half[i] || st.liquid[i] > 0)
          rows.push({ x: tx, y: ty, t: st.type[i], slope: st.slope[i], half: st.half[i], liq: st.liquid[i], lt: st.liquidType[i], wall: st.wall[i] });
      }
    return rows;
  }, c);
  console.log(`== ${c.tag} cam=`, JSON.stringify(cam));
  for (const r of dump) console.log(`  (${r.x},${r.y}) t=${r.t} sl=${r.slope} hf=${r.half} liq=${r.liq} lt=${r.lt} wall=${r.wall}`);
}
console.log('errs done');
await b.close();
process.exit(0);
