// ★IIII31 批一次性仪②：窗口反演重放——load snap76(≡x86 dump076)单跑 Piles 槽，
// 与 /tmp/rrrr-out/x86-<chain>/077_Piles 8 通道对拍。秒级迭代刀床。
// 用法：cd game && SW_I31=1 SW_I31_CHAIN=notraps npx vitest run tools/_i31replay.test.ts
// 钩：__swKillCap/__swBrkRefuse(KILL/KREF)/__swPilesCap(PPLACE)/setTileSilent(W)。
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I31 === '1';
const CHAIN = process.env.SW_I31_CHAIN ?? 'notraps';
const OUT = process.env.I32_OUT ?? '/tmp/iii32-out';
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

(RUN ? it : it.skip)(`i31 replay ${CHAIN}`, () => {
  mkdirSync(OUT, { recursive: true });
  const snap = JSON.parse(readFileSync(`${OUT}/snap76-${CHAIN}.json`, 'utf8'));
  const dec = (k: string): ArrayBuffer => Buffer.from(snap.store[k], 'base64').buffer;
  const st = new TileStore(snap.w, snap.h, {
    type: dec('type'), flags: dec('flags'), frameX: dec('frameX'), frameY: dec('frameY'),
    wall: dec('wall'), liquid: dec('liquid'), liquidType: dec('liquidType'),
    half: dec('half'), slope: dec('slope'), wire: dec('wire'),
    paint: dec('paint'), paintWall: dec('paintWall'),
    coat: dec('coat'),
  });
  restoreGenSolid(new Map<number, boolean>(snap.genSolidOverrides));
  // ---- 基座自检：快照 vs x86 dump076（act/typ 双通道逐位）----
  {
    let badA = 0, badT = 0;
    const names = dumpNames(G2);
    const idxD76 = findIdx(names, /^traps/i)!;
    const pre = `${G2}/${String(idxD76).padStart(3, '0')}_${names.get(idxD76)}`;
    const a76 = readFileSync(`${pre}.act`);
    const t76 = le16(`${pre}.typ`);
    for (let i = 0; i < W * H; i++) {
      if (a76[i] !== (st.flags[i] & 1)) badA++;
      else if (a76[i] && t76[i] !== SHEET[st.type[i]]) badT++;
    }
    console.log(`base-check vs #${idxD76}: A-diff=${badA} T-diff=${badT}`);
    writeFileSync(`${OUT}/basecheck-${CHAIN}.txt`, `idx=${idxD76} A=${badA} T=${badT}\n`);
  }
  // ---- GenState 最小承载 ----
  const p = snap.gsPick;
  const gs = {
    w: snap.w, h: snap.h,
    seed: p.seed,
    seedFlags: { ...p.seedFlags },
    worldSurface: p.worldSurface, rockLevel: p.rockLevel,
    lavaLine: p.lavaLine, beachDistance: p.beachDistance,
    dungeonSide: p.dungeonSide ?? 1,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1,
  } as unknown as GenState & Record<string, number>;
  // ---- 观测钩 ----
  let rollN = 0;
  (globalThis as unknown as Record<string, unknown>).__swOnRoll = () => rollN++;
  void (globalThis as unknown as Record<string, number>).__swRollN;
  const evs: string[] = [];
  (globalThis as unknown as Record<string, unknown>).__swKillCap = (x: number, y: number, sheet: number) => {
    evs.push(`K r${rollN} ${x},${y} s${sheet}`);
  };
  (globalThis as unknown as Record<string, unknown>).__swPilesCap = (x: number, y: number, t: number, s: number, z: number, k: number) => {
    evs.push(`PPLACE ${x},${y} sheet${t} style${s} size${z} k${k}`);
  };
  const origSet = TileStore.prototype.setTileSilent;
  TileStore.prototype.setTileSilent = function (this: unknown, x: number, y: number, t?: number, fx?: number, fy?: number) {
    evs.push(`W ${x},${y} t${t}`);
    return origSet.call(this, x, y, t, fx, fy);
  } as typeof TileStore.prototype.setTileSilent;
  const rng = new RNG(p.seed);
  try {
    runPilesPass(st, rng as never, gs);
  } finally {
    TileStore.prototype.setTileSilent = origSet;
    delete (globalThis as unknown as Record<string, unknown>).__swKillCap;
    delete (globalThis as unknown as Record<string, unknown>).__swPilesCap;
    delete (globalThis as unknown as Record<string, unknown>).__swOnRoll;
  }
  writeFileSync(`${OUT}/j-piles-replay-${CHAIN}.txt`, evs.join('\n') + '\n');
  // ---- 对拍 dump077 ----
  const names = dumpNames(G2);
  const idxD = findIdx(names, /^Piles$/) ?? findIdx(names, /^077_Piles$/i);
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
    const vg = va ? 0 : c.t[i];
    const jg = ja ? 0 : (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999);
    if (vg !== jg && vt === jt) push(`GH${vg}>${jg}`, i);
  }
  const lines = [`dump=${idxD}_${names.get(idxD)} (${G2})`];
  let total = 0;
  for (const [k, arr] of groups) {
    const uq = [...new Set(arr)].sort((a, b) => a - b);
    total += uq.length;
    lines.push(`== ${k} ×${uq.length}: ${uq.slice(0, 80).map(fmtCell).join(' ')}`);
  }
  lines.push(`totalDiffCells≈${total}`);
  writeFileSync(`${OUT}/res-piles-${CHAIN}.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 300_000);

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
