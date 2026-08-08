// 诊断:对比自建世界存档 vs 导入的官方 wld —— 生态分布/浮空块/地表剖面
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1400,height:900}});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const oursJson = readFileSync('/Users/vinlic/Downloads/map-新世界 (2).json', 'utf8');
const wldBuf = Array.from(readFileSync('/Users/vinlic/Downloads/不负责任的女妖啤酒厂.wld'));
const out = await page.evaluate(async ([oursJson, wldBuf]) => {
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const T = tiles.T;

  function analyze(save, label) {
    // 解码 tiles(save 为 json 字符串或 World 实例)
    const world = typeof save === 'string' ? loadSave(save).world : save;
    const st = world.store;
    const w = st.w, h = st.h;
    const res = { label, w, h };
    // 1) 各生态 bbox 与计数
    for (const [name, key] of [['mud','mud'], ['jgrass','v_60_jungle_grass_block'], ['snow','snow'], ['ice','ice'],
      ['hardsand','hardened_sand'], ['sand','sand'], ['ebon','v_25_ebonstone_block'], ['crim','v_203_crimstone_block'],
      ['mushgrass','v_70_mushroom_grass_block'], ['marble','v_367_marble_block'], ['granite','v_368_granite_block']]) {
      const id = BK[key]; if (id === undefined) continue;
      let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
        if (st.type[st.idx(x, y)] === id && st.flags[st.idx(x, y)]) {
          n++;
          if (n < 4000 || n % 7 === 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
      }
      res[name] = n > 0 ? { n, x: [x0, x1], y: [y0, y1] } : { n: 0 };
    }
    // 2) 浮空块(下方空且四邻空且上方空)
    let floating = 0;
    for (let x = 1; x < w - 1; x++) for (let y = 1; y < h - 1; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      if (!st.flags[st.idx(x, y + 1)] && !st.flags[st.idx(x - 1, y)] && !st.flags[st.idx(x + 1, y)] && !st.flags[st.idx(x, y - 1)]) floating++;
    }
    res.floating = floating;
    // 3) 地表粗糙度:相邻列地表差 >4 的比例
    const surf = new Int32Array(w);
    for (let x = 0; x < w; x++) { let y = 0; while (y < h && !st.flags[st.idx(x, y)]) y++; surf[x] = y; }
    let rough = 0;
    for (let x = 1; x < w; x++) if (Math.abs(surf[x] - surf[x - 1]) > 4) rough++;
    res.roughCols = rough;
    // 4) 表层 tile 类型采样(0-3 格深)
    const topCount = {};
    for (let x = 0; x < w; x += 3) {
      const t = st.type[st.idx(x, surf[x])];
      const k = Object.entries(BK).find(([kk, vv]) => vv === t)?.[0] ?? String(t);
      topCount[k] = (topCount[k] ?? 0) + 1;
    }
    res.surfaceTop = Object.entries(topCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return res;
  }

  let ours = null, ref = null, err = null;
  try {
    const mod = await import('/src/world/gen/WorldGen.ts');
    const fresh = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'fix1', name: 't' });
    ours = analyze(fresh, 'OURS(新生成)');
  } catch (e) { err = 'ours: ' + String(e); }
  try { const saved = analyze(oursJson, 'OURS(用户存档)'); ours = saved; } catch (e) { err = (err ? err + ' | ' : '') + 'saved: ' + String(e); }
  try {
    const refSave = JSON.stringify(parseWldToSave(new Uint8Array(wldBuf)).save);
    ref = analyze(refSave, 'REF(官方wld)');
  } catch (e) { err = (err ? err + ' | ' : '') + 'ref: ' + String(e); }
  return { ours, ref, err };
}, [oursJson, wldBuf]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
