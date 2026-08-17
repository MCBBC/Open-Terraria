// 树木专项 · 隔离通道（2026-08-17）：Trees pass 输入对账
// 我们「向日葵」slot 末态（=Trees pass 输入）vs 原版 081_Sunflowers dump（四数组）。
// 全零 → 数量差 100% 在 TreePass 自身；非零 → 级联（上游 pass）。
// 跑法：npx vitest run tools/_treeinput.test.ts
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

describe('Trees pass 输入隔离对账（9293480 evil=0）', { timeout: 300_000 }, () => {
  it('向日葵末态 vs 081 dump', async () => {
    let pre: World['store'] | null = null;
    await generateWorld({
      seedText: '9293480', width: W, height: H, evil: 0,
      onWorldPartial: (w, _i, name) => {
        if (name === '向日葵') {
          const s = w.store;
          pre = {
            w: W, h: H, idx: (x: number, y: number) => y * W + x, inBounds: s.inBounds,
            type: s.type.slice(), flags: s.flags.slice(), wall: s.wall.slice(),
            liquid: s.liquid.slice(), half: s.half.slice(), slope: s.slope.slice(),
            frameX: s.frameX.slice(), frameY: s.frameY.slice(),
          } as World['store'];
        }
      },
    });
    const st = pre!;
    const typ = new Uint16Array(readFileSync('/tmp/sw-num4/van_x86_g/081_Sunflowers.typ').buffer, 0, N);
    const act = readFileSync('/tmp/sw-num4/van_x86_g/081_Sunflowers.act');
    const wal = new Uint16Array(readFileSync('/tmp/sw-num4/van_x86_g/081_Sunflowers.wal').buffer, 0, N);
    const liq = readFileSync('/tmp/sw-num4/van_x86_g/081_Sunflowers.liq');

    let dTyp = 0, dAct = 0, dWal = 0, dLiq = 0;
    const samples: string[] = [];
    for (let i = 0; i < N; i++) {
      const ourT = st.flags[i] ? (SHEET[st.type[i]] ?? -1) : 0;
      if (ourT !== typ[i]) {
        dTyp++;
        if (samples.length < 12) samples.push(`typ@${i % W},${(i / W) | 0}:${typ[i]}≠${ourT}`);
      }
      if ((st.flags[i] ? 1 : 0) !== act[i]) dAct++;
      if (st.wall[i] !== wal[i]) dWal++;
      if (st.liquid[i] !== liq[i]) dLiq++;
    }
    console.log(`[输入对账] typ差=${dTyp} act差=${dAct} wal差=${dWal} liq差=${dLiq}`);
    if (samples.length) console.log('  样本:', samples.join(' '));

    // 顺带：tile3(Plants) 在输入态的总量（盒忽略机制的覆盖面）
    let p3 = 0, p3YMin = 1e9, p3YMax = 0;
    for (let i = 0; i < N; i++) if (st.flags[i] && SHEET[st.type[i]] === 3) { p3++; const y = (i / W) | 0; p3YMin = Math.min(p3YMin, y); p3YMax = Math.max(p3YMax, y); }
    let v3 = 0;
    for (let i = 0; i < N; i++) if (act[i] === 1 && typ[i] === 3) v3++;
    console.log(`[tile3 Plants] ours=${p3} (y ${p3YMin}..${p3YMax}) vanilla081=${v3}`);
  });
});
