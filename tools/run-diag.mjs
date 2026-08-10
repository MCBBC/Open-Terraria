#!/usr/bin/env node
/**
 * 一次性诊断脚本的统一 runner(防孤儿进程)。
 *
 * 背景:2026-08-10 发现 7 个 `vite-node tools/_diag-gen.mjs` 孤儿进程,
 * 每个占满 1 核空转 4 小时(脚本 import 链带起不可退出的活句柄,TERM 信号都无法处理)。
 * 约定:以后所有 _diag-*.mjs 一律经本 runner 运行,不再直接 npm exec vite-node。
 *
 * 用法:
 *   node tools/run-diag.mjs [--timeout=ms] <script.mjs> [传给脚本的参数...]
 *
 * 双层架构:
 *   - 子进程(--_child,内部):导入目标脚本;导入完成 0.5s 后强制 exit(0),
 *     不依赖事件循环自然排空——兜住"脚本主体完成但残留 interval/server 等活句柄"(本次事故形态);
 *   - 父进程(默认):只等子进程退出 + 看门狗;子进程超时(默认 120s)未退 → SIGKILL,exit 2。
 *     父进程事件循环始终空闲,因此子进程无论是同步死循环、永不 resolve 的 await
 *     还是任何未知卡死,都必然在 timeout 内被强杀。
 *
 * 退出码:0 正常 / 1 脚本异常或被信号终止 / 2 超时强杀 / 64 用法错误,其余透传脚本自设退出码。
 */
const DEFAULT_TIMEOUT_MS = 120_000;
const FLUSH_MS = 500;

const argv = process.argv.slice(2);

// ---------- 子进程模式:导入目标脚本 ----------
if (argv[0] === '--_child') {
  const target = argv[1];
  try {
    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    await import(pathToFileURL(path.resolve(process.cwd(), target)).href);
  } catch (e) {
    console.error('[run-diag] 脚本异常:', e);
    process.exit(1);
  }
  // 主体完成:给 stdout 冲刷留 0.5s,无视残留活句柄强制正常退出。
  setTimeout(() => process.exit(0), FLUSH_MS).unref?.();
} else {
  // ---------- 父进程模式:spawn 子进程 + 看门狗 ----------
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const rest = [];
  for (const a of argv) {
    if (a.startsWith('--timeout=')) {
      const v = Number(a.slice('--timeout='.length));
      if (Number.isFinite(v) && v > 0) timeoutMs = v;
    } else {
      rest.push(a);
    }
  }
  if (!rest.length) {
    console.error('usage: node tools/run-diag.mjs [--timeout=ms] <script.mjs> [args...]');
    process.exit(64);
  }

  const { spawn } = await import('node:child_process');
  const path = await import('node:path');
  const target = path.resolve(process.cwd(), rest[0]);

  const child = spawn(process.execPath, [import.meta.url, '--_child', target, ...rest.slice(1)], {
    stdio: 'inherit',
  });

  let done = false;
  const watchdog = setTimeout(() => {
    if (done) return;
    done = true;
    console.error(`[run-diag] 超时 ${timeoutMs}ms,SIGKILL 子进程 (exit 2)`);
    child.kill('SIGKILL');
    process.exit(2);
  }, timeoutMs);

  child.on('exit', (code, signal) => {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    if (signal) {
      console.error(`[run-diag] 子进程被信号 ${signal} 终止 (exit 1)`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });

  child.on('error', (e) => {
    console.error('[run-diag] 启动失败:', e);
    process.exit(1);
  });
}
