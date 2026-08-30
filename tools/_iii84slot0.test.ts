// IIII84 取证主探针：任意种子 slot0（原版地形槽末）抽样对拍 harness。
// 相比 _iii81slot0 增量：
//   ① 环境位全参数化（seed/evil/flags/尺寸），单命令跑任一种子；
//   ② 可选直连 x86 dump 目录（SW84_G2）做进程内 8 通道字节对拍，输出一行 @ROW JSON
//      （dA/dT/dW/dL/dHf/dSl/dLt/dIa + 首差格 + pair 谱）——供批产谱系收集；
//   ③ HDR 元组含 groundLevel/dungeonX/Y/jungleX/spawn，与 x86 w.wld meta
//      （tools/_iii81wld.test.ts 同名产出）逐项对读；
//   ④ SW84_PCTXT 指向 rig pc.txt 时打印 |pass|count|fnv 序列头若干行（口径同
//      _iii81slot0 钩=R:<n>:<fnv>），供人工/脚本首差 pass 定位。
// 用法：cd game && SW84_SEED='20260903' SW84_EVIL=0 \
//        SW84_G2=/tmp/iii81-out/x86-ctl201 SW84_OUT=/tmp/iii84-out/js-a \
//        npx vitest run tools/_iii84slot0.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { translateSeed } from '../src/core/rng';

const RUN = process.env.SW84_SEED !== undefined;
const SEED = process.env.SW84_SEED ?? '20260903';
const EVIL = process.env.SW84_EVIL !== undefined ? Number(process.env.SW84_EVIL) : -1;
const FLAGS_RAW = process.env.SW84_FLAGS ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of FLAGS_RAW.split(',').filter(Boolean)) FLAGS[f] = true;
const OUT = process.env.SW84_OUT ?? '/tmp/iii84-out/js-last';
const G2 = process.env.SW84_G2 ?? '';
const W = Number(process.env.SW84_W ?? 4200);
const H = Number(process.env.SW84_H ?? 1200);
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** 在 G2 中找 idx 槽（容忍 '-' 前缀文件名变体）→ {nm, pre} */
function findDump(dir: string, idxTarget: number): { nm: string; pre: string } | null {
  for (const f of readdirSync(dir)) {
    const m = f.match(/^-?(\d+)_(.+)\.typ$/);
    if (m && Number(m[1]) === idxTarget) {
      const nm = m[2];
      return { nm, pre: `${dir}/${String(idxTarget).padStart(3, '0')}_${nm}` };
    }
  }
  return null;
}

const le16file = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};

interface CmpResult {
  dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number;
  first: string; pairs: Array<[string, number]>;
}

function cmp(x86dir: string, typ: Uint16Array, act: Uint8Array,
  wallJ: Uint16Array, liqJ: Uint8Array, ltJ: Uint8Array, halfJ: Uint8Array, slopeJ: Uint8Array, wireJ: Uint8Array): CmpResult {
  const r: CmpResult = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, first: '', pairs: [] };
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0 || i < firstI) firstI = i; };
  const idxTarget = Number(process.env.SW84_IDX ?? 0);
  const dump = findDump(x86dir, idxTarget);
  if (!dump) { r.first = '(no dump)'; return r; }
  const pair = new Map<string, number>();
  const bump = (k: string, i: number) => { pair.set(k, (pair.get(k) ?? 0) + 1); mark(i); };
  // act + typ（sheet 视角）
  const xa = readFileSync(`${dump.pre}.act`);
  const xt = le16file(`${dump.pre}.typ`);
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = act[i]!;
    if (va !== ja) { r.dA++; mark(i); }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? typ[i]! : 0;
    if (vt !== jt) { r.dT++; bump(`T${vt}>${jt}`, i); }
  }
  const u16diff = (xf: string, jv: Uint16Array): number => {
    if (!existsSync(`${dump.pre}.${xf}`)) return -1;
    const xv = le16file(`${dump.pre}.${xf}`);
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (xv[i] !== jv[i]) { n++; mark(i); }
    }
    return n;
  };
  const u8diff = (xf: string, jv: Uint8Array, transform?: (x: number, i: number) => number): number => {
    if (!existsSync(`${dump.pre}.${xf}`)) return -1;
    const xv = readFileSync(`${dump.pre}.${xf}`);
    let n = 0;
    for (let i = 0; i < N; i++) {
      const vx = transform ? transform(xv[i]!, i) : xv[i]!;
      if (vx !== jv[i]) { n++; mark(i); }
    }
    return n;
  };
  r.dW = u16diff('wal', wallJ);
  r.dL = u8diff('liq', liqJ);
  r.dHf = u8diff('half', halfJ);
  r.dSl = u8diff('slope', slopeJ);
  // lty：仅 liquid>0 的格裁决（vanilla 0 基 ↔ JS +1 基）
  if (existsSync(`${dump.pre}.lty`) && existsSync(`${dump.pre}.liq`)) {
    const xl = readFileSync(`${dump.pre}.liq`);
    const xlt = readFileSync(`${dump.pre}.lty`);
    for (let i = 0; i < N; i++) {
      const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
      const jl = liqJ[i]! > 0 ? ltJ[i]! : 0;
      if (vl !== jl) { r.dLt++; bump(`Y${vl}>${jl}`, i); }
    }
  }
  // inact（actuator 位）：vanilla inact bool ↔ JS wire>>5
  if (existsSync(`${dump.pre}.inact`)) {
    const xi = readFileSync(`${dump.pre}.inact`);
    for (let i = 0; i < N; i++) {
      const vi = xi[i]! ? 1 : 0;
      const ji = (wireJ[i]! >>> 5) & 1;
      if (vi !== ji) { r.dIa++; mark(i); }
    }
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n] as [string, number]);
  return r;
}

(RUN ? it : it.skip)('III84 slot0 sample', async () => {
  mkdirSync(OUT, { recursive: true });
  let curN = 0;
  let curH = 2166136261 >>> 0;
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v) => {
    curN++;
    curH = ((curH ^ (v >>> 0)) * 16777619) >>> 0;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED,
      evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onWorldPartial: (w, i, pn) => {
        if (i !== 0) return;
        const st = w.store as never as {
          w: number; h: number; flags: Uint8Array; type: Uint16Array;
          wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array;
          half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
        };
        void pn;
        const flg = new Uint8Array(N);
        const typ = new Uint16Array(N);
        for (let q = 0; q < N; q++) {
          flg[q] = st.flags[q] & 1;
          typ[q] = (st.flags[q] & 1) ? (SHEET[st.type[q]] >= 0 ? SHEET[st.type[q]!] : 9999) : 0;
        }
        writeFileSync(`${OUT}/J_act.bin`, Buffer.from(flg.buffer));
        writeFileSync(`${OUT}/J_typ.bin`, Buffer.from(typ.buffer));
        const meta = w as unknown as Record<string, unknown>;
        const hdr = `seed=${SEED} evil=${EVIL} flags=${FLAGS_RAW} gl=${meta.groundLevel} rock=${meta.rockLevel} dungeon=${meta.dungeonX},${meta.dungeonY} jungleX=${meta.jungleX} spawn=${meta.spawnX},${meta.spawnY}`;
        writeFileSync(`${OUT}/J_meta.txt`, hdr);
        console.log(`HDR ${hdr}`);
        console.log(`ROLLS pass0 count=${curN} fnv=${curH}`);
        const c = G2 && existsSync(G2)
          ? cmp(G2, typ, flg, st.wall, st.liquid, st.liquidType, st.half, st.slope, st.wire)
          : { dA: null, dT: null, dW: null, dL: null, dHf: null, dSl: null, dLt: null, dIa: null, first: '', pairs: [] };
        console.log(`@ROW ${JSON.stringify({
          seed: SEED, numSeed: translateSeed(SEED), evil: EVIL, flags: FLAGS_RAW,
          gl: meta.groundLevel, rock: meta.rockLevel,
          dungeonX: meta.dungeonX, dungeonY: meta.dungeonY, jungleX: meta.jungleX,
          spawnX: meta.spawnX, spawnY: meta.spawnY,
          rollsPass0: curN, fnvPass0: curH,
          ...c,
        })}`);
        throw new Error('III84 slot0 captured—early abort');
      },
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('slot0 captured')) throw e;
  }
}, 600_000);
