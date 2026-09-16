// ★FX53 探针（2026-09-16）：骷髅弓箭手(NPC 110)实机射燃烧箭(82) → 断言火焰尾迹尘
//  （Update 尾通用尘站 P.cs:17141 在 Dart 载体补齐）+ 截图 /tmp/fx53-flame.png。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 1200));
const click = (sel) => page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);
await click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 30000 });
await new Promise(r => setTimeout(r, 600));
if (!await page.evaluate(() => !!document.querySelector('.sw-vsel .sw-vitem'))) {
  await click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-panel input[type=text]');
  await page.keyboard.type('FX53探针');
  await new Promise(r => setTimeout(r, 200));
  await click('.sw-char-panel [data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));
}
await click('.sw-vsel .sw-vitem');
// 世界页：有档点档进游戏；无档走创建流（小世界）
for (let i = 0; i < 40; i++) {
  if (await page.evaluate(() => { const g = (window).__swGame; return !!(g && g.player); })) break;
  if (await page.evaluate(() => !!document.querySelector('.sw-vsel .sw-vitem'))) { await click('.sw-vsel .sw-vitem'); await new Promise(r => setTimeout(r, 1500)); continue; }
  if (await page.evaluate(() => !!document.querySelector('.sw-vsel [data-act=new]'))) {
    await click('.sw-vsel [data-act=new]');
    await page.waitForSelector('.sw-wc-panel', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 400));
    await page.click('[data-g=size] .sw-wc-opt');
    await new Promise(r => setTimeout(r, 300));
    await click('.sw-wc-panel [data-act=create]');
  }
  await new Promise(r => setTimeout(r, 2000));
}
await page.waitForFunction(() => { const g = (window).__swGame; return g && g.player; }, { timeout: 300000 });
// 首次进入弹「欢迎」窗——点「我已知悉」清屏，免挡截图
for (let i = 0; i < 6; i++) {
  const gone = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [class*=btn]')];
    const b = btns.find((x) => (x.textContent || '').includes('我已知晓'));
    if (b) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return false; }
    return !document.querySelector('.sw-asset-gate');
  });
  await new Promise(r => setTimeout(r, 700));
  if (gone) break;
}
await new Promise(r => setTimeout(r, 1500));

const res = await page.evaluate(async () => {
  const g = (window).__swGame;
  const flow = (window).__swFlow;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const p = g.player;

  // 尘池 spawn 计数钩（按型计数——82 燃烧箭尾迹=d6,Kill 爆=d6）
  const counts = {};
  const origSpawn = g.vanillaDust.spawn.bind(g.vanillaDust);
  g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, a, c, s, ng, pf, ps) {
    counts[type] = (counts[type] || 0) + 1;
    return origSpawn(x, y, w, h, type, sx, sy, a, c, s, ng, pf, ps);
  };
  out.countHook = true;

  // 骷髅弓箭手 110（vanilla SkeletonArcher,aiStyle3 远程战士,num171 缺省=82）
  out.spawned = !!(await flow.spawnVanillaEnemy(110, p.cx + 240, p.cy - 40));
  // 等它射出 82（最长 20s;战士 AI 走位+瞄准+射击）
  let dart = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    dart = (g.entities.projectiles || []).find((q) => q && q.projId === 82 && !q.dead);
    if (dart) break;
    await wait(120);
  }
  out.dart82Spawned = !!dart;
  if (!dart) {
    const e = (g.entities.enemies || []).find((q) => q && q.vanillaId === 110);
    out.enemyAfter = e ? { x: Math.round(e.x), ai1: e.ai1, ai2: e.ai2, hp: e.hp } : null;
    g.vanillaDust.spawn = origSpawn;
    return out;
  }
  out.dart82 = { x: Math.round(dart.x), y: Math.round(dart.y), hostile: !!dart.hostile, life: dart.life };
  // 飞行窗（约 1.5s）：记录 d6 增量（尾迹 1/tick + 死拍 Kill 10 粒）
  const c0 = counts[6] || 0;
  const shotT0 = Date.now();
  while (Date.now() - shotT0 < 1500) {
    const alive = (g.entities.projectiles || []).some((q) => q && q.projId === 82 && !q.dead);
    if (!alive && (counts[6] || 0) - c0 >= 10) break;
    await wait(40);
  }
  out.d6DuringFlight = (counts[6] || 0) - c0;
  out.dart82Dead = !((g.entities.projectiles || []).some((q) => q && q.projId === 82 && !q.dead));
  // 再等一发处于尾迹可见窗（age 2..14）截图
  const t1 = Date.now();
  while (Date.now() - t1 < 20000) {
    const d2 = (g.entities.projectiles || []).find((q) => q && q.projId === 82 && !q.dead && q.age >= 2 && q.age <= 14);
    if (d2) { out.shotAge = d2.age; break; }
    await wait(30);
  }
  g.vanillaDust.spawn = origSpawn;
  return out;
});

const shotOk = res.shotAge != null;
await new Promise(r => setTimeout(r, 100));
await page.screenshot({ path: '/tmp/fx53-flame.png' });
console.log(JSON.stringify({ ...res, shotOk, errs }, null, 1));
await browser.close();
