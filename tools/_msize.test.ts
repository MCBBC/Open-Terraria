// 一次性（2026-08-16）：中/大世界原版真值采集与解析验证。
// 数据源：TerrariaServer 1.4.5.6 无头生成（-autocreate 2/3）→ /tmp/vserver/*.wld。
// 断言尺寸 + 打印头部锚点（groundLevel/rockLevel/worldId/moonType/dungeonX 等），
// 供后续 oracle 中/大尺寸对账使用（原始锚点抄录至 /tmp/msize-report.txt）。
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const CASES = [
  { file: '/tmp/vserver/m2222.wld', seed: '2222', w: 6400, h: 1800, tag: 'medium' },
  { file: '/tmp/vserver/m9293480.wld', seed: '9293480', w: 6400, h: 1800, tag: 'medium' },
  { file: '/tmp/vserver/l2222.wld', seed: '2222', w: 8400, h: 2400, tag: 'large' },
];

it('msize: parse vanilla medium/large worlds', () => {
  for (const c of CASES) {
    const world = parseWld(new Uint8Array(readFileSync(c.file)));
    // 尺寸硬断言：中=6400×1800、大=8400×2400
    expect(world.tilesWide, `${c.tag}/${c.seed} tilesWide`).toBe(c.w);
    expect(world.tilesHigh, `${c.tag}/${c.seed} tilesHigh`).toBe(c.h);
    expect(world.seed, `${c.tag}/${c.seed} seed`).toBe(c.seed);
    // header 锚点
    console.log(JSON.stringify({
      tag: c.tag, file: c.file,
      version: world.version, title: world.title, seed: world.seed,
      tilesWide: world.tilesWide, tilesHigh: world.tilesHigh,
      groundLevel: world.groundLevel, rockLevel: world.rockLevel,
      worldId: world.worldId, moonType: world.moonType, moonPhase: world.moonPhase,
      dungeonX: world.dungeonX, dungeonY: world.dungeonY,
      spawnX: world.spawnX, spawnY: world.spawnY,
      isCrimson: world.isCrimson, gameMode: world.gameMode, hardMode: world.hardMode,
      treeX: world.treeX,
    }));
    // 解析完整性粗检：tiles 数组长度 = w*h 且地表以下确有实心块（读序未跑偏）
    expect(world.tiles.active.length).toBe(c.w * c.h);
    expect(world.tiles.active[(world.groundLevel + 200) * c.w + (c.w >> 1)]).toBe(1);
  }
}, 240000);
