// 生产 v0.1.23 现场:manifest 12897 条逐个 fetch,统计 404 完整清单
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOG = fs.openSync('/tmp/manifest-audit.log', 'w');
const log = (t) => fs.writeSync(LOG, t + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/man-audit-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto('https://sandboxworld.online/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
log('SW controlled');
const out = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = { names, cacheSummary: {}, miss404: [] };
  for (const name of names) {
    const c = await caches.open(name);
    out.cacheSummary[name] = (await c.keys()).length;
  }
  // manifest 从哪拿(页面 fetch 直拉)
  const mRes = await fetch('assets-zip/manifest.json');
  if (!mRes.ok) { out.manifestErr = mRes.status; return out; }
  const m = await mRes.json();
  out.totalFiles = m.totalFiles;
  out.mParts = m.parts.map((p) => ({ file: p.file, files: p.files }));
  // 逐条 fetch(并发 32)
  const all = [];
  for (const p of m.parts) {
    for (const e of p.entries) {
      all.push(typeof e === 'string' ? e : (e.path || e.name || JSON.stringify(e)));
    }
  }
  out.entries = all.length;
  const queue = [...all];
  const results = [];
  const worker = async () => {
    while (queue.length) {
      const path = queue.shift();
      try {
        const r = await fetch(path);
        if (!r.ok) results.push({ path, status: r.status, ct: r.headers.get('content-type'), size: (await r.text()).length });
      } catch (e) { results.push({ path, err: String(e).slice(0, 60) }); }
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  out.missTotal = results.length;
  // 按前缀分类
  const byPrefix = {};
  for (const r of results) {
    const seg = r.path.split('/')[1] ?? r.path;
    const fam = r.path.includes('Backgrounds_') ? 'Backgrounds_族' : r.path.includes('Splash') ? 'Splash' : r.path.includes('.opus') ? 'opus' : seg;
    byPrefix[fam] = (byPrefix[fam] ?? 0) + 1;
  }
  out.missByFam = byPrefix;
  out.missSample = results.slice(0, 15);
  return out;
});
log(JSON.stringify(out, null, 1).slice(0, 5000));
await browser.close();
fs.closeSync(LOG);
