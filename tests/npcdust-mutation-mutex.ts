// npcdust 消费面变异互斥（BJ304）——bj296/bj304 两个 D 面都变异 src/entities/NpcHitDust.ts,
// vitest 多文件并行时 write→sub-vitest→restore 窗口交错会让对方子进程读到「无变异」现库
// （判别面假绿）或对方 B 面读到「有变异」现库（误红）。本模块给两面统一：
//   · lockConsumerMutation/unlockConsumerMutation：D 面 beforeAll/afterAll 持锁串行化;
//     O_EXCL 锁 + 陈旧强拆（>120s=上轮崩溃残留）+ 忙等 250ms 轮询。
//   · gateConsumerMutation(envFlag)：文件级 beforeAll 闸——变异子进程以自身 env 豁免
//     （子进程就是要对变异文件跑 B 面）;其余进程等锁释放再过闸,过闸后校验消费面含批2/批3
//     锚（残留→loud 红,防 B 面静默中毒）。子进程 -t 过滤只跑 B 面,D 面 beforeAll 不执行
//     → 无重入死锁。
import { statSync, unlinkSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MUT_LOCK = join(realpathSync(tmpdir()), 'bj-npcdust-consumer-mutation.lock');
const ANCHORS = [
  "case 'fadeIn': d.fadeIn = op[1]; break;",   // BJ304 批3 fadeIn 算子
  "if (!prePass(el.pre, e)) {",                // BJ296 批2 pre 短路
  "case 'noLight': d.noLight = op[1]; break;", // BJ327 批4 noLight 算子（引擎光链消费面）
  "st.idAi3 != null ? (st.idAi3.m[e.ai3 ?? 0] ?? st.dust) : st.dust",   // BJ479 批6 ai[3] 段位选尘（85/629）
];

function stealIfStale(): boolean {
  try {
    if (Date.now() - statSync(MUT_LOCK).mtimeMs > 120_000) { unlinkSync(MUT_LOCK); return true; }
  } catch { /* 锁不存在 */ }
  return false;
}

export function lockConsumerMutation(): void {
  const t0 = Date.now();
  for (;;) {
    try { writeFileSync(MUT_LOCK, String(process.pid), { flag: 'wx' }); return; }
    catch {
      stealIfStale();
      if (Date.now() - t0 > 180_000) throw new Error('npcdust mutation lock timeout（并行 D 面互斥,锁=' + MUT_LOCK + '）');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

export function unlockConsumerMutation(): void {
  try { unlinkSync(MUT_LOCK); } catch { /* 已释放 */ }
}

/** 文件级 beforeAll 闸：等在途变异窗结束 → 校验消费面锚（残留/覆写 loud 红） */
export function gateConsumerMutation(envFlag: string, consumerPath: string): void {
  if (process.env[envFlag]) return;   // 变异子进程豁免（对变异文件跑 B 面是本意）
  const t0 = Date.now();
  for (;;) {
    let held = false;
    try { statSync(MUT_LOCK); held = true; } catch { held = false; }
    if (held) {
      if (Date.now() - t0 > 180_000) throw new Error('npcdust mutation gate timeout（在途变异窗未释放,锁=' + MUT_LOCK + '）');
      stealIfStale();
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      continue;
    }
    break;
  }
  const src = readFileSync(consumerPath, 'utf8');
  for (const a of ANCHORS) {
    if (!src.includes(a)) {
      throw new Error(`NpcHitDust.ts 缺锚「${a}」——上轮变异残留或并行覆写,先恢复盘上最新内容再跑（读盘核对后小粒度 Edit,禁 git checkout）`);
    }
  }
}
