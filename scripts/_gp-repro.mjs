// 一次性：浏览器内直跑 generateWorld 抓崩溃全栈（worker 路径只回传 message 无栈）。
// 纯 JS（run-diag 以裸 node 装载本壳，TS 类型断言只能在 evaluate 字符串里用）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5209';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 900, height: 700 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
const out = await page.evaluate(async () => {
  const { generateWorld } = await import('/src/world/gen/WorldGen.ts');
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '424242', name: 'repro', evil: -1 }, () => {});
    return { ok: true };
  } catch (e) {
    const err = e && e.cause ? e.cause : e;
    return {
      ok: false,
      msg: String(e.message),
      stack: String(err.stack || '').split('\n').slice(0, 14).join('\n'),
    };
  }
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
