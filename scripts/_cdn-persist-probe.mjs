// 持久化丢失定位实验(2026-08-27):暖满 → 【同进程 reload】→ 关进程 → 【跨进程重开】,
// 三段各自记录 keys 总数与 zip 下载量,分辨"刷新丢失"vs"跨进程丢失"。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'sandboxworld.online';
const dir = `/tmp/cdn-persist-${host.split('.')[0]}`;
const launch = () => puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: dir,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const snap = async (page) => page.evaluate(async () => {
  const keys = await caches.keys();
  let entries = 0;
  for (const k of keys) { try { entries += (await (await caches.open(k)).keys()).length; } catch { /* */ } }
  const h0 = globalThis.__swAssetCache;
  const st0 = h0 && typeof h0.state === 'function' ? h0.state() : null;
  const h = globalThis.__swAssetCache;
  const st = (h && typeof h.state === 'function') ? h.state() : null;
  return { entries, keysAll: keys, stateVersion: st0?.version, phase: st?.phase, done: st?.done, failed: st?.failed };
});
const watch = (page, stat) => {
  page.on('response', (r) => { if (/\/assets-zip\/p\d+-/.test(r.request().url())) stat.zips++; });
};

// ① 暖满(最多 120s,以 phase=done 为准)
let browser = await launch();
let page = await browser.newPage();
const stat1 = { zips: 0 };
watch(page, stat1);
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let s;
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  s = await snap(page);
  if (s.phase === 'done' && s.entries >= 12000) break;
}
console.log('① 暖满:', JSON.stringify(s), '| zip 下载:', stat1.zips);
await page.reload({ waitUntil: 'domcontentloaded' });
// ② 同进程 reload 后 20s:keys 应保持,zip 应≈0
const stat2 = { zips: 0 };
watch(page, stat2);
await new Promise((r) => setTimeout(r, 20000));
const s2 = await snap(page);
console.log('② reload 后 20s:', JSON.stringify(s2), '| reload 后 zip 下载:', stat2.zips);
await browser.close();

// ③ 跨进程重开 20s + 缺失条目样本(对比 manifest 清单,揭示"每次重下"的名字模式)
browser = await launch();
page = await browser.newPage();
const stat3 = { zips: 0 };
watch(page, stat3);
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 20000));
const s3 = await page.evaluate(async () => {
  const keys = await caches.keys();
  const per = [];
  const have = new Set();
  for (const k of keys) {
    try {
      const c = await caches.open(k);
      const all = await c.keys();
      per.push([k, all.length]);
      for (const r of all) have.add(new URL(r.url).pathname.replace(/^\//, ''));
    } catch { per.push([k, 'ERR']); }
  }
  let missing = [], total = 0;
  try {
    const m = await (await fetch('assets-zip/manifest.json', { cache: 'reload' })).json();
    for (const p of m.parts) for (const e of p.entries) {
      total++;
      if (!have.has(e) && missing.length < 24) missing.push(e);
    }
  } catch { /* */ }
  const h = globalThis.__swAssetCache;
  const st = (h && typeof h.state === 'function') ? h.state() : null;
  return { per, haveTotal: have.size, manifestTotal: total, missingSample: missing,
    phase: st?.phase, done: st?.done, warming: st?.warming };
});
console.log('③ 跨进程重开 20s:', JSON.stringify({ per: s3.per, phase: s3.phase, done: s3.done, warming: s3.warming }), '| zip 下载:', stat3.zips);
console.log('  cache 实有:', s3.haveTotal, '/ manifest:', s3.manifestTotal);
console.log('  缺失样本:', JSON.stringify(s3.missingSample, null, 0));
await browser.close();
process.exit(0);
