// 一次性诊断：buff 栏实况截图 + 布局几何
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_buffbar-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
// 授予多个 buff + 刷新 UI
const geo = await page.evaluate(async () => {
  const g = window.__swGame;
  const mods = await import('/src/stats/Buffs.ts');
  for (const t of [mods.BuffType.Agility, mods.BuffType.Ironskin, mods.BuffType.Regen, mods.BuffType.Honey, mods.BuffType.Thorns, mods.BuffType.NightOwl, mods.BuffType.OnFire,
    mods.BuffType.Battle, mods.BuffType.Mining, mods.BuffType.Builder, mods.BuffType.Calming, mods.BuffType.Heartreach]) {
    g.player.buffs.apply(t, 120);
  }
  g.ui?.refreshBuffs?.();
  g.cb?.onBuffsChanged?.();   // 强制走 Game→UI 回调
  // 等 Game 的秒级回调自然刷新（g.ui 不在 Game 上时手动找 .sw-buff 容器轮询）
  for (let w = 0; w < 12; w++) {
    await new Promise((r) => setTimeout(r, 1000));
    const vis = document.querySelectorAll('.sw-buff').length
      && [...document.querySelectorAll('.sw-buff')].some((c) => c.style.display !== 'none');
    if (vis) break;
  }
  const bar = document.querySelector('.sw-buff')?.parentElement
    ?? document.querySelector('div[style*="top:76px"]')
    ?? g.ui?.buffBar;
  if (!bar) return { err: 'buffBar 未找到' };
  const br = bar.getBoundingClientRect();
  const items = [...bar.children].filter((c) => c.style.display !== 'none').map((c) => {
    const r = c.getBoundingClientRect();
    const img = c.querySelector('img');
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), src: (img?.src ?? '').slice(-40) };
  });
  return { bar: { x: br.x, y: br.y, w: br.width, h: br.height, cls: bar.className, display: getComputedStyle(bar).display, dir: getComputedStyle(bar).flexDirection, wrap: getComputedStyle(bar).flexWrap },
    items,
    dbg: { active: [...g.player.buffs.active.entries()], hasUi: !!g.ui, uiType: typeof g.ui, childCount: bar.children.length, dispNone: [...bar.children].filter((c) => c.style.display === 'none').length,
      tick: g.tickCount, visibility: document.visibilityState, cb: typeof g.cb } };
});
console.log(JSON.stringify(geo, null, 1));
// 截左上角 buff 栏区域(页面坐标,viewport 1280x800)
const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 470, height: 200 } });
fs.writeFileSync('/tmp/buffbar.png', shot);
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
