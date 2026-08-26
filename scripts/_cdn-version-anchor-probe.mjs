// 版本锚定回归 v2(2026-08-27):单 browser 单 profile 三 page(规避 headless
// 跨进程 localStorage 丢失噪声),纯测 gc 权限模型+锚定逻辑:
// ①p1 正常暖 40s → ②p2 拦 manifest→500 30s(失败会话,不得清缓存)
// → ③p3 解除拦截 20s(断点续传)。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'world.vinlic.com';
const dir = `/tmp/cdn-anchor-${host.split('.')[0]}`;
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: dir,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const snap = async (page) => page.evaluate(async () => {
  const keys = await caches.keys();
  const per = [];
  for (const k of keys) { try { per.push([k, (await (await caches.open(k)).keys()).length]); } catch { per.push([k, -1]); } }
  const h = globalThis.__swAssetCache;
  const st = (h && typeof h.state === 'function') ? h.state() : null;
  return { per, phase: st && st.phase, done: st && st.done, warming: st && st.warming };
});
const totalOf = (s) => s.per.reduce((a, [, n]) => a + (typeof n === 'number' ? n : 0), 0);

// ① 正常暖
let page = await browser.newPage();
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 40000));
const s1 = await snap(page);
console.log('① 正常暖 40s:', JSON.stringify(s1));
await page.close();

// ② manifest→500 失败会话(同 profile 同进程,localStorage 存活)
page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/assets-zip/manifest.json')) {
    req.respond({ status: 500, body: 'simulated failure', contentType: 'text/plain' });
  } else req.continue();
});
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 30000));
const s2 = await snap(page);
console.log('② manifest=500 会话 30s:', JSON.stringify(s2));
const ok = totalOf(s2) >= totalOf(s1) * 0.95 && s2.per.some(([k]) => s1.per.some(([k1]) => k1 === k));
console.log(ok ? '  ✅ 缓存名未漂移、暖存保留——gc 权限模型+锚定生效' : `  ❌ 缓存被误清!(${totalOf(s1)} → ${totalOf(s2)})`);
await page.close();

// ③ 解除拦截,断点续传
page = await browser.newPage();
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 20000));
const s3 = await snap(page);
console.log('③ 恢复后 20s:', JSON.stringify(s3));
await browser.close();
process.exit(ok ? 0 : 1);
