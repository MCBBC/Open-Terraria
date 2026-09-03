// ★IIIII227 一次性仪：REMIX #98 DelWater「逐 D 三选一裁决」仪 v2——对象引用跟踪。
//   tracked = iter77 尾时 (3419,857) 的粒子对象引用（swap-remove 搬移不丢）。
//   D 行=每次 delWater(l)：l/x/y/被处理格 amt/kill/branch(重放判定)/tracked 在调用前后的 kill/x/y/slot
//   U 行=每次 update(e)：仅 x∈[3416..3422] y∈[855..859]
//   B 行=每次 delWater 后若 tracked.kill 变化 → 打点
//   W/K/N 行=迭代尾快照（同 v1）
// 用法：cd game && SW_I227DW=1 npx vitest run tools/_iii227dw.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_I227DW === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii227b-out';
const TX = 3419, TY = 857;

type E = { x: number; y: number; kill: number; delay: number };

(RUN ? it : it.skip)('iii227 delwater per-D trace v2', async () => {
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

  const lines: string[] = [];
  let rel = 0;
  let tracked: E | null = null;          // (3419,857) 粒子对象引用
  let trackedSeen = false;
  const win = (x: number, y: number): boolean => Math.abs(x - TX) <= 3 && Math.abs(y - TY) <= 3;

  type SimT = LiquidSim & {
    world: { store: TileStore & { w: number; h: number; liquid: Uint8Array; type: Uint16Array; flags: Uint8Array; wire: Uint8Array; slope: Uint8Array } };
    numLiquid: number; bufCount: number; liquids: E[];
    solidNP: Uint8Array; stuck: boolean; quickFall: boolean;
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  const oUpdate = proto.update as unknown as (this: unknown, e: E) => void;
  const oDel = proto.delWater as unknown as (this: unknown, l: number) => void;
  const oAdd = proto.addWater as unknown as (this: unknown, x: number, y: number) => void;

  const findTracked = (sim: SimT): void => {
    for (let k = 0; k < sim.numLiquid; k++) {
      const e = sim.liquids[k]!;
      if (e.x === TX && e.y === TY) { tracked = e; trackedSeen = true; return; }
    }
    tracked = null;
  };
  const tstate = (sim: SimT): string => {
    if (!tracked) return trackedSeen ? 'GONE' : 'never';
    const t = tracked as E;
    const k = sim.liquids.indexOf(t);
    return `slot=${k} kill=${t.kill} delay=${t.delay} x=${t.x} y=${t.y}`;
  };

  const WATCH = (TY + 1) * 4200 + TX; // (3419,858)
  proto.update = function (this: unknown, e) {
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    const i5 = e.y * s.w + e.x;
    const startAmt = s.liquid[i5]!;
    const kPrev = e.kill;
    const watchPre = rel === 77 ? s.liquid[WATCH]! : -1;
    oUpdate.call(this, e);
    if (rel >= 77 && rel <= 79 && win(e.x, e.y)) {
      lines.push(`U rel=${rel} x=${e.x} y=${e.y} startAmt=${startAmt} postAmt=${s.liquid[i5]} killPrev=${kPrev} killPost=${e.kill}`);
    }
    if (rel >= 77 && rel <= 79 && tracked && e === (tracked as E) && kPrev !== (tracked as E).kill) {
      lines.push(`UB rel=${rel} tracked-kill ${kPrev}->${(tracked as E).kill} via update`);
    }
    if (rel === 77 && watchPre >= 0 && s.liquid[WATCH] !== watchPre) {
      lines.push(`V rel=77 watch(3419,858) liq ${watchPre}->${s.liquid[WATCH]} by update-of (${e.x},${e.y}) kill=${e.kill}`);
    }
  };
  proto.addWater = function (this: unknown, x, y) {
    if (rel >= 77 && rel <= 79 && win(x, y)) {
      lines.push(`S rel=${rel} addWater x=${x} y=${y} (from ${new Error().stack?.split('\n')[2]?.trim().slice(0, 90)})`);
    }
    return oAdd.call(this, x, y);
  };
  let curDW = '';
  proto.delWater = function (this: unknown, l: number) {
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    const w = s.w;
    const pre = tstate(sim);
    const e0 = sim.liquids[l]!;
    const x = e0.x, y = e0.y;
    const i5 = y * w + x;
    const amt = s.liquid[i5]!;
    const k0 = e0.kill;
    const lty0 = s.liquidType[i5]!;
    const nl0 = sim.numLiquid;
    // 早退支三腿（与 JS delWater 同式,重放）
    let legs = '';
    if (amt >= 20) {
      const id = i5 + w;
      const dAmt = s.liquid[id]!;
      const bSelf = sim['blocksLiquid' as never] as unknown as (x: number, y: number) => boolean;
      const bBelow = y + 1 >= s.h ? true : bSelf.call(sim, x, y + 1);
      legs = `legD=dAmt${dAmt}<255:${dAmt < 255} legBelow=!blk:${!bBelow} legStuck=!${sim.stuck} legSelf=!blk:${!bSelf.call(sim, x, y)} => early=${dAmt < 255 && !bBelow && !sim.stuck && !bSelf.call(sim, x, y)}`;
      if (win(x, y) && x === TX && y === TY) {
        const snp = sim['solidNP' as never] as unknown as Uint8Array;
        lines.push(`RAW rel=${rel} below(3419,858) flags=${s.flags[id]} wire=${s.wire[id]} type=${s.type[id]} solidNP[type]=${snp[s.type[id]!]} liq=${s.liquid[id]} self flags=${s.flags[i5]} wire=${s.wire[i5]} type=${s.type[i5]} solidNP=self=${snp[s.type[i5]!]} half=${s.half[i5]} slope=${s.slope[i5]}`);
      }
    }
    curDW = rel === 77 ? `dw(l=${l}@${x},${y},lty=${lty0})` : '';
    oDel.call(this, l);
    curDW = '';
    const nl1 = sim.numLiquid;
    if (rel === 77) {
      // 全量：第 78 次调用清扫段所有 delWater
      lines.push(`D rel=77 l=${l} x=${x} y=${y} amt=${amt} lty=${lty0} kill0=${k0} nl=${nl0}->${nl1} departed=${nl1 === nl0 - 1} ${legs}`);
    } else if (rel >= 78 && rel <= 79 && (win(x, y) || (tracked && e0 === (tracked as E)))) {
      lines.push(`D rel=${rel} l=${l} x=${x} y=${y} amt=${amt} lty=${lty0} kill0=${k0} nl=${nl0}->${nl1} departed=${nl1 === nl0 - 1} ${legs} trackedBefore=[${pre}] trackedAfter=[${tstate(sim)}]`);
    }
  };
  // 第 78 次调用窗内杀 tile 入口追踪(killTileAt/killTileGen/squareTileFrameGen/setTile)
  for (const [nm, tag] of [['killTileAt', 'KTA'], ['killTileGen', 'KTG'], ['squareTileFrameGen', 'STF']] as const) {
    const orig = proto[nm] as unknown as (this: unknown, x: number, y: number) => void;
    proto[nm] = function (this: unknown, x: number, y: number) {
      if (rel === 77 && Math.abs(x - TX) <= 4 && Math.abs(y - TY) <= 4) {
        lines.push(`X rel=77 ${tag} x=${x} y=${y} from=${new Error().stack?.split('\n').slice(2, 5).map(s => s.trim().replace(/^at /, '')).join(' <- ')}`);
      }
      return orig.call(this, x, y);
    };
  }
  const oSetTile = (st as unknown as { setTile: (x: number, y: number, t: number, fx?: number, fy?: number) => unknown }).setTile.bind(st);
  (st as unknown as { setTile: (x: number, y: number, t: number, fx?: number, fy?: number) => unknown }).setTile = (x: number, y: number, t: number, fx?: number, fy?: number) => {
    if (rel === 77 && Math.abs(x - TX) <= 4 && Math.abs(y - TY) <= 4) {
      lines.push(`X rel=77 SETTILE x=${x} y=${y} t=${t} cur=${curDW} from=${new Error().stack?.split('\n')[2]?.trim().replace(/^at /, '').slice(0, 60)}`);
    }
    return oSetTile(x, y, t, fx, fy);
  };
  proto.updateLiquid = function (this: unknown) {
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    if (rel >= 76 && rel <= 79) {
      lines.push(`PRE rel=${rel} nl=${sim.numLiquid} nb=${sim.bufCount} wet=${(sim as unknown as { wetCounter: number }).wetCounter}`);
    }
    const r = oUpd.apply(this, arguments);
    rel++;
    if (rel === 77) findTracked(sim);
    if (rel >= 76 && rel <= 81) {
      const cells: string[] = [];
      for (let dy = -2; dy <= 2; dy++) {
        const i = (TY + dy) * s.w + TX;
        cells.push(`y${TY + dy}:liq=${s.liquid[i]} typ=${s.type[i]} act=${s.flags[i] & 1} slope=${s.slope[i]}`);
      }
      lines.push(`W rel=${rel} nl=${sim.numLiquid} nb=${sim.bufCount} ${cells.join(' ')}`);
      if (tracked) lines.push(`K rel=${rel} tracked=[${tstate(sim)}] amt=${s.liquid[TY * s.w + TX]}`);
      else lines.push(`K rel=${rel} tracked-absent amt=${s.liquid[TY * s.w + TX]}`);
      if (rel === 77) {
        // iter78 切片窗 [num5,num6) 与 tracked 槽位关系
        const cycles = sim['cycles' as never] as unknown as number;
        const curMax = sim['curMaxLiquid' as never] as unknown as number;
        const wet = sim['wetCounter' as never] as unknown as number;
        const slice = Math.floor(curMax / cycles);
        const t = tracked as E | null;
        const k = t ? sim.liquids.indexOf(t) : -1;
        lines.push(`C rel=77 cycles=${cycles} curMax=${curMax} wetCounter=${wet} slice=${slice} win=[${slice * (wet - 1)},${slice * wet}) trackedSlot=${k} inWin=${k >= slice * (wet - 1) && k < slice * wet}`);
      }
    }
    return r;
  };

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
    proto.update = oUpdate;
    proto.delWater = oDel;
    proto.addWater = oAdd;
  }
  writeFileSync(`${OUT}/dw-js.txt`, lines.join('\n') + '\n');
  console.log(`dw lines=${lines.length}`);
  console.log(lines.filter(l => !l.startsWith('W ')).slice(0, 80).join('\n'));
}, 600_000);
