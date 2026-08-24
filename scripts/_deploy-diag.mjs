// 同浏览器会话三连加载:第1次(冷)/第2次(补缓存)/第3次(稳态),以静态服访问日志为准。
import puppeteer from 'puppeteer-core';
import { readFileSync, statSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const LOG = '/tmp/static-4177.log';
const logSize = () => { try { return statSync(LOG).size; } catch { return 0; } };
const newAssetHits = (prev) => {
  const cur = readFileSync(LOG, 'utf8').slice(prev);
  return cur.split('\n').filter((l) => /\/assets\/.+\.(js|css)/.test(l)).length;
};

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
const counts = [];
for (let i = 1; i <= 3; i++) {
  const prev = logSize();
  await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, i === 1 ? 45_000 : 10_000));
  counts.push(newAssetHits(prev));
}
console.log(JSON.stringify({
  coldLoadAssetHits: counts[0],
  secondLoadAssetHits: counts[1],
  steadyStateAssetHits: counts[2],
  pageErrors: errs.length,
}));
if (errs.length) console.log(errs.slice(0, 3).join(' | '));
await b.close();
process.exit(counts[2] === 0 ? 0 : 1);
