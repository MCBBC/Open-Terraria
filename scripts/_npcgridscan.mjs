// NPC 贴图布局扫描:找"多列横排/2D 网格"表(vnpc 纵切假设会炸的)
// 判据:PNG 宽 / NPC 碰撞盒宽 > 2.6,或 PNG 宽高比 > 1.2 且宽 > 80
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites');
const j = JSON.parse(readFileSync(join(root, 'vanilla-npcs.json'), 'utf8'));
const dir = join(root, 'vanilla');
const files = readdirSync(dir).filter((f) => /^NPC_\d+\.png$/.test(f));
const suspects = [];
for (const f of files) {
  const id = parseInt(f.slice(4, -4), 10);
  const b = readFileSync(join(dir, f));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const npc = j[String(id)];
  const nw = npc?.width ?? 0;
  const ratio = nw > 0 ? w / nw : 0;
  const wide = w > 80 && w / Math.max(1, h) > 1.2;
  if (ratio > 2.6 || wide) {
    suspects.push({ id, name: npc?.name ?? '?', png: `${w}x${h}`, npcWH: `${nw}x${npc?.height ?? 0}`, ratio: Number(ratio.toFixed(1)), frames: npc?.frames });
  }
}
console.log('嫌疑多列/网格表:', suspects.length, '/', files.length);
for (const s of suspects.sort((a, b) => b.ratio - a.ratio)) console.log(JSON.stringify(s));
