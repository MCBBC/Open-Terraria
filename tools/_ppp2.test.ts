// PPPPPPP 一次性诊断：DeadMans 全链路判定日志（isGood 每候选/后置门计数/sink 快照）
// 用法：cd game && SW_PPP=1 SW_MB_1457=1 SW_PPP_SEED=9293480 npx vitest run tools/_ppp2.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';

const RUN = process.env.SW_PPP === '1';
const SEED = process.env.SW_PPP_SEED ?? '9293480';
const EVIL = Number(process.env.SW_PPP_EVIL ?? 0);
const MB1457 = process.env.SW_MB_1457 === '1';
const W = Number(process.env.SW_PPP_W ?? 4200), H = 1200;
const OUT = process.env.SW_PPP_OUT ?? '/tmp/ppp-out/ppp2-g.json';

(RUN ? it : it.skip)('ppp2 deadmans full-trace', async () => {
  const goodLog: Array<{ p: string; r: boolean }> = [];
  const trapLog: Array<{ p: string; r: boolean; d: number; b: number; e: number }> = [];
  const possLog: string[] = [];
  const placeLog: Array<{ p: string; ok: boolean; d: number; b: number; e: number }> = [];
  let curCand = '';

  const chestEv: Array<{ ph: string; i: number; j: number; r?: number; st?: string }> = [];
  (globalThis as { __swChestEv?: unknown }).__swChestEv = (ph: string, i: number, j: number, r?: number) => {
    if (i >= 2800 && i <= 2900) {
      let st: string | undefined;
      if (ph === 'ab' && j < 400) {
        st = (new Error().stack ?? '').split('\n').slice(2, 6).map((l) => l.replace(/^.*?(src\/[^ (]+).*$/, '$1')).join(' <- ');
      }
      chestEv.push({ ph, i, j, r, st });
    }
  };
  const proto = DeadMansChestBiome.prototype as unknown as Record<string, (...a: never[]) => unknown>;

  // isAGoodSpot：每候选一行（与 x86 CAND 行同构）
  const oIsGood = proto.isAGoodSpot as (this: any, x: number, y: number) => boolean;
  proto.isAGoodSpot = function (this: any, x: number, y: number) {
    const r = oIsGood.call(this, x, y) as boolean;
    if (curCand !== `${x},${y}`) { curCand = `${x},${y}`; }
    goodLog.push({ p: `${x},${y}`, r });
    return r;
  };
  // areThereEnoughTraps：内部计数（place/getPossible 各自的 find* 已跑完，零额外掷）
  const oEnough = proto.areThereEnoughTraps as (this: any) => boolean;
  proto.areThereEnoughTraps = function (this: any) {
    const r = oEnough.call(this) as boolean;
    trapLog.push({ p: curCand, r, d: this.darts.length, b: this.boulders.length, e: this.explosives.length });
    return r;
  };
  // getPossibleChests：终榜 + sink 快照（含格上贴图）
  let snapOut: unknown = null;
  let scalars: unknown = null;
  const oPoss = proto.getPossibleChests as (this: any) => Array<{ x: number; y: number }>;
  proto.getPossibleChests = function (this: any) {
    const st = this.st;
    // 世界标量（num9 门边界诊断）
    scalars = { ws: this.gs.worldSurface, rl: this.gs.rockLevel, gws: this.gs.genWorldSurface };
    const snap = (this.chestList as Array<{ x: number; y: number }>).map((c) => {
      if (!st.inBounds(c.x, c.y)) return { p: `${c.x},${c.y}`, t: -1, fx: -1 };
      const i = st.idx(c.x, c.y);
      return { p: `${c.x},${c.y}`, t: st.type[i], fx: st.frameX[i] };
    });
    snapOut = snap;
    const out = oPoss.call(this) as Array<{ x: number; y: number }>;
    for (const c of out) possLog.push(`${c.x},${c.y}`);
    return out;
  };
  // place：受理面计数
  const oPlace = proto.place as (this: any, ox: number, oy: number) => boolean;
  proto.place = function (this: any, ox: number, oy: number) {
    const ok = oPlace.call(this, ox, oy) as boolean;
    placeLog.push({ p: `${ox},${oy}`, ok, d: this.darts.length, b: this.boulders.length, e: this.explosives.length });
    return ok;
  };

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: MB1457 ? undefined : undefined,
  });

  // 落盘：判定流+终榜+place 计数+sink 快照
  writeFileSync(OUT, JSON.stringify({ seed: SEED, evil: EVIL, mb1457: MB1457, goodLog, trapLog, poss: possLog, places: placeLog, snap: snapOut, scalars, chestEv }));
  console.log(`good=${goodLog.filter(g => g.r).length}/${goodLog.length} poss=${possLog.length} places=${placeLog.length} -> ${OUT}`);
}, 600_000);
