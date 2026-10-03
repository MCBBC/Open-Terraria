// ★功能 worker 治理——构建期装配断言（2026-10-03;x-ray 定谳后的防线固化刀）
//
// ═══ 定谳背景 ═══
// 被测构建（index-DEEBwe68,10/3）的三个功能 worker 各自 boot 了完整游戏实例：
// LightWorker 跑 Game.loop（27.97s 100% 烧满）、WaveWorker 跑 draw 循环（26.9s）、
// BakeWorker 卡死 equipStatsKey（99.4%）。静态追图判谳：当前 src 快照六 worker
// 入口的传递 import 图均无页面入口回连——判定为当日构建的瞬态装配回归。
// 本测试把「worker 图不回连页面入口」钉成机械闸（era-guard 家族：换内核导入/
// 动 import 图时先过此闸），运行时防线见 src/workers/workerBootGate.ts。
//
// 判据（静态 import 图追踪,正则解析,注释剥离;混合导入 { A, type B } 记运行时边）：
//   正向：六 worker 入口的【静态+动态】运行时图禁入 main.ts / mainFlow.ts /
//         core/Game.ts（Game.ts 模块级无 DOM 触点=静默潜入型风险面,主犯）;
//   反向：页面入口 main.ts 的运行时图禁 import 任何 worker 入口文件——worker
//         装配只许走 new Worker(new URL(...)) 单通道（WorldGenClient 头注判例;
//         反向并置=worker 入口在主线程求值,self 在 window 上有定义不炸=静默
//         fork bomb 家族）。
//   入口卫生：三功能 worker 入口源文件禁 requestAnimationFrame（worker 全局无
//         rAF;Game 自驱循环 Game.ts:8700-8747 全由 rAF 调度——入口自建循环=
//         越权 boot 面）且必须首导入 workerBootGate（守卫守卫自身）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const EXTS = ['.ts', '.mts', '.mjs', '.js'];

/** 禁入 worker 图的页面入口/游戏 boot 模块（新增禁入面在此登记） */
const BANNED = [
  join(SRC, 'main.ts'),
  join(SRC, 'mainFlow.ts'),
  join(SRC, 'core/Game.ts'),   // 模块级无 DOM 触点=静默潜入型;createFlow/new Game+Game.loop 全在此域
].map((p) => resolve(p));

const WORKER_ENTRIES = [
  'workers/LightWorker.ts',
  'workers/WaveWorker.ts',
  'workers/BakeWorker.ts',
  'workers/save.worker.ts',
  'workers/worldGen.worker.ts',
  'net/asset-warm.worker.ts',
];

/** 三功能 worker（x-ray 定谳的三张烧满账）——额外入口卫生锁 */
const FUNCTIONAL_ENTRIES = ['workers/LightWorker.ts', 'workers/WaveWorker.ts', 'workers/BakeWorker.ts'];

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;   // 裸包名(node_modules)不入图
  const base = spec.startsWith('/') ? join(SRC, spec) : resolve(dirname(fromFile), spec);
  for (const e of EXTS) if (existsSync(base + e)) return resolve(base + e);
  for (const e of EXTS) if (existsSync(join(base, 'index' + e))) return resolve(join(base, 'index' + e));
  return null;
}

/** 解析单文件运行时依赖（静态 import/export-from + 动态 import;type-only 不入图） */
function parseDeps(file: string): { rt: string[]; dyn: string[] } {
  const src = readFileSync(file, 'utf8');
  // 去注释（粗粒度:块注释+行注释;模板串内 "import x from y" 字面量误报方向=图变大=fail-safe）
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const rt: string[] = [], dyn: string[] = [];
  let m: RegExpExecArray | null;
  const impRe = /import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = impRe.exec(clean))) {
    if (m[1] !== 'type ') rt.push(m[3]);   // 混合导入（{ A, type B }）是运行时导入
  }
  const expRe = /export\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = expRe.exec(clean))) {
    if (m[1] !== 'type ') rt.push(m[3]);
  }
  const seRe = /import\s+['"]([^'"]+)['"]/g;
  while ((m = seRe.exec(clean))) rt.push(m[1]);
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(clean))) dyn.push(m[1]);
  return { rt, dyn };
}

interface Trace { modules: Set<string>; bannedHits: string[]; dynBannedHits: string[] }

/** 传递追踪（BFS;静态图全量,动态 import 目标另列——同属运行时加载面） */
function trace(entryRel: string, banned: string[] = BANNED): Trace {
  const entry = resolve(join(SRC, entryRel));
  const seen = new Set<string>([entry]);
  const queue: string[] = [entry];
  const bannedHits: string[] = [];
  const dynBannedHits: string[] = [];
  while (queue.length) {
    const file = queue.shift() as string;
    const { rt, dyn } = parseDeps(file);
    for (const spec of dyn) {
      const t = resolveSpec(file, spec);
      if (t && banned.includes(t)) dynBannedHits.push(`${file.replace(SRC + '/', '')} --import()--> ${t.replace(SRC + '/', '')}`);
    }
    for (const spec of rt) {
      const t = resolveSpec(file, spec);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      if (banned.includes(t)) bannedHits.push(`${file.replace(SRC + '/', '')} --> ${t.replace(SRC + '/', '')}`);
      queue.push(t);
    }
  }
  return { modules: seen, bannedHits, dynBannedHits };
}

describe('功能 worker 治理——worker 图禁回连页面入口（构建期装配断言）', () => {
  for (const entry of WORKER_ENTRIES) {
    it(`${entry}: 运行时图（静态+动态）无 main.ts/mainFlow.ts/core/Game.ts 回连`, () => {
      const { modules, bannedHits, dynBannedHits } = trace(entry);
      expect(bannedHits, `静态 import 回连:\n${bannedHits.join('\n')}`).toEqual([]);
      expect(dynBannedHits, `动态 import 回连:\n${dynBannedHits.join('\n')}`).toEqual([]);
      expect(modules.size, '图追踪应至少覆盖入口自身（解析失效哨兵）').toBeGreaterThanOrEqual(1);
    });
  }

  it('反向：main.ts 页面图禁 import worker 入口（装配只许 new Worker(new URL) 单通道）', () => {
    // 反向禁入集=worker 入口文件本身（页面图 import mainFlow/core/Game 是合法的）
    const workerEntries = WORKER_ENTRIES.map((e) => resolve(join(SRC, e)));
    const { bannedHits, dynBannedHits } = trace('main.ts', workerEntries);
    expect(bannedHits, `页面图静态并置 worker 入口:\n${bannedHits.join('\n')}`).toEqual([]);
    expect(dynBannedHits, `页面图动态并置 worker 入口:\n${dynBannedHits.join('\n')}`).toEqual([]);
  });

  for (const entry of FUNCTIONAL_ENTRIES) {
    it(`${entry}: 入口源禁 requestAnimationFrame（worker 全局无 rAF;自建循环=越权 boot 面）`, () => {
      const src = readFileSync(join(SRC, entry), 'utf8');
      expect(src).not.toMatch(/\brequestAnimationFrame\b/);
    });
    it(`${entry}: 首导入 workerBootGate（守卫守卫自身——boot 闸必须先于图内其余模块求值）`, () => {
      const src = readFileSync(join(SRC, entry), 'utf8');
      const gateIdx = src.indexOf("from './workerBootGate'");
      expect(gateIdx, 'worker 入口必须 import workerBootGate').toBeGreaterThanOrEqual(0);
      // 闸 import 必须是文件内第一个 import 语句（首位=深度优先求值序下最先落域）
      const firstImportRe = /^import[\s\S]*?from\s*['"]([^'"]+)['"]/m;
      const m = src.match(firstImportRe);
      expect(m, '应存在至少一条 import').toBeTruthy();
      expect(m?.[1], `首个 import 必须是 ./workerBootGate（实际 ${m?.[1]}）`).toBe('./workerBootGate');
    });
  }
});
