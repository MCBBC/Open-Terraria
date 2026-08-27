// SSSSSSSS2 一次性诊断（2026-08-27）：Traps pass 隔离重放——cap 基座捕获 / rep 双仪对拍。
//   cap 模式：完整 generateWorld 至槽 75(Pass_Fallen_Log) 末态,存全通道状态 +
//   GenState + **GenSolid 覆写表快照** + 箱注册表 —— 消除隔离重放的翻转表伪影；
//   rep 模式：装载基座 → runTrapsPass → 与 x86 rig 同构 HashMark（att/pt/ptr+FNV）
//   与 TrapEv（A/C/E/D/T/K/BXC/VID/DTW）双流输出。
// 用法：cd game && SW_TRAPCAP=1 [SW_TSEED..] npx vitest run tools/_sss2traps.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, createWriteStream, mkdirSync, copyFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runResetAndTerrain, generateWorld } from '../src/world/gen/WorldGen';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';
import {
  snapshotGenSolid, restoreGenSolid,
} from '../src/world/gen/vanilla/GenSolid';

const MODE = process.env.SW_TRAPCAP === '1' ? 'cap' : process.env.SW_TRAPREPLAY === '1' ? 'rep' : '';
const G2 = process.env.SW_TG2 ?? '/tmp/jjj-out/g1457-notraps';
const SEEDTXT = process.env.SW_TSEED ?? '1896728457';
const EVIL = Number(process.env.SW_TEVIL ?? 1);
const FLAGS = (process.env.SW_TFLAGS ?? 'noTraps').split(',').filter(Boolean)
  .reduce<Record<string, boolean>>((m, f) => ((m[f] = true), m), {});
const W = Number(process.env.SW_TW ?? 4200), H = Number(process.env.SW_TH ?? 1200);
const OUTDIR = process.env.SW_SSS2OUT ?? '/tmp/sss2-out';
const BASEDIR = process.env.SW_TBASER ?? `${OUTDIR}/base-${SEEDTXT}`;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(MODE !== '' ? it : it.skip)('traps cap/rep', async () => {
  mkdirSync(BASEDIR, { recursive: true });
  if (MODE === 'cap') {
    let done = false;
    await generateWorld({
      width: W, height: H, seedText: SEEDTXT, evil: EVIL as -1 | 0 | 1,
      seedFlags: FLAGS,
      onWorldPartial: (w, i, nm) => {
        console.log(`partial i=${i} name=${nm}`);
        const LO = Number(process.env.SW_TCAP_LO ?? 24), HI = Number(process.env.SW_TCAP_HI ?? 36);
        if (Number.isNaN(Number(i)) || i < LO || i > HI) return;
        done = i === HI;
        writeFileSync(`${BASEDIR}/idx-${i}-name.txt`, nm);
        const st0 = w.store as never as Record<string, Uint8Array | Uint16Array>;
        const saveS = (n: string, arr: Uint8Array | Uint16Array) =>
          writeFileSync(`${BASEDIR}/${n}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
        // 全量保留（rep 模式随后用选中目录）
        saveS('type.bin', st0.type); saveS('flags.bin', st0.flags); saveS('wall.bin', st0.wall);
        saveS('liquid.bin', st0.liquid); saveS('liquidType.bin', st0.liquidType);
        saveS('half.bin', st0.half); saveS('slope.bin', st0.slope);
        saveS('frameX.bin', st0.frameX); saveS('frameY.bin', st0.frameY);
        saveS('wire.bin', st0.wire); saveS('paint.bin', st0.paint);
        writeFileSync(`${BASEDIR}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
        writeFileSync(`${BASEDIR}/chests.json`, JSON.stringify((w as unknown as { chests?: unknown[] }).chests ?? []));
        copyFileSync(`${BASEDIR}/gensolid.json`, `${BASEDIR}/gs-${i}.json`);
        copyFileSync(`${BASEDIR}/type.bin`, `${BASEDIR}/t-${i}.bin`);
        copyFileSync(`${BASEDIR}/flags.bin`, `${BASEDIR}/f-${i}.bin`);
        return;
        const save = (n: string, arr: Uint8Array | Uint16Array) =>
          writeFileSync(`${BASEDIR}/${n}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
        save('type.bin', st.type); save('flags.bin', st.flags); save('wall.bin', st.wall);
        save('liquid.bin', st.liquid); save('liquidType.bin', st.liquidType);
        save('half.bin', st.half); save('slope.bin', st.slope);
        save('frameX.bin', st.frameX); save('frameY.bin', st.frameY);
        save('wire.bin', st.wire); save('paint.bin', st.paint);
        writeFileSync(`${BASEDIR}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
        writeFileSync(`${BASEDIR}/chests.json`, JSON.stringify((w as unknown as { chests?: unknown[] }).chests ?? []));
        console.log(`captured slot ${i}(dump 075) end → ${BASEDIR}`);
      },
    });
    console.log('capture run finished');
    return;
  }
  // ---- rep ----
  const ld = (n: string) => new Uint8Array(readFileSync(`${BASEDIR}/${n}`).buffer.slice(0));
  const ld16 = (n: string) => new Uint16Array(readFileSync(`${BASEDIR}/${n}`).buffer.slice(0));
  const base = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS });
  const gs = base.gs;
  const st = base.world.store;
  st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
  st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
  st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
  st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
  st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${BASEDIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  console.log(`worldSurface=${gs.worldSurface} rockLevel=${gs.rockLevel}`);

  const hm = createWriteStream(`${OUTDIR}/j-hmark-sss2.txt`);
  const tr = createWriteStream(`${OUTDIR}/j-traptrace.txt`);
  let tbuf: string[] = [], ebuf: string[] = [];
  const flushT = () => { if (tbuf.length) { hm.write(tbuf.join('\n') + '\n'); tbuf = []; } };
  const flushE = () => { if (ebuf.length) { tr.write(ebuf.join('\n') + '\n'); ebuf = []; } };

  let fnv = 2166136261 >>> 0;
  let ln = 0;
  let on = false;
  let eseq = 0;
  const TEVMAX = Number(process.env.SW_TEVMAX ?? 3000000);
  const G_ = globalThis as unknown as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swTrapHm?: (l: string) => void;
    __swTrapEv?: (kind: string, a: number, b: number, v: number) => void;
    __swRollN?: number;
  };
  G_.__swOnRoll = (v: number) => {
    if (!on) return;
    ++ln;
    G_.__swRollN = ln;
    fnv = Math.imul((fnv ^ v) >>> 0, 16777619) >>> 0;
  };
  G_.__swTrapHm = (label: string) => {
    if (!on) return;
    tbuf.push(`${label} ln=${ln} hash=${fnv}`);
    flushT();
  };
  G_.__swTrapEv = (kind: string, a: number, b: number, v: number) => {
    if (!on || eseq >= TEVMAX) return;
    ebuf.push(`++${++eseq}|${kind}|${a}|${b}|${v}|ln${ln}|rc${ln}`);
    if (ebuf.length >= 65536) flushE();
  };

  base.rng.reseed(base.seed);
  on = true;
  const chests = JSON.parse(readFileSync(`${BASEDIR}/chests.json`, 'utf8')) as Array<{ x: number; y: number; items: unknown[] }>;
  const t0 = Date.now();
  try {
    runTrapsPass(st, base.rng, gs, chests);
  } finally {
    on = false;
  }

  await new Promise<void>((res) => {
    flushT();
    flushE();
    hm.end(() => res());
  });
  console.log(`runTrapsPass done ${((Date.now() - t0) / 1000).toFixed(1)}s total_rolls=${ln}`);
  console.log(`hmark=${OUTDIR}/j-hmark-sss2.txt traptrace=${OUTDIR}/j-traptrace.txt ev=${eseq}`);
}, 600000);
