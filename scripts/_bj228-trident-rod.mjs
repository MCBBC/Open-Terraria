// BJ228 实机探针：邪恶三叉戟(683→114) + 彩虹魔杖(495→79) 弹幕渲染取证。
// ① 114：直构 Arrow(114) 三相截图（出生梯/高速实体/减速淡出）+ ga() 值链
// ② 79：悬停相（白团本体,Main.cs:33231 color87=(255,255,255,0)）+ 巡航相（拖尾接管）
// ③ 弹心邻域像素直方图判别（白团=白桶爆量;三叉戟=紫+亮像素）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ228探针');
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
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj228probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// ---------- ① 114 邪恶三叉戟 ----------
const centerBright = () => page.evaluate(() => {
  const g = window.__swGame;
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const sc = document.createElement('canvas');
  sc.width = cv.width; sc.height = cv.height;
  const c2 = sc.getContext('2d', { willReadFrequently: true });
  c2.drawImage(cv, 0, 0);
  const [cx, cy] = [sc.width / 2 | 0, sc.height / 2 | 0];
  const d = c2.getImageData(cx - 32, cy - 32, 64, 64).data;
  let bright = 0, mid = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r > 200 && gg > 200 && b > 200) bright++;
    if (r + gg + b > 330 && r + gg + b < 600) mid++;
  }
  return { bright, mid };
});
const w114 = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 30;
  for (let dx = -140; dx <= 140; dx++) for (let dy = -40; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -140; dx <= 140; dx++) st.setTile(px0 + dx, gy + 3, 2);
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const a1 = new Arrow(g.player.cx + 60, g.player.cy - 40, 3, 0, 40, 1, 114, {});
  g.entities.add(a1, 'projectiles');
  for (let k = 0; k < 12; k++) g.fixedUpdate(1 / 60);       // 36 子步=梯满+初期高速
  g.paused = true; g.camera.x = a1.cx; g.camera.y = a1.cy;
  return { ga: a1.drawGlobalAlpha(), alpha: a1.alpha, age: a1.age, dead: a1.dead,
    x: Math.round(a1.cx), y: Math.round(a1.cy) };
});
console.log('T114-fast', JSON.stringify(w114));
await page.screenshot({ path: '/tmp/bj228-114-fast.png', clip: { x: 480, y: 240, width: 320, height: 320 } });
const fastBright = await centerBright();
console.log('T114-fast-bright', JSON.stringify(fastBright));
// 减速相（速度 1.0 → α≈128 半亮）
const w114b = await page.evaluate(() => {
  const g = window.__swGame;
  const a1 = (g.entities.projectiles ?? []).find((p) => p.projId === 114 && !p.dead);
  if (!a1) return null;
  g.paused = false;
  a1.vx = 1.0; a1.vy = 0;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true; g.camera.x = a1.cx; g.camera.y = a1.cy;
  return { ga: a1.drawGlobalAlpha(), alpha: a1.alpha, dead: a1.dead };
});
console.log('T114-slow', JSON.stringify(w114b));
await page.screenshot({ path: '/tmp/bj228-114-slow.png', clip: { x: 480, y: 240, width: 320, height: 320 } });

// ---------- ② 79 彩虹魔杖 ----------
const w79h = await page.evaluate(async () => {
  const g = window.__swGame;
  g.paused = false;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const m = new MagicMissileProj(g.player.cx - 100, g.player.cy - 60, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: m0.cx, y: m0.cy }),
    payMana: () => true,
  });
  const m0 = m;
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  g.paused = true; g.camera.x = m.cx; g.camera.y = m.cy;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead };
});
console.log('T79-hover', JSON.stringify(w79h));
await page.screenshot({ path: '/tmp/bj228-79-hover.png', clip: { x: 480, y: 240, width: 320, height: 320 } });
const hoverBright = await centerBright();
console.log('T79-hover-bright', JSON.stringify(hoverBright));
const w79f = await page.evaluate(async () => {
  const g = window.__swGame;
  g.paused = false;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const m2 = new MagicMissileProj(g.player.cx - 300, g.player.cy - 120, 20, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => false, aimCb: () => ({ x: g.player.cx + 500, y: g.player.cy - 200 }),
    payMana: () => true,
  });
  m2.x = m2.x - m2.w / 2; m2.y = m2.y - m2.h / 2;
  g.entities.add(m2, 'projectiles');
  for (let k = 0; k < 16; k++) g.fixedUpdate(1 / 60);
  g.paused = true; g.camera.x = m2.cx; g.camera.y = m2.cy;
  return { x: Math.round(m2.cx), y: Math.round(m2.cy), dead: m2.dead, strip: (m2.strip ?? []).length };
});
console.log('T79-flight', JSON.stringify(w79f));
await page.screenshot({ path: '/tmp/bj228-79-flight.png', clip: { x: 480, y: 240, width: 320, height: 320 } });
const flightBright = await centerBright();
console.log('T79-flight-bright', JSON.stringify(flightBright));

console.log('shots: /tmp/bj228-114-fast.png /tmp/bj228-114-slow.png /tmp/bj228-79-hover.png /tmp/bj228-79-flight.png');
await browser.close();
process.exit(0);
