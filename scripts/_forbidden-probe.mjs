// Forbidden 禁戒符号整引擎 目视探针（组C 终盘 2026-09-18,SW_PORT=5234 私有实例）。
// 判据：①符号环（Extra_74+Glow_217,随 miscCounter 浮动）绘制于玩家头侧;
//       ②指令后 Ancient Storm 柱身堆叠绘制+尘 269 光照;
//       ③夜面光照（AddLight 0.8,0.7,0.2）玩家周身泛暖黄。
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
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5234',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('禁戒');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await new Promise((r) => setTimeout(r, 500));
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await page.keyboard.type('1');
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
await new Promise((r) => setTimeout(r, 300));
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
// 关欢迎弹窗（挡镜头）
try {
  await page.click('.sw-dialog button, [data-act=ok], .sw-modal button', { timeout: 3000 });
} catch { /* 无弹窗 */ }
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .sw-btn, [class*=btn]')]
    .find((b) => (b.textContent ?? '').includes('我已知晓'));
  if (btn) btn.click();
  document.getElementById('__swWelcome')?.remove();
});
await new Promise((r) => setTimeout(r, 800));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const items = await import('/src/data/items.ts');
  const vr = await import('/src/data/vanillaRecipes.ts');
  const iid = (vid) => items.ITEM_BY_KEY[vr.vanillaItemKey(vid)];
  if (!iid(3776) || !iid(3777) || !iid(3778)) return { fail: 'forbidden items missing' };
  // 装 Forbidden 全套
  const p = g.player;
  p.inv.armor[0] = { id: iid(3776), stack: 1 };
  p.inv.armor[1] = { id: iid(3777), stack: 1 };
  p.inv.armor[2] = { id: iid(3778), stack: 1 };
  // 落地稳定
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const setForbidden = p.setForbidden === true;
  const setBonusName = p.equipStats.setBonus?.name ?? null;
  // 白面截图（符号环）——晴空开阔地（出生点附近）
  p.x = Math.floor(p.x); p.y = Math.floor(p.y);
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 30; i++) { g.fixedUpdate(1 / 60); p.vx = 0; p.vy = 0; }
  await wait(1200);
  return { setForbidden, setBonusName, px: p.x, py: p.y };
});
if (res.fail) { console.log('PROBE-FAIL', JSON.stringify(res)); await browser.close(); process.exit(1); }
console.log('state:', JSON.stringify(res));

const cvInfo = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')];
  const cv = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return { w: cv?.width ?? 0, h: cv?.height ?? 0 };
});
console.log('canvas:', JSON.stringify(cvInfo));
await page.screenshot({ path: '/tmp/forbidden-ring-day.png' });

// 指令面：瞄准落地点（玩家左侧 260px）→ CommandForbiddenStorm → 柱身目视
const storm = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  p.mana = p.maxMana;
  p.inputAimWorldX = p.cx - 260;
  p.inputAimWorldY = p.cy;
  p.minionRestTargetAim(g);
  const aim = { x: p.minionRestTargetX, y: p.minionRestTargetY };
  p.commandForbiddenStorm(g);
  // 渲染若干帧让柱身/尘展开
  for (let i = 0; i < 45; i++) { g.fixedUpdate(1 / 60); await wait(16); }
  const projs = (g.entities?.projectiles ?? []).filter((q) => q.ai0 !== undefined && q.constructor?.name === 'ForbiddenSignProj');
  const s = projs[projs.length - 1];
  return {
    aim, spawned: projs.length,
    ai0: s?.ai0 ?? -1, colTopY: s?.colTopY ?? -1, colBottomY: s?.colBottomY ?? -1,
    w: s?.w ?? 0, h: s?.h ?? 0, dmg: s?.damage ?? -1,
    mana: Math.round(p.mana),
  };
});
console.log('storm:', JSON.stringify(storm));
await page.screenshot({ path: '/tmp/forbidden-storm-day.png' });

// 光照取证：玩家置深处岩层空腔（全黑）→ AddLight(0.8,0.7,0.2) 暖黄照明
await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = g.world.store;
  const p = g.player;
  const col = Math.floor(p.cx / 16);
  let ty = 600;
  for (; ty < st.h - 20; ty++) {
    let solid = true;
    for (let d = 0; d < 12; d++) {
      const t = st.type[st.idx(col, ty + d)];
      if (!(t === 1 || t === 2 || t === 3)) { solid = false; break; }   // 泥/石/粘土,空气不算
    }
    if (solid) break;
  }
  for (let dx = -1; dx <= 1; dx++) for (let dy = -3; dy <= 0; dy++) {
    st.setTileSilent(col + dx, ty + dy, 0);
  }
  p.x = col * 16 + 8 - p.w / 2;
  p.y = (ty - 3) * 16 + 8;
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 60; i++) { g.fixedUpdate(1 / 60); p.vx = 0; p.vy = 0; }
  await wait(1500);
});
await page.screenshot({ path: '/tmp/forbidden-light-cave.png' });
await page.screenshot({ path: '/tmp/forbidden-ring-night.png' });

await browser.close();
console.log('PROBE-DONE');
