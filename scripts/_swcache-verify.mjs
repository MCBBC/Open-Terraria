// SW 缓存健康验证:warm 完成后,经页面 fetch(走 SW cache-first)取贴图→
// createImageBitmap 解码;对照 fetch(cache:'reload') 直取网络。corrupt=SW 有毒。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: `/Users/vinlic/.claude/jobs/8405c930/tmp/swver-${process.env.TAG ?? 'x'}`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
page.setDefaultTimeout(200000);
const B = process.env.T || 'http://localhost:4173';
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
// 等 warm 终态(最多 120s)
await page.waitForFunction(() => {
  const s = window.__swWarm;
  return !s || s.phase === 'done' || s.warming === false;
}, { timeout: 130000 }).catch(() => console.log('[warm] 等待超时,继续'));
const warmState = await page.evaluate(() => window.__swWarm ?? '(无 __swWarm 暴露)');
console.log('[warm]', JSON.stringify(warmState).slice(0, 160));
// 采样弹幕/物品/武器贴图
const FILES = ['sprites/vanilla/Projectile_104.png', 'sprites/vanilla/Projectile_10.png',
  'sprites/vanilla/Item_Atlas_0.png', 'sprites/vanilla/Tiles_0.png', 'sprites/vanilla/NPC_1.png'];
const res = await page.evaluate(async (files) => {
  const out = [];
  for (const f of files) {
    const url = '/' + f;
    const probe = async (opt) => {
      try {
        const r = await fetch(url, opt);
        if (!r.ok) return `HTTP${r.status}`;
        const buf = await r.arrayBuffer();
        if (buf.byteLength < 100) return `太短${buf.byteLength}B`;
        try {
          const bm = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
          const ok = `${bm.width}x${bm.height}`;
          bm.close();
          return ok;
        } catch { return `解码失败(${buf.byteLength}B)`; }
      } catch (e) { return 'fetch异常:' + String(e).slice(0, 60); }
    };
    out.push({ f, cache: await probe(), net: await probe({ cache: 'reload' }) });
  }
  return out;
}, FILES).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[贴图经缓存 vs 直取]', JSON.stringify(res));
await browser.close();
