// 一次性:真实游戏帧 A/B——极光背景渗入 tint 在屏验证。
// A = 极光强制活跃(_opacity=1)正常渲染;B = 仅杀 tileColorState()(背景 0.08 渗入 +
//   地平线云 1f 渗入同时断,极光带本体照画)。两图 diff = 渗入链的实际屏上贡献。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

const info = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world?.clock;
  const clockKeys = c ? Object.keys(c) : [];
  const props = {};
  for (const k of ['timeOfDay', 'moonPhase', 'dayCount', 'isDay']) {
    const v = c?.[k];
    props[k] = typeof v === 'number' || typeof v === 'boolean' ? v : String(typeof v);
  }
  return { clockKeys, props, hasScene: !!g.renderer?.scene };
});
console.log('CLOCK:', JSON.stringify(info));

// 强夜 + 满月 + 极光强制活跃
await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.95;
  if ('moonPhase' in c) c.moonPhase = 0;
  const aur = g.renderer.sky.aurora;
  aur.setActive(true);
  aur._opacity = 1;
});
await new Promise((r) => setTimeout(r, 1500));   // 数十帧:噪声加载+_lastSkyColor 写入+tint 流动
const shotA = await page.screenshot({ path: '/tmp/aurora-ab-A.png' });

await page.evaluate(() => {
  const aur = window.__swGame.renderer.sky.aurora;
  aur.tileColorState = () => null;   // 只断渗入链(背景+地平线云),带本体照画
});
await new Promise((r) => setTimeout(r, 400));
const shotB = await page.screenshot({ path: '/tmp/aurora-ab-B.png' });

// 帧内 diff(上半屏=天空+远景区)
const diff = await page.evaluate(async () => {
  const mk = (buf) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('cv');
      const c2 = document.createElement('canvas');
      c2.width = img.width; c2.height = img.height;
      const g2 = c2.getContext('2d', { willReadFrequently: true });
      g2.drawImage(img, 0, 0);
      res(g2.getImageData(0, 0, img.width, Math.floor(img.height * 0.55)).data);
    };
    img.src = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
  });
  return { ok: true };
});
console.log('shots:', shotA.length, shotB.length);
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
