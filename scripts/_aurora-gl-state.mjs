// 一次性:游戏页内极光 GL 状态诊断——上下文是否创建成功/带几何是否有/为什么没上屏。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 150)));
page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  const aur = sky.aurora;
  const gl = aur.glAurora;
  const r = {
    glReady: gl.ready,
    glUnavailable: gl.unavailable,
    glCanvasW: gl.canvas ? gl.canvas.width : -1,
    glCanvasH: gl.canvas ? gl.canvas.height : -1,
    isActive: aur.isActive,
    opacity: aur.opacity,
    lastSkyColor: [...aur.lastSkyColor],
    phase: aur.phase,
  };
  // 数一下页面 WebGL 上下文数(粗探:再造一个看是否失败)
  try {
    const t = document.createElement('canvas');
    const ctx = t.getContext('webgl2');
    r.spareContextOk = !!ctx;
    if (ctx) { const ext = t.getContext('webgl2'); r.spareContextOk2 = !!ext; }
  } catch (e) { r.spareContextOk = 'THROW'; }
  return r;
});
console.log(JSON.stringify(out, null, 1));
const relevant = logs.filter((l) => l.includes('GLAurora') || l.includes('Aurora') || l.includes('WebGL') || l.includes('context'));
if (relevant.length) console.log('LOGS:\n' + relevant.slice(0, 10).join('\n'));
await browser.close();
