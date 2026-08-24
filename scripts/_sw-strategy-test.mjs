// sw.js 双策略验证:①首访(网络下载+回填) ②刷新(资产零回源=cache-first 命中)
// 判据用 python 静态服的访问日志(真实回源),而非浏览器侧表现。
import puppeteer from 'puppeteer-core';
import { readFileSync, statSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const LOG = '/tmp/static-4177.log';
const logSize = () => { try { return statSync(LOG).size; } catch { return 0; } };
const newLogLines = (prev) => {
  const cur = readFileSync(LOG, 'utf8').slice(prev);
  return cur.split('\n').filter((l) => /GET (\S+) /.test(l)).map((l) => {
    const m = l.match(/GET (\S+) /);
    return decodeURIComponent(m[1]);
  });
};

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

let prev = logSize();
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await new Promise((r) => setTimeout(r, 45_000));   // 首访+暖缓存
const firstHits = newLogLines(prev);
prev = logSize();

await p.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 12_000));
const secondHits = newLogLines(prev);

const assetFirst = firstHits.filter((u) => /^\/assets\/.+\.(js|css)/.test(u));
const assetSecond = secondHits.filter((u) => /^\/assets\//.test(u));
console.log(JSON.stringify({
  firstVisitAssetRequests: assetFirst.length,
  reloadAssetRequests: assetSecond.length,
  reloadAssetDetail: [...new Set(assetSecond)].slice(0, 8),
  pageErrors: errs.length,
}, null, 1));
await b.close();
process.exit(0);
