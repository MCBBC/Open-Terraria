// XXX 批：FinalCleanup TileFrame 全图扫的掷数构成取证——
// 统计基线 wld 中 moss plants(184)/蘑菇(72)/裂砖(481-483)/药草(57) 计数。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW_XDBREP2;

(RUN ? it : it.skip)('finalcleanup sweep roll census', () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s111.wld')));
  const t = wld.tiles, n = t.active.length;
  const cnt = new Map<number, number>();
  let webWall62 = 0;
  for (let i = 0; i < n; i++) {
    if (t.active[i] !== 1) continue;
    const ty = t.type[i];
    cnt.set(ty, (cnt.get(ty) ?? 0) + 1);
    if (ty === 51 && t.wall[i] === 62) webWall62++;
  }
  const pick = (k: number) => cnt.get(k) ?? 0;
  console.log('moss plants(184):', pick(184));
  console.log('mushroom(72):', pick(72));
  console.log('herbs(57):', pick(57));
  console.log('cracked 481/482/483:', pick(481), pick(482), pick(483));
  console.log('webs(51) total:', pick(51), ' web+wall62:', webWall62);
  console.log('cactus(80):', pick(80));
});
