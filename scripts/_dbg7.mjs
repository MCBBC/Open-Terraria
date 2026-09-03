import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 800, height: 600 },
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 1200));
const out = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  // 半砖正确帧:vanilla framing — 半砖 frameY=18? 检查被标格与新鲜格的 frame 对比
  const cells = [[2018, 1123], [2019, 1124], [2027, 1135], [1995, 1080]];
  return cells.map(([x, y]) => {
    const i = st.idx(x, y);
    return { x, y, half: st.half[i], slope: st.slope[i], t: st.type[i], fx: st.frameX[i], fy: st.frameY[i],
      L: st.liquid[st.idx(x - 1, y)], R: st.liquid[st.idx(x + 1, y)], U: st.liquid[st.idx(x, y - 1)],
      wall: st.wall[i] };
  });
});
for (const c of out) console.log(JSON.stringify(c));
// 对照:world 里正常渲染的半砖(找附近一个其他半砖)
const ref = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  for (let x = 2010; x < 2030; x++)
    for (let y = 1115; y < 1145; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.half[i] && st.liquid[st.idx(x, y - 1)] === 0)
        return { x, y, t: st.type[i], fx: st.frameX[i], fy: st.frameY[i], wall: st.wall[i] };
    }
  return null;
});
console.log('参照半砖(无上液):', JSON.stringify(ref));
await b.close();
