// IIII11 批一次性诊断：ntb #98 液体簿记 round 级对拍仪（JS 侧，IIII4 仪器家族克隆，
// OUT 迁至 /tmp/iii11-out；镜像 rig11.app SW_NTB_SUB_DIR 子阶段栅格）。
// 配方：cd game && SW_MB_1457=1 SW_III11B=1 npx vitest run --cache=false tools/_iii11b.test.ts
// 输出：j-liqlog.txt / j-r30.txt / jround/<inst>-<seq|qw>/（六通道 K.*）
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III11B === '1';
const SEED = '1372357239';
const W = 4200, H = 1200;
const OUT = '/tmp/iii11-out';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS?.[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('ntb #98 liquid bookkeeping instrument iii11', async () => {
  mkdirSync(`${OUT}/jround`, { recursive: true });
  const logLines: string[] = [];
  let r30N = 0;

  const fnvTable = new Uint8Array(512 * 1024);
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  interface Inst { id: number; iter: number; rel: number; head2: boolean; wcSeq: number; ups: number; wcs: number }
  const insts = new Map<number, Inst>();
  const idOf = (sim: object): number => {
    let id = ids.get(sim);
    if (!id) { id = nextId++; ids.set(sim, id); }
    return id;
  };

  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  const oUpd = proto.updateLiquid;
  const oWc = proto.waterCheck;
  const oQw = proto.quickWater;
  type SimT = LiquidSim & {
    world: { store: { w: number; h: number; liquid: Uint8Array; liquidType: Uint8Array; type: Uint16Array; flags: Uint8Array; wall: Uint16Array; wire: Uint8Array } };
    numLiquid: number; bufferLen: number; liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
  };

  /** 世界六通道快照 */
  const dumpWorld = (dir: string, sim: SimT) => {
    const st = sim.world.store;
    mkdirSync(dir, { recursive: true });
    const n = st.w * st.h;
    const typ = new Uint16Array(n), wal = new Uint16Array(n);
    const act = new Uint8Array(n), liq = new Uint8Array(n), lt = new Uint8Array(n), ia = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      typ[i] = st.type[i]! >= 0 && st.type[i]! < SHEET.length ? SHEET[st.type[i]!]! : 65000;
      act[i] = st.flags[i] & 1;
      wal[i] = st.wall[i];
      liq[i] = st.liquid[i];
      lt[i] = st.liquidType[i] === 0 ? 0 : st.liquidType[i] - 1;
      ia[i] = (st.wire[i] >>> 5) & 1;
    }
    writeFileSync(`${dir}/K.typ`, Buffer.from(typ.buffer));
    writeFileSync(`${dir}/K.act`, act);
    writeFileSync(`${dir}/K.wal`, Buffer.from(wal.buffer));
    writeFileSync(`${dir}/K.liq`, liq);
    writeFileSync(`${dir}/K.lty`, lt);
    writeFileSync(`${dir}/K.inact`, ia);
  };

  proto.updateLiquid = function (this: unknown) {
    oUpd.apply(this, arguments);
    const sim = this as unknown as SimT;
    const id = idOf(sim);
    let rec = insts.get(id);
    if (!rec) { rec = { id, iter: 0, rel: 0, head2: false, wcSeq: 0, ups: 0, wcs: 0 }; insts.set(id, rec); }
    rec.iter++; rec.ups++;
    if (!rec.head2) return;
    rec.rel++;
    const nl = sim.numLiquid, nb = sim.bufferLen;
    const L = sim.liquids;
    const st = sim.world.store;
    let p = 0;
    for (let k = 0; k < nl; k++) {
      const e = L[k]!;
      const ti = e.y * st.w + e.x;
      const amt = st.liquid[ti];
      const lt = st.liquidType[ti] === 0 ? 0 : st.liquidType[ti] - 1;
      fnvTable[p++] = e.x & 0xff; fnvTable[p++] = (e.x >> 8) & 0xff;
      fnvTable[p++] = e.y & 0xff; fnvTable[p++] = (e.y >> 8) & 0xff;
      const dl = e.delay | 0; const kl = e.kill | 0;
      fnvTable[p++] = dl & 0xff; fnvTable[p++] = (dl >>> 8) & 0xff; fnvTable[p++] = (dl >>> 16) & 0xff; fnvTable[p++] = (dl >>> 24) & 0xff;
      fnvTable[p++] = kl & 0xff; fnvTable[p++] = (kl >>> 8) & 0xff; fnvTable[p++] = (kl >>> 16) & 0xff; fnvTable[p++] = (kl >>> 24) & 0xff;
      fnvTable[p++] = amt;
      fnvTable[p++] = lt;
    }
    let h = 2166136261 >>> 0;
    for (let q = 0; q < p; q++) { h ^= fnvTable[q]!; h = Math.imul(h, 16777619) >>> 0; }
    logLines.push(`I ${id} ${rec.rel} ${nl} ${nb} ${h.toString(16).padStart(8, '0')}`);
  };

  proto.quickWater = function (this: unknown) {
    oQw.apply(this, arguments);
    dumpWorld(`${OUT}/jround/${idOf(this as object)}-qw`, this as unknown as SimT);
    console.log(`JQWMARK inst=${idOf(this as object)} nl=${(this as unknown as SimT).numLiquid}`);
  };

  proto.waterCheck = function (this: unknown) {
    oWc.apply(this, arguments);
    const sim = this as unknown as SimT;
    const id = idOf(sim);
    let rec = insts.get(id);
    if (!rec) { rec = { id, iter: 0, rel: 0, head2: false, wcSeq: 0, ups: 0, wcs: 0 }; insts.set(id, rec); }
    rec.wcSeq++; rec.wcs++;
    if (rec.wcSeq === 1) rec.head2 = true; // 初始 WC = head2 锚
    dumpWorld(`${OUT}/jround/${id}-${String(rec.wcSeq).padStart(2, '0')}`, sim);
    console.log(`JWCMARK inst=${id} seq=${rec.wcSeq} ups=${rec.ups} nl=${sim.numLiquid} nb=${sim.bufferLen}`);
  };

  const r30Path = `${OUT}/j-r30.txt`;
  const r30Lines: string[] = [];
  let curUpdInst = -1;
  LiquidSim.r30Sink = (x, y, v) => {
    r30N++;
    r30Lines.push(`${r30N} ${x} ${y} ${v} i${curUpdInst}`);
  };

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { notTheBees: true },
    });
  } finally {
    LiquidSim.r30Sink = null;
    writeFileSync(`${OUT}/j-liqlog.txt`, logLines.join('\n') + '\n');
    writeFileSync(r30Path, r30Lines.join('\n') + '\n');
    for (const [id, rec] of [...insts.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`INST ${id}: ups=${rec.ups} wcs=${rec.wcs} relMax=${rec.rel} iterSum=${rec.iter}`);
    }
  }
}, 900_000);
