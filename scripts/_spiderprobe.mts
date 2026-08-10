// 蜘蛛巢生成验证:玩家在巢内/巢外近旁两种场景,驱 VanillaSpawner 统计 163/164 占比
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner.ts';
import { RNG } from '../src/core/rng.ts';

const st = new TileStore(400, 400);
const world = new World(400, 400, 1, 't');
world.store = st;
world.groundLevel = 80;
world.rockLevel = 150;
// 全图实心(天然石墙=2) + 在 (185,240) 造 30×20 蜘蛛巢腔。
// ★ 真实世界语义:巢腔空气格墙=62;腔外实心背后保持天然墙 2 不覆盖
// (SpiderNestPass 只在 wall===0 时才补 62)——所以"落脚地板格墙=62"大多不成立,
// 原版真正的触发器是 spawnSpider 旗标(邻域扫描/玩家所站格)
for (let x = 0; x < 400; x++) for (let y = 0; y < 400; y++) { st.setTileSilent(x, y, 1); st.wall[st.idx(x, y)] = 2; }
const NX = 185, NY = 168, NW = 30, NH = 20;  // 合法带 150..200
for (let x = NX; x < NX + NW; x++) {
  for (let y = NY; y < NY + NH; y++) {
    st.setTileSilent(x, y, 0);
    st.wall[st.idx(x, y)] = 62;
  }
}
// 巢旁隧道(玩家场景2用):天然墙,与巢无关;巢顶 280 距隧道地板 273 约 7 格
for (let x = 150; x <= 260; x++) for (let y = 155; y <= 157; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 2; }

const sp = new VanillaSpawner(world);
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };

const run = (px: number, py: number, times: number, label: string) => {
  const counts: Record<string, number> = {};
  let nulls = 0;
  for (let i = 0; i < times; i++) {
    const e = sp.spawn(px * 16 + 8, py * 16 + 8, new RNG(i * 7919 + 13), 40, 25);
    if (!e) { nulls++; continue; }
    const k = String(e.vanillaId ?? e.key);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const spiders = (counts['163'] ?? 0) + (counts['164'] ?? 0);
  const total = times - nulls;
  console.log(`== ${label} ==`, JSON.stringify(counts), `null:${nulls}/${times}`);
  return { counts, spiders, total, nulls };
};

// 1) 玩家站巢内地板上
const inNest = run(200, NY + NH - 1, 4000, '玩家在巢内');
check('巢内有蜘蛛生成', inNest.spiders > 0, inNest.spiders);
check('蜘蛛为巢内主力(>60%)', inNest.total > 0 && inNest.spiders / inNest.total > 0.6, (inNest.spiders / Math.max(1, inNest.total)).toFixed(2));
// 2) 玩家在巢旁隧道地板上(巢顶距玩家 ~5 格,靠邻域扫描旗标触发)
const nearNest = run(200, 158, 4000, '玩家巢外近旁');
check('巢外近旁也有蜘蛛', nearNest.spiders > 0, nearNest.spiders);
// 3) 玩家远离巢(地表)
world.clock.timeOfDay = 0.5;
const far = run(60, 90, 2000, '远离巢');
check('远离巢基本无蜘蛛', (far.counts['163'] ?? 0) + (far.counts['164'] ?? 0) === 0, far.counts);

console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
