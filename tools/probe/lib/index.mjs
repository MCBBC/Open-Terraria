/**
 * IIII236 统一探针框架 —— 汇出面。
 *
 * 用法(场景脚本):
 *   import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
 *   const browser = await launchBrowser({});
 *   const page = await openPage(browser, {});
 *   const boot = await bootstrap(page, process.env.SW_ORIGIN);
 *   const gen  = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
 *   const L = ledger();
 *   L.chk('世界已建', gen.ok);
 *   ...
 *   process.exit(L.exitCode());          // 台账打印+退出码(0/2)
 *
 * 推荐走 CLI(vite 生命周期+看门狗+杀树全包):
 *   node tools/probe.mjs run scripts/_xxx.mjs --seed=05162020 --size=small --vite=auto
 *   node tools/probe.mjs fields        # 常用字段真名速查(IIIII238 ①,防字段名臆造)
 *
 * 坑表(每坑:现象/根因/解法/默认行为)见 docs/methodology/probe-guide.md;
 * 时辰类断言用 freezeClock 夹具(pump 期间钟面不走),分步计时用 L.step(③)。
 */
export * from './env.mjs';
export * from './vite.mjs';
export * from './browser.mjs';
export * from './boot.mjs';
export * from './game.mjs';
export * from './pump.mjs';
export * from './camera.mjs';
export * from './shot.mjs';
export * from './record.mjs';
export * from './world.mjs';
export * from './stats.mjs';
export * from './watchdog.mjs';
export * from './ledger.mjs';
export * from './clock.mjs';
export * from './cheatsheet.mjs';
export * from './presets.mjs';
