// ★692:真链熵地板测量——旧金标轮终档 vs 统一轮终档,abyss 区(x≥3860)逐格 diff。
// 若 ≈30k=我方重放残差 34,552≈熵地板(真输出=熵样,逐位不可追);
// 若 ≈4k=仍有实现差,岛带二分继续。
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

function tilesOf(path: string) {
  const w = parseWld(new Uint8Array(readFileSync(path)));
  return w as unknown as { tiles: { type: Uint16Array; active: Uint8Array }; };
}

const A = tilesOf('/Users/vinlic/Project/GLM/SandboxWorld/game/mods/calamity/golden-oracle/golden-calamity.wld');
const B = tilesOf('/tmp/tml-golden/probe-consolidated/golden-calamity.wld');
const W = 4200, H = 1200;
const ta = A.tiles.type, aa = A.tiles.active, tb = B.tiles.type, ab = B.tiles.active;
console.log(`A=${ta.length} B=${tb.length}`);

let diffAll = 0, diffAbyss = 0;
const byType = new Map<string, number>();
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y++) {
    const i = x * H + y;   // ★tiles 段列优先(WldParser decodeTiles)
    const da = aa[i] ? ta[i] : 0, db = ab[i] ? tb[i] : 0;
    if (da !== db) {
      diffAll++;
      if (x >= 3860) {
        diffAbyss++;
        const key = `${da}→${db}`;
        byType.set(key, (byType.get(key) ?? 0) + 1);
      }
    }
  }
}
console.log(`全图 type diff=${diffAll} (${((diffAll / (W * H)) * 100).toFixed(3)}%)`);
console.log(`abyss 区(x≥3860) diff=${diffAbyss}`);
console.log('TOP12 迁移对:', [...byType.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12).map(([k, c]) => `${k}:${c}`).join(' '));
process.exit(0);
