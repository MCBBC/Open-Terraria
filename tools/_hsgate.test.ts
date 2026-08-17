// 一次性:SolidTile 门调用序列对拍(列29-31)——定位 (30,1021..1099) 区间的门级首分叉。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const TV = '/tmp/sw-hsv';
const W = 4200, H = 1200, N = W * H;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('SolidTile gate trace col 29-31', () => {
  const t52 = new Uint16Array(readFileSync(`${VG}/052_Shell_Piles.typ`).buffer.slice(0));
  const a52 = readFileSync(`${VG}/052_Shell_Piles.act`);
  const w52 = new Uint16Array(readFileSync(`${VG}/052_Shell_Piles.wal`).buffer.slice(0));
  const l52 = readFileSync(`${VG}/052_Shell_Piles.liq`);
  const half = rd(`${TV}/hs52.half`), slope = rd(`${TV}/hs52.slope`), lty = rd(`${TV}/hs52.lty`);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t52[i]!) ?? 0;
    st.flags[i] = a52[i] ? 1 : 0;
    st.wall[i] = w52[i]!;
    st.liquid[i] = l52[i]!;
    st.liquidType[i] = lty[i];
    st.half[i] = half[i]; st.slope[i] = slope[i];
  }
  // JS 侧 ST 日志:通过包装 solidTile 不可行(内联闭包)——用 __swSWCell 门粒度近似:
  // 直接在 swAct 扩展:HalfBrickPass 的 solidTile 无钩,改用 vanilla STLog 对拍动作+ST 序列。
  // 这里仅重建动作+ST 合并序列:读 vanilla swtrace,展示 (30,1015..1105) 的全部记录。
  const van = readFileSync('/tmp/sw-hsv/swtrace.log', 'utf8').split('\n').filter(Boolean);
  const lines = van.filter((l) => {
    const p = l.split('|');
    const x = +p[2];
    return p[1] !== 'ST' || (x >= 29 && x <= 31);
  }).filter((l) => {
    const p = l.split('|');
    if (p[1] === 'ST') return +p[3] >= 1015 && +p[3] <= 1105;
    return true;
  });
  // 只保留列 30 的动作 + 列 29-31 的 ST
  const out: string[] = [];
  for (const l of lines) {
    const p = l.split('|');
    if (p[1] === 'ST' && +p[2] !== 29 && +p[2] !== 30 && +p[2] !== 31) continue;
    if (p[1] !== 'ST' && +p[2] !== 30) continue;
    if (p[1] !== 'ST' && (+p[3] < 1015 || +p[3] > 1105)) continue;
    out.push(l);
  }
  console.log(out.length + ' 条(截前 120):');
  console.log(out.slice(0, 120).join('\n'));
  writeFileSync('/tmp/sw-hsv/stlog-van-col30.txt', out.join('\n') + '\n');
}, 240000);
