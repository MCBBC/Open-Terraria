import { readFileSync } from 'node:fs';
const v = JSON.parse(readFileSync('public/sprites/vanilla.json', 'utf8'));
// 蜂蜜块 tile 229 放置物 item；蛛网掉落 item（vanilla 51 KillTile drop = 154? 搜 name）
for (const [id, it] of Object.entries(v.items)) {
  if (it.name === 'Cobweb') console.log('item', id, '= Cobweb, createTile=', it.createTile);
}
