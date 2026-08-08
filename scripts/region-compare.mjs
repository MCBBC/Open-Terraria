// 高分辨率区域对比:自建 vs 参考 wld(同一相对位置的局部 ASCII)
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const wldBuf = Array.from(readFileSync('/Users/vinlic/Downloads/不负责任的女妖啤酒厂.wld'));
const which = process.argv[2] || 'jungle';
const out = await page.evaluate(async ([wldBuf, which]) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const ref = loadSave(JSON.stringify(parseWldToSave(new Uint8Array(wldBuf)).save)).world;
  const fresh = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'deep1', name: 't' });
  const JG = BK['v_60_jungle_grass_block'], MUD = BK['mud'];
  const dump = (st, x0, x1, y0, y1) => {
    const rows = [];
    for (let y = y0; y < y1; y++) {
      let row = '';
      for (let x = x0; x < x1; x++) {
        if (!st.inBounds(x, y)) { row += '?'; continue; }
        const i = st.idx(x, y);
        if (!st.flags[i]) { row += st.liquid[i] ? '~' : ' '; continue; }
        const t = st.type[i];
        const c = t === MUD ? 'M' : t === JG ? 'J' : t === BK['dirt'] ? 'd'
          : t === BK['stone'] ? 's' : t === BK['grass'] ? 'g' : t === BK['tree'] ? 'T'
          : t === BK['snow'] ? 'S' : t === BK['ice'] ? 'I' : t === BK['sand'] ? '.'
          : t === BK['v_189_cloud_block'] ? 'o' : t === BK['clay'] ? 'k' : t === BK['silt'] ? 't'
          : t === BK['v_52_vines'] ? 'v' : t === BK['v_80_cactus'] ? '|' : '#';
        row += c;
      }
      rows.push(row);
    }
    return rows;
  };
  // 丛林表面条带(表面±20)与内部(地表+150~+250):以各自 jungleX 为中心 ±60
  const findJungle = (st) => {
    // 泥+丛林草密度最高的列(丛林核心柱)
    let bestX = Math.floor(st.w / 2), bestN = -1;
    for (let x = 0; x < st.w; x += 8) {
      let n = 0;
      for (let y = 0; y < st.h; y += 6) {
        const t = st.type[st.idx(x, y)];
        if (t === JG || t === MUD) n++;
      }
      if (n > bestN) { bestN = n; bestX = x; }
    }
    return bestX;
  };
  const strip = (world, label) => {
    const st = world.store;
    const jx = findJungle(st);
    let sy = 0;
    while (sy < st.h && !st.flags[st.idx(jx, sy)]) sy++;
    return {
      label,
      surface: dump(st, jx - 50, jx + 50, Math.max(0, sy - 18), sy + 6),
      interior: dump(st, jx - 50, jx + 50, sy + 140, sy + 170),
    };
  };
  return { which, ours: strip(fresh, 'OURS'), ref: strip(ref, 'REF') };
}, [wldBuf, which]);
const half = Math.ceil(out.ours.surface[0].length / 2);
const rowH = Math.max(out.ours.surface.length, out.ours.interior.length);
for (let r = 0; r < rowH; r++) {
  const l1 = (out.ours.surface[r] ?? '').padEnd(100);
  const l2 = (out.ours.interior[r] ?? '').padEnd(100);
  console.log(String(r).padStart(2) + ' ' + l1.slice(0, 50) + '|' + l1.slice(50, 100) + '   ' + l2.slice(0, 50) + '|' + l2.slice(50, 100));
}
console.log('--- REF ---');
for (let r = 0; r < rowH; r++) {
  const l1 = (out.ref.surface[r] ?? '').padEnd(100);
  const l2 = (out.ref.interior[r] ?? '').padEnd(100);
  console.log(String(r).padStart(2) + ' ' + l1.slice(0, 50) + '|' + l1.slice(50, 100) + '   ' + l2.slice(0, 50) + '|' + l2.slice(50, 100));
}
await browser.close();
