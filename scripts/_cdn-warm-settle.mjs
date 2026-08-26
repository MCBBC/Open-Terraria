// 暖缓存静置观测(2026-08-26):单一导航不打断,持久 profile,WARM_MS 默认 150s。
// 读 __swAssetCache.state() + Cache 条目数 + 哨兵键,判定 warm 全链收敛。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'https://sandbox.vinlic.com';
const userDir = process.env.SW_USERDIR ?? '/tmp/cdn-boot-probe-p';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: userDir,
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });

const settleMs = Number(process.env.WARM_MS ?? 150000);
for (let t = 0; t < settleMs; t += 30000) {
  await new Promise((r) => setTimeout(r, Math.min(30000, settleMs - t)));
  const s = await page.evaluate(async () => {
    const handle = globalThis.__swAssetCache;
    const st = (handle && typeof handle.state === 'function') ? handle.state() : null;
    const keys = await caches.keys();
    const per = [];
    for (const k of keys) {
      try { per.push([k, (await (await caches.open(k)).keys()).length]); } catch {}
    }
    const c = per.length ? await caches.open(per[0][0]) : null;
    const sent = {
      m50: !!(c && await c.match('audios/music/Music_50.mp3')),
      bg: !!(c && await c.match('sprites/vanilla/Background_0.png')),
    };
    return {
      phase: st && st.phase, done: st && st.done, total: st && st.total,
      failed: st && st.failed, bytesDoneMB: st ? Math.round((st.bytesDone ?? 0) / 1048576) : 0,
      per, sent,
    };
  });
  console.log(`t=${t + 30}s`, JSON.stringify(s));
}
await browser.close();
process.exit(0);
