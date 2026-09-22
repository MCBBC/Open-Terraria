import { it, expect } from 'vitest';
import { ITEM_DEFS } from '../src/data/items';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';

it('武器归族普查', () => {
  const buckets: Record<string, number> = {};
  const shotByAi: Record<number, string[]> = {};
  for (const def of ITEM_DEFS) {
    if (!def) continue;   // ★方案 A:守洞
    const cw = combatWeapon(def);
    if (!cw) continue;
    buckets[cw.kind] = (buckets[cw.kind] ?? 0) + 1;
    if (cw.kind === 'shot' && cw.shoot) {
      const ai = projectileData(cw.shoot)?.aiStyle ?? -1;
      (shotByAi[ai] ??= []).push(`${def.key}:${cw.shoot}`);
    }
  }
  console.log('归族分布:', JSON.stringify(buckets));
  const aiList = Object.entries(shotByAi).map(([ai, v]) => `${ai}(${v.length})`).join(' ');
  console.log('shot 桶按投射物 aiStyle:', aiList);
  for (const [ai, v] of Object.entries(shotByAi)) console.log(`  aiStyle ${ai}:`, v.slice(0, 12).join(' '));
  expect(true).toBe(true);
});
