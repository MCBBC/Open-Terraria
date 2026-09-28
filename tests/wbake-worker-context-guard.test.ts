// ★C4 烘焙 Worker 化——worker 上下文禁令守卫（2026-09-28;fork bomb 判例家族）。
// worker 侧源文件与其独有内核文件禁 document/Image/localStorage/window 触点——
// BakeWorker 在 worker 全局执行,触 DOM 即 ReferenceError（或更糟:静默 fork 主线程
// 假设）。canvasEnv.ts 是唯一持 document 引用的共享工厂（document 优先分支）,
// 属白名单。源码扫描守卫（era-guard 家族:改协议/换内核导入时先过此闸）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const WORKER_STRICT = [
  'src/workers/BakeWorker.ts',
  'src/workers/BakeProtocol.ts',
  'src/render/ChunkBake.ts',
];

const PATTERNS: Array<[RegExp, string]> = [
  [/document\./, 'document 触点（worker 全局无 document）'],
  [/new Image\(/, 'new Image（worker 无 Image 构造器;素材一律主线程 createImageBitmap 随包）'],
  [/localStorage/, 'localStorage 触点'],
  [/\bwindow\./, 'window 触点（worker 全局无 window;用 self）'],
  [/navigator\./, 'navigator 触点'],
];

describe('C4 worker 上下文禁令（源码扫描）', () => {
  for (const rel of WORKER_STRICT) {
    it(`${rel} 零 DOM 触点`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      const hits: string[] = [];
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        // 行注释里的提及不豁免——禁令词面即禁（守卫从宽;确需提及用「DOM 触点」措辞）
        for (const [re, why] of PATTERNS) {
          if (re.test(line)) hits.push(`L${i + 1} [${why}] ${line.trim().slice(0, 80)}`);
        }
      });
      expect(hits, hits.join('\n')).toEqual([]);
    });
  }

  it('canvasEnv 工厂：document 分支优先（主线程行为逐位不变）,node 落 null', () => {
    const src = readFileSync(join(ROOT, 'src/render/canvasEnv.ts'), 'utf8');
    expect(src).toContain("typeof document !== 'undefined'");
    expect(src).toContain('new OffscreenCanvas');
  });
});
