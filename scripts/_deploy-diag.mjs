// 干净终验:被动加载 60s,只看缓存填充与页面错误。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4176';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
let last = -1;
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  last = await p.evaluate(async () => {
    let n = 0;
    for (const nm of await caches.keys()) n += (await (await caches.open(nm)).keys()).length;
    return n;
  }).catch(() => -1);
  process.stdout.write(`${last} `);
}
console.log(`\n=== 终值 ${last} / 目标 ~12035 | 页面错误 ${errs.length} ===`);
for (const e of errs.slice(0, 5)) console.log(' ', e);
await b.close();
process.exit(last >= 12000 ? 0 : 1);
