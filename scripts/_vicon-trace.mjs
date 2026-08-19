// vicon 断环定位:swordId → atlasIcon → vicon(4) → vanilla.items['4'] / ensureVImage(Item_Atlas)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/vicon-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer, at = r.atlas;
  const swordKey = 'vi_3507_CopperShortsword';
  const m2 = await import('/src/data/items.ts');
  const swordId = m2.ITEM_BY_KEY[swordKey];
  const ar = r.atlasIcon(swordId);
  // vicon 内部
  const meta = at.vanilla?.items?.['4'];
  const sheetFile = meta?.icon ?? null;
  let img = sheetFile ? at.ensureVImage(sheetFile) : null;
  for (let k = 0; k < 6 && sheetFile && !img; k++) {
    await new Promise((res) => setTimeout(res, 500));
    img = at.ensureVImage(sheetFile);
  }
  const failed = at._vImageFailed ? [...at._vImageFailed] : '(私有不可读)';
  // 挂 drawUseItem 内窥:调用次数 + 内部 ar/icon 是否 null
  const rp = Object.getPrototypeOf(r);
  const origDUI = rp.drawUseItem;
  window.__dui = { calls: 0, arNull: 0, iconNull: 0, lastItem: -1 };
  rp.drawUseItem = function (ctx2, p, sw, fl) {
    const st = window.__dui;
    st.calls++;
    st.lastItem = sw.item;
    const a = this.atlasIcon(sw.item);
    if (!a) st.arNull++;
    return origDUI.call(this, ctx2, p, sw, fl);
  };
  // 装剑(点击由外层真实触发)
  g.player.inv.slots[0] = { id: swordId, stack: 1 };
  g.player.inv.selected = 0;
  await new Promise((res) => setTimeout(res, 400));
  window.__swingCap = [];
  const origUU = Object.getPrototypeOf(g).updateUse;
  Object.getPrototypeOf(g).updateUse = function (dt) {
    if (this.swing && window.__swingCap.length < 20) {
      window.__swingCap.push([this.swing.t, this.swing.dur, this.swing.item, !!this.swing.noGraphic]);
    }
    return origUU.call(this, dt);
  };
  const m3 = await import('/src/data/vanillaItemCombat.ts');
  const def4803 = m2.ITEM_DEFS[4803];
  const vidOf = (k) => Number(/^vi_(\d+)_/.exec(k)?.[1] ?? -1);
  const ic = def4803 ? m3.itemCombat(vidOf(def4803.key)) : null;
  window.__idProbe = { key4803: def4803?.key ?? null, name: def4803?.name ?? null,
    noUseGraphic: ic?.noUseGraphic ?? null, combatEntry: ic ? JSON.stringify(ic).slice(0, 120) : '无表项',
    swordKey: m2.ITEM_DEFS[swordId]?.key ?? null };
  return { swordId, atlasIconNull: ar === null, arShape: ar ? `${ar.sw}x${ar.sh}@${(ar.img?.width ?? 0)}w` : null,
    itemsMeta4: meta ? { icon: meta.icon, ix: meta.ix, iw: meta.iw } : 'MISSING',
    sheetFile, sheetImgLoaded: !!img, failedList: failed.slice(0, 6),
    atlasInVimages: at.vimages?.has('vanilla/Item_Atlas_0.png') ?? false,
    atlasOnDiskProbe: at.vimages?.has('vanilla/Item_Atlas_1.png') ?? false };
}).catch((e) => ({ err: String(e).slice(0, 300) }));
// 外层:真实点击挥剑 1.2s → 采 dui/swing
await page.mouse.move(660, 420);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 500));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 700));
const final = await page.evaluate(() => ({ dui: window.__dui, swingCap: window.__swingCap.slice(0, 6), idProbe: window.__idProbe }));
console.log('[真实点击]', JSON.stringify(final));
console.log(JSON.stringify(out, null, 1));
await browser.close();
