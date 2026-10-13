// ★灾厄 6.83.0 世界生成+实机运行链探针(2026-10-13)
// 全链路:装包→重载 boot 装载→__swFlow.createWorldProbe 真实世界生成(worker gen pass
// 含 mod pass)→进游戏→mod NPC spawn/AI tick/受击链/性能 rAF 采样。
// 专注 mod 框架缺陷;mod 侧内容正确性归另一会话。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox', '--js-flags=--max-old-space-size=4096'],
  userDataDir: `/tmp/sw-cal-wg-${Date.now() % 100000}`,
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ── ① 首次进入:装包(boot 后 __swMods 桥) ──
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => typeof (window).__swMods === 'object' && typeof (window).__swFlow === 'object',
    { timeout: 180000 });

  const installed = await page.evaluate(async () => {
    const res = await fetch('/mods/dist/calamity.swmod');
    if (!res.ok) return `HTTP ${res.status}`;
    const bytes = new Uint8Array(await res.arrayBuffer());
    await (window).__swMods.install(bytes);
    return `ok ${(bytes.length / 1024 / 1024).toFixed(0)}MB`;
  });
  check('装包', String(installed).startsWith('ok'), String(installed));

  // ── ② 重载:boot loadModsPhase1 拾取已装 mod(真实用户路径) ──
  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => {
    const m = (window).__swMods;
    return !!m && !!m.result && (m.result()?.allocation?.items?.size ?? 0) > 2000;
  }, { timeout: 240000 });
  // flow 门面在菜单 boot 尾部挂载——分配计数就绪后再等它
  await page.waitForFunction(() => typeof (window).__swFlow?.createWorldProbe === 'function',
    { timeout: 120000 });
  const boot = await page.evaluate(() => {
    const r = (window).__swMods.result();
    const a = r?.allocation;
    const cnt = (m) => (m ? m.size : 0);
    return {
      errors: (r?.errors ?? []).slice(0, 3),
      counts: {
        items: cnt(a?.items), npcs: cnt(a?.npcs), projs: cnt(a?.projs),
        buffs: cnt(a?.buffs), walls: cnt(a?.walls), rarities: cnt(a?.rarities),
      },
    };
  });
  check('装载零错', boot.errors.length === 0, JSON.stringify(boot.errors));
  check('分配段位', boot.counts.items >= 2000 && boot.counts.npcs >= 200
    && boot.counts.projs >= 2000 && boot.counts.walls >= 100,
    JSON.stringify(boot.counts));

  // ── ③ 真实世界创建(createWorldProbe=完整生成流:双进度条+worker gen+mod gen pass) ──
  await page.evaluate(() => {
    void (window).__swFlow.createWorldProbe({
      name: 'calamity-probe', seed: 'calamity-probe-1',
      w: 4200, h: 1200, size: 0, difficulty: 0, evil: -1,
    })?.catch?.(() => {});
  });
  await page.waitForFunction(() => {
    const g = (window).__swGame;
    return !!g && !!g.world && g.world.store?.w > 0;
  }, { timeout: 300000, polling: 2000 });

  // 入场冻结(wbake 窗 ≤3s)+ settle
  await page.waitForFunction(() => !(window).__swGame?.entryFreezeActive, { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  check('进游戏', true, '');

  // ── ④ 游戏内全链检查 ──
  const inGame = await page.evaluate(async () => {
    const out = { checks: [] };
    const check = (name, ok, detail = '') => out.checks.push({ name, ok, detail });
    const g = (window).__swGame;
    const world = g.world;
    const store = world.store;

    // ④a 世界生成墙(367+)——真实 gen 输出抽样(全图步进 7)
    let wallTiles = 0, wallKinds = new Set();
    for (let x = 0; x < store.w; x += 7) {
      for (let y = 0; y < store.h; y += 7) {
        const w = store.wall[store.idx(x, y)];
        if (w >= 367) { wallTiles++; wallKinds.add(w); }
      }
    }
    check('世界 gen 墙(367+)', wallTiles > 0, `${wallTiles} tiles / ${wallKinds.size} kinds`);
    check('mod 墙多样性', wallKinds.size >= 5, [...wallKinds].slice(0, 8).join(','));

    // ④b rare 12/13 物品(ITEM_DEFS 数值域直读)
    const r = (window).__swMods.result();
    const itemArr = [];
    for (const [k, v] of r.allocation.items) itemArr.push({ key: k, id: v });
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    let rare12 = 0, rare13 = 0;
    for (const e of itemArr) {
      if (ITEM_DEFS[e.id]?.rare === 12) rare12++;
      if (ITEM_DEFS[e.id]?.rare === 13) rare13++;
    }
    check('rare 12 物品', rare12 >= 50, `${rare12}`);
    check('rare 13 物品', rare13 >= 20, `${rare13}`);

    // ④c mod NPC spawn+AI tick(真实游戏循环跑 2s)
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const npcArr = [];
    for (const [k, v] of r.allocation.npcs) npcArr.push({ key: k, id: v });
    const px = g.player.x, py = g.player.y;
    let spawned = 0;
    const spawnedRefs = [];
    for (let i = 0; i < Math.min(5, npcArr.length); i++) {
      try {
        const e = Enemy.fromVanilla(npcArr[i].id, px + 150 + i * 60, py - 80);
        if (e) { g.entities.add(e, 'enemies'); spawned++; spawnedRefs.push(e); }
      } catch (err) { check(`NPC spawn ${npcArr[i].key}`, false, String(err).slice(0, 100)); }
    }
    check('mod NPC spawn ≥4', spawned >= 4, `${spawned}/5`);
    await new Promise((res) => setTimeout(res, 2000));   // 真实 rAF 循环跑 AI
    const alive = spawnedRefs.filter((e) => !e.dead).length;
    check('mod NPC AI 存活', alive >= 1 && spawnedRefs.length > 0, `${alive}/${spawnedRefs.length} alive(2s)`);

    // ④d 受击链(incomingHit/onHitByAny/onKill 全过一遍;不崩=链健康)
    let combatOk = false, combatDetail = '';
    try {
      const e = spawnedRefs.find((x) => !x.dead) ?? spawnedRefs[0];
      if (e) {
        const hpBefore = e.hp;
        const killed = e.hurt(1000, 0, 0, g, 0, false, 0, true);
        combatOk = (killed === true) || e.hp < hpBefore || e.dead;
        combatDetail = `hp ${hpBefore}→${e.hp} killed=${killed}`;
      } else combatDetail = '无可受击 NPC';
    } catch (err) { combatDetail = '链异常: ' + String(err).slice(0, 120); }
    check('受击链(1000 伤)', combatOk, combatDetail);

    // ④e 性能:300 帧 rAF 采样(真实渲染负载)
    const deltas = await new Promise((res) => {
      const ds = []; let last = performance.now(); let n = 0;
      const tick = (t) => {
        ds.push(t - last); last = t;
        if (++n >= 300) res(ds); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...deltas].sort((a, b) => a - b);
    const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    check('性能 300 帧', avg < 25, `avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms(门 25=40fps;60fps=16.67)`);

    // ④f 内存读数(信息性;Chrome 限页 ≥75MB 堵 4GB 硬墙)
    const mem = performance.memory;
    if (mem) {
      const mb = (v) => (v / 1048576).toFixed(0);
      check('内存读数', mem.usedJSHeapSize < 3.5 * 1048576 * 1024,
        `used=${mb(mem.usedJSHeapSize)}MB total=${mb(mem.totalJSHeapSize)}MB limit=${mb(mem.jsHeapSizeLimit)}MB`);
    }

    return out;
  });
  for (const c of inGame.checks) check(c.name, c.ok, c.detail);

  await page.screenshot({ path: '/tmp/calamity-worldgen-ingame.png' });

  const frameworkErrors = consoleErrors.filter((e) =>
    !e.includes('content 缺失') && !e.includes('debtLog') && !e.includes('[calamity') &&
    !e.includes('schematic') && !e.includes('mod 侧'));
  check('console 框架错误', frameworkErrors.length === 0, frameworkErrors.slice(0, 3).join(' | '));

} catch (err) {
  check('探针异常', false, err.message + '\n' + (err.stack ?? '').split('\n').slice(0, 4).join('\n'));
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
if (pass < results.length) {
  console.log('FAILURES:');
  for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}: ${r.detail}`);
}
process.exit(pass === results.length ? 0 : 1);
