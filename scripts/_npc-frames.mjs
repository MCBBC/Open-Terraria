import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const data = JSON.parse(readFileSync('public/sprites/vanilla-npcs.json', 'utf8'));
for (const id of [3, 17, 18, 22, 37]) {
  const meta = data[id];
  const info = execFileSync('file', [`/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`], { encoding: 'utf8' });
  const h = Number(info.match(/(\d+) x (\d+)/)?.[2] ?? (info.match(/PNG image data, (\d+) x (\d+)/)?.[2] ?? '?'));
  const w = Number(info.match(/PNG image data, (\d+) x/)?.[1] ?? '?');
  console.log(id, 'meta.frames=' + meta.frames, 'png=' + w + 'x' + h, '→ 实际帧数(56px)=', typeof h === 'number' ? h / 56 : '?');
}
