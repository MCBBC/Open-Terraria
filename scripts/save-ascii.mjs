// ASCII 全图缩略(任意存档 json):node scripts/save-ascii.mjs <path>
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const path = process.argv[2];
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const json = readFileSync(path, 'utf8');
const out = await page.evaluate(async ([j]) => {
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const w = loadSave(j).world;
  const st = w.store;
  const W = 168, H = 60;
  const bx = Math.ceil(st.w / W), by = Math.ceil(st.h / H);
  const map = {
    [BK['dirt']]: 'd', [BK['stone']]: 's', [BK['grass']]: 'g',
    [BK['mud']]: 'M', [BK['v_60_jungle_grass_block']]: 'J',
    [BK['snow']]: 'S', [BK['ice']]: 'I',
    [BK['sand']]: '.', [BK['hardened_sand']]: ':', [BK['sandstone']]: ';',
    [BK['v_25_ebonstone_block']]: 'E', [BK['v_203_crimstone_block']]: 'C',
    [BK['v_23_corrupt_grass_block']]: 'e', [BK['v_199_crimson_grass_block']]: 'c',
    [BK['v_70_mushroom_grass_block']]: 'm', [BK['v_189_cloud_block']]: 'o',
    [BK['tree']]: 'T', [BK['ash'] ?? -1]: 'A', [BK['clay']]: 'k',
    [BK['v_112_ebonsand_block']]: '%', [BK['v_234_crimsand_block']]: '&',
    [BK['silt']]: 't', [BK['v_367_marble_block']]: 'a', [BK['v_368_granite_block']]: 'G',
    [BK['v_80_cactus']]: '|', [BK['v_52_vines']]: 'v',
  };
  const rows = [];
  for (let gy = 0; gy < H; gy++) {
    let row = '';
    for (let gx = 0; gx < W; gx++) {
      const counts = {};
      for (let x = gx * bx; x < (gx + 1) * bx && x < st.w; x += 3) {
        for (let y = gy * by; y < (gy + 1) * by && y < st.h; y += 3) {
          const i = st.idx(x, y);
          if (!st.flags[i]) continue;
          const ch = map[st.type[i]];
          counts[ch ?? '?'] = (counts[ch ?? '?'] ?? 0) + 1;
        }
      }
      let best = ' ', bn = 0;
      for (const [k, v] of Object.entries(counts)) if (v > bn) { bn = v; best = k; }
      row += best;
    }
    rows.push(String(gy * by).padStart(4) + ' ' + row);
  }
  return { rows, jungleX: w.jungleX, dungeonX: w.dungeonX, crimson: w.crimson, bx, by };
}, [json]);
console.log(`jungleX=${out.jungleX} dungeonX=${out.dungeonX} crimson=${out.crimson} block=${out.bx}x${out.by}`);
console.log(out.rows.join('\n'));
await browser.close();
