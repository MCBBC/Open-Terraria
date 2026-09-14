// FX24f 一次性探针：tintAtlas 页转储——看 668 相关烘焙在共享页上的布局/是否互相越界
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&fx24f=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const summon668 = () => page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div').click();
  g.summonPanel?.close();
});
const healPlayer = () => page.evaluate(() => {
  const p = window.__swGame.player;
  p.dead = false; p.hp = p.maxHp ?? 500; p.iframes = 120;
  if ('statLife' in p) p.statLife = p.statLifeMax ?? 500;
});
const R = {};
await summon668();
await healPlayer();
await wait(600);
// 先远距让 lai3 爬满（紫 tint 烘焙进图集），再拉近战斗（tq=0 新键）→ 制造键 churn
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 1000; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
  if (g.scene) g.scene.zoneSnow = true;
});
await wait(1200);
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const p = g.player;
  p.x = e.x + e.w / 2 - p.w / 2 + 60;
  p.y = e.y + e.h - p.h - 2; p.vx = 0; p.vy = 0;
  e.ai0 = 1; e.ai1 = 10; e.vx = 0; e.lai3 = 0;
});
for (let i = 0; i < 5; i++) { await healPlayer(); await wait(120); }
// 转储全部 tint 页
R.pages = await page.evaluate(() => {
  const g = window.__swGame;
  const ta = g.renderer.tintAtlas;
  const out = [];
  ta.pages.forEach((p0, pi) => {
    const url = p0.cv.toDataURL('image/png');
    out.push({ pi, rows: p0.rows.map((r0) => ({ y: r0.y, h: r0.h, w: r0.w })), free: p0.free, url });
  });
  return { n: ta.pages.length, size: ta.size, pages: out };
});
// 668 相关键
R.keys = await page.evaluate(() => {
  const g = window.__swGame;
  const ta = g.renderer.tintAtlas;
  const out = [];
  for (const [k0, e0] of ta.entries) {
    if (k0.includes('deer')) out.push({ k: k0, x: e0.rect.x, y: e0.rect.y, w: e0.rect.w, h: e0.rect.h, page: ta.pages.indexOf(e0.page) });
  }
  // 每个deer条目 rect 采样其页内容 → 单条目 PNG
  const cv = document.createElement('canvas');
  cv.width = 220; cv.height = 242;
  const cx2 = cv.getContext('2d', { willReadFrequently: true });
  for (const it of out) {
    const pg = ta.pages[it.page];
    cx2.clearRect(0, 0, 220, 242);
    cx2.drawImage(pg.cv, it.x, it.y, it.w, it.h, 0, 0, it.w, it.h);
    it.png = cv.toDataURL('image/png');
  }
  return out;
});
console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
