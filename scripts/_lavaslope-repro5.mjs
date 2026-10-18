// _lavaslope-repro5: 载入用户世界"饥饿的庄园",全图扫描"液体表面格×邻格坡面砖"岸缘构型,
// 输出候选清单+逐个截图,核对浸润是否按原版规则呈现。
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
  if (!booted) console.log(`attempt ${attempt}: flow 未就绪`);
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

// 扫描:液体格(液>0)与坡面砖邻接的构型,按 liquidType 分组
const scan = await p.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const out = { water: [], lava: [] };
  const liqAt = (x, y) => (st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0);
  const ltAt = (x, y) => (st.inBounds(x, y) ? st.liquidType[st.idx(x, y)] : 0);
  const slopeAt = (x, y) => (st.inBounds(x, y) ? st.slope[st.idx(x, y)] : 0);
  const halfAt = (x, y) => (st.inBounds(x, y) ? st.half[st.idx(x, y)] : 0);
  for (let x = 2; x < st.w - 2; x++) {
    for (let y = 2; y < st.h - 2; y++) {
      const i = st.idx(x, y);
      const sl = st.slope[i];
      if (!sl && !st.half[i]) continue;
      if (!st.flags[i]) continue;             // 只看活砖
      const TILE = window.__swITEMS ? 0 : 0;
      const def = st.type[i];
      if (def !== 1 && def !== 0 && def !== 2 && def !== 53 && def !== 147 && def !== 161 && def !== 199 && def !== 60 && def !== 203) continue; // 常见土/岩/泥/雪/冰/丛林泥/粘土/雪
      // 四邻液体
      const L = liqAt(x - 1, y), R = liqAt(x + 1, y), U = liqAt(x, y - 1), D = liqAt(x, y + 1);
      const lts = new Set();
      if (L > 0) lts.add(ltAt(x - 1, y));
      if (R > 0) lts.add(ltAt(x + 1, y));
      if (U > 0) lts.add(ltAt(x, y - 1));
      if (D > 0) lts.add(ltAt(x, y + 1));
      if (lts.size === 0) continue;
      const lt = [...lts][0];
      const tag = lt === 2 ? 'lava' : lt === 1 ? 'water' : `lt${lt}`;
      const entry = { x, y, slope: sl, half: st.half[i], t: def, L, R, U, D, wall: st.wall[i] };
      (out[tag] = out[tag] || []).push(entry);
    }
  }
  return out;
});
console.log('岸缘斜面砖候选: water=', (scan.water || []).length, ' lava=', (scan.lava || []).length, ' other=', Object.keys(scan).filter(k => k.startsWith('lt')).map(k => `${k}=${scan[k].length}`).join(' ') || '-');
for (const tag of ['lava', 'water']) {
  const list = (scan[tag] || []).slice(0, 12);
  for (const e of list) console.log(` ${tag} (${e.x},${e.y}) slope=${e.slope} half=${e.half} t=${e.t} L=${e.L} R=${e.R} U=${e.U} D=${e.D} wall=${e.wall}`);
}
await b.close();
process.exit(errs.length ? 1 : 0);
