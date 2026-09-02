// IIII186 批一次性取证仪②：REMIX 全链每槽掷数（R）对拍仪。
// 动机：LXXI 移交账「#69 A=157/#71 A=16,837 活性差另源」——位等≠调度对齐,
// 真信号=计数差（LXVII 判例）。本仪不取值流,只在 onWorldPartial 槽边界记录
// __swOnRoll 全局掷序增量=每槽 R,产 js-slotroll.txt,与金标 pc R 逐槽对拍。
// 用法：cd game && SW_I186SR=1 SW_I186_OUT=/tmp/iii186-out npx vitest run tools/_iii186slotroll.test.ts
import { it } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I186SR === '1';
const OUT = process.env.SW_I186_OUT ?? '/tmp/iii186-out';
const SEED = process.env.SW_I186_SEED ?? '1138154190';
const LO = Number(process.env.SW_I186_LO ?? 60);
const HI = Number(process.env.SW_I186_HI ?? 80);

(RUN ? it : it.skip)('iii186 per-slot roll census', { timeout: 900_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;
  mkdirSync(OUT, { recursive: true });
  let gln = 0;
  const rows: string[] = [];
  let prev = 0;
  let lastName = '(start)';
  g.__swOnRoll = () => { gln++; };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { remix: true },
      onWorldPartial: (_w2, i, name) => {
        rows.push(`SLOT ${i} ${name} R=${gln - prev}`);
        prev = gln;
        lastName = name;
      },
    });
  } finally {
    rows.push(`END ${lastName} totalR=${gln}`);
    g.__swOnRoll = oRoll;
    writeFileSync(`${OUT}/js-slotroll.txt`, rows.join('\n') + '\n');
    // 对拍：读金标 pc（若存在）逐槽对 R
    const pcPath = `${process.env.HOME ?? ''}/GoldenChains/golden-remix/pc.txt`;
    try {
      const pc = readFileSync(pcPath, 'utf8').split('\n');
      const rBySlot: Record<number, { name: string; r: number }> = {};
      for (const l of pc) {
        const m = l.match(/^P\|(\d+)\|([^|]+)\|.*R:(\d+):/);
        if (m) rBySlot[Number(m[1])] = { name: m[2]!, r: Number(m[3]) };
      }
      let difs = 0;
      for (const row of rows) {
        const m = row.match(/^SLOT (\d+) (.+) R=(\d+)$/);
        if (!m) continue;
        const s = Number(m[1]);
        const gold = rBySlot[s];
        if (!gold) continue;
        const d = Number(m[3]) - gold.r;
        if (d !== 0) {
          difs++;
          console.log(`[i186sr] R 差 slot ${s} ${m[2]}: JS=${m[3]} x86=${gold.r} (Δ=${d})`);
        }
      }
      console.log(`[i186sr] 槽级 R 对拍完成,差槽数=${difs}（仅列 LO..HI 有金标的槽）`);
    } catch {
      console.log(`[i186sr] 金标 pc 不可读（${pcPath}）,跳过对拍`);
    }
    console.log(`[i186sr] 明细=${OUT}/js-slotroll.txt last=${lastName}`);
  }
});
