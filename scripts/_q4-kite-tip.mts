import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items.ts';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated.ts';

const vids = [4367, 4368, 4369, 4370, 4371, 4379, 4610, 4611, 4612, 4613, 4648, 4649, 4650, 4651, 4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684];
for (const vid of vids) {
  const nameKey = ITEM_NAME_BY_ID[vid];
  const vk = VANILLA_ITEM_KEY_BY_ID[vid];
  const def = vk ? ITEM_DEFS[ITEM_BY_KEY[vk]] : undefined;
  console.log(vid, 'nameKey=' + nameKey, 'defKey=' + (def?.key ?? 'NONE'), 'def.vid=' + (def?.vid ?? '?'));
}
