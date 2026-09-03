// 诊断「有翅膀在水中无法脱离飞起」：分段验证 水跳→出水截跳→翅膀接手 链条。
//   A) wingTime 满格：水底按住跳 4s——sustain 是否钉 vy(水中-6.01/出水-5.01)、
//      出水截跳、jumpHold==0 后 flag19 翅膀是否接手、是否飞离水面
//   B) wingTime=0：水底踩底静置 2s——wingTime 是否回满（原版 :26978
//      `(vy==0||sliding) && releaseJump` 公共路径，水里踩底照样回满）
//   C) wingTime=0 干地静置 2s——对照组（本仓 onGround 回满应生效）
//   D) wingTime=0 再按住跳 4s——翅膀是否永不接手（死循环复现）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pgerr]', String(e).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5202') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const T = 16;
  const snap = () => ({
    t: g.tickCount, y: Math.round(p.y), vy: +p.vy.toFixed(2),
    wet: p.inWater ? 1 : 0, g: p.onGround ? 1 : 0,
    jh: p.jumpHold, wt: +p.wingTime.toFixed(2), wf: p.wingFrame,
    surf: p.onWaterSurface ? 1 : 0, wc: p.wetCount,
  });

  // ---- 装备隔离：只留天使翼 ----
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  const wingId = g.itemId('vi_493_AngelWings');
  p.inv.armor[3] = { id: wingId, stack: 1 };
  await sleep(400);
  const wingInfo = p.equipStats.wing
    ? { logic: p.equipStats.wing.logic, time: p.equipStats.wing.time }
    : 'NO-WING';

  // ---- 建池：清平地 → 石壁池 11 宽×8 深 → 注满水（type1=water，池底 = by+1 行）----
  const bx = Math.floor(p.x / T), by = Math.floor(p.y / T);
  for (let dx = -16; dx <= 16; dx++) for (let dy = -14; dy <= 12; dy++) {
    st.setTileSilent(bx + dx, by + dy, 0); st.setWallSilent(bx + dx, by + dy, 0);
    st.setLiquid(bx + dx, by + dy, 0, 0);
  }
  for (let dy = -8; dy <= 0; dy++) {           // 石壁（by+1 为底行）
    st.setTileSilent(bx - 5, by + dy, 2); st.setTileSilent(bx + 5, by + dy, 2);
  }
  for (let x = bx - 5; x <= bx + 5; x++) st.setTileSilent(x, by + 1, 2);   // 池底
  for (let y = by - 7; y <= by; y++) for (let x = bx - 4; x <= bx + 4; x++) st.setLiquid(x, y, 255, 1);
  await sleep(400);

  // ---- 玩家投放池底中央 ----
  p.x = bx * T; p.y = (by + 1) * T - p.h;     // 脚踩池底顶面
  p.vx = 0; p.vy = 0; p.onGround = false;
  await sleep(1600);
  const stateBottom = { ...snap(), wingTimeMax: p.equipStats.wing?.time ?? 0 };

  // ---- 水面参考：向上扫描首个非满水格 ----
  let surfY = null;
  for (let y = by - 8; y <= by; y++) {
    if (st.liquid[st.idx(bx, y)] < 200) { surfY = y * T; break; }
  }

  // ---- A: wingTime 满格按住跳 4s ----
  g.input.keys.add('Space');
  await sleep(4000);
  g.input.keys.delete('Space');
  const holdA = { ...snap() };
  await sleep(1200);
  const restA = { ...snap() };

  // ---- B: wingTime=0 水底静置 2s（不按跳）----
  p.wingTime = 0;
  p.y = (by + 1) * T - p.h; p.vx = 0; p.vy = 0;
  await sleep(300);
  const wt0 = p.wingTime;
  await sleep(2000);
  const afterBottomRest = { ...snap(), wtStart: wt0 };

  // ---- C: 对照——干地静置 2s ----
  // 池边干地：bx+8 处建石台
  for (let dx = 7; dx <= 10; dx++) st.setTileSilent(bx + dx, by + 1, 2);
  p.x = (bx + 8) * T; p.y = (by + 1) * T - p.h; p.vx = 0; p.vy = 0;
  await sleep(400);
  p.wingTime = 0;
  const wtC0 = p.wingTime;
  await sleep(2000);
  const afterDryRest = { ...snap(), wtStart: wtC0 };

  // ---- D: wingTime=0 水底按住跳 4s（死循环复现）----
  p.x = bx * T; p.y = (by + 1) * T - p.h; p.vx = 0; p.vy = 0; p.wingTime = 0;
  await sleep(800);
  const wtd0 = p.wingTime;
  const samplesD = [];
  const iv = setInterval(() => samplesD.push(snap()), 16);
  g.input.keys.add('Space');
  await sleep(4000);
  g.input.keys.delete('Space');
  clearInterval(iv);
  await sleep(800);
  const restD = { ...snap() };

  return {
    wingInfo, surfY, stateBottom,
    A: { holdA, restA },
    B: afterBottomRest,
    C: afterDryRest,
    D: { wtStart: wtd0, minWt: Math.min(...samplesD.map(s => s.wt)), maxWtDuring: Math.max(...samplesD.map(s => s.wt)),
         maxY: Math.max(...samplesD.map(s => s.y)), minY: Math.min(...samplesD.map(s => s.y)), restD,
         tail: samplesD.slice(-8) },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
