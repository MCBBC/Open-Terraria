// 在 dev（未压缩）worker 里循环随机种子复现 pass19 栈溢出，抓真实调用栈
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const TRIES = Number(process.env.TRIES || 30);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (t.includes('CRASH') || t.includes('PASS-STACK')) console.log(t.slice(0, 4000)); });
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const result = await page.evaluate(async (origin, tries) => {
  const out = [];
  for (let k = 0; k < tries; k++) {
    const seed = (Math.random() * 2 ** 31) | 0;
    const w = new Worker(new URL('/src/workers/worldGen.worker.ts', origin), { type: 'module' });
    const res = await new Promise((resolve) => {
      const t0 = Date.now();
      w.onmessage = (ev) => {
        if (ev.data.type === 'result') { resolve({ ok: true, seed }); w.terminate(); }
        if (Date.now() - t0 > 120000) { resolve({ ok: true, timeout: true, seed }); w.terminate(); }
      };
      w.onerror = (e) => { resolve({ ok: false, seed, msg: e.message, stack: e.error?.stack ?? '' }); w.terminate(); };
      w.postMessage({ id: 1, type: 'generate', cfg: { seed, seedText: String(seed), size: 1, difficulty: 0, evil: 0, name: 'probe', preview: false } });
    });
    if (!res.ok) {
      console.log('CRASH seed=' + res.seed + ' :: ' + res.stack?.slice(0, 3500));
      out.push(res); break;
    }
    console.log('PASS seed=' + res.seed + (res.timeout ? ' (timeout-kill)' : ''));
    if (res.timeout) break;
  }
  return out.length;
}, ORIGIN, TRIES);
console.log('crashes:', result);
await browser.close();
process.exit(0);
