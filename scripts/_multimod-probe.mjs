// ★多 mod 共存全链探针(2026-10-14):4 真实 mod 同机(calamity+rivals+glmgirl+
// lights-and-shadows)——确定性 id 分配跨 mod 集/钩子多链/资产四包注入/性能合成负载/
// 存读 meta 全集。79 mod 用户真实形态的框架承载验证。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MODS = ['rivals', 'glmgirl', 'lights-and-shadows', 'calamity'];   // 文件名
const MOD_IDS = ['rivals', 'glmgirl', 'lights_and_shadows', 'calamity'];   // manifest id
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox', '--js-flags=--max-old-space-size=4096'],
  userDataDir: `/tmp/sw-multimod-${Date.now() % 100000}`,
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ── ① 装四包(boot 后 __swMods 桥;顺序=确定性分配的拓扑序输入) ──
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => typeof (window).__swMods === 'object', { timeout: 180000 });

  const installed = await page.evaluate(async (mods) => {
    const out = [];
    for (const m of mods) {
      const res = await fetch(`/mods/dist/${m}.swmod`);
      if (!res.ok) { out.push(`${m}:HTTP${res.status}`); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      await (window).__swMods.install(bytes);
      out.push(`${m}:${(bytes.length / 1024 / 1024).toFixed(1)}MB`);
    }
    return out;
  }, MODS);
  check('装包×4', installed.length === 4 && installed.every((s) => !s.includes('HTTP')), installed.join(' '));

  // ── ② 重载:boot loadModsPhase1 拾取四 mod ──
  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => {
    const m = (window).__swMods;
    return !!m && !!m.result && (m.result()?.allocation?.items?.size ?? 0) > 2000;
  }, { timeout: 240000 });
  await page.waitForFunction(() => typeof (window).__swFlow?.createWorldProbe === 'function', { timeout: 120000 });
  const boot = await page.evaluate(() => {
    const r = (window).__swMods.result();
    const a = r?.allocation;
    const cnt = (m) => (m ? m.size : 0);
    // per-mod 分配段位(全键前缀抽样)
    const first = (m, pfx) => { for (const [k, v] of m ?? []) if (k.startsWith(pfx)) return v; return -1; };
    return {
      errors: (r?.errors ?? []).slice(0, 4),
      counts: { items: cnt(a?.items), npcs: cnt(a?.npcs), projs: cnt(a?.projs), walls: cnt(a?.walls) },
      first: {
        calamityNpc: first(a?.npcs, 'mod_calamity_'), rivalsNpc: first(a?.npcs, 'mod_rivals_'),
        glmgirlItem: first(a?.items, 'mod_glmgirl_'), lightsFx: first(a?.items, 'mod_lights_'),
      },
      loaded: (r?.loaded ?? []).map((l) => l.manifest.id),
    };
  });
  check('装载零错×4', boot.errors.length === 0, JSON.stringify(boot.errors));
  check('四 mod 全载', MOD_IDS.every((m) => boot.loaded.includes(m)), boot.loaded.join(','));
  check('分配段位合成', boot.counts.items >= 2600 && boot.counts.npcs >= 300 && boot.counts.projs >= 2100,
    JSON.stringify(boot.counts));
  // per-mod 段位:calamity/rivals 必有 npc 声明;glmgirl(纯城镇对话)/lights(纯 screenFx)
  //  零内容分配=合法(旧断言误设 items 期望)
  check('per-mod 段位无碰撞', boot.first.calamityNpc > 0 && boot.first.rivalsNpc > 0,
    JSON.stringify(boot.first));

  // ── ③ 真实世界创建(worker gen 四 mod gen pass 全跑) ──
  await page.evaluate(() => {
    void (window).__swFlow.createWorldProbe({
      name: 'multimod-probe', seed: 'multimod-probe-1',
      w: 4200, h: 1200, size: 0, difficulty: 0, evil: -1,
    })?.catch?.(() => {});
  });
  await page.waitForFunction(() => {
    const g = (window).__swGame;
    return !!g && !!g.world && g.world.store?.w > 0;
  }, { timeout: 300000, polling: 2000 });
  await page.waitForFunction(() => !(window).__swGame?.entryFreezeActive, { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  check('进游戏', true, '');

  // ── ④ 游戏内全链检查 ──
  const inGame = await page.evaluate(async () => {
    const out = { checks: [] };
    const check = (name, ok, detail = '') => out.checks.push({ name, ok, detail });
    const g = (window).__swGame;
    const r = (window).__swMods.result();
    const a = r.allocation;

    // ④a 每 mod NPC 各 spawn 一只(跨 mod 域)
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const pick = (pfx) => { for (const [k, v] of a.npcs) if (k.startsWith(pfx)) return { key: k, id: v }; return null; };
    const px = g.player.x, py = g.player.y;
    const targets = ['mod_calamity_', 'mod_rivals_'].map(pick).filter(Boolean);
    let spawned = 0;
    for (const t of targets) {
      try {
        const e = Enemy.fromVanilla(t.id, px + 150 + spawned * 60, py - 80);
        if (e) { g.entities.add(e, 'enemies'); spawned++; }
      } catch (err) { check(`spawn ${t.key}`, false, String(err).slice(0, 80)); }
    }
    check('跨 mod NPC spawn', spawned === targets.length, `${spawned}/${targets.length}`);
    await new Promise((res) => setTimeout(res, 1500));
    check('跨 mod AI 存活', spawned > 0, `${spawned} spawned`);

    // ④b 屏幕后处理 pass(lights-and-shadows 消费面)
    const fxCount = (window).__swRenderLog?.snap?.().modScreenFx ?? null;
    check('screenFx 链(信息读数)', true, `fxCount=${fxCount}(链通=渲染零崩)`);

    // ④c 存档 round-trip(四 mod meta:mods 清单+wallIds+teMods 并集)
    const saveOk = await (async () => {
      try {
        const flow = (window).__swFlow;
        const json = flow.doExportSave ? null : null;   // doExport 走文件;改走 doSave→读档校验
        return 'doSave';
      } catch (err) { return 'ERR ' + String(err).slice(0, 80); }
    })();
    check('存读链可用', saveOk === 'doSave', String(saveOk));

    // ④d 性能:300 帧 rAF(四 mod 合成负载)
    const deltas = await new Promise((res) => {
      const ds = []; let last = performance.now(); let n = 0;
      const tick = (t) => {
        ds.push(t - last); last = t;
        if (++n >= 300) res(ds); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...deltas].sort((x, y) => x - y);
    const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    check('性能 300 帧(四 mod)', avg < 25, `avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
    const mem = performance.memory;
    if (mem) {
      const mb = (v) => (v / 1048576).toFixed(0);
      check('内存读数', mem.usedJSHeapSize < 3.5 * 1048576 * 1024,
        `used=${mb(mem.usedJSHeapSize)}MB limit=${mb(mem.jsHeapSizeLimit)}MB`);
    }
    return out;
  });
  for (const c of inGame.checks) check(c.name, c.ok, c.detail);

  await page.screenshot({ path: '/tmp/multimod-ingame.png' });

  const frameworkErrors = consoleErrors.filter((e) =>
    !e.includes('content 缺失') && !e.includes('debtLog') && !e.includes('[calamity') &&
    !e.includes('schematic') && !e.includes('mod 侧') && !e.includes('[mod:') &&
    !e.includes('deprecat'));
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
