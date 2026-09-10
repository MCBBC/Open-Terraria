/**
 * IIII236 统一探针框架 —— 私有 vite 实例生命周期。
 *
 * 坑史锚:
 *  - memory: vite-probe-stale-transform-cache —— nohup npx vite 的 PID 是 npx 壳,
 *    真 server 是子进程;kill 壳后孤儿仍占端口,"同命令不同结果"。杀法=
 *    `lsof -ti :PORT -sTCP:LISTEN | xargs kill`(监听者本体)。
 *  - memory: lavaslope 五坑#5 —— run-diag SIGKILL 进程组会带走 nohup vite;
 *    超时后先 nc -z 查端口再续跑。
 *  - memory: diag-script-orphan-prevention —— spawn 起 server 的探针必须
 *    detached + 进程组击杀,且所有退出路径先杀 server。
 *  - CLAUDE.md 并行会话 vite 约定 —— SW_NO_HMR=1 / SW_CACHE 独立 / 禁 kill 5199。
 *
 * killTree 三段式:进程组 TERM → lsof 监听者 TERM → lsof 监听者 KILL,
 * 最后以 lsof 计数=0 验收;任何一步异常都吞掉继续下一步(清理路径不许抛)。
 */
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpUp, pickFreePort } from './env.mjs';

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'); // tools/probe/lib → game/
const VITE_JS = join(GAME_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

/** 端口上的 LISTEN 进程 pid 列表(lsof 无输出/失败=空)。 */
export function lsofListeners(port) {
  try {
    const { execFileSync } = childProcessRef();
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}
function childProcessRef() { return { execFileSync: (globalThis.__probeExecFileSync ?? _execFileSync) }; }
import { execFileSync as _execFileSync } from 'node:child_process';

/**
 * 起私有静默实例。返回 { port, origin, child, logPath, kill }。
 * env 贯通: SW_PORT(端口)/SW_NO_HMR=1(不发 reload 推送;watcher 仍新鲜,
 * 探针每次 goto 仍加载最新源码)/SW_CACHE=/tmp/sw-probe-<port>(独立 optimizeDeps
 * 缓存,防多实例并发竞争)。
 */
export async function startPrivateVite({ port, cwd = GAME_ROOT, waitMs = 120_000 } = {}) {
  if (!port) port = await pickFreePort();
  const origin = `http://localhost:${port}`;
  if (await httpUp(origin)) {
    // 端口是我们刚扫出的空闲口,走到这说明撞上竞态窗口——失败让上层重扫,
    // 不复用来历不明的实例(stale transform 缓存坑:连旧实例=改了没效果)。
    throw new Error(`[probe] 端口 ${port} 竞态被占——重扫端口`);
  }
  if (!existsSync(VITE_JS)) throw new Error(`[probe] 找不到 vite.js: ${VITE_JS}`);
  const logPath = `/tmp/sw-probe-${port}.log`;
  const out = openSync(logPath, 'a');
  const child = spawn(process.execPath, [VITE_JS], {
    cwd,
    detached: true,                       // 独立进程组:整组击杀用
    stdio: ['ignore', out, out],
    env: { ...process.env, SW_PORT: String(port), SW_NO_HMR: '1', SW_CACHE: `/tmp/sw-probe-${port}` },
  });
  child.unref?.();   // 不让 vite 子句柄吊住 CLI 父进程的事件循环(收尾由 killTree 显式负责)
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(`[probe] vite 提前退出(code=${child.exitCode} sig=${child.signalCode})——日志 ${logPath} 尾部:\n${tail(logPath)}`);
    }
    if (await httpUp(origin, 1500)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await httpUp(origin, 1500))) {
    await killTree(port, child);
    throw new Error(`[probe] vite ${waitMs}ms 未就绪——日志 ${logPath}\n${tail(logPath, 800)}`);
  }
  let killed = false;
  return {
    port, origin, child, logPath,
    /** 退出保证杀树(信号兜底 SIGKILL)。返回 { listenersLeft } 供 CLI 验收。 */
    async kill() {
      if (killed) return { listenersLeft: lsofListeners(port).length };
      killed = true;
      return killTree(port, child);
    },
  };
}

function tail(path, n = 600) {
  try {
    const s = readFileSync(path, 'utf8');
    return s.length > n ? s.slice(-n) : s;
  } catch { return ''; }
}

/**
 * 杀树三段式(IIIRS216 lsof-kill 判例):
 *  ① 进程组 TERM(negated pid)——覆盖 vite 的子 worker;
 *  ② lsof 监听者 TERM——壳杀掉后真 server 孤儿的兜底;
 *  ③ 残留 KILL(SIGKILL 兜底,TERM 对忙循环无效)。
 * 返回 { steps, listenersLeft };listenersLeft>0 = 清理失败,调用方必须报出来。
 */
export async function killTree(port, child) {
  const steps = [];
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); steps.push('group:TERM'); } catch { /* 组已散 */ }
  }
  try { child?.kill('SIGTERM'); steps.push('child:TERM'); } catch { /* 已死 */ }
  await sleep(400);
  for (const p of lsofListeners(port)) { try { process.kill(p, 'SIGTERM'); steps.push(`lsof:${p}:TERM`); } catch { /* 已死 */ } }
  await sleep(1200);
  for (const p of lsofListeners(port)) { try { process.kill(p, 'SIGKILL'); steps.push(`lsof:${p}:KILL`); } catch { /* 已死 */ } }
  await sleep(300);
  return { steps, listenersLeft: lsofListeners(port).length };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
