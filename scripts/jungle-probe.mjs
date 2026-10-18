// 丛林密度采样:自建 vs 参考,各取丛林中心列的成分剖面
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const wldBuf = Array.from(readFileSync(needInput(join(DOWNLOADS, '不负责任的女妖啤酒厂.wld'))));
const out = await page.evaluate(async ([wldBuf]) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const MUD = BK['mud'], JG = BK['v_60_jungle_grass_block'];

  function density(st, cx, y0, y1, label) {
    let mud = 0, jg = 0, air = 0, other = 0;
    for (let x = cx - 40; x <= cx + 40; x++) {
      for (let y = y0; y <= y1; y++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) air++;
        else if (st.type[i] === MUD) mud++;
        else if (st.type[i] === JG) jg++;
        else other++;
      }
    }
    const tot = mud + jg + air + other;
    return { label, mudP: +(mud / tot * 100).toFixed(1), jgP: +(jg / tot * 100).toFixed(1), airP: +(air / tot * 100).toFixed(1), otherP: +(other / tot * 100).toFixed(1) };
  }

  const fresh = await mod.generateWorld({ width: 2100, height: 700, seedText: 'fix1', name: 't' });
  const ref = loadSave(JSON.stringify(parseWldToSave(new Uint8Array(wldBuf)).save)).world;
  // 自建:丛林中心 ≈ jungleX;参考:jgrass bbox 中心 x≈4400
  return {
    oursJungleX: fresh.jungleX,
    ours: density(fresh.store, fresh.jungleX, 200, 600, 'ours jungle core (y200-600)'),
    ref: density(ref.store, 4400, 600, 1400, 'ref jungle core (y600-1400)'),
  };
}, [wldBuf]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
