// BJ365: 扫描 wld 中 tile 752（巨型龙蛋/啮龙蛋）锚格坐标 + 深度/周边上下文
import { readFileSync } from 'node:fs';
// @ts-ignore
import { parseWld } from '../src/wld/WldParser.ts';

const PATH = '/Users/vinlic/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-09/天真的钴最高点(3).wld';

const buf = readFileSync(PATH);
const w = parseWld(new Uint8Array(buf));
const { active, type, frameX, frameY, wall, liquid, liquidType } = w.tiles;
const W = w.tilesWide, H = w.tilesHigh;
console.log(JSON.stringify({
  version: w.version, title: w.title, seed: w.seed,
  w: W, h: H, gameMode: w.gameMode, isCrimson: w.isCrimson, hardMode: w.hardMode,
  spawn: [w.spawnX, w.spawnY], groundLevel: w.groundLevel, rockLevel: w.rockLevel,
}));

const anchors = [];
const frameDomains = new Map();
let total = 0;
for (let i = 0, n = W * H; i < n; i++) {
  if (active[i] && type[i] === 752) {
    total++;
    const key = frameX[i] + ',' + frameY[i];
    frameDomains.set(key, (frameDomains.get(key) || 0) + 1);
    if (frameX[i] === 0 && frameY[i] === 0) anchors.push([i % W, Math.floor(i / W)]);
  }
}
console.log('total752=' + total, 'anchors=' + anchors.length);
console.log('frameDomains=' + JSON.stringify([...frameDomains.entries()].sort((a, b) => b[1] - a[1])));

// 逐锚格:验证 2×2 四格帧域 + 周边液体/墙 + 深度带
const layerOf = (y) => y < w.groundLevel ? 'surface' : y < w.rockLevel ? 'underground' : y < H - 200 ? 'cavern' : 'underworld';
const detail = anchors.map(([x, y]) => {
  const cells = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const i = (y + dy) * W + (x + dx);
    cells.push([x + dx, y + dy, active[i] ? type[i] : -1, frameX[i], frameY[i]]);
  }
  // 周边 5×5 液体统计 + 邻墙类型
  let liqWater = 0, liqLava = 0;
  const walls = new Map();
  for (let dy = -3; dy <= 4; dy++) for (let dx = -3; dx <= 4; dx++) {
    const i = (y + dy) * W + (x + dx);
    if (liquid[i] > 0) { if (liquidType[i] === 2) liqLava++; else liqWater++; }
    if (wall[i]) walls.set(wall[i], (walls.get(wall[i]) || 0) + 1);
  }
  return {
    anchor: [x, y], px: [x * 16, y * 16], layer: layerOf(y),
    cells, liqWater, liqLava, topWalls: [...walls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
  };
});
console.log('DETAIL=' + JSON.stringify(detail));
