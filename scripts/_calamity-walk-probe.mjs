// ★SOLID_LUT 扩容债 实机踩踏探针(2026-10-14):灾厄 mod tile 运行期注册后
// TileStore.SOLID_LUT 越界=永非实心→灾厄地形不可踩踏。修复=注册后置钩扩容。
// 本探针真链验证:装包→重载→createWorldProbe(seed=9293480 金标种子,硫磺海保底)
// →直读 SOLID_LUT[硫磺沙]→传送玩家至硫磺沙柱顶→2.5s 物理 settle→验不陷不穿。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox', '--js-flags=--max-old-space-size=4096'],
  userDataDir: `/tmp/sw-cal-walk-${Date.now() % 100000}`,
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => typeof (window).__swMods === 'object' && typeof (window).__swFlow === 'object', { timeout: 180000 });

  const installed = await page.evaluate(async () => {
    const res = await fetch('/mods/dist/calamity.swmod');
    if (!res.ok) return `HTTP ${res.status}`;
    const bytes = new Uint8Array(await res.arrayBuffer());
    await (window).__swMods.install(bytes);
    return `ok ${(bytes.length / 1024 / 1024).toFixed(0)}MB`;
  });
  check('装包', String(installed).startsWith('ok'), String(installed));

  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => {
    const m = (window).__swMods;
    return !!m && !!m.result && (m.result()?.allocation?.items?.size ?? 0) > 2000;
  }, { timeout: 240000 });
  await page.waitForFunction(() => typeof (window).__swFlow?.createWorldProbe === 'function', { timeout: 120000 });
  check('装载', true, '');

  // 金标种子 9293480 + evil:0(与 mb-hang 金标链同面,硫磺海东缘保底 x≈3870-4200)
  await page.evaluate(() => {
    void (window).__swFlow.createWorldProbe({
      name: 'calamity-walk', seed: '9293480',
      w: 4200, h: 1200, size: 0, difficulty: 0, evil: 0,
    })?.catch?.(() => {});
  });
  await page.waitForFunction(() => {
    const g = (window).__swGame;
    return !!g && !!g.world && g.world.store?.w > 0;
  }, { timeout: 300000, polling: 2000 });
  await page.waitForFunction(() => !(window).__swGame?.entryFreezeActive, { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  check('进游戏', true, '');

  const out = await page.evaluate(async () => {
    const res = { checks: [] };
    const ck = (name, ok, detail = '') => res.checks.push({ name, ok, detail });
    const g = (window).__swGame;
    const store = g.world.store;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const { TileStore } = await import('/src/world/TileStore.ts');

    const sandId = TILE_BY_KEY['mod_calamity_sulphurous_sand'];
    ck('硫磺沙已注册', Number.isInteger(sandId) && sandId > 752, `id=${sandId}`);

    // ① 直读 SOLID_LUT(修前越界 undefined)
    ck('SOLID_LUT[硫磺沙]=1', TileStore.SOLID_LUT[sandId] === 1, `=${TileStore.SOLID_LUT[sandId]}`);
    ck('SOLID_LUT 覆盖全 defs', TileStore.SOLID_LUT.length >= (await import('/src/data/tiles.ts')).TILE_DEFS.length,
      `${TileStore.SOLID_LUT.length}`);

    // ② 找硫磺沙柱:西缘(dungeonX 西侧时硫磺海在 x∈[0,554])自西向东第一列,
    //    连续 ≥8 格实心沙,记柱顶
    let spot = null;
    for (let x = 0; x < 600 && !spot; x++) {
      let run = 0;
      for (let y = 150; y < 700; y++) {
        const i = store.idx(x, y);
        if (store.type[i] === sandId && (store.flags[i] & 1) !== 0) {
          run++;
          if (run >= 8) { spot = { x, top: y - 7 }; break; }
        } else run = 0;
      }
    }
    if (!spot) { ck('硫磺沙柱存在', false, '未找到'); return res; }
    ck('硫磺沙柱存在', true, `x=${spot.x} top=${spot.top}`);

    // ③ 传送玩家至柱顶上方 4px,零速释放(平地无输入)
    const p = g.player;
    const landAt = spot.top;
    p.x = spot.x * 16 + 8;   // ≈居中(宽 20)
    p.y = landAt * 16 - p.h - 4;
    p.vx = 0; p.vy = 0; p.onGround = false;
    if (p.fallStartY !== undefined) p.fallStartY = p.y;
    const y0 = p.y;
    await new Promise((r) => setTimeout(r, 2500));   // 真实游戏循环 150 tick

    // ④ settle 判据:|vy|≈0 且脚底落在柱顶 ±1 格内(不穿不陷)
    const feet = p.y + p.h;
    const dy = feet - landAt * 16;
    ck('settle 静止', Math.abs(p.vy ?? 0) < 0.5, `vy=${(p.vy ?? 0).toFixed(3)}`);
    ck('脚在柱顶(±16px)', Math.abs(dy) <= 16, `dy=${dy.toFixed(1)}px feet=${feet.toFixed(1)} 柱顶=${landAt * 16}`);
    ck('未陷落(y0-Δ 合理)', p.y >= y0 - 200 && p.y < y0 + 400, `y0=${y0.toFixed(0)} now=${p.y.toFixed(0)}`);

    // ⑤ 负对照:同法试原版泥土(sheet0=内部1)——两判同绿=谓词路径本身健康
    let dirtTop = -1;
    const dx = spot.x < 500 ? 800 : spot.x;   // 泥土对照列避开硫磺海区
    for (let y = 100; y < 900; y++) { if (store.type[store.idx(dx, y)] === 1 && (store.flags[store.idx(dx, y)] & 1)) { dirtTop = y; break; } }
    if (dirtTop > 0) {
      p.x = dx * 16 + 8; p.y = dirtTop * 16 - p.h - 4;
      p.vx = 0; p.vy = 0; p.onGround = false;
      await new Promise((r) => setTimeout(r, 1500));
      const dy2 = (p.y + p.h) - dirtTop * 16;
      ck('泥土对照(原版路径)', Math.abs(p.vy ?? 0) < 0.5 && Math.abs(dy2) <= 16, `dy=${dy2.toFixed(1)} vy=${(p.vy ?? 0).toFixed(3)}`);
    }
    return res;
  });
  for (const c of out.checks) check(c.name, c.ok, c.detail);

  await page.screenshot({ path: '/tmp/calamity-walk-probe.png' });
} catch (err) {
  check('探针异常', false, String(err).slice(0, 200));
} finally {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n== 结果: ${results.length - fails.length}/${results.length} 绿 ==`);
  for (const f of fails) console.log(`  ✗ ${f.name}: ${f.detail}`);
  if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 5));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
}
