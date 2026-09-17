// FX56 2026-09-16 小动物悬停名牌探针（用户实报:鸟/鼠/蛙/蝶等 critter 族悬停
// 不显示名称+生命值文字）。修复 = tickHoverNpcName 补 entities.critters 桶臂
// （原版 HoverOverNPCs Main.cs:43715-43813 全表扫描无 critter 特化排除支,小动物
// =普通 NPC 同链 claim 名+血量行 "名: 5/5"）+ npcHoverHit 677 微光萤 20×20 特型盒。
// 断言:①spawnNpcByVanilla 产物落 critters 桶;②悬停鸟(29)/蛙(138) → cursorItemIconText
// ="<名>: 5/5" 且 cursorItemIconEnabled=false;③fillText 实渲染含该串;④光标移开 → 清空;
// ⑤截图 /tmp/fx56-critter.png 人工核对（名牌随光标）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('FX56小动物');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
// 关「欢迎来到 SandboxWorld」公告（按钮无 data-act,按文案点;localStorage ACK_KEY 永久关）
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent ?? '').includes('我已知晓')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 600));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// fillText 全局录制（FX21 同法）
await page.evaluate(() => {
  const log = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
    if (log.length > 6000) log.splice(0, 3000);
    log.push({ s: String(s), x, y });
    return orig.call(this, s, x, y);
  };
  window.__fx56Fills = log;
});

// 生成小动物（spawnNpcByVanilla 产物落 critters 桶）+ 每拍钉位（小动物 AI 会走动,
// 钉在玩家右侧地面高度,帧盒有富余）。vid: 74=冠蓝鸦(鸟)/361=青蛙/677=微光萤（29=哥布林巫士/138=夜明史莱姆——首轮探针误用,恰证小动物臂对 critters 桶实体通名+血行）
// ★探针纪事：采样窗须持续清敌怪/城镇桶——自然刷怪体帧盒若与光标相交,敌怪臂
// 先中（桶序首中=链路正确行为）会顶掉小动物名（首轮探针实测:哥布林巫士顶名）。
const spawnAt = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const pin = (e) => {
    g.entities.enemies.length = 0; g.entities.npcs.length = 0;   // 清干扰体（探针域）
    e.x = p.x + 60; e.y = p.y + p.h - e.h; e.vx = 0; e.vy = 0;
  };
  const bird = g.spawnNpcByVanilla(74, p.x + 60, p.y + p.h - 24);
  if (bird) pin(bird);
  window.__fx56Pin = { e: bird, pin };
  window.__fx56PinTimer = setInterval(() => { if (window.__fx56Pin?.e && !window.__fx56Pin.e.dead) window.__fx56Pin.pin(window.__fx56Pin.e); }, 100);
  return bird ? { inCritters: g.entities.critters.includes(bird), vid: bird.vanillaId, w: bird.w, h: bird.h } : null;
});
check('鸟(74)生成落 critters 桶', !!spawnAt?.inCritters, JSON.stringify(spawnAt));

// 光标钉到小动物帧盒中心（camera.worldToScreen 同 _cursoricontext-probe 法）,
// 采样数帧读真实链路（input → tickCursorIcon → tickHoverNpcName → drawMouseTextLayer）
const hoverText = await page.evaluate(async () => {
  const g = window.__swGame;
  const e = window.__fx56Pin.e;
  window.__fx56Pin.pin(e);
  const [sx, sy] = g.camera.worldToScreen(e.x + e.w / 2, e.y + e.h - 10);   // 帧盒下半（贴底盒内）
  g.input.mouseX = sx; g.input.mouseY = sy;
  const samples = [];
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 50));
    samples.push(g.player.cursorItemIconText);
  }
  const enabled = g.player.cursorItemIconEnabled;
  const nonEmpty = new Set(samples.filter(Boolean));
  const fillHit = window.__fx56Fills.some((f) => nonEmpty.has(f.s));
  return { samples: [...new Set(samples)], enabled, fillHit, sx: Math.round(sx), sy: Math.round(sy) };
});
const goodText = hoverText.samples.find((s) => s && /: 5\/5$/.test(s));
check('悬停鸟(74) → 名+血量行 "名: 5/5"', !!goodText, JSON.stringify(hoverText.samples));
check('名支压悬停图标（:43822 cursorItemIconEnabled=false）', hoverText.enabled === false, `enabled=${hoverText.enabled}`);
check('名牌实渲染（fillText 含 claim 串）', !!goodText && hoverText.fillHit, goodText ?? '(无)');

// 截图（名牌随光标可见态）
await page.screenshot({ path: '/tmp/fx56-critter.png' });

// 换蛙(138)同链复核
const frog = await page.evaluate(async () => {
  const g = window.__swGame;
  clearInterval(window.__fx56PinTimer);
  const p = g.player;
  const f = g.spawnNpcByVanilla(361, p.x + 60, p.y + p.h - 20);
  if (!f) return null;
  const pin = () => { g.entities.enemies.length = 0; g.entities.npcs.length = 0; f.x = p.x + 60; f.y = p.y + p.h - f.h; f.vx = 0; f.vy = 0; };
  pin();
  window.__fx56Pin = { e: f, pin };
  window.__fx56PinTimer = setInterval(pin, 100);
  const [sx, sy] = g.camera.worldToScreen(f.x + f.w / 2, f.y + f.h - 10);
  g.input.mouseX = sx; g.input.mouseY = sy;
  const samples = new Set();
  for (let i = 0; i < 24; i++) { await new Promise((r) => setTimeout(r, 50)); samples.add(g.player.cursorItemIconText); }
  return [...samples];
});
check('悬停蛙(361) → 同链名+血量行', !!frog && frog.some((s) => s && /: 5\/5$/.test(s)), JSON.stringify(frog));

// 光标移开 → claim 清空（MouseOversClear 先清后 claim 语义）
const away = await page.evaluate(async () => {
  const g = window.__swGame;
  g.input.mouseX = 8; g.input.mouseY = 8;
  const samples = new Set();
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 50)); samples.add(g.player.cursorItemIconText); }
  clearInterval(window.__fx56PinTimer);
  return [...samples];
});
check('光标移开 → 名牌清空', away.length === 1 && away[0] === '', JSON.stringify(away));

console.log(`---\n${pass} pass / ${fail} fail; errors=${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none'}`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
