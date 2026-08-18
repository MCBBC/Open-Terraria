// ZZZ 探针 4：s111/m111 全管线扫统计（苔藓放置债 vs 击杀差定源）
import { it } from 'vitest';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { __zzzLastStats } from '../src/world/gen/vanilla/FinalCleanupPass';

for (const c of [{ size: 0 as const, seed: '111', name: 's111' }, { size: 1 as const, seed: '111', name: 'm111' }]) {
  it(`zzz stats ${c.name}`, async () => {
    const dims = SIZE_DIMS[c.size];
    await generateWorld({ size: c.size, width: dims.width, height: dims.height, seedText: c.seed, evil: 0 });
    const s = __zzzLastStats;
    console.log(`${c.name}: mossVisited=${s.mossVisited} roll184=${s.roll184} mossKilled=${s.mossKilled} rollsOther=${s.rollsOther}`);
  }, 480_000);
}
