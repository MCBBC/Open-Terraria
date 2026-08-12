// 空洞平直度对比:随机空气格的最长直线(4 向)延伸长度分布
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const wldBuf = Array.from(readFileSync('/Users/vinlic/Downloads/不负责任的女妖啤酒厂.wld'));
const out = await page.evaluate(async ([wldBuf]) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const ref = loadSave(JSON.stringify(parseWldToSave(new Uint8Array(wldBuf)).save)).world;
  const fresh = await mod.generateWorld({ width: 2100, height: 700, seedText: 'fix1', name: 't' });
  const straightness = (st, x0, x1, y0, y1) => {
    // 随机 300 个空气格:四方向各自延伸长度取最大
    const runs = [];
    for (let n = 0; n < 300; n++) {
      const x = x0 + Math.floor(Math.random() * (x1 - x0));
      const y = y0 + Math.floor(Math.random() * (y1 - y0));
      if (st.flags[st.idx(x, y)]) { runs.push(0); continue; }
      let best = 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        let k = 0;
        while (!st.flags[st.idx(x + dx*(k+1), y + dy*(k+1))]) k++;
        best = Math.max(best, k);
      }
      runs.push(best);
    }
    runs.sort((a, b) => a - b);
    const q = (p) => runs[Math.floor(runs.length * p)];
    return { med: q(0.5), p90: q(0.9), max: runs[runs.length - 1] };
  };
  return {
    refRock: straightness(ref.store, 1000, 5500, 900, 1500),
    oursRock: straightness(fresh.store, 100, 2000, 300, 580),
    refDirt: straightness(ref.store, 1000, 5500, 450, 800),
    oursDirt: straightness(fresh.store, 100, 2000, 180, 280),
  };
}, [wldBuf]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
