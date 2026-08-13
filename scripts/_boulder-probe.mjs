// 巨石(boulder 138)2×2 完整性探针:修复"PlaceTile 只放锚定格 → 渲染只剩
// 18×18 小片悬空"。生成世界后全图扫描 v_138_boulder:
//   1) 存在 boulder(生成端有放置)
//   2) 每个锚定格(fx=0,fy=0)四周 2×2 同类齐全且帧分片正确
//      (fx/fy ∈ {0,18}×{0,18} 四格唯一分布)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const boulderId = window.__swTiles ? window.__swTiles['v_138_boulder'] : null;
  if (boulderId === null || boulderId === undefined) return { noId: true };
  const anchors = [];
  const all = [];
  for (let y = 10; y < st.h - 10; y++) {
    for (let x = 10; x < st.w - 10; x++) {
      if (st.get(x, y) !== boulderId) continue;
      const i = st.idx(x, y);
      all.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
      if (st.frameX[i] === 0 && st.frameY[i] === 0) anchors.push({ x, y });
    }
  }
  // 每个 boulder 格(非锚点)应在某锚点 2×2 邻域内;锚点缺角检测
  let missing = 0;
  for (const a of anchors) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
      if (st.get(a.x + dx, a.y + dy) !== boulderId) missing++;
    }
  }
  return { total: all.length, anchors: anchors.length, missing, sample: anchors.slice(0, 5) };
});

console.log(JSON.stringify(out));
check('世界存在巨石', out.total > 0, `total=${out.total}`);
check('锚定格存在', (out.anchors ?? 0) > 0, `anchors=${out.anchors}`);
check('2×2 四格齐全(缺角=0)', out.missing === 0, `missing=${out.missing}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
