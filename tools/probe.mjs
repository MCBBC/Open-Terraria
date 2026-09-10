#!/usr/bin/env node
/**
 * IIII236 统一探针框架 —— CLI。
 *
 * 统一探针入口:私有 vite 生命周期(SW_NO_HMR=1 + SW_CACHE 独立 + SW_ORIGIN 贯通,
 * 退出保证杀树)/总看门狗(SIGKILL 兜底)/doctor 自检(端口/Chrome/资产/桥)。
 * 场景脚本本身只管断言,经由 tools/probe/lib/* 获得坑表固化的默认行为
 * (docs/methodology/probe-guide.md「归入 API 默认行为」列)。
 *
 * 用法:
 *   node tools/probe.mjs run <script.mjs> [--seed=<种子|别名>] [--flags=<别名>]
 *        [--size=<small|medium|large|0|1|2>] [--vite=<auto|PORT|off>] [--headed]
 *        [--out=<dir>] [--timeout=<ms>] [--keep-vite] [-- 场景脚本透传参数...]
 *   node tools/probe.mjs doctor [--vite=PORT|auto] [--browser]
 *   node tools/probe.mjs fields [过滤子串]
 *   node tools/probe.mjs help
 *
 * 退出码:0 全绿 / 1 环境失败 / 2 看门狗强杀 / 64 用法错误;其余透传场景自设。
 *
 * 场景脚本环境变量(SW_ORIGIN/SW_PROBE_OUT/SW_SEED/SW_FLAGS/SW_SIZE/SW_HEADED)
 * 由本 CLI 产出;场景也可以不经本 CLI、按老规矩经 run-diag 跑(读 SW_ORIGIN)。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, pickFreePort, resolveSeed, resolveChromePath, sizeDims, httpGet, httpUp, portBusy, outDirDefault } from './probe/lib/env.mjs';
import { startPrivateVite, killTree, lsofListeners } from './probe/lib/vite.mjs';

const GAME_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // tools/ → game/
const DEFAULT_TIMEOUT = 600_000;

const USAGE = `IIIII236 统一探针框架
用法:
  node tools/probe.mjs run <script.mjs> [选项]
    --seed=<种子|别名 zenith|drunk|anniversary|bees>   注入 SW_SEED + ?seed(缺省空=随机)
    --flags=<别名>                                     注入 SW_FLAGS(种子旗别名,同上解析)
    --size=<small|medium|large|0|1|2>                  注入 SW_SIZE(缺省 small)
    --vite=<auto|PORT|off>   auto=5201+ 扫描起私有实例(默认);PORT=复用现成实例;off=直用 SW_ORIGIN
    --headed                 有头 Chrome(默认 headless 'new')
    --out=<dir>              产物目录(缺省 /tmp/probe-out/<脚本名>;注入 SW_PROBE_OUT)
    --timeout=<ms>           总看门狗(缺省 600000;超时 SIGKILL,exit 2)
    --keep-vite              结束不杀私有 vite(调试;默认必杀+验收监听者=0)
  node tools/probe.mjs doctor [--vite=<PORT|off>] [--browser]
    自检:Chrome 路径/puppeteer-core 可解析/端口面/vite 可达/资产(vanilla.json+l10n)/桥
    --browser 再拉真页面:清 IDB+等桥+__swFlow 面+画布计数+SW 管线指纹
  node tools/probe.mjs fields [过滤子串]
    常用字段真名速查(IIIII238 ①):全局哨兵/TileStore/实体/玩家/时钟/Game 方法/键名惯例
    (每条锚定 src 真定义,守卫=tests/probe-framework.test.ts)
  node tools/probe.mjs help

场景脚本契约:
  import { ... } from '${join('tools/probe', 'lib/index.mjs')}';
  只用 tools/probe/lib/* 的助手获得坑表默认行为;exit 码 0=绿/2=断言失败。
  也可不经过本 CLI(老规矩 run-diag + SW_ORIGIN 指私有实例)。

坑表/默认行为/docs: game/docs/methodology/probe-guide.md`;

// ---------- help ----------
if (process.argv[2] === 'help' || process.argv[2] === '--help' || process.argv[2] === '-h') {
  console.log(USAGE);
  process.exit(0);
}

// ---------- 子进程模式:导入场景脚本 ----------
if (process.argv[2] === '--_child') {
  const target = process.argv[3];
  const passthrough = process.argv.slice(4);
  const { closeAllBrowsers } = await import('./probe/lib/browser.mjs');
  const killAndExit = (sig) => {
    // 探针被外部信号打断:先收 browser(防 headless Chrome 孤儿——曾 66 进程级泄漏),
    // 800ms 内不退就硬退(TERM 对忙循环无效)。
    console.error(`[probe] 收到 ${sig},收口 browser…`);
    setTimeout(() => process.exit(130), 800).unref?.();
    closeAllBrowsers().finally(() => process.exit(130));
  };
  process.on('SIGTERM', () => killAndExit('SIGTERM'));
  process.on('SIGINT', () => killAndExit('SIGINT'));
  try {
    process.argv = [process.argv[0], target, ...passthrough];
    await import(pathToFileURL(resolve(process.cwd(), target)).href);
  } catch (e) {
    console.error('[probe] 场景异常:', e);
    process.exit(1);
  }
  // 主体完成:给 stdout 冲刷 0.5s 后强退(run-diag 同款,兜残留活句柄)。
  setTimeout(() => process.exit(0), 500).unref?.();
  // 事件循环空转兜底:10s 后仍未退(残留 setInterval)也强退。
  setTimeout(() => process.exit(0), 10_000).unref?.();
} else {
  await main();
}

async function main() {
  const argvAll = process.argv.slice(2);
  const sepIdx = argvAll.indexOf('--');
  const cliArgv = sepIdx > 0 ? argvAll.slice(0, sepIdx) : argvAll;
  const passthrough = sepIdx > 0 ? argvAll.slice(sepIdx + 1) : [];
  const [cmd] = cliArgv;
  const { opts, positionals, unknown } = parseArgs(cliArgv.slice(1));

  if (cmd === 'doctor') return doctor(opts);
  if (cmd === 'fields') {
    const { cheatsheetText } = await import('./probe/lib/cheatsheet.mjs');
    console.log(cheatsheetText(positionals.join(' ')));   // positionals 已不含 cmd
    process.exit(0);
  }
  if (cmd !== 'run' || !positionals.length) {
    console.error(USAGE);
    process.exit(64);
  }

  // ---------- run ----------
  const script = positionals[0];
  const scriptPath = isAbsolute(script) ? script : resolve(process.cwd(), script);
  if (!existsSync(scriptPath)) {
    console.error(`[probe] 场景脚本不存在: ${scriptPath}`);
    process.exit(64);
  }
  if (unknown.length) console.log(`[probe] 未知参数(透传给场景自取): ${unknown.join(',')}`);

  const timeoutMs = Number(opts.timeout ?? DEFAULT_TIMEOUT);
  const seed = resolveSeed(opts.seed ?? '');
  const flags = opts.flags ? resolveSeed(opts.flags) : '';
  const size = String(opts.size ?? 'small');
  const outDir = opts.out ?? outDirDefault(scriptPath);
  mkdirSync(outDir, { recursive: true });

  // ---- vite 解析 ----
  let vite = null;            // 我们起的私有实例(须杀)
  let origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
  const viteOpt = String(opts.vite ?? 'auto');
  try {
    if (viteOpt === 'off') {
      console.log(`[probe] vite=off → 直用 origin ${origin}(共享实例只读约定)`);
      if (!(await httpUp(origin, 4000))) {
        console.error(`[probe] origin ${origin} 不可达——先起共享实例或用 --vite=auto`);
        process.exit(1);
      }
    } else if (viteOpt === 'auto') {
      const port = await pickFreePort();
      vite = await startPrivateVite({ port });
      origin = vite.origin;
      console.log(`[probe] 私有 vite @ ${origin}(日志 ${vite.logPath};结束杀树)`);
    } else {
      const port = Number(viteOpt);
      if (!Number.isFinite(port)) { console.error(`[probe] --vite 取值非法: ${viteOpt}`); process.exit(64); }
      origin = `http://localhost:${port}`;
      if (!(await httpUp(origin, 4000))) {
        console.error(`[probe] 指定实例 ${origin} 不可达(先起或改 --vite=auto)`);
        process.exit(1);
      }
      console.log(`[probe] 复用现成实例 ${origin}(不杀)`);
    }
  } catch (e) {
    console.error('[probe] vite 起失败:', e?.message ?? e);
    if (vite) await vite.kill();
    process.exit(1);
  }

  // ---- 子进程环境 ----
  const childEnv = {
    ...process.env,
    SW_ORIGIN: origin,
    SW_PROBE_OUT: outDir,
    SW_SEED: seed,
    SW_FLAGS: flags,
    SW_SIZE: size,
    SW_HEADED: opts.headed ? '1' : '0',
  };
  if (seed) console.log(`[probe] seed=${seed} size=${size}(${sizeDims(size).join('x')}) out=${outDir}`);

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--_child', scriptPath, ...passthrough], {
    cwd: GAME_ROOT,
    stdio: 'inherit',
    env: childEnv,
  });
  const runT0 = Date.now();   // ③ 总耗时行(场景退出行附带)

  let done = false;
  // 收口唯一入口:done 旗只在这里置位(曾在 child 'exit' 句柄里先置 done 再调
  // shutdown → shutdown 头部 guard 直接 return → vite 树泄漏+父进程悬挂,实测翻车)。
  const shutdown = async (why, exitCode) => {
    if (done) return;
    done = true;
    // 收口硬兜底:杀树若卡死(lsof 异常路径),15s 后强退——收尾路径绝不允许悬挂
    const hard = setTimeout(() => { console.error('[probe] 收口卡死,硬退'); process.exit(exitCode); }, 15_000);
    hard.unref?.();
    if (vite) {
      const r = await vite.kill();
      if (r.listenersLeft > 0) console.error(`[probe] 警告:端口 ${vite.port} 仍有 ${r.listenersLeft} 个监听者(lsof)——手动 lsof -ti tcp:${vite.port} 清理`);
      else console.log(`[probe] vite 已收口(监听者=0)`);
    }
    process.exit(exitCode);
  };
  process.on('SIGTERM', () => { try { child.kill('SIGKILL'); } catch { /* 已死 */ } void shutdown('SIGTERM', 130); });
  process.on('SIGINT', () => { try { child.kill('SIGKILL'); } catch { /* 已死 */ } void shutdown('SIGINT', 130); });
  process.on('uncaughtException', (e) => {
    console.error('[probe] CLI 未捕获异常:', e);
    try { child.kill('SIGKILL'); } catch { /* 已死 */ }
    void shutdown('uncaught', 1);
  });

  const watchdog = setTimeout(() => {
    console.error(`[probe] 总看门狗超时 ${timeoutMs}ms → SIGKILL 场景进程(exit 2)`);
    try { child.kill('SIGKILL'); } catch { /* 已死 */ }
    void shutdown('watchdog', 2);
  }, timeoutMs);

  child.on('exit', (code, signal) => {
    clearTimeout(watchdog);
    const exitCode = signal ? 1 : (code ?? 1);
    const total = ((Date.now() - runT0) / 1000).toFixed(1);
    console.log(`[probe] 场景退出 code=${code} signal=${signal ?? '-'} 总耗时=${total}s → ${exitCode === 0 ? 'GREEN' : 'FAIL'}`);
    void shutdown('child-exit', exitCode);
  });
  child.on('error', (e) => {
    console.error('[probe] 子进程启动失败:', e);
    clearTimeout(watchdog);
    void shutdown('spawn-error', 1);
  });
}

// ---------- doctor ----------
async function doctor(opts) {
  const checks = [];
  const add = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };

  // ① Chrome
  const chrome = resolveChromePath();
  add('chrome', !!chrome, chrome ?? '设 SW_CHROME');

  // ② puppeteer-core 可解析
  let pup = false;
  try { await import('puppeteer-core'); pup = true; } catch { pup = false; }
  add('puppeteer-core', pup, pup ? '' : 'game/ 上层 node_modules 缺 puppeteer-core');

  // ③ 端口面
  const viteOpt = String(opts.vite ?? 'auto');
  let origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
  if (viteOpt !== 'auto' && viteOpt !== 'off') origin = `http://localhost:${Number(viteOpt)}`;
  const busy5199 = await portBusy(5199);
  add('port:5199(共享)', true, busy5199 ? '共享实例在跑(只读约定;禁 kill)' : '未起(探针请用 --vite=auto 私有实例)');
  const freePort = await pickFreePort();
  add('port:私有空闲', true, `首个空闲=5201 起 → ${freePort}`);
  const listeners = lsofListeners(freePort);
  add('port:竞态复检', listeners.length === 0, listeners.length ? `被占 pid=${listeners.join(',')}` : `:${freePort} 确认空闲`);

  // ④ vite 可达 + 资产
  if (viteOpt !== 'auto') {
    const up = await httpUp(origin, 4000);
    add('vite:可达', up, origin);
    if (up) {
      const vanilla = await httpGet(`${origin}/sprites/vanilla.json`);
      const okJson = vanilla.status === 200 && vanilla.text.trimStart().startsWith('{');
      add('assets:vanilla.json', okJson, okJson ? `${vanilla.bytes}B` : `status=${vanilla.status}(SW 管线 off 的指纹=vanilla 全缺,见 memory sw-off-failopen)`);
      const l10n = await httpGet(`${origin}/l10n/zh-Hans.json`);
      add('assets:l10n', l10n.status === 200, `${l10n.bytes}B`);
    }
  } else {
    add('vite:可达', true, 'auto 模式由 run 起私有实例后自证');
  }

  let failures = checks.filter((c) => !c.ok).length;
  // ⑤ 可选真浏览器深检
  if (opts.browser) {
    try {
      if (viteOpt === 'auto') {
        const port = await pickFreePort(freePort + 1);
        const v = await startPrivateVite({ port });
        origin = v.origin;
        try { failures += await browserProbe({ origin, add }); } finally { await v.kill(); }
      } else {
        failures += await browserProbe({ origin, add });
      }
    } catch (e) {
      add('doctor:browser', false, String(e?.message ?? e));
      failures++;
    }
  }

  const bad = checks.filter((c) => !c.ok);
  console.log(bad.length ? `\nDOCTOR: ${bad.length} FAIL` : '\nDOCTOR: ALL OK');
  writeFileSync('/tmp/probe-doctor.json', JSON.stringify(checks, null, 2));
  process.exit(bad.length ? 1 : 0);

  async function browserProbe({ origin, add }) {
    const { launchBrowser, openPage } = await import('./probe/lib/browser.mjs');
    const { bootstrap } = await import('./probe/lib/boot.mjs');
    const { gameCanvasInfo } = await import('./probe/lib/camera.mjs');
    const browser = await launchBrowser({});
    try {
      const page = await openPage(browser, { errors: [] });
      const boot = await bootstrap(page, origin, { timeout: 60_000 });
      add('browser:bootstrap', boot.ok, boot.why ?? '');
      if (boot.ok) {
        const flow = await page.evaluate(() => Object.keys(window.__swFlow ?? {}));
        add('browser:__swFlow', flow.length > 3, flow.join(',').slice(0, 120));
        const cv = await gameCanvasInfo(page);
        add('browser:canvas', !!cv, cv ? `${cv.w}x${cv.h} dpr=${cv.dpr}` : '无画布');
        const idb = await page.evaluate(async () => {
          try { return (await indexedDB.databases()).map((d) => d.name); } catch { return ['<blocked>']; }
        });
        add('browser:IDB', Array.isArray(idb), `dbs=${idb.join(',') || '(空=干净)'}`);
      }
      await browser.close();
      return 0;
    } catch (e) {
      add('browser:probe', false, String(e?.message ?? e));
      try { await browser.close(); } catch { /* 已死 */ }
      return 1;
    }
  }
}
