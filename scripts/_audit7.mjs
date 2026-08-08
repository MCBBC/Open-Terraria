import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const json = readFileSync('/Users/vinlic/Downloads/map-新世界 (7).json', 'utf8');
const out = await page.evaluate(async ([j]) => {
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const w = loadSave(j).world;
  const st = w.store;
  const stat = (k) => { const id = BK[k]; if (id === undefined) return 'NO_TILE'; let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] === id && st.flags[i]) n++; return n; };
  // 腐化区:找黑檀石密度最高的列,输出该列 ±30 的横截面(y 地表到 +300)
  const EB = BK['v_25_ebonstone_block'], CR = BK['v_203_crimstone_block'];
  let bestX = -1, bestN = -1;
  for (let x = 0; x < st.w; x += 10) {
    let n = 0;
    for (let y = 0; y < st.h; y++) if (st.type[st.idx(x, y)] === EB || st.type[st.idx(x, y)] === CR) n++;
    if (n > bestN) { bestN = n; bestX = x; }
  }
  const rows = [];
  let sy = 0; while (sy < st.h && !st.flags[st.idx(bestX, sy)]) sy++;
  for (let y = sy; y < Math.min(st.h, sy + 300); y += 8) {
    let row = '';
    for (let x = Math.max(0, bestX - 40); x < Math.min(st.w, bestX + 40); x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { row += ' '; continue; }
      const t = st.type[i];
      row += t === EB || t === CR ? 'E' : t === BK['v_31_orb_heart'] ? 'O' : '#';
    }
    rows.push(String(y - sy).padStart(3) + ' ' + row);
  }
  return {
    evilX: bestX, evilN: bestN, crimson: w.crimson,
    cobweb: stat('v_51_cobweb'), hive: stat('v_225_hive_block'), honey: stat('v_229_honey_block'),
    lihzahrd: stat('v_226_lihzahrd_brick'), sphinx: rows,
  };
}, [json]);
console.log(JSON.stringify({ evilX: out.evilX, evilN: out.evilN, cobweb: out.cobweb, hive: out.hive, honey: out.honey, lihzahrd: out.lihzahrd }, null, 1));
console.log('腐化区横截面(深度 0-300):');
console.log(out.sphinx.join('\n'));
await browser.close();
