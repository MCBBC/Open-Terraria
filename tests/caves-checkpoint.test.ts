// 洞穴链逐 pass 检查点对账（种子等价 L1 裁决工具）：
// JS 侧按 oracle 同序直调各 run*Pass，每 pass 后对 type(vanilla 映射)/flags/liquid
// 做 FNV-1a，与 tools/golden/caves-oracle.cs（C# 复刻+反射真 UnifiedRandom）的
// 金标逐项比对。wall 暂不比（我们 Terrain 自加渲染墙，原版墙由 DirtWallBg 等后置
// pass 铺——wall 等价是独立对账项）。
// 金标再生成：dotnet run tools/golden/caves-oracle.cs <seedInt> <evil> <out.json>
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
import { runDesertMoundOnly } from '../src/world/gen/vanilla/DesertPass';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE_DEFS } from '../src/data/tiles';
import { fnv1a } from './pass-hash.test';

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

function hashGrids(st: { type: Uint16Array; flags: Uint8Array; liquid: Uint8Array; w: number; h: number }) {
  const n = st.w * st.h;
  const mapped = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = st.flags[i] ? V_ID[st.type[i]] : 0;
    mapped[i] = v < 0 ? 0x7fff : v;
  }
  return `${fnv1a(mapped)} ${fnv1a(st.flags)} ${fnv1a(st.liquid)}`;
}

function chainCheckpoints(seedText: string, evil: 0 | 1) {
  const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil });
  const st = world.store;
  const out = new Map<string, string>();
  out.set('terrain', hashGrids(st));
  runDunesPass(st, rng, gs); out.set('dunes', hashGrids(st));
  runOceanSandPass(st, rng, gs); out.set('oceansand', hashGrids(st));
  runSandPatchesPass(st, rng, gs); out.set('sandpatches', hashGrids(st));
  runTunnelsPass(st, rng, gs); out.set('tunnels', hashGrids(st));
  runMountCavesPass(st, rng, gs); out.set('mountaincaves', hashGrids(st));
  runDirtWallBgPass(st, rng, gs); out.set('dirtwallbg', hashGrids(st));
  runRocksAndClayPass(st, rng, gs); out.set('rocksclay', hashGrids(st));
  runSmallHolesPass(st, rng, gs); out.set('smallholes', hashGrids(st));
  runCavesPass(st, rng, gs); out.set('surfacecaves', hashGrids(st));
  runMountainCavesPass(st, rng, gs); out.set('mcopenings', hashGrids(st));
  runBeachesPass(st, rng, gs); out.set('beaches', hashGrids(st));
  runIceBiomePass(st, rng, gs); out.set('icebiome', hashGrids(st));
  runGrassPass(st, rng, gs); out.set('grass', hashGrids(st));
  runJunglePass(st, rng, gs); out.set('jungle', hashGrids(st));
  runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  out.set('mudcaves', hashGrids(st));
  runDesertMoundOnly(st, rng, gs); out.set('desertmound', hashGrids(st));
  return out;
}

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
      for (const line of golden.checkpoints) {
        const [name, typ, act, _wal, liq] = line.split(/[| ]+/);
        gold.set(name, `${typ} ${act} ${liq}`); // 只比 type/flags/liquid（wall 见文件头注）
      }
      const ours = chainCheckpoints(c.seedText, c.evil);
      const names = ['terrain', 'dunes', 'oceansand', 'sandpatches', 'tunnels',
        'mountaincaves', 'dirtwallbg', 'rocksclay', 'smallholes', 'surfacecaves',
        'mcopenings', 'beaches', 'icebiome', 'grass', 'jungle', 'mudcaves', 'desertmound'];
      let firstBad = '';
      for (const n of names) {
        if (ours.get(n) !== gold.get(n) && !firstBad) firstBad = n;
        console.log(`${n.padEnd(14)} ${ours.get(n)} vs ${gold.get(n)} ${ours.get(n) === gold.get(n) ? '✓' : '✗'}`);
      }
      // 报告全量后断言（首个分歧之后的必然不同——流已分叉）
      expect(firstBad, '首个分歧 pass').toBe('');
    }, 300000);
  }
});
