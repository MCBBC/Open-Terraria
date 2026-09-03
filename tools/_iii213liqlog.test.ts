// ★IIIII213 一次性仪④：#98 沉降活动表指纹流（JS 侧）——镜像 rig SW_LIQLOG
// （JJHook.OnUpdateLiquid：UpdateLiquid 尾对 Main.liquid[0..numLiquid) 逐条 14B
//   x:i16le y:i16le delay:i32le kill:i32le amt:u8 lty:u8(vanilla0基) → FNV-1a →
//   "I <iter> <nl> <nb> <hash8>"）。与 /tmp/iii213-out/x86-liqlog.txt 逐行对拍。
// 基座=snap97-remix（≡dump097）；E 流窗（SW_I213_EFROM/ETO）镜像 SW_LIQRAW 供窄窗定罪。
// 用法：cd game && SW_I213LL=1 npx vitest run tools/_iii213liqlog.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I213LL === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';
const G2 = process.env.I213_G2 ?? `${process.env.HOME}/GoldenChains/golden-remix/dumps`;
const W = 4200, H = 1200;
const EFROM = Number(process.env.SW_I213_EFROM ?? 0), ETO = Number(process.env.SW_I213_ETO ?? 0);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('iii213 settle liqlog js', async () => {
  const snap = JSON.parse(readFileSync(`${OUT}/snap97-remix.json`, 'utf8'));
  const dec = (k: string): ArrayBuffer => Buffer.from(snap.store[k], 'base64').buffer;
  const st = new TileStore(snap.w, snap.h, {
    type: dec('type'), flags: dec('flags'), frameX: dec('frameX'), frameY: dec('frameY'),
    wall: dec('wall'), liquid: dec('liquid'), liquidType: dec('liquidType'),
    half: dec('half'), slope: dec('slope'), wire: dec('wire'),
    paint: dec('paint'), paintWall: dec('paintWall'), coat: dec('coat'),
  });
  restoreGenSolid(new Map<number, boolean>(snap.genSolidOverrides));
  const p = snap.gsPick;
  const gs = {
    w: snap.w, h: snap.h, seed: p.seed, seedFlags: { ...p.seedFlags },
    worldSurface: p.worldSurface, rockLevel: p.rockLevel, lavaLine: p.lavaLine,
    beachDistance: p.beachDistance, dungeonSide: p.dungeonSide ?? 1,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1, waterLine: p.waterLine ?? 0,
  } as unknown as GenState & Record<string, number>;
  const world = {
    w: snap.w, h: snap.h, seed: p.seed, store: st,
    groundLevel: p.worldSurface, rockLevel: p.rockLevel,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1,
    genWaterLine: 0, genDungeonExempt: null as never, genRemixWater: null as never,
  };
  // ---- 指纹钩（updateLiquid 尾；rel 从 1 起=首 WC 后首次调用，与 rig LiqIter 同锚）----
  const fnvTable = new Uint8Array(2 * 1024 * 1024);
  const lines: string[] = [];
  const eraw: string[] = [];
  let rel = 0;
  type SimT = LiquidSim & {
    world: { store: TileStore }; numLiquid: number; bufCount: number;
    liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
    bufX: Int32Array; bufY: Int32Array;
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments);
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    rel++;
    const nl = sim.numLiquid, nb = sim.bufCount;
    let pp = 0;
    for (let k = 0; k < nl; k++) {
      const e = sim.liquids[k]!;
      const ti = e.y * s.w + e.x;
      const dl = e.delay | 0, kl = e.kill | 0;
      fnvTable[pp++] = e.x & 0xff; fnvTable[pp++] = (e.x >> 8) & 0xff;
      fnvTable[pp++] = e.y & 0xff; fnvTable[pp++] = (e.y >> 8) & 0xff;
      fnvTable[pp++] = dl & 0xff; fnvTable[pp++] = (dl >>> 8) & 0xff; fnvTable[pp++] = (dl >>> 16) & 0xff; fnvTable[pp++] = (dl >>> 24) & 0xff;
      fnvTable[pp++] = kl & 0xff; fnvTable[pp++] = (kl >>> 8) & 0xff; fnvTable[pp++] = (kl >>> 16) & 0xff; fnvTable[pp++] = (kl >>> 24) & 0xff;
      fnvTable[pp++] = s.liquid[ti];
      fnvTable[pp++] = s.liquidType[ti] === 0 ? 0 : s.liquidType[ti] - 1;
    }
    let h = 2166136261 >>> 0;
    for (let q = 0; q < pp; q++) { h ^= fnvTable[q]!; h = Math.imul(h, 16777619) >>> 0; }
    lines.push(`I ${rel} ${nl} ${nb} ${h.toString(16).padStart(8, '0')}`);
    const dumpSet = new Set((process.env.SW_I213_DUMPAT ?? '').split(',').map(Number).filter(n => n > 0));
    if (dumpSet.size > 0 && dumpSet.has(rel)) {
      // 与 rig SW_LIQDUMP_AT 同锚（迭代尾）：entries + K 六通道 + **buffer 全序**（rig 不导 buffer,JS 侧留证）
      const buf: string[] = ['# x y delay kill amt lty'];
      for (let k = 0; k < nl; k++) {
        const e = sim.liquids[k]!;
        const ti = e.y * s.w + e.x;
        buf.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${s.liquid[ti]} ${s.liquidType[ti] === 0 ? 0 : s.liquidType[ti] - 1}`);
      }
      buf.push(`# buf n=${sim.bufCount}`);
      for (let k = 0; k < sim.bufCount && k < 50000; k++) buf.push(`B ${k} ${sim.bufX[k]} ${sim.bufY[k]}`);
      writeFileSync(`${OUT}/j-entries-${rel}.txt`, buf.join('\n') + '\n');
      const n2 = s.w * s.h;
      const typ = Buffer.alloc(n2 * 2), wal = Buffer.alloc(n2 * 2);
      const act = Buffer.alloc(n2), liq = Buffer.alloc(n2), lt = Buffer.alloc(n2), ia = Buffer.alloc(n2);
      for (let q = 0; q < n2; q++) {
        typ[q * 2] = SHEET[s.type[q]]! & 0xff; typ[q * 2 + 1] = (SHEET[s.type[q]]! >> 8) & 0xff;
        act[q] = s.flags[q] & 1;
        wal[q * 2] = s.wall[q] & 0xff; wal[q * 2 + 1] = (s.wall[q] >> 8) & 0xff;
        liq[q] = s.liquid[q];
        lt[q] = s.liquidType[q] === 0 ? 0 : s.liquidType[q] - 1;
        ia[q] = (s.wire[q] >>> 5) & 1;
      }
      mkdirSync(`${OUT}/jdump1`, { recursive: true });
      writeFileSync(`${OUT}/jdump1/K.chk-${rel}`, Buffer.from(sim['checking' as never] as unknown as Uint8Array));
      writeFileSync(`${OUT}/jdump1/K.skp-${rel}`, Buffer.from(sim['skip' as never] as unknown as Uint8Array));
      writeFileSync(`${OUT}/jdump1/K.typ-${rel}`, typ);
      writeFileSync(`${OUT}/jdump1/K.act-${rel}`, act);
      writeFileSync(`${OUT}/jdump1/K.wal-${rel}`, wal);
      writeFileSync(`${OUT}/jdump1/K.liq-${rel}`, liq);
      writeFileSync(`${OUT}/jdump1/K.lty`, lt);
      writeFileSync(`${OUT}/jdump1/K.inact`, ia);
      console.log(`[i213] dump at rel=${rel} nl=${nl} nb=${nb}`);
    }
    if (EFROM > 0 && rel >= EFROM && rel <= ETO) {
      const buf: string[] = [];
      for (let k = 0; k < nl; k++) {
        const e = sim.liquids[k]!;
        const ti = e.y * s.w + e.x;
        buf.push(`E ${rel} ${k} ${e.x} ${e.y} ${e.delay} ${e.kill} ${s.liquid[ti]}`);
      }
      buf.push(`---IT ${rel} end`);
      eraw.push(buf.join('\n') + '\n');
    }
    return r;
  };
  // ---- 忠实副本 liquidSettlePass(ctx,false) ----
  const rng = new RNG(p.seed);
  rng.reseed(p.seed);
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null as never;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = (gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }) as never;
  }
  world.genRemixWater = { lavaLine: gs.lavaLine, rockLevel: gs.rockLevel, oceanLevel: (gs.worldSurface + gs.rockLevel) / 2 + 40 } as never;
  try {
    flipGenSolid([379], true);
    setBoulderSolidity(false);
    flipGenSolid([546], false);
    await settleWorldLiquids(world as never, 'gen', undefined, rng, false);
    setBoulderSolidity(true);
    flipGenSolid([546], true);
    flipGenSolid([10, 192, 191, 190], true);
    flipGenSolid([484], false);
  } finally {
    proto.updateLiquid = oUpd;
  }
  writeFileSync(`${OUT}/j-liqlog.txt`, lines.join('\n') + '\n');
  if (eraw.length) {
    mkdirSync(`${OUT}/jeraw`, { recursive: true });
    writeFileSync(`${OUT}/jeraw/j-raw.txt`, eraw.join(''));
  }
  console.log(`liqlog lines=${lines.length} first=${lines[0]} last=${lines[lines.length - 1]}`);
  // 末态对拍（复用八通道）
  const names = new Map<number, string>();
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(G2)) {
    const mm = f.match(/^(\d{3})_(.+)\.typ$/);
    if (mm) names.set(Number(mm[1]), mm[2]);
  }
  let idxD = -1;
  for (const [k, nm] of names) if (nm === 'Settle_Liquids_Again') idxD = k;
  const pre = `${G2}/${String(idxD).padStart(3, '0')}_Settle_Liquids_Again`;
  const c = { t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), l: readFileSync(`${pre}.liq`) };
  let dL = 0, dT = 0, first = '';
  for (let i = 0; i < W * H; i++) {
    const va = c.a[i], ja = st.flags[i] & 1;
    const vt = va ? c.t[i] : 0;
    const jt = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (c.l[i] !== st.liquid[i]) { dL++; if (!first) first = `L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`; }
    if (vt !== jt) dT++;
  }
  console.log(`endstate vs dump098: dL=${dL} dT=${dT} first=${first}`);
}, 600_000);
