// 定位 Main.cs 横向 Frame() 调用的归属 NPC case(向上找最近的 case 标签)
import { readFileSync } from 'fs';

const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria/Main.cs', 'utf8');
const lines = src.split('\n');
const hits = [23056, 23071, 23141, 23306, 23353, 23384, 23418, 24487, 26215, 26839];
for (const ln of hits) {
  let owner = '?';
  for (let i = ln - 1; i > ln - 200 && i > 0; i--) {
    const m = lines[i - 1].match(/^\s*case (\d+):/);
    if (m) { owner = m[1]; break; }
  }
  const snippet = lines[ln - 1].trim().slice(0, 110);
  console.log(`:${ln} → NPC ${owner}  |  ${snippet}`);
}
