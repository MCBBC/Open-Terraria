// 一次性诊断：各种子 Dunes 头入口类型掷 A/B（Dome/Tower/Legacy 判定）。
// A=掷①(Dome 候选) B=掷②(Tower 候选，B==0 → Tower 覆盖)；A==0&&B!=0 → Dome；余 Legacy。
import { describe, it } from 'vitest';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

describe('dungeon entrance type rolls', () => {
  it('prints A/B per seed', () => {
    for (const seedText of ['9293480', 'SandboxWorld', '4444', '6666']) {
      const { world, rng, gs, seed } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil: 0 });
      rng.reseed(seed);
      // DunesPass 头四掷序（theme/A/B/entSeed）——直读掷值
      const theme = rng.nextIntRange(0, 3);
      const A = rng.nextIntRange(0, 3);
      const B = rng.nextIntRange(0, 3);
      const entSeed = rng.vanilla.next();
      const type = B === 0 ? 'Tower' : A === 0 ? 'Dome' : 'Legacy';
      console.log(`seed=${seedText} int=${seed} theme=${theme} A=${A} B=${B} type=${type} entSeed=${entSeed}`);
      void world; void gs;
    }
  });
});
