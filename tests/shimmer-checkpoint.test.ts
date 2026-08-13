// 微光链逐 pass 检查点对账（vs C# caves-oracle 的 Shimmer 段金标）：
// shimemr-audit-status 登记的唯一遗留——微光生成侧此前只靠逐行注释+行号对齐，
// 无独立 checkpoint 金标。本文件补上：JS 侧按 oracle 同序直调 run*Pass，对
// Beaches 之后的 Gems→GravitatingSand→OceanCaves→Shimmer（1456 注册序 15109/
// 15198/15228/15256）每段落做 type/flags/liquid FNV-1a，与
// tools/golden/caves-oracle.cs 的同名 Checkpoint 金标逐项比对。
//
// 金标再生成：dotnet run tools/golden/caves-oracle.cs <seedInt> <evil> <out.json>
//   （seedInt：数字种子原样；文本种子取 translateSeed 的 Crc32——"SandboxWorld"=1511931452）
// 金标落 tests/golden/shimmer-chain-<seedText>.json（caves-chain-* 归洞穴链代理所有，不碰）。
//
// 裁决域与前置条件：
//  - terrain..beaches 前缀链的对账归 tests/caves-checkpoint.test.ts（本文件只打印
//    对照表不裁决——多代理并发期该前缀可能正被地牢 pass 的修复临时染红）。
//  - 裁决前置 = RNG 流位置指纹（UnifiedRandom.SeedArray[56]+inext 的 FNV，oracle
//    "stream" 段）：beaches→shimmer 全段一致 ⟹ 掷骰数逐点对齐，shimmer 段的
//    网格哈希才有裁决力；网格仍分叉即真实写格偏差（非流漂移）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass, runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass, runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { runMushroomPass } from '../src/world/gen/vanilla/MushroomPass';
import { runMarblePass, runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtToMudPass, runSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';
import { runShiniesPass, runGemsPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runGravitatingSandPass } from '../src/world/gen/vanilla/GravitatingSandPass';
import { runOceanCavesPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runShimmerPass } from '../src/world/gen/vanilla/ShimmerPass';
import { newGenState } from '../src/world/gen/vanilla/GenState';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { fnv1a } from './pass-hash.test';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}
/** 原版 sheet id → 内部 tile id（首见者）。状态恢复用；ShimmerPass 行为判定的
 *  关键 sheet（1/25/203/165/231/583-590）首见 id 与 TILE_BY_KEY 逐一同源已核。 */
const INV_SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !INV_SHEET.has(s)) INV_SHEET.set(s, i);
}

function hashGrids(st: { type: Uint16Array; flags: Uint8Array; liquid: Uint8Array; w: number; h: number }) {
  const n = st.w * st.h;
  const mapped = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    if (!st.flags[i]) continue;               // 只比活性 type（口径同 caves-checkpoint）
    const v = V_ID[st.type[i]];
    mapped[i] = v < 0 ? 0x7fff : v;
  }
  return `${fnv1a(mapped)} ${fnv1a(st.flags)} ${fnv1a(st.liquid)}`;
}

/** RNG 流位置指纹：UnifiedRandom.SeedArray[56] + inext 逐字节 FNV-1a（oracle StreamHash 同算法）。
 *  与网格哈希正交：指纹一致而网格分叉 = 写格内容偏差；指纹分叉 = 掷骰数分叉（流已漂）。 */
function streamHash(rng: RNG): string {
  const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < ur.seedArray.length; i++) {
    const v = ur.seedArray[i] | 0;
    for (let b = 0; b < 4; b++) step(v >>> (8 * b));
  }
  const ix = ur.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}

/** 微光链检查点（金标 + JS 同名落点）。
 *  前缀段（terrain..beaches）与 caves-checkpoint.chainCheckpoints 逐行同构——
 *  为避免 import 副作用（连带其 describe 跑挂）在此独立复刻，顺序改动须两处同步。 */
function shimmerChain(seedText: string, evil: 0 | 1) {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil });
  const st = world.store;
  const grids = new Map<string, string>();
  const streams = new Map<string, string>();
  const snap = (n: string) => { grids.set(n, hashGrids(st)); streams.set(n, streamHash(rng)); };
  grids.set('terrain', hashGrids(st)); streams.set('terrain', streamHash(rng));
  runDunesPass(st, rng, gs); snap('dunes');
  runOceanSandPass(st, rng, gs); snap('oceansand');
  runSandPatchesPass(st, rng, gs); snap('sandpatches');
  runTunnelsPass(st, rng, gs); snap('tunnels');
  runMountCavesPass(st, rng, gs); snap('mountaincaves');
  runDirtWallBgPass(st, rng, gs); snap('dirtwallbg');
  runRocksAndClayPass(st, rng, gs); snap('rocksclay');
  runSmallHolesPass(st, rng, gs); snap('smallholes');
  runCavesPass(st, rng, gs); snap('surfacecaves');
  // 1456 注册序：SurfaceCaves(12191) → IceBiome(12343) → Grass(12454) → Jungle(12497)
  //   → MudCaves(12499) → Desert(12532) → … → Lakes(14613) → Slush(14756) →
  //   Dungeon(14816) → MCOpenings(14932) → Beaches(14947) →
  //   Gems(15109) → GravitatingSand(15198) → OceanCaves(15228) → Shimmer(15256)
  runIceBiomePass(st, rng, gs); snap('icebiome');
  runGrassPass(st, rng, gs); snap('grass');
  runJunglePass(st, rng, gs); snap('jungle');
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!); snap('mudcaves');
  const desc = runDesertMoundOnly(st, rng, gs); snap('desertmound');
  runDesertEntrancesAndHive(st, rng, gs, desc, () => snap('desertentrance'));
  snap('deserthive');
  runMushroomPass(st, rng, gs); snap('mushroom');
  runMarblePass(st, rng, gs); snap('marble');
  runGranitePass(st, rng, gs); snap('granite');
  runFloatingIslandsPass(st, rng, gs); snap('islands');
  runDirtToMudPass(st, rng, gs); snap('dirttomud');
  runSiltPass(st, rng, gs); snap('silt');
  runShiniesPass(st, rng, gs); snap('ores');
  runWebsPass(st, rng, gs); snap('webs');
  runUnderworldPass(st, rng, gs); snap('underworld');
  runCorruptionPass(st, rng, gs); snap('corruption');
  runLakesPass(st, rng, gs); snap('lakes');
  runSlushPass(st, gs); snap('slush');
  runDungeonPass(st, rng, gs, world.chests, (n) => snap(n));
  runMountainCavesPass(st, rng, gs); snap('mcopenings');
  runBeachesPass(st, rng, gs); snap('beaches');
  // ============ 微光链裁决段（本文件新增，oracle cs:15109-15308） ============
  runGemsPass(st, rng, gs); snap('gems');
  runGravitatingSandPass(st, gs); snap('gravitatingsand');   // 零掷骰：stream 应与 gems 同指纹
  runOceanCavesPass(st, rng, gs); snap('oceancaves');
  runShimmerPass(st, rng, gs, (n) => snap(n));
  return { grids, streams, shimmerX: gs.shimmerX, shimmerY: gs.shimmerY };
}

const PREFIX_NAMES = ['terrain', 'dunes', 'oceansand', 'sandpatches', 'tunnels',
  'mountaincaves', 'dirtwallbg', 'rocksclay', 'smallholes', 'surfacecaves',
  'icebiome', 'grass', 'jungle', 'mudcaves', 'desertmound',
  'desertentrance', 'deserthive', 'mushroom', 'marble', 'granite', 'islands',
  'dirttomud', 'silt', 'ores', 'webs', 'underworld', 'corruption', 'lakes',
  'slush', 'dungeon', 'mcopenings', 'beaches'];
/** 微光段裁决检查点（须全部存在于金标与 JS 两侧） */
const SHIMMER_NAMES = ['gems', 'gravitatingsand', 'oceancaves',
  'shimmershell', 'shimmerpillars', 'shimmeropen', 'shimmer'];

interface Golden {
  checkpoints: string[]; stream: string[];
  worldSurface: number; rockLayer: number;
  shimmerX: number; shimmerY: number; dungeonRight: number;
}
function loadGolden(file: string) {
  const golden = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./golden/${file}`, import.meta.url)), 'utf8'),
  ) as Golden;
  const gold = new Map<string, string>();
  for (const line of golden.checkpoints) {
    const [name, typ, act, , liq] = line.split(/[| ]+/);
    gold.set(name, `${typ} ${act} ${liq}`);
  }
  const goldStream = new Map<string, string>();
  for (const line of golden.stream) {
    const [name, hash] = line.split('|');
    goldStream.set(name, hash);
  }
  return { golden, gold, goldStream };
}

describe('微光链逐段对账（vs C# caves-oracle Shimmer 段金标）', () => {
  const cases = [
    { file: 'shimmer-chain-9293480.json', seedText: '9293480', evil: 0 as const },
    { file: 'shimmer-chain-SandboxWorld.json', seedText: 'SandboxWorld', evil: 1 as const },
  ];
  for (const c of cases) {
    it(`种子 ${c.seedText}（全链）：RNG 流对齐 + 微光段哈希全等`, (ctx) => {
      const { golden, gold, goldStream } = loadGolden(c.file);
      const res = shimmerChain(c.seedText, c.evil);
      // 前缀对照表（信息性，裁决归 caves-checkpoint）
      for (const n of PREFIX_NAMES) {
        const ok = res.grids.get(n) === gold.get(n);
        console.log(`${n.padEnd(15)} ${res.grids.get(n)} vs ${gold.get(n)} ${ok ? '✓' : '✗(前缀·非本文件裁决)'}`);
      }
      // 裁决前置：beaches 处 RNG 流须已对齐——上游 pass（地牢等）并发修复期可能
      // 临时分叉，此时下游哈希失裁决力，让位给状态恢复用例（同 describe 下一条）
      if (res.streams.get('beaches') !== goldStream.get('beaches')) {
        console.log(`beaches:stream     ${res.streams.get('beaches')} vs ${goldStream.get('beaches')} ✗ → 上游 pass 掷骰数分叉（他人 WIP），全链裁决让位状态恢复用例`);
        ctx.skip();
        return;
      }
      let firstBadStream = '';
      for (const n of ['beaches', ...SHIMMER_NAMES]) {
        const ok = res.streams.get(n) === goldStream.get(n);
        if (!ok && !firstBadStream) firstBadStream = n;
        console.log(`${`${n}:stream`.padEnd(18)} ${res.streams.get(n)} vs ${goldStream.get(n)} ${ok ? '✓' : '✗'}`);
      }
      expect(firstBadStream, 'RNG 流首个分叉点').toBe('');
      let firstBad = '';
      for (const n of SHIMMER_NAMES) {
        const ok = res.grids.get(n) === gold.get(n);
        if (!ok && !firstBad) firstBad = n;
        console.log(`${n.padEnd(15)} ${res.grids.get(n)} vs ${gold.get(n)} ${ok ? '✓' : '✗'}`);
      }
      expect(firstBad, '微光段首个分歧检查点').toBe('');
      console.log(`shimmerPosition  (${res.shimmerX},${res.shimmerY}) vs (${golden.shimmerX},${golden.shimmerY})`);
      expect([res.shimmerX, res.shimmerY]).toEqual([golden.shimmerX, golden.shimmerY]);
    }, 300000);

    // ===== 状态恢复对账：Shimmer pass 的独立裁决通道 =====
    // oracle 以 SW_DUMP_SHIMMER=1 落「Shimmer pass 之前」的完整网格 + UnifiedRandom
    // 内部态（tests/golden/shimmer-state-<seed>.bin.gz）。在此态上直跑 runShimmerPass，
    // 与金标 shimmer 四段检查点对账——不经过上游任何 pass，裁决力与全链等价且
    // 不受上游并发 WIP 影响。金标再生成：
    //   SW_DUMP_SHIMMER=1 dotnet run tools/golden/caves-oracle.cs <seedInt> <evil> <out>
    //   gzip -9 <out>.shimstate > tests/golden/shimmer-state-<seedText>.bin.gz
    it(`种子 ${c.seedText}（状态恢复）：Shimmer pass 逐段哈希全等`, () => {
      const { golden, gold, goldStream } = loadGolden(c.file);
      const raw = gunzipSync(readFileSync(
        fileURLToPath(new URL(`./golden/shimmer-state-${c.seedText}.bin.gz`, import.meta.url)),
      ));
      let p = 0;
      const i32 = () => { const v = raw.readInt32LE(p); p += 4; return v; };
      const w = i32(), h = i32();
      const inext = raw.readUInt32LE(p); p += 4;
      const seedArray = new Int32Array(56);
      for (let i = 0; i < 56; i++) seedArray[i] = i32();
      // 定长裸数组（oracle Write(byte[],0,len)）：act[n] typ[2n] wal[2n] liq[n] liqT[n]
      const nt = w * h;
      const take = (len: number): Buffer => { const out = raw.subarray(p, p + len) as Buffer; p += len; return out; };
      const act = take(nt), typLE = take(nt * 2), walLE = take(nt * 2), liq = take(nt), liqT = take(nt);
      expect([w, h]).toEqual([4200, 1200]);

      const st = new TileStore(w, h);
      const n = w * h;
      const missing = new Set<number>();
      for (let i = 0; i < n; i++) {
        const sheet = typLE[i * 2] | (typLE[i * 2 + 1] << 8);
        const id = INV_SHEET.get(sheet);
        if (id === undefined) { missing.add(sheet); continue; }
        st.type[i] = id;
        st.flags[i] = act[i];
        st.wall[i] = walLE[i * 2] | (walLE[i * 2 + 1] << 8);
        st.liquid[i] = liq[i];
        st.liquidType[i] = liqT[i] + 1;   // oracle 用原版液型 id（0水/1岩浆/3微光）→ 仓库 +1
      }
      expect([...missing], '金标含未注册的原版 sheet').toEqual([]);

      const rng = new RNG(1);             // 种子任意，内部态随下一行整体覆写
      const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
      ur.seedArray.set(seedArray);
      ur.inext = inext;
      const gs = newGenState(w, h);
      gs.worldSurface = golden.worldSurface;
      gs.rockLevel = golden.rockLayer;
      gs.dungeonSide = golden.dungeonRight ? 1 : -1;

      const grids = new Map<string, string>();
      const streams = new Map<string, string>();
      runShimmerPass(st, rng, gs, (name) => {
        grids.set(name, hashGrids(st));
        streams.set(name, streamHash(rng));
      });
      let firstBad = '';
      for (const name of ['shimmershell', 'shimmerpillars', 'shimmeropen', 'shimmer']) {
        const okG = grids.get(name) === gold.get(name);
        const okS = streams.get(name) === goldStream.get(name);
        if (!okG && !firstBad) firstBad = name;
        console.log(`${name.padEnd(15)} ${grids.get(name)} vs ${gold.get(name)} ${okG ? '✓' : '✗'}  stream ${streams.get(name)} vs ${goldStream.get(name)} ${okS ? '✓' : '✗'}`);
      }
      expect(firstBad, 'Shimmer pass 首个分歧段（网格）').toBe('');
      for (const name of ['shimmershell', 'shimmerpillars', 'shimmeropen', 'shimmer']) {
        expect(streams.get(name), `${name} RNG 流指纹`).toBe(goldStream.get(name));
      }
      console.log(`shimmerPosition  (${gs.shimmerX},${gs.shimmerY}) vs (${golden.shimmerX},${golden.shimmerY})`);
      expect([gs.shimmerX, gs.shimmerY]).toEqual([golden.shimmerX, golden.shimmerY]);
    }, 120000);
  }
});
