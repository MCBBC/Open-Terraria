// 四轮行为冒烟：翅膀飞行/滑翔/冲刺双击/水面行走（scripts/_behavior2-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('翅膀测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const out = {};
  // 挪到出生点上空干净位置
  const px = g.world.spawnX, py = g.world.spawnY - 20;
  p.x = px * 16; p.y = py * 16; p.vx = 0; p.vy = 0;

  // ===== 1. 翅膀飞行（恶魔之翼 492：100t / 6.25）=====
  p.inv.armor[3] = { id: g.itemId('vi_492_DemonWings'), stack: 1 };
  out.wing = p.equipStats.wing;
  p.onGround = true;
  p.fixedUpdate(1, g); // 落地重置 wingTime=100
  out.wingRefill = p.wingTime;
  p.onGround = false; p.vy = 3; p.inputJump = false;
  p.fixedUpdate(1, g); // 松键 → wingRelease=true
  p.inputJump = true;
  const wt0 = p.wingTime;
  p.fixedUpdate(1, g); // 飞行帧
  out.wingFly = { vy: Math.round(p.vy), consumed: wt0 - p.wingTime };
  // ===== 2. 翅膀滑翔（时间耗尽后按住跳缓降）=====
  p.wingTime = 0; p.vy = 8; p.inputJump = true;
  p.fixedUpdate(1, g);
  out.wingGlideVy = Math.round(p.vy); // 期望被钳到 ~2.5+重力

  // ===== 3. 冲刺（忍者大师装备 984：同向双击 → vx 12.5、vy 0）=====
  p.inv.armor[3] = null;
  p.inv.armor[4] = { id: g.itemId('vi_984_MasterNinjaGear'), stack: 1 };
  out.dashType = p.equipStats.dash;
  p.onGround = true; p.dashCd = 0; p.dashT = 0;
  p.inputX = 1; p.inputJump = false;
  p.fixedUpdate(1, g); // 首次按下 → 只设窗口
  out.dashT = p.dashT;
  p.inputX = 0;
  p.fixedUpdate(1, g); // 松开
  p.inputX = 1;
  p.fixedUpdate(1, g); // 二次按下 → 触发冲刺
  out.dashTrigger = { ticks: p.dashTicks, vx: Math.round(p.vx), vy: Math.round(p.vy) };

  // ===== 4. 水面行走（水上漂靴 863：落向水面站住）=====
  p.inv.armor[4] = null;
  p.inv.armor[5] = { id: g.itemId('vi_863_WaterWalkingBoots'), stack: 1 };
  out.waterWalk = p.equipStats.waterWalk;
  // 找真实地表（该列首个实心格），向下挖 3 深水池（两列防跨列 ledge）
  const wx = px + 5;
  let surf = 10;
  for (let y = 10; y < st.h - 10; y++) {
    if (st.flags[st.idx(wx, y)]) { surf = y; break; }
  }
  for (const col of [wx, wx + 1]) {
    for (let dy = 0; dy < 3; dy++) {
      const i = st.idx(col, surf + dy);
      st.type[i] = 0; st.flags[i] = 0;
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  p.x = wx * 16 + 4; p.y = (surf - 5) * 16; p.vx = 0; p.vy = 0;
  p.inputX = 0; p.inputJump = false;
  for (let k = 0; k < 60; k++) p.fixedUpdate(1, g);
  out.waterSurface = { on: p.onWaterSurface, vy: Math.round(p.vy), surf, y: Math.round(p.y / 16) };
  return out;
});
console.log('BEHAVIOR2', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
