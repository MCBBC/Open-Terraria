// 晚到贴图断点内窥(2026-08-19):wrap ensureVImage/note/onLoaded/onBakeAssetArrived,
// 记录 Tiles_191 的完整生命周期,定位自愈链断点。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = join(HOME, '.claude/jobs/8405c930/tmp');
const DELAY_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/latetex2-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
const TARGETS = [/Tiles_191\.png/, /Tiles_192\.png/];
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (TARGETS.some((re) => re.test(req.url()))) setTimeout(() => req.continue().catch(() => {}), DELAY_MS);
  else req.continue().catch(() => {});
});
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await sleep(1500);
// 内窥镜(原型级,免疫实例替换):ensureVImage/vframe/note/onLoaded/onArrived
await page.evaluate(() => {
  window.__log = [];
  const L = (m) => window.__log.push(`${Math.round(performance.now())}ms ${m}`);
  const M = /Tiles_19[12]/;
  const spyProto = () => {
    const a = window.__swGame?.renderer?.atlas;
    if (!a) return false;
    const proto = Object.getPrototypeOf(a);
    if (proto.__spied) return true;
    try {
      const oe = proto.ensureVImage;
      proto.ensureVImage = function (f, ...r) {
        if (M.test(f)) L(`ensure(${f.split('/').pop()}) baking=${!!this.bakeTracker?._baking} pending=${this._iconPending?.has?.(f)} inTable=${!!this.vimages.get(f)}`);
        return oe.call(this, f, ...r);
      };
      const ov = proto.vframe;
      proto.vframe = function (s, c, r2, ...r) {
        const res = ov.call(this, s, c, r2, ...r);
        if (!res) { const m = this.vmeta?.(s); if (m && M.test(m.sheet)) L(`vframe(sheet${s})→null(${m.sheet.split('/').pop()})`); }
        return res;
      };
      proto.__spied = true;
    } catch (e) { L('spy失败:' + String(e).slice(0, 60)); }
    return true;
  };
  const wait = setInterval(() => { if (spyProto()) clearInterval(wait); }, 150);
  // ChunkCache 钩(进世界后)
  const poll = setInterval(() => {
    const c = window.__swGame?.chunks;
    const a = window.__swGame?.renderer?.atlas;
    if (!c || !a?.bakeTracker || c.__spied2) return;
    c.__spied2 = true;
    const origNote = a.bakeTracker.note.bind(a.bakeTracker);
    a.bakeTracker.note = (f) => { if (M.test(f)) L(`note(${f.split('/').pop()}) key=${c._bakingKey}`); origNote(f); };
    const origOL = a.bakeTracker.onLoaded.bind(a.bakeTracker);
    a.bakeTracker.onLoaded = (f) => { if (M.test(f)) L(`onLoaded(${f.split('/').pop()})`); origOL(f); };
    const origArr = c.onBakeAssetArrived.bind(c);
    c.onBakeAssetArrived = (f) => { if (M.test(f)) L(`onArrived(${f.split('/').pop()})`); origArr(f); };
    clearInterval(poll);
  }, 150);
});
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const tree = await page.evaluate(() => {
  // ★内部 id 空间换算(st.type 是 TILE_DEFS 索引,与 vanilla vid 无关——
  // 曾误用 vid 直扫 = 扫到无关方块,复现无效)
  const ids = ['v_191_living_wood_block', 'v_192_living_leaf_block', 'v_383_living_mahogany_block', 'v_384_living_mahogany_leaves_block']
    .map((k) => window.__swTileByKey?.(k) ?? -1).filter((v) => v >= 0);
  if (!ids.length) return null;
  const set = new Set(ids);
  const st = window.__swGame.world.store;
  for (let y = 40; y < st.h - 40; y += 2) for (let x = 10; x < st.w - 10; x += 2) {
    const i = y * st.w + x;
    if (set.has(st.type[i]) && st.flags[i]) return { x, y };
  }
  return null;
});
console.log('生命树 @', JSON.stringify(tree));
if (!tree) { console.log('(本世界无生命树,跳过)'); await browser.close(); process.exit(0); }
await page.evaluate((x, y) => { const p = window.__swGame.player; p.x = x * 16; p.y = (y - 6) * 16; }, tree.x, tree.y);
await sleep(6000);
console.log('--- 缺表期日志 ---');
console.log(await page.evaluate(() => window.__log?.slice(0, 20).join('\n') ?? '(无)'));
await sleep(Math.max(0, DELAY_MS - 6000) + 8000);
console.log('--- 表到达后日志 ---');
console.log(await page.evaluate(() => window.__log?.slice(0, 40).join('\n') ?? '(无)'));
const st = await page.evaluate(() => ({ arrive: window.__swGame.chunks.arriveInvalidateChunks, inTable: !!window.__swGame.renderer.atlas.vimages.get('vanilla/Tiles_191.png') }));
console.log('最终:', JSON.stringify(st));
await browser.close();
