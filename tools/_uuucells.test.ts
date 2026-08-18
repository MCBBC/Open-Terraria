// UUU 批·2×2 定性实验（SW_UUU=1 门控，跑完删）：
// {ghost 保真, ghost 清零} × {GenSolid 管线态, 模块默认态} 四组合 clean 重放 #53，
// 全世界八通道差 + draws + 三疑格 ((2430,662)/(2427,666)/(2679,714)) 终值。
// 需管线跑到 slot12 抓 GenSolid 快照（约 3-4 分钟）。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { snapshotGenSolid, restoreGenSolid, resetGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_UUU === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const VAN_N53 = 5_097_254;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

(RUN ? it : it.skip)('UUU 2x2 clean replay', async () => {
  // 管线跑到 slot12 抓 GenSolid
  let solid52: Map<number, boolean> | null = null;
  class Ab extends Error { constructor() { super('AB'); } }
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0,
      onWorldPartial: (_w, i) => { if (i === 12) { solid52 = snapshotGenSolid(); throw new Ab(); } },
    });
  } catch (e) { const c = (e as { cause?: unknown })?.cause; if (!(e instanceof Ab || c instanceof Ab)) throw e; }
  const solid = solid52 as Map<number, boolean>;
  console.log(`GenSolid@52: ${solid.size} 条覆写; 484 内部id=${[...REV.entries()].find(([s]) => s === 484)?.[1] ?? '?'} sheet484覆盖=${solid.has(REV.get(484)!) ? solid.get(REV.get(484)!) : '未登记(用数据初值)'}; 数据初值 solid=${TILE_DEFS[REV.get(484)!]?.solid}`);

  const t52 = rd16(52, 'typ'), a52 = rd8(52, 'act'), l52 = rd8(52, 'liq'), lt52 = rd8(52, 'lty'), hf52 = rd8(52, 'half'), sl52 = rd8(52, 'slope');
  const a53 = rd8(53, 'act'), t53 = rd16(53, 'typ'), hf53 = rd8(53, 'half'), sl53 = rd8(53, 'slope');

  const mk = (keepGhost: boolean): TileStore => {
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      st.flags[i] = a52[i] ? 1 : 0;
      st.type[i] = keepGhost ? (REV.get(t52[i]) ?? 0) : (a52[i] ? (REV.get(t52[i]) ?? 0) : 0);
      st.liquid[i] = l52[i]; st.liquidType[i] = l52[i] > 0 ? lt52[i] + 1 : 0;
      st.half[i] = hf52[i]; st.slope[i] = sl52[i];
    }
    return st;
  };

  const probeCells: Array<[number, number]> = [[2430, 662], [2427, 666], [2428, 664], [2679, 714], [2680, 714]];
  const run = (label: string, st: TileStore, useSnap: boolean) => {
    if (useSnap) restoreGenSolid(solid); else resetGenSolid();
    const { rng, box } = countedRng(SEED);
    runSmoothWorldPass(st, rng, { seed: SEED } as GenState);
    let dA = 0, dT = 0, dH = 0, dS = 0;
    const cells: string[] = [];
    for (let i = 0; i < N; i++) {
      const va = a53[i] !== 0, ja = st.flags[i] !== 0;
      const jt = ja ? (SHEET[st.type[i]] ?? -1) : -1;
      const vt = va ? t53[i] : -1;
      if (va !== ja || (ja && jt !== vt) || hf53[i] !== st.half[i] || sl53[i] !== st.slope[i]) {
        if (va !== ja) dA++; else if (jt !== vt) dT++; else if (hf53[i] !== st.half[i]) dH++; else dS++;
        if (cells.length < 10) cells.push(`(${i % W},${(i / W) | 0})a${ja ? 1 : 0}>${va ? 1 : 0}t${jt}>${vt}h${st.half[i]}>${hf53[i]}s${st.slope[i]}>${sl53[i]}`);
      }
    }
    console.log(`[${label}] draws=${box.n}(diff=${box.n - VAN_N53}) dA=${dA} dT=${dT} dH=${dH} dS=${dS} | ${cells.join(' ')}`);
    for (const [x, y] of probeCells) {
      const i = y * W + x;
      console.log(`    (${x},${y}): js a${st.flags[i]}t${SHEET[st.type[i]] ?? -1}h${st.half[i]}s${st.slope[i]} vs g53 a${a53[i]}t${a53[i] ? t53[i] : -1}h${hf53[i]}s${sl53[i]} | 入 a${a52[i]}t${a52[i] ? t52[i] : t52[i] + '(ghost)'}h${hf52[i]}s${sl52[i]}`);
    }
  };
  run('ghost保真 × GenSolid管线态', mk(true), true);
  run('ghost清零 × GenSolid管线态', mk(false), true);
  run('ghost保真 × GenSolid默认态', mk(true), false);
  run('ghost清零 × GenSolid默认态', mk(false), false);
}, 580_000);
