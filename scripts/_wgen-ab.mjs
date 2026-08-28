import puppeteer from 'puppeteer-core';
const make = async (url) => {
  const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    (window).__w = { t0: 0, total: 0, pv: 0 };
    const OW = window.Worker;
    window.Worker = function (u, o) {
      const w = new OW(u, o);
      if (String(u).includes('worldGen.worker')) {
        const os = w.postMessage.bind(w);
        w.postMessage = function (m, tr) {
          if (m?.type === 'generate') (window).__w.t0 = performance.now();
          return os(m, tr);
        };
        w.addEventListener('message', (e) => {
          const d = e.data;
          if (d?.type === 'preview') (window).__w.pv++;
          if (d?.type === 'result' && d.world) (window).__w.total = performance.now();
        });
      }
      return w;
    };
    window.Worker.prototype = OW.prototype;
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
  await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
  await page.mouse.click(8, 8);
  for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
  if (!(await page.$('.sw-vsel .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
    await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('ab');
    await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
  }
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
  await page.click('.sw-vsel [data-act=new]').catch(()=>{});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]'); await page.keyboard.type('12345');
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await page.click('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 200 });
  const r = await page.evaluate(() => ({ gen: Math.round((window).__w.total - (window).__w.t0), pv: (window).__w.pv }));
  await browser.close();
  return r;
};
(async () => {
  const base = 'http://localhost:5210';
  const a = await make(base + '/?wprev=1');
  const b = await make(base + '/?wprev=0');
  console.log(`A(预览开): generate=${a.gen}ms preview帧=${a.pv}`);
  console.log(`B(预览关): generate=${b.gen}ms preview帧=${b.pv}`);
  console.log(`预览占比 ≈ ${(a.gen - b.gen)}ms(${(((a.gen - b.gen) / a.gen) * 100).toFixed(1)}%)`);
  process.exit(0);
})();
