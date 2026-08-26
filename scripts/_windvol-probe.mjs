// 风声/BGM 增益实测:大风条件下的 cue45 gain 与 BGM 增益对照。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('风声');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
try {
  await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 120000, polling: 1000 });
} catch {
  const st = await page.evaluate(() => ({
    menu: !!document.querySelector('.sw-title-menu'), vsel: !!document.querySelector('.sw-vsel'),
    charRow: !!document.querySelector('.sw-char-row input'), creating: !!document.querySelector('[data-act=create]'),
    game: !!window.__swGame, world: !!window.__swGame?.world,
    body: document.body.innerText.slice(0, 200),
  }));
  console.log('[卡点状态]', JSON.stringify(st));
  await browser.close(); process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500));
// 大风条件:windSpeedCurrent 拉满
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.world.weather) { g.world.weather.windSpeedTarget = 0.8; g.world.weather.windSpeedCurrent = 0.8; }
});
await new Promise((r) => setTimeout(r, 5000));   // 等 fade 爬满(0.005/t → 200t ≈ 3.3s)
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sfx = g.sfx;
  const wind = sfx.cueLayers?.wind;
  const audio = g.audio;
  return {
    windGain: wind?.gain?.gain?.value?.toFixed(3) ?? 'null',
    windPlaying: wind?.cue?.playing, windFade: wind?.cue?.fade?.toFixed(2),
    level: g.cueDrive?.wind?.level?.toFixed(3), gate: g.cueDrive?.wind?.gate,
    windSpeed: +((g.world.weather?.windSpeedCurrent) ?? 0).toFixed(2),
    ambient: sfx.ambient, master: sfx.master,
    bgmVolume: audio.volume, musicId: audio.curMusic,
    bgmGainSamples: audio.pool ? [...audio.pool.entries()].filter(([k, t]) => t.fade > 0).map(([k, t]) => `music${k}:${t.gain?.gain?.value?.toFixed(2)} fade=${t.fade?.toFixed(2)}`) : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
