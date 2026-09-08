// IIIII214 天顶 UI 生成卡死猎杀 — node 侧复现（UI 路径 parseSeedChain('getfixedboi')）
// 默认跳过（整场生成分钟级且会挂死）：SW_III214=1 启用。
// 用法: SW_III214=1 SW_III214_SEED=getfixedboi SW_III214_SIZE=0 npx vitest run tools/_iii214repro.test.ts
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseSeedChain } from '../src/world/gen/SeedEasterEggs';

const itRepro = process.env.SW_III214 ? it : it.skip;
// SW_III214_SEG=1：挂 __swSeg/__swFCMark 段标仪（FinalCleanupPass 内建探针位），
// 输出带时间戳的子阶段流——最后一次输出即卡死子阶段。
const SEGTRACE = !!process.env.SW_III214_SEG;

describe('IIIII214 zenith UI-gen hang repro', () => {
  itRepro('seg trace mode', async () => {
    if (!SEGTRACE) return;
    const t0 = Date.now();
    // 落盘直写（appendFileSync 无缓冲）——vitest console 拦截会吞尾段，不用于定位
    const { appendFileSync } = await import('node:fs');
    const LOG = process.env.SW_III214_SEGLOG ?? '/tmp/iii214-out/seg.log';
    appendFileSync(LOG, `=== start ${new Date().toISOString()}\n`);
    const g = globalThis as unknown as {
      __swSeg?: (n: string, d?: unknown) => void;
      __swFCMark?: (tag: string, a?: number, b?: number) => void;
    };
    g.__swSeg = (n: string, d?: unknown) =>
      appendFileSync(LOG, `+${((Date.now() - t0) / 1000).toFixed(1)}s SEG ${n} ${d ?? ''}\n`);
    g.__swFCMark = (tag: string, a?: number, b?: number) =>
      appendFileSync(LOG, `+${((Date.now() - t0) / 1000).toFixed(1)}s MARK ${tag} ${a ?? ''},${b ?? ''}\n`);
    const seedText = process.env.SW_III214_SEED ?? 'getfixedboi';
    const size = Number(process.env.SW_III214_SIZE ?? 0) as 0 | 1 | 2;
    await generateWorld(
      { size, width: 0, height: 0, seedText, evil: -1, name: 'iii214-seg' } as never,
      () => {},
    );
    console.log('[iii214-seg] OK');
  }, 600_000);

  itRepro('UI path full run with per-slot progress capture', async () => {
    const seedText = process.env.SW_III214_SEED ?? 'getfixedboi';
    const size = Number(process.env.SW_III214_SIZE ?? 0) as 0 | 1 | 2;
    const flags = parseSeedChain(seedText);
    console.log(`[iii214] seedText=${seedText} size=${size} hitTexts=${JSON.stringify(flags.hitTexts)}`);
    console.log(`[iii214] flags=${JSON.stringify(flags.flags)}`);
    const t0 = Date.now();
    let lastLog = 0;
    let lastPass = '(none)';
    const w = await generateWorld(
      {
        size,
        width: 0, height: 0, // 由 size 派生（UI 同源）；WorldGen 用 SIZE_DIMS[size]
        seedText,
        evil: -1,             // UI 默认随机
        name: 'iii214-probe',
        onWorldPartial: (_w, i, passName) => {
          lastPass = passName;
          console.log(`[iii214] +${((Date.now() - t0) / 1000).toFixed(1)}s pass[${i}] DONE "${passName}"`);
        },
      } as never,
      (label, p, local) => {
        const now = Date.now();
        if (now - lastLog < 2000) return; // 限频：只看慢速推进
        lastLog = now;
        console.log(`[iii214] +${((now - t0) / 1000).toFixed(1)}s p=${(p * 100).toFixed(1)}% local=${local?.toFixed(3)} label="${label}" lastDone="${lastPass}"`);
      },
    );
    console.log(`[iii214] OK ${w.store.w}x${w.store.h} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }, 600_000);
});
