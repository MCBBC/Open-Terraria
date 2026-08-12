// 进世界第一声诊断：patch Sfx 原型记录所有 playWavFile/play 调用（文件、音量、调用栈）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
// 先装探针（世界创建前）
await page.evaluate(async () => {
  const { Sfx } = await import('/src/core/Sfx.ts');
  const { Game } = await import('/src/core/Game.ts');
  window.__tileLog = [];
  const origBT = Game.prototype.breakTile;
  Game.prototype.breakTile = function (x, y) {
    if (window.__tileLog.length < 25) window.__tileLog.push({ x, y, t: performance.now() | 0, stack: new Error().stack?.split('\n').slice(1, 4).map((s) => s.trim()).join(' <- ') });
    return origBT.call(this, x, y);
  };
  window.__sfxLog = [];
  const origWav = Sfx.prototype.playWavFile;
  Sfx.prototype.playWavFile = function (file, vol) {
    window.__sfxLog.push({ t: performance.now() | 0, file, vol, stack: new Error().stack?.split('\n')[2]?.trim().slice(0, 90) });
    return origWav.call(this, file, vol);
  };
  const origPlay = Sfx.prototype.play;
  Sfx.prototype.play = function (name, vol) {
    window.__sfxLog.push({ t: performance.now() | 0, name, vol, stack: new Error().stack?.split('\n')[2]?.trim().slice(0, 90) });
    return origPlay.call(this, name, vol);
  };
});
// 进世界
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 4000));
const out = await page.evaluate(() => {
  const t0 = window.__sfxLog.length ? window.__sfxLog[0].t : 0;
  return { sfx: window.__sfxLog.slice(0, 20).map((l) => ({ dt: l.t - t0, file: l.file ?? l.name, vol: l.vol, from: l.stack })),
           tiles: window.__tileLog.slice(0, 8) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
