// 抓注入外观后的运行时异常
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 500)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  p.appearance ??= {
    name: 'probe', hair: 0, skinVariant: 0,
    hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 }, eyeColor: { r: 0, g: 255, b: 0 },
    shirtColor: { r: 175, g: 165, b: 140 }, undershirtColor: { r: 160, g: 180, b: 215 },
    pantsColor: { r: 255, g: 230, b: 175 }, shoeColor: { r: 160, g: 105, b: 60 },
    difficulty: 0, team: 0,
  };
  await new Promise(r => setTimeout(r, 1500));
  const alive1 = { dead: p.dead, eye: p.eyeFrame, misc: p.miscCounter };
  await new Promise(r => setTimeout(r, 400));
  const alive2 = { dead: p.dead, eye: p.eyeFrame, misc: p.miscCounter };
  p.eyeBlinkHurt();
  await new Promise(r => setTimeout(r, 200));
  const hurt = { eye: p.eyeFrame, misc: p.miscCounter };
  return { alive1, alive2, hurt, ticking: alive2.misc > alive1.misc, frozen: hurt.misc === alive2.misc };
});
console.log(JSON.stringify({ out, errs: errs.slice(0, 12) }, null, 1));
await browser.close();
