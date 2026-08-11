// 金标 .wld 头部信息核对（run-diag 托管）：
// 维度/seed 文本/邪恶类型/模式 + translateSeed 对照。
import { readFileSync } from 'node:fs';
import { parseWld } from '../../src/wld/WldParser.ts';
import { translateSeed } from '../../src/core/rng.ts';

const files = ['9293480世界', '12345世界', '20260811世界', '2147483647世界', 'SandboxWorld世界'];
for (const f of files) {
  const buf = readFileSync(`tests/golden/wld/${f}.wld`);
  const w = parseWld(new Uint8Array(buf));
  const meta = {
    file: f,
    version: w.version, w: w.tilesWide, h: w.tilesHigh,
    seedText: w.seed,
    seedInt: translateSeed(w.seed),
    isCrimson: w.isCrimson,
    gameMode: w.gameMode,
    spawn: [w.spawnX, w.spawnY], dungeon: [w.dungeonX, w.dungeonY],
    groundLevel: w.groundLevel, rockLevel: w.rockLevel,
    treeX: w.treeX, treeStyle: w.treeStyle,
  };
  console.log(JSON.stringify(meta));
}
