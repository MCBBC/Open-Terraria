// _waterhollow:用户 debug report"水体大量空洞"定谳探针。
// 用户世界 seed=12345 4200×1200(=本探针世界),空洞区 = 藤蔓格(sheet52)+liquid255+wall2
// 对角带 (2352-2356, 265-267)。四路对拍:
//   A 页(默认,果冻管线 GL) 常规截图 + fullbright 截图
//   B 页(?wwarp=0,旧直画路径) 常规截图 + fullbright 截图
// fullbright(免光照)下若藤蔓格出现满亮水 = 水有画、纯光照暗;仍空洞 = 水未画。
// 单页串行 + bringToFront(rAF 后台冻结——上一版探针翻车点)。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');
const CX = 37329, CY = 4011;           // 用户 report 相机中心(世界 px)

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1512, height: 862 },
});

async function runPage(query, tag) {
  const errs = [];
  const p = await b.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`${ORIGIN}/?play=small${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
  }
  await p.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
      && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
  }
  await new Promise(r => setTimeout(r, 2000));
  // 钉用户态:正午、无风、玩家钉在相机中心
  const tiles = await p.evaluate((cx, cy) => {
    const g = window.__swGame, w = g.world, st = w.store;
    g.world.clock.timeOfDay = 0.5055;
    if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
    const pl = g.player;
    pl.x = cx - pl.w / 2; pl.y = cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
    // 冻结液体(水线静止)+清波场(静水对照)
    g.liquid.updateLiquid = () => {};
    const m = [];
    for (let ty = 264; ty <= 267; ty++) {
      const row = [];
      for (let tx = 2350; tx <= 2357; tx++) {
        const i = st.idx(tx, ty);
        row.push(`${st.flags[i] ? st.type[i] : '-'}|lq${st.liquid[i]}|w${st.wall[i]}`);
      }
      m.push(row.join(' '));
    }
    return m;
  }, CX, CY);
  console.log(`${tag} tiles(2350-2357 × 264-267):`, JSON.stringify(tiles));
  await new Promise(r => setTimeout(r, 2500));
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: `${OUT}/hollow-${tag}-normal.png` });
  // fullbright:免光照乘法——水有画即满亮
  await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: `${OUT}/hollow-${tag}-bright.png` });
  await p.evaluate(() => { window.__swGame.renderer.fullbright = false; });
  const warp = await p.evaluate(async () => {
    const liq = await import('/src/render/VanillaLiquidRenderer.ts');
    return liq.liquidDebugState().warp;
  });
  await p.close();
  return { warp, errs };
}

const A = await runPage('', 'warp');
const B = await runPage('&wwarp=0', 'legacy');
console.log('warp state A:', JSON.stringify(A.warp), ' B:', JSON.stringify(B.warp));
console.log('pageerrors:', JSON.stringify({ A: A.errs, B: B.errs }));
await b.close();
process.exit(A.errs.length || B.errs.length ? 1 : 0);
