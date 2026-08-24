// 终诊:被动加载至分片下完,读 AssetCache 真实计数(done/failed/phase)与缓存条数。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'https://tr-test.unifuncs.com';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 160)));
p.on('console', (m) => { const t = m.text(); if (!/404|AudioContext/i.test(t)) errs.push(`console.${m.type()}: ${t.slice(0, 200)}`); });
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await new Promise((r) => setTimeout(r, 50_000));   // 等分片下完+批次回传

const final = await p.evaluate(async () => {
  const h = window.__swAssetCache;
  // state 可能是函数(取值器)也可能是对象——两种都试
  let st = null;
  try { st = typeof h.state === 'function' ? h.state() : h.state; } catch (e) { st = { stateCallErr: String(e) }; }
  const direct = {};
  if (st) for (const k of ['enabled', 'warming', 'phase', 'done', 'total', 'failed', 'version', 'bytesDone', 'bytesTotal']) {
    try { direct[k] = st[k]; } catch { direct[k] = '<err>'; }
  }
  const names = await caches.keys();
  const detail = {};
  let total = 0;
  for (const nm of names) {
    const keys = await (await caches.open(nm)).keys();
    detail[nm] = keys.length;
    total += keys.length;
    // 抽样 3 个键名
    detail[nm + '_sample'] = keys.slice(0, 3).map((k) => k.url.replace(location.origin, ''));
  }
  return { stateType: typeof h.state, direct, caches: detail, totalEntries: total };
});
console.log(JSON.stringify(final, null, 1));
console.log('=== 页面错误/警告 ===');
for (const e of errs.slice(0, 10)) console.log(' ', e);
await b.close();
process.exit(0);
