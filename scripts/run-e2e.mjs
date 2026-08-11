#!/usr/bin/env node
/**
 * E2E 测试统一入口:构建冻结版本 → vite preview 静态服务 → 跑目标脚本 → 收尾。
 *
 * 为什么存在:E2E 脚本此前直连 dev server(5199),测试期间任何源码改动都会触发
 * HMR 整页重载,废掉 puppeteer 的页面状态/waitForSelector 上下文/__swGame 句柄。
 * preview 是纯静态服务、无文件监听,测试期间随便改代码都不会被打断。
 *
 * 用法:
 *   node scripts/run-e2e.mjs <script.mjs> [args...]
 *   NO_BUILD=1 node scripts/run-e2e.mjs <script.mjs>   # 复用现有 dist,跳过构建
 *   PORT=5299 ...                                       # preview 端口,默认 5299
 *
 * 退出码:透传目标脚本;构建或服务启动失败为 3。
 */
const PORT = Number(process.env.PORT || 5299);
const BASE_URL = `http://localhost:${PORT}`;

const rest = process.argv.slice(2);
if (!rest.length) {
  console.error('usage: node scripts/run-e2e.mjs [--skip-build] <script.mjs> [args...]');
  process.exit(64);
}

const { spawn, spawnSync } = await import('node:child_process');
const skipBuild = process.env.NO_BUILD || rest.includes('--skip-build');
const args = rest.filter((a) => a !== '--skip-build');
const target = args[0];
const ROOT = new URL('..', import.meta.url).pathname;

// ---------- 1. 构建(冻结当前版本) ----------
if (!skipBuild) {
  console.log(`[e2e] 构建 dist/ (${new Date().toLocaleTimeString()})…`);
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) {
    console.error('[e2e] 构建失败');
    process.exit(3);
  }
  console.log(`[e2e] 构建完成,耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ---------- 2. 起 preview ----------
// detached + 进程组 kill:npx 会再 spawn 孙进程 vite,只杀 npx 杀不到 vite,
// 必须杀整个进程组(-pid),否则 preview 残留占端口(实测踩过)。
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: ROOT,
  detached: true,
});
let ready = false;
const readyPromise = new Promise((resolve, reject) => {
  const deadline = Date.now() + 30_000;
  const poll = async () => {
    try {
      const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return resolve();
    } catch {}
    if (Date.now() > deadline) return reject(new Error('preview 30s 未就绪'));
    setTimeout(poll, 500);
  };
  poll();
  preview.on('exit', () => !ready && reject(new Error('preview 进程提前退出')));
});

// ---------- 3. 收尾:无论成败必杀 preview(整个进程组) ----------
const teardown = () => {
  try { process.kill(-preview.pid, 'SIGKILL'); } catch {}
};
process.on('exit', teardown);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

try {
  await readyPromise;
  ready = true;
} catch (e) {
  console.error(`[e2e] ${e.message}`);
  process.exit(3);
}

// ---------- 4. 跑目标脚本(URL 指向 preview) ----------
console.log(`[e2e] ${BASE_URL} → ${target}`);
const child = spawn('node', [target, ...args.slice(1)], {
  stdio: 'inherit',
  env: { ...process.env, URL: BASE_URL },
});
child.on('exit', (code) => process.exit(code ?? 1));
