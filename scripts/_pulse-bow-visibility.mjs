// 脉冲弓(2223)可见性验证：
// 1) 真实使用链路：装备脉冲弓射击 → 弹幕 projId=357（Player.cs:47580 覆写）
// 2) 可见面：弹体 AI 撒尘 206 拖尾（P.cs:57733-57748，α<170 门、10 粒/子步）
//    + 本体贴图原版即 1×1 全透明（Steam Content 实解），可见性全在尘
// 3) 渲染：尘 206 走 GetAlpha (255,255,255,0) 预乘加法白光（Renderer A=0 加性通道）
//    —— 截屏取证弹道白光点串
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  // 平地观测台
  for (let dx = -20; dx <= 60; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -20; dx <= 60; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  // 找脉冲弓（vanilla vid 2223，键形 vi_<vid>_<中文名>）
  let bowKey = Object.keys(window.__swItems).find((k) => k.startsWith('vi_2223')) ?? null;
  if (!bowKey) return { error: 'pulse bow item not found in __swItems' };
  const bowId = window.__swItems[bowKey];
  g.player.inv.add(bowId, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === bowId);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  // 供弹：原版 2223 SetDefaults useAmmo=Arrow（Item.cs:22423-22435），须有箭在包
  const arrowId = window.__swItems['wooden_arrow'];
  if (arrowId) g.player.inv.add(arrowId, 30);
  // 无箭状态射击——原版脉冲弓不耗箭、恒射 357（vanillaItemCombat:616 bowVid===2223→p=357）
  g.entities.projectiles.length = 0;
  g.input.mouseX = 640 + 400; g.input.mouseY = 400;
  g.input.mouseDown = true;
  let proj357 = null;
  for (let i = 0; i < 90 && !proj357; i++) {
    g.fixedUpdate(1 / 60);
    proj357 = g.entities.projectiles.find((p) => p.projId === 357) ?? null;
  }
  if (!proj357) {
    g.input.mouseDown = false;
    return { error: 'no proj 357 spawned', bowKey,
      shotIds: g.entities.projectiles.map((p) => p.projId).slice(-10),
      held: slots[0] ? { id: slots[0].id, key: slots[0].key, vid: slots[0].vanilla?.vid ?? slots[0].vanilla } : null,
      selected: g.player.inv.selected,
      mouseX: g.input.mouseX, mouseY: g.input.mouseY, mouseDown: g.input.mouseDown }; }
  // 步进：拖尾尘应持续生成（α<170 期）
  const dust206 = [];
  let projAlphaSeries = [];
  for (let i = 0; i < 20; i++) {
    g.fixedUpdate(1 / 60);
    const alive = g.entities.projectiles.filter((p) => p.projId === 357 && !p.dead);
    const d206 = g.vanillaDust ? g.vanillaDust.pool.filter((d) => d.active && d.type === 206) : [];
    dust206.push(d206.length);
    if (alive.length) projAlphaSeries.push(alive[0].alpha);
  }
  g.input.mouseDown = false;
  const speed = Math.hypot(proj357.vx, proj357.vy);
  return {
    bowKey, projAlphaSeries, dust206,
    speed: +speed.toFixed(2), alpha0: proj357.alpha,
    dustPeak: Math.max(...dust206), dustAny: dust206.some((n) => n > 0),
  };
});
console.log(JSON.stringify(out, null, 1));
if (out.error) { console.log(`FAIL: ${out.error}`); fail++; }
else {
  check('357 spawned & fading in (alpha 255→0)', out.projAlphaSeries.length > 3 && out.projAlphaSeries[0] > out.projAlphaSeries[out.projAlphaSeries.length - 1], `α 首末=${out.projAlphaSeries[0]}→${out.projAlphaSeries[out.projAlphaSeries.length - 1]}`);
  check('dust 206 trail spawning', out.dustAny, `峰值在场 ${out.dustPeak}`);
}
// 视觉取证：持续射击 + 截屏（拖尾白光点串）
await page.evaluate(() => {
  const g = window.__swGame;
  g.entities.projectiles.length = 0;
  if (g.vanillaDust) for (const d of g.vanillaDust.pool) d.active = false;
  g.input.mouseX = 640 + 450; g.input.mouseY = 300;
  g.input.mouseDown = true;
});
for (let i = 0; i < 26; i++) await page.evaluate(() => window.__swGame.fixedUpdate(1 / 60));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await page.screenshot({ path: '/tmp/pulse-bow-visible.png' });
console.log('screenshot: /tmp/pulse-bow-visible.png');
if (errors.length) { console.log('PAGEERRORS:', errors.slice(0, 5)); fail++; }
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
