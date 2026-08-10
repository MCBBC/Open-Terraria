import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('public/sprites/vanilla.json', 'utf8'));
for (const id of [282, 286, 3002, 4761]) {
  console.log('item', id, 'createTile=', d.items[String(id)]?.createTile, 'name=', d.items[String(id)]?.name);
}
