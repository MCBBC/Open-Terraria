import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const json = readFileSync(needInput(join(DOWNLOADS, 'map-不负责任的女妖啤酒厂.json')), 'utf8');
const out = await page.evaluate(async ([j]) => {
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const w = loadSave(j).world;
  const st = w.store;
  const counts = {};
  for (let i = 0; i < st.type.length; i++) {
    if (!st.flags[i]) continue;
    const k = Object.entries(BK).find(([kk, vv]) => vv === st.type[i])?.[0];
    if (k && /brick|blue|pink|green/.test(k)) counts[k] = (counts[k] ?? 0) + 1;
  }
  // 地牢墙统计
  const walls = {};
  for (let i = 0; i < st.wall.length; i++) { const wl = st.wall[i]; if (wl >= 7 && wl <= 9) walls[wl] = (walls[wl] ?? 0) + 1; }
  return { counts, walls };
}, [json]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
