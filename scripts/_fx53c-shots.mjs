// ★尘站普查批探针②（2026-09-16）：HIGH 站实机截图——进游戏后直构 HIGH 弹于镜头前,
//  真 Dust 池渲染,截 472 诅咒颅 / 101 石巨人火球 / 462 幻影矢三站 → /tmp/fx53c-*.png。
import puppeteer from 'puppeteer-core';
const WHICH = (process.env.SW_SHOTS ?? '472,101,462').split(',').map(Number);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
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
  await page.keyboard.type('FX53C探针');
  await new Promise(r => setTimeout(r, 200));
  await click('.sw-char-panel [data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));
}
await click('.sw-vsel .sw-vitem');
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
await new Promise(r => setTimeout(r, 1200));

const spawnProj = (id) => page.evaluate(async (id) => {
  const g = (window).__swGame;
  const p = g.player;
  const baseX = p.cx, baseY = p.cy - 8 * 16;   // 镜头前空域（玩家上方 8 格）
  const { Dart } = await import('/src/entities/Dart.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const kind = ({ 472: 'Dart', 920: 'Dart', 436: 'Dart', 101: 'Arrow', 462: 'Arrow', 270: 'Arrow', 622: 'Arrow', 719: 'Arrow' })[id];
  if (!kind) return 'skip';
  for (const q of (g.entities.projectiles || [])) if (q && q.projId === id) q.dead = true;
  g.vanillaDust.clearAll?.();
  for (let k = 0; k < 5; k++) {
    const x = baseX - 220 + k * 90, y = baseY - (k % 2) * 24;
    const pr = kind === 'Dart'
      ? new Dart(x, y, 3.2, 0, 30, id)
      : new Arrow(x, y, 3.2, 0, 30, 0, id, { hostile: true, grav: 0, life: 600, pierce: 1 });
    pr.hostile = true;
    g.entities.add(pr, 'projectiles');
  }
  return true;
}, id);

const countAlive = (id) => page.evaluate((id) => {
  const g = (window).__swGame;
  const alive = (g.entities.projectiles || []).filter((q) => q && q.projId === id && !q.dead).length;
  return { alive, dusts: (window).__fx53cCounts || {} };
}, id);

const hookDust = () => page.evaluate(() => {
  const g = (window).__swGame;
  (window).__fx53cCounts = {};
  if ((window).__fx53cOrig) return;                      // 幂等（上轮钩保留计数窗）
  const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
  (window).__fx53cOrig = orig;
  g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, a, c, s, ng, pf, ps) {
    const m = (window).__fx53cCounts;
    m[type] = (m[type] || 0) + 1;
    return orig(x, y, w, h, type, sx, sy, a, c, s, ng, pf, ps);
  };
});

const res = {};
for (const id of WHICH) {
  await hookDust();
  const s = await spawnProj(id);
  if (s !== true) { res[id] = s; continue; }
  await page.evaluate(() => { (window).__fx53cCounts = {}; });   // 计数窗=本弹飞行期
  await new Promise(r => setTimeout(r, 440));            // 飞行 ~26 tick（尾焰成形/渐显完成）
  res[id] = await countAlive(id);
  await page.screenshot({ path: `/tmp/fx53c-${id}.png` });
  await new Promise(r => setTimeout(r, 80));
}
console.log(JSON.stringify({ ok: true, res, errs: errs.slice(0, 4) }, null, 1));
await browser.close();
