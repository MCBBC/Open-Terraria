// 洞穴链逐 pass 检查点对账（种子等价 L1 裁决工具）：
// JS 侧按 oracle 同序直调各 run*Pass，每 pass 后对 type(vanilla 映射)/flags/liquid
// 做 FNV-1a，与 tools/golden/caves-oracle.cs（C# 复刻+反射真 UnifiedRandom）的
// 金标逐项比对。wall 暂不比（我们 Terrain 自加渲染墙，原版墙由 DirtWallBg 等后置
// pass 铺——wall 等价是独立对账项）。
// 金标再生成：dotnet run tools/golden/caves-oracle.cs <seedInt> <evil> <out.json>
//
// ★每 pass 种子重播后（2026-08-16）转写债新位置（对账层互绿硬验证已过：
// SandboxWorld 全链仅 livingtrees 红；dungeonG 前状态逐位 dump 全等）：
//   - 9293480：dungeonI（DgLights 灯/吊灯/开关放置）起红——dungeonG 输入态
//     typ/act/wal 三数组 0 差异、掷骰流对齐，分歧在 dgLights 的门链
//     （isDT/featOK/entBounds.contains/placeChand 之一，数据触发的分支差），
//     其后全部级联红（beaches 流指纹仍 ✓=掷骰数一致，网格差为写入差）。
//   - SandboxWorld：livingtrees 起红（原转写债位置不变；LivingTreePass 01:33
//     在途 WIP 未 oracle 同步）。旧 oceancaves 债位已随流变消失（现双种子绿）。
//   两债已于 2026-08-16 收口：dungeonI=SetCrackedBrickSolidity 裂纹砖翻转
//   （JS 四消费端 genSolidType 化）；livingtrees=石堆底中锚/门 3 掷/宝箱
//   flags/根系门 wall!=244 四处双修。现 3/3 全绿零红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
import { runIceBiomePass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { runMushroomPass } from '../src/world/gen/vanilla/MushroomPass';
import { runMarblePass, runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtToMudPass, runSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';
import { runShiniesPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runGemsPass } from '../src/world/gen/vanilla/ShiniesPass';
import { gravitatingSandPass, vanillaCleanup } from '../src/world/gen/WorldGen';
import { runOceanCavesPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runShimmerPass } from '../src/world/gen/vanilla/ShimmerPass';
import { runPyramidPass, runWetJunglePass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtRockWallRunnerPass } from '../src/world/gen/vanilla/DirtRockWallRunnerPass';
import { runLivingTreesPass, runLivingTreeWallsPass } from '../src/world/gen/vanilla/LivingTreePass';
import { runAltarsPass } from '../src/world/gen/vanilla/CorruptionPass';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE_DEFS } from '../src/data/tiles';
import { fnv1a } from './pass-hash.test';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

function hashGrids(st: { type: Uint16Array; flags: Uint8Array; liquid: Uint8Array; wall: Uint16Array; w: number; h: number }) {
  const n = st.w * st.h;
  const mapped = new Uint16Array(n);
  const ghost = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = V_ID[st.type[i]];
    if (st.flags[i]) mapped[i] = v < 0 ? 0x7fff : v;
    else ghost[i] = v < 0 ? 0x7fff : v; // 幽灵 parity：inactive 格的残留 type
  }
  return `${fnv1a(mapped)} ${fnv1a(st.flags)} ${fnv1a(st.liquid)}`;
}

/** wall 单独哈希——只对沙漠段启用：此前 pass 的 JS 墙与 oracle 有既知偏差
 *  （Terrain 自加渲染墙），到 desertmound 为止 wall 不具裁决力；沙漠 Sub-B/C
 *  以墙(187/216)为核心输出，从这里开始逐哈希比对。 */
function hashWalls(st: { wall: Uint16Array }): string {
  return fnv1a(st.wall);
}

function hashGhost(st: { type: Uint16Array; flags: Uint8Array; w: number; h: number }): string {
  const n = st.w * st.h;
  const ghost = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    if (st.flags[i]) continue;
    const v = V_ID[st.type[i]];
    ghost[i] = v < 0 ? 0x7fff : v;
  }
  return fnv1a(ghost);   // fnv1a 返回 hex string（注解曾是 number——陈旧签名残留）
}

/** 导出给 tests/_freeze-caves.test.ts（SW_FREEZE_CAVES=1 冻结基线再生用） */
export function chainCheckpoints(seedText: string, evil: 0 | 1) {
  const { world, rng, gs, seed } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil });
  const st = world.store;
  const out = new Map<string, string>();
  const outWall = new Map<string, string>();
  // ★每 pass 种子重播（2026-08-16 num4 破解收尾）：原版每个 GenPass 执行前
  //   Main.rand = new UnifiedRandom(_seed)（1456 WorldGenerator.cs:497，IL 实证）
  //   ⇒ 各 pass 掷骰流均从 stream(seed) 第 0 掷开始，pass 间不续流——与
  //   caves-oracle 的 44 处 Replay() 调用点逐一同构。零掷骰 pass（mudcaves/slush/
  //   gravitatingsand/livingtreewalls/surfacewaterinjungle）的重播是流空转，但
  //   oracle 侧同样重播——为保 stream 指纹同构，一律照播。pass 内多检查点段
  //   （desert 的 entrance/hive、dungeon 17 段、shimmer 的 pillars/open）不重播。
  const replay = () => rng.reseed(seed);
  // RNG 流指纹探针（SW_STREAM_PROBE=1 时逐检查点打印；同 oracle StreamHash 算法）
  const streamProbe = typeof process !== 'undefined' && !!process.env.SW_STREAM_PROBE;
  const streamHash = (): string => {
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
  };
  const snap = (name: string) => {
    out.set(name, hashGrids(st)); outWall.set(name, hashWalls(st));
    if (streamProbe) console.log(`STREAM ${name}|${streamHash()}`);
    // 网格导出钩子(对账插桩:dormant——__cavesGridExport 存在时 dump 指定检查点的 typ/act)
    const ex = (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport;
    if (ex && ex.at === name) {
      const n = st.w * st.h;
      const typ = Buffer.alloc(n * 2), act = Buffer.alloc(n), wal = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) { typ.writeUInt16LE(st.type[i] & 0xffff, i * 2); act[i] = st.flags[i] ? 1 : 0; wal.writeUInt16LE(st.wall[i] & 0xffff, i * 2); }
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(`${ex.dir}.typ`, typ); writeFileSync(`${ex.dir}.act`, act); writeFileSync(`${ex.dir}.wal`, wal);
      // granite 首红猎杀（2026-08-17）：坡位/半砖通道一并导出（BuildMagmaMap 的
      // SolidTile 谓词 slope 敏感——granite 红裁决需六通道）
      writeFileSync(`${ex.dir}.slope`, st.slope); writeFileSync(`${ex.dir}.half`, st.half);
    }
  };
  out.set('terrain', hashGrids(st));
  replay(); // ▶Dunes cs:11540（pass 头含地牢主题掷+入口三掷——见 DunesPass 头注）
  runDunesPass(st, rng, gs); out.set('dunes', hashGrids(st));
  replay(); // ▶OceanSand cs:11603
  runOceanSandPass(st, rng, gs); out.set('oceansand', hashGrids(st));
  replay(); // ▶SandPatches cs:11712
  runSandPatchesPass(st, rng, gs); out.set('sandpatches', hashGrids(st));
  replay(); // ▶Tunnels cs:11743
  runTunnelsPass(st, rng, gs); out.set('tunnels', hashGrids(st));
  replay(); // ▶MountainCaves cs:11809
  runMountCavesPass(st, rng, gs); out.set('mountaincaves', hashGrids(st));
  replay(); // ▶DirtWallBackgrounds cs:11883
  runDirtWallBgPass(st, rng, gs); out.set('dirtwallbg', hashGrids(st));
  replay(); // ▶RocksInDirt cs:11922（runRocksAndClayPass 内部另有两处子 pass 重播）
  runRocksAndClayPass(st, rng, gs); out.set('rocksclay', hashGrids(st));
  replay(); // ▶SmallHoles cs:12034
  runSmallHolesPass(st, rng, gs); out.set('smallholes', hashGrids(st));
  replay(); // ▶DirtLayerCaves cs:12094（runCavesPass 内部另有两处子 pass 重播）
  runCavesPass(st, rng, gs); out.set('surfacecaves', hashGrids(st));
  // 1456 注册序（执行序=注册序，WorldGenerator.cs:447）：
  //   14 SurfaceCaves → 16 IceBiome → 17 Grass → Jungle(12497) → 18 MudCaves →
  //   19 Desert → … → 32 Dungeon → 33 MCOpenings → 34 Beaches → 35 Gems。
  //   mcopenings/beaches 原紧跟 surfacecaves（注册序修正移到 Dungeon 后）。
  replay(); // ▶IceBiome cs:12343
  runIceBiomePass(st, rng, gs); out.set('icebiome', hashGrids(st));
  replay(); // ▶Grass cs:12454
  runGrassPass(st, rng, gs); out.set('grass', hashGrids(st));
  replay(); // ▶JunglePass cs:12497
  runJunglePass(st, rng, gs); out.set('jungle', hashGrids(st));
  replay(); // ▶MudCavesToJungleGrass cs:12499（零掷骰）
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  out.set('mudcaves', hashGrids(st));
  // ▶DesertBiome cs:12532 单 pass：头重播在 runDesertMoundOnly 内部（entrance/
  //   hive/done 是内部段，不中间重播）
  const desc = runDesertMoundOnly(st, rng, gs); out.set('desertmound', hashGrids(st));
  // Sub-C 入口 + Sub-B 蜂巢（DesertBiome.Place 顺序：入口先于 Hive）。
  // afterEntrance 钩子对齐 oracle 的 desertentrance 检查点位（入口后、Hive 前）
  runDesertEntrancesAndHive(st, rng, gs, desc, () => snap('desertentrance'));
  snap('deserthive');        // AddTileVariance 完
  snap('desertdone');        // CleanupArea 仅帧号——状态同 deserthive
  // #20-26（1456 注册序 12581/12800/12884/12976/13172/13192/13233）
  replay(); // ▶GlowingMushroomPatches cs:12581
  runMushroomPass(st, rng, gs); snap('mushroom');
  replay(); // ▶Marble cs:12800
  runMarblePass(st, rng, gs); snap('marble');
  replay(); // ▶Granite cs:12884
  runGranitePass(st, rng, gs); snap('granite');
  replay(); // ▶FloatingIslands cs:12976
  runFloatingIslandsPass(st, rng, gs); snap('islands');
  replay(); // ▶DirtToMud cs:13172
  runDirtToMudPass(st, rng, gs); snap('dirttomud');
  replay(); // ▶Silt cs:13192
  runSiltPass(st, rng, gs); snap('silt');
  replay(); // ▶OresAndShinies cs:13233
  runShiniesPass(st, rng, gs); snap('ores');
  // #27/28/30/31（1456 注册序 13659/13697/14613/14756）。
  replay(); // ▶Webs cs:13659
  runWebsPass(st, rng, gs); snap('webs');
  replay(); // ▶Underworld cs:13697（AddHellHouses cs:13893 是其尾段，不另重播）
  runUnderworldPass(st, rng, gs); snap('underworld');
  // #29 Corruption（cs:13919，oracle 已转录）
  replay(); // ▶CorruptionAndCrimson cs:13919
  runCorruptionPass(st, rng, gs);
  snap('corruption');
  replay(); // ▶Lakes cs:14613
  runLakesPass(st, rng, gs); snap('lakes');
  replay(); // ▶Slush cs:14756（零掷骰）
  runSlushPass(st, gs); snap('slush');   // #31 零掷骰（签名无 rng）
  // #32 Dungeon（1456 Legacy 路径全量转录）：snap 回调逐段落检查点（17 段内部不重播）
  replay(); // ▶Dungeon cs:14816
  runDungeonPass(st, rng, gs, world.chests, (name) => snap(name));
  replay(); // ▶MountainCaveOpenings cs:14932
  runMountainCavesPass(st, rng, gs); snap('mcopenings');
  replay(); // ▶BeachesAndOceanCleanup cs:14947
  runBeachesPass(st, rng, gs); snap('beaches');
  // ===== 第三轮 A（#35-44，1456 注册序）=====
  replay(); // ▶Gems cs:15109
  runGemsPass(st, rng, gs); snap('gems');
  replay(); // ▶GravitatingSandCleanup cs:15198（零掷骰——重播后 stream=新流 0 掷态）
  gravitatingSandPass({ store: st } as never); snap('gravitatingsand');
  replay(); // ▶OceanCaves cs:15228
  runOceanCavesPass(st, rng, gs); snap('oceancaves');
  replay(); // ▶Shimmer cs:15256（shell/pillars/open 是内部段，不中间重播）
  runShimmerPass(st, rng, gs, (nm) => snap(nm));   // shimmershell/pillars/open/shimmer 四段
  replay(); // ▶DirtWallCleanup cs:15310
  vanillaCleanup({ store: st, rng } as never); snap('dirtwallcleanup');
  replay(); // ▶Pyramids cs:15426
  runPyramidPass(st, rng, gs, world.chests); snap('pyramids');
  replay(); // ▶DirtRockWallRunner cs:15536
  runDirtRockWallRunnerPass(st, rng, gs); snap('dirtrockwallrunner');
  replay(); // ▶LivingTrees cs:15551
  runLivingTreesPass(st, rng, gs, world.chests); snap('livingtrees');
  replay(); // ▶LivingTreeWalls cs:15792（零掷骰）
  runLivingTreeWallsPass(st, gs); snap('livingtreewalls');
  replay(); // ▶DemonAndCrimsonAltars cs:15825
  runAltarsPass(st, rng, gs); snap('altars');
  replay(); // ▶SurfaceWaterInJungle cs:15887（零掷骰）
  runWetJunglePass(st, rng, gs); snap('surfacewaterinjungle');
  return { grids: out, walls: outWall };
}

// SW_FREEZE_CAVES=1 时本对账 describe 让位给 _freeze-caves.test.ts（避免导入副作用
// 把冻结跑挂——corruption 在冻结后持续 ✗ 是预期备案态）
if (!process.env.SW_FREEZE_CAVES)
describe('洞穴链逐 pass 对账（vs C# caves-oracle）', () => {
  const cases = [
    { file: 'caves-chain-9293480.json', seedText: '9293480', evil: 0 as const },
    { file: 'caves-chain-SandboxWorld.json', seedText: 'SandboxWorld', evil: 1 as const },
  ];
  for (const c of cases) {
    it(`种子 ${c.seedText}：每 pass type/flags/liquid 哈希全等`, () => {
      const golden = JSON.parse(
        readFileSync(fileURLToPath(new URL(`./golden/${c.file}`, import.meta.url)), 'utf8'),
      ) as { checkpoints: string[] };
      const gold = new Map<string, string>();
      const goldWall = new Map<string, string>();
      for (const line of golden.checkpoints) {
        const [name, typ, act, wal, liq] = line.split(/[| ]+/);
        gold.set(name, `${typ} ${act} ${liq}`); // type/flags/liquid（wall 见文件头注）
        goldWall.set(name, wal);                // wall 只对沙漠段裁决（见 hashWalls 注）
      }
      const res = chainCheckpoints(c.seedText, c.evil);
      const ours = res.grids;
      const names = ['terrain', 'dunes', 'oceansand', 'sandpatches', 'tunnels',
        'mountaincaves', 'dirtwallbg', 'rocksclay', 'smallholes', 'surfacecaves',
        'icebiome', 'grass', 'jungle', 'mudcaves', 'desertmound',
        'desertentrance', 'deserthive', 'desertdone',
        'mushroom', 'marble', 'granite', 'islands', 'dirttomud', 'silt', 'ores',
        'webs', 'underworld', 'corruption', 'lakes', 'slush',
        'dungeonL', 'dungeonE', 'dungeonPD', 'dungeonPi', 'dungeonS', 'dungeonD',
        'dungeonW', 'dungeonP', 'dungeonC', 'dungeonB', 'dungeonG', 'dungeonI',
        'dungeonT', 'dungeonF', 'dungeonPa', 'dungeonBa', 'dungeon',
        'mcopenings', 'beaches',
        'gems', 'gravitatingsand', 'oceancaves',
        'shimmershell', 'shimmerpillars', 'shimmeropen', 'shimmer',
        'dirtwallcleanup', 'pyramids', 'dirtrockwallrunner',
        'livingtrees', 'livingtreewalls', 'altars', 'surfacewaterinjungle'];
      let firstBad = '';
      for (const n of names) {
        if (ours.get(n) !== gold.get(n) && !firstBad) firstBad = n;
        console.log(`${n.padEnd(14)} ${ours.get(n)} vs ${gold.get(n)} ${ours.get(n) === gold.get(n) ? '✓' : '✗'}`);
      }
      // 沙漠三检查点 wall 逐哈希（187 沙漠墙/216 硬化沙壳是 Sub-B/C 核心输出；
      // 更早 pass 的 wall 有既知偏差不裁决，见 hashWalls 注）
      for (const n of ['desertentrance', 'deserthive', 'desertdone']) {
        const ok = res.walls.get(n) === goldWall.get(n);
        if (!ok && !firstBad) firstBad = `${n}:wall`;
        console.log(`${`${n}:wall`.padEnd(14)} ${res.walls.get(n)} vs ${goldWall.get(n)} ${ok ? '✓' : '✗'}`);
      }
      // 报告全量后断言（首个分歧之后的必然不同——流已分叉）
      expect(firstBad, '首个分歧 pass').toBe('');
    }, 300000);
  }
});
