// BJ362 实机探针：附魔日晷 3064 入微光 → 应变 5381 附魔月晷。
//   用户实报"扔进微光里不会变成月晷"，但 vitest 合成池探针通过 → 实机复现定位。
//   步骤：_boot → 定位 worldgen 微光湖(shimmerX/Y) → 验液格编码 → 传送玩家 →
//   g.spawnDrop（真实生产路径）投入湖心 → 逐 500ms 采样 vid/shimmered/shimmerTime
//   → 对照组 3460→947 同池投验。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj362-sundial-shimmer.mjs
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
  await page.keyboard.type('BJ362');
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

// ---- 主实验：微光湖定位 + 投物 + 逐拍采样 ----
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const sx = g.world.shimmerX, sy = g.world.shimmerY;
  const diag = { sx, sy };
  if (!sx || !sy) return { fail: 'no shimmerX/Y', diag };
  // 从 (sx, sy) 向下找微光液柱：取最深连续微光列的湖心
  let bestX = 0, bestTop = -1, bestBot = -1;
  for (let dx = -40; dx <= 40; dx++) {
    const x = sx + dx;
    let top = -1, bot = -1;
    for (let y = sy - 60; y < Math.min(sy + 120, st.h); y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 4) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0 && (bot - top) > (bestBot - bestTop)) { bestTop = top; bestBot = bot; bestX = x; }
  }
  if (bestTop < 0) return { fail: 'no shimmer liquid near shimmerX/Y', diag };
  const midY = Math.floor((bestTop + bestBot) / 2);
  diag.pool = { x: bestX, top: bestTop, bot: bestBot, midY };
  // 液格编码采样
  const enc = [];
  for (let y = bestTop; y <= Math.min(bestBot, bestTop + 4); y++) {
    const i = st.idx(bestX, y);
    enc.push({ y, liq: st.liquid[i], lt: st.liquidType[i] });
  }
  diag.enc = enc;
  // 传送玩家到湖上方（防拾取距离外 6 格）
  g.player.x = (bestX + 3) * 16; g.player.y = (bestTop - 6) * 16;
  g.player.vx = 0; g.player.vy = 0;
  // 投附魔日晷（真实生产路径 spawnDrop）到湖心
  const key = 'vi_3064_Sundial';
  const drop = g.spawnDrop(bestX * 16 + 8, midY * 16, key, 1, 0, 0);
  if (!drop) return { fail: 'spawnDrop null', diag };
  drop.noGrabDelay = 99999;
  diag.dropId0 = drop.itemId;
  diag.dropKey0 = (window.__swItemDefs?.[drop.itemId])?.key ?? null;
  // 对照组：3460→947（vanilla-shimmer itemTransformTo 对）
  const cdrop = g.spawnDrop((bestX + 2) * 16 + 8, midY * 16, 'vi_3460_Frostbrand', 1, 0, 0);
  diag.ctrlOk = !!cdrop;
  if (cdrop) cdrop.noGrabDelay = 99999;
  return { ok: true, diag, dropRef: true };
});
console.log('SETUP:', JSON.stringify(setup.diag ?? setup));

if (setup.ok) {
  // 逐 500ms 采样至 12s
  const samples = [];
  for (let t = 0; t < 24; t++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await page.evaluate(() => {
      const g = window.__swGame;
      const defs = null;
      return g.entities.drops.map((d) => ({
        itemId: d.itemId, dead: d.dead, shimmered: d.shimmered,
        shimmerTime: +d.shimmerTime.toFixed(2), shimmerWet: d.shimmerWet,
        stack: d.stack, age: d.age,
      }));
    });
    samples.push({ t: t * 0.5, drops: s });
    const sundialGone = s.some((d) => d.itemId === 5381);
    if (sundialGone && s.every((d) => d.itemId !== 3064)) break;
  }
  console.log('SAMPLES:');
  for (const s of samples) console.log(JSON.stringify(s));
  const last = samples[samples.length - 1];
  const sundial = last.drops.find((d) => d.itemId === 3064 || d.itemId === 5381);
  console.log('VERDICT:', sundial ? (sundial.itemId === 5381 ? 'TRANSFORMED->5381 MOONDIAL' : 'STILL 3064 SUNDIAL (NO TRANSFORM)') : 'DROP LOST');
}

await browser.close();
