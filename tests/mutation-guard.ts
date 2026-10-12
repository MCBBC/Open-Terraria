// ★变异测试统一守卫（残留普查波 2026-10-12,根治 BJ606 习语四起事故链:
//   ①BJ630 `if (false &&` 残留 ②BJ643 `if (true)` 残留 ③bj642/bj643 联跑互染
//   ④bj644 误判「并行重写」）——全族 writeFileSync 写盘变异+还原统一收敛到本模块。
//
// 三层守卫（方案 B:进程级文件互斥+panic-safe 还原+残留自检;改造面小,不碰模块装载）：
//   L1 跨套件/跨进程【按目标文件】互斥锁（/tmp/sw-mutation-guard/lock-<md5>.lock,
//      O_EXCL+陈锁收编 900s+忙等 100ms）——bj642/bj643 同变异 Arrow.ts 的联跑互染根除
//      （BJ643 债①）;与既有域锁（npcdust-mutation-mutex/spider-sentry-mutation-mutex,
//      D 面 beforeAll 持域级锁）为上下游关系:先域锁后文件锁,序一致无死锁。
//   L2 panic-safe 还原：进程内 registry + process.on('exit'/SIGINT/SIGTERM) 强还原
//      ——expect 崩/超时/信号中断任何 JS 可达路径都还原;SIGKILL/worker.terminate 等
//      不可达路径由 L3 下轮自愈兜底（vitest 默认 forks 池=子进程,exit 钩子可靠）。
//   L3 残留自检：持锁后盘上出现「缺 trigger 且含 replacement」=上轮泄漏态——
//      有本轮纯净备份（含 trigger 且不含 replacement）→ 自动还原+显式 fail（泄漏必须
//      红字现形,禁静默吞）;无备份 → loud fail 拒绝在毒盘上变异（防把毒盘当 PRISTINE
//      回写=BJ-C9-SP 实锤的「变异泄漏固化」病根）。纯 trigger 缺失（源漂移）同样
//      loud fail——bj643 M1 注入串漂移若早有此闸即当场红,不会拖到残留事故。
//
// 用法（替代旧 mutate() 内联体）：
//   withMutation(FILE, TRIGGER, REPL, () => {
//     const r = spawnVitest(filter);
//     expect(r.status, `变异须证红: ${REPL}`).not.toBe(0);
//     expect(r.stdout).toContain(filter);
//   }, { label: 'BJxxx M1', onPristine: (p) => assertPristineDisk(p) });
import { readFileSync, writeFileSync, statSync, unlinkSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(realpathSync(tmpdir()), 'sw-mutation-guard');
// ★BJ662（2026-10-12）锁键 realpath 归一：withMutation 调用方与 canary 持锁方的
//  同文件路径拼写可能不同（process.cwd() vs join(__dirname,'..')）——键取真实路径
//  保证同一文件恒同锁（防御 symlink/cwd 漂移;文件不存在时回退原串=行为不变）。
const keyOf = (f: string): string => {
  let rf = f;
  try { rf = realpathSync(f); } catch { /* 首锁时目标文件必已存在;防御性回退原串 */ }
  return createHash('md5').update(rf).digest('hex').slice(0, 16);
};
const lockPathOf = (f: string): string => join(ROOT, `lock-${keyOf(f)}.lock`);
const backupPathOf = (f: string): string => join(ROOT, `pristine-${keyOf(f)}.bak`);

// 陈锁阈值 > 内层 vitest spawn 上限（家族 300-600s timeout）+collect 开销——
// 合法持锁绝不误拆;真崩溃残留 ≤15min 内被后续等待者收编。
const STALE_MS = 900_000;
const WAIT_DEADLINE_MS = 1_200_000;

export type MutationGuardOpts = {
  /** 诊断标签（进锁文件,便于人查「谁在持锁」） */
  label?: string;
  /** PRISTINE 捕获后、写变异前的毒盘哨兵钩（bj612/bj-c9 assertPristineDisk 沿用） */
  onPristine?: (pristine: string) => void;
  /** 自定义变异算子（JSON round-trip 等非纯替换面）;缺省=pristine.replace(trigger,replacement) */
  mutate?: (pristine: string) => string;
  /** 自定义纯净性校验（round-trip 等价/键值闸,不通过=throw）;缺省=pristine 含 trigger */
  verifyPristine?: (pristine: string) => void;
  /** 自定义盘面变异态判别（残留自检面）;缺省=缺 trigger 且含 replacement */
  isMutated?: (cur: string) => boolean;
};

// ---------------- L2: panic-safe 还原 ----------------

const registry = new Map<string, string>();   // absFile -> pristine
let hooksInstalled = false;

function installPanicHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const restoreAll = (): void => {
    for (const [f, pristine] of registry) {
      try { writeFileSync(f, pristine); } catch { /* exit 钩子里尽力而为 */ }
    }
    registry.clear();
  };
  process.on('exit', restoreAll);   // forks 池子进程正常退出/未捕获异常 vitest 收编后退出均触发
  process.on('SIGINT', () => { restoreAll(); process.exit(130); });
  process.on('SIGTERM', () => { restoreAll(); process.exit(143); });
}

// ---------------- L1: 按目标文件互斥锁 ----------------

function acquireLock(file: string, label: string): void {
  mkdirSync(ROOT, { recursive: true });
  const lp = lockPathOf(file);
  const t0 = Date.now();
  for (;;) {
    try {
      writeFileSync(lp, JSON.stringify({ pid: process.pid, label, at: Date.now() }), { flag: 'wx' });
      return;
    } catch {
      try { if (Date.now() - statSync(lp).mtimeMs > STALE_MS) unlinkSync(lp); } catch { /* 收编竞态,继续转 */ }
      if (Date.now() - t0 > WAIT_DEADLINE_MS) {
        let holder = '?';
        try { holder = readFileSync(lp, 'utf8'); } catch { /* 已释放 */ }
        throw new Error(`mutation-guard 锁等待超时(${WAIT_DEADLINE_MS / 1000}s): ${lp} 持有者=${holder}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

function releaseLock(file: string): void {
  try { unlinkSync(lockPathOf(file)); } catch { /* 已释放/被收编 */ }
}

// ---------------- L1 补充：长持锁通道（读盘自证窗专用,★BJ662/BJ652 建议③） ----------------

/** 非变异方的【跨测试整段】持锁：静态对账闸（bj378 canary）等「snapshot→assert 读盘
 *  自证窗」与 in-flight withMutation 的 mutate→spawn→restore 窗按同文件互斥——并行
 *  池内交错 = canary 假红（bj378×bj642/bj643 Arrow.ts 实锤）。持锁方零写盘,不触
 *  L2 registry/还原面;陈锁收编/忙等等语义与 withMutation 完全同键同参。
 *  纪律：lock/unlock 必须 beforeAll/afterAll 同域配对（afterAll 侧放 finally）,
 *  持锁跨度内禁止再经 withMutation 触同一文件（自锁死）。 */
export function lockTargetFile(file: string, label: string): void {
  mkdirSync(ROOT, { recursive: true });
  acquireLock(file, label);
}
export function unlockTargetFile(file: string): void {
  releaseLock(file);
}

// ---------------- L3: 残留自检 ----------------

/** 持锁后取纯净基准:泄漏态→自动还原+显式 fail;毒盘无备份→loud fail;源漂移→loud fail */
function preflight(file: string, trigger: string, replacement: string, opts: MutationGuardOpts): string {
  const cur = readFileSync(file, 'utf8');
  if (opts.verifyPristine) {
    try { opts.verifyPristine(cur); return cur; } catch { /* 非纯净——走泄漏判别 */ }
  } else if (cur.includes(trigger)) {
    return cur;                                             // 干净（含 trigger 即信）
  }
  const mutated = opts.isMutated
    ? opts.isMutated(cur)
    : (!cur.includes(trigger) && cur.includes(replacement));
  const bp = backupPathOf(file);
  const backupValid = (bak: string): boolean => {
    try {
      if (opts.verifyPristine) { opts.verifyPristine(bak); return !opts.isMutated?.(bak); }
      return bak.includes(trigger) && !bak.includes(replacement);
    } catch { return false; }
  };
  if (mutated && existsSync(bp)) {
    const bak = readFileSync(bp, 'utf8');
    if (backupValid(bak)) {
      writeFileSync(file, bak);                             // 上轮崩溃泄漏自愈（字节级纯净备份）
      throw new Error(
        `mutation-guard: ${file} 检出上轮变异泄漏（盘上呈变异态）——`
        + `已自动还原纯净备份;本测显式 fail 暴露泄漏事件（禁静默）`);
    }
  }
  throw new Error(
    `mutation-guard: ${file} 盘面非纯净（缺 trigger/未过 verifyPristine）`
    + (mutated ? ' 且呈变异态但无可用纯净备份——人工核对盘上现态后手工还原（禁 git checkout）'
               : ` ——源已漂移（并行刀改写?）:先按现盘重锚注入串 ${JSON.stringify(trigger.slice(0, 80))} 再跑（禁 git checkout）`));
}

// ---------------- 主入口 ----------------

/** 变异自证单发：锁→残留自检→纯净备份→写变异→body（恰红断言）→finally 强还原+逐字节对拍→释放 */
export function withMutation(
  file: string, trigger: string, replacement: string,
  body: () => void, opts: MutationGuardOpts = {},
): void {
  installPanicHooks();
  acquireLock(file, opts.label ?? trigger.slice(0, 40));
  let pristine = '';
  try {
    pristine = preflight(file, trigger, replacement, opts);
    opts.onPristine?.(pristine);
    const mutated = opts.mutate ? opts.mutate(pristine) : pristine.replace(trigger, replacement);
    if (!opts.mutate && mutated === pristine) {
      throw new Error(`mutation-guard: 注入零差异（trigger 未被替换命中）: ${file}`);
    }
    if (mutated === pristine) {
      throw new Error(`mutation-guard: 自定义变异算子产出零差异: ${file}`);
    }
    try { writeFileSync(backupPathOf(file), pristine); } catch { /* 备份失败不阻断,自愈退化 */ }
    registry.set(file, pristine);
    writeFileSync(file, mutated);
    try {
      body();
    } finally {
      writeFileSync(file, pristine);
      registry.delete(file);
      if (readFileSync(file, 'utf8') !== pristine) {
        writeFileSync(file, pristine);                       // 强写第二次
        if (readFileSync(file, 'utf8') !== pristine) {
          throw new Error(`mutation-guard: ${file} 还原后逐字节对拍仍不一致——人工介入（禁 git checkout）`);
        }
        throw new Error(`mutation-guard: ${file} 首次还原对拍不一致（已强写复原）——查并行覆写面`);
      }
    }
  } finally {
    releaseLock(file);
  }
}
