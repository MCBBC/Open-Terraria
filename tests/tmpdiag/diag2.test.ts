import { it, expect } from 'vitest';
import { combatWeapon } from '../../src/data/vanillaItemCombat';
it('zenith routing', () => {
  console.log('4956', JSON.stringify(combatWeapon({ key: 'vi_4956_zenith' })));
  console.log('5669', JSON.stringify(combatWeapon({ key: 'vi_5669_true_copper_shortsword' })));
  expect(combatWeapon({ key: 'vi_4956_zenith' })).toMatchObject({ kind: 'melee', useTime: 10, useAnimation: 30, shoot: 933 });
  expect(combatWeapon({ key: 'vi_5669_true_copper_shortsword' })).toMatchObject({ kind: 'melee', useTime: 10, shoot: 1100 });
});
