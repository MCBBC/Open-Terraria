// ★IIIII33 批一次性仪③：#105 Final_Cleanup 单槽反演重放——load snap(≡x86
// dump104_Remove_Broken_Traps)单跑 finalCleanupPass（FinalCleanup slot replica，
// WorldGen.ts:1257），对拍 105_Final_Cleanup 八通道 + 基座 ghost/wire 差异关联分析。
// 用法：cd game && SW_I36=1 npx vitest run tools/_i36replay.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I36 === '1';
const CHAIN = process.env.SW_I36_CHAIN ?? 'notraps';
const OUT = process.env.I35_OUT ?? '/tmp/iii35-out';
const G2 = `/tmp/rrrr-out/x86-${CHAIN}`;
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)(`i36 replay finalcleanup ${CHAIN}`, async () => {
  mkdirSync(OUT, { recursive: true });
  const snap = JSON.parse(readFileSync(`${OUT}/snap97-${CHAIN}.json`, 'utf8'));
  const dec = (k: string): ArrayBuffer => Buffer.from(snap.store[k], 'base64').buffer;
  const st = new TileStore(snap.w, snap.h, {
    type: dec('type'), flags: dec('flags'), frameX: dec('frameX'), frameY: dec('frameY'),
    wall: dec('wall'), liquid: dec('liquid'), liquidType: dec('liquidType'),
    half: dec('half'), slope: dec('slope'), wire: dec('wire'),
    paint: dec('paint'), paintWall: dec('paintWall'),
    coat: dec('coat'),
  });
  restoreGenSolid(new Map<number, boolean>(snap.genSolidOverrides));
  // ---- 基座自检 vs dump104（act/typ）+ 未判定通道（ghost/wire/half/slope/inact/liq/wal/lty）全景 ----
  {
    let badA = 0, badT = 0;
    const names = dumpNames(G2);
    const idxD104 = findIdx(names, /^Remove_Broken_Traps$/)!;
    const pre = `${G2}/${String(idxD104).padStart(3, '0')}_${names.get(idxD104)}`;
    const aD = readFileSync(`${pre}.act`);
    const tD = le16(`${pre}.typ`);
    const wD = le16(`${pre}.wal`), lD = readFileSync(`${pre}.liq`), hfD = readFileSync(`${pre}.half`)
      , slD = readFileSync(`${pre}.slope`), ltD = readFileSync(`${pre}.lty`), iaD = readFileSync(`${pre}.inact`);
    let gBad = 0, wBad = 0, oBad = 0;
    for (let i = 0; i < W * H; i++) {
      if (aD[i] !== (st.flags[i] & 1)) badA++;
      else if (aD[i] && tD[i] !== SHEET[st.type[i]]) badT++;
      if (!aD[i]) { }
      if ((aD[i] ? 0 : tD[i]) !== ((st.flags[i] & 1) ? 0 : (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999)) && aD[i] === (st.flags[i] & 1)) gBad++;
      if (wD[i] !== st.wall[i]) wBad++;
      if (lD[i] !== st.liquid[i] || hfD[i] !== st.half[i] || slD[i] !== st.slope[i]
        || iaD[i] !== (st.wire[i] >>> 5) || (lD[i] > 0 ? ltD[i] + 1 : 0) !== (st.liquid[i] > 0 ? st.liquidType[i] : 0)) oBad++;
    }
    console.log(`base-check vs #${idxD104}: A=${badA} T=${badT} ghostResid=${gBad} wallDiff=${wBad} otherChannelDiff=${oBad}`);
    writeFileSync(`${OUT}/basecheck105-${CHAIN}.txt`, `A=${badA} T=${badT} ghost=${gBad} wall=${wBad} other=${oBad}\n`);
  }
  const p = snap.gsPick;
  const gs = {
    w: snap.w, h: snap.h, seed: p.seed,
    seedFlags: { ...p.seedFlags },
    worldSurface: p.worldSurface, rockLevel: p.rockLevel,
    lavaLine: p.lavaLine, beachDistance: p.beachDistance,
    dungeonSide: p.dungeonSide ?? 1, shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1,
  } as unknown as GenState & Record<string, number>;
  // ---- FCP 消费端最小承载（finalCleanupPass wrapper 复刻；旗关 beforeShimmer 零掷零写）----
  const chests = snap.chests ?? [];
  const rng = new RNG(p.seed);
  rng.reseed(p.seed);                       // 槽头重播（runPass cs:497）
  try {
    runFinalCleanupPass(st, gs, rng as never, { chests: chests as never });
  } finally { /* no hooks */ }
  // ---- 对拍 dump105（八通道判读 + FINISHNOTRAPS 关联取证）----
  const names = dumpNames(G2);
  const idxD = findIdx(names, /^Final_Cleanup$/)!;
  const pre = `${G2}/${String(idxD).padStart(3, '0')}_${names.get(idxD)}`;
  const c = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
  const groups = new Map<string, number[]>();
  const push = (g: string, i: number) => {
    const arr = groups.get(g) ?? [];
    arr.push(i);
    groups.set(g, arr);
  };
  for (let i = 0; i < W * H; i++) {
    const va = c.a[i], ja = st.flags[i] & 1;
    const vt = va ? c.t[i] : 0;
    const jt = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (va !== ja) push(`A${va}>${ja}`, i);
    if (vt !== jt) push(`T${vt}>${jt}`, i);
    if (c.w[i] !== st.wall[i]) push(`W${c.w[i]}>${st.wall[i]}`, i);
    if (c.l[i] !== st.liquid[i]) push(`L${c.l[i]}>${st.liquid[i]}`, i);
    if (c.hf[i] !== st.half[i]) push(`H${c.hf[i]}>${st.half[i]}`, i);
    if (c.sl[i] !== st.slope[i]) push(`S${c.sl[i]}>${st.slope[i]}`, i);
    const vl = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) push(`Y${vl}>${jl}`, i);
    const via = c.ia[i] ? 1 : 0;
    const jia = (st.wire[i] >>> 5) & 1;
    if (via !== jia) push(`I${via}>${jia}`, i);
  }
  const lines = [`dump=${idxD}_${names.get(idxD)} (${G2})`];
  let total = 0;
  for (const [k, arr] of groups) {
    const uq = [...new Set(arr)].sort((a, b) => a - b);
    total += uq.length;
    lines.push(`== ${k} ×${uq.length}: ${uq.slice(0, 60).map(fmtCell).join(' ')}`);
  }
  lines.push(`totalDiffCells≈${total}`);
  writeFileSync(`${OUT}/res-fc-${CHAIN}.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 600_000);

function fmtCell(i: number): string {
  return `(${i % W},${Math.floor(i / W)})`;
}
function dumpNames(dir: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const f of readdirSync(dir)) {
    const mm = f.match(/^(\d{3})_(.+)\.typ$/);
    if (mm) m.set(Number(mm[1]), mm[2]);
  }
  return m;
}
function findIdx(names: Map<number, string>, re: RegExp): number | undefined {
  for (const [k, nm] of names) if (re.test(nm)) return k;
  return undefined;
}
