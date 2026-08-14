// 一次性诊断③：包装 rng 抓 runDungeonPass 全部掷骰调用序列（定位 dgEarly 分歧的
// 掷骰流/bounds 漂移），与 /tmp oracle 日志逐条比对。用后即删。
import { describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
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
import { TILE_BY_KEY } from '../src/data/tiles';
import type { RNG } from '../src/core/rng';

describe('dungeon 掷骰流追踪', () => {
  it('记录 runDungeonPass 全部 rng 调用', () => {
    const { world, rng, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const st = world.store;
    runDunesPass(st, rng, gs);
    runOceanSandPass(st, rng, gs);
    runSandPatchesPass(st, rng, gs);
    runTunnelsPass(st, rng, gs);
    runMountCavesPass(st, rng, gs);
    runDirtWallBgPass(st, rng, gs);
    runRocksAndClayPass(st, rng, gs);
    runSmallHolesPass(st, rng, gs);
    runCavesPass(st, rng, gs);
    runIceBiomePass(st, rng, gs);
    runGrassPass(st, rng, gs);
    runJunglePass(st, rng, gs);
    runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
    const desc = runDesertMoundOnly(st, rng, gs);
    runDesertEntrancesAndHive(st, rng, gs, desc, () => {});
    runMushroomPass(st, rng, gs);
    runMarblePass(st, rng, gs);
    runGranitePass(st, rng, gs);
    runFloatingIslandsPass(st, rng, gs);
    runDirtToMudPass(st, rng, gs);
    runSiltPass(st, rng, gs);
    runShiniesPass(st, rng, gs);
    runWebsPass(st, rng, gs);
    runUnderworldPass(st, rng, gs);
    runCorruptionPass(st, rng, gs);
    runLakesPass(st, rng, gs);
    runSlushPass(st, gs);
    const lines: string[] = [];
    const wrapped: RNG = new Proxy(rng, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, target);
        if (typeof v === 'function' && (prop === 'int' || prop === 'nextInt' || prop === 'next')) {
          return (...args: number[]) => {
            const r = v.apply(target, args);
            const interesting = (prop === 'int' && args[0] === -10) || (prop === 'nextInt' && (args[0] === 3 || args[0] === 4)) || (prop === 'int' && args[1] === 51);
            if (interesting && lines.length >= 210 && lines.length <= 250) {
              const st2 = (new Error().stack ?? '').split('\n').slice(2, 6).join(' | ');
              lines.push(`${prop}(${args.join(',')})=${r} @${st2}`);
            } else {
              lines.push(`${prop}(${args.join(',')})=${r}`);
            }
            return r;
          };
        }
        if (prop === 'vanilla') {
          return new Proxy(target.vanilla, {
            get(t2, p2) {
              const v2 = Reflect.get(t2, p2, t2);
              if (typeof v2 === 'function' && p2 === 'next') {
                return () => { const r2 = v2.call(t2); lines.push(`rawNext=${r2}`); return r2; };
              }
              return typeof v2 === 'function' ? v2.bind(t2) : v2;
            },
          });
        }
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as unknown as RNG;
    runDungeonPass(st, wrapped, gs, world.chests, () => {});
    writeFileSync('/tmp/js-dg-draws.txt', lines.join('\n') + '\n');
    console.log(`[trace] dungeon 掷骰 ${lines.length} 次已写 /tmp/js-dg-draws.txt`);
  }, 300000);
});
