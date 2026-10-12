// 蜘蛛哨兵域变异互斥（★BJ612 事故修复：BJ-C9-SP M9 与 BJ612 M-A 并行变异
// src/entities/MinionProj.ts 互踩——vitest 多文件并行时两 D 面 write→sub-vitest→
// restore 窗交错,后还原者把「含对方变异的盘面」当 PRISTINE 回写=变异泄漏固化
// （2026-10-10 实锤:isSolid2→isSolid 变异被 BJ612 M-A 还原 bake,真机扫描回退,
//  tsc TS2551 捕获）。范式沿 tests/npcdust-mutation-mutex.ts（BJ304 判例）:
//   · lockSpiderMutation/unlockSpiderMutation：D 面 beforeAll/afterAll 持锁串行化;
//     O_EXCL 锁 + 陈旧强拆（★BJ662 2026-10-12 统一域锁阈 600s=npcdust 域锁同款:
//     旧 120s < D 面内层 spawn 上限 600s=合法持锁可被等待者误拆→同窗互染;
//     600s 阈=误拆面只剩子进程吃满 timeout 被杀+还原毫秒级理论缝,L3 残留自检兜底）
//     + 忙等 250ms 轮询。
//   · 锁内 PRISTINE 锚校验：mutate() 捕获 PRISTINE 前必须见到域锚字符串——盘面
//     已被对方变异污染（锚不在/变异标记在）= loud 红,拒绝把毒盘面当基准回写。
import { statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MUT_LOCK = join(tmpdir(), 'bj-spider-sentry-mutation.lock');

/** 域锚:两 D 面变异目标(MinionProj.ts)的 pristine 必含串——污染判别面 */
export const SPIDER_SENTRY_ANCHORS = [
  'store.isSolid2(tx - 1, row) || store.isSolid2(tx, row) || store.isSolid2(tx + 1, row)', // BJ-C9-SP M9 面
  'const halfW = Math.floor(sheet.width / 2);',                                            // BJ612 M-A 面
  'if (sentry) this.embedPlatSnap = true;',                                                // BJ608 嵌入 opt-in
] as const;

/** 变异标记:pristine 盘面绝不允许出现的串(出现=对方变异在盘=拒绝捕获) */
export const SPIDER_SENTRY_MUT_MARKERS = [
  '★C9-SP 变异',
  '★BJ612 变异',
] as const;

// ★BJ662（2026-10-12）陈锁阈统一 600s / 等待上限 660s（陈锁阈+60s 余量——等待者
//  永不早于可收编点弃权;vitest hookTimeout 600s 为更外层兜底）。npcdust 域锁同款。
const STALE_MS = 600_000;
const WAIT_DEADLINE_MS = 660_000;

function stealIfStale(): boolean {
  try {
    if (Date.now() - statSync(MUT_LOCK).mtimeMs > STALE_MS) { unlinkSync(MUT_LOCK); return true; }
  } catch { /* 锁不存在 */ }
  return false;
}

export function lockSpiderMutation(): void {
  const t0 = Date.now();
  for (;;) {
    try { writeFileSync(MUT_LOCK, String(process.pid), { flag: 'wx' }); return; }
    catch {
      stealIfStale();
      if (Date.now() - t0 > WAIT_DEADLINE_MS) throw new Error('spider-sentry mutation lock timeout（并行 D 面互斥,锁=' + MUT_LOCK + '）');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

export function unlockSpiderMutation(): void {
  try { unlinkSync(MUT_LOCK); } catch { /* 已释放 */ }
}

/** 毒盘面哨兵:捕获 PRISTINE 前调——锚缺失或变异标记在盘=loud 红(拒绝毒基准) */
export function assertPristineDisk(source: string): void {
  for (const a of SPIDER_SENTRY_ANCHORS) {
    if (!source.includes(a)) throw new Error('spider-sentry 域锚缺失=盘面被并行变异污染,拒绝捕获 PRISTINE（防泄漏固化,BJ612 事故判例）: 缺 ' + a.slice(0, 60));
  }
  for (const m of SPIDER_SENTRY_MUT_MARKERS) {
    if (source.includes(m)) throw new Error('spider-sentry 变异标记在盘=' + m + '——并行 D 面变异未还原,拒绝捕获 PRISTINE');
  }
}
