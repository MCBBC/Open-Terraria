// 提取墙面物品映射：Item.cs SetDefaults1-5 的 `case N:` 块内 `createWall = M;`
// → src/data/vanilla-wallitems.json（itemId → createWall）
import { readFileSync, writeFileSync } from 'fs';

const itemSrc = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria/Item.cs', 'utf8');
const vanilla = JSON.parse(readFileSync('public/sprites/vanilla.json', 'utf8'));

const body = itemSrc.slice(itemSrc.indexOf('public void SetDefaults1'), itemSrc.indexOf('public void SetDefaults(int Type'));
const caseRe = /\t\tcase (\d+):\n/g;
const marks = [];
let m;
while ((m = caseRe.exec(body))) marks.push({ id: Number(m[1]), at: m.index });
const map = {};
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].at : marks[i].at + 4000;
  const seg = body.slice(marks[i].at, end);
  const cw = seg.match(/createWall = (\d+);/);
  if (cw) map[marks[i].id] = Number(cw[1]);
}
// 名字（vanilla.json items.key）→ slug
const slug = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
const out = {};
for (const [id, wall] of Object.entries(map)) {
  const name = vanilla.items[id]?.key ?? `Item${id}`;
  out[id] = { wall, key: `vi_${id}_${slug(name)}`, name };
}
writeFileSync('src/data/vanilla-wallitems.json', JSON.stringify(out));
console.log('wall items:', Object.keys(out).length, '| walls covered:', new Set(Object.values(out).map((v) => v.wall)).size);
