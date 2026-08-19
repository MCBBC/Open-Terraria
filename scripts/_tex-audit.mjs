// 贴图供给审计:vimages/uiimages/images 取样(宽高/就绪)+ 铜短剑挥击像素 + pageerror。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/texaud-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
const netFail = [];
page.on('requestfailed', (r) => netFail.push(r.url().slice(-60) + ':' + (r.failure()?.errorText ?? '?')));
page.on('response', (r) => { if (r.status() >= 400) netFail.push(r.url().slice(-60) + ':' + r.status()); });
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
// 挂探针:记录所有"请求但拿不到"的文件(战斗动作 6 秒内)
await page.evaluate(() => {
  const g = window.__swGame;
  const at = g.atlas ?? g.renderer.atlas;
  window.__missTex = new Set();
  const orig = at.ensureVImage.bind(at);
  at.ensureVImage = (f, ...rest) => {
    const v = orig(f, ...rest);
    if (!v) window.__missTex.add(f);
    return v;
  };
});
// 给玩家铜短剑并连点挥击
await page.evaluate(async () => {
  const m = await import('/src/data/items.ts');
  const sword = m.ITEM_BY_KEY['vi_4_CopperShortsword'] ?? m.ITEM_BY_KEY['copper_sword'];
  if (sword == null) { window.__giveSword = 'key缺失'; return; }
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: sword, stack: 1 };
  g.player.inv.selected = 0;
  window.__giveSword = 'ok';
});
await new Promise((r) => setTimeout(r, 800));
await page.mouse.move(660, 420);
for (let k = 0; k < 5; k++) { await page.mouse.down(); await new Promise((r) => setTimeout(r, 500)); await page.mouse.up(); await new Promise((r) => setTimeout(r, 200)); }
const miss = await page.evaluate(() => [...(window.__missTex ?? new Set())].slice(0, 12));
console.log('[挥击期 未命中贴图]', JSON.stringify(miss));
console.log('[给剑]', await page.evaluate(() => window.__giveSword));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const at = g.atlas ?? g.renderer.atlas;
  const probe = async (f) => {
    let v = at?.ensureVImage?.(f) ?? null;      // 首呼触发懒加载
    for (let k = 0; k < 6 && !v; k++) {          // 最多等 3s 自愈
      await new Promise((r) => setTimeout(r, 500));
      v = at?.ensureVImage?.(f) ?? null;
    }
    return v ? `${v.width}x${v.height}:${v.constructor.name}` : 'null(加载失败)';
  };
  const vim = at?.vimages, uim = at?.uiimages, im = at?.images;
  return {
    ensure_Proj1: await probe('vanilla/Projectile_1.png'),
    ensure_CopperSword: await probe('vanilla/Item_4.png'),
    mapCounts: { vimages: vim?.size ?? -1, uiimages: uim?.size ?? -1, images: im?.size ?? -1 },
    sampleImages: (() => { let cv = 0, bm = 0; for (const v of (im?.values() ?? [])) v instanceof HTMLCanvasElement ? cv++ : bm++; return { canvas: cv, bitmap: bm }; })(),
    rload: g.renderer ? (g.renderer.lastTexLoads ?? 'n/a') : 'n/a',
  };
}).catch((e) => ({ err: String(e).slice(0, 300) }));
console.log('[atlas]', JSON.stringify(out));
console.log('[pageerror]', errs.length, errs.slice(0, 3));
console.log('[网络失败]', JSON.stringify(netFail.slice(0, 6)));
await browser.close();
