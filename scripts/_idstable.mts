// 存档 v3 稳定 id 验证:恒等/roundtrip/值域/漂移免疫
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { serializeSave } from '../src/save/serialize.ts';
import type { SaveMeta, SaveStoreView } from '../src/save/serialize.ts';
import { loadSaveData } from '../src/save/SaveFile.ts';
import { TILE_DEFS, TILE_BY_KEY, TILE_INTERNAL_OF_STABLE } from '../src/data/tiles.ts';
import { ITEM_DEFS } from '../src/data/items.ts';

let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };

const st = new TileStore(120, 90);
const world = new World(120, 90, 3, 'v3probe');
world.store = st;
// 铺多种 tile(含私有段 empty 旁路/自造/原版 sheet)
for (let x = 0; x < 120; x++) for (let y = 60; y < 90; y++) st.setTileSilent(x, y, 1);
st.setTileSilent(10, 50, TILE_BY_KEY['tree'], 22, 198);
st.setTileSilent(12, 50, TILE_BY_KEY['v_5_trees'], 0, 0);
st.setTileSilent(14, 50, TILE_BY_KEY['v_530_oasis_plants'], 0, 0);
st.setTileSilent(16, 50, TILE_BY_KEY['table'], 0, 0);
st.setTileSilent(18, 50, TILE_BY_KEY['dirt'], 0, 0);
st.setLiquid(20, 50, 255, 1);
world.chests = [{ x: 5, y: 5, items: [{ id: TILE_BY_KEY['torch'] >= 0 ? 0 : 0, stack: 1 }, null] }];
world.chests = []; // 物品 id 用真实 item id 单独验
const view: SaveStoreView = { type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY, wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire };
const meta: SaveMeta = {
  name: 'v3probe', seed: 3, w: 120, h: 90, spawnX: 10, spawnY: 10,
  groundLevel: 30, rockLevel: 50, timeOfDay: 0.3, dayCount: 1,
  chests: [], flags: { hardMode: false },
};
const player = { hp: 100, x: 1, y: 1, inventory: [{ id: 5, stack: 3 } as { id: number; stack: number } | null, null], selected: 0, baseMaxHp: 100, baseMaxMana: 20, mana: 20 };

const json = serializeSave(view, meta, player, 777);
const data = JSON.parse(json);

// ① version/idScheme
check('version=3 + idScheme=sheet', data.version === 3 && data.idScheme === 'sheet');

// ② 值域:解码 tiles RLE,全部 type ∈ [0,752]∪[1000,1028]
{
  const buf = Buffer.from(data.tiles, 'base64');
  const dec = (p: { i: number }) => { let v = 0, sh = 0, b: number; do { b = buf[p.i++]; v += (b & 0x7f) * 2 ** sh; sh += 7; } while (b & 0x80); return v; };
  let rangeOk = true, air = 0;
  const p = { i: 0 };
  while (p.i < buf.length) {
    const run = dec(p) + 1, t = dec(p);
    if (t !== 0 && !(t <= 752 || (t >= 1000 && t <= 1028))) { rangeOk = false; break; }
    if (t !== 0) dec(p), dec(p); // frameX/Y
    if (t === 0) air += run;
  }
  check('tiles RLE 值域全部合法', rangeOk);
  check('air 格保留 0', air > 5000, air);
}
// 关键 tile 稳定 id 抽查:tree=1026, v_5_trees=5, v_530=530, dirt=1028, table=1002
{
  const buf = Buffer.from(data.tiles, 'base64');
  const dec = (p: { i: number }) => { let v = 0, sh = 0, b: number; do { b = buf[p.i++]; v += (b & 0x7f) * 2 ** sh; sh += 7; } while (b & 0x80); return v; };
  const at = new Map<number, number>(); // idx→stable
  const p = { i: 0 }; let idx = 0;
  while (p.i < buf.length) {
    const run = dec(p) + 1, t = dec(p);
    const fx = t !== 0 ? dec(p) : 0, fy = t !== 0 ? dec(p) : 0;
    for (let k = 0; k < run; k++, idx++) at.set(idx, t * 100000 + fx);
  }
  const g = (x: number, y: number) => at.get(y * 120 + x) ?? -1;
  check('tree→1026', Math.floor(g(10, 50) / 100000) === 1026, g(10, 50));
  check('v_5_trees→5', Math.floor(g(12, 50) / 100000) === 5, g(12, 50));
  check('v_530→530', Math.floor(g(14, 50) / 100000) === 530, g(14, 50));
  check('table→1002', Math.floor(g(16, 50) / 100000) === 1002, g(16, 50));
  check('dirt→1028', Math.floor(g(18, 50) / 100000) === 1028, g(18, 50));
}

// ③ roundtrip:load 回来 TileStore 逐元素相等
const back = loadSaveData(JSON.parse(json));
let same = true;
for (let i = 0; i < st.type.length; i++) {
  if (back.world.store.type[i] !== st.type[i] || back.world.store.frameX[i] !== st.frameX[i] || back.world.store.frameY[i] !== st.frameY[i]) { same = false; break; }
}
check('v3 roundtrip TileStore 逐元素相等', same);
check('roundtrip 物品 id 还原(internal 5)', back.player.inventory[0]?.id === 5, back.player.inventory[0]?.id);

// ④ 反查一致性(无洞)
// 反查一致性:每个 def 的实际稳定 id 都能反查回某个 def(自身或同 vid 归一目标)
let ident = true;
for (let i = 1; i < TILE_DEFS.length; i++) {
  const s = (await import('../src/data/tiles.ts')).TILE_STABLE_OF_INTERNAL[i];
  if (s !== 0 && TILE_INTERNAL_OF_STABLE[s] === 0) { ident = false; break; }
}
check('全部稳定 id 可反查(无洞)', ident);

console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
