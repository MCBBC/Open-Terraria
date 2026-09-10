/**
 * IIII236 统一探针框架 —— 场景预设(worldgen/gameplay/ui/audio 四模板)。
 *
 * 每个预设=一条完整可跑的最小流程骨架,场景脚本按需覆写钩子;坑表里的默认
 * 行为全部内置(见 docs/methodology/probe-guide.md「归入 API」列)。
 */
import { bootstrap } from './boot.mjs';
import { openPage, launchBrowser, front } from './browser.mjs';
import { createGame, waitForGame } from './game.mjs';
import { Ledger } from './ledger.mjs';

/**
 * worldgen 模板:逐种子建世界 → 世界构造完 → 钩子内做普查/指纹/截图。
 * hook: async each({ page, ledger, seed, size, runIndex })
 */
export async function worldgenScenario({
  seeds = [], size = 'small', mode = 'direct', outDir = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/worldgen',
  each, headed = false, timeouts = {},
} = {}) {
  const ledger = new Ledger();
  const browser = await launchBrowser({ headed });
  try {
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const page = await openPage(browser, { errors: ledger.fails });
      page.__probeOrigin = process.env.SW_ORIGIN;
      const boot = await bootstrap(page, process.env.SW_ORIGIN, timeouts.boot ?? {});
      if (!boot.ok) { ledger.chk(`boot(${seed})`, false, boot.why); continue; }
      const gen = await createGame(page, { mode, seed, size, timeout: timeouts.game ?? 600_000, log: (m) => ledger.say(`[${seed}] ${m}`) });
      if (!gen.ok) { ledger.chk(`createGame(${seed})`, false, gen.why); continue; }
      ledger.chk(`createGame(${seed})`, true, `${gen.w}x${gen.h}`);
      if (each) await each({ page, ledger, seed, size, runIndex: i, outDir });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return ledger;
}

/**
 * gameplay 模板:建世界 → 庇护所 → 钩子内泵/断言(默认上帝模式+清敌纪律)。
 * hook: async run({ page, ledger, g }) —— g 由钩子自行 page.evaluate 取。
 */
export async function gameplayScenario({
  seed = '', size = 'small', mode = 'direct', shelter = true, god = true, pinRandom = null,
  outDir = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/gameplay',
  run, headed = false, timeouts = {},
} = {}) {
  const ledger = new Ledger();
  const browser = await launchBrowser({ headed });
  try {
    const page = await openPage(browser, { errors: ledger.fails });
    page.__probeOrigin = process.env.SW_ORIGIN;
    const boot = await bootstrap(page, process.env.SW_ORIGIN, timeouts.boot ?? {});
    ledger.chk('bootstrap', boot.ok, boot.why ?? '');
    if (boot.ok) {
      const gen = await createGame(page, { mode, seed, size, pinRandom, timeout: timeouts.game ?? 600_000 });
      ledger.chk('createGame', gen.ok, gen.why ?? `${gen.w}x${gen.h}`);
      if (gen.ok) {
        if (god) { const { godMode } = await import('./game.mjs'); await godMode(page, true); }
        if (shelter) {
          const { buildShelter } = await import('./world.mjs');
          const s = await buildShelter(page, {});
          ledger.say(`shelter @ (${s.sx},${s.sy})`);
        }
        if (run) await run({ page, ledger, outDir });
      }
    }
    return ledger;
  } catch (e) {
    ledger.chk('framework', false, String(e?.message ?? e));
    return ledger;
  } finally {
    await browser.close();   // 收口后 page/browser 失效——钩子内用,勿外带
  }
}

/**
 * ui 模板:不建世界(或可选),对菜单/VUI 面板做 DOM 文本+截图断言。
 * hook: async run({ page, ledger, outDir })
 * ★UI 测试要看欢迎弹窗:本模板 keepDialogs=true(createGame 不代关);要真弹出来
 * 还得 bootstrap 传 { welcomeAck:false } 不预置 ack(坑表 §C11)。
 */
export async function uiScenario({
  buildGame = false, seed = '', size = 'small', headed = false, outDir = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/ui',
  run, timeouts = {},
} = {}) {
  const ledger = new Ledger();
  const browser = await launchBrowser({ headed });
  let page = null;
  try {
    page = await openPage(browser, { errors: ledger.fails });
    page.__probeOrigin = process.env.SW_ORIGIN;
    const boot = await bootstrap(page, process.env.SW_ORIGIN, timeouts.boot ?? {});
    ledger.chk('bootstrap', boot.ok, boot.why ?? '');
    if (boot.ok && buildGame) {
      const gen = await createGame(page, { mode: 'direct', seed, size, timeout: timeouts.game ?? 600_000, keepDialogs: true });
      ledger.chk('createGame', gen.ok, gen.why ?? '');
    }
    if (boot.ok && run) await run({ page, ledger, outDir });
  } catch (e) {
    ledger.chk('framework', false, String(e?.message ?? e));
  } finally {
    await browser.close();
  }
  return ledger;
}

/**
 * audio 模板:sfx 间谍(导航前)+建世界+录制窗包住钩子,收口吐 audioTail。
 * hook: async run({ page, ledger, outDir }) —— 窗内触发被测音效。
 */
export async function audioScenario({
  seed = '', size = 'small', mode = 'direct', headed = false, outDir = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/audio',
  run, timeouts = {},
} = {}) {
  const { installSfxSpy, audioRecordStart, audioRecordStopExport, audioTail } = await import('./record.mjs');
  const ledger = new Ledger();
  const browser = await launchBrowser({ headed });
  let page = null;
  try {
    page = await openPage(browser, { errors: ledger.fails });
    page.__probeOrigin = process.env.SW_ORIGIN;
    installSfxSpy(page);
    const boot = await bootstrap(page, process.env.SW_ORIGIN, timeouts.boot ?? {});
    ledger.chk('bootstrap', boot.ok, boot.why ?? '');
    if (boot.ok) {
      const gen = await createGame(page, { mode, seed, size, timeout: timeouts.game ?? 600_000 });
      ledger.chk('createGame', gen.ok, gen.why ?? '');
      if (gen.ok) {
        await audioRecordStart(page);
        if (run) await run({ page, ledger, outDir });
        await front(page);
        const dump = await audioRecordStopExport(page);
        const tail = await audioTail(page, {});
        ledger.say(`audioTail sfx=${tail?.sfx?.length ?? 'n/a'} bgm=${tail?.bgm?.length ?? 'n/a'}`);
        if (outDir) {
          const { saveJson } = await import('./shot.mjs');
          saveJson(`${outDir}/audio-export.json`, { dump, tail });
        }
      }
    }
  } catch (e) {
    ledger.chk('framework', false, String(e?.message ?? e));
  } finally {
    await browser.close();
  }
  return ledger;
}

export { waitForGame };
