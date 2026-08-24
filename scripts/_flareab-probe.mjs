// 一次性:光斑链 A/B 像素差——固定 vTime,实例覆写 drawLensFlare 开关,同位采样
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100 && !await p.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await sleep(1000);
for (let i = 0; i < 30; i++) {
  if (await p.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
  await sleep(500);
}
// 钉死时刻(50ms 间隔重写 vTime 抗 26× 漂移)
await p.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.dayTime = true;
  mb.__pin = setInterval(() => { mb.vTime = 48000; }, 50);
});
await sleep(800);
const sample = (pts) => p.evaluate((pts) => {
  const mb = window.__swMenuBg;
  const cv = mb.canvas;
  const ctx = cv.getContext('2d');
  const out = [];
  for (const [x, y] of pts) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    out.push([d[0], d[1], d[2]]);
  }
  return out;
}, pts);
const PTS = [
  ['psharp0', 1208, 344], ['psharp1', 1152, 351], ['psharp2', 1050, 363],
  ['pblur0', 865, 372], ['pblur1', 753, 384], ['pblur2', 641, 397],
  ['bigblur', 511, 421], ['bokeh', 666, 395], ['spectra', 447, 428],
  ['ctrl-sky', 300, 200], ['ctrl-ground', 640, 700]
];
const names = PTS.map(([n]) => n);
const coords = PTS.slice(1).map(([, x, y]) => [x, y]);
// A: 光斑开(默认)
const on = await sample(coords);
// B: 关(实例覆写)
await p.evaluate(() => {
  const s = window.__swMenuBg.sky;
  s.__origFlare = s.drawLensFlare;
  s.drawLensFlare = function () { };
});
await sleep(300);
const off = await sample(coords);
await p.evaluate(() => {
  const s = window.__swMenuBg.sky;
  s.drawLensFlare = s.__origFlare;
  clearInterval(window.__swMenuBg.__pin);
});
console.log('point      ON          OFF         delta');
for (let i = 0; i < names.length - 1; i++) {
  const d = on[i].map((v, k) => v - off[i][k]);
  console.log(
    names[i + 1].padEnd(10),
    JSON.stringify(on[i]).padEnd(14),
    JSON.stringify(off[i]).padEnd(14),
    JSON.stringify(d)
  );
}
const st = await p.evaluate(() => {
  const s = window.__swMenuBg.sky;
  return { sun: s.sunScreen, vis: s.horizonVisCache && { sunset: +s.horizonVisCache.sunset.toFixed(3), celestial: +s.horizonVisCache.celestial.toFixed(3) } };
});
console.log('state:', JSON.stringify(st));
await b.close();
