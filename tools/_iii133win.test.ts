// IIII107b 冬链单格债取证探针（一次性诊断）。
// SW_I133DOOR=1: 在 Underworld pass 末捕获窗内全部门(10)/ hellbrick(75) 邻域态
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I133DOOR === '1' || process.env.SW_I133COL === '1';
const SEED = process.env.SW_I133_SEED ?? '1.1.1.0.winteriscoming|20260914';
const OUT = process.env.SW_I133_OUT ?? '/tmp/iii133-out/doorcap';
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('III133 winter door forensics', async () => {
  mkdirSync(OUT, { recursive: true });
  let stopped = false;
  let calls = 0;
  (globalThis as { __swI87Cap?: unknown }).__swI87Cap = (rawSt: unknown) => {
    calls++;
    if (calls !== 2 || stopped) return;   // 第 2 次=@CORRHEAD=▶Corruption 前=槽末#28
    stopped = true;
    const st = rawSt as never as {
      w: number; h: number; flags: Uint8Array; type: Uint16Array; wall: Uint16Array;
      half: Uint8Array; slope: Uint8Array;
    };
      const lines: string[] = [];
      // 门族全捕获(窗)
      for (let y = 1020; y <= 1070; y++) {
        for (let x = 1830; x <= 1895; x++) {
          const k = y * st.w + x;
          if (SHEET[st.type[k]] === 10) lines.push(`door (${x},${y}) act=${st.flags[k] & 1} wall=${st.wall[k]}`);
        }
      }
      // 邻域态
      for (let y = 1040; y <= 1056; y++) {
        let row = '';
        for (let x = 1856; x <= 1868; x++) {
          const k = y * st.w + x;
          row += `${String(SHEET[st.type[k]]).padStart(4)}:${st.flags[k] & 1}`;
        }
        lines.push(`${y} ${row}`);
      }
      writeFileSync(`${OUT}/doors-underworld.txt`, lines.join('\n'));
      writeFileSync(`${OUT}/passes.txt`, String(calls));
      throw new Error('III133 captured—early abort');
    };
  await generateWorld({ width: W, height: H, seedText: SEED }).catch((e: unknown) => {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('III133 captured')) throw e;
  });
}, 600_000);
