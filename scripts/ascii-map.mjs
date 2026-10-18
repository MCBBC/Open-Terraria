// ASCII 全图缩略:每字符 = block×block 区域的主导 tile
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const which = process.argv[2] || 'gen';
const wldBuf = which === 'ref' ? Array.from(readFileSync(needInput(join(DOWNLOADS, '不负责任的女妖啤酒厂.wld')))) : null;
const out = await page.evaluate(async ([mode, wldBuf]) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  let world;
  if (mode === 'ref') {
    world = loadSave(JSON.stringify(parseWldToSave(new Uint8Array(wldBuf)).save)).world;
  } else {
    world = await mod.generateWorld({ width: 2100, height: 700, seedText: 'fix1', name: 't' });
  }
  const st = world.store;
  const W = 168, H = 56; // ASCII 网格
  const bx = Math.ceil(st.w / W), by = Math.ceil(st.h / H);
  const CHAR = {};
  const map = {
    [BK['dirt'] ?? -1]: 'd', [BK['stone'] ?? -1]: 's', [BK['grass'] ?? -1]: 'g',
    [BK['mud'] ?? -1]: 'M', [BK['v_60_jungle_grass_block'] ?? -1]: 'J',
    [BK['snow'] ?? -1]: 'S', [BK['ice'] ?? -1]: 'I',
    [BK['sand'] ?? -1]: '.', [BK['hardened_sand'] ?? -1]: ':',
    [BK['v_25_ebonstone_block'] ?? -1]: 'E', [BK['v_23_corrupt_grass_block'] ?? -1]: 'e',
    [BK['v_203_crimstone_block'] ?? -1]: 'C', [BK['v_199_crimson_grass_block'] ?? -1]: 'c',
    [BK['v_70_mushroom_grass_block'] ?? -1]: 'm', [BK['clay'] ?? -1]: 'k',
    [BK['v_367_marble_block'] ?? -1]: 'a', [BK['v_368_granite_block'] ?? -1]: 'G',
    [BK['tree'] ?? -1]: 'T', [BK['v_5_trees'] ?? -1]: 'T',
  };
  const rows = [];
  for (let gy = 0; gy < H; gy++) {
    let row = '';
    for (let gx = 0; gx < W; gx++) {
      const counts = {};
      for (let x = gx * bx; x < (gx + 1) * bx && x < st.w; x += 2) {
        for (let y = gy * by; y < (gy + 1) * by && y < st.h; y += 2) {
          const i = st.idx(x, y);
          if (!st.flags[i]) { counts.air = (counts.air ?? 0) + 1; continue; }
          const ch = map[st.type[i]];
          counts[ch ?? '?'] = (counts[ch ?? '?'] ?? 0) + 1;
        }
      }
      let best = ' ', bn = 0;
      for (const [k, v] of Object.entries(counts)) {
        if (k === 'air') continue;
        if (v > bn) { bn = v; best = k; }
      }
      row += bn === 0 ? ' ' : best;
    }
    rows.push(row);
  }
  return { rows, bx, by, jungleX: world.jungleX, legend: 'd泥 s石 g草 J丛草 M泥 m蘑 S雪 I冰 .沙 :硬沙 E黑檀 C猩红 e/c邪草 a大理 G花岗 T树 k粘土' };
}, [which, wldBuf]);
console.log(out.rows.join('\n'));
console.log(`block=${out.bx}x${out.by} jungleX=${out.jungleX}`);
await browser.close();
