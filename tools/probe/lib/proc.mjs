/**
 * IIII245 统一探针框架 —— 进程树收尾域(J 域两坑根治)。
 *
 * 坑史锚(IIIII245 收编,今晨实证):
 *  - J5 vitest 池孤儿 —— 刃跑全量 vitest 后池 worker+父进程常驻(处决过 18.5h
 *    双 worker)。根因:vitest 父/worker 与发起方无信号联动,TERM 对忙循环无效,
 *    而收尾的 vite 三段式只管「端口面」(lsof),看不见 vitest/python 这类
 *    不监听端口的孙代。解法=收尾按 ppid 树【递归收集全部后代】TERM→KILL 两段
 *    (killDescendants);vite 三段式并存(killTree 仍负责端口验收)。
 *  - J6 heredoc python 孤儿 —— `python3 - <<EOF` 内联脚本异常/长跑不随刃退出
 *    (97% CPU×5h 实证)。根因=内联脚本与发起 shell 无生命周期联动,刃退出只断
 *    stdin 不发信号。解法=一切场景脚本里的 shell 子命令走 runWithTimeout
 *    (detached 进程组+硬超时 TERM→KILL 组杀),或命令自带超时。
 *  - ★脱链盲区(坑表钉死):若中间父进程先死,孙代被收养到 pid 1,ppid 树断链,
 *    killDescendants 不可见——长跑 shell 子命令【必须】走 runWithTimeout
 *    (它在命令自己的进程组里收口,不依赖发起方存活)。
 *
 * POSIX 限定:进程组击杀用 `process.kill(-pid)`(同 killTree 判例);Windows 无
 * 负 pid 语义,本仓探针域均为 macOS/Linux,不做适配。
 */
import { execFileSync, spawn } from 'node:child_process';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** ps 全表 pid→ppid。失败=空表(清理路径不许抛,调用方按"无后代"收敛)。 */
export function psTable() {
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' });
    const map = new Map();
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (m) map.set(Number(m[1]), Number(m[2]));
    }
    return map;
  } catch {
    return new Map();
  }
}

/** 僵尸集合(Z 态:已死未收割,kill(pid,0) 仍真——按活体算会报假残留)。 */
export function zombiePids() {
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,stat='], { encoding: 'utf8' });
    const set = new Set();
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\S+)$/);
      if (m && m[2].startsWith('Z')) set.add(Number(m[1]));
    }
    return set;
  } catch {
    return new Set();
  }
}

/**
 * rootPid 的全部后代(不含 root 自身;BFS 沿 ppid 树)。
 * @param {number} rootPid        树根(常用 process.pid=只杀自己生的)
 * @param {Map<number,number>} [table]  注入假表=纯函数测试(IIIII245 自测用)
 */
export function descendantsOf(rootPid, table = psTable()) {
  const kids = new Map();
  for (const [pid, ppid] of table) {
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(pid);
  }
  const out = [];
  const queue = [rootPid];
  while (queue.length) {
    const p = queue.shift();
    for (const c of kids.get(p) ?? []) { out.push(c); queue.push(c); }
  }
  return out;
}

/**
 * 全后代树杀(J5):TERM → 宽限 → 幸存者 KILL 两段;僵尸不算目标也不算残留。
 * 只杀 root 的后代 ⇒ 并行会话的 5199/他人 52xx 结构性免疫(不是后代够不着)。
 * @returns {{targets:number[],term:number[],killed:number[],survivors:number[]}}
 */
export async function killDescendants({
  root = process.pid, exclude = [], termMs = 800, killWaitMs = 400, table = null,
} = {}) {
  const ex = new Set(exclude);
  const zombies = zombiePids();
  const targets = descendantsOf(root, table ?? undefined).filter((p) => p > 1 && !ex.has(p) && !zombies.has(p));
  if (!targets.length) return { targets, term: [], killed: [], survivors: [] };
  const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
  const term = targets.filter((p) => alive(p) && !zombiePids().has(p));
  for (const p of term) { try { process.kill(p, 'SIGTERM'); } catch { /* 已死 */ } }
  await sleep(termMs);
  const z2 = zombiePids();
  const lingering = term.filter((p) => alive(p) && !z2.has(p));
  for (const p of lingering) { try { process.kill(p, 'SIGKILL'); } catch { /* 已死 */ } }
  await sleep(killWaitMs);
  const z3 = zombiePids();
  const survivors = term.filter((p) => alive(p) && !z3.has(p));
  return { targets, term, killed: lingering, survivors };
}

/**
 * 带硬超时的 shell 子命令执行(J6):`runWithTimeout(cmd, ms)`。
 * detached 起独立进程组——超时先 TERM 全组,宽限后 KILL 全组(heredoc python/
 * vitest 这类再生孙代一并带走),然后等子进程收割才 resolve(防假残留)。
 *
 * @param {string} cmd  shell 命令串(shell:true;管道/重定向/<<EOF heredoc 皆可)
 * @param {number} ms   硬超时(到点必杀;不抛错,结果里带 timedOut=true 供断言)
 * @returns {{ok:boolean,timedOut:boolean,code:number|null,signal:string|null,
 *           stdout:string,stderr:string,ms:number,pid:number,killed:number[]}}
 */
export function runWithTimeout(cmd, ms, { cwd = process.cwd(), env = process.env, termMs = 800 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(cmd, { shell: true, cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ ok: false, timedOut: false, code: -1, signal: null, stdout: '', stderr: String(e), ms: 0, pid: 0, killed: [] });
      return;
    }
    let stdout = '', stderr = '', settled = false, armed = false;
    child.stdout?.on('data', (d) => { stdout += d; if (stdout.length > 4e6) stdout = stdout.slice(-2e6); });
    child.stderr?.on('data', (d) => { stderr += d; if (stderr.length > 4e6) stderr = stderr.slice(-2e6); });
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    child.on('exit', (code, signal) => {
      if (settled || armed) return;   // armed=超时收口中:死法与结果都归超时路径报(防竞态把超时记成正常退)
      done({ ok: code === 0, timedOut: false, code, signal, stdout, stderr, ms: Date.now() - t0, pid: child.pid ?? 0, killed: [] });
    });
    child.on('error', (e) => {
      if (settled) return;
      done({ ok: false, timedOut: false, code: -1, signal: null, stdout, stderr: `${stderr}${e}`, ms: Date.now() - t0, pid: 0, killed: [] });
    });
    const killGroup = (sig) => {
      try { if (child.pid) process.kill(-child.pid, sig); } catch { /* 组已散 */ }
      try { child.kill(sig); } catch { /* 已死 */ }
    };
    const timer = setTimeout(async () => {
      if (settled || child.exitCode !== null || child.signalCode !== null) return;   // 恰在到点前自然退=不算超时
      armed = true;                               // 到点:此后 exit 事件不再走正常完成支
      killGroup('SIGTERM');                       // 先礼:给"能 TERM 死"的子代收尸机会
      await sleep(termMs);
      killGroup('SIGKILL');                       // 后兵:硬超时必须以 KILL 收口(忙循环免疫)
      const z = zombiePids();
      const killed = descendantsOf(child.pid).filter((p) => !z.has(p));
      // 等本尊收割(exit 事件竞速;不无限等——杀完 1.5s 仍未退也如实返回)
      for (let i = 0; i < 15 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
      done({ ok: false, timedOut: true, code: child.exitCode ?? null, signal: child.signalCode ?? 'SIGKILL', stdout, stderr, ms: Date.now() - t0, pid: child.pid ?? 0, killed });
    }, ms);
  });
}
