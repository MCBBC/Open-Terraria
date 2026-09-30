// BJ418 截图取证：远距 lai3=30 hold 态 boss 屏幕矩形截图（fixed=不透明紫影剪影 /
// mutated(旧病灶式)=30% 半透明淡出）。同场景两轮对拍,节点侧算像素差。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5540';
const OUT = process.env.BJ418_OUT ?? '/tmp/bj418-shot.png';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small&bj418s=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!window.__swGame).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
// 关公告/闪屏覆层（BJ328 WelcomeAnnounce 覆层堆叠教训）
await page.evaluate(() => {
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
// 点掉欢迎面板（按钮文本「我已知晓」;两轮同关,证据同景）
for (let i = 0; i < 20; i++) {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, [role=button], .btn, div, span')]
      .find((b) => (b.textContent ?? '').trim() === '我已知晓');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (clicked) break;
  await new Promise((r) => setTimeout(r, 500));
}
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies();
  g.toggleSummonPanel?.();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div')?.click();
  g.summonPanel?.close();
});
await new Promise((r) => setTimeout(r, 800));
// 逐拍重钉 560px 直到 lai3=30 hold（≥450 免伤阈上）
let lai3 = 0;
for (let i = 0; i < 40 && lai3 < 30; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    const p = g.player;
    if (e && p) { p.x = e.cx - 560; p.y = e.y + e.h - 60; p.vx = 0; p.vy = 0; p.iframes = 120; p.hp = p.maxHp ?? 500; }
  });
  await new Promise((r) => setTimeout(r, 120));
  lai3 = await page.evaluate(() => {
    const e = [...window.__swGame.entities.enemies].find((n) => n.vanillaId === 668);
    return e ? e.lai3 : -1;
  });
}
const meta = await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const p = g.player;
  p.x = e.cx - 560; p.y = e.y + e.h - 60; p.iframes = 120;
  const [sx, sy] = g.camera.worldToScreen(e.cx, e.cy);
  const cv = g.renderer.ctx.canvas;
  const dpr = cv.width / cv.getBoundingClientRect().width;
  return { lai3: e.lai3, ai0: e.ai0, dist: Math.round(Math.hypot(p.cx - e.cx, p.cy - e.cy)), sx, sy, dpr, cw: cv.width, ch: cv.height };
});
await new Promise((r) => setTimeout(r, 150));   // 等一帧渲染
const dpr = meta.dpr || 1;
await page.screenshot({ path: OUT });   // 全屏（worldToScreen 与绘锚存在相机相位差,裁框不可靠）
console.log(JSON.stringify({ out: OUT, meta }));
await browser.close();
