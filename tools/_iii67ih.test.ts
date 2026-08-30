// IIII67 步骰账仪：IslandHouse step marks + 全局掷骰计数（对照 x86 rig SW_ROLLHOOK rc）。
// 用法：cd game && SW_I67IH2=1 npx vitest run tools/_iii67ih.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I67IH2 === '1';
const SEED = process.env.SW_M8_SEED ?? '1999040562';
const EVIL = Number(process.env.SW_M8_EVIL ?? 0) as -1 | 0 | 1;

(RUN ? it : it.skip)('iii67 island-house roll ledger', async () => {
  const g = globalThis as unknown as {
    __swRollCount?: () => number; __swOnRoll?: (v: number, inst: object) => void;
    __wvLines?: string[];
  };
  let count = 0;
  g.__swRollCount = () => count;
  g.__swOnRoll = (v: number, inst: object): void => {
    // 计主流实例样本：RNG 管线复用 Main.rand 每 pass 换新 UnifiedRandom——
    // 这里只累计【vanilla 主流】实例；进入 pass 后 gs.rng 即主实例。
    void v;
    (g as unknown as { __swRollInsts?: Set<object> }).__swRollInsts ??= new Set();
    const insts = (g as unknown as { __swRollInsts?: Set<object> }).__swRollInsts!;
    insts.add(inst);
    count++;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: EVIL,
      seedFlags: { tenthAnniversary: true },
    });
  } finally {
    delete g.__swOnRoll;
  }
  console.log(`[i67ih] total-raw-samples=${count}`);
}, 900_000);
