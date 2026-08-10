// 邻近探测旗标验证。深度带约束(与原版一致):
//  - 沙漠旗标带 y∈(200, rockLevel);大理石/花岗岩怪在洞穴池(y > rockLayer 且非地狱)。
//  - 生成点须在屏幕外(玩家 ±41 格横向 ±26 格纵向)——沙漠腔伸进屏幕外带。
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner.ts';
import { RNG } from '../src/core/rng.ts';
import { TILE_BY_KEY } from '../src/data/tiles.ts';

const MARBLE = TILE_BY_KEY['v_367_marble_block'] ?? -1;
const GRANITE = TILE_BY_KEY['v_368_granite_block'] ?? -1;
if (MARBLE < 0 || GRANITE < 0) { console.log('缺大理石/花岗岩 tile 注册'); process.exit(1); }

const st = new TileStore(400, 600);
const world = new World(400, 600, 1, 't');
world.store = st;
world.groundLevel = 80;
world.rockLevel = 300; // 沙漠带 (200,300);大理石洞穴池带 (300, 410)
for (let x = 0; x < 400; x++) for (let y = 0; y < 600; y++) { st.setTileSilent(x, y, 1); st.wall[st.idx(x, y)] = 2; }
// 隧道1(沙漠层):行 220..222 × 列 150..260
for (let x = 150; x <= 260; x++) for (let y = 220; y <= 222; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 0; }
// 隧道2(洞穴池层):行 320..322 × 列 150..260
for (let x = 150; x <= 260; x++) for (let y = 320; y <= 322; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 0; }
// 沙漠腔(墙 216):列 238..290 × 行 210..250(伸进玩家 200 的屏幕外带 [241,256])
for (let x = 238; x <= 290; x++) for (let y = 210; y <= 250; y++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 216; }
// 大理石团:列 60..100 × 行 300..318(洞穴池层,玩家扫描可及)
for (let x = 60; x <= 100; x++) for (let y = 300; y <= 318; y++) st.setTileSilent(x, y, MARBLE);
// 花岗岩团:列 270..310 × 行 300..318
for (let x = 270; x <= 310; x++) for (let y = 300; y <= 318; y++) st.setTileSilent(x, y, GRANITE);

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

// A:玩家 (200,223) 沙漠层,沙漠腔在右侧屏幕外
const desert = run(200, 223, 4000, '地下沙漠旁');
const desertMobs = (desert['580'] ?? 0) + (desert['581'] ?? 0) + (desert['69'] ?? 0) + (desert['537'] ?? 0);
check('沙漠旁出沙漠怪(580/581/69/537)', desertMobs > 0, desertMobs);

// B:玩家 (140,323) 洞穴池层,大理石团在左 ~40 格
const marble = run(140, 323, 4000, '大理石团旁');
check('大理石旁出 481/480', (marble['481'] ?? 0) + (marble['480'] ?? 0) > 0, marble['481'] ?? 0);

// C:玩家 (250,323) 洞穴池层,花岗岩团在右 ~20 格
const granite = run(250, 323, 4000, '花岗岩团旁');
check('花岗岩旁出 482/483', (granite['482'] ?? 0) + (granite['483'] ?? 0) > 0, granite['482'] ?? 0);

// D:对照——玩家 (150,223) 沙漠层最左,距沙漠腔/两石团都 >80 格,全零(旗标每尝试复位)
const ctrl = run(150, 223, 2000, '远离群系对照');
const exotic = ['481', '482', '480', '483', '580', '581', '69', '537'].reduce((s, k) => s + (ctrl[k] ?? 0), 0);
check('远离群系全零(旗标无泄漏)', exotic === 0, exotic);

console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
