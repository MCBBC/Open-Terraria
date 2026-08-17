// 渔夫放置位置诊断:精确输出 NPC 位置 vs 地面/海平面/水深
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = g.world;
  const angler = g.entities.npcs.find((n) => n.npcKey === 'angler');
  if (!angler) return { found: false, groundLevel: w.groundLevel };
  const tx = Math.floor(angler.cx / 16);
  const ty = Math.floor((angler.y + angler.h) / 16);
  let openSky = true;
  for (let y = ty - 1; y >= Math.max(0, ty - 60); y--) {
    if (st.isSolid(tx, y)) { openSky = false; break; }
  }
  let seaLevel = -1;
  for (let y = 0; y < Math.min(st.h, ty + 20); y++) {
    if (st.liquid[st.idx(tx, y)] > 0) { seaLevel = y; break; }
  }
  return {
    found: true, bound: angler.bound, x: tx, y: ty,
    groundLevel: w.groundLevel,
    below: ty - w.groundLevel,
    openSky, seaLevel,
    liquidAtNpc: st.liquid[st.idx(tx, ty - 1)],
    ground: st.get(tx, ty),
  };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('渔夫已放置', out.found === true);
if (out.found) {
  check('渔夫露天(头顶 60 格无方块)', out.openSky === true, `openSky=${out.openSky}`);
  check('渔夫不在水中', out.liquidAtNpc === 0, `liquid=${out.liquidAtNpc}`);
  check('渔夫在地面以上(≤5 格)', out.below <= 5, `y=${out.y} groundLevel=${out.groundLevel} diff=${out.below}`);
  check('渔夫不在海底(<20 格深)', out.below < 20, `depth_below_surface=${out.below}`);
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
