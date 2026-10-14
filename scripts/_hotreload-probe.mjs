// ★D11 热重载探针(2026-10-14):菜单态装→启停→免 reload 分配表反映
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox'],
  userDataDir: `/tmp/sw-hr-${Date.now() % 100000}`,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
try {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => typeof (window).__swMods === 'object', { timeout: 180000 });
  await page.waitForFunction(() => (window).__swAtlas?.vimages, { timeout: 60000 });

  const out = await page.evaluate(async () => {
    const checks = [];
    const check = (n, ok, d = '') => checks.push({ n, ok, d });
    try {
      // 装 e2e-all
      const res = await fetch('/mods/dist/e2e-all.swmod');
      const bytes = new Uint8Array(await res.arrayBuffer());
      await (window).__swMods.install(bytes);
      const { hotReloadMods } = await import('/src/mods/hotReload.ts');
      const atlas = (window).__swAtlas;
      const before = (window).__swMods.result?.allocation?.items?.size ?? -1;

      // 热重载 1(装后)
      const r1 = await hotReloadMods(atlas);
      check('热重载 1(装后)', r1.ok && r1.counts.items > 0, JSON.stringify(r1.counts ?? r1.errors));
      const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
      check('分配生效', ITEM_BY_KEY['mod_e2e_e2e_sword'] > 0, `id=${ITEM_BY_KEY['mod_e2e_e2e_sword']}`);
      const { modRarityColorOf } = await import('/src/mods/rarity.ts');
      check('稀有度注册', modRarityColorOf(12) === '#FF6600', modRarityColorOf(12));

      // 停用 → 热重载 2
      const { ModStore } = await import('/src/mods/store.ts');
      const store = new ModStore();
      await store.setEnabled('e2e', false);
      const r2 = await hotReloadMods(atlas);
      check('热重载 2(停用后)', r2.ok && (r2.counts?.items ?? 0) === 0, JSON.stringify(r2.counts ?? r2.errors));
      check('分配表清', ITEM_BY_KEY['mod_e2e_e2e_sword'] === undefined, `id=${ITEM_BY_KEY['mod_e2e_e2e_sword']}`);
      check('稀有度清', modRarityColorOf(12) === null, String(modRarityColorOf(12)));

      // 启用 → 热重载 3(幂等恢复)
      await store.setEnabled('e2e', true);
      const r3 = await hotReloadMods(atlas);
      console.log('[dbg-r3]', JSON.stringify(r3));
      check('热重载 3(恢复)', r3.ok && (r3.counts?.items ?? 0) > 0, JSON.stringify(r3.counts ?? r3.errors));
      check('分配恢复', ITEM_BY_KEY['mod_e2e_e2e_sword'] > 0, `id=${ITEM_BY_KEY['mod_e2e_e2e_sword']}`);
      void ITEM_DEFS; void before;
    } catch (err) {
      check('探针异常', false, String(err).slice(0, 200));
    }
    return checks;
  });
  for (const c of out) check(c.n, c.ok, c.d);
  check('pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));
} catch (err) {
  check('探针异常', false, err.message);
} finally {
  await browser.close();
}
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
