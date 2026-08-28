// ★IIII29 批一次性仪③：窗口反演重放——load snap75(≡x86 dump075)单跑 Traps 槽，
// 与 /tmp/rrrr-out/x86-<chain>/076_Traps 8 通道对拍。秒级迭代刀床。
// 用法：cd game && SW_I30=1 SW_I30_CHAIN=notraps npx vitest run tools/_i30replay.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I30 === '1';
const CHAIN = process.env.SW_I30_CHAIN ?? 'notraps';
const OUT = process.env.I30_OUT ?? '/tmp/iii30-out';
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

(RUN ? it : it.skip)(`i30 replay ${CHAIN}`, () => {
  mkdirSync(OUT, { recursive: true });
  const snap = JSON.parse(readFileSync(`${OUT}/snap75-${CHAIN}.json`, 'utf8'));
  const dec = (k: string): ArrayBuffer => Buffer.from(snap.store[k], 'base64').buffer;
  const st = new TileStore(snap.w, snap.h, {
    type: dec('type'), flags: dec('flags'), frameX: dec('frameX'), frameY: dec('frameY'),
    wall: dec('wall'), liquid: dec('liquid'), liquidType: dec('liquidType'),
    half: dec('half'), slope: dec('slope'), wire: dec('wire'),
    paint: dec('paint'), paintWall: dec('paintWall'),
    coat: dec('coat'),
  });
  restoreGenSolid(new Map<number, boolean>(snap.genSolidOverrides));
  // ---- 基座自检：快照 vs x86 dump075（act/typ 双通道逐位）----
  {
    let badA = 0, badT = 0;
    const names = dumpNames(G2);
    const idxD5 = findIdx(names, /fallen_log/i) ?? [...names.keys()].filter((k) => k <= 76).sort((a, b) => b - a)[0];
    const pre = `${G2}/${String(idxD5).padStart(3, '0')}_${names.get(idxD5)}`;
    const a5 = readFileSync(`${pre}.act`);
    const t5 = le16(`${pre}.typ`);
    for (let i = 0; i < W * H; i++) {
      if (a5[i] !== (st.flags[i] & 1)) badA++;
      else if (a5[i] && t5[i] !== SHEET[st.type[i]]) badT++;
    }
    console.log(`base-check vs #${idxD5}: A-diff=${badA} T-diff=${badT}`);
    writeFileSync(`${OUT}/basecheck-${CHAIN}.txt`, `idx=${idxD5} A=${badA} T=${badT}\n`);
  }
  // ---- GenState 最小承载（runTrapsPass 只消费白名单字段）----
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
  const chests = (snap.chests ?? []).map((c: { x: number; y: number; items: unknown[] }) => ({
    x: c.x, y: c.y,
    items: c.items.map(() => ({ id: 1, stack: 1 })),
  }));
  // ★I30 写位观察：盒内一切 setTileSilent 直写（含整块静默擦除路径）
  const evs: string[] = [];
  (globalThis as unknown as Record<string, unknown>).__swTntEv = (m: string) => evs.push(m);
  {
    const orig = TileStore.prototype.setTileSilent;
    const g1s = (): string => {
      const stk = new Error().stack ?? '';
      return stk.split('\n').slice(2).filter((l) => l.includes('src/world/gen')).slice(0, 4)
        .map((l) => l.replace(/^.*?(src\/[A-Za-z0-9_/.]+\.ts).*$/, '$1') + '#' + l.replace(/^.*[^\d](\d+):\d+.*$/, '$1'))
        .join('<-');
    };
    TileStore.prototype.setTileSilent = function (this: { w: number }, x: number, y: number, t?: number, fx?: number, fy?: number) {
      if ((process.env.SW_I30_WATCHW ?? '') === '1') {
        const sx = x, sy = y;
        let hitb = '';
        for (const [x0, y0, x1, y1] of boxes.length ? boxes : [[0, 0, 0, 0]]) {
          if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) { hitb = `${sx},${sy}`; break; }
        }
        if (hitb) evs.push(`SET ${hitb} t${t} ${g1s()}`);
      }
      return orig.call(this, x, y, t, fx, fy);
    } as typeof TileStore.prototype.setTileSilent;
  }
  const wenv = process.env.SW_I30_WATCH ?? '';
  const boxes = wenv ? wenv.split(';').map((b) => b.split(',').map(Number)) : [];
  const g1 = (): string => {
    const stk = new Error().stack ?? '';
    return stk.split('\n').slice(2).filter((l) => l.includes('src/world/gen')).slice(0, 5)
      .map((l) => l.replace(/^.*?(src\/[A-Za-z0-9_/.]+\.ts).*$/, '$1') + '#' + l.replace(/^.*[^\d](\d+):\d+.*$/, '$1'))
      .join('<-');
  };
  const inBox = (sx: number, sy: number): boolean => {
    for (const [x0, y0, x1, y1] of boxes) if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) return true;
    return false;
  };
  if (boxes.length) {
    (globalThis as unknown as Record<string, unknown>).__swKillW = (m: string) => {
      const [sx, sy] = m.split(',').map(Number);
      if (inBox(sx, sy)) evs.push(`KILL ${sx},${sy} ${g1()}`);
    };
    (globalThis as unknown as Record<string, unknown>).__swCascW = (m: string) => {
      const [sx, sy] = m.split(',').map(Number);
      if (inBox(sx, sy)) evs.push(`CASC ${m} ${g1()}`);
    };
  }
  const rng = new RNG(p.seed);
  try {
    runTrapsPass(st, rng as never, gs, chests);
  } finally {
    delete (globalThis as unknown as Record<string, unknown>).__swTntEv;
  }
  writeFileSync(`${OUT}/j-replay-tnt-${CHAIN}.txt`, evs.join('\n') + '\n');
  // ---- 对拍 dump076 ----
  const names = dumpNames(G2);
  const idxD = findIdx(names, /^traps/i)!;
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
    lines.push(`== ${k} ×${uq.length}: ${uq.slice(0, 48).map(fmtCell).join(' ')}`);
  }
  lines.push(`totalDiffCells≈${total}`);
  writeFileSync(`${OUT}/res-replay-${CHAIN}.txt`, lines.join('\n') + '\n');
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
