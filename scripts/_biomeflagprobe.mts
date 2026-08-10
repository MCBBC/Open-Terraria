// 邻近探测旗标验证:地下沙漠墙(216/217/187)/大理石 367/花岗岩 368 与蜘蛛巢同类的
// "落点邻域扫描+玩家格"双路触发——玩家在生物群系附近时对应怪应占生成主力。
// 世界几何:rockLevel=300,沙漠旗标合法带 = (200, rockLevel);隧道行 220..222。
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner.ts';
import { RNG } from '../src/core/rng.ts';
import { TILE_BY_KEY } from '../src/data/tiles.ts';

const MARBLE = TILE_BY_KEY['v_367_marble_block'] ?? -1;
const GRANITE = TILE_BY_KEY['v_368_granite_block'] ?? -1;
if (MARBLE < 0 || GRANITE < 0) { console.log('缺大理石/花岗岩 tile 注册', MARBLE, GRANITE); process.exit(1); }

const st = new TileStore(400, 400);
const world = new World(400, 400, 1, 't');
world.store = st;
world.groundLevel = 80;
world.rockLevel = 300; // 沙漠旗标合法带 = y∈(200, 300)
for (let x = 0; x < 400; x++) for (let y = 0; y < 400; y++) { st.setTileSilent(x, y, 1); st.wall[st.idx(x, y)] = 2; }
// 玩家隧道(墙 0,非沙漠):行 220..222 × 列 150..260
for (let x = 150; x <= 260; x++) for (let y = 220; y <= 222; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 0; }
// 沙漠腔(墙 216):列 190..230 × 行 226..246(隧道地板下方 4 格)
for (let x = 190; x < 230; x++) for (let y = 226; y < 246; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 216; }
// 大理石团:列 60..110 × 行 190..218(隧道旁,交界 x=150)
for (let x = 60; x < 110; x++) for (let y = 190; y < 218; y++) st.setTileSilent(x, y, MARBLE);
// 花岗岩团:列 300..350 × 行 190..218(隧道旁,交界 x=260)
for (let x = 300; x < 350; x++) for (let y = 190; y < 218; y++) st.setTileSilent(x, y, GRANITE);

const sp = new VanillaSpawner(world);
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };
const run = (px: number, py: number, times: number, label: string) => {
  const counts: Record<string, number> = {};
  for (let i = 0; i < times; i++) {
    const e = sp.spawn(px * 16 + 8, py * 16 + 8, new RNG(i * 7919 + 101), 40, 25);
    if (!e) continue;
    const k = String(e.vanillaId ?? e.key);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.log(`== ${label} ==`, JSON.stringify(counts));
  return counts;
};

// A:玩家在沙漠腔正上方隧道
const desert = run(200, 223, 4000, '地下沙漠上方');
const desertMobs = (desert['580'] ?? 0) + (desert['581'] ?? 0) + (desert['69'] ?? 0) + (desert['537'] ?? 0);
check('沙漠腔附近出沙漠怪(580/581/69/537)', desertMobs > 0, desertMobs);

// B:玩家隧道左段,距大理石团 ~40 格
const marble = run(160, 223, 4000, '大理石团旁');
check('大理石旁出 481/480', (marble['481'] ?? 0) + (marble['480'] ?? 0) > 0, marble['481'] ?? 0);

// C:玩家隧道右段,距花岗岩团 ~40 格
const granite = run(250, 223, 4000, '花岗岩团旁');
check('花岗岩旁出 482/483', (granite['482'] ?? 0) + (granite['483'] ?? 0) > 0, granite['482'] ?? 0);

// D:对照——中段距两石团 >45 格,不出石族怪(旗标已每尝试复位,无泄漏)
const mid = run(205, 223, 2000, '隧道中段');
const exotic = (mid['481'] ?? 0) + (mid['482'] ?? 0) + (mid['480'] ?? 0) + (mid['483'] ?? 0);
check('中段不出石族怪(旗标无泄漏,=0)', exotic === 0, exotic);

console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
