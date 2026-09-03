// ★IIIII107 一次性仪①：REMIX #99 CactusPalmTreesAndCoral「前后夹逼」快照+决策账本。
// 全管线 remix(seed 1138154190/4200×1200/evil 0) 跑到「二次沉降」(#98)槽末拍基座 B
// （=dump098 应逐位全等）、进「仙人掌珊瑚」(#99) 后记录掷流/决策/写面，槽末拍 A
// （vs dump099 应复现 A=1909/T=1975）。分析器=tools/_iii130ana.mjs。
// 用法：cd game && SW_I130=1 npx vitest run tools/_iii130cap.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { setCcTrace } from '../src/world/gen/vanilla/StructuresPass';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I130 === '1';
const OUT = process.env.I130_OUT ?? '/tmp/iii130-out';

(RUN ? it : it.skip)('iii130 capture pass99 base/post + ledger', async () => {
  mkdirSync(OUT, { recursive: true });
  // JS 内部 type → vanilla sheet 名表（分析器 id 空间换算用；-1=未注册）
  {
    const sheet = new Int32Array(TILE_DEFS.length).fill(-1);
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const s = TILE_DEFS[i]?.vanilla?.sheet;
      if (typeof s === 'number') sheet[i] = s;
    }
    writeFileSync(`${OUT}/sheet.bin`, Buffer.from(sheet.buffer));
  }
  const W = 4200, H = 1200;
  let rollCount = 0;
  let passActive = false;
  let lastInst: unknown = null;
  let store: TileStore | null = null;
  const rolls: number[] = [];        // pass99 期间 InternalSample 原始值流
  const writes: number[] = [];       // [rc,x,y,t,fx,fy]×n
  const ledger: string[] = [];       // 决策行（CC 列/锚/分支 + PLANT/KILL/CPLACE）
  const g = globalThis as unknown as Record<string, unknown>;

  g.__swOnRoll = (value: number, inst: unknown) => {
    rollCount++;
    lastInst = inst;
    if (passActive && rolls.length < 12_000_000) rolls.push(value);
  };
  g.__swMbDraws = () => rollCount;
  g.__swSeg = (name: string) => {
    if (passActive && ledger.length < 600_000 && String(name).startsWith('CC ')) {
      ledger.push(`${name} @${rollCount}`);
    }
  };

  // ★注意：lastInst=UnifiedRandom 本体（internalSample 的 this），seedArray/inext 直挂。
  //   仅作旁证记录——pass 头 reseed 后重放用 new RNG(seed) 即可（每 pass 头重播种子）。
  const captureRng = (): { seedArray: number[]; inext: number; rolls: number } | null => {
    const inst = lastInst as { seedArray?: Int32Array; inext?: number } | null;
    if (!inst?.seedArray) return null;
    return { seedArray: Array.from(inst.seedArray), inext: inst.inext ?? -1, rolls: rollCount };
  };

  const snap = (pfx: string): void => {
    const s = store!;
    const rec = s as unknown as Record<string, Uint8Array | Uint16Array>;
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire']) {
      const v = rec[c]!;
      writeFileSync(`${OUT}/${pfx}_${c}.bin`, Buffer.from(v.buffer, v.byteOffset, v.byteLength));
    }
  };

  const origSet = TileStore.prototype.setTileSilent;
  TileStore.prototype.setTileSilent = function (this: unknown, x: number, y: number, t?: number, fx?: number, fy?: number) {
    if (passActive && writes.length < 1_200_000) writes.push(rollCount, x, y, t ?? 0, fx ?? 0, fy ?? 0);
    return origSet.call(this, x, y, t, fx, fy);
  } as typeof TileStore.prototype.setTileSilent;

  g.__swCcCap = () => {
    passActive = true;
    ledger.push(`#ENTRY rc=${rollCount}`);
  };
  setCcTrace({
    plant: (i, j) => { if (ledger.length < 600_000) ledger.push(`PLANT ${i},${j} @${rollCount}`); },
    kill: (i, j) => { if (ledger.length < 600_000) ledger.push(`KILL ${i},${j} @${rollCount}`); },
    place: (x, y) => { if (ledger.length < 600_000) ledger.push(`CPLACE ${x},${y} @${rollCount}`); },
  });

  let rcBase = -1;
  try {
    await generateWorld({
      width: W, height: H, seedText: '1138154190', evil: 0,
      seedFlags: { remix: true },
      onWorldPartial: (w, _i, pn) => {
        store = w.store;
        if (pn === '二次沉降') {
          rcBase = rollCount;
          snap('b');
          const gs = lastGenState() as unknown as Record<string, unknown>;
          writeFileSync(`${OUT}/meta-base.json`, JSON.stringify({
            rcBase, rng: captureRng(),
            gsPick: {
              worldSurface: gs.worldSurface, rockLevel: gs.rockLevel, lavaLine: gs.lavaLine,
              beachDistance: gs.beachDistance, numOasis: gs.numOasis,
              oasisX: gs.oasisX, oasisY: gs.oasisY, oasisW: gs.oasisW,
            },
          }));
          ledger.push(`#BASE rc=${rollCount}`);
        }
        if (pn === '仙人掌珊瑚') {
          passActive = false;
          snap('a');
          writeFileSync(`${OUT}/meta-end.json`, JSON.stringify({
            rcEnd: rollCount, rollStreamLen: rolls.length, writeCount: writes.length / 6,
          }));
          // 掷流（i32 原始值）二进制落盘
          writeFileSync(`${OUT}/rolls99.bin`, Buffer.from(Int32Array.from(rolls).buffer));
          // 写面账本（6 列一组）
          {
            const out: string[] = [];
            for (let k = 0; k + 5 < writes.length; k += 6) {
              out.push(`${writes[k]},${writes[k + 1]},${writes[k + 2]},${writes[k + 3]},${writes[k + 4]},${writes[k + 5]}`);
            }
            writeFileSync(`${OUT}/writes99.txt`, out.join('\n') + '\n');
          }
          writeFileSync(`${OUT}/ledger99.txt`, ledger.join('\n') + '\n');
          console.log(`[iii130] captured: rcBase=${rcBase} rcEnd=${rollCount} rolls=${rolls.length} writes=${writes.length / 6} ledger=${ledger.length}`);
        }
      },
    });
  } finally {
    TileStore.prototype.setTileSilent = origSet;
    setCcTrace(null);
    delete g.__swCcCap;
    delete g.__swSeg;
  }
}, 900_000);
