import { PROJECT_ROOT, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(join(PROJECT_ROOT, 'Terraria-Map-Editor/src/TEdit.Terraria/Data/tiles.json'), 'utf8'));
for (const id of [229, 697]) console.log('tile', id, '=', t.find(x => x.id === id)?.name);
const v = JSON.parse(readFileSync('public/sprites/vanilla.json', 'utf8'));
console.log('item 154:', v.items['154']?.name, 'createTile=', v.items['154']?.createTile);
