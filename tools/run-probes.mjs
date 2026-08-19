// 探针一键 runner(自动检查四件套之 D):
//   node tools/run-probes.mjs [--list] [--only=a,b] [--timeout=ms] [--boot-server]
// 收编 scripts/_*-probe.mjs(输出协议统一:PASS/FAIL 行 + 尾行 + 非零退出码,零改动);
// 每探针 spawn tools/run-diag.mjs(复用其双层看门狗,防孤儿进程)。
//
// --boot-server:自动起私有实例(端口 5300-5399 探测空闲),遵守 CLAUDE.md 并行会话
// 约定——SW_NO_HMR=1/SW_CACHE 独立,绝不 kill 共享 5199。手动用法:
//   SW_PORT=5207 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5207 npx vite(后台)
//   SW_ORIGIN=http://localhost:5207 node tools/run-probes.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROBES = [
  { name: 'mining', file: 'scripts/_mining-probe.mjs', timeoutMs: 240_000 },
  { name: 'boulder', file: 'scripts/_boulder-probe.mjs', timeoutMs: 300_000 },
  { name: 'sunfury', file: 'scripts/_sunfury-probe.mjs', timeoutMs: 240_000 },
  { name: 'weapons-family', file: 'scripts/_weapons-family-probe.mjs', timeoutMs: 240_000 },
  { name: 'shortsword', file: 'scripts/_shortsword-probe.mjs', timeoutMs: 240_000 },
  { name: 'usereach', file: 'scripts/_usereach-probe.mjs', timeoutMs: 360_000 }, // 6 族×120帧+落地等待,负载下偶超 240s
  { name: 'invariants', file: 'scripts/_invariants-probe.mjs', timeoutMs: 300_000 },
  { name: 'pause-export', file: 'scripts/_pause-export-probe.mjs', timeoutMs: 240_000 },
  { name: 'angler', file: 'scripts/_angler-probe.mjs', timeoutMs: 300_000 },
  { name: 'mounts', file: 'scripts/_mounts-probe.mjs', timeoutMs: 300_000 },
  { name: 'bunny-ai', file: 'scripts/_bunny-ai-probe.mjs', timeoutMs: 420_000 }, // 6000t 观测窗+240t 行走采样
  { name: 'cutbait', file: 'scripts/_cutbait-probe.mjs', timeoutMs: 420_000 },   // 镐破坏装饰组→蚯蚓族出生/姿势/cap
  { name: 'l10n-subst', file: 'scripts/_l10n-subst-probe.mjs', timeoutMs: 240_000 }, // {InputTrigger_*} 全局替换(蠕虫罐头 171 条 tooltip)
  { name: 'f6panel', file: 'scripts/_f6panel-probe.mjs', timeoutMs: 240_000 },   // F6 面板 boss 可见性(置顶+中文搜索)
  { name: 'golem-layer', file: 'scripts/_golem-layer-probe.mjs', timeoutMs: 360_000 }, // 石巨人部件层序(master 锚)
];

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i < 0) return undefined;
  const v = argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  return v;
};

if (argv.includes('--list')) {
  for (const p of PROBES) console.log(`${p.name.padEnd(16)} ${existsSync(join(ROOT, p.file)) ? '' : '(缺文件!)'}${p.file}`);
  process.exit(0);
}

const only = arg('--only');
let probes = PROBES.filter((p) => existsSync(join(ROOT, p.file)));
if (only) probes = probes.filter((p) => only.split(',').includes(p.name));
const defaultTimeout = Number(arg('--timeout') ?? 0);

// ---- 私有实例自管(--boot-server)----
let serverProc = null;
let serverPort = 0;
const portFree = (port) => new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(false));
  s.once('listening', () => { s.close(); res(true); });
  s.listen(port, '127.0.0.1');
});
async function bootServer() {
  for (let port = 5300; port < 5400; port++) {
    if (!await portFree(port)) continue;
    serverPort = port;
    break;
  }
  if (!serverPort) { console.error('run-probes: 5300-5399 无空闲端口'); process.exit(2); }
  serverProc = spawn('npx', ['vite'], {
    cwd: ROOT, detached: true, stdio: 'ignore',
    env: { ...process.env, SW_PORT: String(serverPort), SW_NO_HMR: '1', SW_CACHE: `/tmp/sw-vite-${serverPort}-${process.pid}` },
  });
  serverProc.unref();
  const origin = `http://localhost:${serverPort}`;
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    const ok = await fetch(`${origin}/`, {}).then((r) => r.ok).catch(() => false);
    if (ok) return origin;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`run-probes: 私有实例 ${origin} 60s 未就绪`);
  process.exit(2);
}
async function killServer() {
  if (!serverProc) return;
  try { process.kill(-serverProc.pid, 'SIGTERM'); } catch { /* 已退 */ }
  await new Promise((r) => setTimeout(r, 1000));
  try { process.kill(-serverProc.pid, 'SIGKILL'); } catch { /* 已退 */ }
}

// ---- 守卫:SW_ORIGIN 缺省/指向共享 5199 → 醒目警告 ----
if (!process.env.SW_ORIGIN && !argv.includes('--boot-server')) {
  console.warn('⚠ SW_ORIGIN 未设置——将回退 5199(共享 HMR 实例)!');
  console.warn('  并行会话约定:请用 --boot-server 或自起私有实例(SW_PORT=52xx SW_NO_HMR=1)。');
  console.warn('  详见 vite.config.ts:96-105 注释。');
}
if (process.env.SW_ORIGIN?.includes('5199')) {
  console.warn('⚠ SW_ORIGIN 指向共享 5199——探针可能被其他会话 HMR 重载打断!');
}

// ---- 执行 ----
const runOne = (p) => new Promise((resolve) => {
  const env = { ...process.env };
  if (serverPort) env.SW_ORIGIN = `http://localhost:${serverPort}`;
  const r = spawnSync('node', [
    'tools/run-diag.mjs', `--timeout=${p.timeoutMs + (defaultTimeout || 0)}`, p.file,
  ], { cwd: ROOT, env, encoding: 'utf8', timeout: p.timeoutMs + 60_000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const passLines = (out.match(/^PASS: /gm) ?? []).length;
  const failLines = (out.match(/^FAIL: /gm) ?? []).length;
  const tail = out.trim().split('\n').filter((l) => /pass \/ \d+ fail/.test(l)).pop();
  const timedOut = r.status === 2 && /超时/.test(out);
  resolve({ name: p.name, pass: passLines, fail: failLines, tail, timedOut, status: r.status ?? -1 });
});

const origin0 = process.env.SW_ORIGIN;
let results = [];
if (argv.includes('--boot-server')) {
  const o = await bootServer();
  console.log(`run-probes: 私有实例 ${o} 就绪`);
}
try {
  for (const p of probes) {
    process.stdout.write(`▶ ${p.name} … `);
    const r = await runOne(p);
    results.push(r);
    console.log(r.timedOut ? 'TIMEOUT' : r.fail > 0 ? `FAIL(${r.fail})` : r.status !== 0 ? `ERROR(exit=${r.status})` : `PASS(${r.pass})`);
  }
} finally {
  if (serverProc) await killServer();
}
void origin0;

// ---- 汇总 ----
console.log('\n===== 探针汇总 =====');
for (const r of [...results].sort((a, b) => b.fail - a.fail || b.timedOut - a.timedOut)) {
  console.log(`${(r.timedOut ? '⏱' : r.fail > 0 || r.status !== 0 ? '✗' : '✓').padEnd(2)} ${r.name.padEnd(16)} ${r.tail ?? `exit=${r.status}`}`);
}
const bad = results.filter((r) => r.fail > 0 || r.timedOut || r.status !== 0).length;
console.log(bad ? `\n${bad} 个探针未过` : '\n全部通过 ✓');
process.exit(bad ? 1 : 0);
