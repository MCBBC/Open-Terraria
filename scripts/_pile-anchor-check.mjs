// 诊断:P-P1——186/187 堆锚定校验(下方不得为 pass 头非实心族/半砖/顶坡)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MACOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const K = tiles.TILE_BY_KEY, D = tiles.TILE_DEFS;
  const sheetOf = (t) => D[t]?.vanilla?.sheet ?? -1;
  const NON_SOLID = new Set([379, 229, 190, 196, 189, 717, 718, 719, 202, 460, 484]);
  const t186 = K['v_186_decos_3x2'], t187 = K['v_187_decos_3x2_group_2'];
  const res = [];
  for (const seed of ['pile-a', 'pile-b']) {
    const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 'probe' });
    const st = world.store;
    // 找 3×2 堆的底行左锚(frameY==18 且 frameX%54==0),检查其下一行 3 列
    let anchors = 0, badNonSolid = 0, badSlope = 0, badHalf = 0, badCloud = 0;
    const badSamples = [];
    for (let y = 1; y < st.h - 2; y++) {
      for (let x = 1; x < st.w - 3; x++) {
        const k = y * st.w + x;
        if (!st.flags[k] || st.type[k] !== t186 && st.type[k] !== t187) continue;
        if (st.frameY[k] !== 18 || st.frameX[k] % 54 !== 0) continue;
        // 需为完整 3×2(上行同 style 左锚在 y-1)
        const ku = (y - 1) * st.w + x;
        if (!st.flags[ku] || st.type[ku] !== st.type[k] || st.frameX[ku] !== st.frameX[k]) continue;
        anchors++;
        for (let dx = 0; dx < 3; dx++) {
          const g = (y + 1) * st.w + (x + dx);
          if (!st.flags[g]) { badNonSolid++; if (badSamples.length < 5) badSamples.push({x: x+dx, y: y+1, why:'inactive'}); continue; }
          const sh = sheetOf(st.type[g]);
          if (NON_SOLID.has(sh)) { badNonSolid++; if (badSamples.length < 5) badSamples.push({x: x+dx, y: y+1, why:'sheet'+sh}); }
          if (st.half[g]) badHalf++;
          const sl = st.slope[g];
          if (sl >= 1 && sl <= 2) badSlope++;
          if (sh === 189 || sh === 196) badCloud++;
        }
      }
    }
    res.push({ seed, anchors, badNonSolid, badSlope, badHalf, badCloud, badSamples });
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
await browser.close();
process.exit(errs.length ? 1 : 0);
