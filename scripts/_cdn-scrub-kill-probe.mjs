// SW 冷启 scrub 定向实验(2026-08-27):同 profile 暖满 → close → 重开(SW 进程
// 冷启,init 会跑 gcOldCaches+scrubPoisonedEntries)→ 逐 5s 盯 keys。
// 若 keys 暴跌: scrub 误杀实锤,并抓被删/幸存条目的 content-type 对照。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'world.vinlic.com';
const dir = `/tmp/cdn-scrub-${host.split('.')[0]}`;
const launch = () => puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: dir,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const dump = async (page, tag) => {
  const s = await page.evaluate(async () => {
    const keys = await caches.keys();
    const per = [];
    let sample = [];
    for (const k of keys) {
      try {
        const c = await caches.open(k);
        const all = await c.keys();
        per.push([k, all.length]);
        sample = all.slice(0, 3).map((r) => new URL(r.url).pathname);
      } catch { per.push([k, 'ERR']); }
    }
    const h = globalThis.__swAssetCache;
    const st = (h && typeof h.state === 'function') ? h.state() : null;
    return { per, sample, st: st ? { phase: st.phase, done: st.done, warming: st.warming } : null };
  });
  console.log(`  [${tag}]`, JSON.stringify(s));
  return s;
};

// —— 第一访:暖 75s ——
let browser = await launch();
let page = await browser.newPage();
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 75000));
const first = await dump(page, '第一访 75s');
await browser.close();

// —— 第二访:SW 冷启,逐 5s 盯 keys ——
browser = await launch();
page = await browser.newPage();
await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let t = 5; t <= 40; t += 5) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await dump(page, `二访 t=${t}s`);
  // 若检测到断崖(< first 的 20%),停表
  const total = s.per.reduce((a, [, n]) => a + (typeof n === 'number' ? n : 0), 0);
  const fTotal = first.per.reduce((a, [, n]) => a + (typeof n === 'number' ? n : 0), 0);
  if (fTotal > 500 && total < fTotal * 0.2) { console.log('  !! keys 断崖,scrub 误杀实锤'); break; }
}
await browser.close();
process.exit(0);
