// 打印已知烟囱(4130..4133×428..444)全部格的 type/frameX/frameY，核对存档行数与发射锚位
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 }, protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
const out = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  const tmap = null;
  void tmap;
  const lines = [];
  for (let y = 426; y <= 446; y++) {
    let row = `y${String(y).padStart(3)} `;
    for (let x = 4128; x <= 4135; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { row += '.          '; continue; }
      row += `${String(st.type[i]).padEnd(3)}:${st.frameX[i]},${String(st.frameY[i]).padStart(3)} `;
    }
    lines.push(row);
  }
  return lines.join('\n');
});
console.log(out);
process.exit(0);
