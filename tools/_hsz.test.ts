// 一次性:#53 重放首个分歧格定位——按 SmoothWorld 扫描序(x 升,y 升)找输出 vs dump053
// 的首格,打印 7×7 邻域四通道+half/slope 输入与本 pass 对该格的写入动作。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${idx === 52 ? 'Shell_Piles' : 'Smooth_World'}.${ext}`);
const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
SHEET[0] = 0;
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('first divergent cell of #53 replay', () => {
  const tA = new Uint16Array(load(52, 'typ').buffer.slice(0));
  const aA = load(52, 'act');
  const wA = new Uint16Array(load(52, 'wal').buffer.slice(0));
  const lA = load(52, 'liq');
  const half = rd('/tmp/sw-hsv/hs52.half'), slope = rd('/tmp/sw-hsv/hs52.slope'), liq = rd('/tmp/sw-hsv/hs52.lty');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(tA[i]!) ?? 0;
    st.flags[i] = aA[i] ? 1 : 0;
    st.wall[i] = wA[i]!;
    st.liquid[i] = lA[i]!;
    st.liquidType[i] = liq[i];
    st.half[i] = half[i]; st.slope[i] = slope[i];
  }
  // 记录本 pass 对每格的写入动作（Kill/Fill/slope/pound）——包装写函数探测:
  // 直接重放后按扫描序找首差,再用前后快照推断动作。
  const before = { half: new Uint8Array(st.half), slope: new Uint8Array(st.slope), type: new Uint16Array(st.type), flags: new Uint8Array(st.flags) };
  const gs = { seed: 9293480 } as unknown as GenState;
  runSmoothWorldPass(st, new RNG(9293480), gs);
  const tB = new Uint16Array(load(53, 'typ').buffer.slice(0));
  const aB = load(53, 'act');
  // 扫描序:x=20..w-21, y=20..h-21
  const diffCells: Array<[number, number, string]> = [];
  for (let x = 20; x < W - 20 && diffCells.length < 30; x++) {
    for (let y = 20; y < H - 20; y++) {
      const i = y * W + x;
      let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      if (jT !== tB[i] || (st.flags[i] !== 0) !== (aB[i] !== 0)) {
        diffCells.push([x, y, `t${jT}>${tB[i]} a${st.flags[i]}→${aB[i]} | pre: t${tA[i]} a${aA[i]} h${before.half[i]} s${before.slope[i]} | post: h${st.half[i]} s${st.slope[i]}`]);
        if (diffCells.length >= 30) break;
      }
    }
  }
  console.log('=== 前 30 分歧格（扫描序） ===');
  for (const [x, y, s] of diffCells) console.log(`  (${x},${y}): ${s}`);
  if (!diffCells.length) { console.log('  (无分歧!)'); return; }
  const [fx, fy] = diffCells[0];
  console.log(`\n=== 首分歧格 (${fx},${fy}) 9×7 邻域 [输入=typ/act/half/slope | 输出 typ/act | dump053 typ/act] ===`);
  for (let dy = -3; dy <= 3; dy++) {
    let row = `y${fy + dy}: `;
    for (let dx = -4; dx <= 4; dx++) {
      const i = (fy + dy) * W + fx + dx;
      let pin = `${tA[i]}${aA[i] ? '' : '⁻'}h${before.half[i]}s${before.slope[i]}`;
      let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      row += `[${pin} → ${jT}${st.flags[i] ? '' : '⁻'} | ${tB[i]}${aB[i] ? '' : '⁻'}] `;
    }
    console.log(row);
  }
}, 240000);
