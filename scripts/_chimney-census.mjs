// 烟囱(内部id)全图普查：每个物体的行数与 frameY 集合
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 400, height: 300 }, protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json')),'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
const out = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  const tid = (() => {
    // 内部 id 反查：直接扫一个已知格拿 id（用 dump 结论 x4130,y435）
    return st.type[st.idx(4130, 435)];
  })();
  const groups = new Map();       // "x,y(top-left)" -> Set(fy)
  const seen = new Uint8Array(st.w * st.h);
  const DXY = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let y = 1; y < st.h - 1; y++) {
    for (let x = 1; x < st.w - 1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== tid || seen[i]) continue;
      // flood fill 同型连通块
      const fys = new Set(); let minX = x, maxX = x, minY = y, maxY = y, cnt = 0;
      const stack = [[x, y]];
      seen[i] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const ci = st.idx(cx, cy); cnt++;
        fys.add(st.frameY[ci]);
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [dx, dy] of DXY) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= st.w - 1 || ny >= st.h - 1) continue;
          const ni = st.idx(nx, ny);
          if (seen[ni] || !st.flags[ni] || st.type[ni] !== tid) continue;
          seen[ni] = 1; stack.push([nx, ny]);
        }
      }
      groups.set(`${minX},${minY}`, { rows: maxY - minY + 1, cols: maxX - minX + 1,
        fys: [...fys].sort((a,b)=>a-b), cnt });
    }
  }
  const list = [...groups.entries()].map(([k,v]) => ({at:k,...v}));
  return { internalId: tid, totalObjects: list.length, objects: list.slice(0,20) };
});
console.log(JSON.stringify(out,null,1));
process.exit(0);
