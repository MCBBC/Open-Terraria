// BJ362 实机验证探针（修后）：旧克隆键发放（用户历史路径）→ 应得真件 → 扔微光应变月晷。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj362-verify.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ362v');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('1');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const sx = g.world.shimmerX, sy = g.world.shimmerY;
  let bestX = 0, bestTop = -1, bestBot = -1;
  for (let dx = -40; dx <= 40; dx++) {
    const x = sx + dx;
    let top = -1, bot = -1;
    for (let y = sy - 60; y < Math.min(sy + 120, st.h); y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 4) { if (top < 0) top = y; bot = y; }
    }
    if (top >= 0 && (bot - top) > (bestBot - bestTop)) { bestTop = top; bestBot = bot; bestX = x; }
  }
  const midY = Math.floor((bestTop + bestBot) / 2);
  // 用户历史路径：以旧克隆键 place_v_356_enchanted_sundial 发放（退位别名应落到真件）
  const drop = g.spawnDrop(bestX * 16 + 8, midY * 16, 'place_v_356_enchanted_sundial', 1, 0, 0);
  const out = { pool: { x: bestX, top: bestTop, bot: bestBot } };
  if (!drop) { out.fail = 'spawnDrop null'; return out; }
  out.dropKeyAfter = (drop.itemId === 3064) ? 'vi_3064_Sundial(REAL)' : `itemId=${drop.itemId}`;
  out.noGrab = (drop.noGrabDelay = 99999) !== undefined;
  return out;
});
console.log('SETUP:', JSON.stringify(setup));

if (!setup.fail) {
  let verdict = 'TIMEOUT';
  for (let t = 0; t < 20; t++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await page.evaluate(() => window.__swGame.entities.drops.map((d) => ({ itemId: d.itemId, shimmered: d.shimmered, dead: d.dead })));
    if (s.some((d) => d.itemId === 5381)) { verdict = 'TRANSFORMED->5381 ENCHANTED MOONDIAL (shimmered=' + s.find((d) => d.itemId === 5381).shimmered + ')'; break; }
    if (!s.some((d) => d.itemId === 3064 || d.itemId === 5381)) { verdict = 'DROP LOST'; break; }
  }
  console.log('VERDICT:', verdict);
}
await browser.close();
