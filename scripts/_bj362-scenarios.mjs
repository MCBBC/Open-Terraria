// BJ362 场景矩阵探针：定位用户实报"日晷不转月晷"的真实条件。
//   E1 真实抛掷（从湖面上方带初速落入，复刻用户"扔进微光"）
//   E2 浅池（2 格深：物品顶上一格采样行=空气的临界几何）
//   E4 downed_398 门翻案（月总已败 flag 置位后再投）
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj362-scenarios.mjs
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
  await page.keyboard.type('BJ362b');
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

// ---- 湖定位 + E1/E2/E4 三场景 ----
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
  window.__bj362pool = { x: bestX, top: bestTop, bot: bestBot };
  return { bestX, bestTop, bestBot, flags: { ml: !!g.world.flags?.['downed_398'] } };
});
console.log('POOL:', JSON.stringify(setup));

async function runScenario(name, fn) {
  const r = await page.evaluate(fn);
  // 采样至 8s 或转变
  let out = null;
  for (let t = 0; t < 16; t++) {
    await new Promise((x) => setTimeout(x, 500));
    const s = await page.evaluate(() => window.__bj362drops());
    out = s;
    if (s.some((d) => d.itemId === 5381) && !s.some((d) => d.itemId === 3064)) break;
  }
  console.log(name, JSON.stringify(out));
}

await page.evaluate(() => {
  const g = window.__swGame;
  const pool = window.__bj362pool;
  // 统一采样器
  window.__bj362drops = () => g.entities.drops.map((d) => ({
    itemId: d.itemId, dead: d.dead, shimmered: d.shimmered,
    shimmerTime: +d.shimmerTime.toFixed(2), shimmerWet: d.shimmerWet,
    x: Math.round(d.x / 16), y: Math.round(d.y / 16), age: d.age,
  }));
  // 只留目标物：清场
  for (const d of g.entities.drops) d.dead = true;
});

// E1 真实抛掷：湖面上方 8 格，向湖心抛（vx 朝湖心，vy 2 下坠）
await page.evaluate(() => {
  const g = window.__swGame;
  const pool = window.__bj362pool;
  g.player.x = (pool.x - 6) * 16; g.player.y = (pool.top - 12) * 16;
  g.player.vx = 0; g.player.vy = 0;
  const drop = g.spawnDrop((pool.x - 3) * 16, (pool.top - 8) * 16, 'vi_3064_Sundial', 1, 1.5, 2);
  if (drop) { drop.noGrabDelay = 99999; drop.playerIndexTheItemIsReservedFor = -1; }
  window.__bj362e1 = drop ? drop.id : null;
});
await runScenario('E1-THROW-FROM-ABOVE:', null);

// E2 浅池：在湖边人造 2 格深小池（微光液灌入），物品落入后顶上一格=空气
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const pool = window.__bj362pool;
  const px = pool.x - 12;   // 湖边空地
  // 找地表
  let gy = pool.top - 1;
  for (let y = pool.top - 20; y < pool.top; y++) if (st.isSolid(px, y)) gy = y;
  // 人造池：挖 3×3，底=gy+1，液=gy,gy-1（2 格深）
  for (let x = px; x < px + 3; x++) for (let y = gy - 2; y <= gy; y++) st.setTile(x, y, 0);
  st.setTile(px, gy + 1, 1); st.setTile(px + 1, gy + 1, 1); st.setTile(px + 2, gy + 1, 1);
  st.setLiquid(px, gy, 255, 4); st.setLiquid(px + 1, gy, 255, 4); st.setLiquid(px + 2, gy, 255, 4);
  st.setLiquid(px, gy - 1, 255, 4); st.setLiquid(px + 1, gy - 1, 255, 4); st.setLiquid(px + 2, gy - 1, 255, 4);
  window.__bj362e2cell = { x: px + 1, y: gy };
  const drop = g.spawnDrop((px + 1) * 16 + 8, (gy - 4) * 16, 'vi_3064_Sundial', 1, 0, 1);
  if (drop) { drop.noGrabDelay = 99999; }
});
await runScenario('E2-SHALLOW-2DEEP:', null);

// E4 月总 flag 置位后（原湖）再投一枚
await page.evaluate(() => {
  const g = window.__swGame;
  const pool = window.__bj362pool;
  g.world.flags = g.world.flags || {};
  g.world.flags['downed_398'] = true;
  for (const d of g.entities.drops) if (!d.dead && d.itemId === 5381) d.dead = true;
  const drop = g.spawnDrop((pool.x + 1) * 16, (pool.top + 4) * 16, 'vi_3064_Sundial', 1, 0, 0);
  if (drop) { drop.noGrabDelay = 99999; }
});
await runScenario('E4-MOONLORD-FLAG:', null);

await browser.close();
console.log('DONE');
