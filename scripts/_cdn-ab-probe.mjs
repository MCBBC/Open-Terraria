// 双域 A/B 冷启动实测(2026-08-26):独立全新 profile(等价无痕+清缓存),
// 各观察 60s:请求形态 / 404 分布 / zip warm 健康度 / 哨兵资产 / console 错误。
// 判定标准:zip 片请求 >0 且 404 总数 << 风暴量级(>1000),sentinel 渐次就位。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OB = Number(process.env.OBS_MS ?? 60000);
mkdirSync('/tmp/cdn-ab', { recursive: true });

async function testDomain(host) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    userDataDir: `/tmp/cdn-ab/${host.split('.')[0]}`,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-proxy-server'],   // 直连,排除本机代理噪声
  });
  const page = await browser.newPage();
  const stats = { req: 0, bytes: 0, notFound: 0, zips: new Set(), zipBytes: 0, errs: [], manifest: 0 };
  page.on('console', (m) => {
    if (m.type() === 'error') stats.errs.push(m.text().slice(0, 120));
  });
  page.on('response', async (res) => {
    stats.req++;
    const u = res.request().url();
    if (res.status() === 404) stats.notFound++;
    if (u.includes('/assets-zip/p')) { stats.zips.add(u.split('/p')[1]?.split('-')[0]); stats.zipBytes += +(res.headers()['content-length'] ?? 0); }
    if (u.includes('manifest.json')) stats.manifest++;
    const cl = res.headers()['content-length'];
    if (cl && res.status() === 200) stats.bytes += +cl;
  });
  await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, OB));
  const state = await page.evaluate(async () => {
    const h = globalThis.__swAssetCache;
    const st = (h && typeof h.state === 'function') ? h.state() : null;
    const keys = await caches.keys();
    const per = [];
    for (const k of keys) {
      try { per.push([k, (await (await caches.open(k)).keys()).length]); } catch { per.push([k, 'ERR']); }
    }
    const c = per.length ? await caches.open(per[0][0]) : null;
    const sent = {};
    for (const w of ['audios/music/Music_50.mp3', 'sprites/vanilla/SplashScreens_1_0.png', 'sprites/vanilla-ui/Logo.png']) {
      sent[w.split('/').pop()] = !!(c && await c.match(w));
    }
    return {
      phase: st && st.phase, done: st && st.done, total: st && st.total,
      failed: st && st.failed, mb: st ? Math.round((st.bytesDone ?? 0) / 1048576) : 0,
      caches: per, sentinel: sent,
    };
  }).catch((e) => ({ err: String(e).slice(0, 150) }));
  // close 前留 3s 刷盘窗口,close 后重开只读磁盘 CacheStorage 复核持久化
  await new Promise((r) => setTimeout(r, 3000));
  await browser.close();
  const verify = await (async () => {
    const b2 = await puppeteer.launch({
      executablePath: CHROME, headless: 'new', userDataDir: `/tmp/cdn-ab/${host.split('.')[0]}`,
      args: ['--no-proxy-server'],
    });
    const p2 = await b2.newPage();
    const r = await p2.evaluate(async () => {
      const keys = await caches.keys();
      const per = [];
      for (const k of keys) {
        try { per.push([k, (await (await caches.open(k)).keys()).length]); } catch { per.push([k, 'ERR']); }
      }
      return per;
    }).catch((e) => String(e).slice(0, 120));
    await b2.close();
    return r;
  })();
  state.persistedAfterClose = verify;
  return { host, ...stats, zips: [...stats.zips].sort((a, b) => +a - +b).join(','), state, topErr: stats.errs.slice(0, 3) };
}

const out = [];
for (const host of ['sandbox.vinlic.com', 'world.vinlic.com']) {
  const r = await testDomain(host);
  out.push(r);
  console.log(`\n===== ${r.host} =====`);
  console.log(`  请求总数=${r.req} | 网络字节=${(r.bytes / 1048576).toFixed(1)}MB | 404 数=${r.notFound}`);
  console.log(`  zip 片请求=${r.zips.split(',').length} 片 [${r.zips}] | zip 字节=${(r.zipBytes / 1048576).toFixed(1)}MB`);
  console.log(`  页面状态:`, JSON.stringify(r.state));
  console.log(`  console错误=${r.errs.length}`, r.topErr.length ? '| 样本: ' + r.topErr.join(' ~ ') : '');
}
console.log('\nA/B 完成');
process.exit(0);
